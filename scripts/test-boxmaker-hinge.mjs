// Ujian Box Maker gaya Hinge: penutup bertepi atas dua lengan yang turun di luar
// dinding sisi dan berpusing pada pivot kayu. Tiada kebergantungan.
//
//     node scripts/test-boxmaker-hinge.mjs
//
// Mengimport terus daripada docs/boxmaker/src - kod yang sifulaser.com hidangkan.
//
//   * cincin sah         - setiap outline dan lubang tertutup, tiada sisi yang
//                          bersilang, outline lawan arah jam.
//   * ukuran             - Length merentas lengan, badan = Length - 2 x (t + gap),
//                          ruang dalam betul bila ukuran dalam diminta.
//   * DIPASANG DALAM 3D  - setiap panel (bentuk NOMINAL) diisi ke grid voksel. Dua
//                          panel di voksel yang sama ialah kayu bertindih.
//   * tumpuk pivot       - sebaris merentas kotak: dinding, celah, cakera dalam
//                          satah lengan; kunci penuh dari muka dalam dinding hingga
//                          muka luar cakera, dan lubang lengan keliling cakera.
//   * PUSINGAN           - lengan, tepi dan atas penutup dipusing 0 hingga had
//                          bukaan tanpa menyentuh badan, cakera atau kunci, dan
//                          lebih sedikit dari had, ia memang tersekat.
//   * laluan pemasangan  - penutup turun lurus dari atas tanpa melanggar badan
//                          (cakera dan kunci dipasang kemudian); kunci masuk lurus
//                          dari luar melalui cakera ke dalam dinding.
//   * meja               - bucu penutup yang terhayun ke belakang tidak menembusi
//                          meja, dan telinga tidak melepasi belakang kotak.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'docs', 'boxmaker', 'src', 'geom');
const { buildBox, PANEL_ORDER, PANEL_LABELS } = await import(pathToFileURL(path.join(SRC, 'box.js')).href);
const {
  area, selfIntersects, gridOver, panelSolid, fill, ERODE,
} = await import(pathToFileURL(path.join(here, 'lib', 'boxmaker-voxel.mjs')).href);

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 60) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const DEG = Math.PI / 180;

/** Panel dipusing tentang paksi X penutup, sudut dalam darjah, tanda seperti view3d. */
function swungSolid(panel, deg, erode = ERODE) {
  const base = panelSolid(panel, null, erode);
  const { y, z, sign } = panel.swing;
  const a = sign * deg * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  const inside = (p) => {
    // Songsang putaran three.js tentang x: y' = y c - z s, z' = y s + z c.
    const dy = p[1] - y, dz = p[2] - z;
    return base.inside([p[0], y + dy * c + dz * s, z - dy * s + dz * c]);
  };
  const ys = []; const zs = [];
  for (const yy of [base.lo[1], base.hi[1]]) {
    for (const zz of [base.lo[2], base.hi[2]]) {
      const dy = yy - y, dz = zz - z;
      ys.push(y + dy * c - dz * s);
      zs.push(z + dy * s + dz * c);
    }
  }
  return {
    inside,
    lo: [base.lo[0], Math.min(...ys), Math.min(...zs)],
    hi: [base.hi[0], Math.max(...ys), Math.max(...zs)],
  };
}

/** Panel dialih lurus sejauh (dx, dy, dz). */
function movedSolid(panel, [dx, dy, dz], erode = ERODE) {
  const base = panelSolid(panel, null, erode);
  return {
    inside: (p) => base.inside([p[0] - dx, p[1] - dy, p[2] - dz]),
    lo: [base.lo[0] + dx, base.lo[1] + dy, base.lo[2] + dz],
    hi: [base.hi[0] + dx, base.hi[1] + dy, base.hi[2] + dz],
  };
}

function bodyGrid(p, r, extra = 0) {
  return gridOver([-2, -2 - extra, -2 - extra], [p.length + 2, p.width + 2 + extra, p.height + 2 + extra], r);
}

function testBox(params, { sweep = true } = {}) {
  const tag = JSON.stringify(params).slice(0, 100);
  let box;
  try { box = buildBox({ style: 'hinge', kerf: 0.2, thickness: 3, ...params }); } catch (e) {
    check(`${tag}: tak campak`, false, e.stack);
    return;
  }
  const h = box.derived.hinge;
  check(`${tag}: maklumat hinge`, !!h);
  if (!h) return;
  const p = box.params;
  const t = p.thickness;
  const by = (id) => box.panels.find((q) => q.id === id);
  const ids = box.panels.map((q) => q.id);
  const lidIds = ['lidTop', 'lidFront', 'lidBack', 'lidLeft', 'lidRight'];
  const pivotIds = ['discLeft', 'discRight', 'keyLeft', 'keyRight'];

  check(`${tag}: panel lengkap`, ['front', 'back', 'left', 'right', 'bottom', ...lidIds, ...pivotIds]
    .every((id) => ids.includes(id)), ids.join(','));
  for (const id of ids) {
    check(`${tag}: ${id} dalam PANEL_ORDER dan berlabel`, PANEL_ORDER.includes(id) && !!PANEL_LABELS[id]);
  }
  check(`${tag}: semua bahagian penutup berpusing pada satu paksi`,
    lidIds.every((id) => by(id).swing && by(id).swing.y === h.y && by(id).swing.z === h.z));
  check(`${tag}: pivot tidak berpusing dan tiada tab hiasan`,
    pivotIds.every((id) => !by(id).swing && by(id).noDecor));

  for (const q of box.panels) {
    for (const [k, ring] of [['outline', q.outlineNominal], ...q.holesNominal.map((hh, i) => [`hole${i}`, hh])]) {
      check(`${tag} [${q.id}] ${k}: cincin`, ring.length >= 3 && ring.every((v) => Number.isFinite(v[0]) && Number.isFinite(v[1])));
      const x = selfIntersects(ring);
      check(`${tag} [${q.id}] ${k}: tiada sisi bersilang`, !x, x && JSON.stringify([ring[x[0]], ring[x[1]]]));
    }
    check(`${tag} [${q.id}]: outline lawan arah jam`, area(q.outlineNominal) > 0);
  }

  // ---- ukuran
  const arm = t + h.gap;
  check(`${tag}: badan = Length - 2 lengan`, near(h.bodyL, p.length - 2 * arm));
  const spanX = (ring) => Math.max(...ring.map(([x]) => x)) - Math.min(...ring.map(([x]) => x));
  check(`${tag}: Lid top penuh merentas lengan`, near(spanX(by('lidTop').outlineNominal), p.length), `${spanX(by('lidTop').outlineNominal)}`);
  check(`${tag}: lubang lengan = cakera + 2 gap`, near(spanX(by('lidRight').holesNominal[0]), h.pivotD + 2 * h.gap));
  check(`${tag}: cakera seperti diminta`, near(spanX(by('discRight').outlineNominal), h.pivotD));
  check(`${tag}: panjang kunci = 2 papan + gap`, near(spanX(by('keyRight').outlineNominal), 2 * t + h.gap));
  check(`${tag}: tinggi dinding + penutup = Height`, near(box.derived.wallH + h.lidH, p.height));
  if (params.measure === 'inside') {
    const dm = box.derived.dims;
    check(`${tag}: ruang dalam seperti diminta`, dm.met, JSON.stringify(dm.inner));
    check(`${tag}: ruang dalam merentas dinding`, near(h.bodyL - 2 * t, params.length, 0.002));
  }

  // ---- pasang dalam 3D (tertutup)
  const fine = Math.min(0.5, t / 6);
  const grid = bodyGrid(p, [fine, fine * 1.5, fine * 1.5]);
  box.panels.forEach((q, i) => {
    const clash = fill(grid, panelSolid(q), i);
    const worst = [...clash.entries()].sort((a, b) => b[1] - a[1])[0];
    check(`${tag}: ${q.id} tidak bertindih`, clash.size === 0, worst && `${worst[1]} voksel dalam ${box.panels[worst[0]].id}`);
  });

  // ---- tumpuk pivot: sampel sebaris merentas kotak di garis pivot
  const owner = (x, y, z) => {
    const [i, j, k] = grid.cell(x, y, z);
    const id = grid.own[grid.idx(i, j, k)];
    return id >= 0 ? box.panels[id].id : null;
  };
  const yP = h.y, zP = h.z;
  check(`${tag}: pivot pada jarak d dari belakang dan atas dinding`,
    near(p.width - yP, h.inset) && near(box.derived.wallH - zP, h.inset));
  const g = h.gap;
  // Kunci: dari muka luar cakera hingga muka dalam dinding, kedua-dua hujung rata.
  for (const [side, x0, dir] of [['Left', 0, 1], ['Right', p.length, -1]]) {
    const at = (d) => owner(x0 + dir * d, yP, zP);
    check(`${tag} ${side}: kunci dalam cakera`, at(t / 2) === `key${side}`, `${at(t / 2)}`);
    check(`${tag} ${side}: kunci merentas celah`, g < 2 * fine || at(t + g / 2) === `key${side}`, `${at(t + g / 2)}`);
    check(`${tag} ${side}: kunci dalam dinding`, at(t + g + t / 2) === `key${side}`, `${at(t + g + t / 2)}`);
    check(`${tag} ${side}: kunci tidak masuk ke dalam kotak`, at(2 * t + g + 2 * fine) === null, `${at(2 * t + g + 2 * fine)}`);
    // Cakera di sebelah kunci, satu papan tebal; dinding di sebelahnya.
    const off = (h.pivotD / 2 + t / 2) / 2;
    const beside = (d) => owner(x0 + dir * d, yP + off, zP);
    check(`${tag} ${side}: cakera dalam satah lengan`, beside(t / 2) === `disc${side}`, `${beside(t / 2)}`);
    check(`${tag} ${side}: dinding di belakang celah`, beside(t + g + t / 2) === side.toLowerCase(), `${beside(t + g + t / 2)}`);
    // Lengan keliling cakera, dalam satah yang sama.
    check(`${tag} ${side}: lengan keliling cakera`,
      owner(x0 + dir * t / 2, yP + h.pivotD / 2 + h.gap + (h.inset - h.pivotD / 2 - h.gap) / 2, zP) === `lid${side}`);
  }

  // ---- telinga: tidak melepasi belakang kotak pada mana-mana sudut
  const arm3 = by('lidRight');
  const dist = (u, v) => {
    const y0 = u + arm3.originShift[0];
    const z0 = v + arm3.originShift[1] + arm3.frame.origin[2];
    return [y0 - yP, z0 - zP];
  };
  const earReach = Math.max(...arm3.outlineNominal.filter(([u, v]) => dist(u, v)[1] < 0).map(([u, v]) => Math.hypot(...dist(u, v))));
  check(`${tag}: telinga dalam jejari d`, earReach <= h.inset + 1e-6 && earReach > h.inset - 0.01, `${earReach} / ${h.inset}`);

  // ---- laluan pemasangan: penutup diturunkan dari atas
  const body = box.panels.map((q, i) => ({ q, i })).filter(({ q }) => !q.swing && !pivotIds.includes(q.id));
  const lidParts = box.panels.filter((q) => q.swing);
  const rise = p.height + 2;
  const gridA = gridOver([-2, -2, -2], [p.length + 2, p.width + 2, p.height + rise + 2], [fine, fine * 2, 1]);
  for (const { q, i } of body) fill(gridA, panelSolid(q), i);
  const bodySet = new Set(body.map((b) => b.i));
  for (let dz = 0; dz <= rise; dz += 2) {
    for (const q of lidParts) {
      const clash = fill(gridA, movedSolid(q, [0, 0, dz]), 99, { write: false, against: bodySet });
      check(`${tag}: ${q.id} turun dari ${dz} mm tanpa melanggar`, clash.size === 0, `${clash.size}`);
    }
  }

  // ---- kunci masuk lurus dari luar: lubang-lubang sebaris dan tiada papan melintang
  for (const [side, dir] of [['Left', -1], ['Right', 1]]) {
    const key = by(`key${side}`);
    const others = new Set(box.panels.map((q, i) => (q.id === `key${side}` || q.id === `disc${side}` ? -1 : i)).filter((i) => i >= 0));
    const gridK = bodyGrid(p, [fine, fine, fine], 5);
    box.panels.forEach((q, i) => { if (others.has(i)) fill(gridK, panelSolid(q), i); });
    for (let s = 0; s <= 3 * t; s += 0.5) {
      const clash = fill(gridK, movedSolid(key, [dir * s, 0, 0]), 99, { write: false, against: others });
      check(`${tag}: kunci ${side} lurus ${s} mm di luar`, clash.size === 0, `${clash.size}`);
    }
  }

  if (!sweep) return;

  // ---- pusingan penutup: 0 hingga had, tidak menyentuh badan atau pivot
  const fixed = box.panels.map((q, i) => ({ q, i })).filter(({ q }) => !q.swing);
  const fixedSet = new Set(fixed.map((f) => f.i));
  const reach = Math.hypot(h.inset, h.inset + h.lidH) + 1;
  const gridS = gridOver([-2, -2, -reach], [p.length + 2, p.width + reach, p.height + p.width + 4], [fine, fine, fine]);
  for (const { q, i } of fixed) fill(gridS, panelSolid(q), i);
  const stop = h.stop;
  check(`${tag}: had bukaan melebihi tegak`, stop > 90 && stop < 135, `${stop}`);
  const swingAngle = by('lidTop').swing.angle;
  check(`${tag}: 3D berhenti sebelum had`, swingAngle <= stop && swingAngle > stop - 2);
  for (let a = 2; a <= stop - 1; a += 3) {
    for (const q of lidParts) {
      const clash = fill(gridS, swungSolid(q, a), 99, { write: false, against: fixedSet });
      const worst = [...clash.entries()].sort((x, y) => y[1] - x[1])[0];
      check(`${tag}: ${q.id} pada ${a}° bebas`, clash.size === 0, worst && `${worst[1]} voksel dalam ${box.panels[worst[0]].id}`);
    }
  }
  // Lebih sedikit dari had, belakang penutup memang tersekat pada belakang kotak:
  // itulah yang menahan penutup.
  const past = fill(gridS, swungSolid(by('lidBack'), stop + 8, 0.05), 99, { write: false, against: fixedSet });
  check(`${tag}: belakang penutup tersekat selepas had`, past.has(box.panels.findIndex((q) => q.id === 'back')),
    [...past.keys()].map((i) => box.panels[i].id).join(','));

  // ---- meja: bucu terendah penutup pada had bukaan
  let low = Infinity;
  for (const q of lidParts) {
    for (const [u, v] of q.outlineNominal) {
      const { origin, U, V } = q.frame;
      const uu = u + q.originShift[0], vv = v + q.originShift[1];
      for (const n of [0, -t]) {
        const y0 = origin[1] + U[1] * uu + V[1] * vv + q.frame.N[1] * n;
        const z0 = origin[2] + U[2] * uu + V[2] * vv + q.frame.N[2] * n;
        const a = q.swing.sign * stop * DEG;
        const zz = zP + (y0 - yP) * Math.sin(a) + (z0 - zP) * Math.cos(a);
        low = Math.min(low, zz);
      }
    }
  }
  check(`${tag}: penutup tidak menembusi meja`, low >= -1e-6, `${low}`);
}

testBox({ length: 100, width: 76, height: 50 });                                // asal
testBox({ length: 106, width: 150, height: 50, lidHeight: 12.5 });              // seperti rujukan
testBox({ length: 150, width: 100, height: 80, pivotD: 14, lidHeight: 20 });
testBox({ length: 120, width: 90, height: 60, thickness: 2.6 }, { sweep: false }); // Falcata 2.6
testBox({ length: 200, width: 120, height: 90, thickness: 5.2, kerf: 0.25, fit: 0.1 }); // Falcata 5.2
testBox({ length: 120, width: 80, height: 60, divider: 4 }, { sweep: false });
testBox({ length: 130, width: 90, height: 60, lidGap: 0.8 }, { sweep: false });
testBox({ length: 100, width: 80, height: 60, measure: 'inside' }, { sweep: false });
testBox({ length: 60, width: 40, height: 40, thickness: 2 });                    // kecil
testBox({ length: 30, width: 30, height: 30 }, { sweep: false });                // diapit ke saiz paling kecil
testBox({ length: 100, width: 76, height: 10 });                                 // paling rendah: dinding paling pendek
testBox({ length: 100, width: 76, height: 45, lidHeight: 500 });                 // penutup paling dalam: bucunya paling dekat meja
testBox({ length: 120, width: 80, height: 60, lidNotch: false }, { sweep: false });

// ---- pivot dan penutup yang diminta terlalu besar diapit, kotak tidak berubah saiz
{
  const b = buildBox({ style: 'hinge', length: 100, width: 60, height: 50, pivotD: 200, lidHeight: 500 });
  check('pivot besar: kotak kekal saiz', b.params.length === 100 && b.params.width === 60 && b.params.height === 50);
  check('pivot besar: diapit', b.derived.hinge.pivotD < 30 && b.derived.hinge.pivotD === b.derived.hinge.pivotMax, `${b.derived.hinge.pivotD}`);
  check('penutup besar: diapit', b.derived.hinge.lidH === b.derived.hinge.lidMax && b.derived.wallH > 0, `${b.derived.hinge.lidH}`);
  const s = buildBox({ style: 'hinge', length: 100, width: 76, height: 50, lidHeight: 1, pivotD: 1 });
  check('penutup kecil: diangkat ke minimum', s.derived.hinge.lidH === s.derived.hinge.lidMin);
  check('pivot kecil: diangkat ke minimum', s.derived.hinge.pivotD === s.derived.hinge.pivotMin);
}

// ---- gaya lain tidak berubah: Lidded masih ada pin dan tiada panel hinge
{
  const b = buildBox({ style: 'lidded', length: 100, width: 76, height: 50 });
  check('Lidded: tiada maklumat hinge', b.derived.hinge === null);
  check('Lidded: Length seperti ditaip', b.params.length === 100);
  check('Lidded: tiada panel pivot', !b.panels.some((q) => /^(disc|key)/.test(q.id)));
}

// ---- skru dimatikan: kepala skru akan berada di bawah lengan
{
  const b = buildBox({ style: 'hinge', length: 150, width: 100, height: 80, joint: 'screw' });
  check('skru: tiada lubang skru', b.derived.screwZs.length === 0);
}

// ---- input teruk
for (const bad of [{ length: 0, height: 0 }, { lidGap: 'x' }, { pivotD: -5, lidHeight: 'a' },
  { thickness: 12, length: 60 }, { measure: 'inside', length: 50, height: 20 }, { floorOffset: 40 }]) {
  let ok = true;
  try {
    const b = buildBox({ style: 'hinge', ...bad });
    ok = b.panels.length >= 14 && Number.isFinite(b.derived.hinge.lidH);
  } catch (e) { ok = false; }
  check(`input teruk ${JSON.stringify(bad)}: tak campak`, ok);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
