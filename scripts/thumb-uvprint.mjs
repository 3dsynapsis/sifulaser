// Tile picture for the UV Print Calculator: docs/images/tools/uvprint.svg.
//
// Generated, not drawn or photographed, for the same reason as the six other
// generated tiles (docs/images/tools/README.md): a picture made from the tool's
// own output cannot drift away from the tool.
//
// The other generators live in their tool's folder as tools/thumb.mjs. This one
// lives here instead, and imports the VENDORED copy in docs/uvprint/src, so the
// picture is made by exactly the code that sifulaser.com serves. The only thing
// read from the source folder is a test fixture, because fixtures are
// deliberately not vendored.
//
// What is drawn is what the calculator itself shows for that file: the artwork
// in grey, the cut line in red (the outline plus its keyring hole), and the
// total for 10 sets of 3 mm, from quote(). Nothing is typed in by hand - if the
// cut detection, the preview or the rate card changes, re-running this changes
// the picture.
//
//     node scripts/thumb-uvprint.mjs [output.svg]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, '..');
const TOOL = path.join(SITE, 'docs', 'uvprint', 'src');
const FIXTURE = path.join(SITE, '..', '26_UV Print Calculator', 'tools', 'fixtures', 'a-cutcontour-objstm.pdf');
const OUT = process.argv[2] || path.join(SITE, 'docs', 'images', 'tools', 'uvprint.svg');

const { analyseFile } = await import(pathToFileURL(path.join(TOOL, 'analyse.js')).href);
const { quote } = await import(pathToFileURL(path.join(TOOL, 'pricing.js')).href);

const MATERIAL = '3mm';
const QTY = '10';

const r = await analyseFile(new Uint8Array(fs.readFileSync(FIXTURE)), path.basename(FIXTURE));
if (!r.ok || r.pieces.length !== 1) throw new Error(`fixture did not price as one piece: ${JSON.stringify(r.code || r.pieces)}`);
const q = quote(r.pieces, MATERIAL, QTY);
if (q.state !== 'priced') throw new Error(`fixture did not price: ${q.state}`);

// The same three colours the calculator's stylesheet uses in light mode
// (--art, --cut, --text), so the tile reads as a small copy of the preview.
const ART = '#8a94a3';
const CUT = '#e0262d';
const INK = '#16181d';

// Frame the whole artwork, not just the cut line: this fixture's print has a
// 3 mm bleed past the cut, and the calculator shows it.
const nums = r.preview.art.match(/-?\d+(\.\d+)?/g).map(Number);
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (let i = 0; i < nums.length; i += 2) {
  x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
  y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
}

// The piece sits top-left and the price tag overlaps its lower-right corner,
// like a label stuck on the job.
const BOX = { x: 3, y: 3, w: 74 };
const s = BOX.w / (x1 - x0);
const tx = BOX.x - x0 * s;
const ty = BOX.y - y0 * s;
const r3 = (v) => Math.round(v * 1000) / 1000;

const piece = r.preview.pieces[0];
const label = q.totalText;
const tag = { w: 44, h: 17, x: 96 - 44 - 1.5, y: 64 - 17 - 1.5 };

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" width="96" height="64">
<title>UV Print Calculator - artwork, garisan potong merah dan harga</title>
<g transform="translate(${r3(tx)} ${r3(ty)}) scale(${r3(s)})">
<path d="${piece.d}" fill="#dfe9f1" fill-opacity="0.55" stroke="none"/>
<path d="${r.preview.art}" fill="none" stroke="${ART}" stroke-width="${r3(1.1 / s)}" stroke-linejoin="round"/>
<path d="${piece.d}${piece.holesD}" fill="none" stroke="${CUT}" stroke-width="${r3(1.9 / s)}" stroke-linejoin="round"/>
</g>
<rect x="${tag.x}" y="${tag.y}" width="${tag.w}" height="${tag.h}" rx="4" fill="#ffffff" stroke="#d0d4da" stroke-width="0.8"/>
<text x="${tag.x + tag.w / 2}" y="${r3(tag.y + tag.h / 2 + 3.05)}" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="8.6" font-weight="700" fill="${INK}">${label}</text>
</svg>
`;

fs.writeFileSync(OUT, svg.replace(/\n/g, '\r\n'));
console.log(`wrote ${OUT}: ${r.pieces[0].wUm / 1000} x ${r.pieces[0].hUm / 1000} mm, ${MATERIAL} x ${QTY} = ${label}`);
