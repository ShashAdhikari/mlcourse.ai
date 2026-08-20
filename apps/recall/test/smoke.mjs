#!/usr/bin/env node
// End-to-end smoke test: drives the built dist/index.html in headless Chromium.
// Usage: node test/smoke.mjs [--license <key>]
// Requires playwright-core resolvable and a Chromium binary; set
// PLAYWRIGHT_CHROMIUM to override the auto-discovered one.
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'dist', 'index.html'));
const keysPath = join(root, 'keys.demo.json');
const mint = (email, decks) => execFileSync('node',
  [join(root, 'tools', 'make-license.mjs'), keysPath, email, decks],
  { encoding: 'utf8' }).trim();

const argIdx = process.argv.indexOf('--license');
const licenseKey = argIdx >= 0 ? process.argv[argIdx + 1] : mint('smoke@test.dev', '*');
const singleDeckKey = mint('one@test.dev', 'physics');

const DECK_COUNT = readdirSync(join(root, 'src', 'decks')).filter((f) => f.endsWith('.json')).length;

const server = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(dir)) return undefined; // let playwright try its own default
  for (const d of readdirSync(dir).filter((x) => x.startsWith('chromium')).sort().reverse()) {
    for (const bin of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(dir, d, bin);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok' : 'FAIL'} - ${name}`);
  if (!cond) failures += 1;
};

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('console', (m) => {
  // Google Fonts is unreachable in the sandbox; that is the environment, not the
  // app — and the CSS declares real fallback stacks for exactly this case.
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
    errors.push(`console: ${m.text()}`);
  }
});

// Rendered text only. textContent('body') would also return the inlined
// <script> source and match on the app's own string literals.
const screen = () => page.innerText('.wrap');
const unlock = async (key) => {
  await page.locator('[data-nav="settings"]').click();
  await page.waitForSelector('input[aria-label="License key"]');
  await page.fill('input[aria-label="License key"]', key);
  await page.locator('button', { hasText: 'Unlock' }).click();
  await page.waitForSelector('.lic-status.ok');
};

await page.goto(url);
await page.waitForSelector('.wordmark');
check('page renders wordmark', (await page.textContent('.wordmark')).includes('Recall'));
check('no stringified booleans leak into the page',
  !/\bfalse\b|\bundefined\b|\bnull\b/.test(await screen()));

// --- deck grid ---------------------------------------------------------------
check(`deck grid shows all ${DECK_COUNT} decks`, await page.locator('.deck').count() === DECK_COUNT);
check('free tier is advertised', (await screen()).includes('Free tier'));
const lockedBefore = await page.locator('.deck .lock').count();
check('every deck is partly locked before licensing', lockedBefore === DECK_COUNT);

// --- review flow -------------------------------------------------------------
const startBtn = page.locator('button', { hasText: 'Start review' });
check('start button offers the daily new-card budget', (await startBtn.textContent()).includes('10 cards'));
await startBtn.click();
await page.waitForSelector('.question');
check('card shows deck and topic',
  / · /.test(await page.textContent('.card-topic .eyebrow')));
check('question is rendered', (await page.textContent('.question')).length > 15);

await page.keyboard.press('Space');
await page.waitForSelector('.answer-block');
check('space reveals the answer', await page.locator('.answer-block').isVisible());
check('answer block has answer, intuition and follow-up',
  await page.locator('.answer-sec').count() === 3);
check('grade bar previews intervals',
  await page.locator('.grade').count() === 4 &&
  (await page.textContent('.grade-easy')).includes('4d'));

await page.keyboard.press('4'); // EASY graduates the card out of today's queue
await page.waitForSelector('.qcount');
check('easy removes card from queue (9 left)', (await page.textContent('.qcount')).trim() === '9 left');

await page.keyboard.press('Space');
await page.waitForSelector('.answer-block');
await page.keyboard.press('3'); // GOOD → learning step, re-queued this session
check('good re-queues learning card (still 9 left)', (await page.textContent('.qcount')).trim() === '9 left');

// Sessions interleave decks rather than blocking one subject.
const seenDecks = new Set();
for (let i = 0; i < 6; i++) {
  seenDecks.add((await page.textContent('.card-topic .eyebrow')).split('·')[0].trim());
  await page.keyboard.press('Space');
  await page.waitForSelector('.answer-block');
  await page.keyboard.press('3');
  await page.waitForSelector('.question');
}
check('a session draws from multiple decks', seenDecks.size >= 2);

await page.locator('button', { hasText: 'End' }).click();
await page.waitForSelector('.streak-chip:not([hidden])');
check('streak chip appears after reviewing', (await page.textContent('#streakChip')).includes('1-day streak'));

// --- persistence -------------------------------------------------------------
await page.reload();
await page.waitForSelector('.streak-chip:not([hidden])');
check('progress survives reload', (await page.textContent('#streakChip')).includes('1-day streak'));

// --- pausing a deck ----------------------------------------------------------
await page.locator('[data-nav="today"]').click();
await page.waitForSelector('.deck');
await page.locator('.deck').first().click();
await page.waitForSelector('.deck[data-state="off"]');
check('clicking a deck pauses it', await page.locator('.deck[data-state="off"]').count() === 1);
await page.locator('.deck').first().click();
check('clicking again resumes it', await page.locator('.deck[data-state="off"]').count() === 0);

// --- license: rejection ------------------------------------------------------
await page.locator('[data-nav="settings"]').click();
await page.waitForSelector('input[aria-label="License key"]');
await page.fill('input[aria-label="License key"]', 'RECALL-not.arealkey');
await page.locator('button', { hasText: 'Unlock' }).click();
await page.waitForSelector('.lic-status.err');
check('bad key is rejected with guidance', (await page.textContent('.lic-status.err')).length > 10);

// --- license: single-deck entitlement ----------------------------------------
await page.fill('input[aria-label="License key"]', singleDeckKey);
await page.locator('button', { hasText: 'Unlock' }).click();
await page.waitForSelector('.lic-status.ok');
const singleStatus = await page.textContent('.lic-status.ok');
check('single-deck key names its licensee', singleStatus.includes('one@test.dev'));
check('single-deck key unlocks only that deck', singleStatus.includes('Physics') && !singleStatus.includes('All '));
await page.locator('[data-nav="today"]').click();
await page.waitForSelector('.deck');
check('exactly one deck loses its lock badge',
  await page.locator('.deck .lock').count() === DECK_COUNT - 1);

// --- license: all-access -----------------------------------------------------
await page.locator('[data-nav="settings"]').click();
await page.waitForSelector('button:has-text("Remove key")');
await page.locator('button', { hasText: 'Remove key' }).click();
await page.waitForSelector('input[aria-label="License key"]');
await unlock(licenseKey);
check('all-access key reports every deck unlocked',
  (await page.textContent('.lic-status.ok')).includes(`All ${DECK_COUNT} decks`));

await page.locator('[data-nav="today"]').click();
await page.waitForSelector('.deck');
check('no lock badges once fully licensed', await page.locator('.deck .lock').count() === 0);
check('no upsell once licensed', await page.locator('.upsell').count() === 0);
check('all decks unlocked message shown', (await screen()).includes(`All ${DECK_COUNT} decks unlocked`));

await page.reload();
await page.waitForSelector('.deck');
check('license survives reload', await page.locator('.deck .lock').count() === 0);

// --- browse ------------------------------------------------------------------
await page.locator('[data-nav="browse"]').click();
await page.waitForSelector('details.topic-acc');
check('browse offers every deck in the picker',
  await page.locator('select[aria-label="Choose a deck"] option').count() === DECK_COUNT);
await page.selectOption('select[aria-label="Choose a deck"]', 'philosophy');
await page.waitForSelector('details.topic-acc');
check('switching decks changes the topic list',
  (await screen()).includes('Epistemology'));
check('no locked topics as full licensee', await page.locator('.lock').count() === 0);
await page.locator('details.topic-acc summary').first().click();
check('expanding a topic reveals its questions',
  (await page.locator('.browse-q').count()) >= 5);

// --- drill -------------------------------------------------------------------
await page.locator('[data-nav="today"]').click();
await page.locator('button', { hasText: 'Drill 10' }).click();
await page.waitForSelector('.question');
check('drill mode labeled and unscheduled',
  (await page.textContent('.review-meta .eyebrow')).includes('Drill'));
await page.keyboard.press('Space');
await page.waitForSelector('.answer-block');
check('drill has Next instead of grades', await page.locator('.grade').count() === 0);

// --- v1 → v2 migration -------------------------------------------------------
// A user who studied the machine-learning-only release must keep their history.
const migration = await page.evaluate(async () => {
  localStorage.clear();
  localStorage.setItem('recall.v1', JSON.stringify({
    states: { 'fnd-01': { status: 'review', step: 0, intervalDays: 30, ease: 2.5,
                          due: Date.now() + 6e8, reps: 4, lapses: 0, lastGraded: Date.now() } },
    day: { date: null, introduced: 0, reviews: 0 },
    streak: { last: null, count: 7 }, licenseKey: null,
    settings: { newPerDay: 10 }, totals: { reviews: 42 },
  }));
  return true;
});
check('v1 fixture written', migration === true);
await page.reload();
await page.waitForSelector('.deck');
const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('recall.v2')));
check('v1 card ids are namespaced to their deck', 'ml:fnd-01' in (migrated?.states ?? {}));
check('migrated card keeps its interval', migrated.states['ml:fnd-01'].intervalDays === 30);
check('migrated streak and totals are preserved',
  migrated.streak.count === 7 && migrated.totals.reviews === 42);
check('migrated streak shows in the UI', (await page.textContent('#streakChip')).includes('7-day streak'));

check('zero console/page errors across the run', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));

await browser.close();
server.close();
console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
