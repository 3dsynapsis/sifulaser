// Cake topper: a name cut out in one piece, standing on stakes pushed into a cake.
//
// It is the same machine as the name stand's cut-out face - lettering welded
// into a single shape by a distance field - with the base swapped for stakes and
// two things the stand never needed.
//
// The first is thickening. A topper is nearly always set in a script, and a
// script at 6 inches wide has strokes around a millimetre. That will not survive
// being pushed into a cake, let alone washed. Growing the shape fixes it, and in
// a distance field growing is free: the field already holds the distance to the
// nearest ink, so a millimetre of thickening is a millimetre off the level being
// traced. It also does a second job - it drags neighbouring letters and
// overlapping lines into contact.
//
// The second is that lines are meant to overlap. The line height defaults below
// 100% on purpose, because a topper is one piece: "Happy" has to physically
// touch "Birthday" or it falls on the floor on the way to the table.
//
// Millimetres throughout, y-up, outer rings counter-clockwise.

import { growRing, bbox } from './path.js';
import { layout, isOutline } from './text.js';
import { strokesToOutline, ringArea } from './outline.js';
import {
  borderOf, fitWidth, innerRadius, lowestY, shiftGroups,
} from './border.js';
import { weldTittles } from './tittle.js';

export const DEFAULTS = {
  text: 'Happy\nBirthday\nAisyah',
  face: 'great-vibes',
  align: 'center',

  width: 120,            // mm across the whole topper; suits a 6 inch cake
  lineHeight: 72,        // % of cap height between baselines; under 100 overlaps
  // Not zero. At the standard 12 cm a script this fine measures 2.45 mm, which
  // is under the 2.5 mm a topper needs to survive being pushed into a cake -
  // so with no thickening the tool would open on a warning about itself. 1.2 is
  // where the default both clears that and stops needing bridges at all.
  thicken: 1.2,          // mm added all round the lettering
  weight: 4,             // stroke faces only: what a skeleton gets fattened to

  border: 'none',        // see BORDERS in border.js
  fill: 100,             // % of the room inside the frame the lettering takes
  borderWidth: 5,        // mm across the band of the frame itself

  connect: 'dots-and-letters',   // dots-and-letters | dots | none
  bridge: 2.5,           // mm across a bridge

  stakes: 2,             // 0, 1 or 2
  stakeLength: 55,       // mm the stake stands proud below the lettering
  stakeWidth: 9,         // mm across the stake where it meets the text
  stakeTaper: 40,        // % narrower at the tip
  stakeSpread: 55,       // % of the width between two stakes
  stakeSnap: true,       // slide each stake under the nearest letter

  thickness: 3,
  kerf: 0.2,
};

/**
 * The two cake sizes worth offering, and where the numbers come from.
 *
 * A topper is not sized in the abstract - it is sized against the cake, and the
 * rule the trade uses is that it should be an inch or two narrower than the top
 * tier, so a border of icing still shows around it. Anything wider hangs over
 * the edge and looks like a mistake.
 *
 * Six and eight inches are the two birthday cakes almost everybody buys, so
 * those are the two here. Everything else is what the width box is for.
 */
export const CAKE_SIZES = [
  { id: 'cake6', name: '12 cm', cake: 152, width: 120 },
];

export const cakeSizeOf = (id) => CAKE_SIZES.find((c) => c.id === id) || null;

/** Which standard size a width corresponds to, if any. */
export const cakeSizeFor = (mm) => CAKE_SIZES.find((c) => Math.abs(c.width - mm) < 0.5) || null;

/** Cast acrylic is what these are made from, and the reason is not cosmetic. */
export const MIN_STROKE = 2.5;   // mm; thinner than this snaps in 3 mm acrylic

export const CONNECT_MODES = [
  ['dots-and-letters', 'Dots and letters'],
  ['dots', 'Dots only'],
  ['none', 'Nothing'],
];

/**
 * The occasions people actually order, each as a whole set of settings.
 *
 * A preset that only fills in the words is a trap. Width, line height and
 * thickening are not decoration here - they are what decides whether the piece
 * comes off the sheet in one piece and whether the strokes survive being pushed
 * into a cake. Drop three lines of Grand Hotel into the width and thickening
 * somebody last used for two lines of Lobster and the result is either in bits
 * or too fine to handle, and it arrives with a warning attached. So every one of
 * these carries the numbers that go with its own words.
 *
 * The numbers are not guesses either. Each was walked up from the lightest
 * thickening that builds clean and left at the first setting that needs no
 * connectors at all, or as close to that as the words allow - and there is a
 * test that builds all eight and fails if any of them warns about anything.
 *
 * The names are placeholders and are meant to be typed over. They are real
 * names rather than "NAME" because a preset should show what the thing looks
 * like, and a row of capitals in a script face does not.
 */
export const PRESETS = [
  {
    id: 'birthday',
    name: 'Happy Birthday',
    note: 'Three lines in Great Vibes, overlapping at 80%.',
    params: {
      text: 'Happy\nBirthday\nAisyah',
      face: 'great-vibes',
      width: 120,
      lineHeight: 90,
      thicken: 0.5,
      // Two thin connectors rather than the fatter letters it would take to
      // do without them. Deliberate: the point of Great Vibes is its
      // hairlines, and thickening far enough to weld every letter buries them.
      bridge: 0.5,
      stakes: 1,
      stakeLength: 50,
      stakeWidth: 5,
    },
  },
  {
    id: 'hari-jadi',
    name: 'Selamat Hari Jadi',
    note: 'The same in Malay. Wider, because "Hari Jadi" is a longer line.',
    params: {
      text: 'Selamat\nHari Jadi\nAisyah',
      face: 'great-vibes',
      width: 120,
      lineHeight: 90,
      thicken: 0.5,
      stakes: 1,
      stakeLength: 50,
      stakeWidth: 5,
    },
  },
  {
    id: 'nikah',
    name: 'Nikah',
    note: 'Two names and an ampersand. Taller than it is wide, so the stakes '
      + 'sit close in under the lettering rather than out at the edges.',
    params: {
      text: 'Aiman\n&\nNadia',
      face: 'great-vibes',
      width: 120,
      lineHeight: 90,
      thicken: 0.5,
      stakes: 1,
      stakeLength: 50,
      stakeWidth: 5,
    },
  },
  {
    id: 'nikah-2',
    name: 'Nikah 2',
    note: 'The same two names inside a leafy ring. The frame carries the piece, '
      + 'so the script keeps its hairlines instead of being fattened until it '
      + 'welds to itself.',
    params: {
      text: 'Amirul\n&\nSofea',
      face: 'great-vibes',
      border: 'vine',
      borderWidth: 5,
      width: 120,
      lineHeight: 90,
      thicken: 0.5,
      bridge: 0.5,
      stakes: 1,
      stakeLength: 50,
      stakeWidth: 5,
    },
  },
  {
    id: 'aqiqah',
    name: 'Aqiqah',
    note: 'Two lines, the second a full name. Wide and shallow, so the stakes '
      + 'go well apart.',
    params: {
      text: 'Aqiqah\nMuhammad Danish',
      face: 'great-vibes',
      width: 120,
      lineHeight: 90,
      thicken: 0.5,
      stakes: 1,
      stakeLength: 50,
      stakeWidth: 5,
    },
  },
  {
    id: 'tahniah',
    name: 'Tahniah',
    note: 'Lobster is heavy to begin with, so it needs less growing than a '
      + 'script - but it stands its letters apart, so it still needs some.',
    params: {
      text: 'Tahniah\nNur Aisyah',
      face: 'lobster',
      width: 120,
      lineHeight: 90,
      thicken: 0.5,
      stakes: 1,
      stakeLength: 50,
      stakeWidth: 5,
    },
  },
  {
    id: 'bersara',
    name: 'Selamat Bersara',
    note: 'Three lines with a long third. The weight sits low, so the stakes '
      + 'are the full default length.',
    params: {
      text: 'Selamat\nBersara\nRahman',
      face: 'grand-hotel',
      width: 120,
      lineHeight: 90,
      thicken: 0.5,
      stakes: 1,
      stakeLength: 50,
      stakeWidth: 5,
    },
  },
  {
    id: 'anniversary',
    name: 'Anniversary',
    note: 'Two lines and no name to fit, so it takes the lightest thickening '
      + 'of the eight and keeps Parisienne fine.',
    params: {
      text: 'Happy\nAnniversary',
      face: 'parisienne',
      width: 120,
      lineHeight: 90,
      thicken: 0.5,
      stakes: 1,
      stakeLength: 50,
      stakeWidth: 5,
    },
  },
];

/**
 * A preset as a complete parameter set.
 *
 * Everything the preset does not name goes back to its default rather than
 * being inherited, because inheriting is the whole failure mode: leave "Connect
 * nothing" or a hand-set stake width behind and the preset builds into
 * something the preset was never tested at.
 *
 * `sheet` is the exception, and it is not decoration either. Thickness and kerf
 * describe the acrylic actually on the bed, and choosing a message is not a
 * statement about that - so those two carry over untouched.
 */
export function presetParams(preset, sheet = {}) {
  return {
    ...DEFAULTS,
    ...preset.params,
    thickness: sheet.thickness ?? DEFAULTS.thickness,
    kerf: sheet.kerf ?? DEFAULTS.kerf,
  };
}

/**
 * Is this design still the preset, whole?
 *
 * Against everything applyPreset would put in place, not only the eight fields
 * the preset names. Taking the unnamed ones back to their defaults is half of
 * what a preset does, so those count too - and checking only the named eight
 * leaves the card lit after the stakes, the alignment or the connect mode have
 * been changed. That is worse than never lighting it: the tool claims a preset
 * the design has already left, and clicking the card that makes the claim throws
 * those edits away with no warning.
 *
 * Thickness and kerf compare equal by construction, because presetParams carries
 * them across untouched - what acrylic is on the bed is not part of which
 * message this is.
 */
export function matchesPreset(preset, params) {
  const want = presetParams(preset, params);
  return Object.keys(want).every((k) => params[k] === want[k]);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * clamp, for a number that might not be one.
 *
 * Settings are read back out of a saved project, and a project is a lump of
 * JSON in the browser`s storage that anything could have written. A clamp does
 * not save you there: Math.max(50, Math.min(160, NaN)) is NaN, so one bad field
 * scales the lettering by NaN, every coordinate in the piece becomes NaN, and
 * the bounding box comes back null - the tool throws while drawing rather than
 * showing anything at all.
 */
const clampNum = (v, lo, hi, fallback) => (Number.isFinite(v)
  ? Math.max(lo, Math.min(hi, v))
  : fallback);

const EMPTY = {
  params: { ...DEFAULTS },
  panels: [],
  derived: {
    width: 0, height: 0, visibleHeight: 0, textWidth: 0, textHeight: 0, capMM: 0,
    pieces: 0, loose: 0, holes: 0, bridges: 0, stroke: 0, suggestThicken: 0,
    stakeAt: [], stakeSnapped: 0, balance: 0, cutLength: 0,
    lines: 0, warnings: [], empty: true,
  },
};

function shiftRings(rings, dx, dy) {
  return rings.map((r) => {
    const out = new Array(r.length);
    for (let k = 0; k < r.length; k += 2) {
      out[k] = r[k] + dx;
      out[k + 1] = r[k + 1] + dy;
    }
    return out;
  });
}

function scaleRings(rings, s) {
  return rings.map((r) => {
    const out = new Array(r.length);
    for (let k = 0; k < r.length; k++) out[k] = r[k] * s;
    return out;
  });
}

function ringsBBox(groups) {
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

/**
 * Area-weighted centroid of flat [x,y,...] contours.
 *
 * Counters subtract themselves, because a hole is wound the other way and the
 * shoelace sum carries the sign - so the middle of an O is not counted as part
 * of the O.
 */
export function centroidOf(groups) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (const g of groups) {
    for (const ring of g) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const cross = ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
        a += cross;
        cx += (ring[j] + ring[i]) * cross;
        cy += (ring[j + 1] + ring[i + 1]) * cross;
      }
    }
  }
  a /= 2;
  return Math.abs(a) < 1e-9
    ? { x: 0, y: 0, area: 0 }
    : { x: cx / (6 * a), y: cy / (6 * a), area: a };
}

/**
 * Centre of weight of a set of open stroke paths.
 *
 * A single-line face has no contours. Its glyphs are polylines, and the pen
 * width is given to them later by the outliner - so there is no ring to run a
 * shoelace over. Handing one to centroidOf anyway is not merely imprecise, it is
 * meaningless: the shoelace closes each path back to its own start point and
 * measures the area of that accidental loop, which for a script that wanders
 * left and right can come out near zero or negative. Dividing by it throws the
 * centre of weight hundreds of millimetres off the piece, and everything that
 * reads it - the lean warning, the marker in the cake view - follows it there.
 *
 * A constant-width pen lays the same mass on every millimetre it travels, so the
 * centre of weight is the length-weighted mean of the segment midpoints. That is
 * exact for the shape the pen sweeps, bar the caps and the corners.
 */
export function strokeCentroid(paths) {
  let m = 0;
  let cx = 0;
  let cy = 0;
  for (const st of paths) {
    for (let k = 2; k < st.length; k += 2) {
      const l = Math.hypot(st[k] - st[k - 2], st[k + 1] - st[k - 1]);
      if (!(l > 0)) continue;
      m += l;
      cx += ((st[k] + st[k - 2]) / 2) * l;
      cy += ((st[k + 1] + st[k - 1]) / 2) * l;
    }
  }
  return m > 0 ? { x: cx / m, y: cy / m, length: m } : { x: 0, y: 0, length: 0 };
}

/**
 * The x runs where a set of filled contours is solid at height y.
 *
 * Used to park the stakes somewhere they will actually weld on. A stake is a
 * finger nine millimetres wide; drop it in the gap between two letters of a
 * script and it comes off the sheet as a separate splinter.
 */
export function inkSpansAt(groups, y) {
  const xs = [];
  for (const g of groups) {
    for (const ring of g) {
      for (let k = 0, m = ring.length - 2; k < ring.length; m = k, k += 2) {
        const ay = ring[m + 1];
        const by = ring[k + 1];
        if ((ay <= y) === (by <= y)) continue;
        const t = (y - ay) / (by - ay);
        xs.push([ring[m] + t * (ring[k] - ring[m]), by > ay ? 1 : -1]);
      }
    }
  }
  if (xs.length < 2) return [];
  xs.sort((p, q) => p[0] - q[0]);
  const spans = [];
  let wind = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    wind += xs[i][1];
    if (wind === 0) continue;
    const a = xs[i][0];
    const b = xs[i + 1][0];
    if (b - a < 1e-6) continue;
    const last = spans[spans.length - 1];
    if (last && a - last[1] < 1e-6) last[1] = b;
    else spans.push([a, b]);
  }
  return spans;
}

/** A stake: a flat-tipped wedge, wide where it meets the letters. */
export function stakePolygon(cx, yTop, length, width, taperPct) {
  const w = Math.max(1, width);
  const tip = Math.max(1, w * (1 - clamp(taperPct, 0, 85) / 100));
  const yBot = yTop - Math.max(4, length);
  // Flat tipped rather than pointed. A point in 3 mm acrylic chips the first
  // time it meets a cake board, and a 1 mm tip goes in just as easily.
  return [
    cx - w / 2, yTop,
    cx - tip / 2, yBot,
    cx + tip / 2, yBot,
    cx + w / 2, yTop,
  ];
}

/** Mean stroke width of filled letters: twice the area over the perimeter. */
export function meanStroke(groups) {
  let area = 0;
  let per = 0;
  for (const g of groups) {
    for (const ring of g) {
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

/** How long a bridge is, squared - only used to compare two of them. */
const span2 = (seg) => (seg[2] - seg[0]) ** 2 + (seg[3] - seg[1]) ** 2;

/**
 * The longest connector in a set, in millimetres.
 *
 * A count of bridges says how many joins were needed; this says how bad the
 * worst one looks. They are not the same thing - one bar reaching across the
 * whole piece is uglier than four that disappear into the letters - and it was
 * the length, not the count, that gave the dot of an i away.
 */
const longestBridge = (segs) => segs.reduce((m, s) => Math.max(m, Math.hypot(s[2] - s[0], s[3] - s[1])), 0);

/** The bounding box of a whole frame. */
function groupsBBox(groups) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const g of groups) {
    for (const r of g) {
      for (let i = 0; i < r.length; i += 2) {
        if (r[i] < x0) x0 = r[i];
        if (r[i] > x1) x1 = r[i];
        if (r[i + 1] < y0) y0 = r[i + 1];
        if (r[i + 1] > y1) y1 = r[i + 1];
      }
    }
  }
  return { w: x1 - x0, h: y1 - y0 };
}

/**
 * The narrowest gap between the lettering and the frame, in millimetres.
 *
 * Reported so the slider that sets it has a real number against it rather than
 * a percentage nobody can picture. Zero means they touch, which is the good
 * case: the letters weld into the frame and no strut is needed at all.
 *
 * Sampled, and deliberately measured here rather than anywhere else. Working it
 * out from a separate reconstruction of the same geometry gave 21.6 mm where
 * the piece itself had 6 - the reconstruction had drifted, and there was no way
 * to tell from the number which of the two was wrong. Measured on the arrays
 * the topper is actually built from, it cannot disagree with the piece.
 */
function gapToFrame(letters, frame) {
  const lp = samplePoints(letters, 1500);
  const fp = samplePoints(frame, 800);
  if (!lp.length || !fp.length) return 0;
  let best = Infinity;
  for (const p of lp) {
    for (const q of fp) {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

/** An even sample of every point in a set of groups, as [[x,y],...]. */
function samplePoints(groups, want) {
  const all = [];
  for (const g of groups) for (const r of g) all.push(...asPoints(r));
  const stride = Math.max(1, Math.floor(all.length / want));
  const out = [];
  for (let i = 0; i < all.length; i += stride) out.push(all[i]);
  return out;
}

/** Flat [x,y,x,y] to [[x,y],...], which is what nearestPair reads. */
const asPoints = (flatRing) => {
  const out = new Array(flatRing.length / 2);
  for (let i = 0; i < flatRing.length; i += 2) out[i / 2] = [flatRing[i], flatRing[i + 1]];
  return out;
};

/**
 * The shortest strut from the lettering to the frame in each direction round it.
 *
 * A ring of sectors covers every direction the lettering could be held from, and
 * taking the shortest link within each keeps every candidate a short strut
 * rather than a bar thrown across open space.
 *
 * The caller picks by bearing, which is the part that took three goes to get
 * right. Counting how many open regions the frame ends up with is exact on
 * paper - a ring joined to a blob at k points has k regions - and on a real
 * piece it kept answering the wrong question: it read the eight triangles
 * between the double square`s crossing bands as holds, then read a perfectly
 * good one as none. What is known for certain is which bridge attached the
 * lettering, because this code is what made it. Working from that instead of
 * from the shape of the result is both simpler and true.
 */
function holdCandidates(letters, frame) {
  const lp = samplePoints(letters, 600);
  const fp = samplePoints(frame, 400);
  if (!lp.length || !fp.length) return [];

  let cx = 0;
  let cy = 0;
  for (const [x, y] of fp) { cx += x; cy += y; }
  cx /= fp.length;
  cy /= fp.length;

  const SECTORS = 10;
  const bestIn = new Array(SECTORS).fill(null);
  const bestLen = new Array(SECTORS).fill(Infinity);
  const sectorOf = (x, y) => {
    const a = Math.atan2(y - cy, x - cx);
    return Math.min(SECTORS - 1,
      Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / SECTORS)));
  };
  for (const p of lp) {
    for (const q of fp) {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      const s = sectorOf((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      if (d < bestLen[s]) { bestLen[s] = d; bestIn[s] = [p[0], p[1], q[0], q[1]]; }
    }
  }
  return bestIn
    .map((seg, i) => ({ seg, len: bestLen[i] }))
    .filter((c) => c.seg)
    .sort((a, b) => a.len - b.len)
    .map((c) => c.seg);
}

/** The hole with the largest bounding box, which in a framed piece is its middle. */
function widestHole(holes) {
  let best = null;
  let area = 0;
  for (const h of holes) {
    const b = bbox(h);
    const a = (b.x1 - b.x0) * (b.y1 - b.y0);
    if (a > area) { area = a; best = h; }
  }
  return best;
}

/** Is ring `inner` entirely within the bounding box of ring `outer`? */
function bboxWithin(inner, outer) {
  const a = bbox(inner);
  const b = bbox(outer);
  return a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
}

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
 * Outline everything, then tie back whichever floating pieces the user asked for.
 *
 * The three modes matter because a dot and a letter are different problems. The
 * dot on an i has nothing holding it and always needs a bridge. A whole letter
 * left adrift usually means the line height or the thickening is wrong, and
 * bridging it papers over that - so "dots only" fixes the unavoidable and leaves
 * the avoidable visible.
 */
function weld(input, opts, mode, bridgeW, dotArea, anchor = null) {
  let res = strokesToOutline(input.strokes || [], opts);
  const bridges = [];
  const framed = Boolean(anchor);
  let hungOn = null;
  let hungSize = 0;


  if (mode === 'none' || !(bridgeW > 0)) {
    return {
      res,
      bridges: 0,
      span: 0,
      holds: 0,
      holdSpan: 0,
    };
  }

  for (let round = 0; round < 3 && res.outers.length > 1; round++) {
    const main = res.outers[0];
    const want = res.outers.slice(1).filter((o) => (
      mode === 'dots-and-letters' || Math.abs(ringArea(o)) <= dotArea
    ));
    if (!want.length) break;
    // With a frame, the opening in the middle of it is a target for bridges as
    // well as its outside edge. A frame is a ring: its outer contour is on the
    // FAR side of the band, so a letter sitting inside one that bridged to that
    // contour would drive its connector clean through the frame and leave half
    // a bridge width sticking out past the silhouette - the piece then measures
    // wider than the width on the label, which is the one number this tool
    // promises.
    //
    // EVERY hole, not just the widest. Once letters weld to a ring they cut its
    // middle into several regions, and the dot of an i floats in whichever one
    // it happens to land in - usually a small one, right above its own stem.
    // Offering only the widest hole sent that dot reaching across the topper to
    // the far side of the ring: a straight bar through open space, the ugliest
    // thing on the piece, when the stem it belongs to was two millimetres away.
    //
    // Still only with a frame. Unframed, the holes are counters - the middle of
    // an o, the eye of an e - and a bridge that dives into one of those joins
    // the same two pieces by a worse-looking route.
    for (const o of want) {
      const size = Math.abs(ringArea(o));
      let seg = nearestPair(o, main);
      let best = seg ? span2(seg) : Infinity;
      if (framed) {
        for (const h of res.holes) {
          // Not the loose piece own counters: bridging a letter to the inside
          // of itself joins nothing and costs a connector.
          if (bboxWithin(h, o)) continue;
          const alt = nearestPair(o, h);
          if (!alt) continue;
          const d = span2(alt);
          if (d < best) { best = d; seg = alt; }
        }
      }
      if (!seg) continue;
      bridges.push(seg);
      // The biggest thing that had to be tied on is the lettering. Remembering
      // which strut did it is the whole basis for placing the second one.
      if (framed && size > hungSize) { hungSize = size; hungOn = seg; }
    }
    res = strokesToOutline(input.strokes || [], {
      ...opts, bridges: { paths: bridges, weight: bridgeW },
    });
  }

  // Two different jobs, so two different numbers. Everything bridged up to here
  // exists to tie back something that would otherwise drop out of the sheet - a
  // stray letter, a dot - and those have to be short or they are the ugliest
  // thing on the piece. The strut added below is structural: it goes where the
  // piece needs holding, and it is long when that is what it takes. Averaging
  // the two into one figure would let a deliberate strut hide a connector that
  // had gone wandering.
  const span = longestBridge(bridges);
  let holdSpan = 0;
  let holds = hungOn ? 1 : 0;

  // One hold is a hinge. The lettering is the heavy part, the frame is what the
  // topper gets picked up by, and a single join carries the whole weight of the
  // words every time it is handled - a join that is a bridge, the thinnest thing
  // on the piece. Acrylic gives no warning before it goes.
  //
  // Only when the lettering had to be bridged on at all. Where it runs into the
  // frame and welds along it, it is held over a length no strut can improve on,
  // and adding one would be a bar across open space for nothing.
  //
  // Well away from the first, not merely elsewhere: two holds side by side are
  // one hinge slightly widened. A quarter turn is the least that spans the piece
  // rather than propping up one corner of it.
  if (framed && hungOn && res.outers.length === 1) {
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const g of anchor.frame) {
      for (const r of g) {
        for (let i = 0; i < r.length; i += 2) { cx += r[i]; cy += r[i + 1]; n++; }
      }
    }
    cx /= n;
    cy /= n;
    const bearing = (seg) => Math.atan2(
      (seg[1] + seg[3]) / 2 - cy, (seg[0] + seg[2]) / 2 - cx,
    );
    const held = bearing(hungOn);
    const apart = (t) => Math.abs(((t - held + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

    const far = holdCandidates(anchor.letters, anchor.frame)
      .filter((seg) => apart(bearing(seg)) >= Math.PI * 0.5);
    const seg = far[0];
    if (seg) {
      bridges.push(seg);
      res = strokesToOutline(input.strokes || [], {
        ...opts, bridges: { paths: bridges, weight: bridgeW },
      });
      holdSpan = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
      holds = 2;
    }
  }
  return {
    res, bridges: bridges.length, span, holds, holdSpan,
  };
}

export function buildTopper(input = {}) {
  const p = { ...DEFAULTS, ...input };
  const face = p.faceData;
  if (!face) return EMPTY;

  const lines = String(p.text ?? '').split(/\r?\n/).map((l) => l.replace(/\t/g, ' '));
  if (!lines.some((l) => l.trim())) return EMPTY;

  // ---- lay the lines out at a nominal size, then scale to the width asked for.
  // Scaling the finished geometry is exact and avoids laying the text out twice.
  const NOMINAL = 100;
  const laid = lines.map((l) => (l.trim()
    ? layout({ text: l, capHeight: NOMINAL, faceData: face, align: 'left' })
    : null));
  const widest = Math.max(1, ...laid.map((r) => (r ? r.advance : 0)));
  const step = NOMINAL * (clamp(p.lineHeight, 10, 300) / 100);
  const outlineFace = isOutline(face);

  let groups = [];
  const strokePaths = [];
  laid.forEach((r, i) => {
    if (!r) return;
    const dx = p.align === 'center' ? (widest - r.advance) / 2
      : p.align === 'right' ? widest - r.advance : 0;
    const dy = -i * step;
    if (outlineFace) {
      // shiftRings first: weldTittles is handed fresh arrays that way, so it
      // never writes into the glyph data the face cache is holding on to.
      for (const rings of r.shapes) groups.push(weldTittles(shiftRings(rings, dx, dy)));
    } else {
      for (const st of r.paths) {
        const out = new Array(st.length);
        for (let k = 0; k < st.length; k += 2) {
          out[k] = st[k] + dx;
          out[k + 1] = st[k + 1] + dy;
        }
        strokePaths.push(out);
      }
    }
  });

  const measure = outlineFace ? ringsBBox(groups) : ringsBBox([strokePaths]);
  if (!measure || !(measure.w > 0)) return EMPTY;
  // The width asked for is the width of the finished piece, so the lettering is
  // scaled to leave room for what is added afterwards: thickening grows it by
  // its amount on each side, and kerf compensation by half a beam on each side.
  // Without this, thickening quietly makes the topper wider than the number in
  // the box, which is exactly the kind of promise a tool should not break.
  const addedW = Math.max(0, p.thicken) * 2 + Math.max(0, p.kerf);
  const outerW = Math.max(0.01, p.width - addedW);

  // With a frame the width on the label belongs to the FRAME, and the lettering
  // is sized to sit inside it. The fill factor is over one on purpose: the text
  // is meant to run into the frame and weld to it, which is the whole reason
  // for having one. Fitting it neatly inside would leave a ring with loose
  // letters rattling about in the middle of it.
  const shape = borderOf(p.border);
  const band = clampNum(p.borderWidth, 0.5, 40, DEFAULTS.borderWidth);
  const frame = fitWidth(shape.build(outerW, band), outerW);
  let s;
  if (frame) {
    // The lettering is fitted to the largest circle inside the frame, then
    // pushed out by half the ring so it runs into the frame and welds to it.
    const diag = Math.hypot(measure.w, measure.h) || 1;
    // How much of the opening the lettering takes. The border has an opinion -
    // a plain ring wants the letters run into it, a frame with leaves growing
    // off it wants them kept back so its decoration is not buried - and Fill
    // is the reader of the two, because how close the words should sit to the
    // frame is a matter of taste and nobody else can settle it.
    const reach = innerRadius(frame) + band * 0.5;
    s = (reach * 2 * (shape.fill ?? 1) * (clampNum(p.fill, 50, 160, 100) / 100)) / diag;
    // Never past the frame, whatever Fill says. The width on the label is the
    // frame`s width, so lettering allowed to reach outside it would make the
    // piece bigger than the number in the box - and that number is the one
    // promise this tool makes about what comes off the machine.
    const box = groupsBBox(frame);
    s = Math.min(s, box.w / measure.w, box.h / measure.h);
  } else {
    s = outerW / measure.w;
  }
  const capMM = NOMINAL * s;
  groups = groups.map((g) => scaleRings(g, s));
  const strokes = strokePaths.map((st) => st.map((v) => v * s));

  const thicken = Math.max(0, p.thicken);
  const penW = Math.max(0.6, p.weight);
  const rawStroke = outlineFace ? meanStroke(groups) : penW;
  // Thickening adds its amount to each side, so a stroke gains twice it.
  const stroke = rawStroke + thicken * 2;

  const ink = outlineFace ? ringsBBox(groups) : ringsBBox([strokes]);

  // A frame comes back centred on the origin; the lettering sits wherever the
  // baselines put it. Move the frame onto the ink so the two are concentric -
  // otherwise the union of the two is a box far larger than either, the piece
  // measures half again what was asked for, and the weight hangs off to one
  // side of the stakes.
  if (frame) shiftGroups(frame, (ink.x0 + ink.x1) / 2, (ink.y0 + ink.y1) / 2);
  const frameGap = frame ? gapToFrame(groups, frame) : 0;
  const lastBase = -(laid.length - 1) * step * s;

  // ---- stakes ------------------------------------------------------------
  // They have to bite into the lettering, so the top of a stake sits above the
  // last baseline rather than under the descenders.
  const nStakes = clamp(Math.round(p.stakes), 0, 2);
  let frameStakeTop = 0;
  const rise = Math.max(2, capMM * 0.18);
  const yTop = lastBase + rise;
  const probeY = lastBase + rise * 0.35;
  const spans = outlineFace ? inkSpansAt(groups, probeY) : [];
  const mid = (ink.x0 + ink.x1) / 2;
  const half = (p.width * clamp(p.stakeSpread, 0, 100)) / 200;
  let wanted = nStakes === 2 ? [mid - half, mid + half] : nStakes === 1 ? [mid] : [];

  let snapped = 0;
  if (p.stakeSnap && spans.length) {
    wanted = wanted.map((x) => {
      const inside = spans.some(([a, b]) => x >= a - 0.01 && x <= b + 0.01);
      if (inside) return x;
      let best = x;
      let bestD = Infinity;
      for (const [a, b] of spans) {
        const c = Math.max(a, Math.min(b, x));
        const d = Math.abs(c - x);
        if (d < bestD) { bestD = d; best = (b - a) > p.stakeWidth ? c : (a + b) / 2; }
      }
      snapped++;
      return best;
    });
  }
  // A frame is continuous, so there is nothing to hunt for: the stake goes on
  // the bottom of it, centred, and bites upward into the ring.
  if (frame) {
    // Two stakes are pulled in to whatever the frame is still solid across at
    // its bottom - a circle and a heart both come to a point down there, and
    // a pair set to the full spread would hang off either side of it.
    const sp = Math.min(half, innerRadius(frame) * 0.5);
    wanted = nStakes === 2 ? [mid - sp, mid + sp] : nStakes === 1 ? [mid] : [];
    snapped = 0;
    frameStakeTop = lowestY(frame) + Math.max(2, band * 0.9);
  }
  const stakeTop = frame ? frameStakeTop : yTop;
  const stakeShapes = wanted.map((x) => [
    stakePolygon(x, stakeTop, p.stakeLength, p.stakeWidth, p.stakeTaper),
  ]);

  // ---- one shape -----------------------------------------------------------
  const all = [...groups, ...(frame || []), ...stakeShapes];
  const dotArea = Math.max(2, (stroke * 2) ** 2);
  const {
    res, bridges, span: bridgeSpan, holds, holdSpan,
  } = weld(
    { strokes },
    { weight: penW, glyphs: all, grow: thicken },
    p.connect,
    Math.max(0, Math.min(p.bridge, Math.max(stroke, 1.2))),
    dotArea,
    frame ? { letters: groups, frame } : null,
  );
  if (!res.outers.length) return EMPTY;

  const warnings = [];
  const pieces = res.outers.length;
  if (pieces > 1) {
    warnings.push(`${pieces} separate pieces - ${pieces - 1} will drop out of the `
      + 'sheet loose. Close the line height so the lines overlap, thicken the '
      + 'letters, or set Connect to join them.');
  }
  // Many bridges means the face is not really joining up, and a row of little
  // connectors looks like what it is. Thickening merges the letters properly.
  if (bridges > 4) {
    warnings.push(`${bridges} bridges were needed to hold this together. Thickening `
      + 'the letters merges them into each other instead, which looks better than '
      + 'a row of connectors - or pick a face that joins up on its own.');
  }
  if (stroke < MIN_STROKE) {
    const need = Math.ceil(((MIN_STROKE - stroke) / 2) * 10) / 10;
    warnings.push(`The letters average ${stroke.toFixed(1)} mm across. Below about `
      + `${MIN_STROKE} mm they snap when the topper is pushed into a cake or `
      + `washed. Thicken by ${need} mm, or make it wider.`);
  }

  // ---- will it stand up? ---------------------------------------------------
  // A topper hangs off its stakes. If the lettering's weight is not over them it
  // leans, and on a soft cake it keeps leaning. Nobody checks this, and it is
  // the difference between a photo and a slice of humiliation.
  // The lettering only. The stakes are buried in the cake, so their weight is
  // not what leans the thing over - what leans it is everything above the icing.
  // A filled face is weighed by area, a single-line face by path length. They
  // are not interchangeable: an open polyline has no area to weigh.
  const cent = outlineFace ? centroidOf(groups) : strokeCentroid(strokes);
  let balance = 0;
  if (wanted.length) {
    const lo = Math.min(...wanted);
    const hi = Math.max(...wanted);
    const span = Math.max(hi - lo, p.stakeWidth);
    balance = (cent.x - (lo + hi) / 2) / (span / 2);
    if (Math.abs(balance) > 1) {
      warnings.push('The weight of the lettering sits outside the stakes, so it '
        + 'will lean. Move the stakes apart, or nudge the text with spaces.');
    }
  } else {
    warnings.push('No stakes: this will not stand in a cake. Add one or two.');
  }

  // ---- kerf ---------------------------------------------------------------
  const k = Math.max(0, p.kerf) / 2;
  const shift = (ring, dx, dy) => ring.map(([x, y]) => [x + dx, y + dy]);
  const full = bbox([...res.outers.flat(), ...res.holes.flat()]);
  const dx = -full.x0;
  const dy = -full.y0;
  let outer = shift(res.outers[0], dx, dy);
  let loose = res.outers.slice(1).map((r) => shift(r, dx, dy));
  let holes = res.holes.map((r) => shift(r, dx, dy));
  if (k > 0) {
    // Half a beam outside the part on every edge. On an outer that means a
    // bigger ring; on a counter it means a *smaller* one, because the beam eats
    // its way outwards from the path into the material surrounding the hole.
    // growRing does the winding bookkeeping - counters come back clockwise, and
    // asking offsetPolygon directly for -k on one of those widens it by a beam
    // instead of narrowing it, which leaves every stroke a full kerf too thin.
    outer = growRing(outer, k);
    loose = loose.map((r) => growRing(r, k));
    holes = holes.map((r) => growRing(r, -k));
  }

  let cutLength = 0;
  for (const ring of [outer, ...loose, ...holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      cutLength += Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
    }
  }
  const size = bbox(outer);

  return {
    params: { ...p },
    panels: [{
      id: 'topper',
      label: 'Cake topper',
      outline: outer,
      holes,
      loose,
      engrave: [],
      engraveFill: [],
      size: { w: size.w, h: size.h },
      thickness: p.thickness,
      // Where this drawing lives in space, for the 3D preview. `origin` is the
      // world point the panel's own (0, 0) lands on, U and V span its plane and
      // N is the outward normal; the board fills the slab between that plane and
      // one thickness behind it, so origin is on the face you are looking at.
      //
      // World axes are the ones somebody looking at a cake would use: x across,
      // y back into the cake, z up from the board. A topper is one flat piece
      // standing upright, so it needs no assembly and no seatings - its own x
      // runs across the width, its own y runs up, and it faces the reader. Its
      // (0, 0) is the bottom-left of the outline, which puts the stake tips on
      // z = 0 - standing on the table, the way it is photographed before it goes
      // into the cake.
      frame: {
        origin: [0, 0, 0],
        U: [1, 0, 0],
        V: [0, 0, 1],
        N: [0, -1, 0],
      },
    }],
    derived: {
      width: size.w,
      height: size.h,
      // The height a guide means when it says a script topper wants five to
      // seven inches is the part you can SEE. The stakes are in the cake, so
      // counting them makes a topper look far bigger on paper than on the table.
      visibleHeight: Math.max(0, size.h - (wanted.length ? Math.min(
        size.h * 0.5, Math.max(8, p.stakeLength * 0.72),
      ) : 0)),
      textWidth: ink.w,
      textHeight: ink.h,
      capMM,
      lines: laid.filter(Boolean).length,
      pieces,
      border: p.border,
      bridgeSpan,
      holds,
      holdSpan,
      frameGap,
      loose: loose.length,
      holes: holes.length,
      bridges,
      stroke,
      rawStroke,
      suggestThicken: stroke < MIN_STROKE
        ? Math.ceil(((MIN_STROKE - stroke) / 2) * 10) / 10 : 0,
      stakeAt: wanted.map((x) => x + dx),
      stakeSnapped: snapped,
      balance,
      cutLength,
      engraveLength: 0,
      engraveFill: false,
      engraveLine: false,
      warnings,
      empty: false,
    },
  };
}

export { ringArea };
