// Name keychain: a person's name cut out of one piece of sheet, with a hole
// for the split ring.
//
// It is the cake topper's problem with the stakes taken off and a harder
// promise put on. The lettering is welded into one shape by the same distance
// field - see outline.js, which does all of the real work - and then an offset
// is run round the whole word so it stops being letters and becomes an object
// with an edge. That offset is the difference between a keychain and a bag of
// loose letters, and it is the one control most of this file is arranged
// around.
//
// The promise is size. Somebody ordering a keychain is buying a 6 cm thing,
// not "whatever 20 mm capitals of Poppins comes to", so the length across is
// what is typed and the lettering is solved to fit it. The relation is a
// straight line - the piece is the lettering times a scale plus a fixed amount
// of margin, hole room and kerf - so it inverts in one division. That is why
// body.js reports its sizes as { a, b } terms rather than drawing itself first
// and being measured afterwards.
//
// Millimetres throughout, y-up, outer rings counter-clockwise.

import { bbox, growRing, ellipse } from './path.js';
import { layout, isOutline } from './text.js';
import { strokesToOutline, ringArea } from './outline.js';
import { weldTittles } from './tittle.js';
import {
  BODIES, bodyOf, isPlate, holeAxis, sizeTerms, plateRing, holeOnPlate,
} from './body.js';
import { narrowestNeck, wallAround, spansAt } from './measure.js';

export const DEFAULTS = {
  text: 'Aisyah',
  face: 'poppins',
  align: 'center',
  lineHeight: 100,        // % of cap height between baselines

  body: 'silhouette',     // see BODIES in body.js
  length: 62,             // mm across the FINISHED piece - the promise
  // 1.6 mm, and the number was walked to rather than picked. Below 1.4 the
  // default name stops welding on its own and the tool starts adding bridges;
  // at 2.4 it welds beautifully and every counter has closed up, so the name
  // reads as a blob. 1.6 is the first setting that needs no bridges, warns
  // about nothing, and still has a hole in the middle of the a.
  outline: 1.6,           // mm of material around the lettering
  weight: 4,              // single-line faces only: what the skeleton is drawn at
  corner: 3,              // mm, corner radius on the bar

  plateText: 'engrave',   // plate bodies: engrave | cut
  border: 'none',         // none | line - an engraved line inside the edge
  borderInset: 2,         // mm from the edge to that line

  holeD: 4,               // mm, the finished hole
  holeEnd: 'left',        // left | right | top | bottom
  holeInset: 4.5,         // mm from the edge of the piece to the hole's centre
  holeTab: true,          // silhouette only: grow a lug so the hole has a wall

  connect: 'auto',        // auto | none - tie back anything left floating
  bridge: 1.6,            // mm across a bridge

  thickness: 3,
  kerf: 0.2,
};

/**
 * How thin the piece may get before it stops surviving a pocket.
 *
 * A keychain is not looked at, it is carried. It goes in with a bunch of keys,
 * it gets levered, sat on and dropped on tile, and in 3 mm ply or acrylic
 * anything under about two millimetres across snaps inside a month. Two is not
 * a comfortable margin - it is the floor - which is why the tool says the
 * number rather than only whether it passed.
 */
export const MIN_NECK = 2.0;

/**
 * And more than that around the ring hole, because the hole is where the whole
 * load goes. Everything the keychain is ever pulled by passes through that
 * wall; a neck somewhere in the middle of a word carries almost nothing.
 */
export const MIN_WALL = 2.5;

export const HOLE_ENDS = [
  ['left', 'Left'],
  ['right', 'Right'],
  ['top', 'Top'],
  ['bottom', 'Bottom'],
];

export const PLATE_TEXT = [
  ['engrave', 'Engraved'],
  ['cut', 'Cut through'],
];

/**
 * Sizes people actually order, as whole settings rather than words alone.
 *
 * A preset that only fills in the name is a trap, and the cake topper learned
 * it the hard way: length, offset and hole are not decoration, they are what
 * decides whether the piece comes off the sheet in one bit and whether the
 * ring tears out. So each of these carries its own numbers, and there is a
 * test that builds every one of them and fails if any warns.
 */
export const PRESETS = [
  {
    id: 'name',
    name: 'Name',
    note: 'The plain one. A name in Poppins welded by a 1.6 mm offset, 6 cm '
      + 'across, ring on the left.',
    params: {
      text: 'Aisyah', face: 'poppins', body: 'silhouette', length: 62,
      outline: 1.6, holeEnd: 'left', holeD: 4, holeInset: 4.5,
    },
  },
  {
    id: 'script',
    name: 'Script',
    note: 'Lobster is heavy and its letters already touch, so it takes barely '
      + 'any offset - 0.8 mm. Run it up and the counters close and the name '
      + 'reads as a blob.',
    params: {
      text: 'Nadia', face: 'lobster', body: 'silhouette', length: 70,
      outline: 0.8, holeEnd: 'left', holeD: 4, holeInset: 5.5,
    },
  },
  {
    id: 'bagtag',
    name: 'Bag tag',
    note: 'A tag with a round nose, the name engraved rather than cut. What '
      + 'goes on a school bag - the engraving cannot snag or snap off.',
    params: {
      text: 'Muhammad Danish', face: 'bebas-neue', body: 'tag',
      plateText: 'engrave', border: 'line', borderInset: 2.2,
      length: 76, outline: 5, holeEnd: 'left', holeD: 4.5, holeInset: 6,
      corner: 3,
    },
  },
  {
    id: 'round',
    name: 'Round',
    note: 'A disc with the name engraved across it and the ring at the top. '
      + 'Short names only - a long one makes the disc enormous.',
    params: {
      text: 'Aiman', face: 'bebas-neue', body: 'circle', plateText: 'engrave',
      length: 45, outline: 5, holeEnd: 'top', holeD: 4, holeInset: 5,
    },
  },
  {
    id: 'bar',
    name: 'Bar',
    note: 'A rounded bar with two lines engraved on it - a name and whatever '
      + 'goes under it. The strongest shape here.',
    params: {
      text: 'Nur Aisyah\n012-345 6789', face: 'poppins', body: 'rounded',
      plateText: 'engrave', border: 'none', length: 70, outline: 4.5,
      lineHeight: 150, holeEnd: 'left', holeD: 4, holeInset: 5.5, corner: 3,
    },
  },
  {
    id: 'luggage',
    name: 'Luggage',
    note: 'Big enough to read across a carousel, with the border line inside '
      + 'the edge and the ring at the top.',
    params: {
      text: 'RAHMAN\n+60 12 345 6789', face: 'blue-highway', body: 'rounded',
      plateText: 'engrave', border: 'line', borderInset: 2.5,
      length: 90, outline: 6, lineHeight: 160, holeEnd: 'top', holeD: 5,
      holeInset: 6.5, corner: 4,
    },
  },
];

/** A preset as a complete parameter set; the sheet on the bed is not part of it. */
export function presetParams(preset, sheet = {}) {
  return {
    ...DEFAULTS,
    ...preset.params,
    thickness: sheet.thickness ?? DEFAULTS.thickness,
    kerf: sheet.kerf ?? DEFAULTS.kerf,
  };
}

/** Is the design on screen still this preset, whole? */
export function matchesPreset(preset, params) {
  const want = presetParams(preset, params);
  return Object.keys(want).every((k) => params[k] === want[k]);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * clamp, for a number that might not be one.
 *
 * Settings come back out of a saved project, and a project is a lump of JSON
 * in the browser's storage that anything could have written. Math.min on NaN
 * is NaN, one bad field turns every coordinate in the piece into NaN, and the
 * tool throws while drawing rather than showing anything at all.
 */
const num = (v, lo, hi, fallback) => (Number.isFinite(v)
  ? Math.max(lo, Math.min(hi, v))
  : fallback);

const EMPTY = {
  params: { ...DEFAULTS },
  panels: [],
  derived: {
    width: 0, height: 0, textWidth: 0, textHeight: 0, capMM: 0, lines: 0,
    neck: 0, wall: 0, holeAt: null, pieces: 0, loose: 0, holes: 0, bridges: 0,
    cutLength: 0, engraveLength: 0, engraveFill: false, engraveLine: false,
    plate: false, warnings: [], empty: true,
  },
};

const toPairs = (flat) => {
  const out = new Array(flat.length / 2);
  for (let i = 0; i < flat.length; i += 2) out[i / 2] = [flat[i], flat[i + 1]];
  return out;
};

const toFlat = (pairs) => {
  const out = new Array(pairs.length * 2);
  for (let i = 0; i < pairs.length; i++) {
    out[i * 2] = pairs[i][0];
    out[i * 2 + 1] = pairs[i][1];
  }
  return out;
};

function shiftFlat(ring, dx, dy) {
  const out = new Array(ring.length);
  for (let k = 0; k < ring.length; k += 2) {
    out[k] = ring[k] + dx;
    out[k + 1] = ring[k + 1] + dy;
  }
  return out;
}

const scaleFlat = (ring, s) => ring.map((v) => v * s);

function flatBox(groups) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of groups) {
    for (const r of g) {
      for (let k = 0; k < r.length; k += 2) {
        if (r[k] < x0) x0 = r[k];
        if (r[k] > x1) x1 = r[k];
        if (r[k + 1] < y0) y0 = r[k + 1];
        if (r[k + 1] > y1) y1 = r[k + 1];
      }
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : null;
}

/** Shortest link between two rings of [x, y] pairs, as [ax, ay, bx, by]. */
function nearestPair(a, b, samples = 260) {
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
 * Outline everything, then tie back whatever is still floating.
 *
 * With a decent offset almost nothing is: growing the letters by a couple of
 * millimetres closes the gaps between them, which is the same trick the cake
 * topper uses and the reason neither tool needs a polygon union. What is left
 * is the dot on an i that tittle.js could not pull down, and the odd letter in
 * a face that stands its letters far apart. Those get a bridge, because a
 * keychain that arrives in two pieces is not a keychain.
 */
function weld(strokes, opts, connect, bridgeW) {
  let res = strokesToOutline(strokes, opts);
  if (connect === 'none' || !(bridgeW > 0)) return { res, bridges: 0, span: 0 };
  const links = [];
  for (let round = 0; round < 3 && res.outers.length > 1; round++) {
    const main = res.outers[0];
    let added = 0;
    for (const o of res.outers.slice(1)) {
      const seg = nearestPair(o, main);
      if (seg) { links.push(seg); added++; }
    }
    if (!added) break;
    res = strokesToOutline(strokes, {
      ...opts, bridges: { paths: links, weight: bridgeW },
    });
  }
  const span = links.reduce(
    (m, s) => Math.max(m, Math.hypot(s[2] - s[0], s[3] - s[1])), 0,
  );
  return { res, bridges: links.length, span };
}

function ringLength(ring) {
  let d = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    d += Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
  }
  return d;
}

function flatLength(paths) {
  let d = 0;
  for (const st of paths) {
    for (let k = 2; k < st.length; k += 2) {
      d += Math.hypot(st[k] - st[k - 2], st[k + 1] - st[k - 1]);
    }
  }
  return d;
}

// ---------------------------------------------------------------------------

export function buildKeychain(input = {}) {
  const p = { ...DEFAULTS, ...input };
  const face = p.faceData;
  if (!face) return EMPTY;

  const lines = String(p.text ?? '').split(/\r?\n/).map((l) => l.replace(/\t/g, ' '));
  if (!lines.some((l) => l.trim())) return EMPTY;

  // ---- lay the lines out at a nominal size, and measure them there --------
  // Scaling the finished geometry afterwards is exact and lays the text out
  // once rather than once per trial size.
  const NOMINAL = 100;
  const laid = lines.map((l) => (l.trim()
    ? layout({ text: l, capHeight: NOMINAL, faceData: face, align: 'left' })
    : null));
  const widest = Math.max(1, ...laid.map((r) => (r ? r.advance : 0)));
  const step = NOMINAL * (num(p.lineHeight, 40, 400, 100) / 100);
  const outlineFace = isOutline(face);

  const groups = [];
  const strokePaths = [];
  laid.forEach((r, i) => {
    if (!r) return;
    const dx = p.align === 'center' ? (widest - r.advance) / 2
      : p.align === 'right' ? widest - r.advance : 0;
    const dy = -i * step;
    if (outlineFace) {
      // shiftFlat first, so weldTittles is handed fresh arrays and never writes
      // into the glyph data the face cache is holding on to.
      for (const rings of r.shapes) {
        groups.push(weldTittles(rings.map((ring) => shiftFlat(ring, dx, dy))));
      }
    } else {
      for (const st of r.paths) strokePaths.push(shiftFlat(st, dx, dy));
    }
  });

  const unit = outlineFace ? flatBox(groups) : flatBox([strokePaths]);
  if (!unit || !(unit.w > 0)) return EMPTY;

  const kerf = Math.max(0, num(p.kerf, 0, 2, DEFAULTS.kerf));
  const grow = num(p.outline, 0, 30, DEFAULTS.outline);
  const pen = Math.max(0.4, num(p.weight, 0.4, 30, DEFAULTS.weight));
  const holeD = num(p.holeD, 1, 20, DEFAULTS.holeD);
  const plate = isPlate(p.body);
  const axis = holeAxis(p.holeEnd);
  const length = num(p.length, 15, 400, DEFAULTS.length);

  // How far the drawn shape reaches past the layout box. On a single-line face
  // the skeleton is a centreline, so half the pen is added before anything
  // else is; a real typeface arrives as filled contours and reaches no further
  // than its own outline.
  const penPad = outlineFace ? 0 : pen / 2;

  // How fine the distance field is traced at.
  //
  // outline.js picks its own pitch from the size of the artwork, and for a sign
  // a metre wide that is the right instinct. On a keychain it lands around
  // 0.07 mm, which is a third of the width of the beam that will cut it - all
  // of the cost and none of the accuracy. A tenth of a millimetre is already
  // finer than anything the machine can hold, and it turns a trace that took
  // 130 ms into one that takes 40, which is the difference between a preview
  // that follows typing and one that lags a third of a second behind it.
  const cell = Math.max(0.08, Math.min(0.25, length / 600));

  const warnings = [];
  const result = plate
    ? buildPlate({
      p, groups, strokePaths, unit, outlineFace, penPad, pen, grow, kerf,
      holeD, axis, length, cell, warnings,
    })
    : buildSilhouette({
      p, groups, strokePaths, unit, outlineFace, penPad, pen, grow, kerf,
      holeD, axis, length, cell, warnings,
    });
  if (!result) return EMPTY;

  const {
    outers, holes, loose, engrave, engraveFill, holeAt, holeRing, holeR, capMM,
    ink, bridges, span,
  } = result;

  // ---- what will break ---------------------------------------------------
  // Measured on the nominal shape, before kerf compensation moves every edge.
  // That is deliberate: kerf compensation exists precisely so the part that
  // comes off the machine matches the nominal, so the nominal is the thing the
  // numbers should describe. Measuring the cut path instead would report the
  // outline half a beam too fat and the ring hole half a beam too thin, and
  // both would be wrong about the piece in your hand.
  const neck = narrowestNeck(outers, holes);
  const wall = holeAt
    ? wallAround(holeAt[0], holeAt[1], holeR,
      [...outers, ...holes.filter((r) => r !== holeRing), ...loose])
    : Infinity;

  // ---- kerf --------------------------------------------------------------
  // Half a beam outside the part on every edge. On the outline that means a
  // bigger ring; on a hole it means a SMALLER one, because the beam eats its
  // way outwards from the path into the material around the hole - so a 4 mm
  // ring hole is cut at 3.8 and comes out at 4. growRing does the winding
  // bookkeeping, since counters come back clockwise from the outliner and
  // asking for a negative offset on one of those widens it instead.
  const k = kerf / 2;
  const box = bbox([...outers.flat(), ...holes.flat(), ...loose.flat()]);
  const dx = -box.x0;
  const dy = -box.y0;
  const mv = (ring) => ring.map(([x, y]) => [x + dx, y + dy]);
  const mvFlat = (r) => shiftFlat(r, dx, dy);

  let cutOuter = outers.map(mv);
  let cutHoles = holes.map(mv);
  let cutLoose = loose.map(mv);
  if (k > 0) {
    cutOuter = cutOuter.map((r) => growRing(r, k));
    cutLoose = cutLoose.map((r) => growRing(r, k));
    cutHoles = cutHoles.map((r) => growRing(r, -k));
  }

  const size = bbox([...cutOuter.flat(), ...cutHoles.flat()]);
  const engraveOut = engrave.map(mvFlat);
  const fillOut = engraveFill.map(mvFlat);

  const holeC = holeAt ? [holeAt[0] + dx, holeAt[1] + dy] : null;
  const pieces = cutOuter.length;
  if (pieces > 1) {
    warnings.push(`This comes off the sheet in ${pieces} pieces. Raise the `
      + 'offset until the letters merge, close up the line height, or set '
      + 'Connect to bridge what is left.');
  }
  if (Number.isFinite(neck.mm) && neck.mm < MIN_NECK) {
    warnings.push(`The narrowest part measures ${neck.mm.toFixed(1)} mm. Below `
      + `about ${MIN_NECK} mm a keychain snaps in a pocket. Raise the offset, `
      + 'or make the piece longer.');
  }
  if (holeC) {
    if (!(wall > 0)) {
      warnings.push('The ring hole breaks out through the edge. Move it further '
        + 'in, make it smaller, or turn the lug on.');
    } else if (wall < MIN_WALL - 0.05) {
      warnings.push(`Only ${wall.toFixed(1)} mm of material is left around the `
        + `ring hole. That is where a keychain tears; ${MIN_WALL} mm is the `
        + 'least it wants.');
    }
  }
  if (cutLoose.length) {
    warnings.push(`${cutLoose.length} loose ${cutLoose.length === 1 ? 'piece' : 'pieces'} `
      + 'will drop out of the sheet - the middles of letters like o and a. That '
      + 'is normal for cut-through text; keep them or sweep them up.');
  }
  if (Math.abs(size.w - length) > 0.6) {
    warnings.push(`This came out ${size.w.toFixed(1)} mm across rather than the `
      + `${length} mm asked for - something has a minimum size that the length `
      + 'cannot go under. Lengthen it, or use less offset.');
  }

  let cutLength = 0;
  for (const ring of [...cutOuter, ...cutHoles, ...cutLoose]) cutLength += ringLength(ring);

  return {
    params: { ...p },
    panels: [{
      id: 'keychain',
      label: 'Keychain',
      outline: cutOuter[0],
      holes: cutHoles,
      loose: [...cutOuter.slice(1), ...cutLoose],
      engrave: engraveOut,
      engraveFill: fillOut,
      size: { w: size.w, h: size.h },
      thickness: p.thickness,
    }],
    derived: {
      width: size.w,
      height: size.h,
      textWidth: ink.w,
      textHeight: ink.h,
      capMM,
      lines: laid.filter(Boolean).length,
      plate,
      neck: Number.isFinite(neck.mm) ? neck.mm : 0,
      neckAt: neck.at,
      wall: Number.isFinite(wall) ? wall : 0,
      holeAt: holeC,
      holeR,
      pieces,
      loose: cutLoose.length,
      holes: cutHoles.length,
      bridges,
      bridgeSpan: span,
      cutLength,
      engraveLength: flatLength(engraveOut),
      engraveLine: engraveOut.length > 0,
      engraveFill: fillOut.length > 0,
      warnings,
      empty: false,
    },
  };
}

// ---------------------------------------------------------------------------
// The word itself, offset into a piece.

function buildSilhouette(c) {
  const {
    p, groups, strokePaths, unit, outlineFace, penPad, pen, grow, kerf,
    holeD, axis, length, cell, warnings,
  } = c;

  // The offset reaches `grow` past the drawn letters, and the drawn letters
  // reach `penPad` past the layout box. Kerf adds half a beam on each side.
  // Everything else is the lettering, so the scale falls straight out.
  const pad = grow + penPad;
  const fixed = pad * 2 + kerf;
  const s = (length - fixed) / unit.w;
  if (!(s > 0)) {
    warnings.push(`At ${length} mm across there is no room left for letters - `
      + `the offset alone accounts for ${fixed.toFixed(1)} mm. Make it longer, `
      + 'or use less offset.');
    return null;
  }

  const glyphs = groups.map((g) => g.map((r) => scaleFlat(r, s)));
  const strokes = strokePaths.map((r) => scaleFlat(r, s));
  const ink = outlineFace ? flatBox(glyphs) : flatBox([strokes]);

  const opts = { weight: pen, glyphs, grow, cell };
  const bridgeW = clamp(num(p.bridge, 0, 10, DEFAULTS.bridge), 0, 10);
  let { res, bridges, span } = weld(strokes, opts, p.connect, bridgeW);
  if (!res.outers.length) return null;

  // ---- where the ring goes -----------------------------------------------
  const holeR = holeD / 2;
  const tabOn = Boolean(p.holeTab);
  // The lug is the hole plus a wall, and the wall follows the offset the user
  // chose rather than a constant: a chunky keychain deserves a chunky lug, and
  // a fine one would look wrong with a fat blob on the end of it.
  // Plus a tenth for the tracing. A contour that came out of a grid sits up to
  // half a cell inside the true level, so a lug drawn to exactly MIN_WALL
  // measures a hair under it afterwards and the tool warns about a wall it
  // just built itself. Rather than loosening the check, the lug is built a
  // little over.
  const tabR = holeR + Math.max(MIN_WALL, grow) + 0.1;
  // With the lug on, the hole cannot sit closer to the edge than the lug's own
  // radius - it IS the edge there. Clamping rather than warning, because the
  // alternative is a control whose lower half silently does nothing.
  const insetFloor = tabOn ? tabR : 0;
  const inset = Math.max(insetFloor, num(p.holeInset, 0, 200, DEFAULTS.holeInset));

  const outer0 = bbox(res.outers.flat());
  const along = (() => {
    switch (p.holeEnd) {
      case 'left': return outer0.x0 + inset;
      case 'right': return outer0.x1 - inset;
      case 'bottom': return outer0.y0 + inset;
      default: return outer0.y1 - inset;
    }
  })();
  // Across the piece, the hole is centred on whatever material is there at
  // that station - not on the middle of the word. On "Aisyah" with the ring on
  // the left, that station cuts the two legs of the A, and the middle of the
  // pair is where a lug welds to both of them. The middle of the whole word
  // would be somewhere down in the descender of the y.
  const spans = spansAt(res.outers, axis, along);
  const across = spans.length
    ? (Math.min(...spans.map((v) => v[0])) + Math.max(...spans.map((v) => v[1]))) / 2
    : (axis === 'x' ? (ink.y0 + ink.y1) / 2 : (ink.x0 + ink.x1) / 2);
  const holeAt = axis === 'x' ? [along, across] : [across, along];

  if (tabOn) {
    // The lug is welded in as a contour and grows with everything else, so it
    // is drawn `grow` smaller than it needs to end up. Below that it would be
    // swallowed entirely, which is fine - it means the offset alone already
    // leaves more material there than the lug was going to add.
    const seed = tabR - grow;
    if (seed > 0.15) {
      const disc = [toFlat(ellipse(holeAt[0], holeAt[1], seed, seed, 64))];
      const w2 = weld(strokes, { ...opts, glyphs: [...glyphs, disc] },
        p.connect, bridgeW);
      if (w2.res.outers.length) {
        res = w2.res;
        bridges = w2.bridges;
        span = w2.span;
      }
    }
  }

  const holeRing = ellipse(holeAt[0], holeAt[1], holeR, holeR, 48);
  const capMM = 100 * s;

  // No border line here, and it is a deliberate omission rather than an
  // oversight. Insetting a line inside a letter silhouette means offsetting a
  // five-hundred-point contour full of concave corners, which folds back on
  // itself at every stem narrower than twice the inset and comes out as a knot
  // of loops. The border belongs on the plain bodies, where the edge is a
  // shape this tool drew and can offset cleanly.
  return {
    outers: res.outers,
    holes: [...res.holes, holeRing],
    loose: [],
    engrave: [],
    engraveFill: [],
    holeAt,
    holeRing,
    holeR,
    capMM,
    ink,
    bridges,
    span,
  };
}

// ---------------------------------------------------------------------------
// A plain body with the name put on it.

function buildPlate(c) {
  const {
    p, groups, strokePaths, unit, outlineFace, penPad, pen, grow, kerf,
    holeD, axis, length, cell, warnings,
  } = c;

  const cut = p.plateText === 'cut';
  const holeR = holeD / 2;
  // The hole may not sit closer to the edge than a wall's worth. On a plate
  // this is a real guarantee rather than a warning: the edge is a shape the
  // tool drew, so it can simply be drawn far enough away.
  const inset = Math.max(holeR + MIN_WALL, num(p.holeInset, 0, 200, DEFAULTS.holeInset));
  // Cut letters carry the pen's width; engraved ones are a mark with no
  // material of their own, so only the cut ones push the margin out.
  //
  // And they are NOT fattened, which was tried and is worth recording as a
  // dead end. Growing letters is what makes a silhouette strong, because there
  // the letters are the material. Punched out of a plate they are the opposite
  // - they are the holes - so growing them narrows the rib between one letter
  // and the next, and a plate whose narrowest part measured 0.95 mm measured
  // 0.20 mm after being "strengthened". Cut-through text is made strong by a
  // heavy face on a big plate, or it is engraved instead.
  const pad = grow + (cut ? penPad : 0);
  // How far in from the ring end the lettering may start: past the hole, plus
  // a wall.
  const room = inset + holeR + Math.max(pad, MIN_WALL);

  const terms = sizeTerms(p.body, unit, { pad, room, axis });
  let s = Infinity;
  for (const t of terms) s = Math.min(s, (length - kerf - t.b) / t.a);
  if (!(s > 0)) {
    warnings.push(`At ${length} mm across there is no room left for letters once `
      + 'the margin and the ring have taken theirs. Make it longer, use less '
      + 'margin, or move the ring to the top.');
    return null;
  }

  const glyphs = groups.map((g) => g.map((r) => scaleFlat(r, s)));
  const strokes = strokePaths.map((r) => scaleFlat(r, s));
  const ink = outlineFace ? flatBox(glyphs) : flatBox([strokes]);

  const across = holeD + MIN_WALL * 2;
  const built = plateRing(p.body, ink, {
    pad,
    room,
    axis,
    end: p.holeEnd,
    corner: num(p.corner, 0, 40, DEFAULTS.corner),
    minH: axis === 'x' ? across : 0,
    minW: axis === 'y' ? across : 0,
  });
  const body = built.ring;
  const [tx, ty] = built.shift;

  const placedGlyphs = glyphs.map((g) => g.map((r) => shiftFlat(r, tx, ty)));
  const placedStrokes = strokes.map((r) => shiftFlat(r, tx, ty));

  const holeAt = holeOnPlate(body, p.holeEnd, inset);
  const holeRing = ellipse(holeAt[0], holeAt[1], holeR, holeR, 48);

  const holes = [holeRing];
  const loose = [];
  const engrave = [];
  const engraveFill = [];
  let bridges = 0;

  if (cut) {
    // The letters are punched out of the plate. Their outlines become holes;
    // their counters - the middle of an o, the eye of an e - become islands
    // that drop out of the sheet, which is what a stencil always does. They
    // are reported rather than silently deleted or silently kept.
    const res = strokesToOutline(placedStrokes, {
      weight: pen, glyphs: placedGlyphs, grow: 0, cell,
    });
    for (const o of res.outers) holes.push(o);
    for (const h of res.holes) loose.push(h);
    bridges = 0;
  } else if (outlineFace) {
    // A real typeface engraves as the closed outline of every letter, which the
    // machine has to scan solid. Sent to a line operation it would trace round
    // each letter and leave it hollow, so it goes on its own layer.
    for (const g of placedGlyphs) for (const r of g) engraveFill.push([...r, r[0], r[1]]);
  } else {
    // A single-line face engraves as exactly the path the head follows.
    for (const st of placedStrokes) engrave.push(st);
  }

  if (p.border === 'line') {
    const inner = growRing(body, -Math.max(0.2, num(p.borderInset, 0.2, 20, 2)));
    if (inner.length > 3) engrave.push(toFlat([...inner, inner[0]]));
  }

  const box = bbox(body);
  if (box.h < across - 0.01 && axis === 'x') {
    warnings.push('The body had to be made taller than the lettering needs, so '
      + 'the ring hole has a wall around it.');
  }

  return {
    outers: [body],
    holes,
    loose,
    engrave,
    engraveFill,
    holeAt,
    holeRing,
    holeR,
    capMM: 100 * s,
    ink,
    bridges,
    span: 0,
  };
}

export { BODIES, bodyOf, isPlate, ringArea, narrowestNeck, wallAround };
