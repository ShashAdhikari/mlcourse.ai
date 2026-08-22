// Lantern — delivery channels.
//
// One interface: send({channel, address, subject, body}) -> Promise<void>,
// throwing on failure. The scheduler owns retries and backoff, so a channel
// only has to be honest about whether the message left the building.
//
// A channel that "succeeds" without delivering is worse than one that fails
// loudly, because the scheduler will stop retrying. Adapters therefore treat
// any non-2xx, any transport error, and any ambiguous result as a failure.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createTransport } from './smtp.js';

/** Console: development and dry runs. */
export function consoleChannel() {
  return {
    name: 'console',
    async send({ address, subject, body }) {
      process.stdout.write(`\n--- lantern → ${address} ---\n${subject}\n\n${body}\n---\n`);
    },
  };
}

/** File: append every message as JSONL. Used by tests and by dry-run deployments. */
export function fileChannel(path) {
  mkdirSync(dirname(path), { recursive: true });
  return {
    name: 'file',
    async send({ address, subject, body, meta }) {
      appendFileSync(path, `${JSON.stringify({ at: Date.now(), address, subject, body, meta })}\n`);
    },
  };
}

/**
 * Webhook: POST JSON to a URL. The general-purpose escape hatch — point it at
 * a push service, a home automation hub, Slack, or your own relay.
 */
export function webhookChannel({ url, timeoutMs = 10_000, headers = {} }) {
  return {
    name: 'webhook',
    async send({ address, subject, body, meta }) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ to: address, subject, body, ...meta }),
        });
        if (!res.ok) throw new Error(`webhook returned ${res.status}`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Email over SMTP. See smtp.js — a minimal, dependency-free client. */
export function emailChannel(opts) {
  const transport = createTransport(opts);
  return {
    name: 'email',
    async send({ address, subject, body }) {
      await transport.sendMail({ to: address, subject, text: body });
    },
  };
}

/**
 * SMS via an HTTP provider. Configured with a URL template rather than a
 * hard-coded vendor, so Twilio, Vonage, MessageBird or a local gateway all
 * work without a code change.
 */
export function smsChannel({ url, method = 'POST', headers = {}, bodyTemplate, timeoutMs = 10_000 }) {
  return {
    name: 'sms',
    async send({ address, subject, body }) {
      // SMS has no subject line; prepend it so the first line still says what
      // this is, because that is what shows in a lock-screen preview.
      const text = subject ? `${subject}\n\n${body}` : body;
      const payload = (bodyTemplate ?? (({ to, message }) =>
        new URLSearchParams({ To: to, Body: message }).toString()))({ to: address, message: text });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          signal: ctrl.signal,
          headers: {
            'content-type': typeof payload === 'string'
              ? 'application/x-www-form-urlencoded' : 'application/json',
            ...headers,
          },
          body: typeof payload === 'string' ? payload : JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(`sms provider returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * A registry mapping channel names to adapters, with a hard failure for a
 * channel that was configured on a contact but never wired up. Discovering
 * that at send time is exactly the silent-failure mode this system exists to
 * avoid, so `validate` is called at startup instead.
 */
export class Channels {
  constructor(map = {}) {
    this.map = new Map(Object.entries(map));
  }

  set(name, adapter) { this.map.set(name, adapter); return this; }
  has(name) { return this.map.has(name); }

  async send(channel, message) {
    const adapter = this.map.get(channel);
    if (!adapter) throw new Error(`no adapter configured for channel "${channel}"`);
    await adapter.send(message);
  }

  /** Every channel any watch depends on must exist before the service starts. */
  validate(watches) {
    const missing = new Set();
    for (const { config } of watches) {
      if (!this.has(config.self.channel)) missing.add(config.self.channel);
      for (const c of config.contacts) if (!this.has(c.channel)) missing.add(c.channel);
    }
    if (missing.size) {
      throw new Error(`watches reference unconfigured channels: ${[...missing].sort().join(', ')}`);
    }
  }
}
