#!/usr/bin/env node
// Build the Lantern explainer artifact.
//
// The point of this page is that it runs the REAL escalation engine, not a
// mock-up of it. time.js, model.js, machine.js and messages.js are pure — no
// clock, no I/O — so they inline into the browser unchanged and the timeline
// the reader scrubs is computed by exactly the code the service runs.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, 'dist', 'artifact.html');

/** Strip module syntax so the sources concatenate into one classic script. */
const inline = (name) => readFileSync(join(here, 'src', name), 'utf8')
  .replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '')
  .replace(/^export\s+(const|function|class|let)/gm, '$1')
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '');

// Dependency order matters: time → model → machine → messages.
const engine = ['time.js', 'model.js', 'machine.js', 'messages.js'].map(inline).join('\n');

const shell = readFileSync(join(here, 'artifact', 'page.html'), 'utf8');
if (!shell.includes('/* __ENGINE__ */')) throw new Error('page.html is missing the engine marker');

writeFileSync(out, shell.replace('/* __ENGINE__ */', () => engine));
const kb = (readFileSync(out, 'utf8').length / 1024).toFixed(0);
console.log(`built ${out} (${kb} KB, real engine inlined)`);
