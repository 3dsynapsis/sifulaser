// Ujian jasad cetak 3D Tray Organizer. Tiada kebergantungan selain three.js
// yang sudah divendor dalam docs/tray/vendor.
//
//     node scripts/test-tray3d.mjs
//
// Apa yang disemak dan kenapa:
//   * MANIFOLD      - setiap tepi dikongsi TEPAT dua segitiga, arah bertentangan.
//                     Inilah yang Bambu Studio / Orca semak sebelum memberi
//                     lencana amaran; satu tepi terbuka = satu STL "rosak".
//   * isi padu      - isi padu mesh (teorem kecapahan) = isi padu analitik
//                     daripada luas poligon x tinggi. Kalau satu segitiga
//                     terbalik atau satu muka hilang, nombor ini lari.
//   * bbox          - L x W x H tepat.
//   * tiada merosot - setiap segitiga ada luas.
//   * setiap kes    - fillet 0 dan bukan 0, pembahagi rendah dan separas rim,
//                     boleh susun, grid 1x1 hingga 12x12, input teruk.
//   * STL           - 84 + 50n bait, kiraan sepadan, normal unit.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const TRAY = path.join(here, '..', 'docs', 'tray');
const THREE = await import(pathToFileURL(path.join(TRAY, 'vendor', 'three.module.js')).href);
const { buildTray3D, trianglesToStl, PRINTERS } =
  await import(pathToFileURL(path.join(TRAY, 'src', 'geom', 'tray3d.js')).href);

let passed = 0, failed = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; return; }
  failed++; fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
};
const near = (a, b, eps) => Math.abs(a - b) <= eps;

const key = (x, y, z) => `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;

/** Analisis mesh: tepi, isi padu, bbox, merosot. */
function analyse(tris) {
  const n = tris.length / 9;
  const edges = new Map(); // "a|b" terarah -> kiraan
  let vol = 0;
  let degenerate = 0;
  const bb = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  for (let t = 0; t < n; t++) {
    const b = t * 9;
    const P = [0, 1, 2].map((k) => [tris[b + k * 3], tris[b + k * 3 + 1], tris[b + k * 3 + 2]]);
    for (const [x, y, z] of P) {
      bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x);
      bb.y0 = Math.min(bb.y0, y); bb.y1 = Math.max(bb.y1, y);
      bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z);
    }
    const [a, bq, c] = P;
    // Isi padu bertanda (teorem kecapahan): sum(a . (b x c)) / 6
    vol += (a[0] * (bq[1] * c[2] - bq[2] * c[1]) - a[1] * (bq[0] * c[2] - bq[2] * c[0]) + a[2] * (bq[0] * c[1] - bq[1] * c[0])) / 6;
    const ux = bq[0] - a[0], uy = bq[1] - a[1], uz = bq[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area2 < 1e-9) degenerate++;
    const K = P.map((q) => key(...q));
    for (let k = 0; k < 3; k++) {
      const e = `${K[k]}|${K[(k + 1) % 3]}`;
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  // Manifold: setiap tepi terarah muncul sekali, dan pasangan terbaliknya muncul sekali.
  let open = 0, over = 0;
  for (const [e, cnt] of edges) {
    if (cnt !== 1) over++;
    const [a, b] = e.split('|');
    if (!edges.has(`${b}|${a}`)) open++;
  }
  return { n, vol, degenerate, bb, open, over, edgeCount: edges.size };
}

function checkTray(label, params, expect = {}) {
  let tray;
  try { tray = buildTray3D(params, THREE); } catch (e) {
    check(`${label}: bina tanpa campak`, false, e.message); return null;
  }
  const { params: p, derived: d, mesh } = tray;
  const m = analyse(mesh);
  check(`${label}: ada segitiga`, m.n > 0);
  check(`${label}: kiraan segitiga sepadan derived`, m.n === d.triangles, `${m.n} vs ${d.triangles}`);
  check(`${label}: tiada segitiga merosot`, m.degenerate === 0, `${m.degenerate}`);
  check(`${label}: MANIFOLD - tiada tepi terbuka`, m.open === 0, `${m.open} tepi terbuka daripada ${m.edgeCount}`);
  check(`${label}: MANIFOLD - tiada tepi dikongsi > 2`, m.over === 0, `${m.over}`);
  check(`${label}: isi padu positif (normal keluar)`, m.vol > 0, `${m.vol}`);
  // Mesh ialah Float32 kerana STL ialah float32. Pada 600 mm satu ulp float32
  // ialah 6e-5 mm, dan isi padu daripada koordinat yang dibundarkan itu lari
  // sehingga ~3e-6 relatif (diukur: isi padu float64 SAMA dengan analitik
  // hingga 1e-6 mm^3, float32 lari 2.8e-6). Muka yang hilang atau terbalik
  // ditangkap oleh semakan manifold berarah di atas, bukan oleh nombor ini.
  check(`${label}: isi padu mesh = analitik`, near(m.vol, d.volumeMm3, Math.max(0.5, d.volumeMm3 * 6e-6)),
    `mesh ${m.vol.toFixed(4)} vs analitik ${d.volumeMm3.toFixed(4)}`);
  check(`${label}: bbox L x W x H`, near(m.bb.x1 - m.bb.x0, p.length, 1e-6) && near(m.bb.y1 - m.bb.y0, p.width, 1e-6)
    && near(m.bb.z1 - m.bb.z0, p.height, 1e-6) && near(m.bb.z0, 0, 1e-9),
    `${(m.bb.x1 - m.bb.x0).toFixed(3)} x ${(m.bb.y1 - m.bb.y0).toFixed(3)} x ${(m.bb.z1 - m.bb.z0).toFixed(3)}`);
  // Isi padu waras: kurang daripada kotak pepejal, lebih daripada lantai sahaja.
  check(`${label}: isi padu < kotak pepejal`, m.vol < p.length * p.width * p.height);
  check(`${label}: isi padu > lantai sahaja`, m.vol > p.length * p.width * p.floorT * 0.99);
  if (expect.cells != null) check(`${label}: ${expect.cells} petak`, d.cellCount === expect.cells, `${d.cellCount}`);
  if (expect.flatTop != null) check(`${label}: flatTop ${expect.flatTop}`, d.flatTop === expect.flatTop);
  if (expect.warn) for (const w of expect.warn) check(`${label}: amaran '${w}'`, d.warnings.includes(w), d.warnings.join(','));
  if (expect.noWarn) for (const w of expect.noWarn) check(`${label}: tiada amaran '${w}'`, !d.warnings.includes(w), d.warnings.join(','));
  return tray;
}

// ---- kes ------------------------------------------------------------------------
checkTray('lalai 3x2 fillet 2', {}, { cells: 6, flatTop: true, noWarn: ['katil', 'petak'] });
checkTray('fillet 0', { fillet: 0 }, { cells: 6 });
checkTray('fillet besar (dihadkan)', { fillet: 50 }, { cells: 6 });
checkTray('satu petak', { cols: [1], rows: [1] }, { cells: 1, flatTop: true });
checkTray('satu petak fillet 0', { cols: [1], rows: [1], fillet: 0 }, { cells: 1 });
checkTray('satu lajur, 4 baris', { cols: [1], rows: [1, 2, 1, 1] }, { cells: 4 });
checkTray('4 lajur, satu baris', { cols: [1, 1, 2, 1], rows: [1] }, { cells: 4 });
checkTray('pembahagi 50%', { dividerHeight: 50 }, { cells: 6, flatTop: false });
checkTray('pembahagi 50% fillet 0', { dividerHeight: 50, fillet: 0 }, { flatTop: false });
checkTray('pembahagi 20%', { dividerHeight: 20, height: 60 }, { flatTop: false });
checkTray('pembahagi 50% 3x3 (petak tengah)', { dividerHeight: 50, cols: [1, 1, 1], rows: [1, 1, 1] }, { cells: 9, flatTop: false });
checkTray('pembahagi 70% 4x3 tak seragam', { dividerHeight: 70, length: 300, width: 200, cols: [3, 1, 2, 1.5], rows: [1, 2, 1] }, { cells: 12, flatTop: false });
checkTray('boleh susun', { stack: true }, { cells: 6, flatTop: false, warn: ['susun'] });
checkTray('boleh susun + pembahagi 50%', { stack: true, dividerHeight: 50 }, { flatTop: false, noWarn: ['susun'] });
checkTray('boleh susun fillet 0', { stack: true, fillet: 0 }, { flatTop: false });
checkTray('boleh susun satu petak', { stack: true, cols: [1], rows: [1] }, { cells: 1 });
checkTray('boleh susun kelonggaran 0', { stack: true, stackClear: 0 });
checkTray('boleh susun kelonggaran 1', { stack: true, stackClear: 1 });
checkTray('dinding 1.2 lantai 1.2', { wallT: 1.2, floorT: 1.2 });
checkTray('dinding 3 lantai 3', { wallT: 3, floorT: 3, fillet: 3 });
checkTray('dulang kecil 40x30x15', { length: 40, width: 30, height: 15, cols: [1, 1], rows: [1] });
checkTray('dulang besar 12x12', { length: 400, width: 400, height: 60, cols: new Array(12).fill(1), rows: new Array(12).fill(1), dividerHeight: 80 }, { cells: 144, flatTop: false });
checkTray('dulang besar 12x12 fillet 0', { length: 400, width: 400, height: 60, cols: new Array(12).fill(1), rows: new Array(12).fill(1), fillet: 0 }, { cells: 144 });
checkTray('petak kecil 8mm', { length: 60, width: 30, cols: [1, 1, 1, 1, 1], rows: [1], fillet: 1 }, { cells: 5 });
checkTray('katil tak muat A1 mini', { length: 300, width: 100, printer: 'bambu-a1mini' }, { warn: ['katil'] });
checkTray('katil muat dipusing', { length: 100, width: 250, printer: 'prusa-mk4' }, { noWarn: ['katil'] });
checkTray('katil custom', { printer: 'custom', bedX: 150, bedY: 150, bedZ: 100, length: 160 }, { warn: ['katil'] });
checkTray('tinggi melebihi katil', { height: 300, printer: 'bambu-a1mini' }, { warn: ['katil'] });

// ---- susun atur "belah petak sendiri" (pokok) ------------------------------------
// Inilah sebab pokok wujud: satu petak panjang di sebelah petak kecil.
const SUDU = { s: 'x', f: [1, 2], k: [{}, { s: 'y', f: [1, 1], k: [{}, { s: 'x', f: [1, 1], k: [{}, {}] }] }] };
checkTray('sudu + 2x2 (simpang T)', { layout: { s: 'x', f: [1, 2], k: [{}, { s: 'y', f: [1, 1], k: [{ s: 'x', f: [1, 1], k: [{}, {}] }, { s: 'x', f: [1, 1], k: [{}, {}] }] }] } }, { cells: 5 });
checkTray('sudu + 2x2 fillet 0', { fillet: 0, layout: { s: 'x', f: [1, 2], k: [{}, { s: 'y', f: [1, 1], k: [{ s: 'x', f: [1, 1], k: [{}, {}] }, { s: 'x', f: [1, 1], k: [{}, {}] }] }] } }, { cells: 5 });
checkTray('sudu + 2x2 pembahagi 50%', { dividerHeight: 50, layout: { s: 'x', f: [1, 2], k: [{}, { s: 'y', f: [1, 1], k: [{ s: 'x', f: [1, 1], k: [{}, {}] }, { s: 'x', f: [1, 1], k: [{}, {}] }] }] } }, { cells: 5, flatTop: false });
checkTray('sudu + 3x3', { length: 300, width: 200, layout: { s: 'x', f: [1, 3], k: [{}, { s: 'y', f: [1, 1, 1], k: [0, 1, 2].map(() => ({ s: 'x', f: [1, 1, 1], k: [{}, {}, {}] })) }] } }, { cells: 10 });
checkTray('sudu + 3x3 fillet 0 50%', { fillet: 0, dividerHeight: 50, length: 300, width: 200, layout: { s: 'x', f: [1, 3], k: [{}, { s: 'y', f: [1, 1, 1], k: [0, 1, 2].map(() => ({ s: 'x', f: [1, 1, 1], k: [{}, {}, {}] })) }] } }, { cells: 10, flatTop: false });
checkTray('bersarang 3 aras', { layout: SUDU }, { cells: 4 });
checkTray('bersarang 3 aras boleh susun', { layout: SUDU, stack: true }, { cells: 4 });
checkTray('petak dalaman (T dari empat arah)', {
  length: 240, width: 240, dividerHeight: 60,
  layout: { s: 'y', f: [1, 2, 1], k: [{}, { s: 'x', f: [1, 2, 1], k: [{}, { s: 'y', f: [1, 1], k: [{}, {}] }, {}] }, {}] },
}, { cells: 6, flatTop: false });
checkTray('baris atas penuh, bawah 4 lajur', { layout: { s: 'y', f: [1, 1], k: [{ s: 'x', f: [1, 1, 1, 1], k: [{}, {}, {}, {}] }, {}] } }, { cells: 5 });
checkTray('pokok rosak dibersihkan', { layout: { s: 'z', f: 'x', k: 5 } }, { cells: 1 });
checkTray('pokok satu anak dileburkan', { layout: { s: 'x', f: [1], k: [{ s: 'y', f: [1, 1], k: [{}, {}] }] } }, { cells: 2 });

// ---- fuzz: pokok rawak ---------------------------------------------------------------
// PRNG bertitik benih supaya kegagalan boleh diulang.
let seed = 20261008;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const randTree = (depth, axisHint) => {
  if (depth <= 0 || rnd() < 0.3) return {};
  const s = axisHint || (rnd() < 0.5 ? 'x' : 'y');
  const n = 2 + Math.floor(rnd() * 3);
  return { s, f: Array.from({ length: n }, () => 0.5 + rnd() * 2), k: Array.from({ length: n }, () => randTree(depth - 1, s === 'x' ? 'y' : 'x')) };
};
let fuzzRun = 0;
for (let n = 0; n < 60; n++) {
  const params = {
    length: 120 + Math.round(rnd() * 200), width: 100 + Math.round(rnd() * 150), height: 20 + Math.round(rnd() * 40),
    fillet: [0, 0.5, 2, 4][Math.floor(rnd() * 4)], wallT: [1.2, 1.6, 2][Math.floor(rnd() * 3)],
    dividerHeight: [100, 70, 40][Math.floor(rnd() * 3)], stack: rnd() < 0.25, layout: randTree(3),
  };
  const t = checkTray(`fuzz #${n} ${JSON.stringify(params.layout).length}b`, params);
  if (t) fuzzRun++;
}
check('fuzz: semua 60 dibina', fuzzRun === 60, `${fuzzRun}`);

// ---- grid terlalu padat: pembahagi tak dijana, masih manifold -------------------
{
  const t = checkTray('grid terlalu padat', { length: 40, width: 30, cols: new Array(8).fill(1), rows: [1] }, { warn: ['petak'] });
  if (t) check('grid padat: divOK palsu', !t.derived.divOK);
}

// ---- input teruk ---------------------------------------------------------------------
const bad = [
  { wallT: 0 }, { wallT: -1 }, { wallT: 'x' }, { floorT: 0 }, { floorT: 100 },
  { length: 0, width: 0, height: 0 }, { height: 1 }, { fillet: -5 }, { fillet: NaN },
  { cols: [], rows: [] }, { cols: [0, 0] }, { cols: new Array(50).fill(1) },
  { dividerHeight: 0 }, { dividerHeight: 1000 }, { stack: 'ya' }, { stackClear: -1 }, { footH: 1000 },
  { printer: 'tiada' }, { minCellPrint: 0 },
];
for (const b of bad) checkTray(`input teruk ${JSON.stringify(b)}`, b);

// ---- STL ----------------------------------------------------------------------------
{
  const tray = buildTray3D({}, THREE);
  const buf = trianglesToStl(tray.mesh, 'ujian');
  const dv = new DataView(buf);
  const n = dv.getUint32(80, true);
  check('stl: kiraan segitiga', n === tray.derived.triangles, `${n}`);
  check('stl: saiz 84 + 50n', buf.byteLength === 84 + 50 * n);
  check('stl: pengepala', String.fromCharCode(...new Uint8Array(buf, 0, 5)) === 'ujian');
  // Normal unit dan sepadan dengan bucu (lilitan kanan).
  let badNormals = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50;
    const nx = dv.getFloat32(o, true), ny = dv.getFloat32(o + 4, true), nz = dv.getFloat32(o + 8, true);
    if (!near(Math.hypot(nx, ny, nz), 1, 1e-4)) badNormals++;
    const v = [];
    for (let k = 0; k < 9; k++) v.push(dv.getFloat32(o + 12 + k * 4, true));
    const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2], vx = v[6] - v[0], vy = v[7] - v[1], vz = v[8] - v[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz <= 0) badNormals++;
  }
  check('stl: semua normal unit & lilitan kanan', badNormals === 0, `${badNormals}`);
  check('stl: atribut sifar', dv.getUint16(84 + 48, true) === 0);
}

// ---- nilai lalai & derived waras -------------------------------------------------------
{
  const t = buildTray3D({}, THREE);
  check('lalai: dinding 1.6', t.params.wallT === 1.6);
  check('lalai: thickness = wallT untuk grid', t.params.thickness === 1.6);
  check('lalai: minCell 8', t.params.minCell === 8);
  // Pokok daripada grid 3x2: 2 pembahagi menegak penuh, 3 segmen melintang (satu setiap lajur).
  check('lalai: 2 segmen X, 3 segmen Y', t.derived.dividers.x.length === 2 && t.derived.dividers.y.length === 3);
  check('lalai: berat PLA munasabah (20-200 g)', t.derived.gramsPLA > 20 && t.derived.gramsPLA < 200, `${t.derived.gramsPLA.toFixed(1)} g`);
  check('lalai: printer Bambu A1', t.derived.printerName === PRINTERS[1].name);
  // Isi padu analitik lalai, dikira sendiri: kotak - poket - (tiada bukaan atas sebab flatTop).
  const { length: L, width: W, height: H, floorT } = t.params;
  const sumCells = t.rings.cells.reduce((s, r) => s + Math.abs(r.reduce((a, [x, y], i, arr) => { const [x2, y2] = arr[(i + 1) % arr.length]; return a + x * y2 - x2 * y; }, 0) / 2), 0);
  const aO = Math.abs(t.rings.O.reduce((a, [x, y], i, arr) => { const [x2, y2] = arr[(i + 1) % arr.length]; return a + x * y2 - x2 * y; }, 0) / 2);
  check('lalai: formula isi padu', near(t.derived.volumeMm3, aO * H - sumCells * (H - floorT), 1e-6));
  check('lalai: luas O < L*W (fillet luar memotong bucu)', aO < L * W && aO > L * W * 0.99);
}

// ---- operasi susun atur (geom/layout.js) ----------------------------------------------
{
  const L = await import(pathToFileURL(path.join(TRAY, 'src', 'geom', 'layout.js')).href);
  const t = 1.6, minCell = 8;
  const box = [1.6, 1.6, 218.4, 158.4];
  const info = (tree) => L.layoutRegions(tree, ...box, t, minCell);
  const area = (tree) => {
    const i = info(tree);
    const cellsA = i.cells.reduce((s, c) => s + c.w * c.h, 0);
    const segA = i.segs.reduce((s, g) => s + (g.to - g.from) * t, 0);
    return { cellsA, segA, total: cellsA + segA, inner: (box[2] - box[0]) * (box[3] - box[1]), i };
  };
  const overlaps = (cells) => {
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) {
      const A = cells[a], B = cells[b];
      if (A.x < B.x1 - 1e-9 && B.x < A.x1 - 1e-9 && A.y < B.y1 - 1e-9 && B.y < A.y1 - 1e-9) return true;
    }
    return false;
  };
  const invariant = (label, tree) => {
    const a = area(tree);
    check(`${label}: petak + pembahagi = ruang dalam`, near(a.total, a.inner, 1e-6), `${a.total} vs ${a.inner}`);
    check(`${label}: petak tidak bertindih`, !overlaps(a.i.cells));
    check(`${label}: setiap petak >= had`, a.i.cells.every((c) => c.w >= minCell - 1e-6 && c.h >= minCell - 1e-6));
    return a.i;
  };

  // gridToTree
  const g = L.gridToTree([1, 1, 1], [1, 1]);
  check('gridToTree 3x2: 6 petak', L.countLeaves(g) === 6);
  check('gridToTree 1x1: daun', L.countLeaves(L.gridToTree([1], [1])) === 1 && !g.s === false);
  invariant('grid 3x2', g);

  // cleanTree melebur belahan sepaksi
  const flat = L.cleanTree({ s: 'x', f: [1, 2], k: [{}, { s: 'x', f: [1, 1], k: [{}, {}] }] });
  check('cleanTree: [a | (b | c)] jadi [a | b | c]', flat.k.length === 3 && near(flat.f[1], 1, 1e-9) && near(flat.f[2], 1, 1e-9));

  // Belah petak: sudu dahulu - buang pembahagi melintang dalam lajur pertama.
  let tree = g;
  let i0 = info(tree);
  const firstColSeg = i0.segs.find((s) => s.axis === 'y' && L.samePath(s.path, [0]));
  check('lajur 1 ada pembahagi melintang', !!firstColSeg);
  let r = L.removeDivider(tree, firstColSeg.path, firstColSeg.k, i0, t);
  check('buang: berjaya', !!r);
  tree = L.cleanTree(r.tree);
  i0 = invariant('selepas buang (sudu)', tree);
  check('buang: 5 petak', i0.cells.length === 5);
  const sudu = i0.cells.find((c) => L.samePath(c.path, [0]));
  check('buang: lajur 1 kini satu petak penuh dalam', sudu && near(sudu.h, box[3] - box[1], 1e-9));
  check('buang: pilihan menunjuk ke petak itu', L.samePath(r.select, [0]));

  // Belah petak kanan atas jadi 2 lajur: jirannya tidak bergerak.
  const target = i0.cells.find((c) => L.samePath(c.path, [2, 1]));
  const others = i0.cells.filter((c) => !L.samePath(c.path, [2, 1])).map((c) => JSON.stringify([c.x, c.y, c.x1, c.y1]));
  r = L.splitLeaf(tree, [2, 1], 'x', i0, t, minCell);
  check('belah: berjaya', !!r);
  tree = L.cleanTree(r.tree);
  const i1 = invariant('selepas belah', tree);
  check('belah: 6 petak', i1.cells.length === 6);
  const after = new Set(i1.cells.map((c) => JSON.stringify([c.x, c.y, c.x1, c.y1])));
  check('belah: petak lain tak bergerak', others.every((o) => after.has(o)));
  const halves = i1.cells.filter((c) => c.y === target.y && c.y1 === target.y1 && c.x >= target.x - 1e-9 && c.x1 <= target.x1 + 1e-9);
  check('belah: dua separuh sama', halves.length === 2 && near(halves[0].w, halves[1].w, 1e-9) && near(halves[0].w * 2 + t, target.w, 1e-9));

  // Belah sepaksi dengan induk: jadi adik-beradik, bukan bersarang.
  const before = L.nodeAt(tree, []).k.length;
  r = L.splitLeaf(tree, [0], 'x', i1, t, minCell);
  tree = L.cleanTree(r.tree);
  check('belah sepaksi: akar kini 4 anak', L.nodeAt(tree, []).k.length === before + 1);
  invariant('selepas belah sepaksi', tree);

  // Seret: pasangan tetap, petak lain tak bergerak, had dihormati.
  let i2 = info(tree);
  const seg = i2.segs.find((s) => s.axis === 'x' && s.path.length === 0 && s.k === 1);
  const moved = L.moveDivider(tree, seg.path, seg.k, seg.pos + 15, i2, t, minCell);
  check('seret: berjaya', !!moved);
  const i3 = invariant('selepas seret', L.cleanTree(moved));
  const ni2 = i2.nodes.get(''), ni3 = i3.nodes.get('');
  check('seret: anak k membesar 15', near(ni3.sizes[1] - ni2.sizes[1], 15, 1e-6));
  check('seret: anak k+1 mengecil 15', near(ni2.sizes[2] - ni3.sizes[2], 15, 1e-6));
  check('seret: anak lain tak berubah', near(ni3.sizes[0], ni2.sizes[0], 1e-9) && near(ni3.sizes[3], ni2.sizes[3], 1e-9));
  // Seret jauh melampaui: dihadkan pada minSpan subpokok.
  const far = L.moveDivider(tree, seg.path, seg.k, 1e6, i2, t, minCell);
  const i4 = invariant('seret melampau', L.cleanTree(far));
  check('seret melampau: anak k+1 = minSpan', near(i4.nodes.get('').sizes[2], L.minSpan(L.nodeAt(tree, [2]), 'x', minCell, t), 1e-6));

  // setCellSize: lebar petak sudu jadi 30 mm.
  tree = L.cleanTree(far);
  let i5 = info(tree);
  const sp = i5.cells.find((c) => L.samePath(c.path, [0]));
  const set = L.setCellSize(tree, sp.path, 'x', 30, i5, t, minCell);
  const i6 = invariant('setCellSize', L.cleanTree(set.tree));
  check('setCellSize: lebar 30', near(i6.cells.find((c) => L.samePath(c.path, [0])).w, 30, 1e-6));
  // Petak yang merentang seluruh dulang sepanjang paksi itu -> minta ubah saiz dulang.
  const full = L.setCellSize(tree, sp.path, 'y', 100, i5, t, minCell);
  check('setCellSize merentang penuh: minta resize', full && full.resize === 100);

  // Had: tak boleh belah petak terlalu kecil; tak boleh melebihi MAX_CELLS.
  check('canSplit: petak 15 mm tak boleh dibelah (had 8)', !L.canSplit({}, [], 'x', L.layoutRegions({}, 0, 0, 15, 100, t, minCell), t, minCell));
  let big = {};
  for (let k = 0; k < 200; k++) {
    const ib = L.layoutRegions(big, 0, 0, 2000, 2000, t, minCell);
    const leaf = ib.cells.reduce((m, c) => (c.w * c.h > m.w * m.h ? c : m));
    const res = L.splitLeaf(big, leaf.path, leaf.w > leaf.h ? 'x' : 'y', ib, t, minCell);
    if (!res) break;
    big = L.cleanTree(res.tree);
  }
  check(`MAX_CELLS dihormati (${L.MAX_CELLS})`, L.countLeaves(big) === L.MAX_CELLS, `${L.countLeaves(big)}`);
  const bigT = checkTray('100 petak hasil belahan berulang', { length: 600, width: 600, height: 40, layout: big }, { cells: 100 });
  check('100 petak: dibina', !!bigT);

  // Buang hingga tinggal satu petak: pokok runtuh ke daun.
  let shrink = L.gridToTree([1, 1], [1]);
  const is = info(shrink);
  const rr = L.removeDivider(shrink, is.segs[0].path, is.segs[0].k, is, t);
  check('buang pembahagi terakhir: jadi daun', L.countLeaves(L.cleanTree(rr.tree)) === 1 && !L.cleanTree(rr.tree).s);
}

console.log(`\n${passed} lulus, ${failed} gagal`);
if (failed) {
  console.log('\nGAGAL:');
  for (const f of fails.slice(0, 60)) console.log(`  x ${f}`);
  if (fails.length > 60) console.log(`  ... dan ${fails.length - 60} lagi`);
  process.exit(1);
}
