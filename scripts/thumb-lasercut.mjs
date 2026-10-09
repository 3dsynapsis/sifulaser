// Tile picture for the Laser Cut calculator: docs/images/tools/lasercut.svg.
//
// Generated, not drawn, for the same reason as the other generated tiles
// (docs/images/tools/README.md): a picture made from the tool's own output
// cannot drift away from the tool. Modelled on scripts/thumb-uvprint.mjs.
//
// It imports the VENDORED copy in docs/lasercut/src, so the picture is made by
// exactly the code sifulaser.com serves, and reads one sample file from the
// tool's source folder (samples are deliberately not vendored): a 20 x 12 cm
// name plaque with a cut outline and hanging holes, engraved lettering and a
// score border.
//
// What is drawn is what the calculator itself shows for that file on plywood
// 3 mm: the board, the engraving, the score line in blue, the cut in red, and
// the price range for one set from quote(). Nothing is typed in by hand.
//
//     node scripts/thumb-lasercut.mjs [output.svg]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, '..');
const TOOL = path.join(SITE, 'docs', 'lasercut', 'src');
const SAMPLE = path.join(SITE, '..', '23_Lasercut Languange Machine', 'quote', 'tools', 'samples', 'plaque-200x120.pdf');
const OUT = process.argv[2] || path.join(SITE, 'docs', 'images', 'tools', 'lasercut.svg');

const { analyseFile } = await import(pathToFileURL(path.join(TOOL, 'analyse.js')).href);
const { quote } = await import(pathToFileURL(path.join(TOOL, 'pricing.js')).href);

const MATERIAL = 'ply3';
const QTY = '1';

const r = await analyseFile(new Uint8Array(fs.readFileSync(SAMPLE)), path.basename(SAMPLE));
if (!r.ok || r.pieces.length !== 1) throw new Error(`sample did not price as one piece: ${JSON.stringify(r.code || r.pieces)}`);
const q = quote(r.pieces, r.laser, MATERIAL, QTY);
if (q.state !== 'priced') throw new Error(`sample did not price: ${q.state}`);

// The calculator's own light-mode colours for plywood (src/view.js LOOK.ply,
// styles.css --cut / --score), so the tile reads as a small copy of its preview.
const BOARD = '#e8cfa0';
const ENGRAVE = '#5a3a1c';
const CUT = '#e0262d';
const SCORE = '#2563eb';
const INK = '#16181d';

const p = r.preview;
const b = p.bounds;
// The plaque sits top-left and the price tag overlaps its lower-right corner,
// like a label stuck on the job.
const BOX = { x: 3, y: 4, w: 78 };
const s = BOX.w / (b.x1 - b.x0);
const tx = BOX.x - b.x0 * s;
const ty = BOX.y - b.y0 * s;
const r3 = (v) => Math.round(v * 1000) / 1000;

const piece = p.pieces[0];
const label = q.rangeText;
const tag = { w: 56, h: 17, x: 96 - 56 - 1.5, y: 64 - 17 - 1.5 };

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" width="96" height="64">
<title>Kalkulator Laser Cut - potong merah, ukiran dan julat harga</title>
<g transform="translate(${r3(tx)} ${r3(ty)}) scale(${r3(s)})">
<path d="${piece.d}${piece.holesD}" fill="${BOARD}" fill-rule="evenodd" stroke="none"/>
<path d="${p.fillD}" fill="${ENGRAVE}" fill-rule="evenodd" stroke="none"/>
<path d="${p.scoreD}" fill="none" stroke="${SCORE}" stroke-width="${r3(1.0 / s)}" stroke-linejoin="round"/>
<path d="${p.cutD}" fill="none" stroke="${CUT}" stroke-width="${r3(1.9 / s)}" stroke-linejoin="round"/>
</g>
<rect x="${tag.x}" y="${tag.y}" width="${tag.w}" height="${tag.h}" rx="4" fill="#ffffff" stroke="#d0d4da" stroke-width="0.8"/>
<text x="${tag.x + tag.w / 2}" y="${r3(tag.y + tag.h / 2 + 2.9)}" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="8.2" font-weight="700" fill="${INK}">${label}</text>
</svg>
`;

fs.writeFileSync(OUT, svg.replace(/\n/g, '\r\n'));
console.log(`wrote ${OUT}: ${r.pieces[0].wUm / 1000} x ${r.pieces[0].hUm / 1000} mm, ${MATERIAL} x ${QTY} = ${label}`);
