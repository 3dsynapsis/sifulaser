// Penjana jasad untuk Tray Organizer versi CETAK 3D - satu cangkerang pepejal,
// bukan panel. Susun atur ialah POKOK BELAHAN (geom/layout.js): setiap petak
// boleh dibelah sendiri, jadi satu petak panjang untuk sudu boleh duduk di
// sebelah 2x2. Tanpa pokok, grid mod laser (cols x rows) ditukar menjadi
// pokok. Dinding boleh senipis 3 perimeter nozzle, bucu berfillet, lantai
// pepejal, pilihan kaki boleh susun, dan output STL.
//
// SATU CANGKERANG MANIFOLD. Bambu Studio dan Orca menanda lencana amaran pada
// mesh yang ada tepi tidak dikongsi tepat dua segitiga, dan PrusaSlicer boleh
// menghiris salah. Jadi jasad ini TIDAK dibina sebagai kesatuan kotak-kotak
// bertindih (muka dalaman, muka sepalan). Ia dibina muka demi muka daripada
// poligon yang berkongsi BUCU YANG SAMA di setiap tepi bersama:
//
//   * O  - garis luar dulang (segi empat berfillet rO = fillet + dinding)
//   * I  - muka dalam dinding luar. Bucunya termasuk setiap titik tangen dan
//          setiap bucu segi empat petak sempadan, supaya tepi bawahnya pada
//          paras Hd sepadan tepat dengan tepi atas dinding poket, hujung
//          jalur pembahagi dan serpih fillet di sebelahnya. Lengkung penjuru
//          I ialah lengkung petak penjuru sendiri.
//   * C_k - setiap petak, segi empat berfillet r (SATU r untuk semua petak)
//   * F  - kaki boleh susun, I dikecilkan sebanyak kelonggaran
//
// Muka: tapak (F atau O, ke bawah) - dinding kaki - cincin anak tangga (O - F,
// ke bawah) - dinding luar O - cincin atas (O - I) pada H - muka dalam I dari
// Hd ke H - RANGKA pembahagi pada Hd - dinding poket setiap petak dari lantai
// ke Hd - lantai poket. Bila Hd = H, cincin atas dan rangka sepalan dan
// berkongsi tepi I - masih manifold, satu laluan kod sahaja.
//
// TIADA earcut pada muka yang berlubang atau yang bucunya kolinear. Rangka
// ialah jalur pembahagi (dizip antara dua sisi panjang) + serpih fillet
// (kipas); cincin ialah jalur sisi (dizip) + sektor penjuru (kuad antara dua
// lengkung sepusat). Earcut menyambung lubang dengan sinar mendatar dan
// gagal pada grid fillet-0 di mana berpuluh bucu berkongsi y yang sama; ia
// juga memilih kipas yang nipis dalam float64 dan merosot dalam float32.
// Semua koordinat susun atur dibundarkan ke grid 1e-6 mm supaya titik tangen
// dan bucu segi empat terletak tepat pada garis yang sama, bit demi bit.
//
// three.js hanya dipinjam untuk earcut pada muka CEMBUNG tanpa lubang
// (tapak, lantai poket). Ia dihantar masuk, bukan diimport, supaya ujian
// node boleh beri terus dan halaman boleh kongsi salinan yang pandangan 3D
// sudah muat.

import { DEFAULTS as LASER_DEFAULTS, cleanFractions } from './tray.js';
import { cleanTree, gridToTree, layoutRegions } from './layout.js';

export const PRINT_DEFAULTS = {
  wallT: 1.6,          // dinding luar DAN pembahagi; 4 perimeter nozzle 0.4
  floorT: 1.6,
  fillet: 2,           // jejari bucu dalam petak; bucu luar = fillet + wallT
  stack: false,        // kaki terbenam supaya dulang boleh disusun
  stackClear: 0.3,     // kelonggaran kaki di dalam bukaan dulang bawah
  footH: 3,            // tinggi kaki
  minCellPrint: 8,     // petak paling kecil, mm - printer boleh lebih halus daripada laser
  printer: 'bambu-a1',
};

/** Katil cetak biasa, untuk amaran "tak muat" sahaja - bukan had keras. */
export const PRINTERS = [
  { id: 'bambu-a1mini', name: 'Bambu Lab A1 mini', x: 180, y: 180, z: 180 },
  { id: 'bambu-a1', name: 'Bambu Lab A1 / P1 / X1', x: 256, y: 256, z: 256 },
  { id: 'ender3', name: 'Creality Ender-3 / V3', x: 220, y: 220, z: 250 },
  { id: 'prusa-mk4', name: 'Prusa MK3 / MK4', x: 250, y: 210, z: 220 },
  { id: 'custom', name: 'Printer lain', x: 220, y: 220, z: 220 },
];

const SEG = 8;          // segmen setiap lengkung fillet
const EPS = 1e-9;
const PLA_G_PER_CM3 = 1.24;

const ringArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a / 2;
};

/** Buang titik berturutan yang sama (dan penutup yang berganda). */
function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 1e-7 || Math.abs(q[1] - p[1]) > 1e-7) out.push(p);
  }
  while (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) out.pop();
    else break;
  }
  return out;
}

/** Satu lengkung suku bulatan: SEG+1 titik dari a0 ke a0+90 darjah; satu titik bila r = 0. */
function arc(cx, cy, r, a0) {
  if (r < 1e-6) return [[cx, cy]];
  const out = [];
  for (let i = 0; i <= SEG; i++) {
    const a = a0 + (i / SEG) * (Math.PI / 2);
    // Bundarkan supaya titik yang sama dikira dua kali (oleh dua gelang) ialah
    // nombor yang SAMA, bukan 1e-16 berbeza - itulah yang menjadikan tepi
    // dikongsi dan bukan dua tepi hampir sama.
    out.push([Math.round((cx + Math.cos(a) * r) * 1e6) / 1e6, Math.round((cy + Math.sin(a) * r) * 1e6) / 1e6]);
  }
  return out;
}

/**
 * Segi empat berfillet sebagai gelang CCW DAN empat lengkungnya secara
 * berasingan (rujukan kepada titik yang sama), supaya rangka pembahagi boleh
 * dibina daripada lengkung yang betul-betul sama.
 * Susunan: BL (180->270), tepi bawah, BR (270->360), tepi kanan, TR (0->90),
 * tepi atas, TL (90->180), tepi kiri.
 */
function rrect(x0, y0, x1, y1, r) {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2 - 1e-6, (y1 - y0) / 2 - 1e-6));
  const BL = arc(x0 + rr, y0 + rr, rr, Math.PI);
  const BR = arc(x1 - rr, y0 + rr, rr, Math.PI * 1.5);
  const TR = arc(x1 - rr, y1 - rr, rr, 0);
  const TL = arc(x0 + rr, y1 - rr, rr, Math.PI / 2);
  return { pts: dedupe([...BL, ...BR, ...TR, ...TL]), BL, BR, TR, TL, r: rr, x0, y0, x1, y1 };
}

const rev = (a) => a.slice().reverse();

const R6 = (v) => Math.round(v * 1e6) / 1e6;

/**
 * Triangulasi satu jalur pembahagi: segi empat paksi-sejajar yang dua sisi
 * PANJANGNYA membawa banyak bucu kolinear (bucu dan titik tangen petak
 * bersebelahan, hujung pembahagi lain yang berhenti padanya).
 *
 * "Zip" antara dua sisi panjang itu: setiap segitiga ialah dua titik
 * berturutan pada satu sisi dan satu titik pada sisi bertentangan. Kedua-dua
 * sisi selari dan terpisah sejauh tebal pembahagi, jadi setiap segitiga ada
 * luas, setiap bucu digunakan, dan tiada tepi yang menyusuri sisi melintasi
 * bucu lain - dua perkara yang klip-telinga dan earcut tidak dapat jamin pada
 * input sedegenerat ini.
 *
 * Hujung pendek tidak pernah membawa bucu dalaman (ia berakhir pada dinding
 * atau pada sisi pembahagi lain, antara dua bucu petak); campak kalau ada,
 * supaya ujian menangkapnya dan bukan STL.
 */
function stripTriangles(s, pool) {
  const vertical = s.axis === 'x';
  // Koordinat tempatan: `al` sepanjang jalur, `ac` merentasnya.
  const al = (q) => (vertical ? q[1] : q[0]);
  const ac = (q) => (vertical ? q[0] : q[1]);
  const P = (along, across) => (vertical ? [across, along] : [along, across]);
  const side = (across) => {
    const m = new Map();
    for (const q of pool) if (ac(q) === across && al(q) >= s.from && al(q) <= s.to) m.set(`${q[0]},${q[1]}`, q);
    for (const q of [P(s.from, across), P(s.to, across)]) if (!m.has(`${q[0]},${q[1]}`)) m.set(`${q[0]},${q[1]}`, q);
    return [...m.values()].sort((a, b) => al(a) - al(b));
  };
  for (const q of pool) {
    const end = al(q) === s.from || al(q) === s.to;
    if (end && ac(q) > s.lo && ac(q) < s.hi) throw new Error('stripTriangles: bucu pada hujung pendek');
  }
  return zipChains(side(s.lo), side(s.hi), al);
}

/**
 * Zip dua rantai bucu pada dua garis selari, kedua-dua disusun mengikut
 * `al` (kedudukan sepanjang garis). Setiap segitiga: dua bucu berturutan
 * pada satu rantai + satu bucu pada rantai lain - jadi tiada yang merosot,
 * dan setiap tepi rantai muncul tepat sekali.
 */
function zipChains(A, B, al) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < A.length - 1 || j < B.length - 1) {
    if (j === B.length - 1 || (i < A.length - 1 && al(A[i + 1]) <= al(B[j + 1]))) {
      out.push([A[i], A[i + 1], B[j]]);
      i++;
    } else {
      out.push([A[i], B[j + 1], B[j]]);
      j++;
    }
  }
  return out;
}

/** Bina setiap segitiga untuk parameter yang diberi. `THREE` wajib. */
export function buildTray3D(input = {}, THREE) {
  if (!THREE || !THREE.ShapeUtils) throw new Error('buildTray3D perlukan three.js (ShapeUtils)');
  const p = { ...LASER_DEFAULTS, ...PRINT_DEFAULTS, ...input };
  const wallT = Math.min(6, Math.max(0.8, Number(p.wallT) || PRINT_DEFAULTS.wallT));
  const floorT = Math.min(6, Math.max(0.6, Number(p.floorT) || PRINT_DEFAULTS.floorT));
  const L = Math.max(wallT * 8, Number(p.length) || LASER_DEFAULTS.length);
  const W = Math.max(wallT * 8, Number(p.width) || LASER_DEFAULTS.width);
  const H = Math.max(floorT + 3, Number(p.height) || LASER_DEFAULTS.height);
  const minCell = Math.max(3, Number(p.minCellPrint) || PRINT_DEFAULTS.minCellPrint);
  const stack = Boolean(p.stack);
  const clear = Math.min(2, Math.max(0, Number(p.stackClear) || 0));
  const footH = stack ? Math.min(Math.max(1, Number(p.footH) || 3), (H - floorT) * 0.5) : 0;

  // ---- susun atur: pokok belahan ------------------------------------------
  // `layout` ialah pokok "belah petak sendiri" (geom/layout.js). Tanpanya,
  // grid mod laser (cols x rows) ditukar menjadi pokok, jadi reka bentuk lama
  // dan dulang yang baru bertukar mod tetap kelihatan sama.
  const innerL = L - 2 * wallT;
  const innerW = W - 2 * wallT;
  const tree = p.layout ? cleanTree(p.layout) : gridToTree(p.cols, p.rows);
  let lay = layoutRegions(tree, wallT, wallT, L - wallT, W - wallT, wallT, minCell);
  const gridOK = lay.ok;
  const warnings = [];
  // Petak terlalu kecil (dulang dikecilkan selepas dibelah): jasad dibina
  // tanpa pembahagi, dan pokok tetap disimpan - besarkan dulang semula dan
  // semua petak kembali.
  if (!gridOK) {
    warnings.push('petak');
    lay = layoutRegions({}, wallT, wallT, L - wallT, W - wallT, wallT, 0);
  }
  // Grid 1e-6 mm untuk SEMUA koordinat susun atur. Lengkung fillet sudah
  // dibundarkan ke grid ini; tanpa ini, titik tangen sesebuah petak dan bucu
  // segi empatnya boleh berbeza 1e-14 pada garis yang sepatutnya sama, dan
  // jalur pembahagi tidak akan berkongsi bucu dengan tepat.
  const cells = lay.cells.map((c) => ({ ...c, x: R6(c.x), y: R6(c.y), x1: R6(c.x1), y1: R6(c.y1) }))
    .map((c) => ({ ...c, w: c.x1 - c.x, h: c.y1 - c.y }));
  const segs = lay.segs.map((s) => ({ ...s, pos: R6(s.pos), lo: R6(s.lo), hi: R6(s.hi), from: R6(s.from), to: R6(s.to) }));

  // ---- paras ----------------------------------------------------------------
  const intH = H - floorT;
  const divFrac = Math.min(1, Math.max(0.2, (Number(p.dividerHeight) || 100) / 100));
  let Hd = floorT + intH * divFrac;
  let dividerClamped = false;
  // Dulang di atas berdiri dengan KAKINYA di dalam bukaan dulang ini, jadi
  // pembahagi mesti berhenti di bawah dasar kaki itu, atau ia duduk atas
  // pembahagi dan bukan atas rim.
  if (stack && Hd > H - footH - 0.3) {
    Hd = Math.max(floorT + 1, H - footH - 0.3);
    dividerClamped = true;
  }
  const hasDiv = cells.length > 1;
  // Tanpa pembahagi langsung, "tinggi pembahagi" tiada makna: bukaan ialah
  // satu petak dari lantai ke rim.
  if (!hasDiv) Hd = H;
  const flatTop = Hd >= H - 1e-6;

  // ---- fillet -------------------------------------------------------------
  // Satu jejari untuk SEMUA petak: dihadkan oleh petak paling kecil, supaya
  // dua petak sebaris sentiasa ada tepi lurus yang sejajar tepat (jalur rangka
  // antara keduanya ialah satu segi empat, bukan trapezium).
  const minDim = Math.min(...cells.map((c) => Math.min(c.w, c.h)));
  const r = Math.max(0, Math.min(Number(p.fillet) || 0, minDim / 2 - 0.05, 20));
  const rO = r > 1e-6 ? Math.min(r + wallT, Math.min(L, W) / 2 - 0.05) : 0;

  // ---- gelang ---------------------------------------------------------------
  const O = rrect(0, 0, L, W, rO);
  // Koordinat petak sempadan SAMA bit demi bit dengan dinding dalam (lihat
  // layoutRegions), jadi ujian "menyentuh dinding" boleh guna ===.
  const X0 = R6(wallT), Y0 = R6(wallT), X1 = R6(L - wallT), Y1 = R6(W - wallT);
  const C = cells.map((c) => rrect(c.x, c.y, c.x1, c.y1, r));

  // I: muka dalam dinding luar, dibina daripada petak sempadan supaya setiap
  // titik tangen dan setiap lengkung penjuru ialah bucu yang SAMA. Untuk
  // setiap dinding: petak yang menyentuhnya, disusun sepanjang dinding itu,
  // dan dua hujung tepi lurus masing-masing. Antara dua petak berturutan, I
  // melintasi hujung satu pembahagi.
  let I;
  let Icorners;
  {
    const on = (pred, key, desc) => C.filter(pred).sort((a, b) => (desc ? b[key] - a[key] : a[key] - b[key]));
    const bottom = on((c) => c.y0 === Y0, 'x0', false);
    const right = on((c) => c.x1 === X1, 'y0', false);
    const top = on((c) => c.y1 === Y1, 'x0', true);
    const left = on((c) => c.x0 === X0, 'y0', true);
    const last = (a) => a[a.length - 1];
    // Antara dua petak berturutan I melintasi hujung pembahagi. Bucu segi
    // empat kedua-dua petak dimasukkan sebagai bucu I juga: jalur pembahagi
    // berakhir tepat di situ, dan serpihan fillet di sebelahnya bermula di
    // situ, jadi tepi bawah muka dalam dinding mesti dipecahkan di titik yang
    // sama. Dengan fillet 0 bucu itu ialah titik tangen dan dedupe membuangnya.
    const pts = [];
    pts.push(...bottom[0].BL);
    bottom.forEach((c, i) => { if (i) pts.push([bottom[i - 1].x1, Y0], [c.x0, Y0]); pts.push(last(c.BL), c.BR[0]); });
    pts.push(...last(bottom).BR);
    right.forEach((c, i) => { if (i) pts.push([X1, right[i - 1].y1], [X1, c.y0]); pts.push(last(c.BR), c.TR[0]); });
    pts.push(...last(right).TR);
    top.forEach((c, i) => { if (i) pts.push([top[i - 1].x0, Y1], [c.x1, Y1]); pts.push(last(c.TR), c.TL[0]); });
    pts.push(...last(top).TL);
    left.forEach((c, i) => { if (i) pts.push([X0, left[i - 1].y0], [X0, c.y1]); pts.push(last(c.TL), c.BL[0]); });
    I = dedupe(pts);
    Icorners = { BL: bottom[0].BL, BR: last(bottom).BR, TR: last(right).TR, TL: last(top).TL };
  }
  const Frr = stack
    ? rrect(wallT + clear, wallT + clear, L - wallT - clear, W - wallT - clear, Math.max(0, r - clear))
    : null;
  const F = Frr ? Frr.pts : null;

  // ---- pengeluar segitiga -----------------------------------------------------
  const tris = [];
  let triCount = 0;
  const emit = (a, b, c) => {
    // Buang yang merosot (luas sifar) - earcut boleh keluarkannya pada titik
    // kolinear, dan slicer akan menandanya.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < EPS) return;
    tris.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    triCount++;
  };
  const V2 = (pt) => new THREE.Vector2(pt[0], pt[1]);

  /** Muka mendatar: `ring` tolak `holes`, pada paras z, normal ke atas (up) atau ke bawah. */
  const cap = (ring, holes, z, up) => {
    if (ringArea(ring) < EPS) return;
    const flat = [ring, ...holes].flat();
    const idx = THREE.ShapeUtils.triangulateShape(ring.map(V2), holes.map((h) => h.map(V2)));
    for (const [a, b, c] of idx) {
      const A = [flat[a][0], flat[a][1], z], B = [flat[b][0], flat[b][1], z], Cc = [flat[c][0], flat[c][1], z];
      // Orientasi earcut ikut gelang; betulkan mengikut normal yang dikehendaki.
      const cross = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]);
      if ((cross > 0) === up) emit(A, B, Cc); else emit(A, Cc, B);
    }
  };

  /** Satu segitiga mendatar pada z, normal ke atas (up) atau ke bawah. */
  const flat3 = (a, b, c, z, up = true) => {
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const A = [a[0], a[1], z], B = [b[0], b[1], z], Cc = [c[0], c[1], z];
    if ((cross > 0) === up) emit(A, B, Cc); else emit(A, Cc, B);
  };

  /**
   * Cincin mendatar antara segi empat berfillet luar `Or` dan gelang dalam
   * `inner` (dengan lengkung penjuru BL/BR/TR/TL dan bucu sisi sebanyak mana
   * pun) - bahagian atas dinding, dan anak tangga di atas kaki boleh susun.
   *
   * BUKAN earcut. Cincin ini dipecahkan kepada empat jalur lurus (sisi luar
   * dua bucu, sisi dalam sebanyak mana pun; dizip seperti jalur pembahagi)
   * dan empat sektor penjuru antara lengkung luar dan lengkung dalam yang
   * SEPUSAT (rO = fillet + dinding), dijalin kuad demi kuad. Dalam kedua-dua
   * bentuk setiap segitiga merentasi tebal dinding, jadi tiada yang nipis.
   * Earcut di sini pernah memilih kipas dari satu titik lengkung luar yang
   * kebetulan 0.00005 mm dari garis dinding dalam - sah dalam float64,
   * kolinear dalam float32, iaitu segitiga merosot dalam STL.
   */
  const ringFace = (Or, inner, z, up) => {
    const lastOf = (a) => a[a.length - 1];
    const ip = inner.pts;
    const ib = { x0: Math.min(...ip.map((q) => q[0])), x1: Math.max(...ip.map((q) => q[0])),
      y0: Math.min(...ip.map((q) => q[1])), y1: Math.max(...ip.map((q) => q[1])) };
    const byX = (a, b) => a[0] - b[0];
    const byY = (a, b) => a[1] - b[1];
    const bands = [
      [[lastOf(Or.BL), Or.BR[0]], ip.filter((q) => q[1] === ib.y0).sort(byX), (q) => q[0]],
      [[lastOf(Or.BR), Or.TR[0]], ip.filter((q) => q[0] === ib.x1).sort(byY), (q) => q[1]],
      [[Or.TL[0], lastOf(Or.TR)], ip.filter((q) => q[1] === ib.y1).sort(byX), (q) => q[0]],
      [[Or.BL[0], lastOf(Or.TL)], ip.filter((q) => q[0] === ib.x0).sort(byY), (q) => q[1]],
    ];
    for (const [A, B, al] of bands) {
      for (const [a, b, c] of zipChains(dedupe(A), B, al)) flat3(a, b, c, z, up);
    }
    for (const key of ['BL', 'BR', 'TR', 'TL']) {
      const oa = Or[key];
      const ia = inner[key];
      if (oa.length === 1) continue;            // fillet 0: penjuru ialah hujung jalur
      if (ia.length === 1) {                    // lengkung luar ke satu bucu dalam: kipas
        for (let i = 0; i < oa.length - 1; i++) flat3(ia[0], oa[i], oa[i + 1], z, up);
        continue;
      }
      for (let i = 0; i < oa.length - 1; i++) {
        flat3(ia[i], oa[i], oa[i + 1], z, up);
        flat3(ia[i], oa[i + 1], ia[i + 1], z, up);
      }
    }
  };

  /**
   * Dinding menegak sepanjang gelang CCW dari z0 ke z1. Untuk gelang LUAR
   * jasad, normal menghala keluar dengan berjalan ke hadapan; untuk gelang
   * LUBANG (poket), jasad berada di luar gelang, jadi dijalani terbalik
   * supaya normal menghala ke dalam lubang - iaitu keluar daripada jasad.
   */
  const side = (ring, z0, z1, isHole) => {
    if (z1 - z0 < EPS) return;
    const pts = isHole ? rev(ring) : ring;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const a0 = [a[0], a[1], z0], b0 = [b[0], b[1], z0], a1 = [a[0], a[1], z1], b1 = [b[0], b[1], z1];
      emit(a0, b0, b1);
      emit(a0, b1, a1);
    }
  };

  // ---- tapak, kaki, dinding luar ------------------------------------------------
  if (stack) {
    cap(F, [], 0, false);
    side(F, 0, footH, false);
    ringFace(O, Frr, footH, false);
    side(O.pts, footH, H, false);
  } else {
    cap(O.pts, [], 0, false);
    side(O.pts, 0, H, false);
  }

  // ---- atas: cincin, muka dalam, rangka pembahagi ---------------------------------
  ringFace(O, { pts: I, ...Icorners }, H, true);
  side(I, Hd, H, true);

  // Rangka pembahagi pada Hd = (dalam I) tolak (semua petak), diuraikan
  // mengikut struktur pokok dan BUKAN diberi kepada earcut sebagai satu
  // poligon besar berlubang. (Earcut menyambung lubang dengan sinar
  // mendatar; pada grid fillet-0 berpuluh bucu berkongsi y yang sama dan ia
  // menghasilkan tepi yang melintasi bucu lain - tepi terbuka dalam STL.)
  //
  //   * jalur  - setiap pembahagi ialah satu segi empat [lo, hi] x [from, to].
  //              Sisi-sisinya membawa setiap bucu yang terletak di atasnya
  //              (bucu dan titik tangen petak bersebelahan, hujung pembahagi
  //              lain yang berhenti padanya). Cembung, jadi klip-telinga pada
  //              bucu yang betul-betul cembung tidak boleh gagal.
  //   * serpih - setiap bucu petak berfillet yang tidak berada di penjuru
  //              dulang: kawasan antara lengkung dan bucu segi empat petak.
  //              Kipas dari bucu segi empat itu.
  //
  // Setiap jalur berakhir pada dinding atau pada sisi jalur lain, dan setiap
  // titik sempadan datang daripada set titik yang sama, jadi kepingan
  // bersebelahan berkongsi setiap tepi dengan tepat.
  {
    const K = (pt) => `${pt[0]},${pt[1]}`;
    const cand = new Map();
    const addPt = (pt) => { if (!cand.has(K(pt))) cand.set(K(pt), pt); };
    for (const c of C) {
      for (const pt of [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]]) addPt(pt);
      for (const arcPts of [c.BL, c.BR, c.TR, c.TL]) { addPt(arcPts[0]); addPt(arcPts[arcPts.length - 1]); }
    }
    const pool = [...cand.values()];
    for (const s of segs) {
      for (const [a, b, c] of stripTriangles(s, pool)) flat3(a, b, c, Hd);
    }
    if (r > 1e-9) {
      const isTrayCorner = (pt) => (pt[0] === X0 || pt[0] === X1) && (pt[1] === Y0 || pt[1] === Y1);
      for (const c of C) {
        for (const [corner, arcPts] of [[[c.x0, c.y0], c.BL], [[c.x1, c.y0], c.BR], [[c.x1, c.y1], c.TR], [[c.x0, c.y1], c.TL]]) {
          if (isTrayCorner(corner)) continue;
          for (let i = 0; i < arcPts.length - 1; i++) flat3(corner, arcPts[i], arcPts[i + 1], Hd);
        }
      }
    }
  }

  // ---- poket ----------------------------------------------------------------
  for (const c of C) {
    side(c.pts, floorT, Hd, true);
    cap(c.pts, [], floorT, true);
  }

  // ---- isi padu analitik dan anggaran berat -------------------------------------
  const aO = ringArea(O.pts);
  const aI = ringArea(I);
  const aCells = C.reduce((s, c) => s + ringArea(c.pts), 0);
  const aF = F ? ringArea(F) : 0;
  const volume = (stack ? aF * footH + aO * (H - footH) : aO * H)
    - aCells * (Hd - floorT) - aI * (H - Hd);
  const volumeCm3 = volume / 1000;
  // Dinding setebal 3-4 perimeter dan lantai 1.6 mm dicetak hampir pepejal,
  // jadi anggaran berat ialah isi padu x ketumpatan PLA; sedikit kurang untuk
  // lantai yang biasanya dapat infill.
  const gramsPLA = volumeCm3 * PLA_G_PER_CM3 * 0.92;

  const printer = PRINTERS.find((q) => q.id === p.printer) || PRINTERS[0];
  const bed = p.printer === 'custom'
    ? { x: Number(p.bedX) || printer.x, y: Number(p.bedY) || printer.y, z: Number(p.bedZ) || printer.z }
    : printer;
  // Muat sama ada terus atau dipusing 90 darjah atas katil.
  const fitsBed = (L <= bed.x + 1e-6 && W <= bed.y + 1e-6) || (W <= bed.x + 1e-6 && L <= bed.y + 1e-6);
  const fitsZ = H <= bed.z + 1e-6;
  if (!fitsBed || !fitsZ) warnings.push('katil');
  if (dividerClamped) warnings.push('susun');

  return {
    mode: 'cetak',
    params: {
      ...p, wallT, floorT, length: L, width: W, height: H,
      // Nama yang store/grid baca untuk kedua-dua mod: ketebalan pembahagi dan
      // petak minimum. Di sini pembahagi ialah dinding, bukan papan.
      thickness: wallT, minCell,
      cols: cleanFractions(p.cols), rows: cleanFractions(p.rows),
    },
    derived: {
      wallH: H, floorZ: 0, divBase: floorT, intH, divH: Hd - floorT, Hd, flatTop,
      divOK: hasDiv && gridOK, alih: false,
      innerL, innerW, cells, segs, gridOK,
      // Pokok yang dibina (bersih) dan saiz mm setiap nod - store perlukannya
      // untuk belah / buang / seret tanpa mengira semula.
      tree, layout: lay,
      dividers: {
        x: segs.filter((s) => s.axis === 'x').map((s, i) => ({ id: `divX${i + 1}`, x: s.pos })),
        y: segs.filter((s) => s.axis === 'y').map((s, j) => ({ id: `divY${j + 1}`, y: s.pos })),
      },
      r, rO, stack, footH, clear,
      volumeMm3: volume, volumeCm3, gramsPLA,
      triangles: triCount,
      bed, fitsBed, fitsZ, printerName: printer.name,
      dividerClamped,
      warnings,
      cellCount: cells.length,
      panelCount: 1,
    },
    rings: { O: O.pts, I, cells: C.map((c) => c.pts), F },
    mesh: new Float32Array(tris),
  };
}

/** Binari STL: pengepala 80 bait, kiraan segitiga, kemudian 50 bait setiap segitiga. */
export function trianglesToStl(tris, header = 'SifuLaser Tray Organizer') {
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
