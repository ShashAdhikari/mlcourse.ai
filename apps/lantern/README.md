# Lantern

A check-in watch. If someone stops answering, the people who love them find out
— on a schedule they chose, through a ladder they can read in plain English.

```
lantern init .              # config + signing secret
lantern preview watch.json  # read the escalation ladder back in English
lantern add watch.json
lantern test example        # sends a real message to every contact
lantern verify example      # only after they confirm it arrived
lantern arm example
lantern serve
```

No dependencies. Node 22+, SQLite via `node:sqlite`, HTTP via `node:http`,
SMTP hand-written. Nothing in this service can be broken by someone else's
release.

## What it does

Ada checks in once a day. If she misses her deadline, Lantern spends three
hours nudging **her** — nobody else hears anything. If she still hasn't
answered, it tells her daughter. An hour after that, her neighbour with the
spare key. The moment Ada checks in, everyone who was contacted is told she's
fine.

That shape — **nudge the person first, escalate slowly, always stand down** —
is the whole product. The code exists to make it reliable.

## Why the design looks like this

Anyone can write a timer that sends an email. The hard part is that this
system's failures are asymmetric and both directions are severe: a false alarm
teaches a family to ignore it, and a missed alarm is the thing you built it to
prevent. Four decisions follow from that.

**It cannot run on the user's device.** The trigger condition *is* the phone
being dead, drowned, or in another room. Lantern is a server that expects the
person to reach *it*.

**A watch cannot alert anyone until it has proven it can.** `arm` is refused
until a test message has actually been sent to every contact and a human has
confirmed it arrived. An untested channel is not a safety net, it is a
decoration.

**A GET request never changes anything.** This one is not obvious and it is the
bug most likely to kill someone. Corporate mail gateways and chat clients
follow links in messages to scan them — so a check-in link that worked on GET
would be "clicked" by a robot minutes after being sent, silently cancelling a
real alarm while the person lay unconscious. Every action link renders a page
with a button; only a POST records anything. `isSafeMethod` is the single
place that rule lives, and three tests hold it down.

**The system watches itself.** A monitoring service that stops running looks
exactly like one where nothing is wrong. So the scheduler writes a heartbeat,
`/healthz` returns **503** when that heartbeat goes stale (unauthenticated, so
an external uptime monitor can see it), a gap between ticks is reported as a
fault, and any notification that exhausts its retries raises an alarm to the
operator — because a contact who was supposed to be told and wasn't is a
safety event, not a log line.

## How escalation is computed

Progress through the ladder is **derived from elapsed time**, never accumulated
step by step:

```js
tiersDueBy(config, cycleStart, now)   // pure function of how overdue we are
```

This is what makes an outage survivable. If the process is down for six hours
across the whole ladder, the first tick after it returns contacts *every* tier
that became due, marked as delayed — rather than resuming a stale sequence six
hours late, or skipping people entirely. The same property makes a replayed
tick a no-op, so restarts and overlapping schedulers are harmless.

Nudges behave the opposite way on purpose: after an outage the person gets
**one** current prompt, not a backlog of six identical ones.

## Guarantees, and how they are enforced

| Guarantee | Mechanism |
|---|---|
| Nobody is contacted twice for one alarm | Deterministic action keys are the delivery table's primary key |
| Two schedulers cannot double-send | Atomic compare-and-swap claim on each delivery before sending |
| A crashed sender loses nothing | Claims older than 5 min return to the queue (duplicate > silence) |
| Everyone alarmed is told it's over | Stand-down goes to exactly the contacts in tiers 1..n notified |
| A pause always expires | Capped at `maxPauseHours`; an indefinite pause is unrepresentable |
| Downtime never swallows an alert | Time-derived escalation plus outage detection on restart |
| A check-in is never lost to power failure | SQLite WAL with `synchronous = FULL` |

## Testing

```
npm test          # 152 unit and integration tests
npm run simulate  # randomized invariant fuzzing (slow)
```

Two layers. The first is conventional: exact-instant tests of the scheduler
across DST transitions, in five timezones including a 45-minute offset; token
forgery, expiry and cross-purpose reuse; delivery retry and give-up; HTML
escaping; rate limiting.

The second is what actually earns trust. `test/simulation.test.js` generates
randomized months — random configs, random check-in behaviour, random
outages, random carrier failures — and asserts safety invariants that are
**re-derived from the raw event log**, not read from the state machine's own
bookkeeping. A bug that corrupted internal state would still be caught.

The central one:

> No contact is ever alerted unless the subject has been silent for at least
> one full check-in interval **plus** the entire grace window.

Alongside: tiers only ever fire in order, no message is delivered twice,
everyone alarmed is eventually stood down, nobody is stood down who was never
alarmed, and no alert lands while paused. Plus liveness — a subject who goes
silent always reaches full escalation — because a watch that never fires would
satisfy every safety invariant above.

The suite also tests the tests: a deliberately corrupted log must be rejected
by each invariant, so a bug in the checks cannot masquerade as success.

Three real bugs came out of this, all found by tests rather than by reading:

- **Concurrent double-send.** Two schedulers on one database both read the same
  pending row and both sent it. The delivery log deduplicated *queueing* but
  not *sending*. Fixed with the atomic claim above.
- **A hard-coded channel allowlist** in config validation made custom adapters
  unusable, despite the registry already being the authority.
- **Oversized request bodies** killed the socket before a status could be
  written, so clients saw a connection error rather than 413.

## Deploying

Run `lantern serve` behind TLS. Then do the one thing this service cannot do
for you: **point an external uptime monitor at `/healthz`.** If the process
dies, nothing inside it can tell you — that is precisely what the external
check is for. `/healthz` needs no credentials for exactly this reason.

Back up `lantern.config.json`. The secret in it signs every check-in link;
replacing it invalidates links already sent.

## What this is not

Lantern is not a medical alarm. It cannot call an ambulance, it does not detect
falls, and it knows nothing about a person beyond whether they pressed a
button. It reduces the time between "something happened" and "somebody
noticed" — which is a real and sometimes decisive thing — and it should be
described to the people relying on it in exactly those terms. Every message it
sends says so.

## Layout

```
src/time.js        timezone, quiet hours, DST-safe deadline maths — pure
src/model.js       config validation; fails loudly at setup, never at 3am
src/machine.js     the escalation state machine — pure, no clock, no I/O
src/tokens.js      signed action links; the GET/POST safety rule
src/store.js       SQLite persistence and the idempotent delivery log
src/scheduler.js   ticking, catch-up, retries, self-monitoring
src/channels.js    console / file / webhook / email / sms adapters
src/smtp.js        hand-written SMTP client with STARTTLS
src/messages.js    the words people actually receive
src/server.js      HTTP surface with three trust levels
src/ui.js          the pages a worried person opens
bin/lantern.js     command line
```
