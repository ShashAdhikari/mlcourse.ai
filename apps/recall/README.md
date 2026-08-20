# Recall

A spaced-repetition trainer for the things worth actually knowing. **309
hand-written cards across 9 subjects**, a real SM-2 scheduler, and per-deck
licensing — compiled into **one self-contained HTML file** with no backend, no
runtime dependencies, and no network calls.

```
node build.mjs          # → dist/index.html (376 KB, open it in any browser)
npm test                # 62 unit tests: scheduler, licensing, content quality
npm run test:smoke      # 39 browser checks driving the built file in Chromium
```

## The library

| Deck | Cards | Topics |
|---|---:|---|
| Machine Learning | 67 | foundations, linear models, metrics, trees, ensembles, boosting, features, unsupervised, optimization, time series |
| Probability | 31 | axioms & conditioning, random variables, expectation, limit theorems, paradoxes, stochastic processes |
| Mathematics | 31 | linear algebra, calculus, real analysis, proof, combinatorics, abstract algebra |
| Physics | 30 | mechanics, waves, electromagnetism, thermodynamics, relativity, quantum |
| Philosophy | 30 | epistemology, ethics, metaphysics, mind, science, political |
| Logic | 30 | propositional, fallacies, predicate, proof systems, modal, incompleteness |
| Game Theory | 30 | equilibrium, classic games, sequential, repeated, information, mechanism design |
| Finance | 30 | time value, risk & return, portfolio, derivatives, corporate, markets |
| Microeconomics | 30 | supply & demand, consumer, production, market structure, failure, welfare |

Every card carries four fields: the **question**, a crisp **answer**, the
**intuition** underneath it, and the **follow-up** a sharp examiner asks next.
The intuition field is where the value is — it is the paragraph that turns a
memorized definition into something you can reason from.

## Why this exists

Reading is a forward pass. Two months later, the difference between "I studied
gradient boosting" and "I can explain why shrinkage generalizes" is retrieval
practice on a schedule — a solved problem in learning science and an unsolved
one in most people's preparation.

Recall closes that gap for the moments where it pays: technical interviews,
exams, and the ordinary professional embarrassment of having known something
once. Subjects are deliberately mixed in a single daily queue, because
interleaving beats blocked practice for retention, and because the connections
between these fields are the point — Jensen's inequality shows up in
probability, finance and machine learning; the diagonal argument links Cantor,
Gödel and Turing; the prisoner's dilemma explains cartels and the commons alike.

## What's in the box

**The scheduler** (`src/engine.js`) is an SM-2 variant with Anki-style learning
steps. Cards move `new → learning → review`; grading `Again` on a review card
lapses it back with a reduced interval and ease. Every function is pure and
takes `now` explicitly — no `Date.now()` in the module — which is what lets the
34 scheduler tests assert exact intervals rather than approximate ones.

Session ordering is also in the engine, and also tested: `roundRobin` and
`orderSession` spread cards across decks so a session never serves ten physics
questions in a row, and the daily new-card budget is distributed across subjects
rather than taken in file order.

**The decks** (`src/decks/*.json`) are validated by a 16-test content gate, not
just a schema check. It enforces minimum substance in every field, rejects an
intuition that copies more than 120 characters verbatim from its answer,
catches duplicate questions and answers across the whole library, requires a
difficulty spread per deck, bans straight quotes and placeholder text, and
verifies the free tier is a genuine sampler. A thin card fails the build.

**The app** (`src/app.html`) is a keyboard-first review loop: space to reveal,
`1`–`4` to grade, with each grade's resulting interval previewed on its button.
Decks can be paused individually, progress lives in `localStorage` with
export/restore, and there is a Browse view over the whole library plus a Drill
mode that shuffles 10 cards without touching the schedule.

## The business model

**The first two topics of every deck are free forever** — 96 cards spanning all
nine subjects, enough to judge the writing before paying. The remaining 213
unlock with a license key.

Keys are Ed25519-signed offline and verified in-browser via WebCrypto, and they
carry per-deck entitlements — so you can sell a single deck, a bundle, or
all-access from the same mechanism:

```bash
node tools/keygen.mjs > keys.json                        # once — keep private
node tools/make-license.mjs keys.json buyer@x.com        # all decks
node tools/make-license.mjs keys.json buyer@x.com physics,math   # two decks
node build.mjs --pubkey <publicKey from keys.json>
```

There is no license server, no account, and no phone-home. The product is a
static file you can sell from a Gumroad listing or any CDN, it costs
approximately nothing to run, and a customer's access never depends on your
infrastructure staying up.

Like every client-side gate this is honesty-ware: a determined user can edit the
JavaScript. That is a deliberate trade — signatures make casual key sharing
fail, since keys are per-buyer and unforgeable without the private key, while
the absence of a backend keeps the margins near total.

> **Before you sell anything:** `keys.demo.json` in this repo is a throwaway —
> its private key is public, so demo licenses are forgeable by anyone who reads
> it. Generate a real keypair, keep it out of the repo (`.gitignore` already
> covers `keys.json`), and rebuild with `--pubkey`.

## Testing

| Suite | Covers |
|---|---|
| `test/engine.test.js` | 34 tests — learning-step walks, lapses, ease floors, interval caps, queue building and ordering, cross-deck interleaving, daily budgets, streaks, mastery, timezone-correct day keys |
| `test/license.test.js` | 13 tests — real keygen → mint → verify round trip; tampered payloads, foreign keypairs, malformed input; single-deck, multi-deck and all-access entitlements; v1 keys still honored |
| `test/decks.test.js` | 16 tests — the content quality gate described above |
| `test/smoke.mjs` | 39 checks — the built file in headless Chromium: deck grid, review flow, keyboard grading, deck interleaving, pausing, persistence, license accept/reject, single-deck vs all-access unlock, browse, drill, v1→v2 storage migration, and zero console errors |

Two testing notes worth keeping, both learned the hard way here:

- The smoke test asserts against rendered text (`innerText`), never
  `textContent`. The app's own source is inlined in the page, so `textContent`
  matches the string literals in the script and silently passes tests that
  should fail.
- Selectors must be specific. `.eyebrow` matches both the session label and the
  card's deck label, so a check on "which deck is this card from" was really
  reading the word "Review" every time and could never fail.

## Layout

```
build.mjs            inlines engine + license + all decks into one HTML file
src/engine.js        SM-2 scheduler and session ordering — pure, no clock, no DOM
src/license.js       Ed25519 verification + entitlements (node and browsers)
src/decks/*.json     the nine decks
src/app.html         UI, styles, and the review loop
tools/keygen.mjs     generate a signing keypair
tools/make-license.mjs   mint a key for a buyer
```

Built with care, and no dependencies at runtime.
