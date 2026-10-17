// Ujian Box Maker gaya Bulat: dinding living hinge yang dibengkokkan jadi
// silinder, berdiri dalam alur di atas tapak, dengan penutup palam. Tiada
// kebergantungan.
//
//     node scripts/test-boxmaker-round.mjs
//
// Mengimport terus daripada docs/boxmaker/src - kod yang sifulaser.com hidangkan.
//
//   * cincin sah        - setiap outline dan lubang tertutup, tiada sisi yang
//                         bersilang, outline lawan arah jam.
//   * DIPASANG DALAM 3D - setiap panel (bentuk NOMINAL) diisi ke grid voksel
//                         0.5 mm; dinding dibengkokkan pada lengkungnya. Dua
//                         panel di voksel yang sama ialah kayu bertindih.
//   * dinding dalam alur - setiap jalur duduk antara cakera lantai dan cincin,
//                         dan dinding bertemu dirinya sendiri di sambungan.
//   * dovetail          - ekor di satu hujung = soket di hujung yang lain
//                         (tolak `fit`), jumlah panjang = lilitan garis tengah.
//   * penutup           - palam muat dalam dinding dengan kelonggaran yang
//                         diminta; penutup terbuka tiada palam.
//   * muat helaian      - setiap jalur dinding <= 560 mm (helaian 600 mm).

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'docs', 'boxmaker', 'src', 'geom');
const { buildBox } = await import(pathToFileURL(path.join(SRC, 'box.js')).href);
const {
  area, selfIntersects, gridOver, panelSolid, fill, fillBend,
} = await import(pathToFileURL(path.join(here, 'lib', 'boxmaker-voxel.mjs')).href);

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 80) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** Jejari sebenar bulatan poligon: min dan max jarak bucu dari pusat. */
function radii(ring, c) {
  const d = ring.map(([x, y]) => Math.hypot(x - c[0], y - c[1]));
  return [Math.min(...d), Math.max(...d)];
}

function testBox(params) {
  const tag = JSON.stringify(params).slice(0, 110);
  let box;
  try { box = buildBox({ style: 'round', kerf: 0.2, thickness: 3, ...params }); } catch (e) {
    check(`${tag}: tak campak`, false, e.stack);
    return;
  }
  const r = box.derived.round;
  check(`${tag}: maklumat bulat`, !!r);
  if (!r) return;
  const p = box.params;
  const t = p.thickness;
  const ids = box.panels.map((q) => q.id);
  const walls = box.panels.filter((q) => q.bend);
  check(`${tag}: panel lengkap`, ['plinth', 'floorDisc', 'ring'].every((id) => ids.includes(id))
    && walls.length === r.wall.segments && (r.lid
      ? ids.includes('lidTop') && ids.includes('lidPlug')
      : !ids.includes('lidTop') && !ids.includes('lidPlug')), ids.join(','));
  check(`${tag}: lebar = diameter`, p.width === p.length);

  for (const q of box.panels) {
    for (const [k, ring] of [['outline', q.outlineNominal], ...q.holesNominal.map((hh, i) => [`hole${i}`, hh])]) {
      check(`${tag} [${q.id}] ${k}: cincin`, ring.length >= 3 && ring.every((v) => Number.isFinite(v[0]) && Number.isFinite(v[1])));
      if (ring.length < 400 || k === 'outline') {
        const x = selfIntersects(ring);
        check(`${tag} [${q.id}] ${k}: tiada sisi bersilang`, !x, x && JSON.stringify([ring[x[0]], ring[x[1]]]));
      }
    }
    check(`${tag} [${q.id}]: outline lawan arah jam`, area(q.outlineNominal) > 0);
  }

  // ---- ukuran bulatan (dalam koordinat kotak: tambah originShift balik)
  const R = p.length / 2;
  const world = (q, ring) => ring.map(([x, y]) => [x + q.originShift[0], y + q.originShift[1]]);
  const by = (id) => box.panels.find((q) => q.id === id);
  const [fl0, fl1] = radii(world(by('floorDisc'), by('floorDisc').outlineNominal), [R, R]);
  check(`${tag}: cakera lantai = jejari dalam dinding`, near(fl1, R - t, 1e-6) && fl0 > R - t - 0.01, `${fl0}..${fl1}`);
  const [rh0] = radii(world(by('ring'), by('ring').holesNominal[0]), [R, R]);
  check(`${tag}: lubang cincin di luar dinding`, rh0 > R + 0.05 && rh0 < R + 0.2, `${rh0}`);
  const [, pl1] = radii(world(by('plinth'), by('plinth').outlineNominal), [R, R]);
  check(`${tag}: tapak = R + tepi`, near(pl1, R + r.mb, 1e-6));
  if (r.lid) {
    const [, pg1] = radii(world(by('lidPlug'), by('lidPlug').outlineNominal), [R, R]);
    check(`${tag}: palam penutup muat dengan kelonggaran`, near(pg1, R - t - r.slack, 1e-6), `${pg1}`);
    check(`${tag}: penutup terangkat bersama`, by('lidTop').lift > 0 && by('lidTop').lift === by('lidPlug').lift);
  }

  // ---- dinding: lilitan, jalur, dovetail
  const Rm = R - t / 2;
  check(`${tag}: jumlah jalur = lilitan garis tengah`, near(r.wall.segL * r.wall.segments, 2 * Math.PI * Rm, 1e-6));
  check(`${tag}: setiap jalur muat helaian 600 mm`, walls.every((w) => w.size.w <= 560 + r.dd + 0.01),
    walls.map((w) => w.size.w.toFixed(1)).join(','));
  check(`${tag}: tinggi dinding`, near(r.wall.height, p.height - t - (r.lid ? t : 0), 1e-6));
  const w0 = walls[0];
  const ol = w0.outlineNominal.map(([x, y]) => [x + w0.originShift[0], y + w0.originShift[1]]);
  const tails = ol.filter(([x]) => near(x, -r.dd, 1e-6)).length;
  const sockets = ol.filter(([x]) => near(x, r.wall.segL - r.dd, 1e-6)).length;
  check(`${tag}: ekor dovetail = soket`, tails === 2 * r.nd && sockets === 2 * r.nd, `${tails} / ${sockets}`);
  check(`${tag}: dovetail lebar di hujung (mengunci)`, r.w1 > r.w0 + 0.5);

  // ---- pasang dalam 3D (tertutup)
  const grid = gridOver([-r.mb - 3, -r.mb - 3, -1], [p.length + r.mb + 3, p.length + r.mb + 3, p.height + 2], [0.5, 0.5, 0.5]);
  const flat = box.panels.filter((q) => !q.bend);
  flat.forEach((q, i) => {
    const clash = fill(grid, panelSolid(q), i);
    const worst = [...clash.entries()].sort((a, b) => b[1] - a[1])[0];
    check(`${tag}: ${q.id} tidak bertindih`, clash.size === 0, worst && `${worst[1]} voksel dalam ${flat[worst[0]].id}`);
  });
  walls.forEach((w, k) => {
    const id = flat.length + k;
    const clash = fillBend(grid, w, id, 0.25);
    const worst = [...clash.entries()].sort((a, b) => b[1] - a[1])[0];
    const who = worst ? (worst[0] < flat.length ? flat[worst[0]].id : walls[worst[0] - flat.length].id) : '';
    check(`${tag}: ${w.id} tidak bertindih`, clash.size === 0, worst && `${worst[1]} voksel dalam ${who}`);
  });

  // Dinding benar-benar dalam alur: di z separuh alur, pada jejari garis
  // tengah dinding, keliling penuh - setiap sampel dituntut dinding.
  const zg = t + t / 2;
  let missing = 0;
  // Setiap sampel melihat 2 mm sepanjang lilitan: celah kerf (0.5 mm) bukan
  // lubang dalam dinding.
  for (let a = 0; a < 360; a += 3) {
    let hit = false;
    for (let off = -2; off <= 2 && !hit; off += 0.25) {
      const th = (a * Math.PI) / 180 + off / Rm;
      const [i, j, k] = grid.cell(R + Rm * Math.cos(th), R + Rm * Math.sin(th), zg);
      hit = grid.own[grid.idx(i, j, k)] >= flat.length;
    }
    if (!hit) missing++;
  }
  check(`${tag}: dinding mengelilingi penuh dalam alur`, missing === 0, `${missing} daripada 120 sampel kosong`);
}

testBox({ length: 100, width: 76, height: 50 });
testBox({ length: 120, width: 120, height: 90 });
testBox({ length: 120, height: 90, roundLid: false });
testBox({ length: 200, height: 120 });                      // dua jalur
testBox({ length: 150, height: 100, thickness: 2.6 });      // Falcata 2.6
testBox({ length: 160, height: 80, thickness: 5.2, kerf: 0.25, fit: 0.2, lidSlack: 1 });
testBox({ length: 60, height: 40, plinthMargin: 20 });
testBox({ length: 400, height: 150 });                      // tiga jalur

for (const bad of [{ length: 0, height: 0 }, { roundLid: 'x' }, { plinthMargin: -5, lidSlack: 'a' },
  { thickness: 12, length: 60 }, { measure: 'inside', length: 50, height: 20 }]) {
  let ok = true;
  try {
    const b = buildBox({ style: 'round', ...bad });
    ok = b.panels.length >= 4 && Number.isFinite(b.derived.round.wall.length);
  } catch (e) { ok = false; }
  check(`input teruk ${JSON.stringify(bad)}: tak campak`, ok);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
