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
// MUDAH DICETAK (bos, 21 Oktober 2026: tapak ialah bahagian paling sensitif).
// Muka bawah ialah lapisan pertama atas katil, jadi:
//   * STENSIL - bahagian dalam a, e, o tidak dibiarkan menjadi pulau yang
//     mesti melekat sendiri pada katil selama tiga lapisan; ia disambung ke
//     muka di luar huruf dengan jambatan selebar `bridge`. Kedudukannya
//     DIREKA (BRIDGES) supaya huruf masih dibaca sama - satu jambatan di atas
//     "o" sahaja menjadikannya "u". Pulau lain yang masih tinggal (huruf yang
//     tiada dalam BRIDGES, atau mulut e yang tertutup pada huruf kecil)
//     disambung oleh stencil() dengan jambatan lurus terpendek.
//   * LEJANG TEBAL - sekurang-kurangnya strokeMin (3 garisan nozzle 0.4 mm),
//     jadi lekuk masih terbuka walaupun lapisan pertama mengembang 0.2-0.4 mm.
//   * TIDAK DIKECILKAN - huruf di bawah capMin tidak diletak langsung.
// Siling setiap huruf ialah jambatan selebar lejang (~1.2-1.4 mm), bukan
// overhang: mana-mana slicer mencetaknya tanpa support.
//
// Tulen: tiada DOM. Diimport oleh geom Plak Box dan Tray Organizer, diuji
// oleh scripts/test-plakbox.mjs, scripts/test-tray3d.mjs, scripts/test-brand.mjs.

import { SANS } from './hershey-sans.js';

export const DEBOSS = {
  text: 'sifulaser.com',
  depth: 0.6,       // 3 lapis pada 0.2 mm
  res: 0.3,         // sel raster, mm
  margin: 3,        // ruang rata di keliling tulisan dalam tampalan
  capMax: 9,        // tinggi huruf besar paling tinggi
  capMin: 7,        // lebih kecil: s dan e tertutup oleh lejang 1.2 mm - langkau
  strokeMin: 1.2,   // lebar lejang paling nipis = 3 garisan nozzle 0.4 mm
  strokeK: 0.16,    // lejang = strokeK x tinggi huruf bila lebih tebal
  bridge: 1,        // lebar jambatan stensil
};

const R6 = (v) => Math.round(v * 1e6) / 1e6;

// Jambatan stensil, unit fon Hershey (cap 21, x-height 14, y ke atas): titik
// pada garis tengah lejang + arah merentasi lejang. Gaya fon stensil biasa:
//   o - dibelah atas dan bawah, "( )"
//   e - palang dipisah daripada sisi kanan (jambatan dari mata ke mulut)
//   a - atas mangkuk, jauh dari batang supaya batang tidak bertakuk
const BRIDGES = {
  o: [[9.5, 14, 0, 1], [9.5, 0, 0, -1]],
  e: [[13, 8, 0, 1]],
  a: [[10.5, 14, 0, 1]],
};

/** Jarak titik (x, y) ke segmen ab. */
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

/** Lebar lejang untuk huruf setinggi `cap`. */
const strokeOf = (cap, { strokeMin, strokeK }) => Math.max(strokeMin, strokeK * cap);

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
  const { text, margin, capMax, strokeMin, strokeK } = { ...DEBOSS, ...opts };
  const aw = avail.x1 - avail.x0, ah = avail.y1 - avail.y0;
  // Tampalan = tulisan (w x cap) + satu lebar lejang + 2 margin; lejang
  // strokeK x cap, tetapi tidak kurang daripada strokeMin (strokeOf).
  const solve = (len, w) => {
    const c = len / (w + strokeK);
    return strokeK * c >= strokeMin ? c : (len - strokeMin) / w;
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
  const o = { ...DEBOSS, ...opts };
  const { text, depth, res, margin, capMin } = o;
  const k1 = 1 / (SANS.cap || 21);
  const w1 = textWidth1(text);
  const { cap, vertical } = debossFit(avail, opts);
  if (!(cap >= capMin - 1e-9)) return null;
  const r = strokeOf(cap, o) / 2;                   // separuh lebar lejang
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
  const cuts = [];
  let pen = 0;
  const k = cap * k1;
  const place = vertical
    ? (u, v) => [cx - cap / 2 + v, cy - tw / 2 + r + u]
    : (u, v) => [cx + tw / 2 - r - u, cy - cap / 2 + v];
  for (const c of text) {
    const g = SANS.glyphs[c.codePointAt(0)];
    if (!g) continue;
    const p = (u, v) => place(pen + u * k, v * k);
    for (const st of g.s) {
      for (let q = 0; q + 3 < st.length; q += 2) {
        segs.push([...p(st[q], st[q + 1]), ...p(st[q + 2], st[q + 3])]);
      }
    }
    for (const [u, v, du, dv] of BRIDGES[c] || []) {
      const [x0, y0] = p(u, v), [x1, y1] = p(u + du, v + dv);
      const l = Math.hypot(x1 - x0, y1 - y0);
      cuts.push({ x: x0, y: y0, dx: (x1 - x0) / l, dy: (y1 - y0) / l });
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
  // Jambatan yang direka: segi empat selebar `bridge`, merentasi lejang
  // sejauh r + separuh sel ke setiap sisi garis tengah - cukup untuk
  // memutuskan lejang, tidak sampai ke lejang jiran.
  const reach = r + res / 2;
  for (const t of cuts) {
    for (let a = 1; a < nx - 1; a++) {
      for (let b = 1; b < ny - 1; b++) {
        const qx = (X[a] + X[a + 1]) / 2 - t.x, qy = (Y[b] + Y[b + 1]) / 2 - t.y;
        const along = qx * t.dx + qy * t.dy, across = -qx * t.dy + qy * t.dx;
        if (Math.abs(along) <= reach && Math.abs(across) <= o.bridge / 2) mask[a * ny + b] = 0;
      }
    }
  }
  noCheckerboard(mask, nx, ny);
  const grid = { X, Y, nx, ny, mask };
  const bridges = cuts.length + stencil(grid, { width: o.bridge, up: vertical ? [1, 0] : [0, 1] });
  let area = 0;
  for (let a = 0; a < nx; a++) {
    for (let b = 0; b < ny; b++) if (mask[a * ny + b]) area += (X[a + 1] - X[a]) * (Y[b + 1] - Y[b]);
  }
  return { text, depth, cap, vertical, patch, X, Y, nx, ny, mask, area, volume: area * depth, segs, stroke: 2 * r, bridges };
}

/**
 * Tiada papan dam: dua sel terbenam yang bersentuhan di satu bucu sahaja
 * membuat satu sisi tegak dikongsi empat muka. Isi satu lagi sel sehingga tiada.
 */
function noCheckerboard(mask, nx, ny) {
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
}

/**
 * Label komponen sel RATA (tidak terbenam), bersebelahan sisi. Komponen 0
 * ialah yang menyentuh tepi tampalan - muka bawah di luar huruf; setiap
 * komponen lain ialah PULAU: bahagian dalam huruf bertutup.
 */
export function flatComponents({ nx, ny, mask }) {
  const label = new Int32Array(nx * ny).fill(-1);
  const comps = [];
  const flood = (start, id) => {
    const cells = [start];
    label[start] = id;
    for (let q = 0; q < cells.length; q++) {
      const c = cells[q], a = Math.floor(c / ny), b = c % ny;
      for (const [A, B] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) {
        if (A < 0 || B < 0 || A >= nx || B >= ny) continue;
        const j = A * ny + B;
        if (!mask[j] && label[j] < 0) { label[j] = id; cells.push(j); }
      }
    }
    return cells;
  };
  comps.push(flood(0, 0));                          // sel (0, 0) sentiasa rata
  for (let i = 0; i < nx * ny; i++) if (!mask[i] && label[i] < 0) comps.push(flood(i, comps.length));
  return { label, comps };
}

/**
 * Gaya stensil: setiap pulau disambung ke komponen 0 dengan satu jalur sel
 * rata selebar `width`, lurus dari pusat pulau. Arah dicuba ikut keutamaan -
 * "atas" huruf (`up`), bawah, kemudian dua sisi - dan yang pertama yang sampai
 * ke luar huruf dalam 3 mm dipakai; jika tiada, yang terpendek. Pulau yang tak
 * boleh disambung langsung diisi (lubang huruf itu hilang, bukan gagal cetak).
 * Mengubah `mask`; pulangkan bilangan jambatan.
 */
function stencil(g, { width, up }) {
  const { X, Y, nx, ny, mask } = g;
  const dirs = [up, [-up[0], -up[1]], [up[1], up[0]], [-up[1], -up[0]]];
  let bridges = 0;
  for (let pass = 0; pass < 6; pass++) {
    const { label, comps } = flatComponents(g);
    if (comps.length === 1) break;
    for (let id = 1; id < comps.length; id++) {
      const cells = comps[id];
      let sx = 0, sy = 0;
      for (const c of cells) {
        const a = Math.floor(c / ny), b = c % ny;
        sx += (X[a] + X[a + 1]) / 2; sy += (Y[b] + Y[b + 1]) / 2;
      }
      const cx = sx / cells.length, cy = sy / cells.length;
      let best = null;
      for (const [dx, dy] of dirs) {
        // Jalur: garis-garis sel selari dengan arah, pusatnya dalam width/2
        // daripada garis tengah pulau.
        const along = dx !== 0 ? 'x' : 'y';
        const lines = [];
        if (along === 'x') {
          for (let b = 0; b < ny; b++) if (Math.abs((Y[b] + Y[b + 1]) / 2 - cy) <= width / 2 + 1e-9) lines.push(b);
        } else {
          for (let a = 0; a < nx; a++) if (Math.abs((X[a] + X[a + 1]) / 2 - cx) <= width / 2 + 1e-9) lines.push(a);
        }
        if (!lines.length) continue;
        const start = along === 'x'
          ? X.findIndex((x, a) => a < nx && X[a + 1] > cx)
          : Y.findIndex((y, b) => b < ny && Y[b + 1] > cy);
        const walk = [];
        let ok = true, len = 0;
        for (const ln of lines) {
          let k = start, n = 0;
          const at = (kk) => (along === 'x' ? kk * ny + ln : ln * ny + kk);
          const step = along === 'x' ? dx : dy;
          const lim = along === 'x' ? nx : ny;
          while (k >= 0 && k < lim && !mask[at(k)] && label[at(k)] === id) k += step;
          while (k >= 0 && k < lim && mask[at(k)]) { walk.push(at(k)); n++; k += step; }
          if (k < 0 || k >= lim || label[at(k)] !== 0) { ok = false; break; }
          len = Math.max(len, n);
        }
        if (!ok) continue;
        const mm = len * (along === 'x' ? (X[1] - X[0]) : (Y[1] - Y[0]));
        if (!best || (best.mm > 3 && mm < best.mm)) best = { walk, mm };
        if (best.mm <= 3) break;
      }
      if (best) {
        for (const c of best.walk) mask[c] = 0;
        bridges++;
      } else {
        for (const c of cells) mask[c] = 1;
      }
    }
    noCheckerboard(mask, nx, ny);
  }
  return bridges;
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
  ? {
    text: plan.text, depth: plan.depth, cap: plan.cap, stroke: plan.stroke, vertical: plan.vertical,
    bridges: plan.bridges, rect: plan.patch, areaMm2: plan.area, volumeMm3: plan.volume,
  }
  : null);
