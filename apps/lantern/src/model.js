// Lantern — watch configuration: defaults, validation, normalization.
//
// Validation is strict and happens once, at configuration time. A malformed
// escalation ladder must fail when someone is setting it up and watching the
// screen, never at the moment it is needed.

import { assertValidZone, HOUR, MINUTE } from './time.js';

// The channels shipped in the box. This list is for UI hints only — channels
// are pluggable, so whether an adapter actually exists is decided by the
// Channels registry at startup (see channels.js `validate`), not here. Baking
// the list into config validation would make a custom adapter unusable.
export const BUILTIN_CHANNELS = ['console', 'file', 'webhook', 'email', 'sms'];

const isChannelName = (v) => typeof v === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(v);

export const DEFAULTS = Object.freeze({
  intervalHours: 24,
  quietHours: { startHour: 22, endHour: 8 },
  // How long we pester the person themselves before involving anyone else.
  // This window is the main defence against false alarms.
  graceMinutes: 180,
  nudgeEveryMinutes: 45,
  // Gap after notifying tier N before escalating to tier N+1.
  tierWaitMinutes: [60, 120],
  // A pause always expires. An indefinite pause is how a watch quietly stops
  // protecting someone while still looking switched on.
  maxPauseHours: 24 * 30,
});

class ConfigError extends Error {
  constructor(message) { super(message); this.name = 'ConfigError'; }
}
const fail = (msg) => { throw new ConfigError(msg); };

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);

function validateContact(c, index, seen) {
  if (!isPlainObject(c)) fail(`contacts[${index}] must be an object`);
  if (typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(c.id)) {
    fail(`contacts[${index}].id must be 1-64 chars of [a-zA-Z0-9_-]`);
  }
  if (seen.has(c.id)) fail(`duplicate contact id: ${c.id}`);
  seen.add(c.id);
  if (typeof c.name !== 'string' || !c.name.trim()) fail(`contacts[${index}].name is required`);
  if (!isChannelName(c.channel)) {
    fail(`contacts[${index}].channel must be a lowercase channel name`);
  }
  if (typeof c.address !== 'string' || !c.address.trim()) {
    fail(`contacts[${index}].address is required`);
  }
  if (!isInt(c.tier) || c.tier < 1 || c.tier > 5) {
    fail(`contacts[${index}].tier must be an integer 1-5`);
  }
  return {
    id: c.id,
    name: c.name.trim(),
    channel: c.channel,
    address: c.address.trim(),
    tier: c.tier,
    // Shown verbatim to this contact when they are alerted. The place to put
    // "spare key is with the neighbour" or "call 999 if no answer".
    instruction: typeof c.instruction === 'string' ? c.instruction.trim() : '',
  };
}

function validateQuietHours(q) {
  if (q === null || q === undefined) return null;
  if (!isPlainObject(q)) fail('quietHours must be an object or null');
  for (const k of ['startHour', 'endHour']) {
    if (!isInt(q[k]) || q[k] < 0 || q[k] > 23) fail(`quietHours.${k} must be an integer 0-23`);
  }
  return { startHour: q.startHour, endHour: q.endHour };
}

/**
 * Validate and normalize a watch configuration.
 * @returns {object} a frozen, fully-populated config
 */
export function normalizeConfig(input) {
  if (!isPlainObject(input)) fail('config must be an object');

  const id = input.id;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    fail('config.id must be 1-64 chars of [a-zA-Z0-9_-]');
  }
  const name = typeof input.name === 'string' && input.name.trim()
    ? input.name.trim() : fail('config.name is required');

  const timezone = assertValidZone(
    typeof input.timezone === 'string' && input.timezone ? input.timezone : 'UTC');

  const intervalHours = input.intervalHours ?? DEFAULTS.intervalHours;
  if (typeof intervalHours !== 'number' || !(intervalHours > 0) || intervalHours > 24 * 14) {
    fail('intervalHours must be a positive number of at most 336 (14 days)');
  }

  const graceMinutes = input.graceMinutes ?? DEFAULTS.graceMinutes;
  if (!isInt(graceMinutes) || graceMinutes < 0 || graceMinutes > 24 * 60) {
    fail('graceMinutes must be an integer 0-1440');
  }

  const nudgeEveryMinutes = input.nudgeEveryMinutes ?? DEFAULTS.nudgeEveryMinutes;
  if (!isInt(nudgeEveryMinutes) || nudgeEveryMinutes < 1) {
    fail('nudgeEveryMinutes must be a positive integer');
  }

  const contacts = Array.isArray(input.contacts) ? input.contacts : fail('contacts must be an array');
  if (!contacts.length) fail('a watch needs at least one contact — otherwise nobody is told');
  const seen = new Set();
  const normContacts = contacts.map((c, i) => validateContact(c, i, seen));

  // Tiers must be contiguous from 1: a gap means a tier that never fires, and
  // a ladder with a hole in it is worse than no ladder.
  const tiers = [...new Set(normContacts.map((c) => c.tier))].sort((a, b) => a - b);
  if (tiers[0] !== 1) fail('contact tiers must start at 1');
  for (let i = 1; i < tiers.length; i += 1) {
    if (tiers[i] !== tiers[i - 1] + 1) fail(`contact tiers must be contiguous; missing tier ${tiers[i - 1] + 1}`);
  }

  const tierWaitMinutes = input.tierWaitMinutes ?? DEFAULTS.tierWaitMinutes;
  if (!Array.isArray(tierWaitMinutes) || tierWaitMinutes.some((m) => !isInt(m) || m < 0)) {
    fail('tierWaitMinutes must be an array of non-negative integers');
  }
  // One wait per gap between tiers; pad with the last value so adding a tier
  // never silently produces a zero-second escalation.
  const gaps = Math.max(0, tiers.length - 1);
  const waits = [];
  for (let i = 0; i < gaps; i += 1) {
    waits.push(tierWaitMinutes[i] ?? tierWaitMinutes[tierWaitMinutes.length - 1] ?? 60);
  }

  const self = input.self;
  if (!isPlainObject(self)) fail('config.self is required — how to reach the person themselves');
  if (!isChannelName(self.channel)) fail('self.channel must be a lowercase channel name');
  if (typeof self.address !== 'string' || !self.address.trim()) fail('self.address is required');

  const maxPauseHours = input.maxPauseHours ?? DEFAULTS.maxPauseHours;
  if (typeof maxPauseHours !== 'number' || !(maxPauseHours > 0)) {
    fail('maxPauseHours must be a positive number');
  }

  return Object.freeze({
    id,
    name,
    timezone,
    intervalHours,
    quietHours: validateQuietHours(
      input.quietHours === undefined ? DEFAULTS.quietHours : input.quietHours),
    graceMinutes,
    nudgeEveryMinutes,
    contacts: Object.freeze(normContacts.map(Object.freeze)),
    tierCount: tiers.length,
    tierWaitMinutes: Object.freeze(waits),
    self: Object.freeze({ channel: self.channel, address: self.address.trim() }),
    maxPauseHours,
    note: typeof input.note === 'string' ? input.note.trim() : '',
  });
}

/** Contacts in a given tier (1-based), in config order. */
export function contactsInTier(config, tier) {
  return config.contacts.filter((c) => c.tier === tier);
}

/** Contacts in tiers 1..n — exactly the people already told about this alarm. */
export function contactsUpToTier(config, tier) {
  return config.contacts.filter((c) => c.tier <= tier);
}

/** Total time from a missed deadline to the last tier being notified. */
export function timeToFullEscalation(config) {
  const waits = config.tierWaitMinutes.reduce((a, b) => a + b, 0);
  return config.graceMinutes * MINUTE + waits * MINUTE;
}

/** A plain-language description of what will happen, for the setup screen. */
export function describeLadder(config) {
  const steps = [];
  steps.push(`If ${config.name} does not check in within ${config.intervalHours} hours, ` +
    `Lantern nudges them for ${config.graceMinutes} minutes first.`);
  for (let tier = 1; tier <= config.tierCount; tier += 1) {
    const names = contactsInTier(config, tier).map((c) => c.name).join(', ');
    const after = tier === 1
      ? `${config.graceMinutes} minutes after the deadline`
      : `${config.tierWaitMinutes[tier - 2]} minutes later`;
    steps.push(`Then, ${after}, it contacts ${names}.`);
  }
  const total = timeToFullEscalation(config);
  steps.push(`Everyone has been told within ${Math.round(total / HOUR * 10) / 10} hours of a missed check-in.`);
  return steps;
}
