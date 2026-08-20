import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const deckDir = join(here, '..', 'src', 'decks');
const files = readdirSync(deckDir).filter((f) => f.endsWith('.json')).sort();
const decks = files.map((f) => JSON.parse(readFileSync(join(deckDir, f), 'utf8')));
const allCards = decks.flatMap((d) => d.cards.map((c) => ({ ...c, deck: d.id })));

// The deck set is the product. These thresholds are the contract that keeps a
// thin card from reaching a paying user.
const MIN_TOPICS_PER_DECK = 5;
const MIN_CARDS_PER_TOPIC = 5;
const MIN_ANSWER = 120;
const MIN_WHY = 150;
const MIN_FOLLOWUP = 40;

test('every deck file declares required metadata', () => {
  for (const d of decks) {
    assert.match(d.id, /^[a-z]+$/, `${d.id}: id must be lowercase letters`);
    assert.ok(d.title && d.title.length >= 4, `${d.id}: needs a title`);
    assert.ok(d.blurb && d.blurb.length >= 40, `${d.id}: blurb too thin to sell the deck`);
    assert.ok(Array.isArray(d.topics) && Array.isArray(d.cards), `${d.id}: shape`);
  }
});

test('deck ids are unique and match their filenames', () => {
  const seen = new Set();
  decks.forEach((d, i) => {
    assert.ok(!seen.has(d.id), `duplicate deck id ${d.id}`);
    seen.add(d.id);
    assert.equal(`${d.id}.json`, files[i], `${d.id}: filename should match deck id`);
  });
});

test('the library covers the promised subjects', () => {
  const ids = new Set(decks.map((d) => d.id));
  for (const want of ['ml', 'probability', 'math', 'physics', 'philosophy',
                      'finance', 'microeconomics', 'gametheory', 'logic']) {
    assert.ok(ids.has(want), `missing deck: ${want}`);
  }
});

test('every deck has enough topics, each with enough cards', () => {
  for (const d of decks) {
    assert.ok(d.topics.length >= MIN_TOPICS_PER_DECK,
      `${d.id}: only ${d.topics.length} topics`);
    const byTopic = {};
    for (const c of d.cards) (byTopic[c.topic] ??= []).push(c);
    for (const t of d.topics) {
      const n = (byTopic[t.id] ?? []).length;
      assert.ok(n >= MIN_CARDS_PER_TOPIC, `${d.id}/${t.id}: only ${n} cards`);
    }
  }
});

test('topic ids are unique within a deck and every card points at a real topic', () => {
  for (const d of decks) {
    const ids = new Set();
    for (const t of d.topics) {
      assert.match(t.id, /^[a-z]+$/, `${d.id}/${t.id}`);
      assert.ok(!ids.has(t.id), `${d.id}: duplicate topic ${t.id}`);
      ids.add(t.id);
      assert.ok(t.title && t.title.length >= 3, `${d.id}/${t.id}: needs a title`);
      assert.equal(typeof t.free, 'boolean', `${d.id}/${t.id}: free must be boolean`);
    }
    for (const c of d.cards) {
      assert.ok(ids.has(c.topic), `${d.id}/${c.id}: unknown topic ${c.topic}`);
    }
  }
});

test('exactly the first two topics of every deck are free', () => {
  for (const d of decks) {
    const free = d.topics.map((t) => t.free);
    assert.deepEqual(free.slice(0, 2), [true, true], `${d.id}: first two topics must be free`);
    assert.ok(free.slice(2).every((f) => f === false), `${d.id}: only the first two may be free`);
  }
});

test('card ids are unique within their deck and correctly formatted', () => {
  for (const d of decks) {
    const seen = new Set();
    for (const c of d.cards) {
      assert.match(c.id, /^[a-z]{3}-\d{2}$/, `${d.id}/${c.id}: bad id format`);
      assert.ok(!seen.has(c.id), `${d.id}: duplicate card id ${c.id}`);
      seen.add(c.id);
    }
  }
});

test('every card carries substantive question, answer, intuition, and follow-up', () => {
  for (const c of allCards) {
    const at = `${c.deck}/${c.id}`;
    assert.ok([1, 2, 3].includes(c.difficulty), `${at}: difficulty must be 1-3`);
    assert.ok(c.q.trim().length >= 15, `${at}: question too short`);
    // Either a literal question, or an imperative prompt ("...Name three reasons.")
    // — the imperative may follow a scenario rather than open the card.
    assert.ok(/\?/.test(c.q) || /\b(explain|describe|state|compare|define|name|walk|design|contrast|rank|interpret|derive|distinguish|prove|sketch|evaluate|give|list|show|map|resolve|justify|argue|reconcile|outline|decompose|identify|assess)\b/i.test(c.q),
      `${at}: question should ask something`);
    assert.ok(c.a.trim().length >= MIN_ANSWER, `${at}: answer too thin (${c.a.trim().length})`);
    assert.ok(c.why.trim().length >= MIN_WHY, `${at}: intuition too thin (${c.why.trim().length})`);
    assert.ok(c.followup && c.followup.trim().length >= MIN_FOLLOWUP,
      `${at}: follow-up missing or too thin`);
  }
});

test('the intuition adds to the answer rather than restating it', () => {
  for (const c of allCards) {
    const at = `${c.deck}/${c.id}`;
    assert.notEqual(c.a.trim(), c.why.trim(), `${at}: intuition duplicates answer`);
    // Longest shared verbatim run: a long one means copy-paste, not elaboration.
    const a = c.a.trim();
    let longest = 0;
    for (let i = 0; i < a.length; i += 1) {
      for (let len = longest + 1; i + len <= a.length; len += 1) {
        if (c.why.includes(a.slice(i, i + len))) longest = len; else break;
      }
    }
    assert.ok(longest < 120, `${at}: ${longest} chars copied verbatim from answer into intuition`);
  }
});

test('no placeholder or unfinished text anywhere in the library', () => {
  const banned = /\b(TODO|TBD|FIXME|lorem ipsum|placeholder|XXX|\.\.\.\s*$)/i;
  for (const c of allCards) {
    for (const field of ['q', 'a', 'why', 'followup']) {
      assert.ok(!banned.test(c[field]), `${c.deck}/${c.id}.${field}: placeholder text`);
    }
  }
});

test('no duplicate questions within or across decks', () => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const seen = new Map();
  for (const c of allCards) {
    const key = norm(c.q);
    assert.ok(!seen.has(key), `${c.deck}/${c.id} duplicates ${seen.get(key)}: "${c.q}"`);
    seen.set(key, `${c.deck}/${c.id}`);
  }
});

test('no duplicate answers across the library', () => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 200);
  const seen = new Map();
  for (const c of allCards) {
    const key = norm(c.a);
    assert.ok(!seen.has(key), `${c.deck}/${c.id} answer duplicates ${seen.get(key)}`);
    seen.set(key, `${c.deck}/${c.id}`);
  }
});

test('every deck spans a range of difficulty', () => {
  for (const d of decks) {
    const diffs = new Set(d.cards.map((c) => c.difficulty));
    assert.ok(diffs.size >= 3, `${d.id}: uses only difficulties ${[...diffs]}`);
    // A deck that is all-hard or all-easy is mis-calibrated for study.
    const avg = d.cards.reduce((s, c) => s + c.difficulty, 0) / d.cards.length;
    assert.ok(avg > 1.2 && avg < 2.8, `${d.id}: mean difficulty ${avg.toFixed(2)} is lopsided`);
  }
});

test('typographic quality: no straight double quotes or unbalanced curly quotes', () => {
  for (const c of allCards) {
    for (const field of ['q', 'a', 'why', 'followup']) {
      const text = c[field];
      assert.ok(!text.includes('"'), `${c.deck}/${c.id}.${field}: straight double quote`);
      const opens = (text.match(/“/g) ?? []).length;
      const closes = (text.match(/”/g) ?? []).length;
      assert.equal(opens, closes, `${c.deck}/${c.id}.${field}: unbalanced curly quotes`);
    }
  }
});

test('the free tier is a real sampler across every subject', () => {
  let freeCards = 0;
  for (const d of decks) {
    const freeTopics = new Set(d.topics.filter((t) => t.free).map((t) => t.id));
    const n = d.cards.filter((c) => freeTopics.has(c.topic)).length;
    assert.ok(n >= 10, `${d.id}: only ${n} free cards — too thin to judge the deck`);
    freeCards += n;
  }
  assert.ok(freeCards >= 90, `free tier has only ${freeCards} cards`);
});

test('library is large enough to be worth paying for', () => {
  assert.ok(decks.length >= 9, `only ${decks.length} decks`);
  assert.ok(allCards.length >= 280, `only ${allCards.length} cards in the library`);
});
