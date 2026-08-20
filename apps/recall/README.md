# Recall

A spaced-repetition trainer for machine-learning interviews. 67 hand-written
questions across 10 topics, a real SM-2 scheduler, and a licensing path — all
compiled into **one self-contained HTML file** with no backend, no build
dependencies, and no network calls.

```
node build.mjs          # → dist/index.html (108 KB, open it in any browser)
npm test                # 35 unit tests: scheduler + licensing + question bank
npm run test:smoke      # 21 browser checks driving the built file in Chromium
```

## Why this exists

mlcourse.ai teaches this material beautifully, but a course is a *forward* pass.
Two months after finishing it, the difference between "I studied ensembles" and
"I can explain why feature subsampling matters" is retrieval practice on a
schedule. That is a solved problem in the learning-science literature and an
unsolved one in most people's interview prep.

Recall closes that gap for one specific, high-stakes moment: the ML interview.
Every card is written to the standard an interviewer actually applies — a crisp
answer, the intuition underneath it, and the follow-up question they ask next.

## What's in the box

**The scheduler** (`src/engine.js`) is an SM-2 variant with Anki-style learning
steps. Cards move `new → learning → review`; grading `Again` on a review card
lapses it back to learning with a reduced interval and a reduced ease factor.
Every function is pure and takes `now` as an explicit argument — no `Date.now()`
anywhere in the module, which is what makes the 22 scheduler tests exact rather
than approximate.

**The question bank** (`src/bank.json`) is 67 cards over foundations, linear
models, metrics & validation, trees & kNN, bagging & forests, boosting, feature
engineering, unsupervised learning, optimization, and time series. Each card
carries `q`, `a` (the answer), `why` (the intuition), and `followup` (what gets
asked next). A schema test enforces the contract: unique IDs, real topics, ≥5
cards per topic, a difficulty spread, and minimum substance in every field —
so a thin card fails CI instead of reaching a user.

**The app** (`src/app.html`) is a keyboard-first review loop: space to reveal,
`1`–`4` to grade, with the resulting interval previewed on each grade button
before you press it. Progress lives in `localStorage`, with export/restore so a
paying user is never locked to one browser. Also: a Browse view over the whole
bank, a Drill mode that shuffles 10 cards without touching the schedule, and
per-topic mastery meters.

## The business model

Three topics (21 cards) are free forever — enough to judge whether the writing
is worth paying for. The other seven unlock with a license key.

Keys are Ed25519-signed offline and verified in-browser via WebCrypto:

```bash
node tools/keygen.mjs > keys.json           # once — keep this private
node tools/make-license.mjs keys.json buyer@example.com
# → RECALL-eyJlbWFpbC...ktQ.ej0Bhp...MBQ

node build.mjs --pubkey <publicKey from keys.json>
```

The buyer pastes the key into Settings; it verifies against the embedded public
key and unlocks permanently on that device. There is no license server, no
account, and no phone-home — which means the whole product is a static file you
can sell from a Gumroad listing or any CDN, and a customer's access never
depends on your infrastructure staying up.

Like every client-side gate, this is honesty-ware: a determined user can edit
the JavaScript. That is a deliberate trade. The signature makes casual key
sharing fail (keys are per-buyer and unforgeable without the private key), while
the absence of a backend makes the product cost approximately nothing to run.

> **Before you sell anything:** `keys.demo.json` in this repo is a throwaway —
> its private key is public, so demo licenses are forgeable by anyone who reads
> it. Generate a real keypair, keep it out of the repo (`.gitignore` already
> covers `keys.json`), and rebuild with `--pubkey`.

## Testing

| Suite | What it covers |
|---|---|
| `test/engine.test.js` | 22 tests — learning-step walks, lapses, ease floors, interval caps, queue building and ordering, daily budgets, streaks, mastery, timezone-correct day keys |
| `test/license.test.js` | 7 tests — real keygen → mint → verify round trip, plus tampered payloads, foreign keypairs, and malformed input rejected without throwing |
| `test/bank.test.js` | 6 tests — the question-bank schema contract |
| `test/smoke.mjs` | 21 checks — the built file driven in headless Chromium: review flow, keyboard grading, persistence across reload, license accept/reject, pro unlock, drill mode, and zero console errors |

The smoke test asserts against rendered text (`innerText`), not `textContent` —
the app's own source is inlined in the page, so `textContent` matches the string
literals in the script and silently passes tests that should fail.

## Layout

```
build.mjs          inlines engine + license + bank into one HTML file
src/engine.js      SM-2 scheduler — pure functions, no clock, no DOM
src/license.js     Ed25519 verification (WebCrypto, works in node and browsers)
src/bank.json      the 67 questions
src/app.html       UI, styles, and the review loop
tools/keygen.mjs   generate a signing keypair
tools/make-license.mjs   mint a key for a buyer
```

Built with care, and no dependencies at runtime.
