import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSecret, mintToken, verifyToken, isSafeMethod, actionUrl,
} from '../src/tokens.js';

const SECRET = 'a-secret-for-tests';
const T0 = 1_800_000_000_000;
const HOUR = 3_600_000;

const mint = (over = {}) => mintToken({
  watchId: 'w1', kind: 'checkin', issuedAt: T0, ttlMs: 24 * HOUR, ...over,
}, SECRET);

test('generateSecret produces distinct, URL-safe secrets', () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
});

test('a minted token verifies and carries its claims', () => {
  const r = verifyToken(mint({ contactId: 'c1' }), SECRET, T0 + HOUR);
  assert.equal(r.ok, true);
  assert.equal(r.claims.watchId, 'w1');
  assert.equal(r.claims.kind, 'checkin');
  assert.equal(r.claims.contactId, 'c1');
  assert.equal(r.claims.expiresAt, T0 + 24 * HOUR);
});

test('a token from a different secret is rejected', () => {
  const r = verifyToken(mint(), 'the-wrong-secret', T0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-signature');
});

test('tampering with the payload is detected', () => {
  const token = mint();
  const [body, mac] = token.split('.');
  const evil = Buffer.from(JSON.stringify({ w: 'other', k: 'checkin', c: null, i: T0, x: T0 + HOUR }))
    .toString('base64url');
  assert.equal(verifyToken(`${evil}.${mac}`, SECRET, T0).reason, 'bad-signature');
  // Flipping a character in the signature must also fail.
  const flipped = mac[0] === 'A' ? `B${mac.slice(1)}` : `A${mac.slice(1)}`;
  assert.equal(verifyToken(`${body}.${flipped}`, SECRET, T0).reason, 'bad-signature');
});

test('an expired token is refused', () => {
  const token = mint({ ttlMs: HOUR });
  assert.equal(verifyToken(token, SECRET, T0 + HOUR - 1).ok, true);
  assert.equal(verifyToken(token, SECRET, T0 + HOUR).reason, 'expired');
  assert.equal(verifyToken(token, SECRET, T0 + 10 * HOUR).reason, 'expired');
});

test('malformed input is rejected without throwing', () => {
  for (const junk of ['', '.', 'a.', '.b', 'no-dot', 'a.b.c', null, 42, {}, [],
                      'not base64!.also-not', `${'x'.repeat(10)}.${'y'.repeat(10)}`]) {
    const r = verifyToken(junk, SECRET, T0);
    assert.equal(r.ok, false, String(junk));
    assert.ok(['malformed', 'bad-signature'].includes(r.reason), `${junk} → ${r.reason}`);
  }
});

test('a token with a valid signature but nonsense payload is malformed', () => {
  // Sign a payload that is well-formed base64 but not a valid claim set.
  const token = mintToken({ watchId: 'w1', kind: 'checkin', issuedAt: T0, ttlMs: HOUR }, SECRET);
  const [, mac] = token.split('.');
  const garbage = Buffer.from('not json at all').toString('base64url');
  const r = verifyToken(`${garbage}.${mac}`, SECRET, T0);
  assert.equal(r.ok, false);
});

test('an unknown token kind cannot be minted', () => {
  assert.throws(() => mintToken({ watchId: 'w', kind: 'delete-everything', issuedAt: T0, ttlMs: HOUR }, SECRET),
    RangeError);
});

test('minting requires a sane clock and lifetime', () => {
  assert.throws(() => mintToken({ watchId: 'w', kind: 'checkin', issuedAt: NaN, ttlMs: HOUR }, SECRET), RangeError);
  assert.throws(() => mintToken({ watchId: 'w', kind: 'checkin', issuedAt: T0, ttlMs: 0 }, SECRET), RangeError);
  assert.throws(() => mintToken({ watchId: 'w', kind: 'checkin', issuedAt: T0, ttlMs: -1 }, SECRET), RangeError);
});

test('surrounding whitespace is tolerated', () => {
  assert.equal(verifyToken(`  ${mint()}\n`, SECRET, T0).ok, true);
});

// ---------------------------------------------------------------------------
// The link-scanner defence
// ---------------------------------------------------------------------------

test('GET and HEAD are classified as safe, POST is not', () => {
  // This is the rule that stops a corporate mail scanner "clicking" a check-in
  // link and cancelling a real alarm while the person is unconscious.
  assert.equal(isSafeMethod('GET'), true);
  assert.equal(isSafeMethod('HEAD'), true);
  assert.equal(isSafeMethod('OPTIONS'), true);
  assert.equal(isSafeMethod('POST'), false);
  assert.equal(isSafeMethod('PUT'), false);
  assert.equal(isSafeMethod('DELETE'), false);
});

test('actionUrl builds a tidy link regardless of trailing slashes', () => {
  const t = mint();
  assert.equal(actionUrl('https://x.example', 'checkin', t), `https://x.example/a/checkin/${t}`);
  assert.equal(actionUrl('https://x.example///', 'checkin', t), `https://x.example/a/checkin/${t}`);
});

test('tokens are URL-safe and survive a round trip through a URL', () => {
  for (let i = 0; i < 50; i += 1) {
    const t = mintToken({ watchId: `w${i}`, kind: 'resolve', contactId: `c${i}`, issuedAt: T0 + i, ttlMs: HOUR }, SECRET);
    assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const url = new URL(actionUrl('https://x.example', 'resolve', t));
    const extracted = url.pathname.split('/').pop();
    assert.equal(extracted, t);
    assert.equal(verifyToken(extracted, SECRET, T0 + i).ok, true);
  }
});
