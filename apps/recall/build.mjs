#!/usr/bin/env node
// Build Recall into a single self-contained HTML file.
//   node build.mjs [--pubkey <b64url>] [--out dist/index.html]
// Default public key comes from keys.demo.json (DEMO — regenerate before selling).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const pubkey = arg('--pubkey', JSON.parse(readFileSync(join(here, 'keys.demo.json'), 'utf8')).publicKey);
const outPath = arg('--out', join(here, 'dist', 'index.html'));

const stripModule = (src) => src.replace(/^export (const|function|let|class)/gm, '$1');

const engine = stripModule(readFileSync(join(here, 'src', 'engine.js'), 'utf8'));
const license = stripModule(readFileSync(join(here, 'src', 'license.js'), 'utf8'));
const bank = JSON.parse(readFileSync(join(here, 'src', 'bank.json'), 'utf8'));
// <-escape so no '</script>' sequence can terminate the inline script early
const bankJs = JSON.stringify(bank).replace(/</g, '\\u003c');

let html = readFileSync(join(here, 'src', 'app.html'), 'utf8');
const replaceOnce = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`marker missing from app.html: ${marker}`);
  html = html.replace(marker, () => value);
};
replaceOnce('/* __ENGINE__ */', engine);
replaceOnce('/* __LICENSE__ */', license);
replaceOnce('/* __BANK_JSON__ */ null', bankJs);
replaceOnce('__PUBLIC_KEY__', pubkey);

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
${html}
</body>
</html>
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, doc);
// Artifact variant: same content, no document skeleton (the host supplies it).
const artifactPath = join(dirname(outPath), 'artifact.html');
writeFileSync(artifactPath, html);
console.log(`built ${outPath} (${(doc.length / 1024).toFixed(0)} KB) and ${artifactPath}`);
console.log(`public key: ${pubkey}`);
