// Gambar tile untuk Tray Organizer: docs/images/tools/tray.svg.
//
// Dijana, bukan dilukis, atas sebab yang sama seperti tile lain yang dijana
// (docs/images/tools/README.md): gambar yang dibuat daripada output alat tidak
// boleh hanyut daripada alat. Mengimport `buildTray()` daripada docs/tray/src -
// kod yang sama yang sifulaser.com hidangkan - dan melukis pandangan ATAS
// dulang: dinding, pembahagi dan petak, pada kedudukan yang geometri sebenar
// berikan. Petak sengaja tak seragam, sebab itulah yang membezakan alat ini
// daripada Box Maker di sebelahnya.
//
//     node scripts/thumb-tray.mjs [output.svg]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, '..');
const GEOM = path.join(SITE, 'docs', 'tray', 'src', 'geom', 'tray.js');
const OUT = process.argv[2] || path.join(SITE, 'docs', 'images', 'tools', 'tray.svg');

const { buildTray } = await import(pathToFileURL(GEOM).href);

// Nisbah 3:2 supaya dulang memenuhi bingkai 96 x 64 tile.
const tray = buildTray({
  length: 240, width: 160, height: 45, thickness: 4,
  cols: [2.2, 1, 1.4], rows: [1, 1.8],
});
const { params: p, derived: d } = tray;
if (!d.divOK) throw new Error('dulang tile tidak menjana pembahagi');

const WALL = '#b9a27f';   // --wall dalam styles.css alat
const CELL = '#fbfaf7';   // --cell
const SHADE = 'rgba(0,0,0,0.10)';
const r3 = (v) => Math.round(v * 1000) / 1000;
const { length: L, width: W, thickness: t } = p;
const Y = (y) => W - y; // y dulang ke atas -> SVG ke bawah; depan di bawah

// Padding kecil supaya dinding tidak menyentuh pinggir tile.
const pad = 6;
const parts = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad * 2 / 3} ${L + pad * 2} ${W + pad * 4 / 3}" width="96" height="64">`);
parts.push('<title>Tray Organizer - dulang berpetak, saiz petak bebas</title>');
// Bayang nipis di bawah supaya dulang nampak berdiri atas tile.
parts.push(`<rect x="${r3(1.5)}" y="${r3(2)}" width="${L}" height="${W}" rx="3" fill="${SHADE}"/>`);
// Dinding luar: satu gelang dengan lubang dalaman.
parts.push(`<path fill="${WALL}" fill-rule="evenodd" d="M0 0H${L}V${W}H0Z M${t} ${t}V${r3(W - t)}H${r3(L - t)}V${t}Z"/>`);
// Petak.
for (const c of d.cells) {
  parts.push(`<rect x="${r3(c.x)}" y="${r3(Y(c.y + c.h))}" width="${r3(c.w)}" height="${r3(c.h)}" fill="${CELL}"/>`);
}
// Pembahagi, pada kedudukan yang geometri berikan.
for (const x of d.xDiv) {
  parts.push(`<rect x="${r3(x - t / 2)}" y="${r3(Y(W - t))}" width="${t}" height="${r3(W - 2 * t)}" fill="${WALL}"/>`);
}
for (const y of d.yDiv) {
  parts.push(`<rect x="${t}" y="${r3(Y(y + t / 2))}" width="${r3(L - 2 * t)}" height="${t}" fill="${WALL}"/>`);
}
parts.push('</svg>');

fs.writeFileSync(OUT, parts.join('\n').replace(/\n/g, '\r\n') + '\r\n');
console.log(`wrote ${OUT}: ${L} x ${W} mm, ${d.cellCount} petak, ${d.dividers.x.length + d.dividers.y.length} pembahagi`);
