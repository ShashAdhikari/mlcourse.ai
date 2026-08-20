#!/usr/bin/env node
// Generate an Ed25519 keypair for Recall licensing.
// Usage: node tools/keygen.mjs > keys.json   (keep keys.json PRIVATE)
// The "publicKey" value is what gets embedded in the app build.
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const b64u = (buf) => Buffer.from(buf).toString('base64url');

console.log(JSON.stringify({
  publicKey: b64u(rawPub),
  privateKeyPkcs8: privateKey.export({ type: 'pkcs8', format: 'pem' }),
}, null, 2));
