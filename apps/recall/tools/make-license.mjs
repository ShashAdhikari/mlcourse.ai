#!/usr/bin/env node
// Mint a Recall license key. Run offline; never ship the private key.
// Usage: node tools/make-license.mjs keys.json customer@example.com [plan]
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';

const [keysPath, email, plan = 'pro'] = process.argv.slice(2);
if (!keysPath || !email) {
  console.error('usage: node tools/make-license.mjs <keys.json> <email> [plan]');
  process.exit(1);
}

const keys = JSON.parse(readFileSync(keysPath, 'utf8'));
const priv = createPrivateKey(keys.privateKeyPkcs8);

const payload = Buffer.from(JSON.stringify({
  email, plan, iat: Math.floor(Date.now() / 1000),
}));
const sig = sign(null, payload, priv); // Ed25519: algorithm must be null

const b64u = (buf) => Buffer.from(buf).toString('base64url');
console.log(`RECALL-${b64u(payload)}.${b64u(sig)}`);
