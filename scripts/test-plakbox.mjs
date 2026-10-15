// Ujian Plak Box: tapak cetak 3D dan saiz kotak akrilik. Tiada kebergantungan.
//
//     node scripts/test-plakbox.mjs
//
// Mengimport terus daripada docs/plakbox/src - kod yang sifulaser.com hidangkan.
//
// Apa yang disemak dan kenapa:
//   * mesh tertutup        - setiap sisi berarah muncul sekali dan pasangan
//                            terbaliknya sekali. Mesh yang bocor dicetak
//                            pelik atau ditolak slicer.
//   * tiada segitiga leper - segitiga luas sifar ialah punca biasa amaran
//                            "non-manifold" dalam Bambu Studio.
//   * isipadu              - isipadu bertanda mesh (teorem divergens) sama
//                            dengan jumlah sel grid, dan POSITIF (normal ke luar).
//   * kotak sempadan       - tapak tepat baseL x baseW x baseH, bermula di z = 0.
//   * akrilik muat         - dinding akrilik duduk dalam alur dengan kelonggaran
//                            yang diminta di KEDUA-DUA sisi; plak muat di dalam
//                            dengan ruang yang diminta; keping cantum hujung ke
//                            hujung memberi saiz luar yang betul.
//   * keratan              - pada titik tertentu, tinggi tapak ialah paras yang
//                            betul: bibir, alur, poket, tingkat.
//   * input teruk          - sifar, negatif, NaN, teks: tak pernah campak.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.join(here, '..', 'docs', 'plakbox', 'src', 'geom', 'base.js');
const { buildPlakBox, DEFAULTS, trianglesToStl } = await import(pathToFileURL(MOD).href);

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 60) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** Semakan mesh: tertutup, berorientasi, tiada segitiga leper; pulangkan isipadu bertanda. */
function meshReport(tris) {
  const key = (i) => `${tris[i]},${tris[i + 1]},${tris[i + 2]}`;
  const edges = new Map();
  let degenerate = 0;
  let vol = 0;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let b = 0; b < tris.length; b += 9) {
    const ks = [key(b), key(b + 3), key(b + 6)];
    for (let k = 0; k < 3; k++) {
      const e = `${ks[k]}|${ks[(k + 1) % 3]}`;
      edges.set(e, (edges.get(e) || 0) + 1);
    }
    const ax = tris[b + 3] - tris[b], ay = tris[b + 4] - tris[b + 1], az = tris[b + 5] - tris[b + 2];
    const bx = tris[b + 6] - tris[b], by = tris[b + 7] - tris[b + 1], bz = tris[b + 8] - tris[b + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (Math.hypot(cx, cy, cz) / 2 < 1e-6) degenerate++;
    // Isipadu bertanda tetrahedron (asalan, a, b, c).
    const [px, py, pz] = [tris[b], tris[b + 1], tris[b + 2]];
    const [qx, qy, qz] = [tris[b + 3], tris[b + 4], tris[b + 5]];
    const [rx, ry, rz] = [tris[b + 6], tris[b + 7], tris[b + 8]];
    vol += (px * (qy * rz - qz * ry) - py * (qx * rz - qz * rx) + pz * (qx * ry - qy * rx)) / 6;
    for (let k = 0; k < 9; k += 3) {
      x0 = Math.min(x0, tris[b + k]); x1 = Math.max(x1, tris[b + k]);
      y0 = Math.min(y0, tris[b + k + 1]); y1 = Math.max(y1, tris[b + k + 1]);
      z0 = Math.min(z0, tris[b + k + 2]); z1 = Math.max(z1, tris[b + k + 2]);
    }
  }
  let open = 0, dup = 0;
  for (const [e, c] of edges) {
    if (c > 1) dup++;
    const [a, b] = e.split('|');
    if ((edges.get(`${b}|${a}`) || 0) !== c) open++;
  }
  return { open, dup, degenerate, vol, bbox: { x0, y0, z0, x1, y1, z1 } };
}

const CASES = [
  {},
  { stepW: 0 },
  { pocket: false },
  { pocket: false, stepW: 0 },
  { plakL: 150, plakW: 60, plakH: 200, acrylic: 2, gap: 6, rim: 8, stepW: 3, stepH: 2 },
  { plakL: 300, plakW: 120, plakH: 420, acrylic: 5, gap: 15, gapTop: 25, baseH: 40, rim: 20, grooveDepth: 8 },
  { grooveClear: 0, pocketClear: 0 },
  { stepW: 30, rim: 12 },                 // tingkat dihadkan oleh bibir
  { grooveDepth: 20, baseH: 10 },          // alur dihadkan oleh tinggi tapak
  { gap: 2, pocketClear: 1 },              // poket dibuang: dinding terlalu nipis
  { stepH: 30, baseH: 12 },
  { pocketDepth: 10, baseH: 8 },
];
// Rawak, tetapi boleh diulang.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let k = 0; k < 40; k++) {
  CASES.push({
    plakL: 30 + rnd() * 500, plakW: 10 + rnd() * 200, plakH: 30 + rnd() * 600,
    acrylic: 1.5 + rnd() * 4.5, gap: 2 + rnd() * 30, gapTop: rnd() * 40,
    baseH: 8 + rnd() * 50, rim: 4 + rnd() * 30, grooveDepth: 1 + rnd() * 12,
    grooveClear: rnd() * 1.5, pocket: rnd() > 0.3, pocketDepth: 0.5 + rnd() * 6,
    pocketClear: rnd() * 3, stepW: rnd() > 0.4 ? rnd() * 20 : 0, stepH: rnd() * 10,
  });
}

for (const input of CASES) {
  const tag = JSON.stringify(input).slice(0, 90);
  let r;
  try { r = buildPlakBox(input); } catch (e) { check(`${tag}: tak campak`, false, e.message); continue; }
  const { params: p, derived: d, mesh, stats, grid } = r;
  const m = meshReport(mesh);
  check(`${tag}: mesh tertutup`, m.open === 0, `${m.open} sisi terbuka`);
  check(`${tag}: tiada sisi berganda`, m.dup === 0, `${m.dup}`);
  check(`${tag}: tiada segitiga leper`, m.degenerate === 0, `${m.degenerate}`);
  check(`${tag}: isipadu positif = grid`, m.vol > 0 && Math.abs(m.vol - stats.volumeMm3) < Math.max(0.5, stats.volumeMm3 * 1e-5),
    `${m.vol.toFixed(2)} lawan ${stats.volumeMm3.toFixed(2)}`);
  check(`${tag}: kotak sempadan`, near(m.bbox.x0, 0, 1e-3) && near(m.bbox.y0, 0, 1e-3) && near(m.bbox.z0, 0, 1e-3)
    && near(m.bbox.x1, d.baseL, 1e-3) && near(m.bbox.y1, d.baseW, 1e-3) && near(m.bbox.z1, p.baseH, 1e-3),
    JSON.stringify(m.bbox));

  // Akrilik dan alur.
  const t = p.acrylic, c = p.grooveClear;
  check(`${tag}: alur = t + 2c`, near(d.groove.x1 - d.grooveIn.x1, t + 2 * c) && near(d.grooveIn.x0 - d.groove.x0, t + 2 * c));
  check(`${tag}: kelonggaran luar dan dalam sama`, near(d.cover.x0 - d.groove.x0, c) && near(d.grooveIn.x0 - (d.cover.x0 + t), c)
    && near(d.cover.y0 - d.groove.y0, c) && near(d.grooveIn.y0 - (d.cover.y0 + t), c));
  check(`${tag}: plak + ruang = dalam kotak`, near(d.plak.x1 - d.plak.x0, p.plakL) && near(d.plak.y1 - d.plak.y0, p.plakW)
    && near(d.plak.x0 - (d.cover.x0 + t), p.gap) && near(d.plak.y0 - (d.cover.y0 + t), p.gap));
  check(`${tag}: kotak luar`, near(d.cover.x1 - d.cover.x0, d.coverOutL) && near(d.cover.y1 - d.cover.y0, d.coverOutW));
  const [atas, depan, sisi] = d.panels;
  check(`${tag}: keping cantum = saiz luar`, near(depan.w, d.coverOutL, 1e-5) && near(sisi.w + 2 * t, d.coverOutW, 1e-5)
    && near(atas.w, d.coverOutL, 1e-5) && near(atas.h, d.coverOutW, 1e-5) && near(depan.h + t, d.coverH, 1e-5)
    && near(sisi.h, depan.h, 1e-9));
  check(`${tag}: bumbung = puncak plak + ruang atas`, near(d.coverTop - t, d.plakZ + p.plakH + p.gapTop, 1e-6)
    && near(d.coverZ, p.baseH - p.grooveDepth));

  // Keratan tinggi pada titik yang diketahui.
  const at = (x, y) => {
    const i = grid.xs.findIndex((v, k) => x >= v && x < grid.xs[k + 1]);
    const j = grid.ys.findIndex((v, k) => y >= v && y < grid.ys[k + 1]);
    return grid.H[i][j];
  };
  const midY = d.baseW / 2;
  check(`${tag}: dasar alur`, near(at((d.cover.x0 + d.cover.x1) / 2, (d.cover.y0 + d.cover.y0 + t) / 2), p.baseH - p.grooveDepth, 1e-6));
  check(`${tag}: bibir penuh`, near(at(p.stepW + (p.rim - p.stepW) / 2, midY), p.baseH, 1e-6));
  check(`${tag}: tengah`, near(at(d.baseL / 2, midY), p.pocket ? p.baseH - p.pocketDepth : p.baseH, 1e-6));
  if (p.stepW > 0) check(`${tag}: tingkat`, near(at(p.stepW / 2, midY), p.baseH - p.stepH, 1e-6));
  check(`${tag}: lantai >= 2 mm`, Math.min(...grid.H.flat()) >= 2 - 1e-9, `${Math.min(...grid.H.flat())}`);

  // STL: saiz fail betul.
  const buf = trianglesToStl(mesh);
  check(`${tag}: saiz STL`, buf.byteLength === 84 + stats.triangles * 50);
}

// Lalai: nombor yang pengguna akan nampak.
{
  const { derived: d, params: p } = buildPlakBox(DEFAULTS);
  check('lalai: kotak luar 256 x 106', near(d.coverOutL, 256) && near(d.coverOutW, 106), `${d.coverOutL} x ${d.coverOutW}`);
  check('lalai: tapak 280.8 x 130.8', near(d.baseL, 280.8) && near(d.baseW, 130.8), `${d.baseL} x ${d.baseW}`);
  check('lalai: tinggi kotak', near(d.coverH, 4 + 310 - 2 + 10 + 3), `${d.coverH}`);
  check('lalai: poket hidup', p.pocket === true);
}

// Input teruk.
for (const bad of [{ plakL: 0 }, { plakL: -5, plakW: NaN }, { acrylic: 'abc' }, { baseH: 1e9 }, null, undefined, { pocket: 'ya' }]) {
  let ok = true;
  try { buildPlakBox(bad || undefined); } catch (e) { ok = false; }
  check(`input teruk ${JSON.stringify(bad)}: tak campak`, ok);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
