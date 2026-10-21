// "sifulaser.com" terbenam di muka bawah STL - jenama yang ikut fail cetak 3D.
//
// Keputusan bos (21 Oktober 2026): jenama ada dalam fail, bukan pada muka
// produk yang kelihatan. Untuk STL itu bermakna di bawah tapak, terbenam
// sedikit (0.6 mm), dan DICERMINKAN supaya terbaca bila objek diterbalikkan.
// Fail SVG/PDF dijenamakan berasingan oleh brand.js, pada lapisan yang tidak
// dipotong.
//
// Muka bawah sesuatu jasad ialah poligon CEMBUNG `outer` pada z = 0. Di
// tengahnya diletak satu TAMPALAN segi empat; di dalam tampalan, grid raster
// res x res mm. Sel raster yang jatuh dalam lejang huruf Hershey diangkat ke
// z = depth (siling huruf, normal masih ke bawah) dan dinding tegak dipasang
// di antara sel yang berbeza. Hasilnya tertutup dan manifold tanpa boolean
// mesh:
//
//   * cincin antara `outer` dan tampalan dibahagi kepada empat kawasan (satu
//     setiap sisi tampalan) oleh "jejari" dari setiap bucu tampalan ke satu
//     bucu `outer` di sukuannya. Setiap kawasan cembung, dikipas dua kali.
//     Setiap titik raster di sempadan tampalan dipakai - tiada simpang-T.
//   * tiada papan dam: dua sel terbenam yang bersentuhan di satu bucu sahaja
//     membuat satu sisi tegak dikongsi empat muka; satu sel lagi diisi.
//   * baris raster di tepi tampalan tidak pernah terbenam (margin), jadi
//     sempadan tampalan sentiasa rata pada z = 0.
//
// Siling setiap huruf ialah jambatan selebar lejang (~1.2 mm), bukan overhang:
// mana-mana slicer mencetaknya tanpa support.
//
// Tulen: tiada DOM. Diimport oleh geom Plak Box dan Tray Organizer, diuji
// oleh scripts/test-plakbox.mjs, scripts/test-tray3d.mjs, scripts/test-brand.mjs.

import { SANS } from './hershey-sans.js';

export const DEBOSS = {
  text: 'sifulaser.com',
  depth: 0.6,     // 3 lapis pada 0.2 mm
  res: 0.3,       // sel raster, mm
  margin: 3,      // ruang rata di keliling tulisan dalam tampalan
  capMax: 7,      // tinggi huruf besar paling tinggi
  capMin: 3,      // lebih kecil daripada ini tidak terbaca - langkau
};

const R6 = (v) => Math.round(v * 1e6) / 1e6;

/** Jarak titik (x, y) ke segmen ab. */
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

/** Separuh lebar lejang untuk huruf setinggi `cap`. */
const strokeR = (cap) => Math.max(0.45, 0.085 * cap);

/** Lebar "text" dalam unit tinggi huruf besar. */
function textWidth1(text) {
  const k1 = 1 / (SANS.cap || 21);
  let w1 = 0;
  for (const c of text) w1 += (SANS.glyphs[c.codePointAt(0)] || { w: 0 }).w * k1;
  return w1;
}

/**
 * Tinggi huruf yang muat dalam `avail` (sebelum had capMin) dan arahnya -
 * melintang (sepanjang x) atau menegak bila itu memberi huruf lebih besar.
 * Murah, untuk memilih kawasan sebelum debossPlan() merasterkan.
 */
export function debossFit(avail, opts = {}) {
  const { text, margin, capMax } = { ...DEBOSS, ...opts };
  const aw = avail.x1 - avail.x0, ah = avail.y1 - avail.y0;
  // Tampalan = tulisan (w x cap) + satu lebar lejang + 2 margin; lejang
  // 0.17 cap, tetapi tidak kurang daripada 0.9 mm (strokeR di bawah).
  const solve = (len, w) => {
    const c = len / (w + 0.17);
    return 0.085 * c >= 0.45 ? c : (len - 0.9) / w;
  };
  const fit = (along, across) => Math.min(capMax, solve(across - 2 * margin, 1), solve(along - 2 * margin, textWidth1(text)));
  const h = fit(aw, ah), v = fit(ah, aw);
  return v > h + 1e-9 ? { cap: v, vertical: true } : { cap: h, vertical: false };
}

export const debossCap = (avail, opts) => debossFit(avail, opts).cap;

/**
 * Rancangan tulisan di tengah `avail` ({ x0, y0, x1, y1 }, kawasan di mana
 * seluruh tampalan mesti muat): saiz huruf, tampalan, grid raster dan topeng
 * sel terbenam. null bila tak muat huruf setinggi capMin.
 */
export function debossPlan(avail, opts = {}) {
  const { text, depth, res, margin, capMin } = { ...DEBOSS, ...opts };
  const k1 = 1 / (SANS.cap || 21);
  const w1 = textWidth1(text);
  const { cap, vertical } = debossFit(avail, opts);
  if (!(cap >= capMin)) return null;
  const r = strokeR(cap);                           // separuh lebar lejang
  const tw = w1 * cap + 2 * r, th = cap + 2 * r;
  const cx = (avail.x0 + avail.x1) / 2, cy = (avail.y0 + avail.y1) / 2;
  const [hx, hy] = vertical ? [th / 2, tw / 2] : [tw / 2, th / 2];
  const patch = {
    x0: R6(cx - hx - margin), x1: R6(cx + hx + margin),
    y0: R6(cy - hy - margin), y1: R6(cy + hy + margin),
  };
  const e = 1e-6;
  if (patch.x0 < avail.x0 - e || patch.x1 > avail.x1 + e || patch.y0 < avail.y0 - e || patch.y1 > avail.y1 + e) return null;
  const nx = Math.ceil((patch.x1 - patch.x0) / res), ny = Math.ceil((patch.y1 - patch.y0) / res);
  const X = Array.from({ length: nx + 1 }, (_, a) => (a === nx ? patch.x1 : R6(patch.x0 + ((patch.x1 - patch.x0) * a) / nx)));
  const Y = Array.from({ length: ny + 1 }, (_, b) => (b === ny ? patch.y1 : R6(patch.y0 + ((patch.y1 - patch.y0) * b) / ny)));
  // Lejang, dicerminkan pada x supaya dibaca dari bawah. Melintang: huruf
  // pertama di hujung +x. Menegak: dibaca dari -y ke +y, kaki huruf di -x.
  const segs = [];
  let pen = 0;
  const k = cap * k1;
  const place = vertical
    ? (u, v) => [cx - cap / 2 + v, cy - tw / 2 + r + u]
    : (u, v) => [cx + tw / 2 - r - u, cy - cap / 2 + v];
  for (const c of text) {
    const g = SANS.glyphs[c.codePointAt(0)];
    if (!g) continue;
    for (const st of g.s) {
      for (let q = 0; q + 3 < st.length; q += 2) {
        const p = (u, v) => place(pen + u * k, v * k);
        segs.push([...p(st[q], st[q + 1]), ...p(st[q + 2], st[q + 3])]);
      }
    }
    pen += g.w * k;
  }
  const mask = new Uint8Array(nx * ny);
  for (let a = 1; a < nx - 1; a++) {
    for (let b = 1; b < ny - 1; b++) {
      const x = (X[a] + X[a + 1]) / 2, y = (Y[b] + Y[b + 1]) / 2;
      for (const s of segs) {
        if (segDist(x, y, s[0], s[1], s[2], s[3]) <= r) { mask[a * ny + b] = 1; break; }
      }
    }
  }
  for (let changed = true; changed;) {
    changed = false;
    for (let a = 0; a + 1 < nx; a++) {
      for (let b = 0; b + 1 < ny; b++) {
        const c00 = mask[a * ny + b], c10 = mask[(a + 1) * ny + b];
        const c01 = mask[a * ny + b + 1], c11 = mask[(a + 1) * ny + b + 1];
        if (c00 && c11 && !c10 && !c01) { mask[(a + 1) * ny + b] = 1; changed = true; }
        else if (c10 && c01 && !c00 && !c11) { mask[a * ny + b] = 1; changed = true; }
      }
    }
  }
  let area = 0;
  for (let a = 0; a < nx; a++) {
    for (let b = 0; b < ny; b++) if (mask[a * ny + b]) area += (X[a + 1] - X[a]) * (Y[b + 1] - Y[b]);
  }
  return { text, depth, cap, vertical, patch, X, Y, nx, ny, mask, area, volume: area * depth, segs, stroke: 2 * r };
}

/** Segitiga dengan normal searah `n`. */
const oriented = (push) => (a, b, c, n) => {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) push(a, c, b); else push(a, b, c);
};

/**
 * Muka bawah (z = 0, normal ke bawah) bagi poligon cembung `outer`
 * ([[x, y], ...], mana-mana arah) dengan tulisan `plan` terbenam. Setiap tepi
 * `outer` muncul tepat sekali, jadi ia menggantikan muka bawah asal tanpa
 * mengubah dinding di sekelilingnya. push(a, b, c) menerima segitiga yang
 * sudah berorientasi (normal keluar dari jasad). Pulangkan false - tanpa
 * mengeluarkan apa-apa - bila mana-mana bucu tampalan tiada bucu `outer` di
 * sukuannya (tampalan tidak cukup jauh ke dalam).
 */
export function debossFace(outer, plan, push) {
  const tri = oriented(push);
  const DOWN = [0, 0, -1];
  const { patch: P, X, Y, nx, ny, mask, depth: D } = plan;
  let O = outer.map((q) => [q[0], q[1]]);
  let s2 = 0;
  for (let i = 0; i < O.length; i++) {
    const a = O[i], b = O[(i + 1) % O.length];
    s2 += a[0] * b[1] - b[0] * a[1];
  }
  if (s2 < 0) O = O.reverse();                         // CCW dari atas
  // Bucu tampalan CCW: BL, BR, TR, TL; sukuan masing-masing.
  const Q = [[P.x0, P.y0], [P.x1, P.y0], [P.x1, P.y1], [P.x0, P.y1]];
  const dir = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const spoke = Q.map((q, k) => {
    let best = -1, score = -Infinity;
    O.forEach((o, i) => {
      const dx = o[0] - q[0], dy = o[1] - q[1];
      if (dx * dir[k][0] <= 1e-6 || dy * dir[k][1] <= 1e-6) return;
      const s = Math.min(dx * dir[k][0], dy * dir[k][1]);
      if (s > score) { score = s; best = i; }
    });
    return best;
  });
  if (spoke.some((i) => i < 0)) return false;
  // Sisi tampalan dari Q[k] ke Q[k+1], setiap titik raster di atasnya.
  const edge = [
    X.map((x) => [x, P.y0]),
    Y.map((y) => [P.x1, y]),
    X.map((x) => [x, P.y1]).reverse(),
    Y.map((y) => [P.x0, y]).reverse(),
  ];
  const z0 = (q) => [q[0], q[1], 0];
  for (let k = 0; k < 4; k++) {
    const A = O[spoke[k]];
    const pts = edge[k];
    for (let i = 0; i + 1 < pts.length; i++) tri(z0(A), z0(pts[i]), z0(pts[i + 1]), DOWN);
    const end = spoke[(k + 1) % 4];
    const Qn = Q[(k + 1) % 4];
    for (let i = spoke[k]; i !== end; i = (i + 1) % O.length) {
      tri(z0(Qn), z0(O[i]), z0(O[(i + 1) % O.length]), DOWN);
    }
  }
  // Di dalam tampalan: satu muka setiap sel raster, dinding di antara sel
  // berbeza. Dinding menghadap sel terbenam (ruang kosong).
  for (let a = 0; a < nx; a++) {
    for (let b = 0; b < ny; b++) {
      const h = mask[a * ny + b] ? D : 0;
      tri([X[a], Y[b], h], [X[a + 1], Y[b], h], [X[a + 1], Y[b + 1], h], DOWN);
      tri([X[a], Y[b], h], [X[a + 1], Y[b + 1], h], [X[a], Y[b + 1], h], DOWN);
    }
  }
  for (let a = 1; a < nx; a++) {
    for (let b = 0; b < ny; b++) {
      const l = mask[(a - 1) * ny + b], r = mask[a * ny + b];
      if (l === r) continue;
      const n = [l ? -1 : 1, 0, 0];
      const p0 = [X[a], Y[b], 0], p1 = [X[a], Y[b + 1], 0], p2 = [X[a], Y[b + 1], D], p3 = [X[a], Y[b], D];
      tri(p0, p1, p2, n); tri(p0, p2, p3, n);
    }
  }
  for (let b = 1; b < ny; b++) {
    for (let a = 0; a < nx; a++) {
      const lo = mask[a * ny + b - 1], hi = mask[a * ny + b];
      if (lo === hi) continue;
      const n = [0, lo ? -1 : 1, 0];
      const p0 = [X[a], Y[b], 0], p1 = [X[a + 1], Y[b], 0], p2 = [X[a + 1], Y[b], D], p3 = [X[a], Y[b], D];
      tri(p0, p1, p2, n); tri(p0, p2, p3, n);
    }
  }
  return true;
}

/** Ringkasan untuk derived / ujian. */
export const debossInfo = (plan) => (plan
  ? { text: plan.text, depth: plan.depth, cap: plan.cap, vertical: plan.vertical, rect: plan.patch, areaMm2: plan.area, volumeMm3: plan.volume }
  : null);
