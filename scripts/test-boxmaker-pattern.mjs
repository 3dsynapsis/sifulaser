// Ujian corak Islamik Box Maker. Tiada kebergantungan; node sahaja.
//
//     node scripts/test-boxmaker-pattern.mjs
//
// Mengimport terus daripada docs/boxmaker/src - kod yang sifulaser.com
// hidangkan. Semakan geometri di sini ditulis semula sendiri (bukan diimport
// dari pattern.js) supaya ujian tidak mempercayai kod yang ia uji.
//
// Apa yang disemak dan kenapa:
//   * setiap corak, setiap sudut 25-80, dua lebar jejari:
//       - ada lubang                 - corak kosong = pengguna fikir alat rosak.
//       - gelang CCW dan ringkas     - gelang bersilang sendiri nampak elok di
//                                      skrin dan rosak di mesin.
//       - di dalam tetingkap         - tiada lubang terkeluar dari bingkai.
//       - jarak lubang >= jejari     - INI janji utama: kayu antara dua lubang
//                                      tidak pernah lebih nipis daripada yang
//                                      pengguna minta.
//   * kerf                           - dengan kerf k, jarak lubang >= jejari + k
//                                      (alur laser memakan k/2 setiap sisi).
//   * panel kotak sebenar            - semua gaya: lubang corak jauh dari garis
//                                      luar bersendi jari dan dari setiap mortis
//                                      / lubang engsel sekurang-kurangnya jejari.
//   * safeRect                       - tetingkap di dalam panel, di atas jalur
//                                      mortis lantai.
//   * input teruk                    - sifar, negatif, NaN, sel kecil melampau:
//                                      tak pernah campak.
//   * prestasi                       - muka 300x200 mm siap di bawah 1.5 s.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const GEOM = path.join(here, '..', 'docs', 'boxmaker', 'src', 'geom');
const P = await import(pathToFileURL(path.join(GEOM, 'pattern.js')).href);
const { buildBox } = await import(pathToFileURL(path.join(GEOM, 'box.js')).href);
const { PATTERNS, patternHoles, angleRange, safeRect } = P;

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 60) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}

// ---- geometri bebas --------------------------------------------------------

const area = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
};
const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
function cross(a, b, c, d) {
  const e = 1e-10;
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return (o1 > e && o2 < -e || o1 < -e && o2 > e) && (o3 > e && o4 < -e || o3 < -e && o4 > e);
}
function simple(r) {
  const n = r.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (cross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return false;
    }
  }
  return true;
}
function ptSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function inside(p, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) &&
        p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
}
/**
 * Jarak antara dua gelang; 0 kalau bersilang atau satu di dalam yang lain.
 * `boundary`: jarak antara sempadan sahaja (lubang di dalam garis luar).
 */
function ringDist(A, B, boundary = false) {
  if (!boundary && (inside(A[0], B) || inside(B[0], A))) return 0;
  let m = Infinity;
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const c = B[j], d = B[(j + 1) % B.length];
      if (cross(a, b, c, d)) return 0;
      m = Math.min(m, ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
    }
  }
  return m;
}
const bb = (r) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
/** Jarak minimum antara mana-mana dua lubang (kotak sempadan menapis pasangan jauh). */
function minPairDist(rings, limit) {
  const boxes = rings.map(bb);
  let m = Infinity;
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x1 + limit < b.x0 || b.x1 + limit < a.x0 || a.y1 + limit < b.y0 || b.y1 + limit < a.y0) continue;
      m = Math.min(m, ringDist(rings[i], rings[j]));
    }
  }
  return m;
}

// ---- setiap corak, setiap sudut ----------------------------------------------

const RECT = { x: 10, y: 6, w: 150, h: 90 };
for (const def of PATTERNS) {
  const [lo, hi] = angleRange(def.id);
  check(`${def.id}: julat sudut munasabah`, lo <= def.angle && def.angle <= hi && hi - lo >= 20, `${lo}-${hi}`);
  for (let a = lo; a <= hi; a += 5) {
    for (const strut of [1.5, 3]) {
      const tag = `${def.id} θ=${a} jejari=${strut}`;
      const { rings, stats } = patternHoles(RECT, { pattern: def.id, angle: a, strut, motif: 40 });
      check(`${tag}: ada lubang`, rings.length >= 8, `${rings.length}`);
      check(`${tag}: sudut dipakai`, stats.angle === a, `${stats.angle}`);
      let bad = 0, out = 0;
      for (const r of rings) {
        if (!(area(r) > 0) || !simple(r)) bad++;
        for (const [x, y] of r) {
          if (x < RECT.x + strut / 2 - 1e-6 || x > RECT.x + RECT.w - strut / 2 + 1e-6 ||
              y < RECT.y + strut / 2 - 1e-6 || y > RECT.y + RECT.h - strut / 2 + 1e-6) { out++; break; }
        }
      }
      check(`${tag}: gelang CCW ringkas`, bad === 0, `${bad} rosak`);
      check(`${tag}: dalam tetingkap`, out === 0, `${out} terkeluar`);
      const d = minPairDist(rings, strut);
      check(`${tag}: jarak lubang >= jejari`, d >= strut - 1e-6, `min ${d.toFixed(4)}`);
    }
  }
}

// ---- kerf ------------------------------------------------------------------------

for (const def of PATTERNS) {
  const { rings } = patternHoles(RECT, { pattern: def.id, strut: 2, kerf: 0.2, motif: 40 });
  const d = minPairDist(rings, 2.2);
  check(`${def.id}: kerf ditambah pada jarak`, d >= 2.2 - 1e-6, `min ${d.toFixed(4)}`);
}

// ---- panel kotak sebenar -------------------------------------------------------------

let panelsTested = 0;
for (const style of ['open', 'lidded', 'double', 'shoebox', 'almari']) {
  for (const extra of [{}, { dividersX: 2, dividersY: 1 }]) {
    let box;
    try { box = buildBox({ style, length: 200, width: 140, height: 90, ...extra }); } catch (e) {
      check(`buildBox ${style}`, false, e.message); continue;
    }
    const t = box.params.thickness;
    for (const panel of box.panels) {
      const strut = 2.5;
      const win = safeRect(panel, t + strut / 2);
      if (!win) continue;
      const pb = bb(panel.outlineNominal);
      check(`${style}/${panel.id}: safeRect dalam panel`,
        win.x >= pb.x0 && win.y >= pb.y0 && win.x + win.w <= pb.x1 && win.y + win.h <= pb.y1);
      const { rings } = patternHoles(win, {
        pattern: 'rozet12', strut, avoid: panel.holesNominal, bound: panel.outlineNominal, motif: 30,
      });
      panelsTested++;
      let worst = Infinity;
      for (const r of rings) {
        if (!inside(r[0], panel.outlineNominal)) { worst = -1; break; }
        worst = Math.min(worst, ringDist(r, panel.outlineNominal, true));
        for (const o of panel.holesNominal) worst = Math.min(worst, ringDist(r, o));
      }
      check(`${style}${extra.dividersX ? '+pembahagi' : ''}/${panel.id}: jauh dari sendi & mortis`,
        rings.length === 0 || worst >= strut - 1e-6, `min ${worst.toFixed(3)}, ${rings.length} lubang`);
      // Mortis lantai di jalur bawah dinding: tetingkap di atasnya.
      const lowHoles = panel.holesNominal.map(bb).filter((h) => h.y1 < pb.y0 + (pb.y1 - pb.y0) * 0.35);
      const cover = lowHoles.reduce((s, h) => s + h.x1 - h.x0, 0);
      if (cover > (pb.x1 - pb.x0) * 0.3) {
        check(`${style}/${panel.id}: tetingkap di atas mortis lantai`,
          win.y >= Math.max(...lowHoles.map((h) => h.y1)), `${win.y}`);
      }
    }
  }
}
check('panel kotak diuji', panelsTested >= 20, `${panelsTested}`);

// ---- halangan: plak logo di tengah ------------------------------------------------

{
  const plaque = [];
  for (let i = 0; i < 48; i++) plaque.push([85 + 22 * Math.cos(i * Math.PI / 24), 51 + 22 * Math.sin(i * Math.PI / 24)]);
  const { rings } = patternHoles(RECT, { pattern: 'rozet12', strut: 2, avoid: [plaque], motif: 40 });
  let worst = Infinity;
  for (const r of rings) worst = Math.min(worst, ringDist(r, plaque));
  check('plak logo: lubang jauhi plak >= jejari', worst >= 2 - 1e-6, `min ${worst.toFixed(3)}`);
  check('plak logo: corak masih ada di sekeliling', rings.length > 20, `${rings.length}`);
  const tiny = [[84, 50], [86, 50], [86, 52], [84, 52]];
  const r2 = patternHoles(RECT, { pattern: 'rozet12', strut: 2, avoid: [tiny], motif: 40 }).rings;
  check('halangan kecil di dalam lubang: lubang itu digugurkan', r2.every((r) => ringDist(r, tiny) >= 2 - 1e-6));
}

// ---- input teruk -------------------------------------------------------------------

const nasty = [
  [{ x: 0, y: 0, w: 0, h: 0 }, {}],
  [{ x: 0, y: 0, w: -5, h: 10 }, { strut: -1 }],
  [{ x: 0, y: 0, w: 50, h: 50 }, { strut: NaN, angle: NaN, motif: NaN }],
  [{ x: 0, y: 0, w: 50, h: 50 }, { pattern: 'tiada', angle: 200, motif: 0.0001 }],
  [{ x: 0, y: 0, w: 50, h: 50 }, { strut: 40 }],
  [{ x: 0, y: 0, w: 3000, h: 3000 }, { motif: 4 }],
  [{ x: 0, y: 0, w: 50, h: 50 }, { avoid: [null, [], [[0, 0]], [[1, 1], [2, 2], [3, 3]]] }],
];
for (const [rect, opts] of nasty) {
  let ok = true, res;
  try { res = patternHoles(rect, opts); } catch (e) { ok = false; res = e.message; }
  check(`input teruk ${JSON.stringify(opts)}: tak campak`, ok && Array.isArray(res.rings), String(res));
}
check('safeRect panel kecil -> null', safeRect({ outline: [[0, 0], [4, 0], [4, 4], [0, 4]], holes: [] }, 3) === null);

// ---- prestasi ------------------------------------------------------------------------

{
  const t0 = performance.now();
  const { rings } = patternHoles({ x: 0, y: 0, w: 300, h: 200 }, { pattern: 'rozet12', motif: 30, strut: 2 });
  const ms = performance.now() - t0;
  check(`prestasi 300x200 (${rings.length} lubang, ${ms.toFixed(0)} ms)`, ms < 1500 && rings.length > 100);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
