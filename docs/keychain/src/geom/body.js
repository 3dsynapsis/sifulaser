// The shapes a keychain can be cut as, when it is not cut as the word itself.
//
// The default keychain is the word: the letters are grown until they merge and
// the offset around them becomes the edge of the piece. That is the whole
// product, and it is what the rest of the geometry is built for.
//
// These are the alternative - a plain body with the name put on it rather than
// cut out of it. They exist because a name that is one short word makes a poor
// silhouette (a three-letter piece is a stub with nothing to hold), because an
// engraved name survives a pocket far better than a cut one, and because a
// round or oval blank is what most people picture when they hear "keychain".
//
// Everything is millimetres, y-up, rings counter-clockwise, points as [x, y]
// pairs - the same convention the exporter and the preview read.

import { roundedRect, ellipse, dedupe } from './path.js';

export const BODIES = [
  {
    id: 'silhouette',
    name: 'The word',
    plate: false,
    note: 'The letters themselves, grown until they touch, with the offset '
      + 'around them as the edge of the piece. Nothing is engraved - the whole '
      + 'thing is one cut.',
  },
  {
    id: 'rounded',
    name: 'Bar',
    plate: true,
    note: 'A rounded rectangle. The plainest body and the strongest - nothing '
      + 'on it is thinner than the bar itself.',
  },
  {
    id: 'tag',
    name: 'Tag',
    plate: true,
    note: 'A bar with a round nose at the ring end, so the hole sits in a full '
      + 'half-circle of material. The luggage-label shape.',
  },
  {
    id: 'oval',
    name: 'Oval',
    plate: true,
    note: 'An ellipse around the words. Softer than the bar and it wastes a '
      + 'little more sheet, because the corners of the text box hang outside a '
      + 'rectangle of the same size.',
  },
  {
    id: 'circle',
    name: 'Round',
    plate: true,
    note: 'A disc sized to hold the words across its diagonal. Short names '
      + 'only - a long one makes the disc enormous.',
  },
];

export const bodyOf = (id) => BODIES.find((b) => b.id === id) || BODIES[0];

export const isPlate = (id) => bodyOf(id).plate;

/** Which axis the ring end sits on. */
export const holeAxis = (end) => (end === 'top' || end === 'bottom' ? 'y' : 'x');

/**
 * How the plate's promised dimension grows with the lettering, as a straight
 * line `size = a * s + b`.
 *
 * The tool promises one number - the length across the finished piece - and
 * then solves the lettering to fit it, rather than sizing the letters and
 * letting the piece land wherever it lands. That only works if the relation
 * between the two can be inverted, so every body reports it as a line: `a` is
 * how much of the plate the lettering itself accounts for, `b` is everything
 * that does not scale (the margin of material, the room set aside for the
 * ring). Solving is then one division per constraint, and the tightest wins.
 *
 * A circle has two constraints, and that is the reason this is a list rather
 * than a pair of numbers. It has to be wide enough to hold the words across its
 * diagonal, AND wide enough to keep the hole clear of them; which of the two
 * binds depends on how long the name is.
 *
 * @param ink   { w, h } of the lettering at scale 1
 * @param o     { pad, room, axis } - material all round, extra at the ring end
 * @returns     [{ a, b }, ...]
 */
export function sizeTerms(id, ink, o) {
  const pad = Math.max(0, o.pad);
  const extra = Math.max(0, o.room - pad);
  const onX = o.axis === 'x';
  const w = Math.max(1e-6, ink.w);
  const h = Math.max(1e-6, ink.h);
  switch (id) {
    case 'circle':
      // The disc has to reach across the diagonal of the room the lettering
      // needs. hypot(w + extra, h) is bounded above by hypot(w, h) + extra, and
      // the bound is used rather than the exact figure so the relation stays a
      // straight line and inverts in one step. It costs a fraction of a
      // millimetre of sheet on a disc, which is the cheapest thing here.
      return [{ a: Math.hypot(w, h), b: pad * 2 + extra }];
    case 'oval':
      // An ellipse holds a W x H box when rx = W/sqrt(2) and ry = H/sqrt(2),
      // taking the box's corners as the tight points - so the margin is added
      // outside that, not inside.
      return onX
        ? [{ a: w * Math.SQRT2, b: pad * 2 + extra * Math.SQRT2 }]
        : [{ a: w * Math.SQRT2, b: pad * 2 }];
    default:
      // Bar and tag: the width is the lettering plus a margin each side, plus
      // whatever extra the ring end asked for when the ring is on an end.
      return onX
        ? [{ a: w, b: pad * 2 + extra }]
        : [{ a: w, b: pad * 2 }];
  }
}

/**
 * Build a plate around lettering that has already been scaled.
 *
 * @param id    body id
 * @param ink   { x0, y0, x1, y1 } bounding box of the lettering, in place
 * @param o     { pad, room, axis, end, corner }
 * @returns { ring, shift } - the outline, and how far the lettering has to
 *          move to sit correctly inside it. The lettering is moved rather than
 *          the plate because the plate's own centre is what the hole and the
 *          border are measured from, and moving it would drag those with it.
 */
export function plateRing(id, ink, o) {
  const pad = Math.max(0, o.pad);
  const extra = Math.max(0, o.room - pad);
  const onX = o.axis === 'x';
  const w = ink.x1 - ink.x0;
  const h = ink.y1 - ink.y0;
  // The room the ring end needs is added to the text box on that end, and the
  // lettering then sits off-centre inside the enlarged box. Every body below is
  // built around that one enlarged box, so whether the words fit is decided
  // once here rather than separately in three different shapes.
  const W = w + (onX ? extra : 0);
  const H = h + (onX ? 0 : extra);
  const lead = (o.end === 'left' || o.end === 'bottom') ? extra : 0;
  const trail = (o.end === 'right' || o.end === 'top') ? extra : 0;
  const off = (lead - trail) / 2;
  const shift = [
    -(ink.x0 + ink.x1) / 2 + (onX ? off : 0),
    -(ink.y0 + ink.y1) / 2 + (onX ? 0 : off),
  ];

  if (id === 'circle') {
    // Across the diagonal of the enlarged box. hypot(W, H) <= hypot(w, h) +
    // extra, and the bound is what sizeTerms inverted, so the same bound is
    // built here - otherwise the piece would come out a shade under the length
    // that was asked for.
    const r = (Math.hypot(w, h) + extra) / 2 + pad;
    return { ring: ellipse(0, 0, r, r, 96), shift };
  }

  if (id === 'oval') {
    const k = Math.SQRT2;
    return { ring: ellipse(0, 0, W / k + pad, H / k + pad, 96), shift };
  }

  // Bar and tag. The plate has to be thick enough across the ring's axis to
  // hold the ring at all, whatever the lettering measures - a one-line name in
  // a low face would otherwise give a bar 6 mm tall with a 4 mm hole in it.
  const bw = Math.max(W + pad * 2, o.minW || 0);
  const bh = Math.max(H + pad * 2, o.minH || 0);
  const x0 = -bw / 2;
  const y0 = -bh / 2;
  if (id === 'tag') {
    return { ring: tagRing(x0, y0, bw, bh, o.corner ?? 3, o.end), shift };
  }
  const r = Math.min(o.corner ?? 3, Math.min(bw, bh) / 2);
  return { ring: roundedRect(x0, y0, bw, bh, r, 10), shift };
}

/**
 * A bar with one end rounded off completely.
 *
 * The round end is not decoration. It is where the split ring goes, and a hole
 * in a square corner has a thin wall on the diagonal and a thick one straight
 * out - so it tears at the corner. Rounding the whole end makes the wall the
 * same all the way round the hole, which is the only shape that uses the
 * material properly.
 */
export function tagRing(x, y, w, h, corner, end) {
  const nose = Math.min(w, h) / 2;
  const r = Math.max(0.01, Math.min(corner, Math.min(w, h) / 2));
  const pts = [];
  const arc = (cx, cy, rad, a0, a1, seg = 14) => {
    for (let i = 0; i <= seg; i++) pts.push([
      cx + Math.cos(a0 + (a1 - a0) * (i / seg)) * rad,
      cy + Math.sin(a0 + (a1 - a0) * (i / seg)) * rad,
    ]);
  };
  // Radii for the four corners, counter-clockwise from bottom-right.
  const R = { br: r, tr: r, tl: r, bl: r };
  if (end === 'right') { R.br = nose; R.tr = nose; }
  if (end === 'left') { R.tl = nose; R.bl = nose; }
  if (end === 'top') { R.tr = nose; R.tl = nose; }
  if (end === 'bottom') { R.bl = nose; R.br = nose; }
  const HP = Math.PI / 2;
  arc(x + w - R.br, y + R.br, R.br, -HP, 0);
  arc(x + w - R.tr, y + h - R.tr, R.tr, 0, HP);
  arc(x + R.tl, y + h - R.tl, R.tl, HP, Math.PI);
  arc(x + R.bl, y + R.bl, R.bl, Math.PI, HP * 3);
  return dedupe(pts);
}

/** Where the ring hole goes on a plate: `inset` in from that end, on the axis. */
export function holeOnPlate(ring, end, inset) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  switch (end) {
    case 'left': return [x0 + inset, cy];
    case 'right': return [x1 - inset, cy];
    case 'bottom': return [cx, y0 + inset];
    default: return [cx, y1 - inset];
  }
}
