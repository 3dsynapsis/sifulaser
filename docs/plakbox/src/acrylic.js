// Fail potong laser untuk kotak akrilik - Bahagian 2 Plak Box.
//
// Lima keping tanpa tanggam: Atas, Depan, Belakang, Kiri, Kanan. Saiznya sudah
// dikira oleh buildPlakBox() (derived.panels); di sini ia dibesarkan dengan
// kerf supaya keping yang keluar dari mesin ialah saiz itu tepat, disusun atas
// helaian saiz katil laser, dan ditulis sebagai SVG. Jenis Dua Tingkat Slot
// juga mendapat garis luar plak akrilik sekeping - dalam fail sendiri, kerana
// tebalnya lain (lalai 5 mm berbanding kotak 3 mm) dan dipotong dari helaian lain.
//
// Tulen: tiada DOM, diuji oleh scripts/test-plakbox.mjs.
//
// Susunan: MaxRects (best short side fit) dengan putaran 90 darjah. Bagi lima
// segi empat ia jauh lebih padat daripada rak: dua keping depan setinggi
// 322 mm tidak lagi memakan dua rak 600 x 400 masing-masing.

import { labelPathData } from './geom/label.js';

export const SHEETS = [
  { id: '600x400', name: '600 × 400 mm', w: 600, h: 400 },
  { id: '900x600', name: '900 × 600 mm', w: 900, h: 600 },
  { id: '1300x900', name: '1300 × 900 mm', w: 1300, h: 900 },
  { id: '2440x1220', name: '2440 × 1220 mm (kepingan penuh 8 × 4 kaki)', w: 2440, h: 1220 },
];
export const DEFAULT_SHEET = '600x400';
export const DEFAULT_KERF = 0.15;   // akrilik 3 mm, CO2 - sama seperti Box Maker dan Tray
export const MARGIN = 5;            // dari tepi helaian
export const GAP = 4;               // antara keping

const r3 = (v) => Math.round(v * 1000) / 1000;
const fmt = (v) => {
  const r = r3(v);
  return Object.is(r, -0) ? '0' : String(r);
};
export const sheetDef = (id) => SHEETS.find((s) => s.id === id) || SHEETS[0];

/** Kerf yang munasabah: 0..1 mm; selainnya lalai. */
export function cleanKerf(k) {
  const v = Number(k);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_KERF;
}

/**
 * Keping kotak, satu entri bagi setiap keping fizikal. `w`/`h` ialah saiz
 * yang dilukis (nominal + kerf); `nominal` ialah saiz siap.
 */
export function boxPieces(model, kerf = DEFAULT_KERF) {
  const k = cleanKerf(kerf);
  const names = { atas: ['Atas'], depan: ['Depan', 'Belakang'], sisi: ['Kiri', 'Kanan'] };
  const out = [];
  for (const q of model.derived.panels) {
    const labels = names[q.id] || Array.from({ length: q.qty }, (_, i) => `${q.name} ${i + 1}`);
    for (let i = 0; i < q.qty; i++) {
      out.push({ id: `${q.id}${i}`, label: labels[i] || q.name, nominal: { w: q.w, h: q.h }, w: r3(q.w + k), h: r3(q.h + k) });
    }
  }
  return out;
}

/** Plak akrilik sekeping (jenis slot sahaja), atau null. */
export function plaquePiece(model, kerf = DEFAULT_KERF) {
  if (!model.derived.slot) return null;
  const k = cleanKerf(kerf);
  const p = model.params;
  return { id: 'plak', label: 'Plak', nominal: { w: p.plakL, h: p.plakH }, w: r3(p.plakL + k), h: r3(p.plakH + k) };
}

/**
 * Susun keping atas helaian W x H. Pulangkan senarai helaian, setiap satu
 * { w, h, placed: [{ piece, x, y, w, h, rot }], overflow }. Koordinat y-ke-atas
 * dari bucu kiri bawah helaian, bucu kiri bawah keping (saiz dilukis).
 * Keping yang lebih besar daripada helaian dalam kedua-dua arah diletak
 * seorang diri pada helaiannya dan helaian itu ditanda overflow.
 */
export function nest(pieces, { w: W, h: H }, { margin = MARGIN, gap = GAP } = {}) {
  // Setiap keping dibesarkan `gap` dan kawasan guna juga, supaya jarak antara
  // keping ialah gap dan keping di tepi kekal `margin` dari tepi helaian.
  const UW = W - 2 * margin + gap;
  const UH = H - 2 * margin + gap;
  const todo = pieces.slice().sort((a, b) => b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h));
  const sheets = [];
  const fits = (pc) => (pc.w + gap <= UW + 1e-9 && pc.h + gap <= UH + 1e-9)
    || (pc.h + gap <= UW + 1e-9 && pc.w + gap <= UH + 1e-9);

  while (todo.length) {
    const sheet = { w: W, h: H, placed: [], overflow: false };
    sheets.push(sheet);
    if (!fits(todo[0])) {
      // Terlalu besar: seorang diri, dalam arah yang paling hampir muat.
      const pc = todo.shift();
      const rot = pc.w > W && pc.h <= W;
      sheet.placed.push({ piece: pc, x: margin, y: margin, w: rot ? pc.h : pc.w, h: rot ? pc.w : pc.h, rot });
      sheet.overflow = true;
      continue;
    }
    let free = [{ x: 0, y: 0, w: UW, h: UH }];
    for (let i = 0; i < todo.length;) {
      const pc = todo[i];
      let best = null;
      for (const f of free) {
        for (const rot of [false, true]) {
          const w = (rot ? pc.h : pc.w) + gap;
          const hh = (rot ? pc.w : pc.h) + gap;
          if (w > f.w + 1e-9 || hh > f.h + 1e-9) continue;
          const shortSide = Math.min(f.w - w, f.h - hh);
          const longSide = Math.max(f.w - w, f.h - hh);
          if (!best || shortSide < best.s - 1e-9 || (Math.abs(shortSide - best.s) < 1e-9 && longSide < best.l)) {
            best = { s: shortSide, l: longSide, x: f.x, y: f.y, w, h: hh, rot };
          }
        }
      }
      if (!best) { i++; continue; }
      todo.splice(i, 1);
      sheet.placed.push({
        piece: pc, x: margin + best.x, y: margin + best.y, w: best.w - gap, h: best.h - gap, rot: best.rot,
      });
      // MaxRects: belah setiap ruang bebas yang ditindih, buang yang terkandung.
      const used = { x: best.x, y: best.y, w: best.w, h: best.h };
      const next = [];
      for (const f of free) {
        if (used.x >= f.x + f.w || used.x + used.w <= f.x || used.y >= f.y + f.h || used.y + used.h <= f.y) {
          next.push(f);
          continue;
        }
        if (used.x > f.x) next.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
        if (used.x + used.w < f.x + f.w) next.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
        if (used.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
        if (used.y + used.h < f.y + f.h) next.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
      }
      free = next.filter((a, ia) => !next.some((b, ib) => ib !== ia
        && a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9
        && (ib < ia || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
      i = 0;
    }
  }
  return sheets;
}

/** Satu helaian sebagai SVG: lapisan Potong merah, label kelabu (pilihan). */
export function sheetToSvg(sheet, { title = 'Plak Box', labels = false, strokeWidth = 0.1 } = {}) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(sheet.w)}mm" height="${fmt(sheet.h)}mm" `
      + `viewBox="0 0 ${fmt(sheet.w)} ${fmt(sheet.h)}">`,
    `<title>${String(title).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</title>`,
    `<g transform="translate(0 ${fmt(sheet.h)}) scale(1 -1)">`,
    '<g id="cut" data-layer="Potong" fill="none" stroke="#ff0000" stroke-width="' + fmt(strokeWidth) + '">',
  ];
  for (const pl of sheet.placed) {
    parts.push(`<path d="M${fmt(pl.x)} ${fmt(pl.y)}H${fmt(pl.x + pl.w)}V${fmt(pl.y + pl.h)}H${fmt(pl.x)}Z"/>`);
  }
  parts.push('</g>');
  if (labels) {
    // Lejang satu garisan, kelabu, lapisan sendiri: untuk mengenal keping di
    // atas katil. Jangan petakan lapisan ini kepada ukiran - akrilik jernih
    // menyimpan setiap tanda.
    parts.push('<g id="labels" data-layer="Label" fill="none" stroke="#9aa0a6" stroke-width="'
      + fmt(strokeWidth) + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.75">');
    for (const pl of sheet.placed) {
      const size = Math.min(6, pl.h * 0.3, (pl.w / Math.max(4, pl.piece.label.length)) * 1.6);
      const d = labelPathData(pl.piece.label, pl.x + pl.w / 2, pl.y + pl.h / 2, size);
      if (d) parts.push(`<path d="${d}"/>`);
    }
    parts.push('</g>');
  }
  parts.push('</g></svg>');
  return parts.join('\n');
}

/**
 * Semua fail akrilik untuk satu model: kotak (satu fail bagi setiap helaian)
 * dan, bagi jenis slot, plak. Pulangkan { box: [{ name, svg, sheet }], plaque }.
 */
export function acrylicFiles(model, { sheet = DEFAULT_SHEET, kerf = DEFAULT_KERF, labels = false } = {}) {
  const p = model.params;
  const d = model.derived;
  const def = sheetDef(sheet);
  const k = cleanKerf(kerf);
  const sheets = nest(boxPieces(model, k), def);
  const stamp = `${fmt(d.coverOutL)}x${fmt(d.coverOutW)}x${fmt(d.coverH)}`;
  const box = sheets.map((s, i) => ({
    name: `plakbox-akrilik-${fmt(p.acrylic)}mm-${stamp}${sheets.length > 1 ? `-helaian${i + 1}` : ''}.svg`,
    svg: sheetToSvg(s, { title: `Plak Box - kotak akrilik ${fmt(p.acrylic)} mm, kerf ${fmt(k)} mm`, labels }),
    sheet: s,
  }));
  const pq = plaquePiece(model, k);
  let plaque = null;
  if (pq) {
    // Helaian setepat keping itu: plak ialah reka bentuk pelanggan, dan garis
    // luar ini hanya sempadannya - mudah disusun semula dalam LightBurn.
    const s = { w: r3(pq.w + 2 * MARGIN), h: r3(pq.h + 2 * MARGIN), overflow: false,
      placed: [{ piece: pq, x: MARGIN, y: MARGIN, w: pq.w, h: pq.h, rot: false }] };
    plaque = {
      name: `plakbox-plak-${fmt(p.sheetT)}mm-${fmt(p.plakL)}x${fmt(p.plakH)}.svg`,
      svg: sheetToSvg(s, { title: `Plak Box - plak akrilik ${fmt(p.sheetT)} mm, kerf ${fmt(k)} mm`, labels: false }),
      sheet: s,
    };
  }
  return { box, plaque, kerf: k, sheet: def };
}
