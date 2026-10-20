// Harga Plak Box, untuk pelanggan yang mahu order terus dari alat ini.
//
//   harga satu set = tapak cetak 3D + kotak akrilik
//
//   tapak   berat PLA anggaran x RM0.50 sesegram. Berat dikira seperti
//           slicer: kulit (2 dinding, 5 lapis atas, 3 lapis bawah - tetapan
//           "0.20mm Standard" Bambu Studio) penuh, bahagian dalam 10% infill.
//           Kulit diukur daripada mesh STL yang sama dengan yang dimuat turun:
//           setiap segitiga menghadap atas x tebal atas, menghadap bawah x tebal
//           bawah, menegak x tebal dinding.
//   kotak   enjin Kalkulator Laser Cut (../../lasercut/src/pricing.js) - tidak
//           disalin, diimport, supaya harga bahan, laju potong, kadar seminit,
//           markup dan caj minimum sentiasa sama dengan kalkulator itu. Lima
//           keping segi empat, saiz siap; masa potong setiap tepi dengan pecutan
//           mesin (segTime), masa gerak kosong antara keping mengikut susunan
//           helaian yang sama dengan fail potong.
//
// Julat yang ditunjuk -15% hingga +15% daripada jumlah, sama seperti
// Kalkulator Laser Cut: kedua-dua berat dan masa laser ialah anggaran, dan
// staff mengesahkan harga muktamad.
//
// Tulen: tiada DOM, diuji oleh scripts/test-plakbox.mjs.

import { quote, materialById, RANGE, fmtRM, fmtRMWhole } from '../../lasercut/src/pricing.js';
import { segTime, MOTION } from '../../lasercut/src/laser.js';
import { waUrl } from '../../lasercut/src/whatsapp.js';
import { nest, boxPieces, sheetDef, DEFAULT_SHEET } from './acrylic.js';

// Cetakan: Bambu Lab, "0.20mm Standard" (wall_loops 2, top_shell_layers 5,
// bottom_shell_layers 3, garisan 0.42 / 0.45 mm), infill 10% (Boss, 20 Okt 2026).
export const PRINT = {
  printer: 'Bambu Lab',
  infill: 0.10,
  wallMm: 0.42 + 0.45,        // dinding luar + dalam
  topMm: 5 * 0.2,
  bottomMm: 3 * 0.2,
  gPerCm3: 1.24,              // PLA
  filamentSenPerKg: 8000,     // RM80 sekilo - kos, untuk paparan sahaja
  senPerGram: 50,             // RM0.50 sesegram - harga jual (Boss, 20 Okt 2026)
};

// Akrilik kotak: Clear 2 mm dan 3 mm sahaja, seperti stok Kalkulator Laser Cut.
export const ACRYLIC_MATERIAL = { 2: 'acr2', 3: 'acr3' };

/**
 * Berat tapak anggaran, dalam gram, daripada mesh (Float32Array segitiga).
 * Pulangkan juga pecahannya supaya ringkasan boleh menunjukkannya.
 */
export function printGrams(mesh, volumeMm3, print = PRINT) {
  let up = 0, down = 0, side = 0;
  for (let i = 0; i < mesh.length; i += 9) {
    const ux = mesh[i + 3] - mesh[i], uy = mesh[i + 4] - mesh[i + 1], uz = mesh[i + 5] - mesh[i + 2];
    const vx = mesh[i + 6] - mesh[i], vy = mesh[i + 7] - mesh[i + 1], vz = mesh[i + 8] - mesh[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const twice = Math.hypot(nx, ny, nz);
    if (!(twice > 0)) continue;
    const a = twice / 2;
    const c = nz / twice;
    if (c > 0.7) up += a;
    else if (c < -0.7) down += a;
    else side += a;
  }
  const shell = Math.min(volumeMm3, up * print.topMm + down * print.bottomMm + side * print.wallMm);
  const inner = Math.max(0, volumeMm3 - shell);
  const printed = shell + inner * print.infill;
  return {
    grams: (printed / 1000) * print.gPerCm3,
    shellMm3: shell,
    innerMm3: inner,
    printedMm3: printed,
    solidGrams: (volumeMm3 / 1000) * print.gPerCm3,
  };
}

/**
 * Kerja laser untuk kotak akrilik, dalam bentuk yang quote() Kalkulator Laser
 * Cut terima: keping (saiz kotak, um) dan masa (saat) bagi bahan itu.
 */
export function acrylicJob(model, sheetId = DEFAULT_SHEET) {
  const matId = ACRYLIC_MATERIAL[model.params.acrylic];
  const material = materialById(matId);
  // Saiz siap, seperti yang Kalkulator Laser Cut kira daripada lukisan.
  const pieces = boxPieces(model, 0);
  let cut = 0;
  for (const pc of pieces) {
    // Empat tepi, setiap bucu 90 darjah - mesin brek di setiap satu.
    cut += 2 * segTime(pc.nominal.w, material.cutSpeed) + 2 * segTime(pc.nominal.h, material.cutSpeed);
  }
  // Gerak kosong: dari asal ke bucu setiap keping mengikut susunan helaian,
  // helaian demi helaian.
  let rapid = 0;
  for (const s of nest(pieces, sheetDef(sheetId))) {
    let at = [0, 0];
    for (const pl of s.placed) {
      rapid += segTime(Math.hypot(pl.x - at[0], pl.y - at[1]), MOTION.vmax);
      at = [pl.x, pl.y];
    }
  }
  return {
    material,
    pieces: pieces.map((pc) => ({ wUm: Math.round(pc.nominal.w * 1000), hUm: Math.round(pc.nominal.h * 1000) })),
    laser: { cutSec: { [matId]: cut }, scoreSec: 0, engraveSec: 0, rapidSec: rapid },
  };
}

/**
 * Sebut harga penuh satu Plak Box x kuantiti. `qty` integer >= 1.
 * Semua yang skrin dan mesej WhatsApp tunjuk datang dari objek ini.
 */
export function plakQuote(model, { qty = 1, sheet = DEFAULT_SHEET } = {}) {
  const n = Math.max(1, Math.floor(Number(qty)) || 1);
  const job = acrylicJob(model, sheet);
  const acr = quote(job.pieces, job.laser, job.material.id, String(n));
  // Dalam LIMITS setiap keping muat katil laser (diuji), tetapi kalau tidak,
  // jangan tunjuk harga separuh: staff yang sebut harga.
  if (acr.state !== 'priced') return { state: acr.state, qty: n, acrylic: acr };
  const body = model.bodies[0];
  const w = printGrams(body.mesh, body.volumeMm3);
  const baseSetSen = Math.round(w.grams * PRINT.senPerGram);
  const baseSen = baseSetSen * n;
  const raw = acr.totalSen + baseSen;
  const totalSen = Math.floor(raw / 10 + 0.5) * 10;
  const lowSen = Math.floor((totalSen * (1 - RANGE)) / 100) * 100;
  const highSen = Math.ceil((totalSen * (1 + RANGE)) / 100) * 100;
  return {
    state: 'priced',
    qty: n,
    grams: w.grams,
    weight: w,
    baseSetSen,
    baseSen,
    baseText: fmtRM(baseSen),
    filamentCostSen: Math.round((w.grams / 1000) * PRINT.filamentSenPerKg) * n,
    acrylic: acr,
    acrylicSen: acr.totalSen,
    acrylicText: fmtRM(acr.totalSen),
    totalSen,
    totalText: fmtRM(totalSen),
    perSetText: fmtRM(totalSen / n),
    lowSen,
    highSen,
    rangeText: lowSen === highSen ? fmtRMWhole(lowSen) : `${fmtRMWhole(lowSen)} - ${fmtRMWhole(highSen)}`,
  };
}

const TYPE_NAMES = {
  standard: 'Standard', serong: 'Serong', klasik: 'Klasik', tingkat: 'Dua Tingkat', slot: 'Dua Tingkat Slot',
};
const r1 = (v) => Math.round(v * 10) / 10;

/** Mesej order ke WhatsApp kedai, daripada sebut harga yang sama dengan skrin. */
export function orderMessage(model, q, { color = '' } = {}) {
  const p = model.params;
  const d = model.derived;
  const priced = q.state === 'priced';
  const lines = [
    'Salam, saya nak order Plak Box.',
    `Plak: ${r1(p.plakL)} x ${r1(p.plakW)} x ${r1(p.plakH)} mm${d.slot ? ` (plak akrilik ${p.sheetT} mm, dalam slot)` : ''}`,
    `Tapak: ${TYPE_NAMES[p.type] || p.type}, ${r1(d.baseL)} x ${r1(d.baseW)} x ${r1(p.baseH)} mm`
      + `${color ? `, warna ${color}` : ''} (cetak 3D)`,
    `Kotak akrilik: Clear ${p.acrylic} mm, ${r1(d.coverOutL)} x ${r1(d.coverOutW)} x ${r1(d.coverH)} mm`,
    `Kuantiti: ${q.qty} set`,
    // Satu harga tepat, sama dengan skrin; tiada pecahan tapak / akrilik
    // (Boss, 20 Okt 2026). Pecahan masih dalam objek sebut harga untuk ujian.
    priced ? `Harga: ${q.totalText}`
      : 'Mohon sebut harga untuk saiz ini.',
  ];
  if (priced) lines.push('Harga untuk tapak dan kotak akrilik, tidak termasuk plak.');
  // Barang akrilik mudah pecah dalam pos: ambil sendiri sahaja (Boss, 20 Okt 2026).
  lines.push('Ambil sendiri di Shah Alam.');
  return lines.join('\n');
}

export const orderUrl = (model, q, opts) => waUrl(orderMessage(model, q, opts));
