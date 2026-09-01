// The luggage tag itself: the shape, the strap slot, the border and the two
// pieces that come off the bed.
//
// A tag is one flat piece of board with a hole near the top, so almost nothing
// here is about the outline and almost all of it is about the hole. The slot is
// the only part of a luggage tag that ever fails. It is the only place the strap
// pulls, it is the thinnest section, and it is the part a generator can get
// wrong without the picture looking wrong - a 3 mm bridge between the slot and
// the edge draws perfectly and snaps off the first time a bag goes down a
// carousel. So the checks below are mostly about that bridge, and they are
// geometric rather than arithmetic: the slot ring is tested against the real
// outline, inset, point by point, because on a heart or a triangle the distance
// to the edge is not something you can work out from the height alone.
//
// TWO pieces, front and back, cut from the same board and glued back to back.
// Every shape here is symmetric about its vertical centre line and the slot sits
// on that line, so the back is NOT mirrored - flip it over and it still lines up
// with the front. That is not a lucky accident, it is a constraint on what
// shapes this tool offers, and it is why the two pieces can be laid out
// identically and why the labels in the export matter so much: the pieces are
// the same outline and only the engraving tells them apart.
//
// Millimetres, y-up, outer contours counter-clockwise, holes clockwise - the
// same convention as every other tool here.

import {
  roundedRect, ellipse, offsetPolygon, toCCW, isCCW, bbox, dedupe, area, unloop,
} from './path.js';
import { labelPaths, labelWidth } from './label.js';

// ---------------------------------------------------------------- catalogue

export const SHAPES = [
  { id: 'rect', name: 'Rectangle', hint: 'The plain one. Most room for text.' },
  { id: 'tag', name: 'Tag', hint: 'Squared body, shoulders cut back to a narrow head.' },
  { id: 'arch', name: 'Arch', hint: 'Flat bottom, domed top.' },
  { id: 'circle', name: 'Circle', hint: 'Round. The slot eats into the writing room.' },
  { id: 'square', name: 'Square', hint: 'Height follows width.' },
  { id: 'octagon', name: 'Octagon', hint: 'Rectangle with the corners cut off.' },
  { id: 'triangle', name: 'Triangle', hint: 'Point up. Very little room at the top.' },
  { id: 'heart', name: 'Heart', hint: 'Square, like the circle. Stretched, it stops being a heart.' },
];

export const SLOTS = [
  { id: 'stadium', name: 'Stadium', hint: 'A slot with round ends - takes a flat strap.' },
  { id: 'circle', name: 'Circle', hint: 'A round hole for a split ring or a cord.' },
  { id: 'square', name: 'Square', hint: 'Square-ended slot. Sharp corners concentrate the pull.' },
  { id: 'none', name: 'None', hint: 'No hole at all.' },
];

export const BORDERS = [
  { id: 'none', name: 'None' },
  { id: 'single', name: 'Single line' },
  { id: 'double', name: 'Double line' },
];

export const SIDES = ['front', 'back'];

export const SIZE_PRESETS = [
  { id: 'standard', name: 'Standard', w: 50, h: 90 },
  { id: 'wide', name: 'Wide', w: 70, h: 45 },
  { id: 'small', name: 'Small', w: 38, h: 65 },
  { id: 'big', name: 'Big', w: 65, h: 110 },
];

// A flat luggage strap is 10-12 mm wide and about 1.5 mm thick, so a slot needs
// to be wider than that and only a little taller. Below these the strap will not
// pass, and saying which number is short is more use than "it does not fit".
export const STRAP_W = 12;
export const STRAP_H = 3;

// Board left between the slot and the outside edge. Under 2 mm a 3 mm ply bridge
// is one short-grain sliver and it will break; 3 mm is comfortable.
export const BRIDGE_MIN = 2;
export const BRIDGE_GOOD = 3;

// Below this a tag is smaller than the slot it needs, and the inspector's own
// sliders stop here too - one floor, in one place, so the two cannot disagree.
export const MIN_SIZE = 15;

/** Shapes whose height follows their width. See buildTag for why. */
export const SQUARE_SHAPES = ['square', 'circle', 'heart'];

// Engraved stroke text, in millimetres of cap height. BODY_MIN is what a name
// or a phone number has to reach to be read at arm's length; LABEL_MIN is where
// even a heading you are holding in your hand starts to close up.
export const BODY_MIN = 2.4;
export const LABEL_MIN = 1.6;

export const DEFAULTS = {
  shape: 'tag',
  width: 50,
  height: 90,
  radius: 4,

  border: 'single',
  borderInset: 3,
  borderGap: 1.2,

  slot: 'stadium',
  slotW: 16,
  slotH: 5,
  slotEdge: 6,          // mm from the top edge of the piece to the top of the slot

  // The name on the front, as free lines.
  frontLines: 'YOUR NAME',
  frontCap: 6,
  frontNudge: 0,

  // The "if found" card on the back.
  backHeading: 'IF FOUND, PLEASE CONTACT',
  backName: 'Your Name',
  backPhone: '+60 12-345 6789',
  backAddress: '',
  backCap: 3,
  backNudge: 0,

  textMargin: 3,        // mm kept clear of the border by any stroke text
  leading: 1.55,        // line pitch as a multiple of cap height

  thickness: 3,
  kerf: 0.2,
};

/**
 * The five jobs a tag is actually bought for, each as a WHOLE design.
 *
 * A preset that only filled in the words would be a trap here, for the same
 * reason it is in the cake topper: on a tag the numbers only work together. The
 * text size that fits a 65 mm travel tag sets a 38 mm pet disc at a size nobody
 * can read; the slot inset that leaves 7 mm of board on a rectangle puts the
 * hole clean outside a heart, because a heart is a notch where a rectangle is an
 * edge. Drop one preset's words into another's shape and the tool is right to
 * complain - so each of these carries its own shape, size, slot, border and
 * both blocks of text, and everything it does not name goes back to the
 * default rather than being inherited.
 *
 * The numbers are measured, not guessed. Each slot position was walked against
 * the real outline until the bridge cleared BRIDGE_GOOD, and each cap height was
 * read back off a build with the cap set absurdly high and then floored to a
 * tenth - so the text is set at the biggest size that fits and the tool has
 * nothing to say about it. There is a test that builds all five and fails if any
 * of them warns, and another that fails if any of them is set so small the
 * legibility floor trips.
 *
 * The placeholders are real names and real Malaysian numbers rather than
 * "YOUR NAME", because a preset is meant to show what the thing looks like and a
 * row of Xs does not - and because the length of a name is exactly what decides
 * whether the back fits. `Syarikat Anda Sdn Bhd` is literally "Your Company Sdn
 * Bhd": a placeholder that reads as one, and cannot be mistaken for a real firm.
 *
 * The local and the international number are not a slip. A travel tag and a
 * company tag are read abroad, so they carry +60; a school bag, a cat and a
 * wedding stay in the country, so they carry the 012- form somebody here would
 * actually write - and the shorter line is what buys those three tags their
 * text size.
 */
export const PRESETS = [
  {
    id: 'travel',
    name: 'Travel',
    note: 'The classic. Name across the front, the whole contact card on the '
      + 'back. 65 x 105 mm, which is the size airline tags have settled on and '
      + 'the smallest that takes an address at a readable size.',
    params: {
      shape: 'tag',
      width: 65,
      height: 105,
      radius: 5,
      border: 'double',
      borderInset: 3.5,
      borderGap: 1.4,
      // 18 mm takes a 12 mm strap with room to double it back through, and
      // 7 mm down the head of a tag shape leaves 7 mm of board all round.
      slot: 'stadium',
      slotW: 18,
      slotH: 5.5,
      slotEdge: 7,
      frontLines: 'NUR\nAISYAH',
      frontCap: 9.8,
      backHeading: 'IF FOUND, PLEASE CONTACT',
      backName: 'Nur Aisyah Rahman',
      backPhone: '+60 12-345 6789',
      backAddress: '12 Jalan Melati 3\n47100 Puchong, Selangor',
      backCap: 2.8,
    },
  },
  {
    id: 'school',
    name: 'School bag',
    note: "A name a teacher can read across a hall, and a parent's number on "
      + 'the back. No address, deliberately: a tag on a child\'s bag tells a '
      + 'stranger where that child lives.',
    params: {
      shape: 'arch',
      width: 50,
      height: 70,
      radius: 5,
      border: 'single',
      borderInset: 3,
      borderGap: 1.2,
      // Narrower and shallower than the travel slot: this hangs off a backpack
      // zip pull or a short cord, not off a suitcase handle.
      slot: 'stadium',
      slotW: 15,
      slotH: 5,
      slotEdge: 5,
      frontLines: 'DANISH',
      frontCap: 7.1,
      backHeading: 'IF FOUND, PLEASE CALL',
      backName: 'Danish Hakim',
      backPhone: '012-345 6789',
      backAddress: '',
      backCap: 2.8,
    },
  },
  {
    id: 'staff',
    name: 'Staff tag',
    note: 'Landscape and plain-cornered, the way a company orders fifty of '
      + 'them. Person on the front, the office on the back - so a bag left in a '
      + "hotel goes back to a switchboard rather than to somebody's house.",
    params: {
      shape: 'rect',
      width: 90,
      height: 55,
      // Nearly square corners. A staff tag is the one shape here nobody wants
      // to look handmade.
      radius: 2,
      border: 'single',
      borderInset: 3.5,
      borderGap: 1.2,
      slot: 'stadium',
      slotW: 18,
      slotH: 5,
      slotEdge: 5,
      frontLines: 'AZLAN IBRAHIM\nOperations',
      frontCap: 6.8,
      backHeading: 'RETURN TO',
      backName: 'Syarikat Anda Sdn Bhd',
      backPhone: '+60 3-1234 5678',
      backAddress: 'No. 8, Jalan Teknologi 3/5\n81100 Johor Bahru',
      backCap: 3.8,
    },
  },
  {
    id: 'pet',
    name: 'Pet tag',
    note: "A 38 mm disc on a split ring. The pet's name on the front and one "
      + 'number on the back, and nothing else - there is no room for anything '
      + 'else and a collar tag does not need it.',
    params: {
      shape: 'circle',
      width: 38,
      height: 38,
      radius: 0,
      // No border. Two engraved rings inside a 38 mm disc would take a third of
      // the writing room to say nothing.
      border: 'none',
      borderInset: 3,
      borderGap: 1.2,
      textMargin: 2.5,
      // A round hole, not a slot: this goes on a split ring, and 4.5 mm is what
      // a ring off a collar clip needs.
      slot: 'circle',
      slotW: 4.5,
      slotH: 4.5,
      slotEdge: 3.5,
      frontLines: 'COMEL',
      frontCap: 6.1,
      // Heading, owner and address all empty on purpose. The back is one line -
      // the number - set as large as a 38 mm disc allows.
      backHeading: '',
      backName: '',
      backPhone: '012-345 6789',
      backAddress: '',
      backCap: 2.3,
    },
  },
  {
    id: 'save-date',
    name: 'Save the date',
    note: 'A heart for a wedding favour: two words on the front, the couple, '
      + 'the date and a number to RSVP on the back. Both blocks are nudged up '
      + 'out of the point at the bottom, where a heart has no width to write in.',
    params: {
      shape: 'heart',
      width: 70,
      height: 70,
      radius: 0,
      border: 'none',
      borderInset: 3,
      borderGap: 1.2,
      // 20 mm down, not 5. A heart dips to a notch on its own centre line, and
      // the slot sits on that line - anywhere above about 13 mm the hole is
      // outside the shape altogether. 20 mm is the first position with 3 mm of
      // board all round, and it is also where a heart pendant is drilled.
      slot: 'circle',
      slotW: 5,
      slotH: 5,
      slotEdge: 20,
      frontLines: 'TERIMA\nKASIH',
      frontCap: 5.5,
      // The nudge is the whole trick. Text is centred in the room below the
      // slot, and on a heart the bottom half of that room is the point: centred,
      // the block is measured against a row 20 mm wide and comes out too small
      // to read. Lifted 7 mm it sits across the lobes, where the shape is at its
      // widest, and the same words set half again as large.
      frontNudge: 7,
      backHeading: '12 . 04 . 2026',
      backName: 'Aiman & Nadia',
      backPhone: '012-345 6789',
      backAddress: '',
      backCap: 2.4,
      backNudge: 7,
    },
  },
];

/**
 * A preset as a complete parameter set.
 *
 * Everything the preset does not name goes back to its default rather than being
 * inherited, because inheriting is the whole failure mode: leave a hand-set
 * nudge, a 12 mm border inset or "no slot" behind and the preset builds into
 * something it was never measured at.
 *
 * `thickness` and `kerf` are the exception, and not for tidiness. They describe
 * the board actually on the bed, and choosing what kind of tag to make says
 * nothing about that - so those two carry across untouched.
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
 * Against everything presetParams would put in place, not only the fields the
 * preset happens to name. Taking the unnamed ones back to their defaults is half
 * of what a preset does, so those count too - and checking only the named ones
 * leaves the card lit after the slot, the leading or a nudge has been changed.
 * That is worse than never lighting it: the tool claims a preset the design has
 * already left, and clicking the card that makes the claim throws those edits
 * away without a word.
 *
 * Thickness and kerf compare equal by construction, because presetParams carries
 * them across untouched - what board is on the bed is not part of which tag
 * this is.
 */
export function matchesPreset(preset, params) {
  const want = presetParams(preset, params);
  return Object.keys(want).every((k) => params[k] === want[k]);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rnd1 = (v) => Math.round(v * 10) / 10;
// Rounded DOWN for any number printed next to a threshold, so a measurement of
// 1.997 never prints as "2 mm" inside a sentence complaining it is under 2 mm.
const down2 = (v) => Math.floor(v * 100) / 100;

/**
 * A finite number, or the default.
 *
 * Same reasoning as the QR tool: NaN and Infinity travel straight through
 * Math.max, through the offsetter and into the SVG, where they print as "NaN"
 * with no clamp and no warning having fired anywhere. The UI never sends one,
 * but this module is also the API the tests use, and geometry that answers
 * nonsense quietly is worse than geometry that refuses.
 */
function finite(value, fallback, name, complaints) {
  if (value == null) return fallback;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  complaints.push(`${name} was not a number, so the default of ${fallback} was used.`);
  return fallback;
}

// ------------------------------------------------------------------ shapes

/**
 * Fillet every corner of a closed polygon.
 *
 * roundedRect only knows about rectangles, and four of the shapes here are not
 * rectangles. Given a polygon this walks each vertex, cuts back along both edges
 * by the tangent length, and sweeps an arc between the two cut points.
 *
 * The tangent length is `r / tan(theta/2)`, which grows without limit as a
 * corner gets sharper - the point of a triangle at 60 degrees needs 1.7x the
 * radius of setback, and the apex of a heart would need far more than the edge
 * is long. So it is clamped to half of the shorter adjacent edge and the radius
 * is recomputed from what the clamp allowed, which is why a sharp corner comes
 * out less rounded than a blunt one on the same setting rather than the polygon
 * turning inside out.
 */
export function roundCorners(ring, r, seg = 8) {
  const p = dedupe(ring);
  const n = p.length;
  if (n < 3 || !(r > 0)) return p;
  const out = [];
  for (let i = 0; i < n; i++) {
    const B = p[i];
    const A = p[(i - 1 + n) % n];
    const C = p[(i + 1) % n];
    const ux = A[0] - B[0]; const uy = A[1] - B[1];
    const vx = C[0] - B[0]; const vy = C[1] - B[1];
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) { out.push(B); continue; }
    const u = [ux / lu, uy / lu];
    const v = [vx / lv, vy / lv];
    let cosT = clamp(u[0] * v[0] + u[1] * v[1], -1, 1);
    const theta = Math.acos(cosT);
    // Collinear: nothing to round, and tan(theta/2) is 0 or infinite here.
    if (theta < 1e-4 || Math.abs(Math.PI - theta) < 1e-4) { out.push(B); continue; }
    const half = theta / 2;
    let t = r / Math.tan(half);
    t = Math.min(t, lu / 2, lv / 2);
    const rr = t * Math.tan(half);
    if (!(rr > 1e-6)) { out.push(B); continue; }

    const P1 = [B[0] + u[0] * t, B[1] + u[1] * t];
    const P2 = [B[0] + v[0] * t, B[1] + v[1] * t];
    // Centre lies along the internal bisector, at r / sin(theta/2) from B.
    let bx = u[0] + v[0];
    let by = u[1] + v[1];
    const lb = Math.hypot(bx, by) || 1;
    bx /= lb; by /= lb;
    const d = rr / Math.sin(half);
    const O = [B[0] + bx * d, B[1] + by * d];

    let a1 = Math.atan2(P1[1] - O[1], P1[0] - O[0]);
    let a2 = Math.atan2(P2[1] - O[1], P2[0] - O[0]);
    // Sweep the short way round; the arc between the two tangent points is
    // always less than half a turn.
    let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= seg; k++) {
      const a = a1 + (da * k) / seg;
      out.push([O[0] + Math.cos(a) * rr, O[1] + Math.sin(a) * rr]);
    }
  }
  return dedupe(out);
}

/** The heart, as a curve rather than as a polygon with a filleted point. */
function heartRing(w, h, seg = 160) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const s = Math.sin(t);
    pts.push([
      16 * s * s * s,
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
    ]);
  }
  const bb = bbox(pts);
  const scaled = pts.map(([x, y]) => [
    ((x - bb.x0) / bb.w) * w,
    ((y - bb.y0) / bb.h) * h,
  ]);
  return isCCW(scaled) ? scaled : scaled.reverse();
}

/** Flat bottom with rounded corners, domed top. */
function archRing(w, h, r, seg = 48) {
  const dome = Math.min(w / 2, h * 0.62);
  const body = h - dome;
  const rr = clamp(r, 0, Math.min(w / 2, body > 0 ? body : w / 2));
  const pts = [];
  // bottom-right corner, counter-clockwise from the bottom edge
  const corner = (cx, cy, a0) => {
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (k / 8) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  if (rr > 1e-6) {
    corner(w - rr, rr, -Math.PI / 2);
  } else {
    pts.push([w, 0]);
  }
  pts.push([w, body]);
  // the dome, right to left
  for (let k = 1; k < seg; k++) {
    const a = (k / seg) * Math.PI;
    pts.push([w / 2 + Math.cos(a) * (w / 2), body + Math.sin(a) * dome]);
  }
  pts.push([0, body]);
  if (rr > 1e-6) corner(rr, rr, Math.PI);
  else pts.push([0, 0]);
  return dedupe(pts);
}

/**
 * The outline of one piece, before kerf. Counter-clockwise, origin at the
 * bottom-left of its own bounding box.
 */
export function shapeRing(shape, w, h, radius) {
  const r = Math.max(0, radius || 0);
  switch (shape) {
    case 'circle':
      return ellipse(w / 2, h / 2, w / 2, h / 2, 96);

    case 'heart':
      return heartRing(w, h);

    case 'arch':
      return archRing(w, h, r);

    case 'triangle':
      return roundCorners([[0, 0], [w, 0], [w / 2, h]], r);

    case 'octagon': {
      // 0.293 is 1 - cos(45 degrees), which is the cut that turns a square into
      // a regular octagon. On a non-square rectangle the cut stays square, so
      // the corners match each other rather than the proportions.
      const c = Math.min(w, h) * 0.293;
      return roundCorners([
        [c, 0], [w - c, 0], [w, c], [w, h - c],
        [w - c, h], [c, h], [0, h - c], [0, c],
      ], r);
    }

    case 'tag': {
      // Shoulders cut back to a head narrower than the body - the shape a paper
      // luggage label has had for a century, and the reason the slot sits in a
      // part of the board that is doing nothing else.
      const neck = Math.min(w * 0.22, w / 2 - 1);
      const shoulder = Math.min(h * 0.18, h / 2);
      return roundCorners([
        [0, 0], [w, 0], [w, h - shoulder], [w - neck, h], [neck, h], [0, h - shoulder],
      ], r);
    }

    case 'square':
    case 'rect':
    default:
      return roundedRect(0, 0, w, h, clamp(r, 0, Math.min(w, h) / 2), 10);
  }
}

/**
 * The outline at exactly the size that was asked for, sitting on the origin.
 *
 * Rounding a corner pulls the outline inwards there, and on a corner that is not
 * square it pulls it inwards in BOTH axes: a 4 mm fillet on the 60-degree apex
 * of a 50 x 90 triangle takes 11 mm off the height. So a triangle built from the
 * requested numbers comes out 47 x 79, which is a tool quietly ignoring the size
 * the user typed.
 *
 * Scaling the finished ring to fit would fix the number and break the geometry -
 * a non-uniform scale turns every fillet into an ellipse segment, and the corner
 * radius stops being the radius. Instead the INPUT is adjusted and the shape
 * rebuilt, so the arcs stay circular and stay at the radius that was asked for;
 * only the triangle underneath them grows. The shrink is very nearly
 * proportional, so this lands inside a hundredth of a millimetre in two passes
 * and stops as soon as it does.
 */
export function fitShapeRing(shape, w, h, r, passes = 4) {
  let gw = w;
  let gh = h;
  let ring = shapeRing(shape, gw, gh, r);
  for (let i = 0; i < passes; i++) {
    const bb = bbox(ring);
    if (Math.abs(bb.w - w) < 0.005 && Math.abs(bb.h - h) < 0.005) break;
    if (bb.w > 1e-6) gw *= w / bb.w;
    if (bb.h > 1e-6) gh *= h / bb.h;
    ring = shapeRing(shape, gw, gh, r);
  }
  const bb = bbox(ring);
  return ring.map(([x, y]) => [x - bb.x0, y - bb.y0]);
}

// ------------------------------------------------------------------- slots

/** The strap hole, wound clockwise so it reads as a hole. */
export function slotRing(kind, cx, cy, sw, sh) {
  let ring;
  if (kind === 'circle') {
    ring = ellipse(cx, cy, sh / 2, sh / 2, 48);
  } else if (kind === 'square') {
    ring = roundedRect(cx - sw / 2, cy - sh / 2, sw, sh, Math.min(sw, sh) * 0.12, 4);
  } else {
    ring = roundedRect(cx - sw / 2, cy - sh / 2, sw, sh, sh / 2, 12);
  }
  return toCCW(ring).reverse();
}

/** Winding-rule point-in-polygon. */
export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1])
      && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * How much board there is between a hole and the outline, at the tightest point.
 *
 * Measured, not calculated. The distance from a slot to the edge of a heart is
 * not a function of the height, and the whole reason the shape list is
 * interesting is that some of those shapes are narrow exactly where the slot
 * wants to be. So every point of the hole is measured to every segment of the
 * outline and the smallest answer wins. A slot with 48 points against an outline
 * with 200 is ten thousand distance tests, once per rebuild, which is nothing.
 *
 * Comes back NEGATIVE when the hole has broken out through the edge, so one
 * number covers both "too close" and "not even inside".
 */
export function bridgeWidth(outline, hole) {
  let best = Infinity;
  for (const p of hole) {
    let d = Infinity;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      d = Math.min(d, distToSegment(p, outline[j], outline[i]));
    }
    if (!pointInRing(p, outline)) d = -d;
    best = Math.min(best, d);
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * The smallest slot inset that leaves `want` millimetres of board all round.
 *
 * Vague advice is no advice. "Move it down" is useless next to "14 mm would do
 * it", and on the shapes where this actually bites - a triangle that is a point
 * at the top, a heart that is a notch at the top - the number is not one anybody
 * could work out by looking. So the slot is walked down the tag in half
 * millimetre steps and the first position that clears is reported.
 *
 * Returns null when there is no position at all, which is the honest answer for
 * a slot wider than the shape ever gets.
 */
export function suggestSlotEdge(outline, kind, sw, sh, want = BRIDGE_GOOD) {
  const bb = bbox(outline);
  const cx = bb.x0 + bb.w / 2;
  for (let edge = 0; edge <= bb.h - sh; edge += 0.5) {
    const cy = bb.y1 - edge - sh / 2;
    if (bridgeWidth(outline, slotRing(kind, cx, cy, sw, sh)) >= want) {
      return Math.round(edge * 10) / 10;
    }
  }
  return null;
}

function distToSegment(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const L2 = vx * vx + vy * vy;
  const t = L2 > 0 ? clamp((wx * vx + wy * vy) / L2, 0, 1) : 0;
  return Math.hypot(wx - vx * t, wy - vy * t);
}

// ------------------------------------------------------------- stroke text
//
// The words on a luggage tag are set in the single-line Hershey face rather than
// in an outline font, and that is a decision about the product rather than about
// what was easy.
//
// A phone number engraved as a filled outline is a raster job: the head sweeps
// the whole block of text line by line, and on a 3 mm phone number that is
// minutes of burning to produce something that reads as a smudge, because the
// counters of the digits are smaller than the spot. A single-line face is one
// pass down the middle of each stroke - seconds, and legible at 2.5 mm because
// there is nothing to fill in. Small text on a small piece is exactly the case
// the stroke face was made for.
//
// It is also the one text engine here that runs without a font file, so the
// contact card is testable in node, and an export can never be waiting on a
// download.

/**
 * Fit a block of centred lines into a box, shrinking until the widest line fits
 * across and the whole block fits down.
 *
 * Each row carries its own `scale`, a multiple of the block's cap height, and
 * that is the part that matters. The heading on the back of a tag reads "IF
 * FOUND, PLEASE CONTACT" - twenty-four characters, far longer than any of the
 * lines underneath it. Set every row at one size and that heading decides the
 * size of the phone number, which is the line that actually has a job to do: on
 * a 50 mm tag it dragged the whole card down to 1.7 mm, illegible. Giving the
 * heading a scale of about two thirds lets it be the small label it is, and the
 * name and the number come out at a size somebody can read across a carousel.
 *
 * Every constraint is linear in the cap height, so the largest size that fits is
 * arithmetic rather than a search - there is no loop to stop one step short of
 * the answer.
 *
 * Returns the polylines plus the cap height it settled on, so the caller can say
 * out loud that the text was shrunk rather than let it happen invisibly.
 */
export function fitLines(rows, {
  cx, top, width, height, cap, leading = 1.55, minCap = 1.4,
}) {
  const items = rows
    .map((r) => (typeof r === 'string' ? { text: r, scale: 1 } : r))
    .map((r) => ({ text: String(r.text ?? '').trim(), scale: r.scale ?? 1 }))
    .filter((r) => r.text);
  if (!items.length) return { paths: [], cap: 0, height: 0, shrunk: false, lines: 0 };

  const n = items.length;
  // Height of the block per unit of cap height: every row but the last
  // contributes a full line pitch, the last contributes only its cap band.
  const heightUnit = items.reduce(
    (sum, r, i) => sum + r.scale * (i < n - 1 ? leading : 1), 0);
  const widthUnit = Math.max(...items.map((r) => labelWidth(r.text, 1) * r.scale));

  const byW = widthUnit > 0 ? width / widthUnit : cap;
  const byH = heightUnit > 0 ? height / heightUnit : cap;
  const fits = Math.min(byW, byH);
  const shrunk = fits < cap - 1e-6;
  const c = Math.max(minCap, Math.min(cap, fits));

  const paths = [];
  let bandTop = top;
  let smallest = Infinity;
  let largest = 0;
  for (let i = 0; i < n; i++) {
    const size = c * items[i].scale;
    paths.push(...labelPaths(items[i].text, cx, bandTop - size / 2, size));
    bandTop -= size * leading;
    smallest = Math.min(smallest, size);
    largest = Math.max(largest, size);
  }
  // `cap` is the block's unit, which no line is necessarily set at. The numbers
  // any warning should quote are the sizes actually burnt, so they are reported
  // separately rather than left for the caller to multiply back out.
  return {
    paths,
    cap: c,
    smallest: Number.isFinite(smallest) ? smallest : 0,
    largest,
    height: c * heightUnit,
    // What the widest line actually measures. The caller needs this to check a
    // block against a shape that narrows, where "the width I asked for" and
    // "the width I used" are not the same number.
    usedWidth: c * widthUnit,
    shrunk,
    lines: n,
  };
}

/**
 * The lines the back of the tag carries, in the order they are engraved, each
 * with the size it wants relative to the block.
 *
 * The order is the order somebody reads it in a hurry: what this is, who it
 * belongs to, how to reach them today, where to post it if all else fails. The
 * phone number is the largest thing on the card for the same reason.
 */
export function backLines(p) {
  return [
    { text: p.backHeading, scale: 0.75 },
    { text: p.backName, scale: 1.15 },
    { text: p.backPhone, scale: 1.15 },
    ...String(p.backAddress ?? '').split(/\r?\n/).map((t) => ({ text: t, scale: 0.85 })),
  ];
}

// -------------------------------------------------------------------- build

function ringLength(ring, closed = true) {
  let d = 0;
  const n = ring.length;
  for (let i = closed ? 0 : 1; i < n; i++) {
    const a = ring[(i - 1 + n) % n];
    const b = ring[i];
    d += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return d;
}

const polyLength = (flat) => {
  let d = 0;
  for (let k = 2; k < flat.length; k += 2) {
    d += Math.hypot(flat[k] - flat[k - 2], flat[k + 1] - flat[k - 1]);
  }
  return d;
};

/**
 * Build both pieces plus everything worth saying about them.
 *
 * `decor` is the free artwork the user placed, keyed by side. It is passed in
 * rather than reached for because this module has no store: the tests build a
 * tag with no decoration at all, and the exporters want the same function the
 * screen is drawing.
 */
export function buildTag(input = {}) {
  const p = { ...DEFAULTS, ...input };
  const warnings = [];
  const notes = [];
  const num = (key, label) => finite(p[key], DEFAULTS[key], label, warnings);

  const width = clamp(num('width', 'Width'), MIN_SIZE, 400);
  let height = clamp(num('height', 'Height'), MIN_SIZE, 400);
  // A circle stretched is an ellipse, a square stretched is a rectangle, and a
  // heart stretched to 50 x 90 is a tulip - the lobes go narrow, the tip goes
  // needle-sharp, and the inset border folds through itself trying to follow it.
  // These three take their height from their width and the inspector hides the
  // field, rather than offering a control whose whole range is wrong.
  if (SQUARE_SHAPES.includes(p.shape)) height = width;

  const radius = clamp(num('radius', 'Corner radius'), 0, Math.min(width, height) / 2);
  const thickness = Math.max(0.5, num('thickness', 'Thickness'));
  const kerf = Math.max(0, num('kerf', 'Kerf'));
  const k = kerf / 2;

  const shape = SHAPES.some((s) => s.id === p.shape) ? p.shape : 'rect';
  const outlineNominal = fitShapeRing(shape, width, height, radius);
  const bb = bbox(outlineNominal);

  // ---- the strap slot ----------------------------------------------------
  const slotKind = SLOTS.some((s) => s.id === p.slot) ? p.slot : 'stadium';
  const slotH = clamp(num('slotH', 'Slot height'), 1, Math.max(1, height / 2));
  const slotW = slotKind === 'circle'
    ? slotH
    : clamp(num('slotW', 'Slot width'), slotH, Math.max(slotH, width));
  const slotEdge = Math.max(0, num('slotEdge', 'Slot inset'));
  const slotCy = bb.y1 - slotEdge - slotH / 2;
  const slotCx = bb.x0 + width / 2;

  const holesNominal = [];
  if (slotKind !== 'none') {
    holesNominal.push(slotRing(slotKind, slotCx, slotCy, slotW, slotH));
  }

  let bridge = Infinity;
  let slotFix = null;
  if (holesNominal.length) {
    bridge = bridgeWidth(outlineNominal, holesNominal[0]);
    if (bridge < BRIDGE_GOOD) {
      const at = suggestSlotEdge(outlineNominal, slotKind, slotW, slotH);
      slotFix = at != null && Math.abs(at - slotEdge) > 0.05 ? at : null;
    }
    // Every one of these ends with a number to type rather than a direction to
    // move in. On a heart or a triangle the position that works is not something
    // anybody can read off the drawing.
    const move = slotFix != null
      ? ` Set the slot inset to ${slotFix} mm and there is ${BRIDGE_GOOD} mm all round.`
      : ' There is no position on this shape where it fits - make the slot '
        + 'smaller, or the tag bigger.';
    if (bridge < 0) {
      warnings.push('The slot is outside the tag - it has broken through the '
        + 'edge, and what comes off the bed is a tag with a bite out of it.' + move);
    } else if (bridge < BRIDGE_MIN) {
      warnings.push(`Only ${down2(bridge)} mm of board between the slot and the `
        + 'edge at the closest point. That is one sliver of short grain and a '
        + 'bag will snap it.' + move);
    } else if (bridge < BRIDGE_GOOD) {
      warnings.push(`${down2(bridge)} mm of board between the slot and the edge. `
        + 'It holds on acrylic, but on plywood the grain runs across that '
        + `bridge - ${BRIDGE_GOOD} mm is the safe number.` + move);
    }
    if (slotKind !== 'circle' && slotW < STRAP_W) {
      warnings.push(`A ${rnd1(slotW)} mm slot is narrower than a standard `
        + `${STRAP_W} mm luggage strap. The tag will need a cord instead.`);
    }
    if (slotH < STRAP_H) {
      warnings.push(`A ${rnd1(slotH)} mm opening will not take a folded strap - `
        + `they double back through, so it needs ${STRAP_H} mm at least.`);
    }
  }

  // ---- the border --------------------------------------------------------
  const borderId = BORDERS.some((b) => b.id === p.border) ? p.border : 'none';
  const borderInset = Math.max(0.5, num('borderInset', 'Border inset'));
  const borderGap = Math.max(0.3, num('borderGap', 'Border gap'));
  const borderRings = [];
  const outlineArea = Math.abs(area(outlineNominal));
  if (borderId !== 'none') {
    const insets = borderId === 'double'
      ? [borderInset, borderInset + borderGap]
      : [borderInset];
    for (const d of insets) {
      // An inset that eats past the middle folds the ring through itself and
      // draws a knot. There is no sensible border at that size, so there is no
      // border - and the warning says which number caused it.
      if (d * 2 >= Math.min(width, height)) {
        warnings.push(`A ${rnd1(d)} mm border inset is wider than half the tag, `
          + 'so that line was dropped.');
        continue;
      }
      // offsetPolygon is exact at a rounded corner and wrong at a sharp one: at
      // the bottom of a heart the inset border folds through itself. unloop cuts
      // the crossing out. The area check below is the backstop for whatever it
      // cannot repair - a border that has lost its winding or most of its area
      // is not a border, it is a knot, and it is better dropped than burnt.
      const ring = unloop(offsetPolygon(outlineNominal, -d));
      const shrunk = Math.abs(area(ring));
      if (!isCCW(ring) || shrunk < outlineArea * 0.2) {
        warnings.push(`A ${rnd1(d)} mm border does not follow this shape - it `
          + 'folds through itself at the point - so that line was dropped. A '
          + 'smaller inset will work.');
        continue;
      }
      borderRings.push(ring);
    }
  }

  // ---- the words ---------------------------------------------------------
  const textMargin = Math.max(0, num('textMargin', 'Text margin'));
  const leading = clamp(num('leading', 'Line spacing'), 1, 3);
  // Text lives below the slot, inside the border, inside the margin.
  const inset = textMargin + (borderId === 'none' ? 0
    : borderInset + (borderId === 'double' ? borderGap : 0));
  const roomTop = (slotKind === 'none' ? bb.y1 : slotCy - slotH / 2) - inset;
  const roomBottom = bb.y0 + inset;
  const roomH = Math.max(0, roomTop - roomBottom);
  const cx = bb.x0 + width / 2;

  /**
   * Set a block of lines in the room below the slot, centred, at the largest
   * size that fits the shape where the block actually lands.
   *
   * The width has to be measured at the text, not at the widest point and not
   * across the whole room. A triangle is 50 mm across at the bottom and nothing
   * at the top, so the bounding box would hang a name out over both sloping
   * edges. But the narrowest row of the whole room is wrong too, and wrong in a
   * way that showed up on four of the eight shapes: the room below an octagon's
   * slot runs down into the chamfered bottom corners, which are 20 mm across,
   * while the three lines of the contact card sit in the middle of the piece
   * where it is the full 50. Measuring the whole band charged the text for
   * corners it never reaches, and dropped the phone number to 1.6 mm on a tag
   * with room for 2.6.
   *
   * So it is measured twice. The first pass uses the whole room, which is always
   * safe; that gives a block height, and therefore the band the block will
   * really occupy once it is centred. If that band is wider, the block is set
   * again in it - and then CHECKED, because a bigger cap height makes a taller
   * block, which reaches further into the corners than the band it was measured
   * in. If the second attempt no longer fits its own band, the conservative
   * first one is kept. Growing is optional; being right is not.
   */
  const setBlock = (rows, cap, nudge) => {
    const top0 = roomTop + nudge;
    const widthOver = (hi, lo) => Math.max(
      1, widthAt(outlineNominal, Math.min(hi, lo), Math.max(hi, lo)) - inset * 2);
    const bandOf = (block) => {
      const hi = top0 - (roomH - block.height) / 2;
      return [hi, hi - block.height];
    };
    const set = (w) => fitLines(rows, {
      cx, top: top0, width: w, height: roomH, cap, leading,
    });

    // The block's size and the room it has are each a function of the other:
    // a bigger cap height makes a taller block, a taller block reaches further
    // into the corners, and the corners are what limit the cap height. So it is
    // solved by iteration rather than by a single guess.
    //
    // The starting point is the conservative one - measured across the whole
    // room, which no block can ever overflow - and each pass re-measures the
    // band the current block really occupies and re-sets it in that. Two or
    // three passes settle; six is the ceiling so a shape that oscillates cannot
    // spin here.
    const safe = set(widthOver(roomTop, roomBottom));
    let chosen = safe;
    if (safe.paths.length) {
      for (let i = 0; i < 6; i++) {
        const next = set(widthOver(...bandOf(chosen)));
        const settled = Math.abs(next.cap - chosen.cap) < 0.01;
        chosen = next;
        if (settled) break;
      }
      // Whatever it settled on has to fit the band it ended up in. If it does
      // not - an oscillation, or a shape that narrows faster than the block
      // grows - the conservative first answer is kept, because that one cannot
      // be wrong.
      // The iteration converges on the point where the block is exactly as wide
      // as the row it sits in, and floating point lands it a fraction either
      // side - a ten-thousandth of a millimetre over was enough to fail an exact
      // check and throw the whole result away. So the last pass is set a hair
      // narrower than the room it measured. One per cent of 20 mm is two tenths
      // of a millimetre, an order below the kerf, and it makes the block
      // strictly smaller than its band rather than exactly equal to it.
      chosen = set(widthOver(...bandOf(chosen)) * 0.99);
      // And it is still checked. A shape can narrow faster than the block grows,
      // and a block held up at the minimum cap height cannot shrink any further
      // to fit - on a triangle the contact card genuinely does not go in, and
      // the honest answer is the conservative first attempt plus the warning
      // that the text is too small, not a block quietly hanging over the edge.
      if (chosen.usedWidth > widthOver(...bandOf(chosen)) + 0.05) chosen = safe;
    }

    // Centred last, now that the real height is known - it depends on the cap
    // height the fit settled on, so it cannot be done before.
    const dy = (roomH - chosen.height) / 2;
    if (!chosen.paths.length || Math.abs(dy) < 1e-9) return chosen;
    return {
      ...chosen,
      paths: chosen.paths.map((flat) => {
        const out = flat.slice();
        for (let i = 1; i < out.length; i += 2) out[i] -= dy;
        return out;
      }),
    };
  };

  const front = setBlock(
    String(p.frontLines ?? '').split(/\r?\n/).map((t) => ({ text: t })),
    Math.max(1.6, num('frontCap', 'Front text size')),
    num('frontNudge', 'Front nudge'));
  const back = setBlock(
    backLines(p),
    Math.max(1.6, num('backCap', 'Back text size')),
    num('backNudge', 'Back nudge'));

  const frontBlock = front;
  const backBlock = back;

  if (front.shrunk) {
    notes.push(`The front name was set down to ${rnd1(front.cap)} mm so it fits `
      + 'inside the border.');
  }
  if (back.shrunk) {
    notes.push(`The contact lines were set down to ${rnd1(back.cap)} mm so they `
      + 'fit inside the border.');
  }
  // Measured on the line that has to do the work, not on the block's nominal cap
  // height, and not on the smallest line either. The heading is set smaller on
  // purpose - warning about that would fire on a perfectly good tag. It is the
  // name and the number somebody reads across a carousel, so that is what gets
  // checked, and the number quoted is the size those lines are actually burnt at.
  if (backBlock.largest > 0 && backBlock.largest < BODY_MIN) {
    warnings.push('The name and number on the back come out '
      + `${rnd1(backBlock.largest)} mm tall. Under about ${BODY_MIN} mm a burnt `
      + "line is hard to read at arm's length - use a bigger tag, or put less "
      + 'on the back.');
  } else if (backBlock.smallest > 0 && backBlock.smallest < LABEL_MIN) {
    notes.push(`The heading comes out ${rnd1(backBlock.smallest)} mm tall, small `
      + 'enough to need reading close up. It is a label rather than the '
      + 'information, so that is usually fine.');
  }
  if (backBlock.paths.length && !String(p.backPhone ?? '').trim()) {
    notes.push('No phone number on the back. It is the only line that gets a '
      + 'bag returned the same day.');
  }

  // ---- kerf --------------------------------------------------------------
  // Cut paths only. Engraving takes no slug of material out, so there is no half
  // kerf to give back on the border or the lettering.
  const outline = k > 0 ? offsetPolygon(outlineNominal, k) : outlineNominal;
  // offsetPolygon's sign follows the winding - positive grows a counter-clockwise
  // ring - and a hole is wound clockwise. Turn it the right way round, shrink it,
  // and turn it back, rather than passing the sign that happens to work.
  const holes = holesNominal.map((hole) => (k > 0
    ? offsetPolygon(toCCW(hole), -k).reverse()
    : hole));

  const size = { w: bb.w, h: bb.h };

  const piece = (id, label, strokes) => ({
    id,
    label,
    outline,
    outlineNominal,
    holes,
    borderRings,
    strokes,                 // open polylines, flat [x,y,x,y,...]
    size,
    thickness,
  });

  const pieces = [
    piece('front', 'Front', frontBlock.paths),
    piece('back', 'Back', backBlock.paths),
  ];

  let cutLength = 0;
  for (const ring of [outline, ...holes]) cutLength += ringLength(ring);
  cutLength *= 2; // both pieces
  let lineLength = 0;
  for (const r of borderRings) lineLength += ringLength(r) * 2;
  for (const pc of pieces) for (const s of pc.strokes) lineLength += polyLength(s);

  return {
    // The parameters ACTUALLY used, not the ones handed in. A caller that reads
    // its own NaN back learns nothing.
    params: {
      ...p,
      width, height, radius, thickness, kerf,
      shape,
      slot: slotKind, slotW, slotH, slotEdge,
      border: borderId, borderInset, borderGap,
      textMargin, leading,
    },
    pieces,
    derived: {
      pieceW: size.w,
      pieceH: size.h,
      pieceCount: pieces.length,
      bridge: Number.isFinite(bridge) ? bridge : null,
      slotFix,
      frontCapUsed: frontBlock.cap,
      backCapUsed: backBlock.cap,
      // The sizes actually burnt, as opposed to the block's unit. Every message
      // about legibility has to quote one of these or it is quoting a number
      // that appears nowhere on the tag.
      backLargest: backBlock.largest || 0,
      backSmallest: backBlock.smallest || 0,
      textRoom: {
        w: Math.max(0, widthAt(outlineNominal, roomBottom, roomTop) - inset * 2),
        h: roomH,
      },
      cutLength,
      lineLength,
      hasCut: true,
      hasEngraveLine: borderRings.length > 0
        || pieces.some((pc) => pc.strokes.length > 0),
      warnings,
      notes,
    },
  };
}

/**
 * How wide the shape is across a horizontal band, at its narrowest.
 *
 * Sampled rather than solved. The outline is already a polygon at this point, so
 * a scanline at each of a few heights is both simpler and exactly as accurate as
 * the outline itself - and it is the narrowest row that matters, because that is
 * the row a long name would poke out of.
 */
export function widthAt(ring, yLow, yHigh, samples = 12) {
  let narrow = Infinity;
  for (let s = 0; s <= samples; s++) {
    const y = yLow + ((yHigh - yLow) * s) / samples;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y)) {
        const x = xi + ((xj - xi) * (y - yi)) / (yj - yi);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    if (hi > lo) narrow = Math.min(narrow, hi - lo);
  }
  return Number.isFinite(narrow) ? narrow : 0;
}

export { ringLength, polyLength };
