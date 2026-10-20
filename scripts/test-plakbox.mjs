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
//   * HARGA                - berat tapak sama dengan kiraan tangan (kubus);
//                            bahagian akrilik = quote() Kalkulator Laser Cut
//                            dipanggil terus; jumlah = tapak + akrilik dibundar
//                            10 sen; julat +-15%; kuantiti berganda; 2 mm lebih
//                            murah daripada 3 mm; mesej WhatsApp membawa harga
//                            yang sama dengan skrin.
//   * akrilik 2 / 3 mm     - tebal lain disnap dan diberi nota.
//   * SIMPAN KE AKAUN      - Export menyimpan reka bentuk: params kunci DEFAULTS
//                            sahaja, rekod ikut firestore.rules, dua simpanan
//                            serentak = satu entri, gagal = senyap.
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
  { plakL: 300, plakW: 120, plakH: 420, acrylic: 3, gap: 15, gapTop: 25, baseH: 40, rim: 20, grooveDepth: 8 },
  { grooveClear: 0, pocketClear: 0 },
  { grooveDepth: 20, baseH: 10 },
  { gap: 2, pocketClear: 1 },
  { stepH: 30, baseH: 12 },
  { pocketDepth: 10, baseH: 8 },
];
for (const t of BASE_TYPES) {
  CASES.push({ type: t.id, baseH: t.baseH });
  CASES.push({ type: t.id, baseH: t.baseH, pocket: false, acrylic: 2 });
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
    acrylic: rnd() < 0.5 ? 2 : 3, gap: 2 + rnd() * 30, gapTop: rnd() * 40,
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
/** Nota: di dalam kanvas, jauh dari setiap keping, di atas helaian bila di luar katil. */
function checkNote(tag, note, sheet) {
  const M = 5;
  const inside = note.x >= M - 1e-6 && note.x1 <= sheet.w - M + 1e-6 && note.y1 <= note.canvasH + 1e-6;
  const clear = sheet.placed.every((pl) => note.x1 + 4 <= pl.x + 1e-6 || pl.x + pl.w + 4 <= note.x + 1e-6
    || note.y1 + 4 <= pl.y + 1e-6 || pl.y + pl.h + 4 <= note.y0 + 1e-6);
  const where = note.canvasH === sheet.h ? note.y1 <= sheet.h - M + 1e-6 : note.y0 >= sheet.h;
  check(`${tag} dalam kanvas, jauh dari keping`, inside && clear && where,
    `${note.x},${note.y0} - ${note.x1},${note.y1} kanvas ${note.canvasH}`);
  check(`${tag} boleh dibaca`, note.caps[0] >= 2.5 && note.caps[1] >= 1.5, note.caps.join());
}

/** PDF: struktur sah (offset xref tepat), saiz halaman, garis potong = keping. */
function checkPdf(tag, pdf, sheet, note, placed) {
  const PT = 72 / 25.4;
  const ascii = /^[\x09\x0a\x0d\x20-\x7e]*$/.test(pdf);
  const xref = Number(pdf.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
  const table = pdf.slice(xref).split('\n');
  const n = Number(table[1].split(' ')[1]);
  let offsetsOk = table[0] === 'xref';
  for (let i = 1; i < n; i++) {
    const off = Number(table[2 + i].slice(0, 10));
    offsetsOk &&= pdf.slice(off, off + `${i} 0 obj`.length) === `${i} 0 obj`;
  }
  const len = Number(pdf.match(/\/Length (\d+) >>\nstream\n/)?.[1]);
  const body = pdf.slice(pdf.indexOf('>>\nstream\n') + 10, pdf.indexOf('\nendstream'));
  const box = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  const rects = [...body.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re S/g)].map((x) => x.slice(1).map(Number));
  check(`${tag} sah: ASCII, %PDF, offset xref tepat, panjang strim tepat`,
    ascii && pdf.startsWith('%PDF-1.4\n') && offsetsOk && len === body.length, `${xref} ${len}/${body.length}`);
  check(`${tag} sesaiz helaian (dan nota)`, Math.abs(Number(box?.[1]) - sheet.w * PT) < 0.01
    && Math.abs(Number(box?.[2]) - note.canvasH * PT) < 0.01);
  check(`${tag} satu garis potong merah bagi setiap keping, saiz sama`, rects.length === placed.length
    && rects.every(([x, y, w, hh], i) => Math.abs(x - placed[i].x) < 1e-3 && Math.abs(y - placed[i].y) < 1e-3
      && Math.abs(w - placed[i].w) < 1e-3 && Math.abs(hh - placed[i].h) < 1e-3)
    && body.includes('1 0 0 RG'));
  check(`${tag} nota hijau dalam lapisan sendiri`, body.includes('0 0.651 0.318 RG')
    && pdf.includes(`/Subject (${note.lines[0]} |`));
}

{
  const A = await import(pathToFileURL(path.join(here, '..', 'docs', 'plakbox', 'src', 'acrylic.js')).href);
  const cases = [
    {}, { type: 'slot' }, { plakL: 120, plakW: 40, plakH: 160 }, { plakL: 400, plakW: 120, plakH: 500 },
    { acrylic: 2, gap: 20 }, { type: 'serong', plakL: 300, plakH: 380 }, { plakL: 60, plakW: 30, plakH: 60 },
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
          // Kanvas = helaian, atau lebih tinggi bila nota terpaksa duduk di luar katil.
          check(`${tag}: SVG unit mm`, b.svg.includes(`width="${b.sheet.w}mm"`) && b.svg.includes(`height="${b.note.canvasH}mm"`)
            && b.note.canvasH >= b.sheet.h);
          check(`${tag}: label hanya bila diminta`, b.svg.includes('id="labels"') === (kerf > 0.2));
          // Nota bahan untuk pekerja: tebal sebenar, tidak menindih keping.
          const head = `Acrylic ${m.params.acrylic}mm Clear`;
          check(`${tag}: nota bahan "${head}"`, b.note.lines[0] === head
            && b.svg.includes(`data-text="${head}"`) && b.svg.includes(`<desc>${head} |`));
          checkNote(`${tag}: nota`, b.note, b.sheet);
          checkPdf(`${tag}: PDF`, b.pdf, b.sheet, b.note, P);
        }
        // Plak slot.
        if (m.derived.slot) {
          const pq = f.plaque?.sheet.placed[0];
          check(`${tag}: plak slot dalam fail sendiri`, !!pq && Math.abs(pq.w - (m.params.plakL + kerf)) < 1e-6
            && Math.abs(pq.h - (m.params.plakH + kerf)) < 1e-6 && f.plaque.name.includes(`${m.params.sheetT}mm`));
          check(`${tag}: nota plak ikut tebal plak, tanpa "Clear"`,
            f.plaque.note.lines[0] === `Acrylic ${m.params.sheetT}mm - plak` && f.plaque.pdfName.endsWith('.pdf'));
          checkNote(`${tag}: nota plak`, f.plaque.note, f.plaque.sheet);
          checkPdf(`${tag}: PDF plak`, f.plaque.pdf, f.plaque.sheet, f.plaque.note, f.plaque.sheet.placed);
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

// ---- harga -------------------------------------------------------------------------
{
  const P = await import(pathToFileURL(path.join(here, '..', 'docs', 'plakbox', 'src', 'price.js')).href);
  const L = await import(pathToFileURL(path.join(here, '..', 'docs', 'lasercut', 'src', 'pricing.js')).href);
  const { segTime } = await import(pathToFileURL(path.join(here, '..', 'docs', 'lasercut', 'src', 'laser.js')).href);
  const { LIMITS } = await import(pathToFileURL(MOD).href);

  // Tetapan yang Boss tetapkan (20 Okt 2026).
  check('harga: infill 10%, RM0.50 sesegram, Bambu Lab', P.PRINT.infill === 0.1 && P.PRINT.senPerGram === 50
    && P.PRINT.printer === 'Bambu Lab' && P.PRINT.filamentSenPerKg === 8000);

  // Kubus sisi s, dibina sendiri: atas s^2, bawah s^2, sisi 4 s^2.
  const cube = (s) => {
    const v = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]];
    const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
      [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    return new Float32Array(f.flatMap((t) => t.flatMap((i) => v[i])));
  };
  for (const s of [20, 50, 3]) {
    const g = P.printGrams(cube(s), s ** 3);
    const shell = Math.min(s ** 3, s * s * 1.0 + s * s * 0.6 + 4 * s * s * 0.87);
    const want = ((shell + (s ** 3 - shell) * 0.1) / 1000) * 1.24;
    check(`harga: berat kubus ${s} mm = kiraan tangan`, near(g.grams, want, 1e-6), `${g.grams} lawan ${want}`);
    check(`harga: berat kubus ${s} mm <= pepejal`, g.grams <= g.solidGrams + 1e-9);
  }
  check('harga: kubus kecil semuanya kulit = pepejal', near(P.printGrams(cube(3), 27).grams, (27 / 1000) * 1.24, 1e-9));

  const priceCases = [{}, { acrylic: 2 }, { type: 'slot' }, { type: 'serong', plakL: 300, plakH: 380 },
    { plakL: 30, plakW: 10, plakH: 30, gap: 2, gapTop: 0, rim: 3, baseH: 8 },
    { plakL: LIMITS.plakL[1], plakW: LIMITS.plakW[1], plakH: LIMITS.plakH[1], gap: LIMITS.gap[1],
      gapTop: LIMITS.gapTop[1], rim: LIMITS.rim[1], baseH: LIMITS.baseH[1], grooveDepth: LIMITS.grooveDepth[1] }];
  for (const t of BASE_TYPES) priceCases.push({ type: t.id }, { type: t.id, acrylic: 2, plakL: 80, plakH: 120 });
  for (const params of priceCases) {
    const m = buildPlakBox({ ...DEFAULTS, ...params });
    const tag = `harga ${JSON.stringify(params)}`;
    for (const sheet of ['900x600', '600x400']) {
      const q1 = P.plakQuote(m, { qty: 1, sheet });
      check(`${tag} ${sheet}: ada harga`, q1.state === 'priced', q1.state);
      if (q1.state !== 'priced') continue;
      // Tapak: berat antara infill sahaja dan pepejal; RM0.50 sesegram.
      const solid = m.stats.gramsSolid;
      check(`${tag}: berat tapak munasabah`, q1.grams > solid * 0.1 && q1.grams < solid, `${q1.grams} / ${solid}`);
      check(`${tag}: tapak = berat x RM0.50`, q1.baseSetSen === Math.round(q1.grams * 50));
      // Akrilik: enjin Kalkulator Laser Cut yang sama, dipanggil terus.
      const job = P.acrylicJob(m, sheet);
      const mat = m.params.acrylic === 2 ? 'acr2' : 'acr3';
      check(`${tag}: bahan ${mat}`, job.material.id === mat && q1.acrylic.material.id === mat);
      const direct = L.quote(job.pieces, job.laser, mat, '1');
      check(`${tag}: akrilik = quote() Kalkulator Laser Cut`, direct.totalSen === q1.acrylicSen && q1.acrylicSen > 0);
      // Lima keping = senarai panel, saiz siap.
      const want = m.derived.panels.flatMap((pp) => Array.from({ length: pp.qty }, () => [pp.w, pp.h]))
        .map(([w, hh]) => `${Math.round(w * 1000)}x${Math.round(hh * 1000)}`).sort();
      check(`${tag}: keping akrilik = panel`, JSON.stringify(job.pieces.map((pc) => `${pc.wUm}x${pc.hUm}`).sort())
        === JSON.stringify(want));
      // Masa potong: sekurang-kurangnya perimeter / laju, dan pecutan menambah sedikit sahaja.
      const perim = m.derived.panels.reduce((a, pp) => a + pp.qty * 2 * (pp.w + pp.h), 0);
      const cut = job.laser.cutSec[mat];
      check(`${tag}: masa potong >= perimeter / laju`, cut >= perim / job.material.cutSpeed - 1e-9
        && cut < perim / job.material.cutSpeed + 20 * segTime(1, job.material.cutSpeed), `${cut}`);
      check(`${tag}: ada gerak kosong`, job.laser.rapidSec > 0);
      // Jumlah dan julat.
      check(`${tag}: jumlah = tapak + akrilik, 10 sen`, q1.totalSen === Math.floor((q1.baseSen + q1.acrylicSen) / 10 + 0.5) * 10
        && q1.totalSen % 10 === 0);
      check(`${tag}: julat +-15%`, q1.lowSen === Math.floor((q1.totalSen * 0.85) / 100) * 100
        && q1.highSen === Math.ceil((q1.totalSen * 1.15) / 100) * 100 && q1.lowSen <= q1.totalSen && q1.totalSen <= q1.highSen);
      check(`${tag}: teks julat`, q1.rangeText === `${L.fmtRMWhole(q1.lowSen)} - ${L.fmtRMWhole(q1.highSen)}`);
      // Kuantiti.
      const q3 = P.plakQuote(m, { qty: 3, sheet });
      check(`${tag}: 3 set - tapak x3`, q3.baseSen === 3 * q1.baseSen && q3.qty === 3);
      check(`${tag}: 3 set - akrilik = quote() x3`, q3.acrylicSen === L.quote(job.pieces, job.laser, mat, '3').totalSen);
      check(`${tag}: 3 set ~ 3 x seset`, Math.abs(q3.totalSen - 3 * q1.totalSen) <= 30 || q1.acrylic.minApplied,
        `${q3.totalSen} lawan ${3 * q1.totalSen}`);
      // Mesej WhatsApp: nombor kedai, harga yang sama dengan skrin.
      const url = P.orderUrl(m, q3, { color: 'Walnut' });
      const text = decodeURIComponent(url.split('?text=')[1]);
      check(`${tag}: WhatsApp ke kedai`, url.startsWith('https://wa.me/60134354118?text='));
      // Harga tepat sahaja, sama dengan skrin - tiada pecahan tapak / akrilik.
      check(`${tag}: WhatsApp bawa harga tepat, tanpa pecahan`, text.includes(`Harga: ${q3.totalText}`)
        && !text.includes(q3.baseText) && !text.includes(q3.acrylicText) && !text.includes(' g)')
        && text.includes('Kuantiti: 3 set')
        && text.includes(`Clear ${m.params.acrylic} mm`) && text.includes('warna Walnut')
        && text.includes('Ambil sendiri di Shah Alam'));
    }
  }
  // Akrilik 3 mm lebih mahal daripada 2 mm (helaian RM70 lawan RM50, potong lebih perlahan).
  const a2 = P.plakQuote(buildPlakBox({ ...DEFAULTS, acrylic: 2 }));
  const a3 = P.plakQuote(buildPlakBox({ ...DEFAULTS, acrylic: 3 }));
  check('harga: 3 mm > 2 mm', a3.acrylicSen > a2.acrylicSen);
  // Kuantiti teruk -> 1.
  for (const bad of [0, -2, 'x', NaN, null]) {
    check(`harga: kuantiti ${bad} -> 1`, P.plakQuote(buildPlakBox({ ...DEFAULTS }), { qty: bad }).qty === 1);
  }
  // Lalai: angka yang dibentang kepada Boss.
  const q0 = P.plakQuote(buildPlakBox({ ...DEFAULTS }));
  check('harga lalai 3 mm sekitar RM145', q0.totalSen > 12000 && q0.totalSen < 17000, q0.totalText);
  // Tanpa harga (keping luar katil): mesej minta sebut harga, tiada "undefined".
  const m0 = buildPlakBox({ ...DEFAULTS });
  const unpriced = decodeURIComponent(P.orderUrl(m0, { state: 'oversize', qty: 2 }, {}).split('?text=')[1]);
  check('harga: tanpa harga - minta sebut harga', unpriced.includes('Mohon sebut harga') && !unpriced.includes('undefined')
    && !unpriced.includes('NaN') && unpriced.includes('Kuantiti: 2 set'));

  // Akrilik 2 dan 3 mm sahaja: tebal lain disnap, dengan nota.
  for (const [asked, got, noted] of [[2, 2, false], [3, 3, false], ['3', 3, false], [5, 3, true], [1.5, 2, true],
    [2.2, 2, true], [2.7, 3, true], [10, 3, true], ['abc', DEFAULTS.acrylic, false], [undefined, DEFAULTS.acrylic, false]]) {
    const m = buildPlakBox({ ...DEFAULTS, acrylic: asked });
    const has = m.warnings.some((w) => w.includes('tidak ditawarkan'));
    check(`akrilik ${asked} -> ${got} mm${noted ? ', bernota' : ''}`, m.params.acrylic === got && has === noted,
      `${m.params.acrylic} ${has}`);
  }
}

// ---- reka bentuk tersimpan ---------------------------------------------------------
// Export menyimpan reka bentuk ke akaun sendiri. Diuji tanpa pelayar: fetch dan
// localStorage dipalsukan, dan apa yang dihantar disemak terhadap peraturan
// firestore.rules (kunci yang dibenarkan, had saiz).
{
  const S = await import(pathToFileURL(path.join(here, '..', 'docs', 'plakbox', 'src', 'saved.js')).href);
  const C = await import(pathToFileURL(path.join(here, '..', 'docs', 'plakbox', 'src', 'cloud.js')).href);
  const G = await import(pathToFileURL(path.join(here, '..', 'docs', 'plakbox', 'src', 'designs.js')).href);
  const COLORS = [{ id: '#6b4430' }, { id: '#a8774f' }, { id: '#2b2b2d' }, { id: '#f1f0ec' }];

  // Parameter: kunci DEFAULTS sahaja, nilai rosak jatuh ke lalai.
  const dp = S.designParams({ ...DEFAULTS, plakL: 250, plinthSplit: true, plinthH: 9, gap: NaN, type: 'serong', pocket: 'ya' });
  check('simpan: kunci params = DEFAULTS sahaja', JSON.stringify(Object.keys(dp)) === JSON.stringify(Object.keys(DEFAULTS))
    && Object.keys(dp).length <= 40);
  check('simpan: nilai rosak -> lalai', dp.plakL === 250 && dp.gap === DEFAULTS.gap && dp.pocket === DEFAULTS.pocket
    && dp.type === 'serong');

  // Pergi-balik melalui format Firestore.
  const st = {
    params: { ...DEFAULTS, plakL: 300, plakH: 410.5, acrylic: 2, type: 'tingkat', pocket: false },
    color: '#2b2b2d', name: '', acr: { sheet: '600x400', kerf: 0.2, labels: true },
  };
  const trip = (row) => C.fromFields(C.toFields(row));
  const row = trip({ name: S.autoName(st.params), tool: 'plakbox', params: S.designParams(st.params),
    material: S.designMaterial(st.params), extra: JSON.stringify(S.designExtra(st)) });
  const back = S.readDesign(row, COLORS);
  check('simpan: pergi-balik params', JSON.stringify(back.params) === JSON.stringify(S.designParams(st.params)),
    JSON.stringify(back.params));
  check('simpan: pergi-balik warna, helaian, kerf, label', back.color === '#2b2b2d' && back.acr.sheet === '600x400'
    && back.acr.kerf === 0.2 && back.acr.labels === true);
  check('simpan: nama automatik kekal automatik', back.name === '' && S.autoName(st.params) === 'Plak Box 300 x 80 x 410.5 mm');
  check('simpan: nama sendiri dikekalkan', S.readDesign({ ...row, name: 'Plak Datuk Bandar' }, COLORS).name === 'Plak Datuk Bandar');
  const junk = S.readDesign({ name: 'x', params: { plakL: '230', type: 'terapung', gap: null, acrylic: 3, evil: 1 }, extra: '{oops' }, COLORS);
  check('simpan: rekod rosak tidak merosakkan alat', junk.params.plakL === DEFAULTS.plakL && junk.params.type === DEFAULTS.type
    && junk.params.gap === DEFAULTS.gap && !('evil' in junk.params) && junk.color === undefined
    && junk.acr.sheet && Number.isFinite(junk.acr.kerf));
  check('simpan: rekod dibuka masih membina', buildPlakBox(junk.params).bodies[0].mesh.length > 0
    && buildPlakBox(back.params).params.acrylic === 2);
  check('simpan: warna asing diabaikan', S.readDesign({ ...row, extra: '{"color":"red"}' }, COLORS).color === undefined);

  // Simpan senyap: fetch palsu.
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  };
  const calls = [];
  let reply = (req) => ({ status: 200, body: JSON.stringify({ name: `projects/sifulaser/databases/(default)/documents/users/u1/designs/${req.method === 'POST' ? 'abc' : req.url.split('/').pop()}` }) });
  globalThis.fetch = async (url, init) => {
    const req = { url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null };
    calls.push(req);
    await new Promise((r) => setTimeout(r, 5));
    const res = reply(req);
    return { ok: res.status < 300, status: res.status, text: async () => res.body };
  };
  const gstore = {
    name: () => st.name || S.autoName(st.params),
    params: () => S.designParams(st.params),
    material: () => S.designMaterial(st.params),
    extra: () => S.designExtra(st),
    rename: () => {},
    apply: () => {},
  };

  check('simpan: tanpa daftar masuk -> tiada panggilan', (await G.saveQuietly(gstore)) === false && calls.length === 0);
  store.set('sifulaser.session', JSON.stringify({ uid: 'u1', token: 'tok', email: 'a@b.c', exp: Date.now() - 1000 }));
  check('simpan: sesi tamat -> tiada panggilan', (await G.saveQuietly(gstore)) === false && calls.length === 0);
  store.set('sifulaser.session', JSON.stringify({ uid: 'u1', token: 'tok', email: 'a@b.c', exp: Date.now() + 3.6e6 }));

  // Export dibuka dan STL ditekan serta-merta: dua simpanan serentak.
  const [r1, r2] = await Promise.all([G.saveQuietly(gstore), G.saveQuietly(gstore)]);
  check('simpan: dua serentak -> satu POST kemudian PATCH id yang sama', r1 && r2 && calls.length === 2
    && calls[0].method === 'POST' && calls[1].method === 'PATCH' && calls[1].url.includes('/users/u1/designs/abc'),
  calls.map((c) => `${c.method} ${c.url}`).join(' ; '));
  const sent = calls[0];
  const f = sent.body.fields;
  check('simpan: ke akaun sendiri, dengan token', sent.url.includes('/documents/users/u1/designs')
    && sent.headers.Authorization === 'Bearer tok');
  // firestore.rules: kunci yang dibenarkan dan hadnya.
  const allowed = ['name', 'tool', 'params', 'material', 'updatedAt', 'extra'];
  check('simpan: kunci rekod ikut firestore.rules', Object.keys(f).every((k) => allowed.includes(k)));
  check('simpan: tool plakbox, nama <= 120, tool <= 40', f.tool.stringValue === 'plakbox'
    && f.name.stringValue === 'Plak Box 300 x 80 x 410.5 mm' && f.name.stringValue.length <= 120 && f.tool.stringValue.length <= 40);
  check('simpan: params map <= 40 kunci', !!f.params.mapValue && Object.keys(f.params.mapValue.fields).length === Object.keys(DEFAULTS).length
    && Object.keys(f.params.mapValue.fields).length <= 40);
  check('simpan: bahan dan extra', f.material.stringValue === 'Akrilik Clear 2mm'
    && typeof f.extra.stringValue === 'string' && f.extra.stringValue.length <= 700000
    && JSON.parse(f.extra.stringValue).color === '#2b2b2d');
  // Nombor bulat sebagai integerValue rentetan - dibaca kembali sebagai nombor.
  check('simpan: plakL dihantar sebagai integerValue', f.params.mapValue.fields.plakL.integerValue === '300'
    && f.params.mapValue.fields.plakH.doubleValue === 410.5);

  // Simpanan seterusnya mengemas kini entri yang sama.
  st.params.plakL = 320;
  await G.saveQuietly(gstore);
  check('simpan: export kali kedua -> PATCH, bukan entri baharu', calls.length === 3 && calls[2].method === 'PATCH'
    && calls[2].body.fields.params.mapValue.fields.plakL.integerValue === '320'
    && calls[2].body.fields.name.stringValue === 'Plak Box 320 x 80 x 410.5 mm');

  // Pelayan menolak: senyap, false, tidak campak - fail tetap dimuat turun.
  reply = () => ({ status: 403, body: '' });
  let threw = false, res403;
  try { res403 = await G.saveQuietly(gstore); } catch { threw = true; }
  check('simpan: ditolak -> false, tidak campak', !threw && res403 === false);
  reply = () => ({ status: 500, body: 'boom' });
  check('simpan: ralat pelayan -> false', (await G.saveQuietly(gstore)) === false);
  // Selepas kegagalan, barisan tidak tersekat.
  reply = (req) => ({ status: 200, body: JSON.stringify({ name: `x/designs/${req.url.split('/').pop()}` }) });
  check('simpan: barisan pulih selepas gagal', (await G.saveQuietly(gstore)) === true);
  delete globalThis.fetch;
  delete globalThis.localStorage;
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
