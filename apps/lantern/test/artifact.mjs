#!/usr/bin/env node
// Drive the published artifact in a real browser.
//
// The page inlines the actual escalation engine, so this checks something
// stronger than "the layout renders": that scrubbing the timeline produces the
// same escalation the service would, and that the guarantees the page claims
// are visibly true in it.
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'dist', 'artifact.html'), 'utf8');
// Serve it the way the artifact host does: wrapped in a document skeleton.
const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;

const server = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(doc);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

function findChromium() {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
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
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
});

await page.goto(url);
await page.waitForSelector('#roster .who');

const setScrub = async (minutes) => {
  await page.$eval('#scrub', (elm, v) => {
    elm.value = String(v);
    elm.dispatchEvent(new Event('input', { bubbles: true }));
  }, minutes);
  await page.waitForTimeout(30);
};
const phase = () => page.textContent('#phase');
const rosterState = (name) => page.evaluate((n) => {
  const row = [...document.querySelectorAll('#roster .who')]
    .find((r) => r.querySelector('.name').textContent.includes(n));
  if (!row) throw new Error(`no roster row for ${n}`);
  return { s: row.dataset.s, text: row.querySelector('.state').textContent };
}, name);

// --- at the deadline --------------------------------------------------------
check('page renders the wordmark and headline', (await page.textContent('h1')).includes('stop answering'));
check('four people are listed', await page.locator('#roster .who').count() === 4);
await setScrub(0);
check('at the deadline the watch is already overdue', (await phase()).trim() === 'due');
check('no contact is alerted at the deadline',
  (await rosterState('Bea')).s === 'waiting'
  && (await rosterState('Mrs Patel')).s === 'waiting');

// --- inside the grace window ------------------------------------------------
await setScrub(120);
check('two hours in, only Ada has been nudged', (await rosterState('Ada')).s === 'nudged');
check('two hours in, still nobody else is told',
  (await rosterState('Bea')).s === 'waiting');
check('the message shown is addressed to Ada', (await page.textContent('#wireHead')).includes('To Ada'));
check('the nudge tells Ada who is contacted next',
  (await page.textContent('#wire')).includes('Bea'));

// --- escalation -------------------------------------------------------------
await setScrub(180);
check('tier 1 fires exactly when grace ends', (await rosterState('Bea')).s === 'alerted');
check('tier 2 is not yet involved', (await rosterState('Mrs Patel')).s === 'waiting');
check('phase is escalating', (await phase()).trim() === 'escalating');
const beaMsg = await page.textContent('#wire');
check("Bea's message carries her instruction", beaMsg.includes('Try the landline first'));
check("Bea's message carries Ada's note", beaMsg.includes('Mrs Patel at number 12'));
check("Bea's message offers a way to stop the alarm", beaMsg.includes('/a/resolve/'));
check('the alert states it is not a medical alarm', beaMsg.includes('not a medical alarm'));

await setScrub(240);
check('tier 2 fires an hour later', (await rosterState('Mrs Patel')).s === 'alerted');
await setScrub(300);
check('tier 3 fires an hour after that', (await rosterState('Charles')).s === 'alerted');
check('phase becomes alerted once every tier is told', (await phase()).trim() === 'alerted');

// --- checking in mid-alarm --------------------------------------------------
await page.click('#checkin');
await page.waitForTimeout(40);
check('checking in returns the watch to ok', (await phase()).trim() === 'ok');
for (const name of ['Bea', 'Mrs Patel', 'Charles']) {
  const row = await rosterState(name);
  check(`${name} is told the all-clear`, row.s === 'cleared');
}
check('the all-clear message is shown', (await page.textContent('#wireHead')).includes('All-clear'));
check('the all-clear says she is fine', (await page.textContent('#wire')).includes('has checked in and is fine'));

// --- nobody gets an all-clear they were never alarmed about -----------------
await page.click('#reset');
await setScrub(200);                       // only tier 1 has been told
await page.click('#checkin');
await page.waitForTimeout(40);
check('only tier 1 is stood down when only tier 1 was told',
  (await rosterState('Bea')).s === 'cleared'
  && (await rosterState('Mrs Patel')).s === 'waiting'
  && (await rosterState('Charles')).s === 'waiting');

// --- the ladder responds to configuration -----------------------------------
await page.click('#reset');
await page.selectOption('#grace', '60');
await page.waitForTimeout(40);
await setScrub(70);
check('a shorter grace window escalates sooner',
  (await rosterState('Bea')).s === 'alerted');
await page.selectOption('#grace', '360');
await page.waitForTimeout(40);
await setScrub(200);
check('a longer grace window holds contacts back',
  (await rosterState('Bea')).s === 'waiting');
check('and Ada is still being nudged instead', (await rosterState('Ada')).s === 'nudged');

// --- both themes are readable ----------------------------------------------
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1000, height: 900 } });
  const p2 = await ctx.newPage();
  await p2.goto(url);
  await p2.waitForSelector('#roster .who');
  const [bg, fg] = await p2.evaluate(() => {
    const s = getComputedStyle(document.body);
    return [s.backgroundColor, s.color];
  });
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+/g).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (Math.max(lum(bg), lum(fg)) + 0.05) / (Math.min(lum(bg), lum(fg)) + 0.05);
  check(`${scheme} theme: body background is painted, not transparent`,
    !/rgba\(0, 0, 0, 0\)/.test(bg));
  check(`${scheme} theme: body text contrast is at least 7:1 (got ${ratio.toFixed(1)})`, ratio >= 7);
  await ctx.close();
}

// --- no horizontal overflow on a phone --------------------------------------
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p3 = await mobile.newPage();
await p3.goto(url);
await p3.waitForSelector('#roster .who');
const overflows = await p3.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
check('no horizontal scrolling at 390px wide', !overflows);
await mobile.close();

check('no console or page errors', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));

await browser.close();
server.close();
console.log(failures === 0 ? '\nARTIFACT PASS' : `\nARTIFACT FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
