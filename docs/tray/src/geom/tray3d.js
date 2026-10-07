// Penjana jasad untuk Tray Organizer versi CETAK 3D - satu cangkerang pepejal,
// bukan panel. Susun atur petak (lajur, baris, kedudukan pembahagi) dikongsi
// dengan versi laser melalui gridSizes() yang sama; yang berbeza ialah apa yang
// dibina daripadanya: dinding boleh senipis 3 perimeter nozzle, bucu berfillet,
// lantai pepejal, pilihan kaki boleh susun, dan output STL.
//
// SATU CANGKERANG MANIFOLD. Bambu Studio dan Orca menanda lencana amaran pada
// mesh yang ada tepi tidak dikongsi tepat dua segitiga, dan PrusaSlicer boleh
// menghiris salah. Jadi jasad ini TIDAK dibina sebagai kesatuan kotak-kotak
// bertindih (muka dalaman, muka sepalan). Ia dibina muka demi muka daripada
// poligon yang berkongsi BUCU YANG SAMA di setiap tepi bersama:
//
//   * O  - garis luar dulang (segi empat berfillet rO = fillet + dinding)
//   * I  - muka dalam dinding luar. Bucunya termasuk SETIAP titik tangen petak
//          sempadan, supaya tepi bawahnya pada paras Hd sepadan tepat dengan
//          tepi atas dinding poket di bawahnya dan tepi tampalan hujung
//          pembahagi di sebelahnya. Bucu I berkongsi lengkung dengan petak
//          penjuru, jadi tiada tampalan sifar-lebar di penjuru.
//   * C_k - setiap petak, segi empat berfillet r (SATU r untuk semua petak,
//          supaya tepi lurus dua petak bersebelahan sejajar tepat)
//   * F  - kaki boleh susun, I dikecilkan sebanyak kelonggaran
//
// Muka: tapak (F atau O, normal ke bawah) - dinding kaki - cincin anak tangga
// (O - F, ke bawah) - dinding luar O - cincin atas (O - I) pada H - muka dalam I
// dari Hd ke H - RANGKA pembahagi pada Hd - dinding poket setiap petak dari
// lantai ke Hd - lantai poket. Rangka pada Hd ialah bahagian yang rumit: ia
// dipecahkan kepada jalur antara dua petak bersebelahan, tampalan persilangan
// yang disempadani EMPAT lengkung fillet (dilalui terbalik, kerana tampalan di
// luar setiap petak), dan tampalan hujung pembahagi di dinding (dua lengkung +
// satu tepi I). Bila Hd = H, cincin atas dan rangka sepalan dan berkongsi tepi
// I - masih manifold, satu laluan kod sahaja.
//
// three.js hanya dipinjam untuk triangulatornya (ShapeUtils.triangulateShape,
// earcut di dalamnya - tiada titik Steiner ditambah, jadi bucu kekal milik
// gelang). Ia dihantar masuk, bukan diimport, supaya ujian node boleh beri
// terus dan halaman boleh kongsi salinan yang pandangan 3D sudah muat.

import { DEFAULTS as LASER_DEFAULTS, gridSizes, cleanFractions } from './tray.js';

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

  // ---- grid (dikongsi dengan versi laser) ---------------------------------
  const innerL = L - 2 * wallT;
  const innerW = W - 2 * wallT;
  const colsG = gridSizes(p.cols, innerL, wallT, minCell);
  const rowsG = gridSizes(p.rows, innerW, wallT, minCell);
  const colW = colsG.sizes;
  const rowD = rowsG.sizes;
  const nC = colW.length;
  const nR = rowD.length;
  const xDiv = [];
  const yDiv = [];
  const cells = [];
  {
    let y = wallT;
    for (let j = 0; j < nR; j++) {
      let x = wallT;
      for (let i = 0; i < nC; i++) {
        cells.push({ i, j, x, y, w: colW[i], h: rowD[j] });
        if (j === 0 && i < nC - 1) xDiv.push(x + colW[i] + wallT / 2);
        x += colW[i] + wallT;
      }
      if (j < nR - 1) yDiv.push(y + rowD[j] + wallT / 2);
      y += rowD[j] + wallT;
    }
  }
  const gridOK = colsG.ok && rowsG.ok;
  const warnings = [];
  if (!colsG.ok) warnings.push('lajur');
  if (!rowsG.ok) warnings.push('baris');

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
  const hasDiv = nC + nR > 2;
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
  const C = cells.map((c) => rrect(c.x, c.y, c.x + c.w, c.y + c.h, r));
  const cellAt = (i, j) => C[j * nC + i];

  // I: muka dalam dinding luar, dibina daripada petak sempadan supaya setiap
  // titik tangen dan setiap lengkung penjuru ialah bucu yang SAMA.
  let I;
  {
    const pts = [];
    pts.push(...cellAt(0, 0).BL);
    for (let i = 0; i < nC; i++) { const c = cellAt(i, 0); pts.push(c.BL[c.BL.length - 1], c.BR[0]); }
    pts.push(...cellAt(nC - 1, 0).BR);
    for (let j = 0; j < nR; j++) { const c = cellAt(nC - 1, j); pts.push(c.BR[c.BR.length - 1], c.TR[0]); }
    pts.push(...cellAt(nC - 1, nR - 1).TR);
    for (let i = nC - 1; i >= 0; i--) { const c = cellAt(i, nR - 1); pts.push(c.TR[c.TR.length - 1], c.TL[0]); }
    pts.push(...cellAt(0, nR - 1).TL);
    for (let j = nR - 1; j >= 0; j--) { const c = cellAt(0, j); pts.push(c.TL[c.TL.length - 1], c.BL[0]); }
    I = dedupe(pts);
  }
  const F = stack
    ? rrect(wallT + clear, wallT + clear, L - wallT - clear, W - wallT - clear, Math.max(0, r - clear)).pts
    : null;

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
    cap(O.pts, [F], footH, false);
    side(O.pts, footH, H, false);
  } else {
    cap(O.pts, [], 0, false);
    side(O.pts, 0, H, false);
  }

  // ---- atas: cincin, muka dalam, rangka pembahagi ---------------------------------
  cap(O.pts, [I], H, true);
  side(I, Hd, H, true);

  // Rangka pada Hd. Jalur antara jiran: tepi lurus dua petak sebaris sejajar
  // tepat kerana r sama, jadi jalur ialah satu segi empat yang tepinya ialah
  // tepi gelang kedua-dua petak itu.
  for (let j = 0; j < nR; j++) {
    for (let i = 0; i < nC - 1; i++) {
      const A = cellAt(i, j), B = cellAt(i + 1, j);
      cap([[A.x1, A.y0 + A.r], [B.x0, B.y0 + B.r], [B.x0, B.y1 - B.r], [A.x1, A.y1 - A.r]], [], Hd, true);
    }
  }
  for (let j = 0; j < nR - 1; j++) {
    for (let i = 0; i < nC; i++) {
      const A = cellAt(i, j), B = cellAt(i, j + 1);
      cap([[A.x0 + A.r, A.y1], [A.x1 - A.r, A.y1], [B.x1 - B.r, B.y0], [B.x0 + B.r, B.y0]], [], Hd, true);
    }
  }
  // Tampalan persilangan: empat lengkung, setiap satu terbalik (tampalan di
  // luar setiap petak), mengikut giliran CCW di sekeliling nod: bawah-kiri,
  // bawah-kanan, atas-kanan, atas-kiri.
  for (let j = 0; j < nR - 1; j++) {
    for (let i = 0; i < nC - 1; i++) {
      const A = cellAt(i, j), B = cellAt(i + 1, j), Cc = cellAt(i + 1, j + 1), D = cellAt(i, j + 1);
      cap(dedupe([...rev(A.TR), ...rev(B.TL), ...rev(Cc.BL), ...rev(D.BR)]), [], Hd, true);
    }
  }
  // Tampalan hujung pembahagi di dinding: dua lengkung terbalik dan satu tepi I.
  // Dengan r = 0 ia merosot kepada segmen dan cap() melangkaunya - tepi I itu
  // kemudian terus bersempadan dengan hujung jalur, yang memang sepadan.
  for (let i = 0; i < nC - 1; i++) {
    const A = cellAt(i, 0), B = cellAt(i + 1, 0);               // dinding depan
    cap(dedupe([...rev(A.BR), ...rev(B.BL)]), [], Hd, true);
    const A2 = cellAt(i, nR - 1), B2 = cellAt(i + 1, nR - 1);   // dinding belakang
    cap(dedupe([...rev(B2.TL), ...rev(A2.TR)]), [], Hd, true);
  }
  for (let j = 0; j < nR - 1; j++) {
    const A = cellAt(0, j), B = cellAt(0, j + 1);               // dinding kiri
    cap(dedupe([...rev(B.BL), ...rev(A.TL)]), [], Hd, true);
    const A2 = cellAt(nC - 1, j), B2 = cellAt(nC - 1, j + 1);   // dinding kanan
    cap(dedupe([...rev(A2.TR), ...rev(B2.BR)]), [], Hd, true);
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
      innerL, innerW, colW, rowD, xDiv, yDiv, cells, gridOK,
      dividers: {
        x: xDiv.map((x, i) => ({ id: `divX${i + 1}`, x })),
        y: yDiv.map((y, j) => ({ id: `divY${j + 1}`, y })),
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
