// Copy the Laser Cut quote calculator into docs/lasercut/.
//
// Modelled on scripts/vendor-uvprint.mjs - the calculator grew out of the UV
// Print one and shares its rules:
//
//   1. NO FONT LICENCES. It ships no font data.
//
//   2. THE GATE CHECK IS INVERTED. Its only way out is the WhatsApp quote link
//      (id="waBtn"), and a customer asking for a price must never be asked to
//      sign in first, so there must be no exportBtn anywhere in the tree.
//
// Line endings: this repo has core.autocrlf=true, so text files in the working
// tree are CRLF; the tool's own folder keeps LF. Text files are converted on
// the way in, binaries copied untouched.
//
// Also copied: harga.md and pricing.json, the price guide for AI assistants
// that the tool's tools/build-ai-files.mjs writes (run it before vendoring).
//
// Excluded, deliberately: package.json, tools/ (tests, fixtures, samples, dev
// server) and .claude/. The destination keeps its own Malay README.
//
//     node scripts/vendor-lasercut.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, '..');
const SRC = path.join(SITE, '..', '23_Lasercut Languange Machine', 'quote');
const DEST = path.join(SITE, 'docs', 'lasercut');

const TEXT = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.txt', '.md', '.svg',
]);

let files = 0;
let converted = 0;

function writeText(to, buf) {
  // Normalise to LF first, so a file that is already CRLF is not doubled.
  const lf = buf.toString('utf8').replace(/\r\n/g, '\n');
  const out = Buffer.from(lf.replace(/\n/g, '\r\n'), 'utf8');
  fs.writeFileSync(to, out);
  if (out.length !== buf.length) converted++;
}

function copyInto(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const e of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, e.name);
    const to = path.join(toDir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.claude') continue;
      copyInto(from, to);
      continue;
    }
    const buf = fs.readFileSync(from);
    if (TEXT.has(path.extname(e.name).toLowerCase())) writeText(to, buf);
    else fs.writeFileSync(to, buf);
    files++;
  }
}

function allText(dir) {
  let out = '';
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out += allText(p);
    else if (TEXT.has(path.extname(e.name).toLowerCase())) out += fs.readFileSync(p, 'utf8');
  }
  return out;
}

// The tags that have to live in the TOOL'S index.html, because vendoring is a
// copy and anything added only to docs/ is erased by the next run - and the
// gate rule above, checked on the whole vendored tree.
function assertTags() {
  const html = fs.readFileSync(path.join(DEST, 'index.html'), 'utf8');
  for (const [what, needle] of [
    ['the Cloudflare beacon', '64b33f01984840f982c28feb1569fb91'],
    ['the export gate', '/shared/export-gate.js'],
  ]) {
    if (!html.includes(needle)) throw new Error(`the vendored index.html is missing ${what}`);
  }
  const src = allText(path.join(DEST, 'src'));
  // An id attribute in markup, or the id as a string literal in JS. A bare
  // /exportBtn/ would trip on the source index.html's own comment explaining
  // why there is no exportBtn - the same two patterns tools/test-ui.js uses.
  if (/id=["']exportBtn["']/.test(html) || /['"`]exportBtn['"`]/.test(src)) {
    throw new Error('exportBtn found in docs/lasercut - the WhatsApp quote would be behind sign-in');
  }
  if (!/id: 'waBtn'/.test(src)) throw new Error('the WhatsApp link id="waBtn" is missing from src/');
}

// The destination's own README is kept, not overwritten.
const keptReadme = fs.existsSync(path.join(DEST, 'README.md'))
  ? fs.readFileSync(path.join(DEST, 'README.md'))
  : null;

fs.rmSync(path.join(DEST, 'src'), { recursive: true, force: true });
copyInto(path.join(SRC, 'src'), path.join(DEST, 'src'));
for (const f of ['index.html', 'styles.css', 'harga.md', 'pricing.json']) {
  writeText(path.join(DEST, f), fs.readFileSync(path.join(SRC, f)));
  files++;
}
if (keptReadme) fs.writeFileSync(path.join(DEST, 'README.md'), keptReadme);

assertTags();
console.log(`vendored ${files} files into docs/lasercut (${converted} line-ending conversions)`);
console.log('beacon and gate script present; no exportBtn anywhere; WhatsApp link id="waBtn" present');
