// Lantern — server-rendered pages.
//
// Plain HTML and CSS, no client framework, no build step. Two of these pages
// are opened by someone who is worried or in a hurry, on an unknown device,
// possibly on bad signal. That rules out anything that has to boot before it
// becomes usable.

import { formatLocal, humanDuration } from './time.js';
import { PHASES, summarize } from './machine.js';

export const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const STYLE = `
:root {
  --bg: #FBFAF7; --card: #FFFFFF; --ink: #22201C; --ink-2: #5F5A52;
  --ink-3: #8C867C; --line: #E4E0D8; --accent: #B4622A; --accent-ink: #8E4C20;
  --ok: #2F6E4B; --ok-bg: #E8F2EC; --warn: #9A6410; --warn-bg: #F8EFDF;
  --bad: #A63A2F; --bad-bg: #F8E9E6;
  --shadow: 0 1px 2px rgba(34,32,28,.05), 0 8px 28px rgba(34,32,28,.07);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme=light]) {
    --bg: #171614; --card: #1F1E1B; --ink: #EDEAE4; --ink-2: #A8A199;
    --ink-3: #7C766D; --line: #302E2A; --accent: #E08A4E; --accent-ink: #EE9E63;
    --ok: #6DB98C; --ok-bg: #1C2A22; --warn: #D9A15C; --warn-bg: #2C2415;
    --bad: #E08579; --bad-bg: #2E1E1B;
    --shadow: 0 1px 2px rgba(0,0,0,.35), 0 10px 30px rgba(0,0,0,.4);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 16px/1.6 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 640px; margin: 0 auto; padding: 32px 20px 72px; }
.wrap.wide { max-width: 900px; }
header.top { display: flex; align-items: baseline; gap: 12px; margin-bottom: 28px; }
.mark { font-size: 20px; font-weight: 700; letter-spacing: -.01em; }
.mark span { color: var(--accent); }
.tag { color: var(--ink-3); font-size: 13px; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  padding: 28px; box-shadow: var(--shadow);
}
h1 { font-size: 26px; line-height: 1.25; margin: 0 0 10px; letter-spacing: -.015em; text-wrap: balance; }
h2 { font-size: 17px; margin: 28px 0 10px; }
p { margin: 0 0 14px; }
.lead { font-size: 17px; color: var(--ink-2); }
.muted { color: var(--ink-2); }
.small { font-size: 14px; }
.tiny { font-size: 13px; color: var(--ink-3); }
form { margin: 0; }
button.big {
  display: block; width: 100%; border: none; border-radius: 12px; cursor: pointer;
  background: var(--accent); color: #fff; font-size: 21px; font-weight: 650;
  padding: 22px; font-family: inherit; margin: 22px 0 8px;
}
button.big:hover { filter: brightness(1.06); }
button.big.secondary { background: var(--card); color: var(--ink); border: 1px solid var(--line); font-size: 16px; padding: 14px; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.pill {
  display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .05em;
  text-transform: uppercase; padding: 3px 10px; border-radius: 999px;
}
.pill.ok { background: var(--ok-bg); color: var(--ok); }
.pill.warn { background: var(--warn-bg); color: var(--warn); }
.pill.bad { background: var(--bad-bg); color: var(--bad); }
.pill.off { background: var(--line); color: var(--ink-2); }
table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3); font-weight: 600; }
td.num { font-variant-numeric: tabular-nums; }
.note {
  border-left: 3px solid var(--line); padding: 2px 0 2px 14px;
  color: var(--ink-2); font-size: 14.5px; margin: 18px 0;
}
.note.urgent { border-color: var(--bad); }
.foot { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--line); }
code { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 13px;
       background: var(--bg); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; }
.stack { display: flex; flex-direction: column; gap: 18px; }
.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
`;

export function page({ title, body, wide = false }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head><body>
<div class="wrap${wide ? ' wide' : ''}">
  <header class="top"><span class="mark">Lantern<span>.</span></span>
  <span class="tag">check-in watch</span></header>
  ${body}
</div></body></html>`;
}

const DISCLAIMER = `<p class="tiny">Lantern watches for missed check-ins. It is not a medical
alarm and cannot contact emergency services for you. In an emergency, call your local
emergency number.</p>`;

// ---------------------------------------------------------------------------
// The check-in page.
//
// Reached by tapping a link in a nudge. It must not record anything on load:
// mail gateways follow links to scan them, and a check-in performed by a robot
// would cancel a real alarm. The page therefore only ever offers a button, and
// the button POSTs.
// ---------------------------------------------------------------------------

export function checkinPage(config, state, now, token) {
  const overdue = state.cycleStart ? humanDuration(now - state.cycleStart) : null;
  return page({
    title: `Check in — ${config.name}`,
    body: `<div class="card">
      <h1>Are you OK, ${escapeHtml(config.name.split(' ')[0])}?</h1>
      <p class="lead">${overdue
        ? `Your check-in is ${escapeHtml(overdue)} overdue.`
        : 'Tap below to check in.'}</p>
      <form method="POST" action="/a/checkin/${encodeURIComponent(token)}">
        <button class="big" type="submit">Yes — I'm OK</button>
      </form>
      <p class="tiny">Nothing is recorded until you press the button.</p>
      ${state.tiersNotified > 0 ? `<div class="note urgent">
        <strong>${state.tiersNotified === 1 ? 'One of your contacts has' : 'Some of your contacts have'}
        already been told you are overdue.</strong> Checking in now will let them know you are fine.
      </div>` : ''}
      <div class="foot">${DISCLAIMER}</div>
    </div>`,
  });
}

export function checkedInPage(config, state, now) {
  return page({
    title: 'Checked in',
    body: `<div class="card">
      <h1>Thank you — you're checked in.</h1>
      <p class="lead">Your next check-in is due by
        <strong>${escapeHtml(formatLocal(state.deadline, config.timezone))}</strong>.</p>
      ${state.resolvedBy === null && state.lastCheckInSource ? '' : ''}
      <p class="small muted">If anyone had been contacted, they have just been told you are fine.</p>
      <div class="foot">${DISCLAIMER}</div>
    </div>`,
  });
}

// ---------------------------------------------------------------------------
// The contact's page — opened by a frightened relative
// ---------------------------------------------------------------------------

export function resolvePage(config, state, contact, now, token) {
  const overdue = state.cycleStart ? humanDuration(now - state.cycleStart) : null;
  const alarming = state.phase === PHASES.ESCALATING || state.phase === PHASES.ALERTED
                || state.phase === PHASES.DUE;
  if (!alarming) {
    return page({
      title: `${config.name} is OK`,
      body: `<div class="card">
        <h1>${escapeHtml(config.name)} is OK.</h1>
        <p class="lead">This alert has already been cleared. There is nothing you need to do.</p>
        <div class="foot">${DISCLAIMER}</div>
      </div>`,
    });
  }
  return page({
    title: `${config.name} has not checked in`,
    body: `<div class="card">
      <h1>${escapeHtml(config.name)} has not checked in.</h1>
      <p class="lead">Their check-in was due
        <strong>${escapeHtml(formatLocal(state.cycleStart, config.timezone))}</strong>
        ${overdue ? `— ${escapeHtml(overdue)} ago` : ''}.</p>
      <p>Lantern has already tried to reach them directly and had no reply.</p>
      <h2>What would help right now</h2>
      <p class="small">1. Try calling or messaging them.<br>
         2. If you cannot reach them, try someone who lives nearby.
         ${contact?.instruction ? `<br>3. ${escapeHtml(contact.instruction)}` : ''}</p>
      ${config.note ? `<div class="note">A note from ${escapeHtml(config.name)}:
        ${escapeHtml(config.note)}</div>` : ''}
      <h2>If you have made contact and they are fine</h2>
      <p class="small">Press this to stop the alarm, so nobody else is woken.</p>
      <form method="POST" action="/a/resolve/${encodeURIComponent(token)}">
        <button class="big" type="submit">
          ${escapeHtml(config.name)} is fine — stop the alarm</button>
      </form>
      <p class="tiny">Nothing changes until you press the button.</p>
      <div class="foot">${DISCLAIMER}</div>
    </div>`,
  });
}

export function resolvedPage(config, by) {
  return page({
    title: 'Alarm cleared',
    body: `<div class="card">
      <h1>Thank you — the alarm is cleared.</h1>
      <p class="lead">Everyone else who was contacted about ${escapeHtml(config.name)}
        has been told they are fine.</p>
      ${by ? `<p class="small muted">Recorded as confirmed by ${escapeHtml(by)}.</p>` : ''}
      <div class="foot">${DISCLAIMER}</div>
    </div>`,
  });
}

// ---------------------------------------------------------------------------
// Status dashboard
// ---------------------------------------------------------------------------

const phasePill = (phase) => {
  const map = {
    [PHASES.OK]: ['ok', 'ok'],
    [PHASES.DISARMED]: ['off', 'not armed'],
    [PHASES.PAUSED]: ['off', 'paused'],
    [PHASES.DUE]: ['warn', 'overdue'],
    [PHASES.ESCALATING]: ['bad', 'escalating'],
    [PHASES.ALERTED]: ['bad', 'alerted'],
  };
  const [cls, label] = map[phase] ?? ['off', phase];
  return `<span class="pill ${cls}">${label}</span>`;
};

export function dashboardPage(watches, health, now) {
  const rows = watches.map(({ config, state }) => `
    <tr>
      <td><strong>${escapeHtml(config.name)}</strong><br>
          <span class="tiny">${escapeHtml(config.id)} · ${escapeHtml(config.timezone)}</span></td>
      <td>${phasePill(state.phase)}</td>
      <td class="small muted">${escapeHtml(summarize(config, state, now))}</td>
      <td class="num small">${state.deadline ? escapeHtml(formatLocal(state.deadline, config.timezone)) : '—'}</td>
    </tr>`).join('');

  const problems = health.problems.length
    ? `<div class="note urgent"><strong>The service itself needs attention:</strong><br>
       ${health.problems.map((p) => escapeHtml(p)).join('<br>')}</div>`
    : `<div class="note">Scheduler healthy. Last tick
       ${health.heartbeatAt ? escapeHtml(humanDuration(now - health.heartbeatAt)) + ' ago' : 'never'}.</div>`;

  return page({
    wide: true,
    title: 'Lantern status',
    body: `<div class="card">
      <div class="row" style="justify-content:space-between">
        <h1 style="margin:0">Status</h1>
        <span class="pill ${health.ok ? 'ok' : 'bad'}">${health.ok ? 'healthy' : 'attention needed'}</span>
      </div>
      ${problems}
      ${watches.length ? `<table><thead><tr>
        <th>Watch</th><th>State</th><th>Detail</th><th>Next due</th>
      </tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="muted">No watches configured yet.</p>'}
      <div class="foot">
        <p class="tiny">Deliveries: ${Object.entries(health.deliveries)
          .map(([k, v]) => `${escapeHtml(k)} ${v}`).join(' · ') || 'none yet'}</p>
        ${DISCLAIMER}
      </div>
    </div>`,
  });
}

// ---------------------------------------------------------------------------
// Errors — these are read by someone who may already be anxious
// ---------------------------------------------------------------------------

export function errorPage(status, heading, detail) {
  return page({
    title: heading,
    body: `<div class="card">
      <h1>${escapeHtml(heading)}</h1>
      <p class="lead">${escapeHtml(detail)}</p>
      <div class="foot">${DISCLAIMER}</div>
    </div>`,
  });
}

export const EXPIRED_LINK = [
  'This link has expired',
  'Links stop working after a while for safety. Open the most recent message you '
  + 'received, or check in from the app instead.',
];

export const BAD_LINK = [
  'This link is not valid',
  'It may have been copied incompletely. Try opening it directly from the message '
  + 'you received rather than pasting it.',
];
