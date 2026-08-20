#!/usr/bin/env node
// Mint a Recall license key. Run offline; never ship the private key.
//
//   node tools/make-license.mjs keys.json buyer@example.com            # all decks
//   node tools/make-license.mjs keys.json buyer@example.com ml,logic   # those decks only
//
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';

const [keysPath, email, decksArg = '*'] = process.argv.slice(2);
if (!keysPath || !email) {
  console.error('usage: node tools/make-license.mjs <keys.json> <email> [deckIds|*]');
  process.exit(1);
}

const decks = decksArg.split(',').map((s) => s.trim()).filter(Boolean);
if (!decks.length) {
  console.error('no decks specified');
  process.exit(1);
}

const keys = JSON.parse(readFileSync(keysPath, 'utf8'));
const priv = createPrivateKey(keys.privateKeyPkcs8);

const payload = Buffer.from(JSON.stringify({
  email, decks, iat: Math.floor(Date.now() / 1000),
}));
const sig = sign(null, payload, priv); // Ed25519: algorithm must be null

const b64u = (buf) => Buffer.from(buf).toString('base64url');
console.log(`RECALL-${b64u(payload)}.${b64u(sig)}`);
