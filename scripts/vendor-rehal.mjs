// Copy the Rehal Generator into docs/rehal/, the way the tool's README says to.
//
// This existed only as four lines of shell in 25_Rehal Generator/README.md, and
// four lines of shell is exactly the sort of thing that gets run slightly
// differently the second time. Two details are easy to get wrong by hand and
// both are checked here rather than trusted:
//
//   1. THE FONT LICENCES. src/font/CREDITS.txt and src/font/LICENCES.txt carry
//      the Hershey terms and the SIL OFL, and both make redistribution of the
//      glyph data conditional on shipping them. If either is missing or its
//      CONTENT has changed, this refuses to finish rather than publishing a
//      tree that is not licensed to be published.
//
//   2. LINE ENDINGS. This repo has core.autocrlf=true, so every text file in
//      the working tree is CRLF and every text file in the object store is LF.
//      The tool's own directory is not a git repo and keeps LF. Copying byte
//      for byte would leave docs/rehal/ as the one tree in docs/ with LF
//      working files - harmless to git, confusing to the next person who runs
//      `file` on it - so text files are converted on the way in. Binary files
//      are copied untouched, which is why the extension list below is a list
//      of what to convert rather than a list of what to skip.
//
// Excluded, deliberately: package.json (npm metadata for the dev tree only),
// tools/ (the test suites and the dev server), .claude/ (launch config), and
// README.md, which the destination keeps its own Malay "salinan vendored"
// version of - the same arrangement docs/boxmaker/ and docs/stand/ use.
//
//     node scripts/vendor-rehal.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, '..');
const SRC = path.join(SITE, '..', '25_Rehal Generator');
const DEST = path.join(SITE, 'docs', 'rehal');

const TEXT = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.txt', '.md', '.svg',
]);

let files = 0;
let converted = 0;

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
    if (TEXT.has(path.extname(e.name).toLowerCase())) {
      // Normalise to LF first, so a file that is already CRLF is not doubled.
      const lf = buf.toString('utf8').replace(/\r\n/g, '\n');
      const out = Buffer.from(lf.replace(/\n/g, '\r\n'), 'utf8');
      fs.writeFileSync(to, out);
      if (out.length !== buf.length) converted++;
    } else {
      fs.writeFileSync(to, buf);
    }
    files++;
  }
}

// The licence files, checked on CONTENT rather than on bytes - the line-ending
// conversion above changes the bytes of every text file including these two,
// and a byte comparison would fail every single run for the wrong reason.
function assertLicences() {
  for (const name of ['CREDITS.txt', 'LICENCES.txt']) {
    const a = path.join(SRC, 'src', 'font', name);
    const b = path.join(DEST, 'src', 'font', name);
    if (!fs.existsSync(a)) throw new Error(`source is missing src/font/${name}`);
    if (!fs.existsSync(b)) throw new Error(`vendored copy is missing src/font/${name}`);
    const norm = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    if (norm(a) !== norm(b)) throw new Error(`src/font/${name} did not survive vendoring intact`);
  }
}

// The three tags that have to live in the TOOL'S index.html, because vendoring
// is a copy and anything added only to docs/ is erased by the next run.
function assertTags() {
  const html = fs.readFileSync(path.join(DEST, 'index.html'), 'utf8');
  for (const [what, needle] of [
    ['the Cloudflare beacon', '64b33f01984840f982c28feb1569fb91'],
    ['the export gate', '/shared/export-gate.js'],
    ['the export button id the gate matches', 'id="exportBtn"'],
  ]) {
    if (!html.includes(needle)) throw new Error(`the vendored index.html is missing ${what}`);
  }
}

// The destination's own README is kept, not overwritten.
const keptReadme = fs.existsSync(path.join(DEST, 'README.md'))
  ? fs.readFileSync(path.join(DEST, 'README.md'))
  : null;

for (const dir of ['src', 'vendor']) {
  fs.rmSync(path.join(DEST, dir), { recursive: true, force: true });
  if (fs.existsSync(path.join(SRC, dir))) copyInto(path.join(SRC, dir), path.join(DEST, dir));
}
for (const f of ['index.html', 'styles.css']) {
  const buf = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
  fs.writeFileSync(path.join(DEST, f), Buffer.from(buf.replace(/\n/g, '\r\n'), 'utf8'));
  files++;
}
if (keptReadme) fs.writeFileSync(path.join(DEST, 'README.md'), keptReadme);

assertLicences();
assertTags();
console.log(`vendored ${files} files into docs/rehal (${converted} line-ending conversions)`);
console.log('font licences present and content-identical; beacon, gate and export id present');
