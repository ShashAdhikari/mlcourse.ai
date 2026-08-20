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
const html = readFileSync(join(here, '..', 'dist', 'index.html'));

const argIdx = process.argv.indexOf('--license');
const licenseKey = argIdx >= 0
  ? process.argv[argIdx + 1]
  : execFileSync('node', [join(here, '..', 'tools', 'make-license.mjs'),
      join(here, '..', 'keys.demo.json'), 'smoke@test.dev'], { encoding: 'utf8' }).trim();

const server = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined; // let playwright try its own default
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium')).sort().reverse()) {
    for (const bin of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(root, dir, bin);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}
const chromePath = findChromium();

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok' : 'FAIL'} - ${name}`);
  if (!cond) failures += 1;
};

const browser = await chromium.launch({ executablePath: chromePath });
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

await page.goto(url);
await page.waitForSelector('.wordmark');
check('page renders wordmark', (await page.textContent('.wordmark')).includes('Recall'));
check('free tier banner shown', (await screen()).includes('Free tier — 3 of 10 topics'));
check('no stringified booleans leak into the page', !/\bfalse\b|\bundefined\b|\bnull\b/.test(await screen()));

// --- review flow ------------------------------------------------------------
const startBtn = page.locator('button', { hasText: 'Start review' });
check('start button offers 10 cards (newPerDay default)', (await startBtn.textContent()).includes('10 cards'));
await startBtn.click();
await page.waitForSelector('.question');
check('question is rendered in the card', (await page.textContent('.question')).length > 15);

await page.keyboard.press('Space');
await page.waitForSelector('.answer-block');
check('space reveals the answer', await page.locator('.answer-block').isVisible());
check('grade bar has 4 buttons with interval previews',
  await page.locator('.grade').count() === 4 &&
  (await page.textContent('.grade-easy')).includes('4d'));

await page.keyboard.press('4'); // EASY graduates the card out of today's queue
await page.waitForSelector('.qcount');
check('easy removes card from queue (9 left)', (await page.textContent('.qcount')).trim() === '9 left');

await page.keyboard.press('Space');
await page.waitForSelector('.answer-block');
await page.keyboard.press('3'); // GOOD → learning step, re-queued this session
check('good re-queues learning card (still 9 left)', (await page.textContent('.qcount')).trim() === '9 left');

await page.locator('button', { hasText: 'End' }).click();
await page.waitForSelector('.streak-chip:not([hidden])');
check('streak chip appears after first review', (await page.textContent('#streakChip')).includes('1-day streak'));

// --- persistence ------------------------------------------------------------
await page.reload();
await page.waitForSelector('.streak-chip:not([hidden])');
check('progress survives reload', (await page.textContent('#streakChip')).includes('1-day streak'));

// --- license flow -----------------------------------------------------------
await page.locator('[data-nav="settings"]').click();
await page.waitForSelector('input[aria-label="License key"]');
await page.fill('input[aria-label="License key"]', 'RECALL-not.arealkey');
await page.locator('button', { hasText: 'Unlock' }).click();
await page.waitForSelector('.lic-status.err');
check('bad key is rejected with guidance', (await page.textContent('.lic-status.err')).length > 10);

await page.fill('input[aria-label="License key"]', licenseKey);
await page.locator('button', { hasText: 'Unlock' }).click();
await page.waitForSelector('.lic-status.ok');
check('valid key unlocks pro', (await page.textContent('.lic-status.ok')).includes('smoke@test.dev'));

await page.locator('[data-nav="today"]').click();
await page.waitForSelector('.panel');
check('today shows pro state', (await screen()).includes('Pro — all topics unlocked'));
check('no upsell once pro', await page.locator('.upsell').count() === 0);

// pro survives reload too
await page.reload();
await page.waitForSelector('.panel');
check('pro survives reload', (await screen()).includes('Pro — all topics unlocked'));

// --- browse + drill ---------------------------------------------------------
await page.locator('[data-nav="browse"]').click();
await page.waitForSelector('details.topic-acc');
check('browse lists all 10 topics', await page.locator('details.topic-acc').count() === 10);
// Count the badge in the always-visible <summary>; the locked body sits inside
// collapsed <details>, which innerText would not report either way.
check('no pro-lock badges once licensed', await page.locator('.lock').count() === 0);

await page.locator('[data-nav="today"]').click();
await page.locator('button', { hasText: 'Drill 10' }).click();
await page.waitForSelector('.question');
check('drill mode labeled and unscheduled', (await page.textContent('.eyebrow')).includes('Drill'));
await page.keyboard.press('Space');
await page.waitForSelector('.answer-block');
check('drill has Next instead of grades', await page.locator('.grade').count() === 0);

check('zero console/page errors across the run', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));

await browser.close();
server.close();
console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
