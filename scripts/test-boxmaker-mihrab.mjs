// Ujian Box Maker gaya Mihrab: kotak gerbang lunas, pintu berkembar, bumbung
// living hinge. Tiada kebergantungan.
//
//     node scripts/test-boxmaker-mihrab.mjs
//
// Mengimport terus daripada docs/boxmaker/src - kod yang sifulaser.com hidangkan.
//
// Kotak ini dipasang dalam komputer, bukan di atas kertas:
//   * cincin sah        - setiap outline dan lubang tertutup, tiada sisi yang
//                         bersilang, outline lawan arah jam.
//   * DIPASANG DALAM 3D - setiap panel (bentuk NOMINAL, tanpa kerf) diisi ke
//                         dalam grid voksel 0.5 mm pada kedudukannya. Dua panel
//                         yang menuntut voksel yang sama ialah dua kepingan kayu
//                         di tempat yang sama: tanon tanpa lubang, pin yang
//                         menembusi papan, pintu yang melanggar dinding.
//   * setiap lubang terisi - tengah setiap mortis dan lubang pin dituntut oleh
//                         panel lain. Mortis kosong bermakna sendi yang tersasar.
//   * PINTU BERPUSING   - setiap pintu diputar 0..100 darjah pada paksi pinnya,
//                         setiap 4 darjah, dan diuji terhadap semua panel tetap.
//   * bumbung           - panjang jalur = panjang garis tengah gerbang; jalur
//                         yang dibengkokkan duduk di atas gerbang dalam dan
//                         belakang tanpa menembusi mana-mana panel.
//   * input teruk       - kotak kecil, nisbah ekstrem, papan tebal: tak campak.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'docs', 'boxmaker', 'src', 'geom');
const { buildBox } = await import(pathToFileURL(path.join(SRC, 'box.js')).href);
const { keelPath, strip } = await import(pathToFileURL(path.join(SRC, 'arch.js')).href);
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

const RES = 0.5;
function makeGrid(box) {
  const m = box.derived.mihrab;
  return gridOver([-m.mb - 4, -m.mb - 4, -1],
    [box.params.length + m.mb + 4, box.params.width + m.mb + 4, box.params.height + 5], [RES, RES, RES]);
}

// ---- satu kotak --------------------------------------------------------------
function testBox(params, { swing = true, fine = false } = {}) {
  const tag = JSON.stringify(params).slice(0, 110);
  let box;
  try { box = buildBox({ style: 'mihrab', kerf: 0.2, thickness: 3, ...params }); } catch (e) {
    check(`${tag}: tak campak`, false, e.stack);
    return;
  }
  const m = box.derived.mihrab;
  check(`${tag}: maklumat mihrab`, !!m && !!m.keel);
  if (!m) return;
  const ids = box.panels.map((p) => p.id);
  check(`${tag}: panel lengkap`, ['plinth', 'back', 'left', 'right', 'ceiling', 'rib', 'doorLeft', 'doorRight', 'roof']
    .every((id) => ids.includes(id)), ids.join(','));

  for (const p of box.panels) {
    for (const [k, r] of [['outline', p.outlineNominal], ...p.holesNominal.map((h, i) => [`hole${i}`, h])]) {
      check(`${tag} [${p.id}] ${k}: cincin`, r.length >= 3 && r.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])));
      const x = selfIntersects(r);
      check(`${tag} [${p.id}] ${k}: tiada sisi bersilang`, !x, x && JSON.stringify([r[x[0]], r[x[1]]]));
    }
    check(`${tag} [${p.id}]: outline lawan arah jam`, area(p.outlineNominal) > 0);
  }

  // ---- pasang dalam 3D
  const grid = makeGrid(box);
  const fixed = box.panels.filter((p) => !p.hinge && !p.bend);
  const doors = box.panels.filter((p) => p.hinge);
  const roof = box.panels.find((p) => p.bend);
  const order = [...fixed, ...doors];
  order.forEach((p, i) => {
    const clash = fill(grid, panelSolid(p), i);
    const worst = [...clash.entries()].sort((a, b) => b[1] - a[1])[0];
    check(`${tag}: ${p.id} tidak bertindih dengan panel lain`, clash.size === 0,
      worst && `${worst[1]} voksel dalam ${order[worst[0]].id}`);
  });
  const roofId = order.length;
  const rc = fillBend(grid, roof, roofId);
  const rw = [...rc.entries()].sort((a, b) => b[1] - a[1])[0];
  check(`${tag}: bumbung tidak menembusi panel lain`, rc.size === 0,
    rw && `${rw[1]} voksel dalam ${order[rw[0]].id}`);

  // ---- setiap lubang terisi: tengah lubang (di tengah tebal papan) dituntut
  for (const p of fixed) {
    p.holesNominal.forEach((h, hi) => {
      const cx = h.reduce((s, q) => s + q[0], 0) / h.length;
      const cy = h.reduce((s, q) => s + q[1], 0) / h.length;
      const { origin, U, V, N } = p.frame;
      const u = cx + p.originShift[0], v = cy + p.originShift[1], n = -p.thickness / 2;
      const w = [0, 1, 2].map((k) => origin[k] + U[k] * u + V[k] * v + N[k] * n);
      const [i, j, k] = grid.cell(...w);
      const own = grid.own[grid.idx(i, j, k)];
      check(`${tag}: ${p.id} lubang ${hi} terisi`, own >= 0 && order[own]?.id !== p.id,
        own >= 0 ? `dituntut ${order[own]?.id ?? 'bumbung'}` : 'kosong');
    });
  }

  // ---- pintu berpusing
  if (swing) {
    const fixedIdx = new Set(fixed.map((_, i) => i));
    fixedIdx.add(roofId);
    for (const d of doors) {
      let bad = null;
      for (let deg = 4; deg <= 100; deg += 4) {
        const rot = d.hinge.sign * deg * Math.PI / 180;
        const clash = fill(grid, panelSolid(d, rot), -9, { write: false, against: fixedIdx });
        if (clash.size) {
          const w = [...clash.entries()][0];
          bad = `${deg}°: ${w[1]} voksel dalam ${w[0] === roofId ? 'roof' : order[w[0]].id}`;
          break;
        }
      }
      check(`${tag}: ${d.id} berpusing 0-100° tanpa melanggar`, !bad, bad);

      if (!fine) continue;
      // Halus di sekeliling engsel: kelegaan di situ hanya pecahan milimeter
      // (ekor pintu di belakang pin berayun ke dalam), terlalu kecil untuk
      // grid 0.5 mm. Grid 0.1 mm, panel dikecilkan 0.03 mm sahaja.
      const ax = d.hinge.u;
      const fx0 = ax < box.params.length / 2 ? ax - 5 : ax - 9;
      const fg = gridOver([fx0, -8, -0.5], [fx0 + 14, 10, box.params.height + 1], [0.1, 0.1, 1]);
      fixed.forEach((p, i) => fill(fg, panelSolid(p, null, 0.03), i));
      fillBend(fg, roof, roofId, 0.06, 0.03);
      let badF = null;
      for (let deg = 5; deg <= 100; deg += 5) {
        const rot = d.hinge.sign * deg * Math.PI / 180;
        const clash = fill(fg, panelSolid(d, rot, 0.03), -9, { write: false, against: fixedIdx });
        if (clash.size) {
          const w = [...clash.entries()][0];
          badF = `${deg}°: ${w[1]} voksel dalam ${w[0] === roofId ? 'roof' : order[w[0]].id}`;
          break;
        }
      }
      check(`${tag}: ${d.id} engsel halus 0-100° tanpa melanggar`, !badF, badF);
      // Dan tidak boleh berpusing ke dalam: siling menahannya.
      const inward = fill(grid, panelSolid(d, -d.hinge.sign * 6 * Math.PI / 180), -9,
        { write: false, against: fixedIdx });
      check(`${tag}: ${d.id} tertahan bila ditolak ke dalam`, inward.size > 0);
    }
  }

  // ---- bumbung: panjang = garis tengah gerbang
  const k = m.keel;
  const t = box.params.thickness;
  const mid = keelPath(k, t / 2, { step: 0.2 });
  let len = 0;
  for (let i = 1; i < mid.length; i++) len += Math.hypot(mid[i][0] - mid[i - 1][0], mid[i][1] - mid[i - 1][1]);
  check(`${tag}: panjang jalur bumbung = garis tengah`, Math.abs(len - strip(k, t).length) < 0.05,
    `${len.toFixed(3)} lawan ${strip(k, t).length.toFixed(3)}`);
  check(`${tag}: lebar jalur bumbung`, Math.abs(roof.size.h - (box.params.width - m.yF)) < 1e-6);

  // ---- ukuran
  check(`${tag}: tinggi puncak = H`, Math.abs(Math.max(...mid.map((q) => q[1])) + t / 2 - box.params.height) < 0.01);
  check(`${tag}: bahu tidak lebih tinggi dari puncak`, k.slope >= 0, `${k.slope}`);
  const doorL = box.panels.find((p) => p.id === 'doorLeft');
  check(`${tag}: pintu separuh lebar`, Math.abs(doorL.size.w - (box.params.length / 2 - Math.max(0.1, box.params.lidGap ?? 0.3))) < 0.01,
    `${doorL.size.w}`);
  check(`${tag}: ruang dalam`, box.derived.dims.inner.h > 0 && box.derived.dims.inner.l > 0);
}

// ---- kes ---------------------------------------------------------------------
testBox({ length: 200, width: 120, height: 260 }, { fine: true });
testBox({ length: 200, width: 120, height: 260, kerf: 0, fit: 0 });
testBox({ length: 150, width: 90, height: 220, archRise: 70, archRound: 80 });
testBox({ length: 300, width: 180, height: 380, archRise: 35, archRound: 30, plinthMargin: 20 });
testBox({ length: 180, width: 110, height: 240, thickness: 5.2, kerf: 0.25 }, { fine: true });
testBox({ length: 200, width: 120, height: 260, thickness: 2.6, kerf: 0.2 }, { fine: true }); // Falcata 2.6
testBox({ length: 120, width: 80, height: 160, archRise: 90, archRound: 95, fit: 0.2, lidGap: 0.6 }, { fine: true });
testBox({ length: 100, width: 76, height: 50 });                       // kotak lalai: had mesti bertindak
testBox({ length: 400, width: 60, height: 300, archRise: 25 }, { swing: false });

// Input teruk: tak campak, dan ukuran yang keluar masih kotak.
for (const bad of [
  { length: 0, width: 0, height: 0 }, { archRise: 1000, archRound: -50 }, { archRise: 'x' },
  { plinthMargin: -3 }, { thickness: 12, length: 90 }, { thickness: 0.5 },
]) {
  let ok = true;
  try {
    const b = buildBox({ style: 'mihrab', ...bad });
    ok = b.panels.length >= 9 && Number.isFinite(b.derived.mihrab.zS);
  } catch (e) { ok = false; }
  check(`input teruk ${JSON.stringify(bad)}: tak campak`, ok);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
