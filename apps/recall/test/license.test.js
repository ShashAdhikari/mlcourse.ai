import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLicense, verifyLicense, entitledDecks, unlocksDeck } from '../src/license.js';

const here = dirname(fileURLToPath(import.meta.url));
const tools = join(here, '..', 'tools');

// Real end-to-end: generate a keypair and mint a key with the actual CLI tools.
const keysJson = execFileSync('node', [join(tools, 'keygen.mjs')], { encoding: 'utf8' });
const keys = JSON.parse(keysJson);
const tmp = mkdtempSync(join(tmpdir(), 'recall-'));
const keysPath = join(tmp, 'keys.json');
writeFileSync(keysPath, keysJson);
const key = execFileSync('node',
  [join(tools, 'make-license.mjs'), keysPath, 'ada@example.com'],
  { encoding: 'utf8' }).trim();

test('minted key parses and carries claims', () => {
  const parsed = parseLicense(key);
  assert.ok(parsed);
  assert.equal(parsed.claims.email, 'ada@example.com');
  assert.deepEqual(parsed.claims.decks, ['*']); // defaults to all-access
  assert.ok(parsed.claims.iat > 1_700_000_000);
});

test('minted key verifies against its public key', async () => {
  const res = await verifyLicense(key, keys.publicKey);
  assert.equal(res.ok, true);
  assert.equal(res.claims.email, 'ada@example.com');
});

test('whitespace around the key is tolerated', async () => {
  const res = await verifyLicense(`  ${key}\n`, keys.publicKey);
  assert.equal(res.ok, true);
});

test('tampered payload is rejected', async () => {
  const [, payload, sig] = key.match(/^RECALL-([^.]+)\.([^.]+)$/);
  const evil = Buffer.from(JSON.stringify({ email: 'ada@example.com', plan: 'lifetime', iat: 1 }))
    .toString('base64url');
  const res = await verifyLicense(`RECALL-${evil}.${sig}`, keys.publicKey);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'bad-signature');
});

test('signature from a different keypair is rejected', async () => {
  const otherKeys = JSON.parse(execFileSync('node', [join(tools, 'keygen.mjs')], { encoding: 'utf8' }));
  const res = await verifyLicense(key, otherKeys.publicKey);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'bad-signature');
});

test('garbage inputs are rejected as malformed, never thrown', async () => {
  for (const junk of ['', 'RECALL', 'RECALL-x', 'RECALL-!!-??', 'PREFIX-a-b', null, 42, key.slice(0, -10) + '-' + 'AA']) {
    const res = await verifyLicense(junk, keys.publicKey);
    assert.equal(res.ok, false, String(junk));
  }
});

test('short signature rejected before hitting crypto', async () => {
  const payload = Buffer.from('{}').toString('base64url');
  const res = await verifyLicense(`RECALL-${payload}.QUJD`, keys.publicKey);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'malformed');
});

// ---------------------------------------------------------------------------
// per-deck entitlements
// ---------------------------------------------------------------------------

const mint = (email, decks) => execFileSync('node',
  [join(tools, 'make-license.mjs'), keysPath, email, decks],
  { encoding: 'utf8' }).trim();

test('an all-access key unlocks every deck', async () => {
  const res = await verifyLicense(mint('all@example.com', '*'), keys.publicKey);
  assert.equal(res.ok, true);
  assert.equal(entitledDecks(res.claims).all, true);
  for (const deck of ['ml', 'physics', 'logic', 'anything']) {
    assert.equal(unlocksDeck(res.claims, deck), true, deck);
  }
});

test('a single-deck key unlocks only that deck', async () => {
  const res = await verifyLicense(mint('one@example.com', 'physics'), keys.publicKey);
  assert.equal(res.ok, true);
  assert.equal(entitledDecks(res.claims).all, false);
  assert.equal(unlocksDeck(res.claims, 'physics'), true);
  assert.equal(unlocksDeck(res.claims, 'ml'), false);
});

test('a multi-deck key unlocks exactly the listed decks', async () => {
  const res = await verifyLicense(mint('two@example.com', 'ml,logic'), keys.publicKey);
  assert.equal(res.ok, true);
  assert.equal(unlocksDeck(res.claims, 'ml'), true);
  assert.equal(unlocksDeck(res.claims, 'logic'), true);
  assert.equal(unlocksDeck(res.claims, 'finance'), false);
});

test('v1 keys (plan:pro, no deck list) still unlock everything', () => {
  // A key sold before per-deck entitlements existed must keep working.
  const v1Claims = { email: 'early@example.com', plan: 'pro', iat: 1700000000 };
  assert.equal(entitledDecks(v1Claims).all, true);
  assert.equal(unlocksDeck(v1Claims, 'gametheory'), true);
});

test('entitlements are rejected safely for junk claims', () => {
  for (const junk of [null, undefined, 'string', 42, {}, { decks: 'ml' }, { decks: [1, 2] }]) {
    const e = entitledDecks(junk);
    assert.equal(e.all, false, String(junk));
    assert.equal(e.decks.size, 0, String(junk));
  }
});

test('plan:pro alongside an explicit deck list does not grant all access', () => {
  // Guards against a forged-looking claim smuggling the v1 escape hatch.
  const claims = { email: 'x@example.com', plan: 'pro', decks: ['ml'] };
  assert.equal(entitledDecks(claims).all, false);
  assert.equal(unlocksDeck(claims, 'ml'), true);
  assert.equal(unlocksDeck(claims, 'physics'), false);
});
