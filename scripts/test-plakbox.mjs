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
//   * slot                 - tepat di tengah tapak, tegak, lebar = tebal plak +
//                            2 x kelonggaran, lantai >= 3 mm, dinding ke alur
//                            >= 1.5 mm, isipadu kiraan tangan.
//   * FAIL POTONG AKRILIK  - setiap keping (5, ikut qty) diletak tepat sekali,
//                            saiz dilukis = saiz siap + kerf (atau diputar),
//                            tiada dua keping lebih rapat daripada GAP, semuanya
//                            dalam helaian dan MARGIN (kecuali keping terlalu
//                            besar, yang ditanda overflow), SVG ada satu garis
//                            potong bagi setiap keping dengan saiz yang betul.
//                            Plak slot dalam fail sendiri, saiz plak + kerf.
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
CASES.push({ type: 'slot', sheetT: 3, slotDepth: 6 });
CASES.push({ type: 'slot', sheetT: 12, slotClear: 1, gap: 2, grooveClear: 1.5, plakW: 10 }); // had ruang
CASES.push({ type: 'slot', baseH: 8, slotDepth: 40, grooveDepth: 8 });                        // had dalam slot
CASES.push({ type: 'slot', sheetT: 2, slotClear: 0, tierChamfer: 0, plakL: 30, plakH: 800 });
CASES.push({ type: 'slot', pocket: true, pocketDepth: 10 });                                  // poket diabaikan
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
    sheetT: 2 + rnd() * 10, slotDepth: 3 + rnd() * 37, slotClear: rnd(),
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
  if (p.type === 'slot') slotChecks(tag, r);
  else check(`${tag}: tiada slot`, !d.slot && !d.sheet);
  // Tiada jenis yang menyempit di bawah: muka bawah sentiasa selebar tapak.
  check(`${tag}: muka bawah selebar tapak (stabil)`, near(meshReport(bodies[0].mesh).bottomMinX, 0, 1e-3));

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
  const { params: p, derived: d, grid } = r;
  const sl = d.slot, c = p.slotClear, Hs = grid.Htop;
  check(`${tag}: slot tepat di tengah tapak`, near((sl.x0 + sl.x1) / 2, d.baseL / 2, 1e-5)
    && near((sl.y0 + sl.y1) / 2, d.baseW / 2, 1e-5), JSON.stringify(sl));
  check(`${tag}: slot = plak + 2c`, near(sl.y1 - sl.y0, p.sheetT + 2 * c, 1e-5) && near(sl.x1 - sl.x0, p.plakL + 2 * c, 1e-5));
  check(`${tag}: plak di tengah slot`, near(d.sheet.x0 - sl.x0, c, 1e-5) && near(sl.y1 - d.sheet.y1, c, 1e-5)
    && near(d.sheet.y1 - d.sheet.y0, p.sheetT, 1e-5));
  check(`${tag}: lantai slot >= 3 mm`, Hs - sl.depth >= 3 - 1e-6, `${Hs - sl.depth}`);
  check(`${tag}: plak berdiri di lantai slot`, near(d.plakZ, p.baseH - p.slotDepth));
  check(`${tag}: tiada poket`, !p.pocket && !d.pocket);
  check(`${tag}: slot dalam kawasan alur dalam`, sl.x0 - d.grooveIn.x0 >= 1.5 - 1e-5 && d.grooveIn.x1 - sl.x1 >= 1.5 - 1e-5
    && sl.y0 - d.grooveIn.y0 >= 3 - 1e-5, `${sl.x0 - d.grooveIn.x0}`);
  // Sel slot dalam medan tinggi: tegak, sedalam slotDepth.
  const ci = grid.xs.indexOf(sl.x0), cj = grid.ys.indexOf(sl.y0);
  check(`${tag}: sel slot dalam grid`, ci >= 0 && cj >= 0 && grid.xs[ci + 1] === sl.x1 && grid.ys[cj + 1] === sl.y1
    && near(grid.H[ci][cj], Hs - sl.depth));
  const thin = r.warnings.some((w) => w.startsWith('Dinding antara hujung slot'));
  check(`${tag}: amaran dinding slot tepat`, thin === (p.gap - p.grooveClear - p.slotClear < 3), r.warnings.join(' | '));
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
  // Slot lalai: kotak sama dengan jenis lain, slot 230.5 x 5.5 x 12 di tengah.
  const r = buildPlakBox({ type: 'slot', baseH: 34 });
  const { derived: d, params: p } = r;
  check('slot lalai: kotak luar 256 x 106 (sama seperti jenis lain)', near(d.coverOutL, 256) && near(d.coverOutW, 106));
  check('slot lalai: tinggi kotak', near(d.coverH, 4 + 310 - 12 + 10 + 3), `${d.coverH}`);
  check('slot lalai: slot 230.5 x 5.5 x 12', near(d.slot.x1 - d.slot.x0, 230.5) && near(d.slot.y1 - d.slot.y0, 5.5)
    && near(d.slot.depth, 12));
  check('slot lalai: tiada amaran', r.warnings.length === 0, r.warnings.join(' | '));
  // Isipadu: badan dua tingkat (prismoid bagi setiap segmen profil) tolak
  // cincin alur dan slot.
  const H = p.baseH, h1 = (H * p.tierRatio) / 100, t = p.tierInset, ch = p.tierChamfer;
  const L = d.top.x1 - d.top.x0, W = d.top.y1 - d.top.y0;
  const prof = [[t + ch, 0], [t + ch, h1 - ch], [t, h1], [ch, h1], [ch, H - ch], [0, H]];
  const area = (o) => (L + 2 * o) * (W + 2 * o);
  let body = 0;
  for (let k = 0; k + 1 < prof.length; k++) {
    const [oa, za] = prof[k], [ob, zb] = prof[k + 1];
    body += ((zb - za) / 6) * (area(oa) + 4 * area((oa + ob) / 2) + area(ob));
  }
  const groove = ((d.groove.x1 - d.groove.x0) * (d.groove.y1 - d.groove.y0)
    - (d.grooveIn.x1 - d.grooveIn.x0) * (d.grooveIn.y1 - d.grooveIn.y0)) * p.grooveDepth;
  const hole = 230.5 * 5.5 * 12;
  check('slot lalai: isipadu kiraan tangan', Math.abs(r.stats.volumeMm3 - (body - groove - hole)) < 1e-3,
    `${r.stats.volumeMm3} lawan ${body - groove - hole}`);
}
// ---- fail potong akrilik -------------------------------------------------------------
{
  const A = await import(pathToFileURL(path.join(here, '..', 'docs', 'plakbox', 'src', 'acrylic.js')).href);
  const cases = [
    {}, { type: 'slot' }, { plakL: 120, plakW: 40, plakH: 160 }, { plakL: 400, plakW: 120, plakH: 500 },
    { acrylic: 5, gap: 20 }, { type: 'serong', plakL: 300, plakH: 380 }, { plakL: 60, plakW: 30, plakH: 60 },
  ];
  for (const params of cases) {
    const m = buildPlakBox({ ...DEFAULTS, ...params });
    for (const sh of A.SHEETS) {
      for (const kerf of [0, 0.15, 0.3]) {
        const tag = `akrilik ${JSON.stringify(params)} ${sh.id} kerf ${kerf}`;
        const f = A.acrylicFiles(m, { sheet: sh.id, kerf, labels: kerf > 0.2 });
        const placed = f.box.flatMap((b) => b.sheet.placed.map((pl) => ({ ...pl, sheet: b.sheet })));
        const want = m.derived.panels.reduce((a, q) => a + q.qty, 0);
        check(`${tag}: ${want} keping, setiap satu sekali`, placed.length === want
          && new Set(placed.map((pl) => pl.piece.id)).size === want, `${placed.length}`);
        // Saiz siap = senarai panel; dilukis = siap + kerf.
        for (const q of m.derived.panels) {
          const mine = placed.filter((pl) => pl.piece.id.startsWith(q.id));
          check(`${tag}: ${q.name} x${q.qty}`, mine.length === q.qty);
          for (const pl of mine) {
            const [w, hh] = pl.rot ? [pl.h, pl.w] : [pl.w, pl.h];
            check(`${tag}: ${pl.piece.label} saiz + kerf`, Math.abs(w - (q.w + kerf)) < 1e-6 && Math.abs(hh - (q.h + kerf)) < 1e-6,
              `${w} x ${hh} lawan ${q.w + kerf} x ${q.h + kerf}`);
          }
        }
        // Tiada tindih / terlalu rapat; dalam helaian.
        for (const b of f.box) {
          const P = b.sheet.placed;
          for (let i = 0; i < P.length; i++) {
            const a = P[i];
            if (!b.sheet.overflow) {
              check(`${tag}: ${a.piece.label} dalam helaian`, a.x >= A.MARGIN - 1e-6 && a.y >= A.MARGIN - 1e-6
                && a.x + a.w <= b.sheet.w - A.MARGIN + 1e-6 && a.y + a.h <= b.sheet.h - A.MARGIN + 1e-6,
              `${a.x},${a.y} ${a.w}x${a.h}`);
            }
            for (let j = i + 1; j < P.length; j++) {
              const c = P[j];
              const apart = a.x + a.w + A.GAP <= c.x + 1e-6 || c.x + c.w + A.GAP <= a.x + 1e-6
                || a.y + a.h + A.GAP <= c.y + 1e-6 || c.y + c.h + A.GAP <= a.y + 1e-6;
              check(`${tag}: ${a.piece.label} / ${c.piece.label} tidak bertindih`, apart);
            }
          }
          // SVG: satu garis potong segi empat bagi setiap keping, saiz yang sama.
          const cut = b.svg.split('<g id="cut"')[1].split('</g>')[0];
          const rects = [...cut.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H/g)]
            .map((mm) => [Number(mm[3]) - Number(mm[1]), Number(mm[4]) - Number(mm[2])]);
          check(`${tag}: SVG ada ${P.length} garis potong`, rects.length === P.length, `${rects.length}`);
          check(`${tag}: SVG saiz garis potong`, rects.every(([w, hh], i) => Math.abs(w - P[i].w) < 1e-3 && Math.abs(hh - P[i].h) < 1e-3));
          check(`${tag}: SVG unit mm`, b.svg.includes(`width="${b.sheet.w}mm"`) && b.svg.includes(`height="${b.sheet.h}mm"`));
          check(`${tag}: label hanya bila diminta`, b.svg.includes('id="labels"') === (kerf > 0.2));
        }
        // Plak slot.
        if (m.derived.slot) {
          const pq = f.plaque?.sheet.placed[0];
          check(`${tag}: plak slot dalam fail sendiri`, !!pq && Math.abs(pq.w - (m.params.plakL + kerf)) < 1e-6
            && Math.abs(pq.h - (m.params.plakH + kerf)) < 1e-6 && f.plaque.name.includes(`${m.params.sheetT}mm`));
        } else {
          check(`${tag}: tiada plak bukan slot`, f.plaque === null);
        }
      }
    }
  }
  // Keping lebih besar daripada helaian: ditanda, tidak hilang.
  const big = buildPlakBox({ ...DEFAULTS, plakL: 700, plakW: 120, plakH: 600 });
  const fb = A.acrylicFiles(big, { sheet: '600x400' });
  check('akrilik keping terlalu besar: ditanda overflow', fb.box.some((b) => b.sheet.overflow));
  check('akrilik keping terlalu besar: semua keping masih ada',
    fb.box.reduce((a, b) => a + b.sheet.placed.length, 0) === 5);
  check('akrilik: kerf teruk kembali ke lalai', A.cleanKerf('x') === A.DEFAULT_KERF && A.cleanKerf(-1) === A.DEFAULT_KERF
    && A.cleanKerf(5) === A.DEFAULT_KERF && A.cleanKerf(0) === 0);
  // Susunan padat: lalai muat satu helaian 900 x 600 dan dua helaian 600 x 400.
  const m0 = buildPlakBox({ ...DEFAULTS });
  check('akrilik lalai: satu helaian 900 x 600', A.acrylicFiles(m0, { sheet: '900x600' }).box.length === 1);
  check('akrilik lalai: dua helaian 600 x 400', A.acrylicFiles(m0, { sheet: '600x400' }).box.length === 2);
}

// ---- input teruk ------------------------------------------------------------------
for (const bad of [{ plakL: 0 }, { plakL: -5, plakW: NaN }, { acrylic: 'abc' }, { baseH: 1e9 }, null, undefined,
  { pocket: 'ya' }, { type: 42 }, { type: 'terapung', plinthH: -9 },
  { type: 'slot', sheetT: 'x', slotDepth: -9, plakW: 0 }, { type: 'slot', slotDepth: Infinity }]) {
  let ok = true;
  try { buildPlakBox(bad || undefined); } catch (e) { ok = false; }
  check(`input teruk ${JSON.stringify(bad)}: tak campak`, ok);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
