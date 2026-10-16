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
//                            bahan.
//   * akrilik muat         - dinding akrilik duduk dalam alur dengan kelonggaran
//                            yang diminta di KEDUA-DUA sisi; keping cantum
//                            hujung ke hujung memberi saiz luar yang betul.
//   * slot                 - lebar = tebal plak + 2 x kelonggaran, dinding depan,
//                            belakang dan lantai >= 3 mm walau condong, berat
//                            plak di tengah tapak, isipadu kiraan tangan.
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
CASES.push({ type: 'terapung', baseH: 32, plinthSplit: true });   // jenis yang sudah dibuang -> Standard
CASES.push({ type: 'serong', slantFrontOnly: true });
CASES.push({ type: 'serong', slantAngle: 30, baseH: 60 });
CASES.push({ type: 'klasik', ogeeR: 12, baseH: 20 });
CASES.push({ type: 'tingkat', tierChamfer: 0 });
CASES.push({ type: 'tingkat', tierRatio: 75, baseH: 20, tierChamfer: 5 });
CASES.push({ type: 'slot', slotTilt: 0 });
CASES.push({ type: 'slot', slotTilt: 20, slotDepth: 25, baseH: 40 });
CASES.push({ type: 'slot', baseDepth: 30, slotTilt: 20, slotDepth: 40, sheetT: 12 });   // had condong
CASES.push({ type: 'slot', baseH: 8, slotDepth: 40, tierRatio: 75 });                    // had dalam slot
CASES.push({ type: 'slot', sheetT: 2, slotClear: 0, sideMargin: 5, tierChamfer: 0 });
CASES.push({ type: 'slot', plakL: 30, plakH: 800, baseDepth: 40 });                      // amaran tumbang
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
    slantAngle: 3 + rnd() * 27, slantFrontOnly: rnd() > 0.6, ogeeR: 1.5 + rnd() * 10,
    tierInset: 3 + rnd() * 30, tierRatio: 25 + rnd() * 50, tierChamfer: rnd() * 5,
    sheetT: 2 + rnd() * 10, slotDepth: 5 + rnd() * 35, slotClear: rnd(), slotTilt: rnd() * 20,
    baseDepth: 30 + rnd() * 170, sideMargin: 5 + rnd() * 55,
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
    check(`${bt}: kotak sempadan`, near(m.bbox.x0, 0, 1e-3) && near(m.bbox.y0, 0, 1e-3)
      && near(m.bbox.x1, d.baseL, 1e-3) && near(m.bbox.y1, d.baseW, 1e-3) && near(m.bbox.z1, Hs, 1e-3),
      JSON.stringify(m.bbox));
    check(`${bt}: tinggi = tinggi tapak`, near(b.z + Hs, p.baseH, 1e-6));
    volSum += b.volumeMm3;
    triSum += b.mesh.length / 9;
    const buf = trianglesToStl(b.mesh);
    check(`${bt}: saiz STL`, buf.byteLength === 84 + (b.mesh.length / 9) * 50);
  }
  check(`${tag}: statistik = jumlah jasad`, near(stats.volumeMm3, volSum, 1e-6) && stats.triangles === triSum);
  check(`${tag}: satu jasad`, bodies.length === 1);
  check(`${tag}: jenis sah`, BASE_TYPES.some((t) => t.id === p.type) && (input.type !== 'terapung' || p.type === 'standard'));

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
  if (p.type === 'tingkat' || p.type === 'slot') {
    check(`${tag}: ${p.type}`, near(d.baseL, topL + 2 * (p.tierInset + p.tierChamfer), 1e-5));
  }
  // Tiada jenis yang menyempit di bawah: muka bawah sentiasa selebar tapak.
  check(`${tag}: muka bawah selebar tapak (stabil)`, near(meshReport(bodies[0].mesh).bottomMinX, 0, 1e-3));

  if (d.slotMode) { slotChecks(tag, r); continue; }
  check(`${tag}: bukan slot = ada kotak`, p.type !== 'slot' && d.cover && d.groove);

  // Lantai di bawah alur dan poket.
  const grooveFloor = Hs - p.grooveDepth;
  check(`${tag}: lantai alur >= 2 mm`, grooveFloor >= 2 - 1e-6, `${grooveFloor}`);
  if (p.pocket) check(`${tag}: lantai poket >= 2 mm`, Hs - p.pocketDepth >= 2 - 1e-6, `${Hs - p.pocketDepth}`);
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

function slotChecks(tag, r) {
  const { params: p, derived: d, grid, warnings } = r;
  const sl = d.slot, c = p.slotClear, a = (p.slotTilt * Math.PI) / 180;
  // Lebar diukur tegak lurus pada dinding slot yang condong.
  check(`${tag}: slot = tebal plak + 2c`, near((sl.y1 - sl.y0) * Math.cos(a), p.sheetT + 2 * c, 1e-5)
    && near(sl.x1 - sl.x0, p.plakL + 2 * c, 1e-5));
  check(`${tag}: slot di tengah kiri-kanan`, near(sl.x0 - d.top.x0, p.sideMargin, 1e-5) && near(d.top.x1 - sl.x1, p.sideMargin, 1e-5));
  check(`${tag}: lantai slot >= 3 mm`, grid.Htop - sl.depth >= 3 - 1e-6, `${grid.Htop - sl.depth}`);
  check(`${tag}: dasar slot condong sejauh tan`, near(sl.shift, sl.depth * Math.tan(a), 1e-5));
  check(`${tag}: dinding depan di dasar >= 3 mm`, sl.y0 - sl.shift - d.top.y0 >= 3 - 1e-5, `${sl.y0 - sl.shift - d.top.y0}`);
  check(`${tag}: dinding belakang >= 3 mm`, d.top.y1 - sl.y1 >= 3 - 1e-5, `${d.top.y1 - sl.y1}`);
  check(`${tag}: plak dalam slot`, near(d.plak.x1 - d.plak.x0, p.plakL, 1e-5)
    && near((d.plak.y1 - d.plak.y0) * Math.cos(a), p.sheetT, 1e-5)
    && near((d.plak.y0 - sl.y0) * Math.cos(a), c, 1e-5) && near(d.plakZ, p.baseH - p.slotDepth));
  check(`${tag}: satu keping akrilik sahaja`, d.panels.length === 1 && near(d.panels[0].w, p.plakL, 1e-5)
    && near(d.panels[0].h, p.plakH, 1e-5) && d.tape === 0 && !d.cover && !d.groove);
  check(`${tag}: tinggi keseluruhan`, near(d.totalH, d.plakZ + p.plakH * Math.cos(a) + p.sheetT * Math.sin(a), 1e-5));
  check(`${tag}: permukaan atas rata`, grid.H.every((col) => col.every((z) => near(z, grid.Htop))));
  // Berat plak di tengah tapak - kecuali bila slot sudah ditolak ke had.
  const free = sl.y0 - sl.shift - d.top.y0 > 3 + 1e-4 && d.top.y1 - sl.y1 > 3 + 1e-4;
  if (free) check(`${tag}: berat plak di tengah tapak`, near(d.leanOff, 0, 1e-4), `${d.leanOff}`);
  const tip = warnings.some((w) => w.includes('mudah tumbang') || w.includes('jauh dari tengah'));
  check(`${tag}: amaran tumbang tepat`, tip === (d.baseW < 0.2 * p.plakH || Math.abs(d.leanOff) > d.baseW / 6), warnings.join(' | '));
  // Isipadu: badan dua tingkat (prismoid bagi setiap segmen profil) tolak
  // slot - prisma condong, isipadunya luas bukaan x dalam.
  const H = p.baseH, h1 = (H * p.tierRatio) / 100, t = p.tierInset, ch = p.tierChamfer;
  const L = d.top.x1 - d.top.x0, W = d.top.y1 - d.top.y0;
  const prof = ch > 0 ? [[t + ch, 0], [t + ch, h1 - ch], [t, h1], [ch, h1], [ch, H - ch], [0, H]] : [[t, 0], [t, h1], [0, h1], [0, H]];
  const area = (o) => (L + 2 * o) * (W + 2 * o);
  let body = 0;
  for (let k = 0; k + 1 < prof.length; k++) {
    const [oa, za] = prof[k], [ob, zb] = prof[k + 1];
    body += ((zb - za) / 6) * (area(oa) + 4 * area((oa + ob) / 2) + area(ob));
  }
  const hole = (sl.x1 - sl.x0) * (sl.y1 - sl.y0) * sl.depth;
  check(`${tag}: isipadu slot kiraan tangan`, Math.abs(r.stats.volumeMm3 - (body - hole)) < Math.max(0.05, body * 1e-8),
    `${r.stats.volumeMm3} lawan ${body - hole}`);
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
  // Slot lalai: 5 mm, condong 8 darjah, plak 230 x 310.
  const { derived: d, params: p } = buildPlakBox({ type: 'slot', baseH: 30 });
  check('slot lalai: tapak 283.5 x 93', near(d.baseL, 283.5) && near(d.baseW, 93), `${d.baseL} x ${d.baseW}`);
  check('slot lalai: slot 230.5 x 5.554 x 12', near(d.slot.x1 - d.slot.x0, 230.5)
    && near(d.slot.y1 - d.slot.y0, 5.5 / Math.cos(8 * Math.PI / 180), 1e-5) && near(d.slot.depth, 12),
    `${d.slot.y1 - d.slot.y0}`);
  check('slot lalai: condong 8 darjah tidak dihadkan', near(p.slotTilt, 8));
  check('slot lalai: slot di depan tengah (plak condong ke belakang)', d.slot.y0 + 2.75 < (d.top.y0 + d.top.y1) / 2);
}
{
  // Slot dalam pada tapak cetek: condong mesti dihadkan, dan diberitahu.
  const r = buildPlakBox({ type: 'slot', baseH: 60, baseDepth: 30, slotDepth: 40, sheetT: 12, slotClear: 1, slotTilt: 20 });
  check('slot had condong: dihadkan', r.params.slotTilt < 20 && r.params.slotTilt > 0, `${r.params.slotTilt}`);
  check('slot had condong: diberitahu', r.warnings.some((w) => w.startsWith('Condong dihadkan')), r.warnings.join(' | '));
  const sl = r.derived.slot;
  check('slot had condong: dinding depan tepat 3 mm atau lebih', sl.y0 - sl.shift - r.derived.top.y0 >= 3 - 1e-5);
}
// ---- input teruk ------------------------------------------------------------------
for (const bad of [{ plakL: 0 }, { plakL: -5, plakW: NaN }, { acrylic: 'abc' }, { baseH: 1e9 }, null, undefined,
  { pocket: 'ya' }, { type: 42 }, { type: 'terapung', plinthH: -9 },
  { type: 'slot', sheetT: 'x', slotTilt: -90, baseDepth: 0 }, { type: 'slot', slotDepth: Infinity }]) {
  let ok = true;
  try { buildPlakBox(bad || undefined); } catch (e) { ok = false; }
  check(`input teruk ${JSON.stringify(bad)}: tak campak`, ok);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
