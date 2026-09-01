// SVG writer. Nests the pieces onto a sheet and emits one group per laser
// process so LightBurn, RDWorks and the rest can map them straight to layers.
//
// Two things differ from the Box Maker writer this grew out of.
//
// There is no raster layer at all. A tag carries vector artwork only - SVG
// import, the clipart library, outline text - which means the PDF and the SVG
// contain exactly the same drawing. In the Box Maker they do not, and the export
// dialog has to apologise for it. Here there is nothing to apologise for, and
// that is worth keeping: PNG import was left out of this tool on purpose.
//
// There are OPEN polylines. The single-line lettering on a tag is not a closed
// ring, and closing it would draw a stroke from the end of the last letter back
// through the whole line. So strokes travel in their own bucket the whole way
// down to both writers, and neither of them ever closes one.

import { ringsToPath, translate, fmt } from './geom/path.js';
import { labelPathData } from './geom/label.js';
import { objectRings, cutRings } from './geom/decor.js';

export const LAYERS = {
  cut: { id: 'cut', color: '#ff0000', label: 'Cut' },
  'engrave-line': { id: 'engrave-line', color: '#0000ff', label: 'Engrave (Line)' },
  'engrave-fill': { id: 'engrave-fill', color: '#000000', label: 'Engrave (Fill)' },
};

export const SHEETS = [
  { id: 'auto', name: 'Fit to the tag', w: 0, h: 0 },
  { id: '600x400', name: '600 x 400', w: 600, h: 400 },
  { id: '1200x900', name: '1200 x 900', w: 1200, h: 900 },
];

export const DEFAULT_SHEET = 'auto';

/** Millimetres reserved under each piece for its FRONT / BACK mark. */
export const LABEL_ROOM = 7;

/**
 * Shelf-pack the pieces, front and back side by side.
 *
 * `sheetW/H` of 0 means "one sheet, as big as it needs to be", which is the
 * default here: a pair of tags is 110 mm across and putting that in the corner
 * of a 600 x 400 sheet makes a file that imports at the wrong apparent scale and
 * needs dragging about before it can be cut. A tight file drops onto a bed
 * wherever the operator wants it.
 *
 * `labelRoom` is reserved UNDER each piece rather than inside it. The Box Maker
 * writes its panel names across the middle of the panel, which is fine on a box
 * wall and useless on a tag - the middle of a tag is where the name goes. Below
 * the piece the mark can never collide with the artwork, and it is still in the
 * same throwaway grey layer.
 */
export function nest(pieces, {
  sheetW = 0, sheetH = 0, margin = 5, gap = 6, labelRoom = 0,
} = {}) {
  const items = pieces.map((p) => ({
    piece: p, w: p.size.w, h: p.size.h + labelRoom,
  }));

  const auto = !sheetW || !sheetH;
  const usableW = auto
    ? Math.max(...items.map((i) => i.w), 1) * Math.min(4, items.length)
      + gap * Math.max(0, items.length - 1)
    : sheetW - margin * 2;

  const sheets = [];
  let cur = null;
  let shelfY = margin;
  let shelfH = 0;
  let cursorX = margin;

  const newSheet = () => {
    cur = { placements: [], w: 0, h: 0, labelRoom };
    sheets.push(cur);
    shelfY = margin;
    shelfH = 0;
    cursorX = margin;
  };
  newSheet();

  for (const it of items) {
    if (cursorX + it.w > margin + usableW + 1e-6 && cur.placements.length) {
      shelfY += shelfH + gap;
      shelfH = 0;
      cursorX = margin;
    }
    if (!auto && shelfY + it.h > sheetH - margin && cur.placements.length) newSheet();
    cur.placements.push({ piece: it.piece, x: cursorX, y: shelfY, boxH: it.h });
    cursorX += it.w + gap;
    shelfH = Math.max(shelfH, it.h);
  }

  for (const s of sheets) {
    const maxX = Math.max(...s.placements.map((p) => p.x + p.piece.size.w));
    const maxY = Math.max(...s.placements.map((p) => p.y + p.boxH));
    s.w = auto ? maxX + margin : sheetW;
    s.h = auto ? maxY + margin : sheetH;
    // Shelf packing grows downward from the top of a fixed sheet, so a fixed
    // sheet has its rows flipped once, at the end, into the y-up frame both
    // writers use.
    if (!auto) {
      for (const p of s.placements) p.y = s.h - margin - p.y - p.boxH;
    }
    // `y` has been the bottom of the reserved box up to here. From now on it is
    // the origin of the piece, with the label sitting in the strip below it.
    for (const p of s.placements) {
      p.labelY = p.y + labelRoom / 2;
      p.y += labelRoom;
    }
  }
  return sheets;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Shift a flat [x,y,x,y,...] polyline. */
const shiftFlat = (flat, dx, dy) => {
  const out = flat.slice();
  for (let i = 0; i < out.length; i += 2) {
    out[i] += dx;
    out[i + 1] += dy;
  }
  return out;
};

/** Everything drawable for one placed piece, grouped by process. */
function pieceElements(placement, decor, opts) {
  const { piece, x, y } = placement;
  const shift = (rings) => rings.map((r) => translate(r, x, y));
  const out = {
    cut: [], 'engrave-line': [], 'engrave-fill': [], strokes: [], labels: [],
  };

  // The outline and the strap slot are always a cut, and they arrived here with
  // the kerf already in them.
  out.cut.push(shift([piece.outline, ...piece.holes]));

  if (piece.borderRings.length) out['engrave-line'].push(shift(piece.borderRings));
  for (const flat of piece.strokes) out.strokes.push(shiftFlat(flat, x, y));

  const objects = decor || [];
  // Artwork the user asked to CUT becomes a real hole, so it takes the same half
  // kerf the slot does. Engraving removes no slug of material and takes none.
  const cuts = cutRings(objects, opts.kerf || 0);
  if (cuts.length) out.cut.push(shift(cuts));
  for (const obj of objects) {
    if (obj.process === 'cut') continue;
    const rings = shift(objectRings(obj));
    if (!rings.length) continue;
    out[obj.process].push(rings);
  }

  if (opts.labels) {
    out.labels.push({
      text: piece.label,
      x: x + piece.size.w / 2,
      y: placement.labelY,
    });
  }
  return out;
}

/**
 * Everything on one sheet, as geometry. Both writers start here, so the SVG and
 * the PDF cannot disagree about what is on the sheet.
 *
 * Coordinates are y-up, the way the nester lays them out.
 */
export function sheetGeometry(sheet, decorFor, opts = {}) {
  const o = { labels: true, labelSize: 3.4, kerf: 0, ...opts };
  const buckets = { cut: [], 'engrave-line': [], 'engrave-fill': [] };
  const strokes = [];
  const labels = [];

  for (const pl of sheet.placements) {
    const el = pieceElements(pl, decorFor(pl.piece), o);
    for (const k of Object.keys(buckets)) {
      buckets[k].push(...el[k].filter((g) => g && g.length));
    }
    strokes.push(...el.strokes);
    labels.push(...el.labels);
  }
  return { ...buckets, strokes, labels, w: sheet.w, h: sheet.h };
}

export function sheetToSvg(sheet, decorFor, opts = {}) {
  const o = { strokeWidth: 0.1, labels: true, labelSize: 3.4, ...opts };
  const geo = o.geo || sheetGeometry(sheet, decorFor, o);

  const parts = [];
  parts.push(
    '<svg xmlns="http://www.w3.org/2000/svg" '
    + `width="${fmt(geo.w)}mm" height="${fmt(geo.h)}mm" `
    + `viewBox="0 0 ${fmt(geo.w)} ${fmt(geo.h)}">`);
  parts.push(`<title>${esc(o.title || 'Luggage tag')}</title>`);
  parts.push(`<g transform="translate(0 ${fmt(geo.h)}) scale(1 -1)">`);

  for (const key of ['engrave-fill', 'engrave-line', 'cut']) {
    const paths = geo[key].map((group) => ringsToPath(group)).filter(Boolean);
    // The lettering is engraving, and it belongs in the engraving layer rather
    // than in a fourth one the machine would have to be told about.
    const open = key === 'engrave-line' ? geo.strokes : [];
    if (!paths.length && !open.length) continue;
    const L = LAYERS[key];
    const style = key === 'engrave-fill'
      ? `fill="${L.color}" fill-rule="evenodd" stroke="none"`
      : `fill="none" stroke="${L.color}" stroke-width="${fmt(o.strokeWidth)}" `
        + 'stroke-linecap="round" stroke-linejoin="round"';
    parts.push(`<g id="${L.id}" data-layer="${L.label}" ${style}>`);
    for (const d of paths) parts.push(`<path d="${d}"/>`);
    for (const flat of open) {
      const d = flatToPath(flat);
      if (d) parts.push(`<path d="${d}"/>`);
    }
    parts.push('</g>');
  }

  if (o.labels && geo.labels.length) {
    // FRONT and BACK, in their own grey layer, under each piece.
    //
    // These are the whole reason a two-piece export is safe to hand to somebody
    // else. The two pieces are the SAME outline - every shape here is symmetric
    // and the slot is on the centre line - so without the marks the only thing
    // telling them apart is the engraving, and a glance at a nested file does
    // not read engraving. Somebody cuts two fronts.
    //
    // Single-line strokes rather than an SVG <text> element: a <text> sets in
    // whatever font the machine that opens the file happens to have, and some
    // laser front-ends drop it outright, which would leave the pieces unmarked -
    // exactly the failure the marks exist to prevent.
    parts.push(
      '<g id="labels" data-layer="Labels" fill="none" stroke="#9aa0a6" '
      + `stroke-width="${fmt(o.strokeWidth)}" stroke-linecap="round" `
      + 'stroke-linejoin="round" opacity="0.75">');
    for (const l of geo.labels) {
      const d = labelPathData(l.text, l.x, l.y, o.labelSize);
      if (d) parts.push(`<path d="${d}"/>`);
    }
    parts.push('</g>');
  }

  parts.push('</g></svg>');
  return parts.join('\n');
}

/** A flat [x,y,x,y,...] polyline as SVG path data. Never closed. */
export function flatToPath(flat) {
  if (!flat || flat.length < 4) return '';
  let d = `M${fmt(flat[0])} ${fmt(flat[1])}`;
  for (let i = 2; i < flat.length; i += 2) d += `L${fmt(flat[i])} ${fmt(flat[i + 1])}`;
  return d;
}

/** The sheets this tag lays out on, ready for either writer. */
export function layout(tag, opts = {}) {
  const def = SHEETS.find((s) => s.id === (opts.sheet || DEFAULT_SHEET)) || SHEETS[0];
  const room = opts.labels === false ? 0 : LABEL_ROOM;
  return nest(tag.pieces, {
    sheetW: def.w,
    sheetH: def.h,
    margin: opts.margin ?? 5,
    gap: opts.gap ?? 6,
    labelRoom: room,
  });
}

const slug = (s) => String(s || 'tag').trim().replace(/[^\w-]+/g, '-')
  .replace(/^-+|-+$/g, '').toLowerCase() || 'tag';

/** Full export: one entry per sheet. */
export function exportSvg(tag, decorFor, opts = {}) {
  const sheets = layout(tag, opts);
  const base = slug(opts.name || 'luggage-tag');
  const stamp = `${Math.round(tag.derived.pieceW)}x${Math.round(tag.derived.pieceH)}`;
  return sheets.map((s, i) => ({
    name: sheets.length > 1
      ? `${base}-${stamp}-sheet${i + 1}.svg`
      : `${base}-${stamp}.svg`,
    svg: sheetToSvg(s, decorFor, {
      ...opts,
      kerf: tag.params.kerf,
      title: `Luggage tag ${stamp} mm, front and back, ${tag.params.thickness} mm board`,
    }),
    sheet: s,
  }));
}

/** One piece on its own, tight bounds. */
export function pieceToSvg(piece, decor, opts = {}) {
  const m = opts.margin ?? 3;
  const sheet = {
    w: piece.size.w + m * 2,
    h: piece.size.h + m * 2,
    placements: [{ piece, x: m, y: m, labelY: m / 2, boxH: piece.size.h }],
  };
  return sheetToSvg(sheet, () => decor, { labels: false, ...opts });
}

