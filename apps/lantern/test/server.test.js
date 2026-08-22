import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, HOUR, fromLocal } from '../src/time.js';
import { normalizeConfig } from '../src/model.js';
import { initState, PHASES } from '../src/machine.js';
import { Store } from '../src/store.js';
import { Channels } from '../src/channels.js';
import { Scheduler } from '../src/scheduler.js';
import { createApp } from '../src/server.js';
import { mintToken } from '../src/tokens.js';

const TZ = 'Europe/London';
const T0 = fromLocal({ year: 2026, month: 5, day: 12, hour: 12 }, TZ);
const SECRET = 'server-test-secret';
const ADMIN = 'admin-token-12345';

async function harness() {
  const store = new Store(':memory:');
  const sent = [];
  const channels = new Channels({
    test: { name: 'test', async send(m) { sent.push(m); } },
  });
  let clock = T0;
  const scheduler = new Scheduler({
    store, channels, secret: SECRET, baseUrl: 'https://lantern.example',
    clock: () => clock,
  });
  const config = normalizeConfig({
    id: 'ada', name: 'Ada Lovelace', timezone: TZ, intervalHours: 24, quietHours: null,
    graceMinutes: 180, nudgeEveryMinutes: 45, tierWaitMinutes: [60],
    note: 'Spare key with Mrs Patel at number 12.',
    self: { channel: 'test', address: 'ada@example.com' },
    contacts: [
      { id: 'c1', name: 'Bea', channel: 'test', address: 'bea@example.com', tier: 1,
        instruction: 'Call the landline first — she often misses her mobile.' },
      { id: 'c2', name: 'Cal', channel: 'test', address: 'cal@example.com', tier: 2 },
    ],
  });
  store.putWatch(config, initState(T0), T0);
  scheduler.applyEvent('ada', { type: 'verify' }, T0);
  scheduler.applyEvent('ada', { type: 'arm' }, T0);

  const server = createApp({ store, scheduler, adminToken: ADMIN, clock: () => clock });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    store, scheduler, sent, config, base, server,
    setClock(t) { clock = t; },
    close() { server.close(); store.close(); },
    token(kind, contactId = null, at = clock) {
      return mintToken({ watchId: 'ada', kind, contactId, issuedAt: at, ttlMs: 7 * 24 * HOUR }, SECRET);
    },
    get(path, opts) { return fetch(base + path, opts); },
    admin(path, opts = {}) {
      return fetch(base + path, {
        ...opts, headers: { authorization: `Bearer ${ADMIN}`, ...(opts.headers ?? {}) },
      });
    },
    phase() { return store.getWatch('ada').state.phase; },
  };
}

// ---------------------------------------------------------------------------
// The link-scanner defence — the most important test in this file
// ---------------------------------------------------------------------------

test('a GET on a check-in link renders a page but records nothing', async () => {
  const h = await harness();
  try {
    h.setClock(T0 + 24 * HOUR + 30 * MINUTE);   // overdue, alarm running
    await h.scheduler.tick(T0 + 24 * HOUR + 30 * MINUTE);
    assert.equal(h.phase(), PHASES.DUE);

    const res = await h.get(`/a/checkin/${h.token('checkin')}`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /Are you OK/);
    assert.match(body, /<form method="POST"/);

    // The crucial assertion: an automated fetch must not have checked her in.
    assert.equal(h.phase(), PHASES.DUE, 'a GET must never cancel an alarm');
  } finally { h.close(); }
});

test('HEAD requests — as issued by link scanners — also change nothing', async () => {
  const h = await harness();
  try {
    h.setClock(T0 + 24 * HOUR + 30 * MINUTE);
    await h.scheduler.tick(T0 + 24 * HOUR + 30 * MINUTE);
    await h.get(`/a/checkin/${h.token('checkin')}`, { method: 'HEAD' });
    assert.equal(h.phase(), PHASES.DUE);
  } finally { h.close(); }
});

test('repeated automated GETs during a live alarm never suppress it', async () => {
  const h = await harness();
  try {
    const at = T0 + 24 * HOUR + 200 * MINUTE;  // tier 1 already contacted
    h.setClock(at);
    await h.scheduler.tick(at);
    assert.equal(h.store.getWatch('ada').state.tiersNotified, 1);

    const token = h.token('checkin');
    for (let i = 0; i < 10; i += 1) await h.get(`/a/checkin/${token}`);

    const state = h.store.getWatch('ada').state;
    assert.equal(state.phase, PHASES.ESCALATING);
    assert.equal(state.tiersNotified, 1, 'the alarm is still live');
  } finally { h.close(); }
});

test('a POST on a check-in link does check in and clears the alarm', async () => {
  const h = await harness();
  try {
    const at = T0 + 24 * HOUR + 200 * MINUTE;
    h.setClock(at);
    await h.scheduler.tick(at);
    const res = await h.get(`/a/checkin/${h.token('checkin')}`, { method: 'POST' });
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /you're checked in/i);
    assert.equal(h.phase(), PHASES.OK);
    // And the contact who was alarmed gets told immediately, not next tick.
    assert.ok(h.sent.some((m) => m.meta.kind === 'standdown' && m.address === 'bea@example.com'));
  } finally { h.close(); }
});

// ---------------------------------------------------------------------------
// The contact's resolve flow
// ---------------------------------------------------------------------------

test('a contact GET shows the situation, the instruction and the note', async () => {
  const h = await harness();
  try {
    const at = T0 + 24 * HOUR + 200 * MINUTE;
    h.setClock(at);
    await h.scheduler.tick(at);
    const res = await h.get(`/a/resolve/${h.token('resolve', 'c1')}`);
    const body = await res.text();
    assert.match(body, /Ada Lovelace has not checked in/);
    assert.match(body, /Call the landline first/);
    assert.match(body, /Mrs Patel at number 12/);
    assert.equal(h.phase(), PHASES.ESCALATING, 'viewing does not resolve');
  } finally { h.close(); }
});

test('a contact POST clears the alarm and names them', async () => {
  const h = await harness();
  try {
    const at = T0 + 24 * HOUR + 200 * MINUTE;
    h.setClock(at);
    await h.scheduler.tick(at);
    const res = await h.get(`/a/resolve/${h.token('resolve', 'c1')}`, { method: 'POST' });
    assert.match(await res.text(), /alarm is cleared/i);
    assert.equal(h.phase(), PHASES.OK);
    assert.equal(h.store.getWatch('ada').state.resolvedBy, 'Bea');
  } finally { h.close(); }
});

test('a contact opening a link after the alarm cleared is reassured, not alarmed', async () => {
  const h = await harness();
  try {
    const res = await h.get(`/a/resolve/${h.token('resolve', 'c1')}`);
    const body = await res.text();
    assert.match(body, /is OK/);
    assert.match(body, /already been cleared|nothing you need to do/i);
  } finally { h.close(); }
});

// ---------------------------------------------------------------------------
// Token handling
// ---------------------------------------------------------------------------

test('an expired link explains itself without alarming the reader', async () => {
  const h = await harness();
  try {
    const old = mintToken({ watchId: 'ada', kind: 'checkin', issuedAt: T0 - 10 * HOUR, ttlMs: HOUR }, SECRET);
    const res = await h.get(`/a/checkin/${old}`);
    assert.equal(res.status, 410);
    assert.match(await res.text(), /link has expired/i);
  } finally { h.close(); }
});

test('a forged or corrupted link is refused', async () => {
  const h = await harness();
  try {
    for (const bad of ['nonsense', 'a.b', `${h.token('checkin')}x`]) {
      const res = await h.get(`/a/checkin/${bad}`);
      assert.ok(res.status === 400 || res.status === 410, `${bad} → ${res.status}`);
      assert.match(await res.text(), /not valid|expired/i);
    }
    assert.equal(h.phase(), PHASES.OK);
  } finally { h.close(); }
});

test('a token minted for one purpose cannot be used for another', async () => {
  const h = await harness();
  try {
    // A check-in token must not be usable to clear a contact's alarm.
    const res = await h.get(`/a/resolve/${h.token('checkin')}`, { method: 'POST' });
    assert.equal(res.status, 400);
    assert.equal(h.phase(), PHASES.OK);
  } finally { h.close(); }
});

test('a token for a deleted watch fails gracefully', async () => {
  const h = await harness();
  try {
    const token = h.token('checkin');
    h.store.deleteWatch('ada');
    const res = await h.get(`/a/checkin/${token}`);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /no longer exists/);
  } finally { h.close(); }
});

// ---------------------------------------------------------------------------
// Health endpoint — must be reachable by an external monitor
// ---------------------------------------------------------------------------

test('healthz needs no credentials and reports 200 when healthy', async () => {
  const h = await harness();
  try {
    await h.scheduler.tick(T0);
    const res = await h.get('/healthz');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.watches.length, 1);
  } finally { h.close(); }
});

test('healthz returns 503 when the scheduler has gone quiet', async () => {
  const h = await harness();
  try {
    await h.scheduler.tick(T0);
    h.setClock(T0 + 3 * HOUR);          // no ticks since
    const res = await h.get('/healthz');
    assert.equal(res.status, 503, 'an uptime monitor must be able to see this');
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.problems.join(' '), /stale/);
  } finally { h.close(); }
});

// ---------------------------------------------------------------------------
// Operator routes
// ---------------------------------------------------------------------------

test('operator routes reject missing and wrong tokens', async () => {
  const h = await harness();
  try {
    assert.equal((await h.get('/api/watches')).status, 401);
    assert.equal((await h.get('/api/watches', { headers: { authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await h.get('/')).status, 401);
    assert.equal((await h.admin('/api/watches')).status, 200);
  } finally { h.close(); }
});

test('the dashboard renders every watch and the health banner', async () => {
  const h = await harness();
  try {
    await h.scheduler.tick(T0);
    const body = await (await h.admin('/')).text();
    assert.match(body, /Ada Lovelace/);
    assert.match(body, /Scheduler healthy/);
    assert.match(body, /Europe\/London/);
  } finally { h.close(); }
});

test('the dashboard shows an alarm in progress', async () => {
  const h = await harness();
  try {
    const at = T0 + 24 * HOUR + 200 * MINUTE;
    h.setClock(at);
    await h.scheduler.tick(at);
    const body = await (await h.admin('/')).text();
    assert.match(body, /escalating/);
  } finally { h.close(); }
});

test('operator actions drive the watch and are audited', async () => {
  const h = await harness();
  try {
    const pause = await h.admin('/api/watches/ada/pause', {
      method: 'POST', body: JSON.stringify({ until: T0 + 48 * HOUR }),
    });
    assert.equal(pause.status, 200);
    assert.equal(h.phase(), PHASES.PAUSED);

    const resume = await h.admin('/api/watches/ada/resume', { method: 'POST' });
    assert.equal(resume.status, 200);
    assert.equal(h.phase(), PHASES.OK);

    const detail = await (await h.admin('/api/watches/ada')).json();
    assert.ok(detail.events.some((e) => e.type === 'pause'));
    assert.ok(detail.events.some((e) => e.type === 'resume'));
  } finally { h.close(); }
});

test('an unknown operator action is rejected rather than guessed at', async () => {
  const h = await harness();
  try {
    const res = await h.admin('/api/watches/ada/explode', { method: 'POST' });
    assert.equal(res.status, 404);
  } finally { h.close(); }
});

test('a malformed JSON body is rejected clearly', async () => {
  const h = await harness();
  try {
    const res = await h.admin('/api/watches/ada/pause', { method: 'POST', body: '{oh no' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /invalid JSON/);
  } finally { h.close(); }
});

test('arming is refused over the API for an unverified watch', async () => {
  const h = await harness();
  try {
    const store = h.store;
    const cfg = store.getWatch('ada').config;
    store.putWatch(cfg, initState(T0), T0);            // reset to unverified
    const res = await h.admin('/api/watches/ada/arm', { method: 'POST' });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /test message/);
  } finally { h.close(); }
});

// ---------------------------------------------------------------------------
// Hardening
// ---------------------------------------------------------------------------

test('security headers are present on every response', async () => {
  const h = await harness();
  try {
    for (const res of [await h.get('/healthz'), await h.get(`/a/checkin/${h.token('checkin')}`)]) {
      assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
      assert.match(res.headers.get('cache-control'), /no-store/);
    }
  } finally { h.close(); }
});

test('user-supplied text is escaped, not injected, into pages', async () => {
  const store = new Store(':memory:');
  const channels = new Channels({ test: { name: 'test', async send() {} } });
  let clock = T0;
  const scheduler = new Scheduler({ store, channels, secret: SECRET, baseUrl: 'https://x', clock: () => clock });
  const config = normalizeConfig({
    id: 'x', name: '<script>alert(1)</script>', timezone: 'UTC', quietHours: null,
    note: '"><img src=x onerror=alert(2)>',
    self: { channel: 'test', address: 'a' },
    contacts: [{ id: 'c1', name: 'B', channel: 'test', address: 'b', tier: 1,
      instruction: '</p><script>alert(3)</script>' }],
  });
  store.putWatch(config, initState(T0), T0);
  scheduler.applyEvent('x', { type: 'verify' }, T0);
  scheduler.applyEvent('x', { type: 'arm' }, T0);
  const server = createApp({ store, scheduler, adminToken: ADMIN, clock: () => clock });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    clock = T0 + 24 * HOUR + 200 * MINUTE;
    await scheduler.tick(clock);
    const token = mintToken({ watchId: 'x', kind: 'resolve', contactId: 'c1', issuedAt: clock, ttlMs: HOUR }, SECRET);
    const body = await (await fetch(`${base}/a/resolve/${token}`)).text();
    assert.ok(!body.includes('<script>alert(1)</script>'));
    assert.ok(!body.includes('<img src=x onerror'));
    assert.ok(!body.includes('<script>alert(3)</script>'));
    assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  } finally { server.close(); store.close(); }
});

test('excessive requests are rate limited', async () => {
  const h = await harness();
  try {
    let limited = false;
    for (let i = 0; i < 80; i += 1) {
      const res = await h.get('/healthz');
      if (res.status === 429) { limited = true; break; }
    }
    assert.ok(limited, 'token guessing must not be free');
  } finally { h.close(); }
});

test('an oversized request body is refused', async () => {
  const h = await harness();
  try {
    const res = await h.admin('/api/watches/ada/pause', {
      method: 'POST', body: 'x'.repeat(200_000),
    });
    assert.ok(res.status >= 400, `expected an error, got ${res.status}`);
  } finally { h.close(); }
});

test('unknown paths 404 without leaking anything', async () => {
  const h = await harness();
  try {
    const res = await h.admin('/../../etc/passwd');
    assert.equal(res.status, 404);
  } finally { h.close(); }
});
