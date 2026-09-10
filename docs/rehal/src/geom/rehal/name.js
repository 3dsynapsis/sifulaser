// The name, and the medallion it sits in.
//
// v1 ENGRAVES. It does not cut through, and that is a decision rather than an
// omission: the cartouche interior stays solid, so the name is material
// attached to the band all the way round and nothing inside it can float free.
// Cutting letters through makes every counter of every 'o' and 'a' a separate
// piece that has to be bridged back, which is the Cake Topper and Stand Nama
// problem those two tools already solve properly - and writing a third bridging
// implementation is not this job. If it is ever added it has to reuse their
// weld() and run the same two connectivity tests on the result.
//
// HOW THE PATTERN IS CUT CLEANLY AGAINST IT is not done here at all. The
// pattern engine is given the cartouche ring and a band width and refuses to
// cut any cell that is not wholly clear of the band, so a strap is never
// severed by the medallion - the cell that would have severed it is simply not
// cut. See src/geom/pattern/region.js. All this file does is decide how big the
// medallion is and where the letters go inside it.
//
// TEXT CONVENTIONS. layout() returns FLAT arrays, [x0,y0,x1,y1,...], and so
// does everything that leaves this file on the engrave layers. The rings that
// go to the pattern engine and to path.js are PAIRS. Nothing throws when those
// are swapped; it just draws nonsense. toFlat() and toPairs() below are the
// only two places the two conventions are allowed to meet.

import { layout } from '../text.js';
import { cartoucheRing, CARTOUCHES } from '../pattern/region.js';
import { inRing } from '../pattern/arrangement.js';

/** Below this an engraved letter on plywood is a smudge, not a name. */
export const CAP_MIN = 4;
export const CAP_DEFAULT = 16;

export const toFlat = (ring) => {
  const o = new Array(ring.length * 2);
  for (let i = 0; i < ring.length; i++) { o[i * 2] = ring[i][0]; o[i * 2 + 1] = ring[i][1]; }
  return o;
};
export const toPairs = (flat) => {
  const o = [];
  for (let k = 0; k < flat.length; k += 2) o.push([flat[k], flat[k + 1]]);
  return o;
};

const seg = (ax, ay, bx, by, cx, cy, dx, dy) => {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
};

/**
 * Is this axis-aligned box wholly inside this ring?
 *
 * Corners inside is not enough on its own and it is not a hypothetical: three
 * of the four cartouche shapes are non-convex, and a dome's shoulder or a
 * crescent's inner arc can cut clean through the middle of a box whose corners
 * are both comfortably inside. So the edges are tested for crossings as well,
 * which together with the corners is exact for polygons.
 */
export function boxInRing(box, ring) {
  const { x0, y0, x1, y1 } = box;
  const cs = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (const [x, y] of cs) if (!inRing(x, y, ring)) return false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    for (let k = 0; k < 4; k++) {
      const [px, py] = cs[k];
      const [qx, qy] = cs[(k + 1) % 4];
      if (seg(ax, ay, bx, by, px, py, qx, qy)) return false;
    }
  }
  return true;
}

/**
 * The smallest cartouche of this shape that swallows this box, and where in it
 * the box has to sit.
 *
 * The vertical offsets are searched rather than assumed because the shapes do
 * not all have their room in the middle. A crescent has none at all at its
 * centre - the centre of its bounding box is inside the bite taken out of it -
 * so a search that only ever tried the middle would report that a crescent can
 * never hold two letters, which is wrong and would look like a bug in the
 * shape rather than in the search.
 */
export function fitShape(shape, boxW, boxH, maxA, maxB) {
  if (!CARTOUCHES[shape] || !CARTOUCHES[shape].unit) return null;
  const a0 = Math.max(boxW / 2, 1);
  const b0 = Math.max(boxH / 2, 1);
  let best = null;
  for (const oy of [0, -0.12, -0.24, -0.36, 0.12]) {
    const holds = (s) => {
      const a = a0 * s;
      const b = b0 * s;
      if (a > maxA || b > maxB) return false;
      const ring = cartoucheRing(shape, 0, 0, a, b);
      const cy = oy * b;
      return boxInRing({
        x0: -boxW / 2, y0: cy - boxH / 2, x1: boxW / 2, y1: cy + boxH / 2,
      }, ring);
    };
    let hi = 1;
    let found = false;
    for (let i = 0; i < 30; i++) {
      if (holds(hi)) { found = true; break; }
      hi *= 1.18;
      if (a0 * hi > maxA && b0 * hi > maxB) break;
    }
    if (!found) continue;
    let lo = hi / 1.18;
    for (let i = 0; i < 26 && hi - lo > 1e-3; i++) {
      const mid = (lo + hi) / 2;
      if (holds(mid)) hi = mid; else lo = mid;
    }
    if (!best || hi < best.s) best = { s: hi, oy };
  }
  if (!best) return null;
  return { a: a0 * best.s, b: b0 * best.s, oy: best.oy };
}

/**
 * Fit a name into a medallion on the panel.
 *
 * Returns { ring, engrave, engraveFill, capHeight, ... } in PANEL-LOCAL
 * coordinates, or { tooLong: true } when even a four millimetre cap height
 * will not go. It reports rather than overflows, because a name that runs off
 * the edge of its own cartouche is the one failure a customer notices before
 * the laser has finished.
 */
export function fitName(o) {
  const {
    text = '', faceData = null, shape = 'kubah',
    panelW, panelH, minWidth, band,
    capHeight = CAP_DEFAULT, letterSpacing = 0, align = 'center',
  } = o;
  const cx = o.cx ?? panelW / 2;
  const cy = o.cy ?? panelH / 2;
  const clean = String(text).trim();
  if (!clean || !faceData || !CARTOUCHES[shape] || !CARTOUCHES[shape].unit) {
    return { ring: null, engrave: [], engraveFill: [], capHeight: 0, empty: true };
  }

  // Room for the letters to breathe inside the band, and room for the band
  // itself outside it. Both are stated in terms of the minimum feature width so
  // that a thicker board gets a more generous medallion without anybody
  // remembering to change a number.
  const pad = Math.max(8, 2 * minWidth);
  const maxA = 0.275 * panelW - band;
  const maxB = 0.225 * panelH - band;

  // text.js substitutes a question mark for any character the face has no
  // glyph for, which is the right thing for a preview and the wrong thing to
  // find out about after the laser has run. It happens the moment somebody
  // types Jawi or Arabic into a Latin face - on a Quran stand, of all things -
  // so the substitutions are counted here and reported rather than engraved in
  // silence.
  const missing = missingGlyphs(clean, faceData);

  let cap = Math.max(CAP_MIN, capHeight);
  for (let i = 0; i < 40; i++) {
    const lay = layout({
      text: clean, faceData, capHeight: cap, letterSpacing, align,
    });
    if (!lay.paths.length) break;
    const boxW = lay.width + 2 * pad;
    const boxH = lay.height + 2 * pad;
    const fit = fitShape(shape, boxW, boxH, maxA, maxB);
    if (fit) {
      const ring = cartoucheRing(shape, cx, cy, fit.a, fit.b);
      const inkX = (lay.bbox.x0 + lay.bbox.x1) / 2;
      const inkY = (lay.bbox.y0 + lay.bbox.y1) / 2;
      const dx = cx - inkX;
      const dy = cy + fit.oy * fit.b - inkY;
      const moved = lay.paths.map((p) => {
        const out = new Array(p.length);
        for (let k = 0; k < p.length; k += 2) { out[k] = p[k] + dx; out[k + 1] = p[k + 1] + dy; }
        return out;
      });
      return {
        ring,
        missing,
        a: fit.a,
        b: fit.b,
        cx,
        cy,
        capHeight: cap,
        outline: lay.outline,
        engrave: lay.outline ? [] : moved,
        engraveFill: lay.outline ? moved : [],
        ink: {
          x0: lay.bbox.x0 + dx,
          y0: lay.bbox.y0 + dy,
          x1: lay.bbox.x1 + dx,
          y1: lay.bbox.y1 + dy,
        },
        pad,
        tooLong: false,
      };
    }
    if (cap <= CAP_MIN + 1e-9) break;
    cap = Math.max(CAP_MIN, cap * 0.92);
  }
  return {
    ring: null, engrave: [], engraveFill: [], capHeight: CAP_MIN, missing, tooLong: true,
  };
}

/**
 * Which characters this face cannot draw.
 *
 * Whitespace is not counted - a face with no space glyph still spaces - and
 * neither is a real question mark, because a name containing one is a name
 * containing one.
 */
export function missingGlyphs(text, faceData) {
  const out = [];
  if (!faceData || !faceData.glyphs) return out;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code === 32 || code === 9 || code === 10 || code === 63) continue;
    if (!faceData.glyphs[code]) out.push(ch);
  }
  return out;
}
