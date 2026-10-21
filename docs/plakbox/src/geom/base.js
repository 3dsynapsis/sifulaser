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
//   * BIBIR (`rim`): permukaan atas rata di luar alur.
//
// Kotak akrilik itu tiada tanggam: kepingan segi empat dicantum hujung ke
// hujung dan sambungannya ditutup selotip (tiada chloroform). Jadi saiz setiap
// keping ditentukan oleh siapa menindih siapa:
//
//   * ATAS            panjang luar x lebar luar - duduk di atas keempat-empat dinding
//   * DEPAN, BELAKANG panjang luar x (tinggi kotak - t)
//   * KIRI, KANAN     (lebar luar - 2t) x (tinggi kotak - t) - masuk di antara depan dan belakang
//
// JENIS TAPAK. Rupa tepi tapak ialah PROFIL: senarai titik (o, z) dari bawah ke
// atas, `o` ialah jarak ke luar dari tepi permukaan atas (negatif = ke dalam).
// Empat jenis, setiap satu hanya satu profil yang berbeza:
//
//   standard  blok, dengan tingkat kecil di tepi atas
//   serong    sisi condong, lebar di bawah; semua sisi atau depan sahaja
//   klasik    lengkung S (ogee) di tepi atas - profil tapak trofi tradisional
//   tingkat   dua tingkat: tingkat bawah lebar (ruang plat nama), atas kecil
//   slot      dua tingkat juga, tetapi plaknya sekeping akrilik (biasanya 5 mm)
//             yang dicucuk terus ke dalam SLOT di tengah tapak, dalam kotak
//             akrilik yang sama
//
// SLOT. Lubang segi empat tegak, tepat di tengah permukaan atas (dan di
// tengah tapak - profil simetri), panjang plak + 2 x kelonggaran, tebal plak
// + 2 x kelonggaran, dalam `slotDepth`. Ia menggantikan poket: plak sekeping
// tiada tapak sendiri, slot itulah yang memegangnya tegak. Bagi jenis ini
// "lebar plak" (plakW) ialah RUANG depan-belakang yang plak itu berdiri di
// tengahnya, jadi kotak akrilik dikira tepat seperti jenis lain. Slot ialah
// satu lagi sel dalam medan tinggi - dinding tegak, tiada geometri khas.
//
// BOLEH DICETAK TANPA SUPPORT. Setiap profil mengecil ke atas (o menurun bila
// z naik), jadi setiap permukaan sisi menghadap ke atas atau tegak - tidak
// pernah perlu support. scripts/test-plakbox.mjs menyemak setiap segitiga
// yang menghadap ke bawah.
//
// (Jenis "Terapung" - papan dengan kaki tersorok - pernah ada dan dibuang
// pada 16 Oktober 2026: pada kotak akrilik yang tinggi, tapak yang menyempit
// di bawah dirasakan tidak stabil.)
//
// GEOMETRI. Jasad = permukaan atas + kulit sisi + muka bawah:
//   * permukaan atas: MEDAN TINGGI atas grid segi empat tak seragam (garisan
//     grid di setiap tepi alur dan poket, satu tinggi bagi setiap sel);
//   * kulit sisi: satu CINCIN bagi setiap titik profil, setiap cincin membawa
//     titik bahagi yang SAMA dengan sempadan grid atas, dan cincin berturutan
//     dijahit dengan segi empat;
//   * muka bawah: grid yang sama, dipetakan ke cincin paling bawah.
// Tiada CSG, tiada earcut: setiap sisi dikongsi oleh tepat dua segitiga.
//
// MOD TAPAK. `baseMode` 'print' (cetak 3D, di atas) atau 'laser': tapak yang
// sama dibina daripada LAPISAN papan (MDF, plywood, akrilik hitam) yang
// dipotong laser dan dilekat bertindan - cara tapak ini dibuat sebelum ada
// printer. Setiap tinggi (tapak, alur, poket, slot, tingkat) dibundarkan ke
// gandaan tebal papan, supaya geometri yang dikira ialah yang benar-benar
// terhasil bila lapisan ditindan. Lapisan itu sendiri: geom/layers.js.
//
// Modul ini TULEN: tiada DOM; satu import, geom/layers.js, juga tulen.
// Diuji dalam node (scripts/test-plakbox.mjs).

import { laserLayers } from './layers.js';

export const BASE_TYPES = [
  { id: 'standard', name: 'Standard', note: 'Blok, tingkat kecil di tepi atas', baseH: 25 },
  { id: 'serong', name: 'Serong', note: 'Sisi condong, lebar di bawah', baseH: 25 },
  { id: 'klasik', name: 'Klasik', note: 'Lengkung S (ogee) di tepi atas', baseH: 25 },
  { id: 'tingkat', name: 'Dua Tingkat', note: 'Tingkat bawah untuk plat nama', baseH: 34 },
  { id: 'slot', name: 'Dua Tingkat Slot', note: 'Plak akrilik sekeping dicucuk terus ke slot di tengah', baseH: 34 },
];

export const DEFAULTS = {
  // Plak yang dimasukkan, termasuk tapaknya sendiri (mm).
  plakL: 230,
  plakW: 80,
  plakH: 310,
  // Kotak akrilik.
  acrylic: 3,
  gap: 10,       // ruang antara plak dan dinding akrilik, setiap sisi
  gapTop: 10,    // ruang antara puncak plak dan bumbung akrilik
  // Tapak, semua jenis.
  type: 'standard',
  baseH: 25,
  rim: 8,        // bibir rata di luar alur, diukur dari tepi permukaan atas
  grooveDepth: 4,
  grooveClear: 0.4,
  pocket: true,
  pocketDepth: 2,
  pocketClear: 0.5,
  // standard
  stepW: 4,
  stepH: 4,
  // serong
  slantAngle: 12,    // darjah dari tegak
  slantFrontOnly: false,
  // klasik
  ogeeR: 4,
  // tingkat
  tierInset: 10,
  tierRatio: 45,     // % tinggi tapak untuk tingkat bawah
  tierChamfer: 1.5,
  // slot: plak sekeping (plakL x plakH, setebal sheetT) dicucuk terus
  sheetT: 5,
  slotDepth: 12,
  slotClear: 0.25,   // setiap sisi; akrilik potong laser + PLA = muat ketat
  // Mod tapak: 'print' cetak 3D (STL) atau 'laser' lapisan papan (SVG/PDF).
  baseMode: 'print',
  board: 'mdf3',     // papan tapak laser - lihat BOARDS
  boardT: 3,         // tebal SEBENAR papan itu (diukur), mm
};

/**
 * Papan untuk tapak potong laser. `laserId` ialah bahan dalam Kalkulator Laser
 * Cut (harga dan laju potong); `t` tebal nominal; `kerf` lalai fail potong.
 */
export const BOARDS = [
  { id: 'mdf3', name: 'MDF 3mm', t: 3, kerf: 0.2, color: '#b48a5e', laserId: 'mdf3' },
  { id: 'mdf5', name: 'MDF 5mm', t: 5, kerf: 0.25, color: '#b48a5e', laserId: 'mdf5' },
  { id: 'ply3', name: 'Plywood 3mm', t: 3, kerf: 0.2, color: '#d8b98c', laserId: 'ply3' },
  { id: 'ply5', name: 'Plywood 5mm', t: 5, kerf: 0.25, color: '#d8b98c', laserId: 'ply5' },
  { id: 'blk3', name: 'Akrilik Hitam 3mm', t: 3, kerf: 0.15, color: '#1f1f22', laserId: 'blk3' },
];
export const boardOf = (id) => BOARDS.find((b) => b.id === id) || BOARDS[0];

export const LIMITS = {
  plakL: [30, 600],
  plakW: [10, 300],
  plakH: [30, 800],
  acrylic: [2, 3],     // Clear 2 mm dan 3 mm sahaja (Boss, 20 Okt 2026)
  gap: [2, 60],
  gapTop: [0, 80],
  baseH: [8, 80],
  rim: [3, 60],
  grooveDepth: [1, 20],
  grooveClear: [0, 1.5],
  pocketDepth: [0.5, 10],
  pocketClear: [0, 3],
  stepW: [0, 30],
  stepH: [0, 30],
  slantAngle: [3, 30],
  ogeeR: [1.5, 12],
  tierInset: [3, 40],
  tierRatio: [25, 75],
  tierChamfer: [0, 5],
  sheetT: [2, 12],
  slotDepth: [3, 40],
  slotClear: [0, 1],
  boardT: [1.5, 12],
};

const PLA_G_PER_CM3 = 1.24;
/** Tebal akrilik kotak yang ditawarkan, mm: Clear 2 dan 3, seperti stok Kalkulator Laser Cut. */
export const ACRYLIC_OPTIONS = [2, 3];
const R6 = (v) => Math.round(v * 1e6) / 1e6;
const DEG = Math.PI / 180;

/** Parameter yang selamat: nombor, dalam had, dan konsisten antara satu sama lain. */
export function cleanParams(input = {}) {
  const r = cleanBase(input || {});
  if (r.p.baseMode === 'laser') laserQuantize(r.p, r.notes);
  return r;
}

const layersOf = (v, T) => Math.round(v / T + 1e-9);

/**
 * Tapak laser: setiap tinggi kepada gandaan tebal papan, dan setiap ciri
 * sekurang-kurangnya satu lapisan dengan satu lapisan pepejal di bawahnya.
 * Lengkung dan serong tepi tingkat tiada pada papan yang dipotong tegak.
 */
function laserQuantize(p, notes) {
  const T = p.boardT;
  const N = Math.round(p.baseH / T);
  const at = (k) => R6(k * T);
  const clampL = (v, lo, hi) => Math.min(hi, Math.max(lo, layersOf(v, T)));
  p.grooveDepth = at(clampL(p.grooveDepth, 1, N - 1));
  if (p.pocket) p.pocketDepth = at(clampL(p.pocketDepth, 1, N - 1));
  if (p.type === 'slot') p.slotDepth = at(clampL(p.slotDepth, 1, N - 1));
  if (p.type === 'standard' && p.stepH > 0) p.stepH = at(clampL(p.stepH, 1, N - 1));
  if (p.type === 'tingkat' || p.type === 'slot') {
    // Tingkat bawah: lapisan bulat, dengan tingkat atas cukup untuk alur + satu.
    const g = layersOf(p.grooveDepth, T);
    const k = Math.max(1, Math.min(N - g - 1, Math.round((N * p.tierRatio) / 100)));
    p.tierRatio = R6((k / N) * 100);
    p.tierChamfer = 0;
  }
}

function cleanBase(input) {
  const p = {};
  for (const [k, def] of Object.entries(DEFAULTS)) {
    if (typeof def === 'boolean') { p[k] = input[k] == null ? def : !!input[k]; continue; }
    if (typeof def === 'string') continue;
    const v = Number(input[k]);
    const [lo, hi] = LIMITS[k];
    p[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
  }
  p.type = BASE_TYPES.some((t) => t.id === input.type) ? input.type : DEFAULTS.type;
  p.baseMode = input.baseMode === 'laser' ? 'laser' : 'print';
  p.board = BOARDS.some((b) => b.id === input.board) ? input.board : DEFAULTS.board;
  const notes = [];
  // Tapak laser: tinggi = bilangan lapisan bulat x tebal papan, sekurang-
  // kurangnya dua lapisan (satu lantai, satu untuk alur). Lantai di bawah
  // setiap ciri ialah satu lapisan, bukan 3 mm.
  const laser = p.baseMode === 'laser';
  const T = p.boardT;
  if (laser) {
    const N = Math.max(2, Math.min(Math.floor(LIMITS.baseH[1] / T), layersOf(p.baseH, T)));
    p.baseH = R6(N * T);
  }
  const floor = laser ? T : 3;

  // Kotak akrilik hanya ditawarkan dalam dua tebal. Reka bentuk lama yang
  // tersimpan dengan tebal lain dibawa ke yang terdekat, dan diberitahu.
  const askedT = Number(input.acrylic);
  p.acrylic = p.acrylic < 2.5 ? 2 : 3;
  if (Number.isFinite(askedT) && !ACRYLIC_OPTIONS.includes(askedT)) {
    notes.push(`Akrilik ${askedT} mm tidak ditawarkan - kotak dikira dengan ${p.acrylic} mm (pilihan: 2 atau 3 mm).`);
  }

  if (p.grooveDepth > p.baseH - floor) {
    p.grooveDepth = R6(Math.max(1, p.baseH - floor));
    notes.push(`Alur dihadkan ${p.grooveDepth} mm supaya lantai di bawahnya kekal ${floor} mm.`);
  }
  if (p.pocketDepth > p.baseH - (laser ? T : 2)) p.pocketDepth = R6(Math.max(0.5, p.baseH - (laser ? T : 2)));

  if (p.type === 'standard') {
    if (p.stepH > p.baseH - floor) p.stepH = R6(p.baseH - floor);
    if (!(p.stepW > 0) || !(p.stepH > 0)) { p.stepW = 0; p.stepH = 0; }
  }
  if (p.type === 'klasik' && 2 * p.ogeeR > p.baseH - floor) {
    p.ogeeR = R6((p.baseH - floor) / 2);
    notes.push(`Lengkung klasik dihadkan ${p.ogeeR} mm supaya tepi tegak di bawahnya kekal 3 mm.`);
  }
  if (p.type === 'tingkat' || p.type === 'slot') {
    const h1 = (p.baseH * p.tierRatio) / 100;
    if (p.baseH - h1 < p.grooveDepth + floor) {
      const fit = ((p.baseH - p.grooveDepth - floor) / p.baseH) * 100;
      p.tierRatio = R6(Math.max(LIMITS.tierRatio[0], fit));
      notes.push(`Tingkat bawah dikecilkan ke ${Math.round(p.tierRatio)}% supaya tingkat atas cukup tebal untuk alur.`);
    }
    const h1b = (p.baseH * p.tierRatio) / 100;
    p.tierChamfer = R6(Math.min(p.tierChamfer, p.tierInset - 1, h1b / 2, (p.baseH - h1b) / 3));
    if (p.tierChamfer < 0.2) p.tierChamfer = 0;
  }

  if (p.type === 'slot') {
    p.pocket = false; // slot menggantikan poket
    if (p.slotDepth > p.baseH - floor) {
      p.slotDepth = R6(Math.max(Math.min(LIMITS.slotDepth[0], p.baseH - floor), p.baseH - floor));
      notes.push(`Slot dihadkan ${p.slotDepth} mm dalam supaya lantai di bawahnya kekal ${floor} mm.`);
    }
    // Plak mesti muat dalam ruangnya, dengan 3 mm di depan dan belakang.
    const minW = R6(p.sheetT + 2 * p.slotClear + 6);
    if (p.plakW < minW) {
      p.plakW = minW;
      notes.push(`Ruang plak dinaikkan ke ${minW} mm supaya slot muat di dalamnya.`);
    }
    // Hujung slot dan dinding dalam alur: sekurang-kurangnya 1.5 mm bahan.
    const minGap = R6(p.grooveClear + p.slotClear + 1.5);
    if (p.gap < minGap) {
      p.gap = minGap;
      notes.push(`Ruang di keliling plak dinaikkan ke ${minGap} mm supaya dinding antara slot dan alur kekal 1.5 mm.`);
    }
    return { p, notes };
  }

  // Dinding antara alur dan poket.
  const wall = p.gap - p.grooveClear - (p.pocket ? p.pocketClear : 0);
  if (p.pocket && wall < 1.5) {
    p.pocket = false;
    notes.push('Poket dibuang: ruang plak terlalu sempit untuk dinding antara poket dan alur.');
  }
  return { p, notes };
}

const U = (o, z) => ({ z, o: { l: o, r: o, f: o, b: o } });

/**
 * Profil tepi jasad utama, dari bawah ke atas. Titik terakhir sentiasa o = 0
 * pada z = tinggi jasad (tepi permukaan atas).
 */
export function profileOf(p) {
  const H = p.baseH;
  switch (p.type) {
    case 'serong': {
      const s = R6(H * Math.tan(p.slantAngle * DEG));
      if (p.slantFrontOnly) return [{ z: 0, o: { l: 0, r: 0, f: s, b: 0 } }, U(0, H)];
      return [U(s, 0), U(0, H)];
    }
    case 'klasik': {
      // Ogee Rom: lengkung cekung (cove) dari sisi, kemudian lengkung cembung
      // (bead) yang bertemu permukaan atas secara mendatar. Kedua-duanya
      // berundur ke dalam bila naik, jadi tiada yang tergantung.
      const r = p.ogeeR, W = 2 * r, z0 = H - 2 * r, N = 8;
      const pts = [U(W, 0), U(W, z0)];
      for (let k = 1; k <= N; k++) {
        const th = (-90 - (90 * k) / N) * DEG;
        pts.push(U(R6(W + r * Math.cos(th)), R6(z0 + r + r * Math.sin(th))));
      }
      for (let k = 1; k <= N; k++) {
        const ph = ((90 * k) / N) * DEG;
        pts.push(U(R6(r * Math.cos(ph)), R6(z0 + r + r * Math.sin(ph))));
      }
      pts[pts.length - 1] = U(0, H);
      return pts;
    }
    case 'tingkat':
    case 'slot': {
      const t = p.tierInset, c = p.tierChamfer, h1 = R6((H * p.tierRatio) / 100);
      if (!(c > 0)) return [U(t, 0), U(t, h1), U(0, h1), U(0, H)];
      return [U(t + c, 0), U(t + c, h1 - c), U(t, h1), U(c, h1), U(c, H - c), U(0, H)];
    }
    default: {
      const s = p.stepW, h = p.stepH;
      if (!(s > 0 && h > 0)) return [U(0, 0), U(0, H)];
      return [U(s, 0), U(s, H - h), U(0, H - h), U(0, H)];
    }
  }
}

/** Semua ukuran yang diterbitkan, dalam mm. Paksi: x kiri-kanan, y depan-belakang, z ke atas. */
export function derive(p) {
  const t = p.acrylic;
  const c = p.grooveClear;
  const coverInL = p.plakL + 2 * p.gap;
  const coverInW = p.plakW + 2 * p.gap;
  const coverOutL = coverInL + 2 * t;
  const coverOutW = coverInW + 2 * t;
  const topL = coverOutL + 2 * c + 2 * p.rim;
  const topW = coverOutW + 2 * c + 2 * p.rim;

  // Tapak bermula di x = y = 0: anjak permukaan atas sejauh profil terkeluar.
  const profile = profileOf(p);
  const out = { l: 0, r: 0, f: 0, b: 0 };
  for (const q of profile) for (const k of Object.keys(out)) out[k] = Math.max(out[k], q.o[k]);
  // Dibundarkan sekali di sini: grid permukaan atas, cincin sisi dan muka
  // bawah semuanya membaca bucu ini, dan mesti mendapat nombor yang SAMA tepat
  // - beza 1e-6 sudah cukup untuk slicer melihat sisi terbuka.
  const ox = R6(out.l), oy = R6(out.f);
  const top = { x0: ox, y0: oy, x1: R6(ox + topL), y1: R6(oy + topW) };
  const baseL = R6(top.x1 + out.r);
  const baseW = R6(top.y1 + out.b);

  const groove = { x0: top.x0 + p.rim, y0: top.y0 + p.rim, x1: top.x1 - p.rim, y1: top.y1 - p.rim };
  const grooveIn = { x0: groove.x0 + t + 2 * c, y0: groove.y0 + t + 2 * c, x1: groove.x1 - t - 2 * c, y1: groove.y1 - t - 2 * c };
  const cover = { x0: groove.x0 + c, y0: groove.y0 + c, x1: groove.x1 - c, y1: groove.y1 - c };
  const plak = { x0: cover.x0 + t + p.gap, y0: cover.y0 + t + p.gap, x1: cover.x1 - t - p.gap, y1: cover.y1 - t - p.gap };
  const pocket = p.pocket
    ? { x0: plak.x0 - p.pocketClear, y0: plak.y0 - p.pocketClear, x1: plak.x1 + p.pocketClear, y1: plak.y1 + p.pocketClear }
    : null;

  // Slot: tepat di tengah permukaan atas. Plak sekeping berdiri di lantainya.
  let slot = null, sheet = null;
  if (p.type === 'slot') {
    const cx = (top.x0 + top.x1) / 2, cy = (top.y0 + top.y1) / 2;
    const hl = p.plakL / 2, ht = p.sheetT / 2, sc = p.slotClear;
    slot = { x0: R6(cx - hl - sc), x1: R6(cx + hl + sc), y0: R6(cy - ht - sc), y1: R6(cy + ht + sc), depth: p.slotDepth };
    sheet = { x0: R6(cx - hl), x1: R6(cx + hl), y0: R6(cy - ht), y1: R6(cy + ht) };
  }

  const plakZ = p.baseH - (p.pocket ? p.pocketDepth : 0) - (slot ? p.slotDepth : 0);
  const coverZ = p.baseH - p.grooveDepth;              // dinding akrilik berdiri di dasar alur
  const coverTop = plakZ + p.plakH + p.gapTop + t;     // muka atas bumbung
  const coverH = coverTop - coverZ;

  // Plak bertapak berdiri di poket; plak sekeping di lantai slot.
  const panels = [
    { id: 'atas', name: 'Atas', w: coverOutL, h: coverOutW, qty: 1 },
    { id: 'depan', name: 'Depan & Belakang', w: coverOutL, h: coverH - t, qty: 2 },
    { id: 'sisi', name: 'Kiri & Kanan', w: coverOutW - 2 * t, h: coverH - t, qty: 2 },
  ].map((q) => ({ ...q, w: R6(q.w), h: R6(q.h) }));

  // Selotip: empat bucu tegak dan empat tepi bumbung.
  const tape = 4 * (coverH - t) + 2 * coverOutL + 2 * coverOutW;

  // Ruang plat nama pada muka depan tingkat bawah (Dua Tingkat sahaja).
  const namePlate = p.type === 'tingkat' || p.type === 'slot'
    ? { w: R6(baseL - 2 * p.tierChamfer), h: R6((p.baseH * p.tierRatio) / 100 - p.tierChamfer) }
    : null;

  return {
    t, baseL, baseW, top, groove, grooveIn, cover, plak, pocket, slot, sheet, plakZ, coverZ, coverTop, coverH,
    coverOutL, coverOutW, coverInL, coverInW, panels, tape, profile, namePlate,
    totalH: coverTop,
  };
}

const uniqSorted = (vals) => {
  const s = [...new Set(vals.map(R6))].sort((a, b) => a - b);
  return s.filter((v, i) => i === 0 || v - s[i - 1] > 1e-6);
};

/**
 * Satu jasad tertutup: permukaan atas medan tinggi `H` atas grid xs x ys
 * (yang meliputi segi empat `top` tepat), kulit sisi mengikut `profile`, dan
 * muka bawah pada z = 0. Sel di sempadan grid mesti berada pada tinggi penuh
 * `Htop` (bibir) - tiada dinding di tepi permukaan atas; kulit sisi yang
 * menyambungnya. Pulangkan segitiga (9 nombor setiap satu), normal ke luar.
 *
 * Tepi TEGAK dalam permukaan atas (dinding alur dan poket) dipecah pada SEMUA
 * paras yang wujud di bucu grid itu, supaya setiap segmen tegak dikongsi tepat
 * dua muka - bukan simpang-T yang slicer laporkan sebagai "non-manifold".
 */
export function buildBody(top, xs, ys, H, Htop, profile) {
  const out = [];
  const push = (...pts) => { for (const q of pts) out.push(R6(q[0]), R6(q[1]), R6(q[2])); };
  const tri = (a, b, c, nx, ny, nz) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz < 0) push(a, c, b); else push(a, b, c);
  };
  const n = xs.length - 1;
  const m = ys.length - 1;

  // ---- permukaan atas
  const h = (i, j) => (i >= 0 && i < n && j >= 0 && j < m ? H[i][j] : Htop);
  const levels = (i, j) => uniqSorted([h(i - 1, j - 1), h(i, j - 1), h(i - 1, j), h(i, j)]);
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
      tri([xs[i], ys[j], z], [xs[i + 1], ys[j], z], [xs[i + 1], ys[j + 1], z], 0, 0, 1);
      tri([xs[i], ys[j], z], [xs[i + 1], ys[j + 1], z], [xs[i], ys[j + 1], z], 0, 0, 1);
    }
  }
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const hl = h(i - 1, j), hr = h(i, j);
      if (hl === hr) continue;
      const lo = Math.min(hl, hr), hi = Math.max(hl, hr);
      zip(levels(i, j).filter((z) => z >= lo && z <= hi), levels(i, j + 1).filter((z) => z >= lo && z <= hi),
        [xs[i], ys[j]], [xs[i], ys[j + 1]], [hl > hr ? 1 : -1, 0, 0]);
    }
  }
  for (let j = 1; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const hb = h(i, j - 1), ha = h(i, j);
      if (hb === ha) continue;
      const lo = Math.min(hb, ha), hi = Math.max(hb, ha);
      zip(levels(i, j).filter((z) => z >= lo && z <= hi), levels(i + 1, j).filter((z) => z >= lo && z <= hi),
        [xs[i], ys[j]], [xs[i + 1], ys[j]], [0, hb > ha ? 1 : -1, 0]);
    }
  }

  // ---- kulit sisi: satu cincin bagi setiap titik profil (atas ke bawah)
  const mapper = (o) => {
    const X0 = top.x0 - o.l, X1 = top.x1 + o.r, Y0 = top.y0 - o.f, Y1 = top.y1 + o.b;
    // Hujung dipetakan terus ke bucu cincin, bukan melalui nisbah - supaya
    // bucu dalam senarai grid sama tepat dengan bucu sisi cincin.
    const lerp = (v, a0, a1, b0, b1) => (v === a0 ? b0 : v === a1 ? b1 : b0 + ((v - a0) / (a1 - a0)) * (b1 - b0));
    return {
      mx: (x) => lerp(x, top.x0, top.x1, X0, X1),
      my: (y) => lerp(y, top.y0, top.y1, Y0, Y1),
      X0, X1, Y0, Y1,
    };
  };
  // Lawan arah jam dilihat dari atas, bermula di bucu depan-kiri.
  const ring = (q) => {
    const { mx, my, X0, X1, Y0, Y1 } = mapper(q.o);
    const z = q.z;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([mx(xs[i]), Y0, z]);
    for (let j = 0; j < m; j++) pts.push([X1, my(ys[j]), z]);
    for (let i = n; i > 0; i--) pts.push([mx(xs[i]), Y1, z]);
    for (let j = m; j > 0; j--) pts.push([X0, my(ys[j]), z]);
    return pts;
  };
  const same = (a, b) => a.z === b.z && a.o.l === b.o.l && a.o.r === b.o.r && a.o.f === b.o.f && a.o.b === b.o.b;
  const prof = profile.slice().reverse().filter((q, k, arr) => k === 0 || !same(q, arr[k - 1]));
  const rings = prof.map(ring);
  const N = rings[0].length;
  for (let k = 0; k + 1 < rings.length; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < N; i++) {
      const a0 = A[i], a1 = A[(i + 1) % N], b0 = B[i], b1 = B[(i + 1) % N];
      // Dengan cincin lawan arah jam, (atas_i, bawah_i, bawah_i+1) menghadap
      // ke luar - termasuk tebing mendatar.
      push(a0, b0, b1);
      push(a0, b1, a1);
    }
  }

  // ---- muka bawah: grid dipetakan ke cincin paling bawah
  const { mx, my } = mapper(prof[prof.length - 1].o);
  const bx = xs.map(mx), by = ys.map(my);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      tri([bx[i], by[j], 0], [bx[i + 1], by[j], 0], [bx[i + 1], by[j + 1], 0], 0, 0, -1);
      tri([bx[i], by[j], 0], [bx[i + 1], by[j + 1], 0], [bx[i], by[j + 1], 0], 0, 0, -1);
    }
  }
  return out;
}

/** Isipadu bertanda (teorem divergens) - positif bila normal ke luar. */
function meshVolume(t) {
  let v = 0;
  for (let b = 0; b < t.length; b += 9) {
    v += (t[b] * (t[b + 4] * t[b + 8] - t[b + 5] * t[b + 7])
      - t[b + 1] * (t[b + 3] * t[b + 8] - t[b + 5] * t[b + 6])
      + t[b + 2] * (t[b + 3] * t[b + 7] - t[b + 4] * t[b + 6])) / 6;
  }
  return v;
}

/** Tapak lengkap: parameter bersih, ukuran diterbitkan, jasad dan statistik. */
export function buildPlakBox(input = {}) {
  const { p, notes } = cleanParams(input);
  const d = derive(p);
  const Hs = p.baseH;

  // Grid permukaan atas.
  const xs = uniqSorted([d.top.x0, d.top.x1, d.groove.x0, d.groove.x1, d.grooveIn.x0, d.grooveIn.x1,
    ...(d.pocket ? [d.pocket.x0, d.pocket.x1] : []), ...(d.slot ? [d.slot.x0, d.slot.x1] : [])]);
  const ys = uniqSorted([d.top.y0, d.top.y1, d.groove.y0, d.groove.y1, d.grooveIn.y0, d.grooveIn.y1,
    ...(d.pocket ? [d.pocket.y0, d.pocket.y1] : []), ...(d.slot ? [d.slot.y0, d.slot.y1] : [])]);
  const inside = (r, x, y) => r && x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
  const H = [];
  for (let i = 0; i < xs.length - 1; i++) {
    H.push([]);
    for (let j = 0; j < ys.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2;
      let z = Hs;
      if (inside(d.groove, x, y) && !inside(d.grooveIn, x, y)) z = Hs - p.grooveDepth;
      else if (inside(d.pocket, x, y)) z = Hs - p.pocketDepth;
      else if (inside(d.slot, x, y)) z = Hs - p.slotDepth;
      H[i].push(R6(z));
    }
  }

  // Senarai jasad, walaupun kini sentiasa satu: pengeksport dan pratonton
  // sudah tahu mengendalikan lebih daripada satu bahagian.
  const bodies = [{ id: 'tapak', name: 'Tapak', tris: buildBody(d.top, xs, ys, H, Hs, d.profile), z: 0 }];
  let volume = 0, triangles = 0;
  for (const b of bodies) {
    b.volumeMm3 = meshVolume(b.tris);
    b.mesh = new Float32Array(b.tris);
    delete b.tris;
    volume += b.volumeMm3;
    triangles += b.mesh.length / 9;
  }

  const warnings = [...notes];
  // Hanya bila ada poket: tanpanya, bahagian di dalam alur ialah satu pulau
  // pepejal penuh dan tiada dinding nipis untuk dirisaukan.
  if (p.pocket && p.gap - p.grooveClear - p.pocketClear < 3) {
    warnings.push('Dinding antara poket plak dan alur akrilik kurang 3 mm - besarkan ruang plak kalau ia rapuh.');
  }
  if (p.acrylic + 2 * p.grooveClear < 2) warnings.push('Alur kurang 2 mm lebar - sukar dicetak bersih.');
  if (d.slot && p.gap - p.grooveClear - p.slotClear < 3) {
    warnings.push('Dinding antara hujung slot dan alur akrilik kurang 3 mm - besarkan ruang di keliling plak kalau ia rapuh.');
  }
  if (d.slot && p.sheetT + 2 * p.slotClear < 2) warnings.push('Slot kurang 2 mm lebar - sukar dicetak bersih.');

  return {
    params: p,
    derived: d,
    grid: { xs, ys, H, Htop: Hs },
    bodies,
    // Tapak potong laser: lapisan papan, dari bawah. null untuk cetak 3D.
    layers: p.baseMode === 'laser' ? laserLayers(p, d) : null,
    stats: {
      triangles,
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
