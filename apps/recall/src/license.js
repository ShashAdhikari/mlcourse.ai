// Recall — offline license verification.
//
// Key format:  RECALL-<payloadB64url>.<sigB64url>
//   ('.' separates payload from signature because '.' is not in the
//   base64url alphabet — '-' is, which would make the split ambiguous.)
//   payload = UTF-8 JSON {email, decks, iat}  (iat = unix seconds issued-at)
//     decks = ['*'] for all-access, or a list of deck ids for a single-deck buy
//   sig     = Ed25519 signature over the raw payload bytes
//
// v1 keys carried {email, plan:'pro'} with no deck list. Those were sold as
// all-access, so entitledDecks() still grants everything for them — a key a
// customer paid for must never stop working because the format moved on.
//
// Keys are minted offline with tools/make-license.mjs (private key never
// ships). The app embeds only the public key and verifies with WebCrypto,
// which node >= 19 and all evergreen browsers support. Like any client-side
// gate this is honesty-ware, not DRM — the point is a frictionless "paste
// your key" unlock for paying users.

const b64uToBytes = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const bytesToB64u = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * What a set of verified claims unlocks.
 * @returns {{all: boolean, decks: Set<string>}}
 */
export function entitledDecks(claims) {
  if (!claims || typeof claims !== 'object') return { all: false, decks: new Set() };
  if (claims.plan === 'pro' && claims.decks === undefined) return { all: true, decks: new Set() }; // v1 key
  const list = Array.isArray(claims.decks) ? claims.decks.filter((d) => typeof d === 'string') : [];
  if (list.includes('*')) return { all: true, decks: new Set() };
  return { all: false, decks: new Set(list) };
}

/** Does a verified claim set unlock this deck? */
export function unlocksDeck(claims, deckId) {
  const e = entitledDecks(claims);
  return e.all || e.decks.has(deckId);
}

/** Parse without verifying. Returns {payloadBytes, sigBytes, claims} or null. */
export function parseLicense(key) {
  if (typeof key !== 'string') return null;
  const m = key.trim().match(/^RECALL-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const payloadBytes = b64uToBytes(m[1]);
    const sigBytes = b64uToBytes(m[2]);
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!claims || typeof claims !== 'object') return null;
    return { payloadBytes, sigBytes, claims };
  } catch {
    return null;
  }
}

/**
 * Verify a license key against a raw 32-byte Ed25519 public key (b64url).
 * @returns {Promise<{ok: true, claims: object} | {ok: false, reason: string}>}
 */
export async function verifyLicense(key, publicKeyB64u, cryptoImpl = globalThis.crypto) {
  const parsed = parseLicense(key);
  if (!parsed) return { ok: false, reason: 'malformed' };
  if (parsed.sigBytes.length !== 64) return { ok: false, reason: 'malformed' };
  try {
    const pub = await cryptoImpl.subtle.importKey(
      'raw', b64uToBytes(publicKeyB64u), { name: 'Ed25519' }, false, ['verify']);
    const valid = await cryptoImpl.subtle.verify(
      { name: 'Ed25519' }, pub, parsed.sigBytes, parsed.payloadBytes);
    if (!valid) return { ok: false, reason: 'bad-signature' };
    return { ok: true, claims: parsed.claims };
  } catch {
    return { ok: false, reason: 'verify-error' };
  }
}
