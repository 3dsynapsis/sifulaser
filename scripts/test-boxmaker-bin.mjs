// Ujian Box Maker gaya Bertingkat: bin dengan bibir depan condong yang boleh
// disusun, bonggol di atas masuk ke takuk di bawah bin di atasnya. Tiada kebergantungan.
//
//     node scripts/test-boxmaker-bin.mjs
//
// Mengimport terus daripada docs/boxmaker/src - kod yang sifulaser.com hidangkan.
//
//   * cincin sah         - setiap outline dan lubang tertutup, tiada sisi yang
//                          bersilang, outline lawan arah jam.
//   * ukuran             - saiz, tinggi bibir, bonggol, jarak susunan.
//   * DIPASANG DALAM 3D  - setiap panel, termasuk setiap set dalam susunan, diisi ke
//                          grid voksel. Dua panel di voksel yang sama ialah kayu
//                          bertindih: bonggol mesti muat dalam takuk bin di atasnya.
//   * setiap lubang diisi - setiap mortis ada tanon di dalamnya.
//   * susunan            - bin atas berdiri pada dinding sisi, terangkat lurus keluar,
//                          dan tersekat bila ditolak ke depan, belakang atau tepi.
//   * laluan pemasangan  - dinding sisi keluar terakhir tanpa terperangkap.
//   * salinan            - setiap set sama bentuk, tinggi setiap satu sejarak tingkat,
//                          dan tiada tab hiasan sendiri.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'docs', 'boxmaker', 'src', 'geom');
const { buildBox, panelToWorld, PANEL_ORDER, PANEL_LABELS } = await import(pathToFileURL(path.join(SRC, 'box.js')).href);
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

function movedSolid(panel, [dx, dy, dz], erode = ERODE) {
  const base = panelSolid(panel, null, erode);
  return {
    inside: (p) => base.inside([p[0] - dx, p[1] - dy, p[2] - dz]),
    lo: [base.lo[0] + dx, base.lo[1] + dy, base.lo[2] + dz],
    hi: [base.hi[0] + dx, base.hi[1] + dy, base.hi[2] + dz],
  };
}

const BODY = ['left', 'right', 'back', 'bottom', 'front'];

function testBox(params, { stack = false, paths = false } = {}) {
  const tag = JSON.stringify(params).slice(0, 100);
  let box;
  try { box = buildBox({ style: 'bin', kerf: 0.2, thickness: 3, ...params }); } catch (e) {
    check(`${tag}: tak campak`, false, e.stack);
    return;
  }
  const b = box.derived.bin;
  check(`${tag}: maklumat bin`, !!b);
  if (!b) return;
  const p = box.params;
  const t = p.thickness;
  const by = (id) => box.panels.find((q) => q.id === id);
  const idx = (id) => box.panels.findIndex((q) => q.id === id);
  const ids = box.panels.map((q) => q.id);
  const firstSet = box.panels.filter((q) => !q.copyOf);

  check(`${tag}: panel lengkap`, BODY.every((id) => ids.includes(id)), ids.join(','));
  for (const q of firstSet) {
    check(`${tag}: ${q.id} dalam PANEL_ORDER dan berlabel`, PANEL_ORDER.includes(q.id) && !!PANEL_LABELS[q.id]);
  }
  check(`${tag}: bilangan set`, box.panels.length === firstSet.length * b.count, `${box.panels.length}`);
  for (const q of box.panels.filter((x) => x.copyOf)) {
    const o = by(q.copyOf);
    const n = Number(q.id.split('#')[1]) - 1;
    check(`${tag}: ${q.id} bentuk sama`, q.outline === o.outline && q.holes === o.holes);
    check(`${tag}: ${q.id} setingkat di atas`, near(q.frame.origin[2], o.frame.origin[2] + n * b.pitch));
    check(`${tag}: ${q.id} tiada tab sendiri`, q.noDecor && q.noPick);
  }

  for (const q of firstSet) {
    for (const [k, ring] of [['outline', q.outlineNominal], ...q.holesNominal.map((hh, i) => [`hole${i}`, hh])]) {
      check(`${tag} [${q.id}] ${k}: cincin`, ring.length >= 3 && ring.every((v) => Number.isFinite(v[0]) && Number.isFinite(v[1])));
      const x = selfIntersects(ring);
      check(`${tag} [${q.id}] ${k}: tiada sisi bersilang`, !x, x && JSON.stringify([ring[x[0]], ring[x[1]]]));
      if (k !== 'outline') check(`${tag} [${q.id}] ${k}: lawan arah jam`, area(ring) > 0);
    }
    check(`${tag} [${q.id}]: outline lawan arah jam`, area(q.outlineNominal) > 0);
  }

  // ---- ukuran
  const spanX = (ring) => Math.max(...ring.map(([x]) => x)) - Math.min(...ring.map(([x]) => x));
  const spanY = (ring) => Math.max(...ring.map(([, y]) => y)) - Math.min(...ring.map(([, y]) => y));
  const maxY = (ring) => Math.max(...ring.map(([, y]) => y));
  check(`${tag}: panjang dinding sisi = Width`, near(spanX(by('left').outlineNominal), p.width));
  check(`${tag}: tinggi dinding sisi = Height`, near(spanY(by('right').outlineNominal), p.height), `${spanY(by('right').outlineNominal)}`);
  check(`${tag}: tinggi dinding + bonggol`, near(b.pitch + b.hump, p.height));
  check(`${tag}: bonggol belakang sama tinggi`, near(maxY(by('back').outlineNominal) + by('back').originShift[1], p.height), `${maxY(by('back').outlineNominal)}`);
  check(`${tag}: lantai, belakang, depan merentas Length`,
    ['bottom', 'back', 'front'].every((id) => near(spanX(by(id).outlineNominal), p.length)));
  check(`${tag}: tinggi susunan`, near(b.stackH, b.pitch * (b.count - 1) + p.height));
  if (params.measure === 'inside') {
    check(`${tag}: ruang dalam seperti diminta`, box.derived.dims.met, JSON.stringify(box.derived.dims.inner));
  }

  // ---- pasang dalam 3D, seluruh susunan
  const fine = Math.min(0.5, t / 6);
  const r = [fine, fine, fine];
  const grid = gridOver([-2, -2, -2], [p.length + 2, p.width + 2, b.stackH + 2], r);
  box.panels.forEach((q, i) => {
    const clash = fill(grid, panelSolid(q), i);
    const worst = [...clash.entries()].sort((x, y) => y[1] - x[1])[0];
    check(`${tag}: ${q.id} tidak bertindih`, clash.size === 0, worst && `${worst[1]} voksel dalam ${box.panels[worst[0]].id}`);
  });
  const owner = (x, y, z) => {
    const [i, j, k] = grid.cell(x, y, z);
    if (i < 0 || j < 0 || k < 0 || i >= grid.nx || j >= grid.ny || k >= grid.nz) return null;
    const id = grid.own[grid.idx(i, j, k)];
    return id >= 0 ? box.panels[id].id : null;
  };

  // ---- setiap lubang berisi
  for (const q of firstSet) {
    for (const hole of q.holesNominal) {
      const us = hole.map(([u]) => u); const vs = hole.map(([, v]) => v);
      const c = [(Math.min(...us) + Math.max(...us)) / 2, (Math.min(...vs) + Math.max(...vs)) / 2];
      let inHole = 0; let total = 0;
      for (const fu of [-0.3, 0, 0.3]) {
        for (const fv of [-0.2, 0.2]) {
          const w = panelToWorld(q,
            c[0] + (Math.max(...us) - Math.min(...us)) * fu,
            c[1] + (Math.max(...vs) - Math.min(...vs)) * fv, -t / 2);
          total++;
          if (owner(w[0], w[1], w[2])) inHole++;
        }
      }
      check(`${tag} [${q.id}]: lubang diisi`, inHole >= total / 2, `${inHole}/${total}`);
    }
  }

  // ---- bibir depan: papan depan berdiri dari lantai hingga ke hujung bibir
  check(`${tag}: lantai bermula di belakang kaki bibir`, near(box.derived.dims.inner.w, b.floorW));
  const tipIn = panelToWorld(by('front'), by('front').size.w / 2, by('front').size.h - 1, -t / 2);
  check(`${tag}: papan depan sampai ke bibir`, Math.abs(tipIn[2] - b.lipH) < 2.5 * t, `${tipIn[2]} / ${b.lipH}`);

  if (stack && b.count >= 2) {
    // ---- bin atas: berdiri, terangkat lurus, tersekat ke tepi
    const lower = box.panels.map((q, i) => ({ q, i })).filter(({ q }) => !q.copyOf);
    const upper = box.panels.filter((q) => q.id.endsWith('#2'));
    const gridL = gridOver([-3, -3, -2], [p.length + 3, p.width + 3, b.pitch * 2 + p.height + 4], [fine, fine, fine]);
    for (const { q, i } of lower) fill(gridL, panelSolid(q), i);
    const setL = new Set(lower.map((x) => x.i));
    for (const dz of [0, 1, 2, 3, 2 * t + 1, 3 * t]) {
      for (const q of upper) {
        const clash = fill(gridL, movedSolid(q, [0, 0, dz]), 99, { write: false, against: setL });
        check(`${tag}: ${q.id} naik ${dz} mm bebas`, clash.size === 0, `${clash.size}`);
      }
    }
    const blocked = (v) => {
      let n = 0;
      for (const q of upper) {
        for (const c of fill(gridL, movedSolid(q, v, 0.05), 99, { write: false, against: setL }).values()) n += c;
      }
      return n;
    };
    const play = b.gap + 1.5;
    check(`${tag}: susunan tersekat ke depan`, blocked([0, -play, 0]) > 0);
    check(`${tag}: susunan tersekat ke belakang`, blocked([0, play, 0]) > 0);
    check(`${tag}: susunan tersekat ke kiri`, blocked([-play, 0, 0]) > 0);
    check(`${tag}: susunan tersekat ke kanan`, blocked([play, 0, 0]) > 0);
    check(`${tag}: susunan tidak jatuh`, blocked([0, 0, -1]) > 0);
    // Bonggol masih ada ruang: dalam stackGap ia tidak menyentuh.
    // Lantai bin atas sama aras dengan bonggol, jadi ia yang paling mudah tersangkut.
    if (b.gap >= 0.3) {
      const small = b.gap - 0.15;
      for (const v of [[small, 0, 0], [-small, 0, 0], [0, small, 0], [0, -small, 0]]) {
        let n = 0;
        for (const q of upper) {
          for (const c of fill(gridL, movedSolid(q, [v[0], v[1], 0.5]), 99, { write: false, against: setL }).values()) n += c;
        }
        check(`${tag}: ada kelonggaran dalam takuk ${JSON.stringify(v)}`, n === 0, `${n}`);
      }
    }
  }

  if (paths) {
    // ---- dinding sisi keluar lurus dari bin yang siap: ia dipasang terakhir
    const set1 = firstSet.map((q) => idx(q.id));
    for (const [id, dx] of [['left', -(2 * t + 2)], ['right', 2 * t + 2]]) {
      const others = set1.filter((i) => box.panels[i].id !== id);
      const gridP = gridOver([-3 * t - 4, -2, -2], [p.length + 3 * t + 4, p.width + 2, p.height + 2], [0.5, 0.5, 0.5]);
      for (const i of others) fill(gridP, panelSolid(box.panels[i]), i);
      const oSet = new Set(others);
      let worst = 0;
      for (let k = 0; k <= 8; k++) {
        const c = fill(gridP, movedSolid(by(id), [dx * k / 8, 0, 0]), 99, { write: false, against: oSet });
        for (const n of c.values()) worst += n;
      }
      check(`${tag}: ${id} dipasang terakhir, lurus`, worst === 0, `${worst}`);
    }
  }
}

testBox({ length: 100, width: 76, height: 50 }, { stack: true, paths: true });   // asal
testBox({ length: 111, width: 105, height: 86, binCount: 3 }, { stack: true });  // seperti rujukan
testBox({ length: 120, width: 100, height: 70, binCount: 1 });
testBox({ length: 120, width: 100, height: 70, thickness: 2.6, binCount: 2 });   // Falcata 2.6
testBox({ length: 200, width: 150, height: 120, thickness: 5.2, kerf: 0.25, fit: 0.1 }, { stack: true, paths: true });
testBox({ length: 150, width: 120, height: 90, divider: 2 });
testBox({ length: 150, width: 120, height: 90, divider: 4, dividerHeight: 100 }, { paths: true });
testBox({ length: 150, width: 120, height: 90, binLip: 20 });
testBox({ length: 150, width: 120, height: 90, binLip: 90 });
testBox({ length: 150, width: 120, height: 90, stackGap: 0.1 });
testBox({ length: 150, width: 120, height: 90, stackGap: 1 }, { stack: true });
testBox({ length: 100, width: 80, height: 60, measure: 'inside' });
testBox({ length: 30, width: 30, height: 20, binCount: 2 });                     // diapit ke saiz paling kecil
testBox({ length: 150, width: 120, height: 90, floorOffset: 0 });
testBox({ length: 150, width: 120, height: 90, floorOffset: 12 });

// ---- gaya lain tidak berubah
{
  const b = buildBox({ style: 'lidded', length: 100, width: 76, height: 50, binCount: 4 });
  check('Lidded: tiada maklumat bin', b.derived.bin === null);
  check('Lidded: tiada salinan', !b.panels.some((q) => q.copyOf));
}

// ---- skru dimatikan
check('skru: tiada lubang skru', buildBox({ style: 'bin', length: 150, width: 100, height: 80, joint: 'screw' }).derived.screwZs.length === 0);

// ---- bilangan bin diapit
check('binCount: 0 jadi 1', buildBox({ style: 'bin', binCount: 0 }).derived.bin.count === 1);
check('binCount: 99 jadi 6', buildBox({ style: 'bin', binCount: 99 }).derived.bin.count === 6);
check('binCount: bukan nombor', buildBox({ style: 'bin', binCount: 'x' }).derived.bin.count === 2);

// ---- input teruk
for (const bad of [{ length: 0, height: 0 }, { stackGap: 'x' }, { stackGap: 99 }, { binLip: -5 }, { binLip: 500 },
  { thickness: 12, length: 60 }, { measure: 'inside', length: 50, height: 20 }, { floorOffset: 40 }]) {
  let ok = true;
  try {
    const b = buildBox({ style: 'bin', ...bad });
    ok = b.panels.length >= 5 && Number.isFinite(b.derived.bin.lipH) && b.derived.bin.lipH < b.derived.bin.pitch;
  } catch (e) { ok = false; }
  check(`input teruk ${JSON.stringify(bad)}: tak campak`, ok);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
