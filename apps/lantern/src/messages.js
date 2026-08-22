// Lantern — the words people actually receive.
//
// This file is as safety-critical as the state machine. A contact reading an
// alert at 2am is frightened and half-awake. Every message therefore says, in
// this order: who, what happened, how long, what to do now, and how to stop
// the alarm. No jargon, no branding, no ambiguity about whether this is a test.

import { formatLocal, humanDuration } from './time.js';

const disclaimer = 'Lantern watches for missed check-ins. It is not a medical alarm '
  + 'and cannot call emergency services for you.';

/** A nudge to the person themselves. Nobody else has been contacted yet. */
export function nudgeMessage(config, action, url) {
  const overdue = humanDuration(action.overdueBy);
  const contactsAt = new Date(action.cycleStart + config.graceMinutes * 60000);
  const remaining = humanDuration(contactsAt.getTime() - action.at);
  const first = config.contacts.filter((c) => c.tier === 1).map((c) => c.name).join(' and ');
  return {
    subject: action.index === 1
      ? 'Checking in — are you OK?'
      : `Still waiting to hear from you (${overdue} overdue)`,
    body: [
      `Hello ${config.name},`,
      '',
      action.index === 1
        ? 'Your check-in is due. Tap below to let Lantern know you are fine.'
        : `Your check-in is ${overdue} overdue. Tap below to let Lantern know you are fine.`,
      '',
      url,
      '',
      `If Lantern does not hear from you in about ${remaining}, it will contact ${first}.`,
      '',
      'If you are in danger, contact your local emergency services.',
    ].join('\n'),
  };
}

/** An alert to a contact. The most important text in the system. */
export function alertMessage(config, action, contact, resolveUrl) {
  const overdue = humanDuration(action.overdueBy);
  const missedAt = formatLocal(action.cycleStart, config.timezone);
  const lines = [
    `${contact.name},`,
    '',
    `${config.name} has not checked in with Lantern for ${overdue}.`,
    `Their check-in was due at ${missedAt} (${config.timezone}) and has not happened.`,
    '',
    'Lantern has already tried to reach them directly and had no response.',
  ];

  if (action.late) {
    lines.push('',
      'Note: this alert was delayed — Lantern was unable to send it at the '
      + 'intended time, so the situation may have been going on longer than the '
      + 'figure above suggests.');
  }

  lines.push('', 'What would help right now:', '  1. Try calling or messaging them.',
    '  2. If you cannot reach them, try someone who lives nearby.');

  if (contact.instruction) {
    lines.push(`  3. ${contact.instruction}`);
  }

  lines.push('',
    'If you make contact and they are fine, please stop the alarm so nobody',
    'else is woken unnecessarily:', resolveUrl);

  if (config.note) lines.push('', `A note from ${config.name}: ${config.note}`);

  lines.push('', disclaimer);

  return {
    subject: `${config.name} has not checked in (${overdue} overdue)`,
    body: lines.join('\n'),
  };
}

/** The all-clear. Sending this promptly is what makes people trust the system. */
export function standDownMessage(config, action, contact) {
  const reasons = {
    'checked-in': `${config.name} has checked in and is fine.`,
    resolved: action.by
      ? `${action.by} confirmed that ${config.name} is fine.`
      : `Someone confirmed that ${config.name} is fine.`,
    paused: `${config.name} has paused their Lantern check-ins.`,
    disarmed: `${config.name} has turned their Lantern check-ins off.`,
  };
  return {
    subject: `All clear — ${config.name} is OK`,
    body: [
      `${contact.name},`,
      '',
      reasons[action.reason] ?? `The alert for ${config.name} has been cleared.`,
      'No further action is needed. Sorry for the alarm.',
      '',
      `Cleared at ${formatLocal(action.at, config.timezone)} (${config.timezone}).`,
    ].join('\n'),
  };
}

/** The test message that must arrive before a watch may be armed. */
export function testMessage(config, action) {
  return {
    subject: `Lantern test message for ${config.name}`,
    body: [
      'This is a test.',
      '',
      `${config.name} is setting up Lantern, a service that will alert you if`,
      'they stop checking in. You are listed as one of the people it would contact.',
      '',
      'Nothing is wrong. You do not need to do anything.',
      '',
      'You are receiving this because Lantern refuses to arm a watch until it',
      'has proven it can actually reach the people it would need to reach.',
      '',
      disclaimer,
    ].join('\n'),
  };
}

/** Operator-facing alarm when the system itself looks unhealthy. */
export function systemFaultMessage(fault) {
  return {
    subject: `Lantern system fault: ${fault.kind}`,
    body: [
      'Lantern has detected a problem with itself.',
      '',
      `Fault: ${fault.kind}`,
      `Detail: ${fault.detail}`,
      '',
      'While this is unresolved, check-in monitoring may not be working.',
      'Watches are not protecting anyone if the scheduler is not running.',
    ].join('\n'),
  };
}
