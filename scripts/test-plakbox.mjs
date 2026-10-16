// Ujian Plak Box: tapak cetak 3D (lima jenis) dan saiz kotak akrilik.
// Tiada kebergantungan.
//
//     node scripts/test-plakbox.mjs
//
// Mengimport terus daripada docs/plakbox/src - kod yang sifulaser.com hidangkan.
//
// Apa yang disemak dan kenapa (untuk SETIAP jasad setiap jenis):
//   * mesh tertutup        - setiap sisi berarah muncul sekali dan pasangan
//                            terbaliknya sekali. Mesh yang bocor dicetak
//                            pelik atau ditolak slicer.
//   * tiada segitiga leper - segitiga luas sifar ialah punca biasa amaran
//                            "non-manifold" dalam Bambu Studio.
//   * isipadu              - positif (normal ke luar), dan untuk beberapa jenis
//                            sama dengan kiraan tangan yang bebas daripada kod.
//   * TANPA SUPPORT        - setiap segitiga yang menghadap ke bawah (kecuali
//                            muka bawah di plat) tidak lebih landai daripada
//                            45 darjah. Itulah janji setiap jenis tapak.
//   * kotak sempadan       - tapak tepat baseL x baseW, bermula di z = 0.
//   * lantai               - di bawah alur dan poket sekurang-kurangnya 2 mm
//                            bahan, termasuk di atas serong kaki terapung.
//   * akrilik muat         - dinding akrilik duduk dalam alur dengan kelonggaran
//                            yang diminta di KEDUA-DUA sisi; keping cantum
//                            hujung ke hujung memberi saiz luar yang betul.
//   * input teruk          - sifar, negatif, NaN, teks, jenis palsu: tak campak.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.join(here, '..', 'docs', 'plakbox', 'src', 'geom', 'base.js');
const { buildPlakBox, DEFAULTS, BASE_TYPES, trianglesToStl } = await import(pathToFileURL(MOD).href);

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 60) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** Semakan mesh: tertutup, berorientasi, tiada leper, overhang; isipadu bertanda. */
function meshReport(tris) {
  const key = (i) => `${tris[i]},${tris[i + 1]},${tris[i + 2]}`;
  const edges = new Map();
  let degenerate = 0, vol = 0, worstDown = 1, bottomMinX = Infinity;
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
    const len = Math.hypot(cx, cy, cz);
    if (len / 2 < 1e-6) degenerate++;
    const onBed = Math.abs(tris[b + 2]) < 1e-6 && Math.abs(tris[b + 5]) < 1e-6 && Math.abs(tris[b + 8]) < 1e-6;
    if (onBed) bottomMinX = Math.min(bottomMinX, tris[b], tris[b + 3], tris[b + 6]);
    else if (len > 0) worstDown = Math.min(worstDown, cz / len);
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
  return { open, dup, degenerate, vol, worstDown, bottomMinX, bbox: { x0, y0, z0, x1, y1, z1 } };
}

// ---- kes ---------------------------------------------------------------------
const CASES = [
  {},
  { stepW: 0 },
  { pocket: false },
  { plakL: 150, plakW: 60, plakH: 200, acrylic: 2, gap: 6, rim: 8, stepW: 3, stepH: 2 },
  { plakL: 300, plakW: 120, plakH: 420, acrylic: 5, gap: 15, gapTop: 25, baseH: 40, rim: 20, grooveDepth: 8 },
  { grooveClear: 0, pocketClear: 0 },
  { grooveDepth: 20, baseH: 10 },
  { gap: 2, pocketClear: 1 },
  { stepH: 30, baseH: 12 },
  { pocketDepth: 10, baseH: 8 },
];
for (const t of BASE_TYPES) {
  CASES.push({ type: t.id, baseH: t.baseH });
  CASES.push({ type: t.id, baseH: t.baseH, pocket: false, acrylic: 5 });
  CASES.push({ type: t.id, baseH: 10, grooveDepth: 8 });         // tapak nipis: had mesti bertindak
}
CASES.push({ type: 'terapung', baseH: 32, plinthSplit: true });
CASES.push({ type: 'terapung', baseH: 32, plinthInset: 60, plinthH: 40 });
CASES.push({ type: 'terapung', baseH: 20, plinthSplit: true, plinthH: 40 });
CASES.push({ type: 'serong', slantFrontOnly: true });
CASES.push({ type: 'serong', slantAngle: 30, baseH: 60 });
CASES.push({ type: 'klasik', ogeeR: 12, baseH: 20 });
CASES.push({ type: 'tingkat', tierChamfer: 0 });
CASES.push({ type: 'tingkat', tierRatio: 75, baseH: 20, tierChamfer: 5 });
CASES.push({ type: 'palsu' });
// Rawak, tetapi boleh diulang.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let k = 0; k < 80; k++) {
  CASES.push({
    type: BASE_TYPES[Math.floor(rnd() * BASE_TYPES.length)].id,
    plakL: 30 + rnd() * 500, plakW: 10 + rnd() * 200, plakH: 30 + rnd() * 600,
    acrylic: 1.5 + rnd() * 4.5, gap: 2 + rnd() * 30, gapTop: rnd() * 40,
    baseH: 8 + rnd() * 50, rim: 3 + rnd() * 30, grooveDepth: 1 + rnd() * 12,
    grooveClear: rnd() * 1.5, pocket: rnd() > 0.3, pocketDepth: 0.5 + rnd() * 6,
    pocketClear: rnd() * 3, stepW: rnd() > 0.4 ? rnd() * 20 : 0, stepH: rnd() * 10,
    plinthInset: 3 + rnd() * 30, plinthH: 3 + rnd() * 20, plinthSplit: rnd() > 0.5,
    slantAngle: 3 + rnd() * 27, slantFrontOnly: rnd() > 0.6, ogeeR: 1.5 + rnd() * 10,
    tierInset: 3 + rnd() * 30, tierRatio: 25 + rnd() * 50, tierChamfer: rnd() * 5,
  });
}

// ---- semakan ---------------------------------------------------------------
for (const input of CASES) {
  const tag = JSON.stringify(input).slice(0, 80);
  let r;
  try { r = buildPlakBox(input); } catch (e) { check(`${tag}: tak campak`, false, e.stack); continue; }
  const { params: p, derived: d, stats, grid, bodies } = r;
  const Hs = grid.Htop;
  let volSum = 0, triSum = 0;
  for (const b of bodies) {
    const bt = `${tag} [${b.id}]`;
    const m = meshReport(b.mesh);
    check(`${bt}: mesh tertutup`, m.open === 0, `${m.open} sisi terbuka`);
    check(`${bt}: tiada sisi berganda`, m.dup === 0, `${m.dup}`);
    check(`${bt}: tiada segitiga leper`, m.degenerate === 0, `${m.degenerate}`);
    check(`${bt}: isipadu positif`, m.vol > 0 && Math.abs(m.vol - b.volumeMm3) < Math.max(0.5, b.volumeMm3 * 1e-5),
      `${m.vol.toFixed(2)} lawan ${b.volumeMm3.toFixed(2)}`);
    check(`${bt}: tanpa support (overhang <= 45 darjah)`, m.worstDown >= -Math.SQRT1_2 - 1e-4, `nz ${m.worstDown.toFixed(4)}`);
    check(`${bt}: duduk di z = 0`, near(m.bbox.z0, 0, 1e-4));
    if (b.id === 'kaki') {
      check(`${bt}: saiz kaki`, near(m.bbox.x0, d.plinth.x0, 1e-3) && near(m.bbox.x1, d.plinth.x1, 1e-3)
        && near(m.bbox.z1, p.plinthH, 1e-3) && near(b.z, 0));
    } else {
      check(`${bt}: kotak sempadan`, near(m.bbox.x0, 0, 1e-3) && near(m.bbox.y0, 0, 1e-3)
        && near(m.bbox.x1, d.baseL, 1e-3) && near(m.bbox.y1, d.baseW, 1e-3) && near(m.bbox.z1, Hs, 1e-3),
        JSON.stringify(m.bbox));
      check(`${bt}: atas papan = tinggi tapak bila dipasang`, near(b.z + Hs, p.baseH, 1e-6));
    }
    volSum += b.volumeMm3;
    triSum += b.mesh.length / 9;
    const buf = trianglesToStl(b.mesh);
    check(`${bt}: saiz STL`, buf.byteLength === 84 + (b.mesh.length / 9) * 50);
  }
  check(`${tag}: statistik = jumlah jasad`, near(stats.volumeMm3, volSum, 1e-6) && stats.triangles === triSum);
  check(`${tag}: bilangan jasad`, bodies.length === (d.split ? 2 : 1));

  // Profil ikut jenis: saiz tapak berbanding permukaan atas.
  const topL = d.top.x1 - d.top.x0, topW = d.top.y1 - d.top.y0;
  if (p.type === 'standard') check(`${tag}: standard`, near(d.baseL, topL + 2 * p.stepW, 1e-5));
  if (p.type === 'serong') {
    const s = p.baseH * Math.tan((p.slantAngle * Math.PI) / 180);
    check(`${tag}: serong`, p.slantFrontOnly
      ? near(d.baseL, topL, 1e-5) && near(d.baseW, topW + s, 1e-4)
      : near(d.baseL, topL + 2 * s, 1e-4) && near(d.baseW, topW + 2 * s, 1e-4));
  }
  if (p.type === 'klasik') check(`${tag}: klasik`, near(d.baseL, topL + 4 * p.ogeeR, 1e-5));
  if (p.type === 'tingkat') check(`${tag}: tingkat`, near(d.baseL, topL + 2 * (p.tierInset + p.tierChamfer), 1e-5));
  if (p.type === 'terapung') {
    check(`${tag}: terapung - papan selebar permukaan atas`, near(d.baseL, topL, 1e-5));
    if (!d.split) {
      const m = meshReport(bodies[0].mesh);
      check(`${tag}: terapung - kaki tersorok`, near(m.bottomMinX, d.top.x0 + p.plinthInset, 1e-3), `${m.bottomMinX}`);
    }
  }

  // Lantai di bawah alur dan poket, termasuk di atas serong kaki terapung.
  const under = (dist) => (p.type === 'terapung' && !d.split && dist < p.plinthInset
    ? p.plinthH + p.plinthInset - dist : 0);
  const grooveFloor = (Hs - p.grooveDepth) - under(p.rim);
  check(`${tag}: lantai alur >= 2 mm`, grooveFloor >= 2 - 1e-6, `${grooveFloor}`);
  if (p.pocket) {
    const pf = (Hs - p.pocketDepth) - under(d.pocket.x0 - d.top.x0);
    check(`${tag}: lantai poket >= 2 mm`, pf >= 2 - 1e-6, `${pf}`);
  }
  check(`${tag}: bibir permukaan atas penuh`, grid.H[0].every((z) => near(z, Hs)) && grid.H.every((col) => near(col[0], Hs)));

  // Akrilik dan alur.
  const t = p.acrylic, c = p.grooveClear;
  check(`${tag}: alur = t + 2c`, near(d.groove.x1 - d.grooveIn.x1, t + 2 * c) && near(d.grooveIn.x0 - d.groove.x0, t + 2 * c));
  check(`${tag}: kelonggaran luar dan dalam sama`, near(d.cover.x0 - d.groove.x0, c) && near(d.grooveIn.x0 - (d.cover.x0 + t), c)
    && near(d.cover.y0 - d.groove.y0, c) && near(d.grooveIn.y0 - (d.cover.y0 + t), c));
  check(`${tag}: plak + ruang = dalam kotak`, near(d.plak.x1 - d.plak.x0, p.plakL) && near(d.plak.y1 - d.plak.y0, p.plakW)
    && near(d.plak.x0 - (d.cover.x0 + t), p.gap) && near(d.plak.y0 - (d.cover.y0 + t), p.gap));
  check(`${tag}: bibir dari tepi atas`, near(d.groove.x0 - d.top.x0, p.rim) && near(d.top.y1 - d.groove.y1, p.rim));
  const [atas, depan, sisi] = d.panels;
  check(`${tag}: keping cantum = saiz luar`, near(depan.w, d.coverOutL, 1e-5) && near(sisi.w + 2 * t, d.coverOutW, 1e-5)
    && near(atas.w, d.coverOutL, 1e-5) && near(atas.h, d.coverOutW, 1e-5) && near(depan.h + t, d.coverH, 1e-5));
  check(`${tag}: bumbung = puncak plak + ruang atas`, near(d.coverTop - t, d.plakZ + p.plakH + p.gapTop, 1e-6)
    && near(d.coverZ, p.baseH - p.grooveDepth));

  const wallWarn = r.warnings.some((w) => w.startsWith('Dinding antara poket'));
  check(`${tag}: amaran dinding poket tepat`,
    wallWarn === (p.pocket && p.gap - p.grooveClear - p.pocketClear < 3), r.warnings.join(' | '));
}

// ---- nombor lalai dan kiraan tangan ------------------------------------------------
{
  const { derived: d, params: p, stats } = buildPlakBox(DEFAULTS);
  check('lalai: jenis Standard', p.type === 'standard');
  check('lalai: kotak luar 256 x 106', near(d.coverOutL, 256) && near(d.coverOutW, 106), `${d.coverOutL} x ${d.coverOutW}`);
  check('lalai: tapak 280.8 x 130.8 (sama seperti sebelum jenis tapak)', near(d.baseL, 280.8) && near(d.baseW, 130.8), `${d.baseL} x ${d.baseW}`);
  check('lalai: tinggi kotak', near(d.coverH, 4 + 310 - 2 + 10 + 3), `${d.coverH}`);
  // Kotak penuh tolak jalur tingkat, cincin alur dan poket.
  const full = 280.8 * 130.8 * 25;
  const band = (280.8 * 130.8 - 272.8 * 122.8) * 4;
  const groove = (256.8 * 106.8 - 249.2 * 99.2) * 4;
  const pocket = 231 * 81 * 2;
  check('lalai: isipadu kiraan tangan', Math.abs(stats.volumeMm3 - (full - band - groove - pocket)) < 1e-3,
    `${stats.volumeMm3} lawan ${full - band - groove - pocket}`);
}
{
  // Serong: frustum (keratan berubah linear) - formula prismoid tepat.
  const r = buildPlakBox({ type: 'serong', baseH: 25, slantAngle: 12 });
  const s = 25 * Math.tan(12 * Math.PI / 180);
  const L = 272.8, W = 122.8; // permukaan atas
  const frustum = (25 / 6) * (L * W + 4 * (L + s) * (W + s) + (L + 2 * s) * (W + 2 * s));
  const cut = (256.8 * 106.8 - 249.2 * 99.2) * 4 + 231 * 81 * 2;
  check('serong: isipadu kiraan tangan (prismoid)', Math.abs(r.stats.volumeMm3 - (frustum - cut)) < 0.05,
    `${r.stats.volumeMm3} lawan ${frustum - cut}`);
}
{
  // Terapung dua bahagian: kaki ialah kotak tepat.
  const r = buildPlakBox({ type: 'terapung', baseH: 32, plinthSplit: true, plinthInset: 12, plinthH: 10 });
  const kaki = r.bodies.find((b) => b.id === 'kaki');
  check('terapung: isipadu kaki kiraan tangan', near(kaki.volumeMm3, (272.8 - 24) * (122.8 - 24) * 10, 1e-3), `${kaki.volumeMm3}`);
  // Satu jasad: papan penuh tolak serong di bawah = kotak kaki + papan + baji serong.
  const one = buildPlakBox({ type: 'terapung', baseH: 32, plinthInset: 12, plinthH: 10 });
  const Lt = 272.8, Wt = 122.8, q = 12, h = 10, H = 32;
  const plinth = (Lt - 2 * q) * (Wt - 2 * q) * h;
  const slab = Lt * Wt * (H - h - q);
  const wedge = (q / 6) * ((Lt - 2 * q) * (Wt - 2 * q) + 4 * (Lt - q) * (Wt - q) + Lt * Wt);
  const cut = (256.8 * 106.8 - 249.2 * 99.2) * 4 + 231 * 81 * 2;
  check('terapung: isipadu satu jasad kiraan tangan', Math.abs(one.stats.volumeMm3 - (plinth + slab + wedge - cut)) < 0.05,
    `${one.stats.volumeMm3} lawan ${plinth + slab + wedge - cut}`);
}

// ---- input teruk ------------------------------------------------------------------
for (const bad of [{ plakL: 0 }, { plakL: -5, plakW: NaN }, { acrylic: 'abc' }, { baseH: 1e9 }, null, undefined,
  { pocket: 'ya' }, { type: 42 }, { type: 'terapung', plinthH: -9, plinthInset: 'x' }]) {
  let ok = true;
  try { buildPlakBox(bad || undefined); } catch (e) { ok = false; }
  check(`input teruk ${JSON.stringify(bad)}: tak campak`, ok);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
