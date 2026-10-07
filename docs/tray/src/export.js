// Penulis SVG. Susun panel atas kepingan dan keluarkan satu kumpulan bagi
// setiap proses laser supaya LightBurn / RDWorks boleh memetakannya terus ke
// lapisan. Pratonton "Rata" melukis melalui nest() yang sama, jadi susun atur
// di skrin ialah susun atur dalam fail.

import { bbox, ringsToPath, translate, fmt } from './geom/path.js';
import { labelPathData } from './geom/label.js';

export const LAYERS = {
  cut: { id: 'cut', color: '#ff0000', label: 'Potong' },
  labels: { id: 'labels', color: '#9aa0a6', label: 'Label' },
};

export const SHEETS = [
  { id: '600x400', name: '600 x 400 mm', w: 600, h: 400 },
  { id: '900x600', name: '900 x 600 mm', w: 900, h: 600 },
  { id: '1200x900', name: '1200 x 900 mm', w: 1200, h: 900 },
  { id: 'auto', name: 'Satu kepingan, saiz ikut perlu', w: 0, h: 0 },
];

export const DEFAULT_SHEET = '600x400';

/**
 * Susun panel atas rak. Pulangkan kepingan, setiap satu dengan penempatan
 * dalam koordinat kepingan y-ke-atas. `sheetW/H` sifar bermakna "satu
 * kepingan, setinggi yang perlu".
 */
export function nest(panels, { sheetW = 600, sheetH = 400, margin = 5, gap = 4 } = {}) {
  const items = panels
    .map((p) => ({ panel: p, w: p.size.w, h: p.size.h }))
    .sort((a, b) => b.h - a.h || b.w - a.w);

  const auto = !sheetW || !sheetH;
  const usableW = auto
    ? Math.max(...items.map((i) => i.w), 1) * Math.min(3, items.length) + gap * 2
    : sheetW - margin * 2;

  const sheets = [];
  let cur = null;
  let shelfY = margin;
  let shelfH = 0;
  let cursorX = margin;

  const newSheet = () => {
    cur = { placements: [], w: 0, h: 0 };
    sheets.push(cur);
    shelfY = margin;
    shelfH = 0;
    cursorX = margin;
  };
  newSheet();

  for (const it of items) {
    if (cursorX + it.w > margin + usableW && cur.placements.length) {
      shelfY += shelfH + gap;
      shelfH = 0;
      cursorX = margin;
    }
    if (!auto && shelfY + it.h > sheetH - margin && cur.placements.length) {
      newSheet();
    }
    cur.placements.push({ panel: it.panel, x: cursorX, y: shelfY });
    cursorX += it.w + gap;
    shelfH = Math.max(shelfH, it.h);
  }

  for (const s of sheets) {
    const maxX = Math.max(...s.placements.map((p) => p.x + p.panel.size.w));
    const maxY = Math.max(...s.placements.map((p) => p.y + p.panel.size.h));
    s.w = auto ? maxX + margin : sheetW;
    s.h = auto ? maxY + margin : sheetH;
    // Panel yang lebih besar daripada kepingan: dibenarkan, tetapi ditanda
    // supaya UI boleh beri amaran dan bukan senyap memotong luar kepingan.
    s.overflow = s.placements.some((p) => p.x + p.panel.size.w > s.w + 1e-6 || p.y + p.panel.size.h > s.h + 1e-6);
    if (!auto) {
      // susunan rak tumbuh ke bawah dari atas kepingan tetap
      for (const p of s.placements) p.y = s.h - margin - p.y - p.panel.size.h;
    }
  }
  return sheets;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Setiap gelang untuk dipotong pada satu kepingan, dalam koordinat kepingan. */
export function sheetGeometry(sheet, opts = {}) {
  const o = { labels: false, labelSize: 4, ...opts };
  const cut = [];
  const labels = [];
  for (const { panel, x, y } of sheet.placements) {
    cut.push([panel.outline, ...panel.holes].map((r) => translate(r, x, y)));
    if (o.labels) {
      // Label duduk di tengah panel. Pada pembahagi yang rendah ia dikecilkan
      // supaya tidak melimpah keluar daripada kayu.
      const size = Math.min(o.labelSize, panel.size.h * 0.45, panel.size.w / Math.max(4, panel.label.length) * 1.6);
      labels.push({ text: panel.label, x: x + panel.size.w / 2, y: y + panel.size.h / 2, size });
    }
  }
  return { cut, labels, w: sheet.w, h: sheet.h };
}

export function sheetToSvg(sheet, opts = {}) {
  const o = { strokeWidth: 0.1, labels: false, labelSize: 4, ...opts };
  const geo = sheetGeometry(sheet, o);
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${fmt(sheet.w)}mm" height="${fmt(sheet.h)}mm" ` +
    `viewBox="0 0 ${fmt(sheet.w)} ${fmt(sheet.h)}">`);
  parts.push(`<title>${esc(o.title || 'Tray Organizer')}</title>`);
  parts.push(`<g transform="translate(0 ${fmt(sheet.h)}) scale(1 -1)">`);

  const paths = geo.cut.map((group) => ringsToPath(group)).filter(Boolean);
  if (paths.length) {
    const L = LAYERS.cut;
    parts.push(`<g id="${L.id}" data-layer="${L.label}" fill="none" stroke="${L.color}" stroke-width="${fmt(o.strokeWidth)}">`);
    for (const d of paths) parts.push(`<path d="${d}"/>`);
    parts.push('</g>');
  }

  if (geo.labels.length) {
    // Lejang satu garisan, bukan <text>: <text> dipaparkan dalam apa jua fon
    // yang ada pada mesin yang membukanya, dan sesetengah perisian laser
    // menggugurkannya terus. Ini poligaris sebenar yang mesin boleh ikut.
    const L = LAYERS.labels;
    parts.push(
      `<g id="${L.id}" data-layer="${L.label}" fill="none" stroke="${L.color}" ` +
      `stroke-width="${fmt(o.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.75">`);
    for (const l of geo.labels) {
      const d = labelPathData(l.text, l.x, l.y, l.size);
      if (d) parts.push(`<path d="${d}"/>`);
    }
    parts.push('</g>');
  }

  parts.push('</g></svg>');
  return parts.join('\n');
}

export function sheetDef(id) {
  return SHEETS.find((s) => s.id === id) || SHEETS[0];
}

/** Export penuh: pulangkan [{ name, svg, sheet }] - satu entri setiap kepingan. */
export function exportSvg(tray, opts = {}) {
  const def = sheetDef(opts.sheet || DEFAULT_SHEET);
  const sheets = nest(tray.panels, {
    sheetW: def.w, sheetH: def.h, margin: opts.margin ?? 5, gap: opts.gap ?? 4,
  });
  const { length: L, width: W, height: H, thickness: t } = tray.params;
  const stamp = `${fmt(L)}x${fmt(W)}x${fmt(H)}`;
  return sheets.map((s, i) => ({
    name: sheets.length > 1 ? `dulang-${stamp}-kepingan${i + 1}.svg` : `dulang-${stamp}.svg`,
    svg: sheetToSvg(s, { ...opts, title: `Tray Organizer ${stamp} t${fmt(t)}` }),
    sheet: s,
  }));
}

export { bbox };
