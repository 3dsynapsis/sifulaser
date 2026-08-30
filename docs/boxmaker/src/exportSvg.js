// SVG writer. Nests the panels onto sheets and emits one group per laser process
// so LightBurn / RDWorks / Lightburn-alikes can map them straight to layers.

import { bbox, ringToPath, ringsToPath, translate, fmt } from './geom/path.js';
import { labelPathData } from './geom/label.js';
import { objectRings } from './geom/decor.js';

export const LAYERS = {
  cut: { id: 'cut', color: '#ff0000', label: 'Cut' },
  'engrave-line': { id: 'engrave-line', color: '#0000ff', label: 'Engrave (Line)' },
  'engrave-fill': { id: 'engrave-fill', color: '#000000', label: 'Engrave (Fill)' },
};

export const SHEETS = [
  { id: '600x400', name: '600 x 400', w: 600, h: 400 },
  { id: '1200x900', name: '1200 x 900', w: 1200, h: 900 },
];

const DEFAULT_SHEET = '600x400';

/**
 * Shelf-pack the panels. Returns sheets, each with placements in y-up sheet
 * coordinates. `sheetW/H` of 0 means "one sheet, as tall as it needs to be".
 */
export function nest(panels, { sheetW = 400, sheetH = 400, margin = 5, gap = 4 } = {}) {
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
    if (!auto) {
      // shelf packing grows downward from the top of a fixed sheet
      for (const p of s.placements) p.y = s.h - margin - p.y - p.panel.size.h;
    }
  }
  return sheets;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Collect every drawable ring/element for one placed panel, grouped by process. */
function panelElements(placement, decor, opts) {
  const { panel, x, y } = placement;
  const shift = (rings) => rings.map((r) => translate(r, x, y));
  const out = { cut: [], 'engrave-line': [], 'engrave-fill': [], images: [] };

  // Structural geometry is always a cut.
  const rings = [panel.outline, ...panel.holes];
  out.cut.push(ringsToPath(shift(rings)));

  for (const obj of decor || []) {
    if (obj.type === 'image') {
      if (!obj.src) continue;
      out.images.push({ ...obj, x: obj.x + x, y: obj.y + y });
      continue;
    }
    const r = shift(objectRings(obj));
    if (!r.length) continue;
    out[obj.process] = out[obj.process] || [];
    out[obj.process].push(ringsToPath(r));
  }

  if (opts.labels) {
    out.labels = out.labels || [];
    out.labels.push({ text: panel.label, x: x + panel.size.w / 2, y: y + panel.size.h / 2 });
  }
  return out;
}

export function sheetToSvg(sheet, decorFor, opts = {}) {
  const o = { strokeWidth: 0.1, labels: false, labelSize: 4, ...opts };
  const buckets = { cut: [], 'engrave-line': [], 'engrave-fill': [] };
  const images = [];
  const labels = [];

  for (const pl of sheet.placements) {
    const el = panelElements(pl, decorFor(pl.panel), o);
    for (const k of Object.keys(buckets)) {
      if (el[k]) buckets[k].push(...el[k].filter(Boolean));
    }
    images.push(...el.images);
    if (el.labels) labels.push(...el.labels);
  }

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${fmt(sheet.w)}mm" height="${fmt(sheet.h)}mm" ` +
    `viewBox="0 0 ${fmt(sheet.w)} ${fmt(sheet.h)}">`);
  parts.push(`<title>${esc(o.title || 'Box Maker')}</title>`);
  parts.push(`<g transform="translate(0 ${fmt(sheet.h)}) scale(1 -1)">`);

  // Raster art sits underneath the vectors; counter-flip so it reads upright.
  if (images.length) {
    parts.push(`<g id="artwork">`);
    for (const im of images) {
      const rot = im.rot
        ? ` rotate(${fmt(-im.rot)} ${fmt(im.w / 2)} ${fmt(-im.h / 2)})`
        : '';
      parts.push(
        `<g transform="translate(${fmt(im.x)} ${fmt(im.y + im.h)}) scale(1 -1)${rot}">` +
        `<image x="0" y="0" width="${fmt(im.w)}" height="${fmt(im.h)}" ` +
        `preserveAspectRatio="none" xlink:href="${im.src}"/></g>`);
    }
    parts.push('</g>');
  }

  for (const key of ['engrave-fill', 'engrave-line', 'cut']) {
    const paths = buckets[key].filter(Boolean);
    if (!paths.length) continue;
    const L = LAYERS[key];
    const style = key === 'engrave-fill'
      ? `fill="${L.color}" fill-rule="evenodd" stroke="none"`
      : `fill="none" stroke="${L.color}" stroke-width="${fmt(o.strokeWidth)}"`;
    parts.push(`<g id="${L.id}" data-layer="${L.label}" ${style}>`);
    for (const d of paths) parts.push(`<path d="${d}"/>`);
    parts.push('</g>');
  }

  if (labels.length) {
    // Single-line strokes, not <text>. A <text> element sets in whatever font
    // the machine that opens the file happens to have - and some laser
    // front-ends drop it entirely, leaving panels with no marking at all. These
    // are real polylines, so they look the same everywhere and a machine can
    // actually follow them. No inner flip: the strokes are already y-up, which
    // is the coordinate system this group is drawn in.
    parts.push(
      `<g id="labels" data-layer="Labels" fill="none" stroke="#9aa0a6" ` +
      `stroke-width="${fmt(o.strokeWidth)}" stroke-linecap="round" ` +
      `stroke-linejoin="round" opacity="0.75">`);
    for (const l of labels) {
      const d = labelPathData(l.text, l.x, l.y, o.labelSize);
      if (d) parts.push(`<path d="${d}"/>`);
    }
    parts.push('</g>');
  }

  parts.push('</g></svg>');
  return parts.join('\n');
}

/** Full export: returns [{ name, svg }] - one entry per sheet. */
export function exportSvg(box, decorFor, opts = {}) {
  const sheetDef = SHEETS.find((s) => s.id === (opts.sheet || DEFAULT_SHEET)) || SHEETS[0];
  const sheets = nest(box.panels, {
    sheetW: sheetDef.w,
    sheetH: sheetDef.h,
    margin: opts.margin ?? 5,
    gap: opts.gap ?? 4,
  });
  const stamp = `${box.params.length}x${box.params.width}x${box.params.height}`;
  return sheets.map((s, i) => ({
    name: sheets.length > 1 ? `box-${stamp}-sheet${i + 1}.svg` : `box-${stamp}.svg`,
    svg: sheetToSvg(s, decorFor, { ...opts, title: `Box ${stamp} t${box.params.thickness}` }),
    sheet: s,
  }));
}

/** One panel on its own, tight bounds. */
export function exportPanel(panel, decor, opts = {}) {
  const m = opts.margin ?? 2;
  const sheet = {
    w: panel.size.w + m * 2,
    h: panel.size.h + m * 2,
    placements: [{ panel, x: m, y: m }],
  };
  return sheetToSvg(sheet, () => decor, opts);
}

export { ringToPath };
