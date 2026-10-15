// Plak Box: tapak cetak 3D untuk plak yang berdiri dalam kotak akrilik jernih.
//
// Pengguna memberi saiz LUAR plak yang akan dimasukkan - termasuk tapak plak
// itu sendiri - sebagai panjang (kiri-kanan), lebar (depan-belakang) dan
// tinggi. Daripada itu kami kira kotak akrilik di sekelilingnya, dan tapak
// yang memegang kedua-duanya:
//
//   * ALUR keliling, sedalam `grooveDepth`, tempat dinding akrilik berdiri.
//     Lebar alur = tebal akrilik + 2 x kelonggaran, jadi kotak masuk tanpa
//     dipaksa tetapi tidak bergoyang.
//   * POKET cetek di tengah, saiz tapak plak + kelonggaran, supaya plak tidak
//     tergelincir ke dinding akrilik bila kotak diangkat atau dibawa.
//   * TEPI BERTINGKAT (pilihan): jalur luar direndahkan sedikit, rupa bingkai
//     seperti tapak kayu yang dibentuk.
//
// Kotak akrilik itu tiada tanggam: kepingan segi empat dicantum hujung ke
// hujung dan sambungannya ditutup selotip (tiada chloroform). Jadi saiz setiap
// keping ditentukan oleh siapa menindih siapa:
//
//   * ATAS            panjang luar x lebar luar - duduk di atas keempat-empat dinding
//   * DEPAN, BELAKANG panjang luar x (tinggi kotak - t)
//   * KIRI, KANAN     (lebar luar - 2t) x (tinggi kotak - t) - masuk di antara depan dan belakang
//
// GEOMETRI. Setiap permukaan atas tapak ialah satah mendatar pada salah satu
// daripada beberapa paras, dan setiap sempadan antara paras ialah garis lurus
// selari paksi. Jadi tapak ialah MEDAN TINGGI atas grid segi empat tak seragam:
// garisan grid di setiap tepi ciri, satu tinggi bagi setiap sel. Mesh dibina
// terus daripada grid itu (lihat heightfieldMesh) - tiada CSG, tiada earcut,
// dan jasadnya tertutup tepat: setiap sisi dikongsi oleh tepat dua segitiga.
//
// Modul ini TULEN: tiada DOM, tiada import. Diuji dalam node
// (scripts/test-plakbox.mjs).

export const DEFAULTS = {
  // Plak yang dimasukkan, termasuk tapaknya sendiri (mm).
  plakL: 230,
  plakW: 80,
  plakH: 310,
  // Kotak akrilik.
  acrylic: 3,
  gap: 10,       // ruang antara plak dan dinding akrilik, setiap sisi
  gapTop: 10,    // ruang antara puncak plak dan bumbung akrilik
  // Tapak.
  baseH: 25,
  rim: 12,       // bibir tapak di luar alur
  grooveDepth: 4,
  grooveClear: 0.4,
  pocket: true,
  pocketDepth: 2,
  pocketClear: 0.5,
  stepW: 4,      // tepi bertingkat: lebar jalur (0 = tiada)
  stepH: 4,      //                  dalam jalur
};

export const LIMITS = {
  plakL: [30, 600],
  plakW: [10, 300],
  plakH: [30, 800],
  acrylic: [1.5, 6],
  gap: [2, 60],
  gapTop: [0, 80],
  baseH: [8, 80],
  rim: [4, 60],
  grooveDepth: [1, 20],
  grooveClear: [0, 1.5],
  pocketDepth: [0.5, 10],
  pocketClear: [0, 3],
  stepW: [0, 30],
  stepH: [0, 30],
};

const PLA_G_PER_CM3 = 1.24;
const R6 = (v) => Math.round(v * 1e6) / 1e6;

/** Parameter yang selamat: nombor, dalam had, dan konsisten antara satu sama lain. */
export function cleanParams(input = {}) {
  const p = {};
  for (const [k, def] of Object.entries(DEFAULTS)) {
    if (typeof def === 'boolean') { p[k] = input[k] == null ? def : !!input[k]; continue; }
    const v = Number(input[k]);
    const [lo, hi] = LIMITS[k];
    p[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
  }
  const notes = [];
  // Lantai di bawah alur, poket dan tingkat mesti kekal cukup tebal untuk dicetak.
  if (p.grooveDepth > p.baseH - 3) {
    p.grooveDepth = R6(p.baseH - 3);
    notes.push(`Alur dihadkan ${p.grooveDepth} mm supaya lantai di bawahnya kekal 3 mm.`);
  }
  if (p.pocketDepth > p.baseH - 2) p.pocketDepth = R6(p.baseH - 2);
  if (p.stepH > p.baseH - 3) p.stepH = R6(p.baseH - 3);
  // Tingkat tidak boleh memakan dinding luar alur.
  if (p.stepW > p.rim - 2) {
    p.stepW = R6(Math.max(0, p.rim - 2));
    notes.push(`Tepi bertingkat dihadkan ${p.stepW} mm supaya bibir luar alur kekal 2 mm.`);
  }
  if (!(p.stepW > 0) || !(p.stepH > 0)) { p.stepW = 0; p.stepH = 0; }
  // Dinding antara alur dan poket.
  const wall = p.gap - p.grooveClear - (p.pocket ? p.pocketClear : 0);
  if (p.pocket && wall < 1.5) {
    p.pocket = false;
    notes.push('Poket dibuang: ruang plak terlalu sempit untuk dinding antara poket dan alur.');
  }
  return { p, notes };
}

/** Semua ukuran yang diterbitkan, dalam mm. Paksi: x kiri-kanan, y depan-belakang, z ke atas. */
export function derive(p) {
  const t = p.acrylic;
  const c = p.grooveClear;
  const coverInL = p.plakL + 2 * p.gap;
  const coverInW = p.plakW + 2 * p.gap;
  const coverOutL = coverInL + 2 * t;
  const coverOutW = coverInW + 2 * t;
  const baseL = coverOutL + 2 * c + 2 * p.rim;
  const baseW = coverOutW + 2 * c + 2 * p.rim;

  const groove = { x0: p.rim, y0: p.rim, x1: baseL - p.rim, y1: baseW - p.rim };
  const grooveIn = { x0: p.rim + t + 2 * c, y0: p.rim + t + 2 * c, x1: baseL - p.rim - t - 2 * c, y1: baseW - p.rim - t - 2 * c };
  const cover = { x0: p.rim + c, y0: p.rim + c, x1: baseL - p.rim - c, y1: baseW - p.rim - c };
  const plak = { x0: cover.x0 + t + p.gap, y0: cover.y0 + t + p.gap, x1: cover.x1 - t - p.gap, y1: cover.y1 - t - p.gap };
  const pocket = p.pocket
    ? { x0: plak.x0 - p.pocketClear, y0: plak.y0 - p.pocketClear, x1: plak.x1 + p.pocketClear, y1: plak.y1 + p.pocketClear }
    : null;

  const plakZ = p.baseH - (p.pocket ? p.pocketDepth : 0);
  const coverZ = p.baseH - p.grooveDepth;              // dinding akrilik berdiri di dasar alur
  const coverTop = plakZ + p.plakH + p.gapTop + t;     // muka atas bumbung
  const coverH = coverTop - coverZ;

  const panels = [
    { id: 'atas', name: 'Atas', w: coverOutL, h: coverOutW, qty: 1 },
    { id: 'depan', name: 'Depan & Belakang', w: coverOutL, h: coverH - t, qty: 2 },
    { id: 'sisi', name: 'Kiri & Kanan', w: coverOutW - 2 * t, h: coverH - t, qty: 2 },
  ].map((q) => ({ ...q, w: R6(q.w), h: R6(q.h) }));

  // Selotip: empat bucu tegak dan empat tepi bumbung.
  const tape = 4 * (coverH - t) + 2 * coverOutL + 2 * coverOutW;

  return {
    t, baseL, baseW, groove, grooveIn, cover, plak, pocket, plakZ, coverZ, coverTop, coverH,
    coverOutL, coverOutW, coverInL, coverInW, panels, tape,
    totalH: coverTop,
  };
}

/** Tinggi tapak pada satu titik (pusat sel grid). */
function heightAt(p, d, x, y) {
  const inside = (r, px, py) => r && px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1;
  if (p.stepW > 0 && (x < p.stepW || x > d.baseL - p.stepW || y < p.stepW || y > d.baseW - p.stepW)) {
    return p.baseH - p.stepH;
  }
  if (inside(d.groove, x, y) && !inside(d.grooveIn, x, y)) return p.baseH - p.grooveDepth;
  if (inside(d.pocket, x, y)) return p.baseH - p.pocketDepth;
  return p.baseH;
}

const uniqSorted = (vals) => {
  const s = [...new Set(vals.map(R6))].sort((a, b) => a - b);
  return s.filter((v, i) => i === 0 || v - s[i - 1] > 1e-6);
};

/**
 * Jasad pepejal { (x, y, z) : 0 <= z <= H[i][j] } atas grid xs x ys, sebagai
 * segitiga (9 nombor setiap satu), normal ke luar.
 *
 * Muka atas dan bawah: satu segi empat bagi setiap sel. Dinding: di mana dua
 * sel bersebelahan (atau sel dan luar, tinggi 0) berbeza tinggi. Bahagian
 * yang halus ialah tepi TEGAK: pada satu bucu grid, dinding-dinding yang
 * bertemu meliputi julat tinggi yang berbeza, jadi setiap dinding dipecah
 * pada SEMUA paras yang wujud di bucu itu. Barulah setiap segmen tegak
 * dikongsi oleh tepat dua muka, bukan sebahagian bertindih (simpang-T, yang
 * slicer laporkan sebagai "non-manifold"). Dinding kemudian dijahit antara
 * dua lajur titik itu - dua garis tegak yang berlainan, jadi tiada segitiga
 * leper.
 */
export function heightfieldMesh(xs, ys, H) {
  const n = xs.length - 1;
  const m = ys.length - 1;
  const h = (i, j) => (i >= 0 && i < n && j >= 0 && j < m ? H[i][j] : 0);
  const levels = (i, j) => uniqSorted([0, h(i - 1, j - 1), h(i, j - 1), h(i - 1, j), h(i, j)]);
  const out = [];

  const tri = (a, b, c, nx, ny, nz) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz < 0) [b, c] = [c, b];
    out.push(...a, ...b, ...c);
  };

  // Jahit dua lajur titik tegak (z menaik) menjadi satu jalur segitiga.
  const zip = (A, B, pa, pb, nrm) => {
    const P = (xy, z) => [xy[0], xy[1], z];
    let i = 0, j = 0;
    while (i < A.length - 1 || j < B.length - 1) {
      if (j === B.length - 1 || (i < A.length - 1 && A[i + 1] <= B[j + 1])) {
        tri(P(pa, A[i]), P(pb, B[j]), P(pa, A[i + 1]), ...nrm);
        i++;
      } else {
        tri(P(pa, A[i]), P(pb, B[j]), P(pb, B[j + 1]), ...nrm);
        j++;
      }
    }
  };

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const z = H[i][j];
      if (!(z > 0)) continue;
      const a = [xs[i], ys[j]], b = [xs[i + 1], ys[j]], c = [xs[i + 1], ys[j + 1]], e = [xs[i], ys[j + 1]];
      tri([...a, z], [...b, z], [...c, z], 0, 0, 1);
      tri([...a, z], [...c, z], [...e, z], 0, 0, 1);
      tri([...a, 0], [...c, 0], [...b, 0], 0, 0, -1);
      tri([...a, 0], [...e, 0], [...c, 0], 0, 0, -1);
    }
  }

  // Dinding pada garis x = xs[i].
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j < m; j++) {
      const hl = h(i - 1, j), hr = h(i, j);
      if (hl === hr) continue;
      const lo = Math.min(hl, hr), hi = Math.max(hl, hr);
      const A = levels(i, j).filter((z) => z >= lo && z <= hi);
      const B = levels(i, j + 1).filter((z) => z >= lo && z <= hi);
      zip(A, B, [xs[i], ys[j]], [xs[i], ys[j + 1]], [hl > hr ? 1 : -1, 0, 0]);
    }
  }
  // Dinding pada garis y = ys[j].
  for (let j = 0; j <= m; j++) {
    for (let i = 0; i < n; i++) {
      const hb = h(i, j - 1), ha = h(i, j);
      if (hb === ha) continue;
      const lo = Math.min(hb, ha), hi = Math.max(hb, ha);
      const A = levels(i, j).filter((z) => z >= lo && z <= hi);
      const B = levels(i + 1, j).filter((z) => z >= lo && z <= hi);
      zip(A, B, [xs[i], ys[j]], [xs[i + 1], ys[j]], [0, hb > ha ? 1 : -1, 0]);
    }
  }
  return out;
}

/** Tapak lengkap: parameter bersih, ukuran diterbitkan, mesh dan statistik. */
export function buildPlakBox(input = {}) {
  const { p, notes } = cleanParams(input);
  const d = derive(p);

  const xsRaw = [0, d.baseL, d.groove.x0, d.groove.x1, d.grooveIn.x0, d.grooveIn.x1];
  const ysRaw = [0, d.baseW, d.groove.y0, d.groove.y1, d.grooveIn.y0, d.grooveIn.y1];
  if (p.stepW > 0) {
    xsRaw.push(p.stepW, d.baseL - p.stepW);
    ysRaw.push(p.stepW, d.baseW - p.stepW);
  }
  if (d.pocket) {
    xsRaw.push(d.pocket.x0, d.pocket.x1);
    ysRaw.push(d.pocket.y0, d.pocket.y1);
  }
  const xs = uniqSorted(xsRaw);
  const ys = uniqSorted(ysRaw);
  const H = [];
  let volume = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    H.push([]);
    for (let j = 0; j < ys.length - 1; j++) {
      const z = R6(heightAt(p, d, (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2));
      H[i].push(z);
      volume += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]) * z;
    }
  }
  const tris = heightfieldMesh(xs, ys, H);

  const warnings = [...notes];
  // Hanya bila ada poket: tanpanya, bahagian di dalam alur ialah satu pulau
  // pepejal penuh dan tiada dinding nipis untuk dirisaukan.
  if (p.pocket && p.gap - p.grooveClear - p.pocketClear < 3) {
    warnings.push('Dinding antara poket plak dan alur akrilik kurang 3 mm - besarkan ruang plak kalau ia rapuh.');
  }
  if (p.acrylic + 2 * p.grooveClear < 2) warnings.push('Alur kurang 2 mm lebar - sukar dicetak bersih.');

  return {
    params: p,
    derived: d,
    grid: { xs, ys, H },
    mesh: new Float32Array(tris),
    stats: {
      triangles: tris.length / 9,
      volumeMm3: volume,
      gramsSolid: (volume / 1000) * PLA_G_PER_CM3,
    },
    warnings,
  };
}

/** Binari STL: pengepala 80 bait, kiraan segitiga, kemudian 50 bait setiap segitiga. */
export function trianglesToStl(tris, header = 'SifuLaser Plak Box') {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = String(header).slice(0, 80);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const b = t * 9;
    const ax = tris[b + 3] - tris[b], ay = tris[b + 4] - tris[b + 1], az = tris[b + 5] - tris[b + 2];
    const bx = tris[b + 6] - tris[b], by = tris[b + 7] - tris[b + 1], bz = tris[b + 8] - tris[b + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    o += 12;
    for (let k = 0; k < 9; k++) { dv.setFloat32(o, tris[b + k], true); o += 4; }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}
