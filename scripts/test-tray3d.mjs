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
  // Mesh ialah Float32 (STL pun float32): koordinat ~200 mm membawa ralat
  // ~1e-5 mm, yang terkumpul menjadi ~1e-6 relatif pada isi padu. Satu muka
  // yang HILANG pula tersasar beribu mm^3 - jadi 2e-6 masih menangkapnya.
  check(`${label}: isi padu mesh = analitik`, near(m.vol, d.volumeMm3, Math.max(0.5, d.volumeMm3 * 2e-6)),
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
checkTray('lalai 3x2 fillet 2', {}, { cells: 6, flatTop: true, noWarn: ['katil', 'lajur'] });
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

// ---- grid terlalu padat: pembahagi tak dijana, masih manifold -------------------
{
  const t = checkTray('grid terlalu padat', { length: 40, width: 30, cols: new Array(8).fill(1), rows: [1] }, { warn: ['lajur'] });
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
  check('lalai: 2 pembahagi X, 1 Y', t.derived.xDiv.length === 2 && t.derived.yDiv.length === 1);
  check('lalai: berat PLA munasabah (20-200 g)', t.derived.gramsPLA > 20 && t.derived.gramsPLA < 200, `${t.derived.gramsPLA.toFixed(1)} g`);
  check('lalai: printer Bambu A1', t.derived.printerName === PRINTERS[1].name);
  // Isi padu analitik lalai, dikira sendiri: kotak - poket - (tiada bukaan atas sebab flatTop).
  const { length: L, width: W, height: H, floorT } = t.params;
  const sumCells = t.rings.cells.reduce((s, r) => s + Math.abs(r.reduce((a, [x, y], i, arr) => { const [x2, y2] = arr[(i + 1) % arr.length]; return a + x * y2 - x2 * y; }, 0) / 2), 0);
  const aO = Math.abs(t.rings.O.reduce((a, [x, y], i, arr) => { const [x2, y2] = arr[(i + 1) % arr.length]; return a + x * y2 - x2 * y; }, 0) / 2);
  check('lalai: formula isi padu', near(t.derived.volumeMm3, aO * H - sumCells * (H - floorT), 1e-6));
  check('lalai: luas O < L*W (fillet luar memotong bucu)', aO < L * W && aO > L * W * 0.99);
}

console.log(`\n${passed} lulus, ${failed} gagal`);
if (failed) {
  console.log('\nGAGAL:');
  for (const f of fails.slice(0, 60)) console.log(`  x ${f}`);
  if (fails.length > 60) console.log(`  ... dan ${fails.length - 60} lagi`);
  process.exit(1);
}
