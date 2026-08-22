// Lantern — a minimal SMTP client.
//
// Written by hand rather than pulled from npm because this service's whole
// argument is that it has no supply chain: a dependency that can be updated
// out from under you is a poor foundation for something safety-critical.
//
// Supports what mail relays actually require: STARTTLS or implicit TLS,
// AUTH PLAIN / LOGIN, and correct dot-stuffing. No attachments, no HTML —
// these messages are plain text on purpose.

import { createConnection } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

const CRLF = '\r\n';

class SmtpError extends Error {
  constructor(message, code) { super(message); this.name = 'SmtpError'; this.code = code; }
}

function readResponse(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      // A reply is complete when the last line is "NNN <text>" with a space,
      // rather than "NNN-<text>" which marks a continuation.
      const lines = buf.split(CRLF).filter(Boolean);
      const last = lines[lines.length - 1];
      if (!last || !/^\d{3}[ ]/.test(last)) return;
      cleanup();
      const code = Number(last.slice(0, 3));
      if (code >= 400) reject(new SmtpError(`server said: ${buf.trim()}`, code));
      else resolve({ code, text: buf.trim() });
    };
    const onError = (err) => { cleanup(); reject(err); };
    const onClose = () => { cleanup(); reject(new SmtpError('connection closed mid-command')); };
    const timer = setTimeout(() => { cleanup(); reject(new SmtpError('timed out waiting for server')); }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    }
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

async function command(socket, line, timeoutMs) {
  if (line !== null) socket.write(line + CRLF);
  return readResponse(socket, timeoutMs);
}

/** RFC 5321 dot-stuffing: a line of a single "." would otherwise end the message. */
export function dotStuff(text) {
  return text.replace(/\r?\n/g, CRLF).split(CRLF)
    .map((l) => (l.startsWith('.') ? `.${l}` : l)).join(CRLF);
}

/** Fold a header value and strip CR/LF so a subject can never inject headers. */
export function sanitizeHeader(value) {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

export function buildMessage({ from, to, subject, text, date = new Date(), messageId }) {
  const headers = [
    `From: ${sanitizeHeader(from)}`,
    `To: ${sanitizeHeader(to)}`,
    `Subject: ${sanitizeHeader(subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${messageId ?? `${Date.now()}.${Math.random().toString(36).slice(2)}@lantern`}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    // These are operational alerts, not marketing. Keep them out of threads
    // that auto-reply, and out of "promotions" style filtering.
    'Auto-Submitted: auto-generated',
    'X-Auto-Response-Suppress: All',
  ];
  return `${headers.join(CRLF)}${CRLF}${CRLF}${dotStuff(text)}`;
}

/**
 * @param {object} opts host, port, secure, user, pass, from, timeoutMs, tlsOptions
 */
export function createTransport(opts) {
  const {
    host, port = 587, secure = false, user, pass,
    from, timeoutMs = 20_000, requireTls = true, tlsOptions = {},
  } = opts;
  if (!host) throw new Error('smtp host is required');
  if (!from) throw new Error('smtp from address is required');

  return {
    async sendMail({ to, subject, text }) {
      let socket = secure
        ? tlsConnect({ host, port, ...tlsOptions })
        : createConnection({ host, port });

      const connected = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new SmtpError('timed out connecting')), timeoutMs);
        socket.once(secure ? 'secureConnect' : 'connect', () => { clearTimeout(timer); resolve(); });
        socket.once('error', (e) => { clearTimeout(timer); reject(e); });
      });

      try {
        await connected;
        socket.setNoDelay(true);
        await readResponse(socket, timeoutMs);               // greeting
        let reply = await command(socket, `EHLO lantern`, timeoutMs);

        if (!secure) {
          if (/STARTTLS/i.test(reply.text)) {
            await command(socket, 'STARTTLS', timeoutMs);
            socket = await new Promise((resolve, reject) => {
              const upgraded = tlsConnect({ socket, servername: host, ...tlsOptions }, () => resolve(upgraded));
              upgraded.once('error', reject);
            });
            reply = await command(socket, `EHLO lantern`, timeoutMs);
          } else if (requireTls) {
            // Refuse to send someone's health information in the clear.
            throw new SmtpError('server does not offer STARTTLS and requireTls is set');
          }
        }

        if (user) {
          if (/AUTH[^\r\n]*PLAIN/i.test(reply.text)) {
            const creds = Buffer.from(`\0${user}\0${pass ?? ''}`).toString('base64');
            await command(socket, `AUTH PLAIN ${creds}`, timeoutMs);
          } else {
            await command(socket, 'AUTH LOGIN', timeoutMs);
            await command(socket, Buffer.from(user).toString('base64'), timeoutMs);
            await command(socket, Buffer.from(pass ?? '').toString('base64'), timeoutMs);
          }
        }

        const envelopeFrom = /<([^>]+)>/.exec(from)?.[1] ?? from;
        await command(socket, `MAIL FROM:<${envelopeFrom}>`, timeoutMs);
        await command(socket, `RCPT TO:<${to}>`, timeoutMs);
        await command(socket, 'DATA', timeoutMs);
        socket.write(buildMessage({ from, to, subject, text }) + CRLF + '.' + CRLF);
        await readResponse(socket, timeoutMs);               // 250 queued
        try { await command(socket, 'QUIT', timeoutMs); } catch { /* server may hang up first */ }
      } finally {
        socket.destroy();
      }
    },
  };
}
