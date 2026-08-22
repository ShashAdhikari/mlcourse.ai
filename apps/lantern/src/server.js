// Lantern — HTTP surface.
//
// Three kinds of route, with three different trust models:
//
//   /a/*       token-authenticated actions. The token IS the authority, so
//              there is no session. GET only ever renders; POST acts.
//   /healthz   unauthenticated, so an external uptime monitor can watch the
//              watcher. Returns 503 when the service cannot be trusted.
//   /api/*, /  operator routes behind a bearer token.
//
// Written on node:http directly. A safety service with no dependencies cannot
// be broken by someone else's release.

import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { verifyToken, isSafeMethod } from './tokens.js';
import { PHASES } from './machine.js';
import {
  page, checkinPage, checkedInPage, resolvePage, resolvedPage,
  dashboardPage, errorPage, EXPIRED_LINK, BAD_LINK,
} from './ui.js';

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  // These pages contain health information and one-shot capabilities.
  'cache-control': 'no-store, no-cache, must-revalidate, private',
};

function constantTimeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * A small fixed-window limiter. Token guessing is the only meaningful remote
 * attack here, and it is cheap to make hopeless.
 */
class RateLimiter {
  constructor({ windowMs = 60_000, max = 60 } = {}) {
    this.windowMs = windowMs; this.max = max; this.hits = new Map();
  }

  check(key, now) {
    const slot = Math.floor(now / this.windowMs);
    const id = `${key}|${slot}`;
    const n = (this.hits.get(id) ?? 0) + 1;
    this.hits.set(id, n);
    if (this.hits.size > 10_000) {
      for (const k of this.hits.keys()) {
        if (!k.endsWith(`|${slot}`)) this.hits.delete(k);
      }
    }
    return n <= this.max;
  }
}

export function createApp({ store, scheduler, adminToken, clock = () => Date.now(), limiter = new RateLimiter() }) {
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(body);
  };
  const html = (res, status, body) => send(res, status, body, { 'content-type': 'text/html; charset=utf-8' });
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj, null, 2),
    { 'content-type': 'application/json; charset=utf-8' });

  const readBody = (req, limitBytes = 64 * 1024) => new Promise((resolve, reject) => {
    let size = 0; let done = false; const chunks = [];
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limitBytes) {
        // Stop reading, but do not destroy the socket here: the caller still
        // has to write a status the client can actually read.
        done = true;
        const err = new Error('body too large');
        err.code = 'TOO_LARGE';
        req.pause();
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', (e) => { if (!done) reject(e); });
  });

  const isAdmin = (req) => {
    if (!adminToken) return false;
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : null;
    return given !== null && constantTimeEqual(given, adminToken);
  };

  /** Resolve a token from the path into a watch, or render the right error. */
  const openToken = (res, kind, raw, now) => {
    const v = verifyToken(raw, scheduler.secret, now);
    if (!v.ok) {
      const [heading, detail] = v.reason === 'expired' ? EXPIRED_LINK : BAD_LINK;
      html(res, v.reason === 'expired' ? 410 : 400, errorPage(410, heading, detail));
      return null;
    }
    if (v.claims.kind !== kind) {
      html(res, 400, errorPage(400, ...BAD_LINK));
      return null;
    }
    const row = store.getWatch(v.claims.watchId);
    if (!row) {
      html(res, 404, errorPage(404, 'This watch no longer exists',
        'It may have been removed. Nothing further is needed.'));
      return null;
    }
    return { claims: v.claims, ...row };
  };

  return createServer(async (req, res) => {
    const now = clock();
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      return send(res, 400, 'bad request');
    }
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const ip = req.socket.remoteAddress ?? 'unknown';

    if (!limiter.check(ip, now)) {
      return send(res, 429, 'too many requests', { 'retry-after': '60' });
    }

    try {
      // --- health: deliberately unauthenticated ---------------------------
      if (path === '/healthz') {
        const h = scheduler.health(now);
        // A monitoring service must be able to see this go red without a key.
        return json(res, h.ok ? 200 : 503, h);
      }

      // --- token actions ----------------------------------------------------
      const action = /^\/a\/(checkin|resolve|pause)\/(.+)$/.exec(path);
      if (action) {
        const [, kind, raw] = action;
        const token = decodeURIComponent(raw);
        const opened = openToken(res, kind, token, now);
        if (!opened) return undefined;
        const { config, state, claims } = opened;

        // GET renders. It must never change anything: mail scanners and chat
        // previews fetch these URLs automatically, and a check-in performed by
        // a robot would silently cancel a real alarm.
        if (isSafeMethod(req.method)) {
          if (kind === 'checkin') return html(res, 200, checkinPage(config, state, now, token));
          if (kind === 'resolve') {
            const contact = config.contacts.find((c) => c.id === claims.contactId) ?? null;
            return html(res, 200, resolvePage(config, state, contact, now, token));
          }
          return html(res, 200, page({
            title: 'Pause check-ins',
            body: `<div class="card"><h1>Pause check-ins?</h1>
              <p class="lead">This suspends alerts for ${config.name} for 24 hours.
              It will resume automatically.</p>
              <form method="POST" action="/a/pause/${encodeURIComponent(token)}">
              <button class="big" type="submit">Pause for 24 hours</button></form></div>`,
          }));
        }

        if (req.method !== 'POST') return send(res, 405, 'method not allowed', { allow: 'GET, POST' });

        if (kind === 'checkin') {
          const r = scheduler.applyEvent(config.id, { type: 'checkin', source: 'link' }, now);
          if (!r.ok) return html(res, 409, errorPage(409, 'Could not check in', r.error));
          await scheduler.flush(now);
          return html(res, 200, checkedInPage(config, r.state, now));
        }
        if (kind === 'resolve') {
          const contact = config.contacts.find((c) => c.id === claims.contactId);
          const r = scheduler.applyEvent(config.id,
            { type: 'resolve', by: contact?.name ?? 'a contact' }, now);
          if (!r.ok) return html(res, 409, errorPage(409, 'Could not clear the alarm', r.error));
          await scheduler.flush(now);
          return html(res, 200, resolvedPage(config, contact?.name ?? null));
        }
        const r = scheduler.applyEvent(config.id,
          { type: 'pause', until: now + 24 * 3600_000, by: 'link' }, now);
        if (!r.ok) return html(res, 409, errorPage(409, 'Could not pause', r.error));
        await scheduler.flush(now);
        return html(res, 200, errorPage(200, 'Check-ins paused',
          'Alerts are suspended for 24 hours and will resume automatically.'));
      }

      // --- everything below is operator-only --------------------------------
      if (!isAdmin(req)) {
        if (path === '/') {
          return html(res, 401, errorPage(401, 'Sign in required',
            'This status page needs an operator token.'));
        }
        return json(res, 401, { error: 'unauthorized' });
      }

      if (path === '/' && req.method === 'GET') {
        return html(res, 200, dashboardPage(store.listWatches(), scheduler.health(now), now));
      }

      if (path === '/api/watches' && req.method === 'GET') {
        return json(res, 200, store.listWatches());
      }

      const watchApi = /^\/api\/watches\/([A-Za-z0-9_-]+)(?:\/([a-z]+))?$/.exec(path);
      if (watchApi) {
        const [, id, verb] = watchApi;
        const row = store.getWatch(id);
        if (!row) return json(res, 404, { error: 'no such watch' });

        if (!verb && req.method === 'GET') {
          return json(res, 200, {
            ...row,
            events: store.eventsFor(id, 50),
            deliveries: store.deliveriesFor(id, 50),
          });
        }
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });

        let raw;
        try {
          raw = await readBody(req);
        } catch (err) {
          if (err?.code === 'TOO_LARGE') {
            json(res, 413, { error: 'request body too large' });
            req.destroy();          // only after the client has its answer
            return undefined;
          }
          throw err;
        }
        let payload = {};
        if (raw.trim()) {
          try { payload = JSON.parse(raw); } catch { return json(res, 400, { error: 'invalid JSON body' }); }
        }

        const allowed = ['arm', 'disarm', 'pause', 'resume', 'checkin', 'verify', 'test'];
        if (!allowed.includes(verb)) return json(res, 404, { error: 'unknown action' });

        const event = { type: verb, ...payload };
        const r = scheduler.applyEvent(id, event, now);
        if (!r.ok) return json(res, 409, { error: r.error });
        await scheduler.flush(now);
        return json(res, 200, { ok: true, state: r.state, actions: r.actions.map((a) => a.type) });
      }

      return json(res, 404, { error: 'not found' });
    } catch (err) {
      // Never leak internals to a page a stranger might be reading.
      return json(res, 500, { error: 'internal error' });
    }
  });
}

export { RateLimiter };
