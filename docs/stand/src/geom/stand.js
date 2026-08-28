// Table name stand: a face that stands upright in a slotted, layered base.
//
// The whole object is two ideas. The face carries the name; the base holds it up.
//
// The base is built one of two ways, and the layer count picks between them.
// One board is the usual one: the slot goes straight through it and the face's
// tenons come out flush underneath. Two or more boards give a blind socket
// instead - every layer but the bottom is slotted, so gluing the stack up
// leaves a pocket with a floor. A laser cannot cut half way into a board, and
// stacking is the only way to get a pocket out of a machine that only cuts all
// the way through.
//
// The face comes in two flavours:
//
//   plate       a rounded rectangle with the name engraved on it. Cheap, strong,
//               nothing to break. This is what most of the ones for sale are.
//
//   silhouette  the letters themselves are the outline, welded to a bar along
//               the bottom that carries the tenons. Far better looking and far
//               easier to get wrong: every letter has to touch its neighbour or
//               the bar, or it drops out of the sheet as a loose piece. The
//               builder counts the pieces so the tool can say so before you cut.
//
// Millimetres throughout, y-up, outer contours counter-clockwise.

import { roundedRect, rect, offsetPolygon, dedupe, bbox } from './path.js';
import { layout, isOutline } from './text.js';
import { strokesToOutline, ringArea } from './outline.js';

export const DEFAULTS = {
  style: 'plate',        // plate | silhouette
  line1: 'SHAKIMAH',
  line2: 'BINTI AB RAHMAN',
  baseText: 'SK TANAH MERAH',
  // Blue Highway is the safe default: it is the only kind of face that survives
  // both styles. A fine one looks right on a plate and falls apart the moment
  // somebody switches to cut-out.
  face: 'blue-highway',
  face2: '',             // typeface for line 2; empty follows line 1
  align: 'center',

  size: 'medium',        // small | medium | large | custom | auto
  standW: 200,           // overall width, mm (custom only)
  standH: 55,            // overall standing height, mm (custom only)

  cap1: 20,              // cap height of the name, mm
  cap2: 9,               // cap height of the second line, mm
  capBase: 7,            // cap height of the text engraved on the base
  lineGap: 3,            // mm between line 1's baseline and line 2's cap line;
                         // negative overlaps them, which silhouettes need
  weight: 5,             // silhouette: how thick each stroke is cut
  barHeight: 18,         // silhouette: the bar the letters stand on
  overlap: 2,            // silhouette: how far the letters sink into the bar
  bridge: 3,             // silhouette: connector width for floating pieces; 0 = off
  line2Cut: false,       // silhouette: cut line 2 out too, or engrave it on the bar

  padX: 14,              // plate: space each side of the text
  padY: 9,               // plate: space above and below
  corner: 4,
  border: false,         // plate: an engraved line just inside the edge

  baseLayers: 1,         // 1 = slot straight through; 2+ = blind socket
  baseDepth: 0,          // 0 = work it out from the height
  overhang: 6,           // base sticks out this far past the face, each side
  slotInset: 14,         // slot stops this far short of each end

  thickness: 5,          // 5 mm plywood is the house standard
  kerf: 0.2,
  fit: 0.05,
};

/** The two styles are presets, not a single switch - each needs its own sizes. */
export const STYLE_PRESETS = {
  plate: { cap1: 20, cap2: 9, lineGap: 3, padX: 14, padY: 9, corner: 4 },
  silhouette: {
    cap1: 34, cap2: 9, lineGap: -4, weight: 5, barHeight: 18, corner: 3, padX: 10,
    line2Cut: false,
  },
};

/**
 * The sizes people actually order, measured the way a customer measures them:
 * overall width by overall standing height, base included. Everything about the
 * lettering is then solved to fit, because nobody buying a name stand wants to
 * set a capital height in millimetres.
 */
export const SIZE_PRESETS = [
  { id: 'small', name: 'Small', w: 150, h: 40 },
  { id: 'medium', name: 'Medium', w: 200, h: 55 },
  { id: 'large', name: 'Large', w: 280, h: 65 },
];

export const sizeOf = (id) => SIZE_PRESETS.find((s) => s.id === id) || null;

export const PANEL_LABELS = {
  face: 'Face',
  base: 'Base (slot through)',
  baseTop: 'Base top (slotted)',
  baseMid: 'Base middle (slotted)',
  baseBottom: 'Base bottom (solid)',
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const oneLine = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim();

/** A hole sized `fit` tighter than nominal, so the tenon has to be pushed in. */
function shrinkRect(x, y, w, h, fit) {
  const f = Math.max(0, fit);
  return rect(x + f / 2, y + f / 2, Math.max(0.3, w - f), Math.max(0.3, h - f));
}

function shiftPaths(paths, dx, dy) {
  return paths.map((st) => {
    const out = new Array(st.length);
    for (let k = 0; k < st.length; k += 2) {
      out[k] = st[k] + dx;
      out[k + 1] = st[k + 1] + dy;
    }
    return out;
  });
}

function pathsBBox(paths) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const st of paths) {
    for (let k = 0; k < st.length; k += 2) {
      if (st[k] < x0) x0 = st[k];
      if (st[k] > x1) x1 = st[k];
      if (st[k + 1] < y0) y0 = st[k + 1];
      if (st[k + 1] > y1) y1 = st[k + 1];
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : null;
}

function ringLength(pts) {
  let d = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    d += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  }
  return d;
}

function polylineLength(paths) {
  let d = 0;
  for (const st of paths) {
    for (let k = 2; k < st.length; k += 2) {
      d += Math.hypot(st[k] - st[k - 2], st[k + 1] - st[k - 1]);
    }
  }
  return d;
}

/** One line of text, laid out with its baseline at y = 0 and starting at x = 0. */
function line(text, capHeight, faceData) {
  const t = oneLine(text);
  if (!t) return { paths: [], shapes: [], advance: 0, bbox: null, text: '' };
  const r = layout({ text: t, capHeight, faceData, align: 'left' });
  return { paths: r.paths, shapes: r.shapes, advance: r.advance, bbox: r.bbox, text: t };
}

function alignShift(align, own, total) {
  if (align === 'center') return (total - own) / 2;
  if (align === 'right') return total - own;
  return 0;
}

/** The dips a run of tenons cuts into a bottom edge, walked left to right. */
function tenonDips(y, tenons, depth) {
  const out = [];
  for (const [a, b] of [...tenons].sort((p, q) => p[0] - q[0])) {
    out.push([a, y], [a, y - depth], [b, y - depth], [b, y]);
  }
  return out;
}

/**
 * Replace everything below `cutY` with an exact bottom edge and its tenons.
 *
 * The contour that comes back from the distance field is accurate but it is
 * still a traced curve, and a joint has to be a real dimension. Cutting the
 * contour where it runs down the two straight sides of the bar and splicing in
 * exact geometry keeps the joint exact while leaving the lettering alone.
 */
function spliceBottom(ring, { cutY, xL, xR, yBot, tenons, depth }) {
  const n = ring.length;
  if (n < 4) return ring;
  // Start from the top so the descent on the left comes before the climb on the
  // right; walking a counter-clockwise ring, that order is guaranteed.
  let top = 0;
  for (let i = 1; i < n; i++) if (ring[i][1] > ring[top][1]) top = i;
  const r = [];
  for (let i = 0; i < n; i++) r.push(ring[(top + i) % n]);

  let down = -1;
  for (let i = 0; i < n; i++) {
    if (r[i][1] >= cutY && r[(i + 1) % n][1] < cutY) { down = i; break; }
  }
  if (down < 0) return ring;
  let up = -1;
  for (let k = 1; k <= n; k++) {
    const i = (down + k) % n;
    if (r[i][1] < cutY && r[(i + 1) % n][1] >= cutY) { up = i; break; }
  }
  if (up < 0 || up <= down) return ring;

  return dedupe([
    ...r.slice(0, down + 1),
    [xL, cutY], [xL, yBot],
    ...tenonDips(yBot, tenons, depth),
    [xR, yBot], [xR, cutY],
    ...r.slice(up + 1),
  ]);
}

/** Closest pair of vertices between two rings, sampled so it stays cheap. */
function nearestPair(a, b, samples = 300) {
  const sa = Math.max(1, Math.floor(a.length / samples));
  const sb = Math.max(1, Math.floor(b.length / samples));
  let best = Infinity;
  let seg = null;
  for (let i = 0; i < a.length; i += sa) {
    for (let j = 0; j < b.length; j += sb) {
      const d = (a[i][0] - b[j][0]) ** 2 + (a[i][1] - b[j][1]) ** 2;
      if (d < best) { best = d; seg = [a[i][0], a[i][1], b[j][0], b[j][1]]; }
    }
  }
  return seg;
}

/**
 * Outline the lettering, then tie any floating piece back on.
 *
 * The dot of an i, the tittle of a j, the bar of a stroked letter - none of them
 * touch the letter they belong to, so on a cut-out they drop out of the sheet
 * and end up glued back by hand. A bridge is the standard fix: a deliberate thin
 * connector, thinner than a stem so it reads as a joint rather than as part of
 * the letterform. The alternative the tool offers is to leave them loose and say
 * how many there are.
 */
function outlineWelded({ strokes = [], glyphs = [] }, solids, weight, bridgeW) {
  const opts = { weight, solids, glyphs };
  let res = strokesToOutline(strokes, opts);
  const bridges = [];
  for (let round = 0; round < 3 && bridgeW > 0 && res.outers.length > 1; round++) {
    const main = res.outers[0];
    let added = 0;
    for (let i = 1; i < res.outers.length; i++) {
      const seg = nearestPair(res.outers[i], main);
      if (seg) { bridges.push(seg); added++; }
    }
    if (!added) break;
    res = strokesToOutline(strokes, {
      ...opts, bridges: { paths: bridges, weight: bridgeW },
    });
  }
  return { res, bridges: bridges.length };
}

/** Shift a list of per-letter contour groups. */
function shiftShapes(shapes, dx, dy) {
  return shapes.map((rings) => shiftPaths(rings, dx, dy));
}

/**
 * Average stroke width of a set of filled letters, in millimetres.
 *
 * Twice the area over the perimeter is exactly the width of a long thin strip,
 * and a letter is close enough to that for the number to be useful. It is the
 * one measurement that decides whether a face can be cut out at all: below about
 * 3 mm the letters break, and plenty of well-known faces are far below it -
 * Montserrat Regular comes out at 0.9 mm on a 34 mm capital.
 */
function meanStroke(shapes) {
  let area = 0;
  let per = 0;
  for (const rings of shapes) {
    for (const ring of rings) {
      let a = 0;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
        per += Math.hypot(ring[i] - ring[j], ring[i + 1] - ring[j + 1]);
      }
      area += Math.abs(a / 2);
    }
  }
  return per > 0 ? (2 * area) / per : 0;
}

/** Where the tenons go along a face of this width. */
export function tenonSpans(faceW, inset, minGapForTwo = 110) {
  const ins = clamp(inset, 3, Math.max(3, faceW * 0.3));
  const a = ins;
  const b = faceW - ins;
  if (b - a < 12) return [[faceW / 2 - 6, faceW / 2 + 6]];
  // One long tenon on a small stand; two on a wide one, so the base keeps a
  // bridge between the slots and does not flex while the glue goes off.
  if (b - a < minGapForTwo) return [[a, b]];
  const w = (b - a) * 0.36;
  return [[a, a + w], [b - w, b]];
}

/**
 * Solve the lettering down to a stand of a given overall size.
 *
 * Every length in the design scales together, so the natural size at the
 * current settings and the wanted size differ by a single factor. Measure one,
 * divide, and apply it to all of them - then the caller pins the outer
 * dimensions exactly, and the leftover goes into the margins where it belongs
 * rather than into a letter that is 0.4 mm off the size on the label.
 */
function fitToSize(p, faceData, face2Data) {
  const target = p.size === 'custom'
    ? { w: p.standW, h: p.standH }
    : sizeOf(p.size);
  if (!target || !(target.w > 0) || !(target.h > 0)) return { p, fitW: 0, fitH: 0 };

  const t = Math.max(0.5, p.thickness);
  const layers = clamp(Math.round(p.baseLayers), 1, 6);
  // The label measures the whole object: the base is as wide as the face plus
  // its overhang, and as tall as the boards it is stacked from.
  const fitW = target.w - p.overhang * 2;
  const fitH = target.h - layers * t;
  if (!(fitW > 20) || !(fitH > 8)) return { p, fitW: 0, fitH: 0 };

  const cap1 = Math.max(2, p.cap1);
  const cap2 = Math.max(2, p.cap2);
  const l1 = line(p.line1, cap1, faceData);
  const l2 = line(p.line2, cap2, face2Data);
  const silhouette = p.style === 'silhouette';
  const hasL2 = l2.paths.length > 0;
  const stackL2 = hasL2 && (!silhouette || p.line2Cut);
  const engraveL2 = silhouette && hasL2 && !p.line2Cut;
  const wide = Math.max(l1.advance, stackL2 ? l2.advance : 0);

  let w0;
  let h0;
  if (silhouette) {
    const w = isOutline(faceData) ? 0 : Math.max(0.6, p.weight);
    w0 = wide + w + Math.max(p.padX, w * 0.8) * 2;
    const barH = Math.max(w + 4,
      engraveL2 ? Math.max(p.barHeight, cap2 * 1.9 + 5) : p.barHeight);
    h0 = cap1 + barH - p.overlap;
  } else {
    w0 = wide + p.padX * 2;
    h0 = cap1 + (stackL2 ? p.lineGap + cap2 * 1.28 : cap1 * 0.28) + p.padY * 2;
  }
  if (!(w0 > 0) || !(h0 > 0)) return { p, fitW: 0, fitH: 0 };

  const s = Math.min(fitW / w0, fitH / h0);
  if (!Number.isFinite(s) || s <= 0) return { p, fitW: 0, fitH: 0 };
  const k = (v) => v * s;
  return {
    p: {
      ...p,
      cap1: k(cap1), cap2: k(cap2), capBase: k(Math.max(2, p.capBase)),
      lineGap: k(p.lineGap), padX: k(p.padX), padY: k(p.padY),
      barHeight: k(p.barHeight), overlap: k(p.overlap), weight: k(p.weight),
      corner: k(p.corner),
      // A bridge has a minimum useful width, but zero means zero - the user has
      // asked for the loose pieces to stay loose.
      bridge: p.bridge > 0 ? Math.max(1.5, k(p.bridge)) : 0,
    },
    fitW,
    fitH,
    fitScale: s,
  };
}

const EMPTY = {
  params: { ...DEFAULTS },
  panels: [],
  derived: {
    faceW: 0, faceH: 0, bodyH: 0, baseW: 0, baseD: 0, tenonDepth: 0,
    tenons: [], pieces: 0, loose: 0, holes: 0, standHeight: 0,
    cutLength: 0, engraveLength: 0, warnings: [], empty: true,
  },
};

export function buildStand(input = {}) {
  const raw = { ...DEFAULTS, ...input };
  const faceData = raw.faceData;
  if (!faceData) return EMPTY;
  // Line 2 is often a job title, and a title wants its own voice - so it gets
  // its own typeface, falling back to the name's when none is chosen.
  const face2Data = raw.faceData2 || faceData;
  const fitted = fitToSize(raw, faceData, face2Data);
  const p = fitted.p;
  const { fitW, fitH } = fitted;

  const t = Math.max(0.5, p.thickness);
  const layers = clamp(Math.round(p.baseLayers), 1, 6);
  // A single board is slotted right through, so the tenon runs the full
  // thickness and finishes flush underneath. A stack keeps its bottom board
  // solid, and the tenon only reaches the floor of the pocket that leaves.
  const tenonDepth = layers === 1 ? t : (layers - 1) * t;

  const l1 = line(p.line1, Math.max(2, p.cap1), faceData);
  const l2 = line(p.line2, Math.max(2, p.cap2), face2Data);
  if (!l1.paths.length && !l2.paths.length) return EMPTY;

  // ---- stack the two lines ------------------------------------------------
  // Line 1's baseline is the datum. Line 2 hangs below it by the gap the user
  // set, measured to line 2's cap line rather than its baseline - that is the
  // distance the eye actually reads, and it is what has to go negative before a
  // silhouette will hold together.
  //
  // A silhouette engraves line 2 on the bar rather than cutting it, unless the
  // user asks otherwise. That is not a shortcut - it is the design in the
  // examples: the big name is cut, the small line is burnt into the panel under
  // it. It is also the only arrangement that always holds together, because
  // every cut letter then sits directly on the bar.
  const cap2 = Math.max(2, p.cap2);
  const silhouette = p.style === 'silhouette';
  const hasL2 = l2.paths.length > 0;
  const stackL2 = hasL2 && (!silhouette || p.line2Cut);
  const engraveL2OnBar = silhouette && hasL2 && !p.line2Cut;

  const b1 = 0;
  const b2 = stackL2 ? b1 - p.lineGap - cap2 : b1;
  const textW = Math.max(l1.advance, stackL2 ? l2.advance : 0);
  const sh1 = alignShift(p.align, l1.advance, textW);
  const sh2 = alignShift(p.align, l2.advance, textW);
  const l1Paths = shiftPaths(l1.paths, sh1, b1);
  const l2Paths = stackL2 ? shiftPaths(l2.paths, sh2, b2) : [];
  const strokes = [...l1Paths, ...l2Paths];

  // The two lines can be set in different kinds of face, so they take different
  // routes into the distance field: a skeleton has to be given a thickness, a
  // real letter already has one. Both can be in the same field at once.
  const out1 = isOutline(faceData);
  const out2 = isOutline(face2Data);
  const cutStrokes = [...(out1 ? [] : l1Paths), ...(out2 ? [] : l2Paths)];
  const cutShapes = [
    ...(out1 ? shiftShapes(l1.shapes, sh1, b1) : []),
    ...(stackL2 && out2 ? shiftShapes(l2.shapes, sh2, b2) : []),
  ];
  const penW = Math.max(0.6, p.weight);
  // Whichever is thinner is the one that breaks, so that is the one to report.
  const shapeW = cutShapes.length ? meanStroke(cutShapes) : Infinity;
  const strokeW = cutStrokes.length ? penW : Infinity;
  const thinnest = Math.min(shapeW, strokeW);
  const cutStroke = Number.isFinite(thinnest) ? thinnest : penW;
  const ink = pathsBBox(strokes) || { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };

  // A skeleton face engraves as open lines the head follows; a real one engraves
  // as closed letter shapes that have to be filled in. Both can appear on the
  // same stand now, and they need different operations on the machine, so they
  // are kept apart from here all the way to the file.
  const engOpen = [];
  const engFill = [];
  const addEng = (paths, closed) => {
    if (paths.length) (closed ? engFill : engOpen).push(...paths);
  };

  const warnings = [];
  const panels = [];

  let faceOutline;
  let faceHoles = [];
  let faceLoose = [];
  let faceEngrave = [];
  let faceEngraveFill = [];
  let faceW;
  let bodyH;
  let bodyBottom;   // y of the shoulder that lands on the base
  let pieces = 1;
  let bridgeCount = 0;

  if (silhouette) {
    const w = cutStroke;
    const pad = Math.max(p.padX, w * 0.8);
    // A stroke face has to grow by half its width; an outline face is already
    // its own full width, so its ink extent is the real one.
    const grow = cutStrokes.length ? penW / 2 : 0;
    let barX0 = ink.x0 - grow - pad;
    let barX1 = ink.x1 + grow + pad;
    const barTop = (stackL2 ? b2 : b1) + p.overlap;
    let barH = Math.max(w + 4,
      engraveL2OnBar ? Math.max(p.barHeight, cap2 * 1.9 + 5) : p.barHeight);
    let barBottom = barTop - barH;
    // A chosen size is a promise about the finished object, so the bar takes up
    // whatever the lettering did not: it widens to the exact width and drops to
    // the exact height rather than leaving the stand a millimetre short.
    if (fitW > 0) {
      const c = (ink.x0 + ink.x1) / 2;
      barX0 = c - fitW / 2;
      barX1 = c + fitW / 2;
    }
    // Provisional only. The real bottom is set once the lettering has actually
    // been traced, because a traced curve peaks a hair below the ink extent the
    // layout reports and the stand would come out that hair short of its size.
    if (fitH > 0) {
      barBottom = ink.y1 + grow - fitH - 2;
      barH = barTop - barBottom;
    }
    if (engraveL2OnBar) {
      const need = l2.advance + 10;
      if (fitW <= 0 && barX1 - barX0 < need) {
        const c = (barX0 + barX1) / 2;
        barX0 = c - need / 2;
        barX1 = c + need / 2;
      }
      addEng(shiftPaths(l2.paths,
        (barX0 + barX1 - l2.advance) / 2, barBottom + (barH - cap2) / 2), out2);
    }

    const weld = outlineWelded(
      { strokes: cutStrokes, glyphs: cutShapes },
      [[barX0, barBottom, barX1, barTop]],
      penW,
      Math.max(0, Math.min(p.bridge, Math.max(w, 1.5))),
    );
    const res = weld.res;
    bridgeCount = weld.bridges;
    if (!res.outers.length) return EMPTY;

    // Now measure what was actually traced and drop the bar to put the finished
    // face at exactly the height on the label. Everything below the cut line is
    // replaced by exact geometry anyway, so moving it costs nothing.
    let top = -Infinity;
    for (const [, y] of res.outers[0]) if (y > top) top = y;
    if (fitH > 0) {
      barBottom = top - fitH;
      barH = barTop - barBottom;
    }
    // The bar spans the whole width, so at this height the only two crossings
    // are its own straight sides - which the distance field reproduces exactly.
    const cutY = barBottom + Math.min(1, barH / 4);
    const tenons = tenonSpans(barX1 - barX0, p.slotInset)
      .map(([a, b]) => [barX0 + a, barX0 + b]);

    faceOutline = spliceBottom(res.outers[0], {
      cutY, xL: barX0, xR: barX1, yBot: barBottom, tenons, depth: tenonDepth,
    });
    faceLoose = res.outers.slice(1);
    // A counter belongs to whichever piece contains it; every one of them is
    // just another ring to cut, so they all travel together.
    faceHoles = res.holes;
    pieces = res.outers.length;
    faceW = barX1 - barX0;
    bodyBottom = barBottom;
    bodyH = Math.max(...faceOutline.map(([, y]) => y)) - barBottom;

    if (w < 3) {
      warnings.push(`The letters average ${w.toFixed(1)} mm across - thin enough to `
        + 'snap when handled. '
        + (shapeW <= strokeW
          ? 'This typeface is too fine to cut out. Use a heavier one, raise the '
            + 'capital height, or switch to the plate style and engrave it.'
          : 'Raise the letter thickness.'));
    }
    if (pieces > 1) {
      warnings.push(`${pieces} separate pieces - ${pieces - 1} will drop out of the `
        + 'sheet loose. '
        + (stackL2
          ? 'Make line 2 a closer size to line 1 and push the line gap further '
            + 'negative so the two rows of letters actually touch, or engrave '
            + 'line 2 instead of cutting it.'
          : 'Thicken the letters or raise the bar so every letter reaches it.'));
    }
  } else {
    // Plate: a rounded rectangle sized around the type, not around the ink, so
    // a name with no descender is not a different height from one that has.
    const top = b1 + Math.max(2, p.cap1);
    const bottom = l2.paths.length
      ? b2 - Math.max(2, p.cap2) * 0.28
      : b1 - Math.max(2, p.cap1) * 0.28;
    faceW = fitW > 0 ? fitW : Math.max(textW + p.padX * 2, 20);
    bodyH = fitH > 0 ? fitH : Math.max(top - bottom + p.padY * 2, 12);
    // Centre the type block in whatever height the plate ended up with.
    bodyBottom = bottom - (bodyH - (top - bottom)) / 2;
    const x0 = -(faceW - textW) / 2;
    faceOutline = roundedRect(x0, bodyBottom, faceW, bodyH, p.corner);
    const tenons = tenonSpans(faceW, p.slotInset).map(([a, b]) => [x0 + a, x0 + b]);
    faceOutline = dedupe([...faceOutline, ...tenonDips(bodyBottom, tenons, tenonDepth)]);
    addEng(l1Paths, out1);
    addEng(l2Paths, out2);
    if (p.border) {
      const inset = Math.max(2.5, Math.min(p.padX, p.padY) * 0.45);
      const b = roundedRect(x0 + inset, bodyBottom + inset,
        faceW - inset * 2, bodyH - inset * 2, Math.max(0.5, p.corner - inset * 0.5));
      // A border is a line whatever the letters are - scanning it solid would
      // burn a filled frame rather than draw one.
      engOpen.push(ringToFlat(b));
    }
  }

  // ---- normalise the face and read the tenons back off it -----------------
  const fb = bbox(faceOutline);
  const dx = -fb.x0;
  const dy = -fb.y0;
  const mv = (ring) => ring.map(([x, y]) => [x + dx, y + dy]);
  faceOutline = mv(faceOutline);
  faceHoles = faceHoles.map(mv);
  faceLoose = faceLoose.map(mv);
  faceEngrave = shiftPaths(engOpen, dx, dy);
  faceEngraveFill = shiftPaths(engFill, dx, dy);
  const tenonsOnFace = tenonSpansOnFace(faceOutline, tenonDepth);

  panels.push({
    id: 'face',
    label: PANEL_LABELS.face,
    outline: faceOutline,
    holes: faceHoles,
    loose: faceLoose,
    engrave: faceEngrave,
    engraveFill: faceEngraveFill,
  });

  // ---- base ---------------------------------------------------------------
  const standHeight = layers * t + bodyH;
  // Deep enough that a knock does not tip it, shallow enough that it is not a
  // shelf. Six tenths of the standing height lands where the ones you can buy sit.
  const baseD = p.baseDepth > 0
    ? p.baseDepth
    : clamp(Math.round(standHeight * 0.7), 30, 100);
  const baseW = faceW + p.overhang * 2;
  const slotY = baseD * 0.58;
  const slotW = Math.max(0.3, t);

  const baseSlots = tenonsOnFace.map(([a, b]) => shrinkRect(
    a + p.overhang, slotY - slotW / 2, b - a, slotW, p.fit,
  ));

  // The base text sits in the strip in front of the slot - the only flat area
  // the finished stand shows you from the front.
  const baseEngrave = [];
  const baseEngraveFill = [];
  const bl = line(p.baseText, Math.max(2, p.capBase), faceData);
  if (bl.paths.length) {
    const frontStrip = slotY - slotW / 2;
    const bx = (baseW - bl.advance) / 2;
    const by = Math.max(3, (frontStrip - Math.max(2, p.capBase)) / 2);
    (out1 ? baseEngraveFill : baseEngrave).push(...shiftPaths(bl.paths, bx, by));
    if (bl.advance > baseW - 8) {
      warnings.push('The base text is wider than the base. Shrink it or widen the stand.');
    }
  }

  for (let i = 0; i < layers; i++) {
    // On a stack the bottom board is the floor of the pocket, so it is the only
    // one left solid. On a single board there is no floor: the slot goes
    // through and the tenon finishes flush underneath.
    const isBottom = layers > 1 && i === layers - 1;
    const isTop = i === 0;
    panels.push({
      id: layers === 1 ? 'base'
        : isBottom ? 'baseBottom' : isTop ? 'baseTop' : `baseMid${i}`,
      label: layers === 1 ? PANEL_LABELS.base
        : isBottom ? PANEL_LABELS.baseBottom
          : isTop ? PANEL_LABELS.baseTop : PANEL_LABELS.baseMid,
      outline: roundedRect(0, 0, baseW, baseD, p.corner),
      holes: isBottom ? [] : baseSlots,
      loose: [],
      engrave: isTop ? baseEngrave : [],
      engraveFill: isTop ? baseEngraveFill : [],
    });
  }

  // ---- checks worth making before anyone burns a sheet --------------------
  // Only worth saying on a stack. A single board is slotted right through, so
  // the whole thickness holds the face and there is nothing to deepen.
  if (layers > 1 && tenonDepth < 4) {
    warnings.push(`The socket is only ${tenonDepth.toFixed(1)} mm deep. Add a base `
      + 'layer, or drop to a single board and let the slot go straight through.');
  }
  if (baseD < standHeight * 0.3) {
    warnings.push('The base is shallow for this height - it will tip forward easily.');
  }
  if (faceW > 0 && p.overhang < 2) {
    warnings.push('Almost no overhang: the face lines up with the edge of the base.');
  }

  // ---- kerf ---------------------------------------------------------------
  const k = Math.max(0, p.kerf) / 2;
  let cutLength = 0;
  for (const pan of panels) {
    pan.outlineNominal = pan.outline;
    if (k > 0) {
      pan.outline = offsetPolygon(pan.outline, k);
      pan.holes = pan.holes.map((h) => offsetPolygon(h, -k));
      pan.loose = pan.loose.map((h) => offsetPolygon(h, k));
    }
    const bb = bbox(pan.outline);
    pan.size = { w: bb.w, h: bb.h };
    pan.thickness = t;
    for (const ring of [pan.outline, ...pan.holes, ...pan.loose]) {
      cutLength += ringLength(ring);
    }
  }

  return {
    params: { ...p, thickness: t, baseLayers: layers },
    panels,
    derived: {
      faceW, faceH: bodyH + tenonDepth, bodyH, baseW, baseD,
      tenonDepth, tenons: tenonsOnFace, layers,
      pieces, loose: faceLoose.length, holes: faceHoles.length, bridges: bridgeCount,
      cap1: p.cap1, cap2: p.cap2, cutStroke, fitScale: fitted.fitScale ?? 1,
      // Which engrave operations this job actually needs. Closed letter shapes
      // have to be filled - send those to a Line operation and the machine
      // traces round each letter and leaves it hollow. Open strokes are the
      // opposite: a Fill finds no enclosed area and marks nothing.
      engraveFill: panels.some((x) => x.engraveFill?.length),
      engraveLine: panels.some((x) => x.engrave.length),
      standHeight, textW,
      cutLength,
      engraveLength: polylineLength(
        panels.flatMap((x) => [...x.engrave, ...(x.engraveFill || [])]),
      ),
      warnings,
      empty: false,
    },
  };
}

/** Read the tenons back off a finished face outline, so they cannot drift. */
function tenonSpansOnFace(outline, depth) {
  if (!(depth > 0)) return [];
  const eps = 0.05;
  const xs = outline.filter(([, y]) => y < eps).map(([x]) => x).sort((a, b) => a - b);
  const spans = [];
  for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i], xs[i + 1]]);
  return spans;
}

/** A closed ring as a flat polyline that comes back to its start. */
function ringToFlat(ring) {
  const out = [];
  for (const [x, y] of ring) out.push(x, y);
  out.push(ring[0][0], ring[0][1]);
  return out;
}

export { ringArea, ringLength, polylineLength, pathsBBox, shiftPaths, ringToFlat };
