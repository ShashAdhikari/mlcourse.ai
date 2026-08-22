#!/usr/bin/env node
// Lantern — command line.
//
//   lantern init [dir]              write a starter config and a signing secret
//   lantern serve [--config f]      run the watcher and the web server
//   lantern add <watch.json>        add or replace a watch
//   lantern test <id>               send the verification messages
//   lantern verify <id>             record that the test messages arrived
//   lantern arm <id> | disarm <id>  start or stop protecting someone
//   lantern status                  print a health summary
//   lantern preview <watch.json>    show the escalation ladder in plain English
//
// Arming deliberately requires `test` then `verify` first. A watch that has
// never proven it can reach anyone is not protecting anyone.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Store } from '../src/store.js';
import { Channels, consoleChannel, fileChannel, webhookChannel, emailChannel, smsChannel } from '../src/channels.js';
import { Scheduler } from '../src/scheduler.js';
import { createApp } from '../src/server.js';
import { normalizeConfig, describeLadder } from '../src/model.js';
import { initState, summarize } from '../src/machine.js';
import { generateSecret } from '../src/tokens.js';
import { humanDuration } from '../src/time.js';

const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const die = (msg) => { console.error(`lantern: ${msg}`); process.exit(1); };

const CONFIG_NAME = 'lantern.config.json';

function loadConfig() {
  const path = resolve(flag('config', CONFIG_NAME));
  if (!existsSync(path)) die(`no config at ${path} — run "lantern init" first`);
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  for (const key of ['secret', 'adminToken', 'baseUrl', 'database']) {
    if (!cfg[key]) die(`config is missing "${key}"`);
  }
  return cfg;
}

/** Build the channel registry from the config file. */
function buildChannels(cfg) {
  const channels = new Channels();
  const defs = cfg.channels ?? {};
  channels.set('console', consoleChannel());
  if (defs.file) channels.set('file', fileChannel(defs.file.path));
  if (defs.webhook) channels.set('webhook', webhookChannel(defs.webhook));
  if (defs.email) channels.set('email', emailChannel(defs.email));
  if (defs.sms) channels.set('sms', smsChannel(defs.sms));
  return channels;
}

function open(cfg) {
  const store = new Store(resolve(cfg.database));
  const channels = buildChannels(cfg);
  const scheduler = new Scheduler({
    store, channels, secret: cfg.secret, baseUrl: cfg.baseUrl,
    ops: cfg.ops ?? null, options: cfg.scheduler ?? {},
  });
  return { store, channels, scheduler };
}

// --- commands ---------------------------------------------------------------

async function cmdInit() {
  const dir = resolve(argv[1] ?? '.');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, CONFIG_NAME);
  if (existsSync(path)) die(`${path} already exists — refusing to overwrite a live secret`);

  const config = {
    baseUrl: 'http://localhost:8787',
    port: 8787,
    database: join(dir, 'lantern.db'),
    secret: generateSecret(),
    adminToken: generateSecret(),
    // Where system faults go. Point this somewhere you actually read.
    ops: { channel: 'console', address: 'operator' },
    channels: {
      file: { path: join(dir, 'outbox.jsonl') },
      // email: { host: 'smtp.example.com', port: 587, user: '…', pass: '…',
      //          from: 'Lantern <lantern@example.com>' },
      // sms:   { url: 'https://api.example.com/messages',
      //          headers: { authorization: 'Bearer …' } },
    },
  };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  const example = {
    id: 'example',
    name: 'Ada Lovelace',
    timezone: 'Europe/London',
    intervalHours: 24,
    quietHours: { startHour: 22, endHour: 8 },
    graceMinutes: 180,
    nudgeEveryMinutes: 45,
    tierWaitMinutes: [60, 120],
    note: 'Spare key is with Mrs Patel at number 12.',
    self: { channel: 'file', address: 'ada@example.com' },
    contacts: [
      { id: 'daughter', name: 'Bea', channel: 'file', address: 'bea@example.com', tier: 1,
        instruction: 'Try the landline first — she often misses her mobile.' },
      { id: 'neighbour', name: 'Mrs Patel', channel: 'file', address: 'patel@example.com', tier: 2,
        instruction: 'You have the spare key.' },
    ],
  };
  const examplePath = join(dir, 'watch.example.json');
  writeFileSync(examplePath, `${JSON.stringify(example, null, 2)}\n`);

  console.log(`Wrote ${path} (mode 600) and ${examplePath}`);
  console.log('\nThe secret in that file signs every check-in link. Keep it private,');
  console.log('and back it up: replacing it invalidates links already sent.\n');
  console.log('Next:');
  console.log(`  lantern preview ${examplePath}   # read the ladder back in English`);
  console.log(`  lantern add ${examplePath}`);
  console.log('  lantern test example             # sends the verification messages');
  console.log('  lantern verify example           # confirm they arrived');
  console.log('  lantern arm example');
  console.log('  lantern serve');
}

function cmdPreview() {
  const path = argv[1] ?? die('usage: lantern preview <watch.json>');
  const config = normalizeConfig(JSON.parse(readFileSync(resolve(path), 'utf8')));
  console.log(`\n${config.name} — ${config.timezone}\n`);
  for (const line of describeLadder(config)) console.log(`  ${line}`);
  console.log('\nContacts:');
  for (const c of config.contacts) {
    console.log(`  tier ${c.tier}  ${c.name.padEnd(16)} ${c.channel}:${c.address}`);
    if (c.instruction) console.log(`           ${c.instruction}`);
  }
  console.log(`\nQuiet hours: ${config.quietHours
    ? `${config.quietHours.startHour}:00–${config.quietHours.endHour}:00 local `
      + '(deadlines are moved out of this window; alerts are not)'
    : 'none'}`);
  console.log();
}

function cmdAdd() {
  const path = argv[1] ?? die('usage: lantern add <watch.json>');
  const cfg = loadConfig();
  const watch = normalizeConfig(JSON.parse(readFileSync(resolve(path), 'utf8')));
  const { store, channels } = open(cfg);
  const existing = store.getWatch(watch.id);
  store.putWatch(watch, existing?.state ?? initState(Date.now()), Date.now());
  // Fail now, loudly, rather than at 3am when the message cannot be sent.
  channels.validate(store.listWatches());
  console.log(`${existing ? 'Updated' : 'Added'} watch "${watch.id}" (${watch.name}).`);
  if (!existing) console.log(`Next: lantern test ${watch.id}`);
  store.close();
}

async function cmdWatchAction(action) {
  const id = argv[1] ?? die(`usage: lantern ${action} <watch-id>`);
  const cfg = loadConfig();
  const { store, scheduler } = open(cfg);
  const now = Date.now();

  if (action === 'test') {
    const row = store.getWatch(id) ?? die(`no watch "${id}"`);
    // Every destination, so a wrong number is found in peacetime.
    const targets = [row.config.self, ...row.config.contacts];
    for (const to of targets) scheduler.applyEvent(id, { type: 'test', to }, now);
    const res = await scheduler.flush(now);
    console.log(`Sent ${res.sent} test message(s); ${res.failed} failed.`);
    if (res.failed) {
      console.log('Fix the failures before arming — an unreachable contact is not a contact.');
      process.exitCode = 1;
    } else {
      console.log(`When they have all arrived: lantern verify ${id}`);
    }
    store.close();
    return;
  }

  const r = scheduler.applyEvent(id, { type: action }, now);
  if (!r.ok) { store.close(); die(r.error); }
  await scheduler.flush(now);
  const row = store.getWatch(id);
  console.log(`${id}: ${summarize(row.config, row.state, now)}`);
  store.close();
}

function cmdStatus() {
  const cfg = loadConfig();
  const { store, scheduler } = open(cfg);
  const now = Date.now();
  const health = scheduler.health(now);
  console.log(`\nLantern — ${health.ok ? 'healthy' : 'ATTENTION NEEDED'}`);
  if (health.heartbeatAt) {
    console.log(`Last tick ${humanDuration(now - health.heartbeatAt)} ago`);
  } else console.log('The scheduler has never run.');
  for (const p of health.problems) console.log(`  ! ${p}`);
  console.log();
  for (const { config, state } of store.listWatches()) {
    console.log(`  ${config.id.padEnd(14)} ${summarize(config, state, now)}`);
  }
  console.log();
  store.close();
  if (!health.ok) process.exitCode = 1;
}

async function cmdServe() {
  const cfg = loadConfig();
  const { store, channels, scheduler } = open(cfg);
  channels.validate(store.listWatches());

  const server = createApp({ store, scheduler, adminToken: cfg.adminToken });
  const port = Number(flag('port', cfg.port ?? 8787));
  server.listen(port, () => {
    console.log(`Lantern listening on http://localhost:${port}`);
    console.log(`Public base URL: ${cfg.baseUrl}`);
    console.log(`Health (no auth): ${cfg.baseUrl}/healthz`);
    const armed = store.listWatches().filter((w) => w.state.phase !== 'disarmed');
    console.log(`Watching ${armed.length} of ${store.listWatches().length} configured watch(es).`);
    if (!armed.length) console.log('No watch is armed — nobody is being protected yet.');
    console.log('\nPoint an external uptime monitor at /healthz. If this process dies,');
    console.log('nothing here can tell you — that is what the external check is for.\n');
  });
  scheduler.start();

  const shutdown = () => {
    console.log('\nStopping.');
    scheduler.stop();
    server.close(() => { store.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// --- dispatch ---------------------------------------------------------------

const commands = {
  init: cmdInit,
  preview: cmdPreview,
  add: cmdAdd,
  serve: cmdServe,
  status: cmdStatus,
  test: () => cmdWatchAction('test'),
  verify: () => cmdWatchAction('verify'),
  arm: () => cmdWatchAction('arm'),
  disarm: () => cmdWatchAction('disarm'),
  resume: () => cmdWatchAction('resume'),
  checkin: () => cmdWatchAction('checkin'),
};

if (!command || command === 'help' || command === '--help') {
  console.log(readFileSync(new URL(import.meta.url), 'utf8')
    .split('\n').slice(2, 16).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const fn = commands[command];
if (!fn) die(`unknown command "${command}" — try "lantern help"`);
try {
  await fn();
} catch (err) {
  die(err?.message ?? String(err));
}
