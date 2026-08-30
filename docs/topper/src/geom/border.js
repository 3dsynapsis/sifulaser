// Borders: the frame the lettering hangs off.
//
// Without one, a topper holds together because the letters touch each other -
// which is why the tool spends so much effort on line height, thickening and
// bridges. A border changes the problem completely. Every letter only has to
// reach the frame, and the frame is always there, so four things stop being
// difficult at once:
//
//   - a letter adrift needs a short bridge to the frame, not a long one to
//     whichever letter happens to be nearest
//   - a fine script becomes usable, because the frame carries the handling and
//     the letters only have to survive being letters
//   - the stake lands on the frame instead of hunting for something solid
//   - the weight is centred by construction, so it does not lean
//
// A border is handed to the distance field as GROUPS, each group being one
// closed shape - outer contour counter-clockwise, its holes clockwise - exactly
// like a letter with a counter. Nothing downstream needs to know it is a border.
//
// Groups rather than one flat list of rings, because the fill is non-zero
// winding and two overlapping rings in one group cancel where they cross: in
// the double square, the band of one square passing through the hole of the
// other sums to zero, and the frame comes out with gaps chewed in it. As
// separate groups each is filled on its own and the field unions them with a
// min(), which is what overlapping shapes are supposed to do.
//
// Millimetres, y-up, centred on the origin.

import { ellipse, regularPolygon } from './path.js';

// How much of the room inside a frame the lettering takes by default.
//
// One would mean the text block is inscribed in the largest circle the frame
// leaves free, by its diagonal - and that leaves the words visibly marooned in
// the middle of every shape but a circle, because the corners of a text block
// are mostly empty and a hexagon or a star has far more room than its inscribed
// circle admits. These are measured per shape: how far the lettering has to be
// let out before an ordinary two or three line name reaches the frame.
//
// Not a value that can be right for every text. A name whose middle line is a
// single ampersand has empty corners however big it is set, so its ink never
// arrives at the ring no matter what this says - which is what the struts are
// for. It is a sensible place to start, and Fill in the inspector moves it.

const flat = (pts) => {
  const out = new Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    out[i * 2] = pts[i][0];
    out[i * 2 + 1] = pts[i][1];
  }
  return out;
};

/** Signed area, twice over - only its sign is used. */
const shoelace = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a;
};

/** Outer contours are counter-clockwise, holes are clockwise. */
const ccw = (pts) => (shoelace(pts) < 0 ? pts.slice().reverse() : pts);
const cw = (pts) => (shoelace(pts) > 0 ? pts.slice().reverse() : pts);

const rotate = (pts, deg) => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
};

/** One closed shape from an outer outline and an inner one. */
const ring = (outer, inner) => [flat(ccw(outer)), flat(cw(inner))];

/**
 * A regular polygon frame, `width` across its bounding box, band `t` thick.
 *
 * The inner outline is the same polygon with `t` off its APOTHEM, not off its
 * circumradius - shrinking the radius by t leaves the corners thin and the
 * flats fat, which on an octagon is visible at a glance.
 */
function polygonRing(width, t, sides, spinDeg) {
  const R = width / 2;
  const k = Math.cos(Math.PI / sides);
  const inner = Math.max(1, R - t / k);
  return ring(
    rotate(regularPolygon(0, 0, R, sides), spinDeg),
    rotate(regularPolygon(0, 0, inner, sides), spinDeg),
  );
}

/**
 * A heart, from the curve everybody uses.
 *
 * The inner outline is the same curve scaled down rather than a true offset. A
 * real offset would keep the band an even thickness, and would also fold over
 * itself in the notch at the top, where the outline turns through a sharp
 * concave corner. The band is a little thinner at the notch and at the point
 * this way, and it never self-intersects.
 */
function heartPoints(k = 1, seg = 220) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    pts.push([
      16 * Math.sin(t) ** 3 * k,
      (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k,
    ]);
  }
  return pts;
}

/**
 * One leaf: an almond pointing along +x from the origin.
 *
 * sin(pi u) raised to a power under one is the whole shape - it is zero at both
 * ends, so the leaf comes to a point at the stem and at the tip, and the power
 * decides how full it is in between.
 */
function leafPoints(len, wide, seg = 26) {
  const half = (u) => (wide / 2) * Math.sin(Math.PI * u) ** 0.72;
  const up = [];
  const down = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    up.push([len * u, half(u)]);
    down.push([len * u, -half(u)]);
  }
  return [...up, ...down.reverse()];
}

const place = (pts, deg, cx, cy) => rotate(pts, deg).map(([x, y]) => [x + cx, y + cy]);

export const BORDERS = [
  {
    id: 'none',
    name: 'None',
    note: 'No frame. The letters have to reach each other, which is what the line '
      + 'height and the thickening are for.',
    build: () => null,
  },
  {
    id: 'circle',
    name: 'Circle',
    fill: 1.15,
    note: 'The usual one, and the easiest to letter inside.',
    build: (width, t) => {
      const R = width / 2;
      return [ring(ellipse(0, 0, R, R, 160),
        ellipse(0, 0, Math.max(1, R - t), Math.max(1, R - t), 160))];
    },
  },
  {
    id: 'hexagon',
    name: 'Hexagon',
    fill: 1.35,
    // Spun 30 degrees off the default, which starts at the top: that puts the
    // points at three and nine, and the flats top and bottom, so the widest
    // part of the frame is level with the middle line of the text.
    note: 'Points at the sides, flat across the top and bottom. Two names either '
      + 'side of an ampersand sit in it well.',
    build: (width, t) => [polygonRing(width, t, 6, 30)],
  },
  {
    id: 'octagon',
    name: 'Octagon',
    fill: 1.3,
    note: 'Eight sides. Flat top and bottom, so a long line of text has more room '
      + 'than a circle gives it.',
    build: (width, t) => [polygonRing(width, t, 8, 22.5)],
  },
  {
    id: 'heart',
    name: 'Heart',
    fill: 1.25,
    note: 'For a wedding or an anniversary. The notch at the top eats into the '
      + 'space, so a long first line is a tight fit.',
    build: (width, t) => {
      // The curve is 32 units across, so a band asked for in millimetres has to
      // be converted before it can come off the scale factor.
      const k = width / 32;
      const shrink = Math.max(0.02, Math.min(0.6, (t / k) / 13));
      return [ring(heartPoints(k), heartPoints(k * (1 - shrink)))];
    },
  },
  {
    id: 'vine',
    name: 'Vine',
    // The one frame that does not want the lettering run right up to it. The
    // leaves grow inward off the ring, so text sized to reach the band would
    // be laid straight over the whole spray and bury it - which is what it did
    // at first, and the leaves read as notches bitten out of a plain hoop.
    fill: 0.9,
    note: 'A ring with a spray of leaves down one side. Made for a single initial '
      + 'or a short name - the leaves take up the room a third line would want.',
    build: (width, t) => {
      const R = width / 2;
      // The ring is drawn finer than the others on purpose. The leaves are what
      // carries this one, and a heavy band next to them reads as a hoop with
      // some decoration stuck on rather than as a wreath.
      const band = Math.max(0.8, t * 0.62);
      const groups = [ring(ellipse(0, 0, R, R, 160),
        ellipse(0, 0, Math.max(1, R - band), Math.max(1, R - band), 160))];

      // Leaves run up the left-hand side, the way the reference does it, and
      // alternate which way they lie so the spray reads as a growing thing
      // rather than as a comb. Their length follows a slow sine, so they taper
      // away at both ends of the run instead of stopping dead.
      //
      // Few and large, not many and small. Eleven of them over this arc sat
      // closer together than they were wide, and the field welded the whole run
      // into one saw edge - the ring came out looking bitten rather than
      // planted. Spaced wider than a leaf is broad, each one reads as itself.
      const n = 7;
      const from = 146;
      const to = 284;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const deg = from + (to - from) * u;
        const a = (deg * Math.PI) / 180;
        const taper = 0.55 + 0.45 * Math.sin(Math.PI * u) ** 0.6;
        const len = R * 0.4 * taper;
        const wide = len * 0.46;
        // The stem end is buried a little way into the band so the leaf welds
        // into the ring instead of resting against it.
        const base = R - band * 0.75;
        const lean = i % 2 ? 38 : -38;
        groups.push([flat(ccw(place(
          leafPoints(len, wide),
          deg + 180 + lean,
          Math.cos(a) * base,
          Math.sin(a) * base,
        )))]);
      }
      return groups;
    },
  },
  {
    id: 'double-square',
    name: 'Double square',
    fill: 1.4,
    note: 'Two square frames crossing at forty-five degrees. Modern, and the eight '
      + 'points give the stake a corner to sit on.',
    build: (width, t) => {
      // Both squares are the same size, so the one standing on its corner sets
      // the overall width and the flat one sits inside it - which is the shape
      // in the reference, and why the two read as one star rather than as a
      // square with a diamond dropped on top.
      const a = width / (2 * Math.SQRT2);
      const b = Math.max(1, a - t);
      const sq = (h) => [[-h, -h], [h, -h], [h, h], [-h, h]];
      return [
        ring(sq(a), sq(b)),
        ring(rotate(sq(a), 45), rotate(sq(b), 45)),
      ];
    },
  },
];

export const borderOf = (id) => BORDERS.find((b) => b.id === id) || BORDERS[0];

/**
 * Force a frame to exactly `width` across, centred on the origin.
 *
 * Every shape above already aims for this, and every shape above is one
 * trigonometric slip away from missing it - the octagon did, by three
 * millimetres, because a polygon's bounding box depends on which way round it
 * was started. The width printed on the inspector is a promise about the piece
 * that comes off the machine, so it is measured and corrected here rather than
 * trusted, once, for all of them. A shape added later cannot get it wrong.
 *
 * Measured over every ring of every group, not just the first: the vine's
 * leaves and the second square are as much a part of the silhouette as the
 * outline they hang off.
 */
export function fitWidth(groups, width) {
  if (!groups || !groups.length) return groups;
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
  const span = x1 - x0;
  if (!(span > 0)) return groups;
  const k = width / span;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return groups.map((g) => g.map((r) => {
    const out = new Array(r.length);
    for (let i = 0; i < r.length; i += 2) {
      out[i] = (r[i] - cx) * k;
      out[i + 1] = (r[i + 1] - cy) * k;
    }
    return out;
  }));
}

/** Move a whole frame, in place. */
export function shiftGroups(groups, dx, dy) {
  for (const g of groups) {
    for (const r of g) {
      for (let i = 0; i < r.length; i += 2) {
        r[i] += dx;
        r[i + 1] += dy;
      }
    }
  }
  return groups;
}

/**
 * The biggest circle about the origin that the frame leaves free, which is what
 * the lettering is sized against.
 *
 * Only holes are measured. A hole is the empty middle of a frame; a group with
 * no hole is something solid hanging off it - a leaf - and the reference art
 * has the letter running straight over those, so letting a leaf shrink the
 * text would be wrong as well as unnecessary.
 *
 * Distance to the EDGES, not to the corners: a circle sampled at 160 points is
 * the same either way, but an octagon is eight points and its closest approach
 * is the middle of a flat, seven per cent nearer than a vertex. Measured at the
 * vertices, the lettering came out that much too big and broke out through the
 * flats - three millimetres past a piece the inspector was calling 12 cm.
 */
export function innerRadius(groups) {
  let best = Infinity;
  for (const g of groups) {
    for (let h = 1; h < g.length; h++) {
      const r = g[h];
      const n = r.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = r[j * 2];
        const ay = r[j * 2 + 1];
        const dx = r[i * 2] - ax;
        const dy = r[i * 2 + 1] - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0
          ? Math.max(0, Math.min(1, (-ax * dx + -ay * dy) / len2))
          : 0;
        best = Math.min(best, Math.hypot(ax + dx * t, ay + dy * t));
      }
    }
  }
  return Number.isFinite(best) ? best : 0;
}

/** Lowest point of the whole frame, which is where a stake goes on. */
export function lowestY(groups) {
  let y = Infinity;
  for (const g of groups) {
    for (const r of g) {
      for (let i = 1; i < r.length; i += 2) y = Math.min(y, r[i]);
    }
  }
  return Number.isFinite(y) ? y : 0;
}
