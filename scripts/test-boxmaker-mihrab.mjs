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
const { offsetPolygon } = await import(pathToFileURL(path.join(SRC, 'path.js')).href);

// Setiap panel dikecilkan sedikit sebelum diisi: sendi sengaja muat ketat
// (interference fit, hingga 0.125 mm sebelah), dan itu bukan pertembungan.
// Pertembungan sebenar - tanon tanpa lubang, pintu melanggar - jauh lebih besar.
const ERODE = 0.15;

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 80) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}

// ---- cincin ------------------------------------------------------------------
const area = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
};
function selfIntersects(r) {
  const n = r.length;
  const seg = (i) => [r[i], r[(i + 1) % n]];
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const [a, b] = seg(i);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [c, d] = seg(j);
      if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0])
        || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
      if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9))
        && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return [i, j];
    }
  }
  return null;
}

// ---- titik dalam poligon (dengan indeks baris imbasan) -----------------------
function rasterTester(rings) {
  // Untuk setiap baris y: senarai x persilangan semua cincin -> genap/ganjil.
  const edges = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j], b = r[i];
      if (a[1] === b[1]) continue;
      edges.push(a[1] < b[1] ? [a, b] : [b, a]);
      y0 = Math.min(y0, a[1], b[1]);
      y1 = Math.max(y1, a[1], b[1]);
    }
  }
  const cache = new Map();
  const row = (y) => {
    let xs = cache.get(y);
    if (xs) return xs;
    xs = [];
    for (const [a, b] of edges) {
      if (y >= a[1] && y < b[1]) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    cache.set(y, xs);
    return xs;
  };
  return (x, y) => {
    if (y < y0 || y > y1) return false;
    const xs = row(y);
    let inside = false;
    for (const v of xs) { if (v > x) break; inside = !inside; }
    return inside;
  };
}

// ---- grid voksel -------------------------------------------------------------
const RES = 0.5;
function makeGrid(box) {
  const m = box.derived.mihrab;
  return gridOver([-m.mb - 4, -m.mb - 4, -1],
    [box.params.length + m.mb + 4, box.params.width + m.mb + 4, box.params.height + 5], [RES, RES, RES]);
}

/** Grid voksel atas kotak [lo, hi], resolusi r = [rx, ry, rz]. */
function gridOver(lo, hi, r) {
  // Dianjak sedikit supaya tengah voksel tidak jatuh tepat di tepi papan.
  const x0 = lo[0] + 0.0137, y0 = lo[1] + 0.0291, z0 = lo[2] + 0.0173;
  const nx = Math.ceil((hi[0] - lo[0]) / r[0]);
  const ny = Math.ceil((hi[1] - lo[1]) / r[1]);
  const nz = Math.ceil((hi[2] - lo[2]) / r[2]);
  return {
    x0, y0, z0, nx, ny, nz, r,
    own: new Int8Array(nx * ny * nz).fill(-1),
    idx: (i, j, k) => (k * ny + j) * nx + i,
    center: (i, j, k) => [x0 + (i + 0.5) * r[0], y0 + (j + 0.5) * r[1], z0 + (k + 0.5) * r[2]],
    cell: (x, y, z) => [Math.floor((x - x0) / r[0]), Math.floor((y - y0) / r[1]), Math.floor((z - z0) / r[2])],
  };
}

/** Panel -> fungsi dalam(x, y, z) dalam koordinat dunia, dan kotak sempadannya. */
function panelSolid(panel, rot = null, erode = ERODE) {
  const { origin, U, V, N } = panel.frame;
  const [su, sv] = panel.originShift;
  const t = panel.thickness;
  const inRing = rasterTester([offsetPolygon(panel.outlineNominal, -erode),
    ...panel.holesNominal.map((h) => offsetPolygon(h, erode))]);
  // dunia -> tempatan: u = (p - o).U - su, v = (p - o).V - sv, n = (p - o).N
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let toLocal = (p) => {
    const d = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
    return [dot(d, U) - su, dot(d, V) - sv, dot(d, N)];
  };
  if (rot) {
    // Putaran pintu: tentang paksi selari V melalui (u = hinge.u, n = hinge.n).
    const { u: hu, n: hn } = panel.hinge;
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const base = toLocal;
    toLocal = (p) => {
      const [u, v, n] = base(p);
      const du = u + su - hu, dn = n - hn;
      // Songsang putaran three.js tentang y: x' = x c + z s, z' = -x s + z c
      return [du * c + dn * s + hu - su, v, -du * s + dn * c + hn];
    };
  }
  const inside = (p) => {
    const [u, v, n] = toLocal(p);
    return n < -erode && n > -t + erode && inRing(u, v);
  };
  // Kotak sempadan dunia dari bucu kotak tempatan (dengan putaran jika ada).
  const corners = [];
  const W = panel.size.w, H = panel.size.h;
  for (const u of [0, W]) for (const v of [0, H]) for (const n of [0, -t]) {
    let uu = u + su, nn = n;
    if (rot) {
      const { u: hu, n: hn } = panel.hinge;
      const du = uu - hu, dn = nn - hn;
      const c = Math.cos(rot), s = Math.sin(rot);
      uu = du * c + dn * s + hu;
      nn = -du * s + dn * c + hn;
    }
    const vv = v + sv;
    corners.push([0, 1, 2].map((k) => origin[k] + U[k] * uu + V[k] * vv + N[k] * nn));
  }
  const lo = [0, 1, 2].map((k) => Math.min(...corners.map((q) => q[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...corners.map((q) => q[k])));
  return { inside, lo, hi };
}

/** Isi voksel panel; pulangkan senarai pertembungan [voksel, pemilik lama]. */
function fill(grid, solid, id, { write = true, against = null } = {}) {
  const [i0, j0, k0] = grid.cell(...solid.lo).map((v) => Math.max(0, v));
  const [i1, j1, k1] = grid.cell(...solid.hi);
  const clash = new Map();
  for (let k = k0; k <= Math.min(k1, grid.nz - 1); k++) {
    for (let j = j0; j <= Math.min(j1, grid.ny - 1); j++) {
      for (let i = i0; i <= Math.min(i1, grid.nx - 1); i++) {
        const c = grid.center(i, j, k);
        if (!solid.inside(c)) continue;
        const at = grid.idx(i, j, k);
        const was = grid.own[at];
        if (was >= 0 && (!against || against.has(was))) clash.set(was, (clash.get(was) || 0) + 1);
        if (write && was < 0) grid.own[at] = id;
      }
    }
  }
  return clash;
}

/** Bumbung: sampel ke hadapan dari (s, v, d) ke dunia. */
function fillRoof(grid, panel, id, step = 0.25, erode = ERODE) {
  const { path: P, y0 } = panel.bend;
  const t = panel.thickness;
  const inRing = rasterTester([offsetPolygon(panel.outlineNominal, -erode),
    ...panel.holesNominal.map((h) => offsetPolygon(h, erode))]);
  const [su, sv] = panel.originShift;
  const clash = new Map();
  let j = 0;
  const at = (s) => {
    while (j > 0 && P[j][0] > s) j--;
    while (j < P.length - 2 && P[j + 1][0] < s) j++;
    const a = P[j], b = P[j + 1];
    const f = Math.min(1, Math.max(0, (s - a[0]) / (b[0] - a[0])));
    return [1, 2, 3, 4].map((q) => a[q] + (b[q] - a[q]) * f);
  };
  const seen = new Set();
  const inGrid = (p) => p[0] > grid.x0 && p[1] > grid.y0 && p[2] > grid.z0
    && p[0] < grid.x0 + grid.nx * grid.r[0] && p[1] < grid.y0 + grid.ny * grid.r[1]
    && p[2] < grid.z0 + grid.nz * grid.r[2];
  for (let s = 0.1; s < panel.size.w; s += step) {
    const [x, z, nx, nz] = at(s + su);
    if (!inGrid([x, y0 + 1, z]) && !inGrid([x, grid.y0 + 0.01, z])) continue;
    for (let v = 0.1; v < panel.size.h; v += step) {
      if (!inRing(s, v)) continue;
      for (const f of [0.2, 0.5, 0.8]) {
        const d = t / 2 - f * t;              // +t/2 luar .. -t/2 dalam
        const p = [x + nx * d, y0 + v + sv, z + nz * d];
        if (!inGrid(p)) continue;
        const [ci, cj, ck] = grid.cell(...p);
        const key = grid.idx(ci, cj, ck);
        if (seen.has(key)) continue;
        seen.add(key);
        // Hanya voksel yang tengahnya benar-benar dalam papan.
        const c = grid.center(ci, cj, ck);
        const dx = c[0] - x, dz = c[2] - z;
        const depth = dx * nx + dz * nz;
        if (Math.abs(depth) > t / 2 - erode) continue;
        const was = grid.own[key];
        if (was >= 0) clash.set(was, (clash.get(was) || 0) + 1);
        else grid.own[key] = id;
      }
    }
  }
  return clash;
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
  const rc = fillRoof(grid, roof, roofId);
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
      fillRoof(fg, roof, roofId, 0.06, 0.03);
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
