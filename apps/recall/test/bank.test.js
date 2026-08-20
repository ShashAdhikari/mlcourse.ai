import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bank = JSON.parse(readFileSync(join(here, '..', 'src', 'bank.json'), 'utf8'));

test('bank has topics and cards', () => {
  assert.ok(Array.isArray(bank.topics) && bank.topics.length >= 8);
  assert.ok(Array.isArray(bank.cards) && bank.cards.length >= 60);
});

test('topic ids are unique, titled, and have a boolean free flag', () => {
  const ids = new Set();
  for (const t of bank.topics) {
    assert.match(t.id, /^[a-z]+$/, t.id);
    assert.ok(!ids.has(t.id), `duplicate topic ${t.id}`);
    ids.add(t.id);
    assert.ok(typeof t.title === 'string' && t.title.length > 3);
    assert.equal(typeof t.free, 'boolean');
  }
});

test('at least 3 free topics so the free tier is a real product', () => {
  assert.ok(bank.topics.filter((t) => t.free).length >= 3);
});

test('every card is well-formed and points at a real topic', () => {
  const topicIds = new Set(bank.topics.map((t) => t.id));
  const cardIds = new Set();
  for (const c of bank.cards) {
    assert.match(c.id, /^[a-z]{3}-\d{2}$/, c.id);
    assert.ok(!cardIds.has(c.id), `duplicate card ${c.id}`);
    cardIds.add(c.id);
    assert.ok(topicIds.has(c.topic), `${c.id}: unknown topic ${c.topic}`);
    assert.ok([1, 2, 3].includes(c.difficulty), `${c.id}: bad difficulty`);
    assert.ok(c.q.trim().length >= 15, `${c.id}: question too short`);
    assert.ok(c.a.trim().length >= 80, `${c.id}: answer too thin`);
    assert.ok(c.why.trim().length >= 80, `${c.id}: explanation too thin`);
    for (const field of ['q', 'a', 'why', 'followup']) {
      if (c[field] !== undefined) assert.equal(typeof c[field], 'string', `${c.id}.${field}`);
    }
  }
});

test('every topic has at least 5 cards and a spread of difficulty', () => {
  const byTopic = {};
  for (const c of bank.cards) (byTopic[c.topic] ??= []).push(c);
  for (const t of bank.topics) {
    const cards = byTopic[t.id] ?? [];
    assert.ok(cards.length >= 5, `${t.id}: only ${cards.length} cards`);
    const diffs = new Set(cards.map((c) => c.difficulty));
    assert.ok(diffs.size >= 2, `${t.id}: no difficulty spread`);
  }
});

test('no accidental duplicate questions', () => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const seen = new Set();
  for (const c of bank.cards) {
    const key = norm(c.q);
    assert.ok(!seen.has(key), `duplicate question: ${c.q}`);
    seen.add(key);
  }
});
