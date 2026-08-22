// Lantern — signed action links.
//
// A check-in link is a capability: whoever holds it can tell the system that
// the person is fine. Two threats matter, and they need different defences.
//
// 1. FORGERY. Someone guessing a link could suppress a real alarm. Defence:
//    HMAC-SHA256 over the payload, verified in constant time, plus expiry.
//
// 2. AUTOMATED FETCHING. This is the subtle one. Corporate mail gateways and
//    chat clients routinely follow links in messages to scan them. A link
//    that checks someone in on GET would therefore be "clicked" by a robot
//    minutes after the nudge is sent — and the alarm would be silently
//    cancelled while the person lay unconscious. That is the worst failure
//    this system could have.
//
//    Defence: GET is always safe. It renders a page with a button. Only a
//    POST carrying the token performs the check-in. Scanners issue GET and
//    HEAD; they do not submit forms. `isSafeMethod` is the single place that
//    rule is expressed, and the server routes through it.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const KINDS = Object.freeze(['checkin', 'resolve', 'pause', 'manage']);

/** Generate a signing secret. One per deployment; rotating it invalidates live links. */
export function generateSecret() {
  return randomBytes(32).toString('base64url');
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * Mint a token.
 * @param {{watchId:string, kind:string, contactId?:string, issuedAt:number, ttlMs:number}} claims
 */
export function mintToken({ watchId, kind, contactId = null, issuedAt, ttlMs }, secret) {
  if (!KINDS.includes(kind)) throw new RangeError(`unknown token kind: ${kind}`);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError('issuedAt and a positive ttlMs are required');
  }
  const payload = { w: watchId, k: kind, c: contactId, i: issuedAt, x: issuedAt + ttlMs };
  const body = b64u(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verify a token.
 * @returns {{ok:true, claims:object} | {ok:false, reason:'malformed'|'bad-signature'|'expired'}}
 */
export function verifyToken(token, secret, now) {
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, mac] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(mac)) {
    return { ok: false, reason: 'malformed' };
  }

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(mac);
  // Constant-time comparison; length is checked first because timingSafeEqual
  // throws on a mismatch, and that throw would itself leak length.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!claims || typeof claims !== 'object' || typeof claims.w !== 'string'
      || !KINDS.includes(claims.k) || !Number.isFinite(claims.x)) {
    return { ok: false, reason: 'malformed' };
  }
  if (now >= claims.x) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    claims: {
      watchId: claims.w,
      kind: claims.k,
      contactId: claims.c ?? null,
      issuedAt: claims.i,
      expiresAt: claims.x,
    },
  };
}

/**
 * HTTP methods that must never change state.
 *
 * The check-in flow depends on this: link scanners prefetch with GET and HEAD,
 * so those may only ever render a confirmation page. Anything that records a
 * check-in must arrive as a POST.
 */
export function isSafeMethod(method) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

/** Build the URL a person taps in a message. */
export function actionUrl(baseUrl, kind, token) {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/a/${kind}/${token}`;
}
