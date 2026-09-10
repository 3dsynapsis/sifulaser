// Where the pattern is allowed to be, and the cartouche it has to keep out of.
//
// Everything here is answered with DISTANCES, not with offset polygons. That is
// deliberate. offsetPolygon in path.js walks the outward normals of a
// counter-clockwise ring, has no self-intersection removal, and past a four
// times miter limit it quietly substitutes a single edge-offset point with no
// matching point from the previous edge (path.js:81). A star tessellation is
// nothing but sharp corners and a crescent is nothing but concavity, so
// "the panel outline inset by the frame band" and "the cartouche grown by the
// band width" are asked as questions about distance instead:
//
//   inside the frame band's inner edge  ==  in the panel AND at least wF from
//                                           the panel outline
//   clear of the cartouche band         ==  not in C AND at least wB from C
//
// Both are exact, both are winding-blind, and neither can fold through itself.
// The price is that they are point queries rather than a ring, which is fine
// because that is all the cell filter and the raster ever need.
//
// The band is never "added" as material either. In pattern.js the panel starts
// solid and cells are SUBTRACTED from it, so anywhere a cell is not allowed is
// material by default. The band is material because nothing was taken out of
// it - which is a stronger statement than welding it on afterwards, and it is
// the reason a strap severed by the band cannot come away: the severing never
// happens, the cell that would have severed it is simply not cut.
//
// Millimetres, y-up, rings are [x, y] pairs.

import { inRing, distToRing, ringBBox } from './arrangement.js';

const TAU = Math.PI * 2;

/** Scale a ring built in the [-1,1] square into a box of half-extents a, b. */
function fitUnit(ring, cx, cy, a, b) {
  const bb = ringBBox(ring);
  const sx = (2 * a) / (bb.w || 1);
  const sy = (2 * b) / (bb.h || 1);
  const mx = (bb.x0 + bb.x1) / 2;
  const my = (bb.y0 + bb.y1) / 2;
  return ring.map(([x, y]) => [cx + (x - mx) * sx, cy + (y - my) * sy]);
}

/** Superellipse. n = 2.5 reads as a medallion where n = 2 reads as an egg. */
function unitRound(seg = 96, n = 2.5) {
  const e = 2 / n;
  const out = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * TAU;
    const c = Math.cos(t);
    const s = Math.sin(t);
    out.push([Math.sign(c) * Math.abs(c) ** e, Math.sign(s) * Math.abs(s) ** e]);
  }
  return out;
}

/**
 * Mihrab / dome: straight sides and a round top. The one that reads as Islamic
 * without borrowing anybody's composition, and the default for that reason.
 */
function unitDome(seg = 48) {
  const r = 1;          // cap radius equals the half width
  const yc = 1 - r;     // where the cap springs from, in the unit box
  const out = [[-1, -1], [1, -1], [1, yc]];
  for (let i = 1; i < seg; i++) {
    const t = (i / seg) * Math.PI;
    out.push([Math.cos(t) * r, yc + Math.sin(t) * r]);
  }
  out.push([-1, yc]);
  return out;
}

/**
 * Eight-pointed star, built from the same closed form as the pattern behind it
 * so the cartouche rhymes with the tessellation rather than arguing with it.
 */
function unitStar(points = 8, thetaDeg = 67.5) {
  const g = Math.PI / points;
  const rho = Math.cos(g);
  const rv = rho * (Math.cos(g) - Math.sin(g) * Math.tan((thetaDeg * Math.PI) / 180 - g));
  const out = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    out.push([Math.cos(a), Math.sin(a)]);
    const b = a + g;
    out.push([Math.cos(b) * rv, Math.sin(b) * rv]);
  }
  return out;
}

/**
 * Crescent, with both horns cut off flat.
 *
 * A true crescent's horns come to a cusp of zero angle by definition, and a
 * zero-angle point of plywood chars away and leaves a ragged notch in the band.
 * So the horns are not drawn to a point at all: the ring is built as the outer
 * arc, a flat end, the inner arc, and a flat end back, with the cut taken at
 * whatever height leaves each horn `hornFrac` of the width across. There is no
 * clipping pass to get wrong and no cusp to truncate afterwards.
 */
function unitMoon(seg = 64, hornFrac = 0.16) {
  const R1 = 1;
  const R2 = 0.66;
  const dy = 0.40;
  // Height of the cut: solve for the y where the horn is hornFrac wide.
  let yc = dy + R2 - 1e-3;
  for (let i = 0; i < 60; i++) {
    const t = dy + R2 - (i / 59) * (dy + R2 + R1);
    if (t > R1) continue;
    const xo = Math.sqrt(Math.max(0, R1 * R1 - t * t));
    const di = t - dy;
    const xi = Math.abs(di) <= R2 ? Math.sqrt(R2 * R2 - di * di) : 0;
    if (xo - xi >= hornFrac * 2 * R1) { yc = t; break; }
  }
  const a1 = Math.acos(Math.max(-1, Math.min(1, yc / R1)));   // outer angle at the cut
  const di = yc - dy;
  const a2 = Math.acos(Math.max(-1, Math.min(1, di / R2)));   // inner angle at the cut
  const out = [];
  // Outer arc, right horn round the bottom to the left horn.
  for (let i = 0; i <= seg; i++) {
    const t = a1 + (i / seg) * (TAU - 2 * a1);
    out.push([Math.sin(t) * R1 * -1, Math.cos(t) * R1]);
  }
  // Inner arc back, left to right.
  for (let i = 0; i <= seg; i++) {
    const t = (TAU - a2) - (i / seg) * (TAU - 2 * a2);
    out.push([Math.sin(t) * R2 * -1, dy + Math.cos(t) * R2]);
  }
  return out;
}

export const CARTOUCHES = {
  none: { id: 'none', name: 'Tiada' },
  kubah: { id: 'kubah', name: 'Kubah', unit: unitDome },
  bulat: { id: 'bulat', name: 'Bulat', unit: unitRound },
  bulan: { id: 'bulan', name: 'Bulan', unit: unitMoon },
  bintang: { id: 'bintang', name: 'Bintang', unit: unitStar },
};

/** The cartouche outline C, centred at (cx, cy) in a 2a x 2b box. */
export function cartoucheRing(shape, cx, cy, a, b) {
  const c = CARTOUCHES[shape];
  if (!c || !c.unit) return null;
  return fitUnit(c.unit(), cx, cy, a, b);
}

/**
 * The test every candidate cell and every raster cell is put through.
 *
 * `frame` is the width of the band kept solid all round the panel; it is the
 * member the whole pattern hangs off and the seed the connectivity flood fill
 * starts from, so it is not decoration and it does not go to zero.
 *
 * Each entry of `excludes` is { ring, clearance } - stay out of the ring and
 * out of a clearance band around it. The cartouche uses it with the band width;
 * a mortise or a tab uses it with the joint land.
 */
export function makeRegion({ outline, frame, excludes = [] }) {
  const bb = ringBBox(outline);
  return {
    outline,
    frame,
    excludes,
    bbox: bb,
    inside(px, py) {
      if (px < bb.x0 || px > bb.x1 || py < bb.y0 || py > bb.y1) return false;
      if (!inRing(px, py, outline)) return false;
      if (distToRing(px, py, outline) < frame) return false;
      for (const ex of excludes) {
        if (inRing(px, py, ex.ring)) return false;
        if (distToRing(px, py, ex.ring) < ex.clearance) return false;
      }
      return true;
    },
  };
}

/**
 * Is this whole cell clear of everything?
 *
 * The ring is sampled along its edges at `step`, not only at its vertices: a
 * long edge can pass straight through a mortise land with both of its ends
 * outside, and a vertex-only test would wave it through. The cell is tested
 * rather than the hole it will become, which is the conservative direction -
 * the hole is the cell shrunk by half a strap, so a clear cell always has a
 * clear hole.
 */
export function ringClearOf(region, ring, step = 1.5) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (!region.inside(a[0], a[1])) return false;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.ceil(L / step);
    for (let s = 1; s < k; s++) {
      const t = s / k;
      if (!region.inside(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
    }
  }
  return true;
}

/**
 * How many straps arrive at a ring's neighbourhood, and how spread out in
 * bearing they are.
 *
 * Sampled ALONG each strap, not at its ends. A parallel-lattice strap runs the
 * whole width of the panel, so both of its endpoints are nowhere near the
 * cartouche and an endpoint-only test reports that nothing reaches the band at
 * all - which is how this was written the first time, and it reported zero for
 * the two lattice patterns while being perfectly happy about the other eight.
 */
export function bearingSpread(ring, segs, band, step = 2) {
  const bb = ringBBox(ring);
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  const hits = [];
  for (const s of segs) {
    const L = Math.hypot(s[2] - s[0], s[3] - s[1]);
    const n = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i <= n; i++) {
      const x = s[0] + ((s[2] - s[0]) * i) / n;
      const y = s[1] + ((s[3] - s[1]) * i) / n;
      if (x < bb.x0 - band || x > bb.x1 + band
        || y < bb.y0 - band || y > bb.y1 + band) continue;
      if (inRing(x, y, ring) || distToRing(x, y, ring) > band) continue;
      hits.push(Math.atan2(y - cy, x - cx));
      break;
    }
  }
  if (hits.length < 2) return { count: hits.length, spreadDeg: 0 };
  hits.sort((a, b) => a - b);
  // The widest bearing with nothing in it. A small number means the straps all
  // arrive from one side, which is exactly the case an assertion should notice.
  let worst = hits[0] + TAU - hits[hits.length - 1];
  for (let i = 1; i < hits.length; i++) worst = Math.max(worst, hits[i] - hits[i - 1]);
  return { count: hits.length, spreadDeg: (TAU - worst) * (180 / Math.PI) };
}
