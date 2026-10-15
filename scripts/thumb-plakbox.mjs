// Gambar tile untuk Plak Box: docs/images/tools/plakbox.svg.
//
// Dijana, bukan dilukis, atas sebab yang sama seperti tile lain yang dijana
// (docs/images/tools/README.md): gambar yang dibuat daripada output alat tidak
// boleh hanyut daripada alat. Mengimport `buildPlakBox()` daripada
// docs/plakbox/src - kod yang sifulaser.com hidangkan - dan melukis pandangan
// DEPAN: tapak bertingkat, plak di dalam, kotak akrilik dengan selotip pada
// bucunya, pada kedudukan yang geometri sebenar berikan.
//
//     node scripts/thumb-plakbox.mjs [output.svg]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, '..');
const GEOM = path.join(SITE, 'docs', 'plakbox', 'src', 'geom', 'base.js');
const OUT = process.argv[2] || path.join(SITE, 'docs', 'images', 'tools', 'plakbox.svg');

const { buildPlakBox } = await import(pathToFileURL(GEOM).href);

// Plak lebih rendah daripada lalai supaya kotak muat bingkai 3:2 tanpa jadi halus.
const { params: p, derived: d } = buildPlakBox({ plakL: 230, plakW: 80, plakH: 200, gap: 12, rim: 14 });

const r3 = (v) => Math.round(v * 1000) / 1000;
const H = d.totalH;
const Z = (z) => r3(H - z);            // z ke atas -> SVG ke bawah
const rect = (x0, z0, x1, z1, attrs) =>
  `<rect x="${r3(x0)}" y="${Z(z1)}" width="${r3(x1 - x0)}" height="${r3(z1 - z0)}" ${attrs}/>`;

// Bingkai 3:2 di sekeliling kotak, berpusat.
const pad = 10;
const vbH = H + 2 * pad;
const vbW = vbH * 1.5;
const vbX = d.baseL / 2 - vbW / 2;

const WOOD = '#6b4430';
const WOOD_DARK = '#4f3122';
const PLAK = '#e3cfa3';
const GLASS = 'rgba(200,232,242,0.22)';
const EDGE = '#7fa6b5';
const TAPE = 'rgba(201,164,106,0.85)';
const c = d.cover;
const s = p.stepW;
const tw = 6;

const parts = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r3(vbX)} ${r3(-pad)} ${r3(vbW)} ${r3(vbH)}" width="96" height="64">`,
  '<title>Plak Box - plak dalam kotak akrilik, tapak cetak 3D</title>',
  // Bayang di bawah tapak.
  `<ellipse cx="${r3(d.baseL / 2)}" cy="${Z(0) + 3}" rx="${r3(d.baseL * 0.52)}" ry="5" fill="rgba(0,0,0,0.12)"/>`,
  // Tapak: badan bertingkat dilihat dari depan.
  rect(0, 0, d.baseL, p.baseH - p.stepH, `fill="${WOOD_DARK}"`),
  rect(s, 0, d.baseL - s, p.baseH, `fill="${WOOD}"`),
  // Plak di dalam: tapak plaknya sendiri, papan gelap, muka kayu cerah
  // dengan ukiran - bentuk biasa plak cenderahati, dalam kotak sempadan yang
  // pengguna masukkan.
  rect(d.plak.x0 + 10, d.plakZ, d.plak.x1 - 10, d.plakZ + 14, `fill="#2b2b2d"`),
  rect(d.plak.x0 + 22, d.plakZ + 14, d.plak.x1 - 22, d.plakZ + p.plakH, `fill="${WOOD_DARK}"`),
  rect(d.plak.x0 + 31, d.plakZ + 23, d.plak.x1 - 31, d.plakZ + p.plakH - 9, `fill="${PLAK}"`),
  ...(() => {
    const x0 = d.plak.x0 + 31, x1 = d.plak.x1 - 31, top = d.plakZ + p.plakH - 9, w = x1 - x0;
    const ink = 'fill="#8a6a45"';
    return [
      rect(x0 + w * 0.22, top - 26, x1 - w * 0.22, top - 16, ink),
      rect(x0 + w * 0.12, top - 110, x1 - w * 0.12, top - 40, 'fill="#b39368"'),
      rect(x0 + w * 0.18, top - 128, x1 - w * 0.18, top - 122, ink),
      rect(x0 + w * 0.28, top - 140, x1 - w * 0.28, top - 135, ink),
    ];
  })(),
  // Akrilik: muka depan jernih dengan garis tepi.
  rect(c.x0, p.baseH, c.x1, d.coverTop, `fill="${GLASS}" stroke="${EDGE}" stroke-width="1.6"`),
  // Selotip: dua bucu tegak dan tepi bumbung.
  rect(c.x0, p.baseH, c.x0 + tw, d.coverTop, `fill="${TAPE}"`),
  rect(c.x1 - tw, p.baseH, c.x1, d.coverTop, `fill="${TAPE}"`),
  rect(c.x0, d.coverTop - tw, c.x1, d.coverTop, `fill="${TAPE}"`),
  // Kilauan pada akrilik.
  `<path d="M${r3(c.x0 + 22)} ${Z(d.coverTop - 18)}L${r3(c.x0 + 52)} ${Z(d.coverTop - 18)}L${r3(c.x0 + 14)} ${Z(p.baseH + 30)}Z" fill="rgba(255,255,255,0.45)"/>`,
  '</svg>',
];
fs.writeFileSync(OUT, parts.join('\n') + '\n');
console.log(`ditulis ${path.relative(SITE, OUT)} (${d.baseL.toFixed(1)} x ${H.toFixed(1)} mm)`);
