// Alat voksel untuk ujian Box Maker: pasang panel dalam 3D dan cari kayu yang
// bertindih. Dikongsi oleh scripts/test-boxmaker-mihrab.mjs dan
// scripts/test-boxmaker-round.mjs.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', '..', 'docs', 'boxmaker', 'src', 'geom');
const { offsetPolygon } = await import(pathToFileURL(path.join(SRC, 'path.js')).href);

// Setiap panel dikecilkan sedikit sebelum diisi: sendi sengaja muat ketat
// (interference fit, hingga 0.125 mm sebelah), dan itu bukan pertembungan.
// Pertembungan sebenar - tanon tanpa lubang, pintu melanggar - jauh lebih besar.
export const ERODE = 0.15;

// ---- cincin ------------------------------------------------------------------
export const area = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
};
export function selfIntersects(r) {
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
export function rasterTester(rings) {
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
/** Grid voksel atas kotak [lo, hi], resolusi r = [rx, ry, rz]. */
export function gridOver(lo, hi, r) {
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
export function panelSolid(panel, rot = null, erode = ERODE) {
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
export function fill(grid, solid, id, { write = true, against = null } = {}) {
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

/**
 * Panel bengkok (bumbung mihrab, dinding bulat): sampel ke hadapan dari
 * (s, v, kedalaman) ke dunia. `bend.plane` 'xz': lengkung dalam X/Z, lebar
 * sepanjang Y dari y0; 'xy': lengkung dalam X/Y, tinggi sepanjang Z dari z0.
 */
export function fillBend(grid, panel, id, step = 0.25, erode = ERODE) {
  const { path: P, y0 = 0, z0 = 0, plane = 'xz' } = panel.bend;
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
  const world = (a, b, na, nb, d, v) => (plane === 'xy'
    ? [a + na * d, b + nb * d, z0 + v]
    : [a + na * d, y0 + v, b + nb * d]);
  const seen = new Set();
  const inGrid = (p) => p[0] > grid.x0 && p[1] > grid.y0 && p[2] > grid.z0
    && p[0] < grid.x0 + grid.nx * grid.r[0] && p[1] < grid.y0 + grid.ny * grid.r[1]
    && p[2] < grid.z0 + grid.nz * grid.r[2];
  for (let s = 0.1; s < panel.size.w; s += step) {
    const [a, b, na, nb] = at(s + su);
    for (let v = 0.1; v < panel.size.h; v += step) {
      if (!inRing(s, v)) continue;
      for (const f of [0.2, 0.5, 0.8]) {
        const d = t / 2 - f * t;              // +t/2 luar .. -t/2 dalam
        const p = world(a, b, na, nb, d, v + sv);
        if (!inGrid(p)) continue;
        const [ci, cj, ck] = grid.cell(...p);
        const key = grid.idx(ci, cj, ck);
        if (seen.has(key)) continue;
        seen.add(key);
        // Hanya voksel yang TENGAHNYA benar-benar dalam papan - dalam tebal
        // papan, dan dalam bentuknya. Tanpa semakan kedua, sampel di tepi
        // menandakan seluruh voksel dan papan kelihatan 0.3 mm lebih lebar.
        const c = grid.center(ci, cj, ck);
        const ca = c[0], cb = plane === 'xy' ? c[1] : c[2], cv = plane === 'xy' ? c[2] : c[1];
        const depth = (ca - a) * na + (cb - b) * nb;
        if (Math.abs(depth) > t / 2 - erode) continue;
        const [a1, b1] = at(s + su + 0.05);
        const [a0, b0] = at(s + su - 0.05);
        const tl = Math.hypot(a1 - a0, b1 - b0) || 1;
        const ds = ((ca - a) * (a1 - a0) + (cb - b) * (b1 - b0)) / tl;
        const dv = cv - (plane === 'xy' ? z0 : y0) - (v + sv);
        if (!inRing(s + ds, v + dv)) { seen.delete(key); continue; }
        const was = grid.own[key];
        if (was >= 0) clash.set(was, (clash.get(was) || 0) + 1);
        else grid.own[key] = id;
      }
    }
  }
  return clash;
}
