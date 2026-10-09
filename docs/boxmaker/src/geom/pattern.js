// Islamic geometric patterns, cut through (or engraved on) a box face.
//
// HANKIN'S METHOD ("polygons in contact"), as Kaplan describes it: start from
// a tiling of regular polygons. From the midpoint of every tile edge two rays
// leave at a "contact angle" theta to the edge, one leaning towards each end.
// The ray leaning towards vertex V meets the ray from the neighbouring edge
// that also leans towards V - and because the polygon is regular, they meet
// exactly on the line from the tile centre to V. Erase the tiling and the
// lines left over are the star pattern. At each edge midpoint the ray of this
// tile and the ray of the tile next door continue one another as a single
// straight line crossing over - the interlace of a girih pattern.
//
// Those lines split the plane into two kinds of region, and both can be
// written down directly, with no general line-arrangement solver:
//   * STAR   - one per tile: [M0, P1, M1, P2, ...], M the edge midpoints and
//              P the meeting point at each vertex.
//   * VERTEX - one per tiling vertex: the P of every tile meeting there,
//              alternating with the M of the edges they share.
//
// For the laser the lines are WOOD (struts) and the regions are HOLES. Each
// region shrinks inwards by half a strut, so two neighbouring holes are always
// exactly one strut apart. Holes are then clipped to the pattern object's
// rectangle, those too small to cut cleanly are dropped, and - when a panel is
// given - so are those too close to a joint, a mortise or the panel edge.
//
// This module is PURE and self-contained: no DOM, no imports. It is tested
// directly in node (scripts/test-boxmaker-pattern.mjs).

const DEG = Math.PI / 180;

// ---- tilings ---------------------------------------------------------------
// Each tiling: two lattice vectors and the prototiles in one lattice cell.
// A prototile is { n, at: [x, y], delta }, `delta` being the direction of one
// edge normal in degrees - a regular n-gon has its edge normals at
// delta + k*360/n. All in units of "edge length = 1", scaled later.

const apo = (n) => 1 / (2 * Math.tan(Math.PI / n)); // centre to edge, for edge 1

const TILINGS = {
  // Squares: 4-point stars and crosses.
  '4.4.4.4': () => ({ a1: [1, 0], a2: [0, 1], protos: [{ n: 4, at: [0, 0], delta: 0 }] }),
  // Hexagons: 6-point stars.
  '6.6.6': () => {
    const d = 2 * apo(6);
    return {
      a1: [d * Math.cos(30 * DEG), d * Math.sin(30 * DEG)],
      a2: [0, d],
      protos: [{ n: 6, at: [0, 0], delta: 30 }],
    };
  },
  // Octagons + squares (4.8.8): the 8-point star, the Moroccan "khatim".
  '4.8.8': () => {
    const p = 1 + Math.SQRT2;
    return {
      a1: [p, 0], a2: [0, p],
      protos: [{ n: 8, at: [0, 0], delta: 0 }, { n: 4, at: [p / 2, p / 2], delta: 45 }],
    };
  },
  // Dodecagons + hexagons + squares (4.6.12): 12-point rosettes.
  '4.6.12': () => {
    const a12 = apo(12);
    const D = 2 * a12 + 1;
    const pol = (r, deg) => [r * Math.cos(deg * DEG), r * Math.sin(deg * DEG)];
    const sq = a12 + 0.5;
    const hx = a12 + apo(6);
    return {
      a1: [D, 0], a2: [D / 2, (D * Math.sqrt(3)) / 2],
      protos: [
        { n: 12, at: [0, 0], delta: 0 },
        { n: 4, at: pol(sq, 0), delta: 0 },
        { n: 4, at: pol(sq, 60), delta: 60 },
        { n: 4, at: pol(sq, 120), delta: 120 },
        { n: 6, at: pol(hx, 30), delta: 30 },
        { n: 6, at: pol(hx, 90), delta: 30 },
      ],
    };
  },
  // Dodecagons + triangles (3.12.12): denser 12-point stars.
  '3.12.12': () => {
    const a12 = apo(12);
    const D = 2 * a12;
    const r3 = D / Math.sqrt(3);
    const pol = (r, deg) => [r * Math.cos(deg * DEG), r * Math.sin(deg * DEG)];
    return {
      a1: [D, 0], a2: [D / 2, (D * Math.sqrt(3)) / 2],
      protos: [
        { n: 12, at: [0, 0], delta: 0 },
        { n: 3, at: pol(r3, 30), delta: 210 },
        { n: 3, at: pol(r3, 90), delta: 270 },
      ],
    };
  },
};

/**
 * The library. `angle` is the default contact angle in degrees - the valid
 * range is worked out by angleRange(), not written by hand. `across`: how many
 * repeats of the motif span the window when the object is first made. `lace`:
 * the smallest motif, in struts, that still reads as lace - below it the struts
 * swallow the small tiles and a wall turns into scattered pinholes. Ids are
 * stored in saved designs, so they never change.
 */
export const PATTERNS = [
  { id: 'rozet12', name: 'Rosette 12', note: '4.6.12', tiling: '4.6.12', angle: 60, across: 3, lace: 16 },
  { id: 'bintang12', name: 'Star 12', note: '3.12.12', tiling: '3.12.12', angle: 60, across: 3, lace: 13 },
  { id: 'khatim8', name: 'Star 8 (Khatim)', note: '4.8.8', tiling: '4.8.8', angle: 67.5, across: 3.5, lace: 12 },
  { id: 'bintang6', name: 'Star 6', note: '6.6.6', tiling: '6.6.6', angle: 60, across: 4.5, lace: 9 },
  { id: 'salib4', name: 'Cross & Star 4', note: '4.4.4.4', tiling: '4.4.4.4', angle: 60, across: 5, lace: 7 },
];

export const patternById = (id) => PATTERNS.find((q) => q.id === id) || PATTERNS[0];

// ---- geometry ----------------------------------------------------------------

export function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

const perimeter = (pts) => {
  let d = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    d += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return d;
};

function dedupe(pts, eps = 1e-9) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push(p);
  }
  while (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps) out.pop(); else break;
  }
  return out;
}

/** Two closed segments cross in their interiors (touching at an end does not count). */
function segsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  const e = 1e-12;
  return ((o1 > e && o2 < -e) || (o1 < -e && o2 > e)) && ((o3 > e && o4 < -e) || (o3 < -e && o4 > e));
}

export function isSimple(ring) {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segsCross(a, b, ring[j], ring[(j + 1) % n])) return false;
    }
  }
  return true;
}

export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a segment. */
function ptSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segSeg(a, b, c, d) {
  if (segsCross(a, b, c, d)) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}

/** Closest distance between two rings' boundaries (0 if they cross). */
export function ringDistance(A, B) {
  let m = Infinity;
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const d = segSeg(a, b, B[j], B[(j + 1) % B.length]);
      if (d < m) m = d;
      if (m === 0) return 0;
    }
  }
  return m;
}

const bboxOf = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
};

/** Closest distance from a point to a ring's boundary. */
function ptRing(p, ring) {
  let m = Infinity;
  for (let i = 0; i < ring.length; i++) m = Math.min(m, ptSeg(p, ring[i], ring[(i + 1) % ring.length]));
  return m;
}

/**
 * Shrink a CCW ring inwards by d: every edge moves d inwards and consecutive
 * edges are intersected again. No mitre limit - when shrinking, a sharp convex
 * corner really does retreat far along its bisector, and that is the right
 * shape.
 *
 * A short edge can "flip" (vanish before the offset reaches d); it is dropped
 * and its neighbours intersected directly, repeating until stable. The result
 * is then VERIFIED: simple, and every vertex at least d from the original
 * boundary. Failure is null (the region is too narrow for this strut), so the
 * caller can drop it with confidence instead of cutting a hole that eats into
 * a strut.
 */
export function insetRing(pts, d) {
  const src = dedupe(pts);
  if (src.length < 3) return null;
  let lines = [];
  for (let i = 0; i < src.length; i++) {
    const a = src[i], b = src[(i + 1) % src.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-12) continue;
    const ux = dx / L, uy = dy / L;
    // The inward normal of a CCW ring is to the left of the edge: (-uy, ux).
    lines.push({ px: a[0] - uy * d, py: a[1] + ux * d, ux, uy });
  }
  for (let guard = 0; guard < src.length + 2; guard++) {
    const n = lines.length;
    if (n < 3) return null;
    const out = [];
    for (let i = 0; i < n; i++) {
      const A = lines[(i - 1 + n) % n], B = lines[i];
      const cr = A.ux * B.uy - A.uy * B.ux;
      if (Math.abs(cr) < 1e-12) { out.push([B.px, B.py]); continue; }
      const t = ((B.px - A.px) * B.uy - (B.py - A.py) * B.ux) / cr;
      out.push([A.px + A.ux * t, A.py + A.uy * t]);
    }
    const flipped = [];
    for (let i = 0; i < n; i++) {
      const a = out[i], b = out[(i + 1) % n];
      if ((b[0] - a[0]) * lines[i].ux + (b[1] - a[1]) * lines[i].uy <= 1e-9) flipped.push(i);
    }
    if (!flipped.length) {
      const ring = dedupe(out);
      if (ring.length < 3 || !(ringArea(ring) > 0) || !isSimple(ring)) return null;
      for (const q of ring) if (ptRing(q, src) < d * (1 - 1e-6)) return null;
      return ring;
    }
    if (flipped.length >= n - 2) return null;
    const drop = new Set(flipped);
    lines = lines.filter((_, i) => !drop.has(i));
  }
  return null;
}

/**
 * Clip a simple CCW ring to the half-plane nx*x + ny*y >= c. A concave ring
 * can fall apart into several pieces - each comes back as a ring of its own,
 * NOT one ring joined by zero-width bridges (which is what Sutherland-Hodgman
 * gives, and which the laser would cut twice).
 *
 * The chains inside are collected; their crossing points are sorted along the
 * clip line and paired off in order (out -> in), because for a simple ring the
 * stretch of line between such a pair bounds the inside region.
 */
function clipHalfPlane(ring, nx, ny, c) {
  const s = ring.map(([x, y]) => {
    const v = nx * x + ny * y - c;
    return Math.abs(v) < 1e-9 ? 1e-9 : v; // exactly on the line: count as inside
  });
  if (s.every((v) => v > 0)) return [ring];
  if (s.every((v) => v < 0)) return [];
  const n = ring.length;
  // Start at an outside vertex so every chain begins with an "in" crossing.
  let start = s.findIndex((v) => v < 0);
  const chains = [];
  let cur = null;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const j = (i + 1) % n;
    const a = ring[i], b = ring[j];
    const sa = s[i], sb = s[j];
    if (sa > 0 && cur) cur.pts.push(a);
    if ((sa > 0) !== (sb > 0)) {
      const t = sa / (sa - sb);
      const x = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (sb > 0) { cur = { pts: [x] }; } else { cur.pts.push(x); chains.push(cur); cur = null; }
    }
  }
  // Direction along the clip line.
  const tx = -ny, ty = nx;
  const along = (p) => p[0] * tx + p[1] * ty;
  const ends = [];
  chains.forEach((ch, idx) => {
    ends.push({ p: ch.pts[0], kind: 'in', idx });
    ends.push({ p: ch.pts[ch.pts.length - 1], kind: 'out', idx });
  });
  ends.sort((u, v) => along(u.p) - along(v.p));
  const nextOf = new Map(); // chain index -> the chain that follows its exit
  for (let k = 0; k + 1 < ends.length; k += 2) {
    const u = ends[k], v = ends[k + 1];
    const out = u.kind === 'out' ? u : v;
    const inn = u.kind === 'out' ? v : u;
    if (out.kind !== 'out' || inn.kind !== 'in') return []; // broken topology: drop it, never cut it wrong
    nextOf.set(out.idx, inn.idx);
  }
  const used = new Set();
  const result = [];
  for (let i = 0; i < chains.length; i++) {
    if (used.has(i)) continue;
    const pts = [];
    let k = i;
    for (let guard = 0; guard <= chains.length && !used.has(k); guard++) {
      used.add(k);
      pts.push(...chains[k].pts);
      k = nextOf.get(k);
      if (k === undefined) break;
    }
    const r = dedupe(pts);
    if (r.length >= 3 && ringArea(r) > 1e-9) result.push(r);
  }
  return result;
}

function clipToRect(ring, x0, y0, x1, y1) {
  let parts = [ring];
  for (const [nx, ny, c] of [[1, 0, x0], [-1, 0, -x1], [0, 1, y0], [0, -1, -y1]]) {
    const next = [];
    for (const r of parts) next.push(...clipHalfPlane(r, nx, ny, c));
    parts = next;
    if (!parts.length) break;
  }
  return parts;
}

// ---- Hankin ----------------------------------------------------------------

/** Regular CCW polygon: centre c, n edges of length a, one edge normal at delta degrees. */
function regularPolygon(c, n, a, delta) {
  const R = a / (2 * Math.sin(Math.PI / n));
  const out = [];
  for (let k = 0; k < n; k++) {
    const ang = (delta + 180 / n + (k * 360) / n) * DEG;
    out.push([c[0] + R * Math.cos(ang), c[1] + R * Math.sin(ang)]);
  }
  return out;
}

/**
 * Hankin meeting point for every vertex of a regular polygon: the ray from the
 * midpoint of edge k, leaning theta inwards towards vertex k+1, intersected
 * with the line centre -> vertex k+1. Null if any point falls outside
 * (centre, vertex) - the angle does not work for this polygon.
 */
function hankinPoints(c, verts, theta) {
  const n = verts.length;
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = verts[k], b = verts[(k + 1) % n];
    const M = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ex = b[0] - M[0], ey = b[1] - M[1];
    const L = Math.hypot(ex, ey);
    const ux = ex / L, uy = ey / L;
    // Turn CCW by theta: inwards, for a CCW polygon.
    const dx = ux * Math.cos(theta) - uy * Math.sin(theta);
    const dy = ux * Math.sin(theta) + uy * Math.cos(theta);
    const vx = b[0] - c[0], vy = b[1] - c[1];
    const R = Math.hypot(vx, vy);
    const wx = vx / R, wy = vy / R;
    // M + s*d = c + u*w
    const cr = dx * wy - dy * wx;
    if (Math.abs(cr) < 1e-12) return null;
    const qx = c[0] - M[0], qy = c[1] - M[1];
    const s = (qx * wy - qy * wx) / cr;
    const u = (qx * dy - qy * dx) / cr;
    if (!(s > 1e-9) || !(u > R * 0.02) || !(u < R * 0.98)) return null;
    pts.push({ M, P: [c[0] + u * wx, c[1] + u * wy], V: b });
  }
  return pts;
}

/**
 * Every pattern region (before shrinking) covering the rectangle
 * [x0..x1] x [y0..y1], with a lattice origin - a main tile centre - at (cx, cy).
 */
export function patternFaces(tilingId, cell, theta, cx, cy, x0, y0, x1, y1) {
  const T = TILINGS[tilingId]();
  const a1 = [T.a1[0] * cell, T.a1[1] * cell];
  const a2 = [T.a2[0] * cell, T.a2[1] * cell];
  // Lattice index range covering the area, two cells over so that the vertex
  // regions along the edge are complete.
  const det = a1[0] * a2[1] - a1[1] * a2[0];
  const toLattice = (x, y) => {
    const px = x - cx, py = y - cy;
    return [(px * a2[1] - py * a2[0]) / det, (a1[0] * py - a1[1] * px) / det];
  };
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => toLattice(x, y));
  const iMin = Math.floor(Math.min(...corners.map((q) => q[0]))) - 2;
  const iMax = Math.ceil(Math.max(...corners.map((q) => q[0]))) + 2;
  const jMin = Math.floor(Math.min(...corners.map((q) => q[1]))) - 2;
  const jMax = Math.ceil(Math.max(...corners.map((q) => q[1]))) + 2;
  if ((iMax - iMin) * (jMax - jMin) > 40000) return null; // far too many tiles: motif too small

  const faces = [];
  const byVertex = new Map();
  const vkey = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const ox = cx + i * a1[0] + j * a2[0];
      const oy = cy + i * a1[1] + j * a2[1];
      for (const pr of T.protos) {
        const c = [ox + pr.at[0] * cell, oy + pr.at[1] * cell];
        const verts = regularPolygon(c, pr.n, cell, pr.delta);
        const hp = hankinPoints(c, verts, theta);
        if (!hp) return null;
        // The tile's star: M0, P1, M1, P2, ... (P for the vertex between edges k and k+1).
        const star = [];
        for (let k = 0; k < hp.length; k++) star.push(hp[k].M, hp[k].P);
        // Too steep an angle: rays from opposite edges cross before meeting
        // their partners, and the star overlaps itself.
        if (i === iMin && j === jMin && !isSimple(star)) return null;
        faces.push(star);
        // Contribution to the vertex region: (M of the edge before, P, M of the edge after).
        for (let k = 0; k < hp.length; k++) {
          const key = vkey(hp[k].V);
          if (!byVertex.has(key)) byVertex.set(key, { V: hp[k].V, parts: [] });
          byVertex.get(key).parts.push({ P: hp[k].P, M1: hp[k].M, M2: hp[(k + 1) % hp.length].M });
        }
      }
    }
  }
  // Vertex regions: order the contributions by the angle of P around V.
  for (const { V, parts } of byVertex.values()) {
    const ang = (p) => Math.atan2(p[1] - V[1], p[0] - V[0]);
    // A vertex on the rim of the tiled area is incomplete - the tiles around
    // it must close the full turn. Check by chaining the Ms: each tile's M2
    // must be the next tile's M1.
    parts.sort((p, q) => ang(p.P) - ang(q.P));
    const close = (u, v) => Math.abs(u[0] - v[0]) < 1e-6 && Math.abs(u[1] - v[1]) < 1e-6;
    // One chaining direction for every pair (all tiles are CCW): M2 = next
    // M1 throughout, OR the reverse throughout - never mixed. Mixing them is
    // what let a half-surrounded rim vertex pass as complete.
    const chain = (fwd) => {
      const ring = [];
      for (let k = 0; k < parts.length; k++) {
        const a = parts[k], b = parts[(k + 1) % parts.length];
        const [u, v] = fwd ? [a.M2, b.M1] : [a.M1, b.M2];
        if (!close(u, v)) return null;
        ring.push(a.P, u);
      }
      return ring;
    };
    const ring = parts.length >= 2 ? chain(true) || chain(false) : null;
    if (ring && ring.length >= 4) faces.push(ring);
  }
  return faces.map((f) => (ringArea(f) < 0 ? f.slice().reverse() : f));
}

// The range offered to the user. The geometry holds from about 5 to 89
// degrees, but below ~25 the lines run nearly along the tile edges (the
// pattern turns into a coarse grid) and above ~80 the star points become
// needles too thin to cut.
const UI_MIN = 25, UI_MAX = 80;
const rangeCache = new Map();
/**
 * Contact angles (degrees) that give a valid pattern: every meeting point
 * inside its tile, every star and every vertex region simple. Scanned once,
 * cached, and clamped to the UI range.
 */
export function angleRange(id) {
  const def = patternById(id);
  if (rangeCache.has(def.id)) return rangeCache.get(def.id);
  let lo = null, hi = null;
  for (let a = UI_MIN; a <= UI_MAX; a++) {
    const f = patternFaces(def.tiling, 1, a * DEG, 0, 0, -0.5, -0.5, 0.5, 0.5);
    const ok = f && f.length && f.every((r) => isSimple(r) && ringArea(r) > 1e-9);
    if (ok && lo === null) lo = a;
    if (ok) hi = a;
    else if (lo !== null) break;
  }
  const r = lo === null ? [def.angle, def.angle] : [lo, hi];
  rangeCache.set(def.id, r);
  return r;
}

/** Repeat distance of a tiling in edge lengths; motif (mm) / period = tile edge (mm). */
export const tilingPeriod = (id) => Math.hypot(...TILINGS[patternById(id).tiling]().a1);
export const defaultMotif = (id, width, strut = 3) => {
  const def = patternById(id);
  return Math.max(8, Math.round(width / def.across), Math.round(strut * def.lace));
};

/**
 * Pattern holes in the window rect = { x, y, w, h }.
 *
 * opts:
 *   pattern  - id from PATTERNS
 *   motif    - repeat distance of the pattern, mm (null = from `across`)
 *   angle    - contact angle, degrees (null = the pattern's default)
 *   strut    - wood left between holes AFTER cutting, mm
 *   kerf     - laser kerf, mm; holes shrink by another half kerf so the
 *              burn does not thin the struts
 *   minHole  - holes whose mean width (2 x area / perimeter) is under this
 *              are dropped, mm
 *   avoid    - rings the holes must stay OUTSIDE and clear of (mortises,
 *              hinge holes, a logo or text on the same face)
 *   bound    - ring the holes must stay INSIDE and clear of (the panel's
 *              finger-jointed outline)
 *   avoidGap - minimum distance from `avoid` and `bound`, mm (default strut)
 *
 * Returns { rings, stats }. Rings are CCW, simple, in rect coordinates.
 */
export function patternHoles(rect, opts = {}) {
  const def = patternById(opts.pattern);
  const strut = Math.max(0.3, Number(opts.strut) || 3);
  const kerf = Math.max(0, Number(opts.kerf) || 0);
  const minHole = Math.max(0.5, Number(opts.minHole) || 1.5);
  const [lo, hi] = angleRange(def.id);
  const angle = Math.min(hi, Math.max(lo, Number(opts.angle) || def.angle));
  const motif = Math.max(4, Number(opts.motif) || defaultMotif(def.id, rect.w, strut));
  const cell = motif / tilingPeriod(def.id);
  const stats = { holes: 0, tooSmall: 0, nearJoint: 0, angle, motif, strut, pattern: def.id };

  const inset = (strut + kerf) / 2;
  const wx0 = rect.x + strut / 2, wy0 = rect.y + strut / 2;
  const wx1 = rect.x + rect.w - strut / 2, wy1 = rect.y + rect.h - strut / 2;
  if (!(wx1 - wx0 > minHole) || !(wy1 - wy0 > minHole)) return { rings: [], stats };

  const faces = patternFaces(def.tiling, cell, angle * DEG,
    rect.x + rect.w / 2, rect.y + rect.h / 2, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  if (!faces) return { rings: [], stats: { ...stats, invalid: true } };

  // Obstacles as segments with bounding boxes, so each hole is only tested
  // against the segments near it - a finger-jointed outline has hundreds.
  const gap = opts.avoidGap != null ? Number(opts.avoidGap) : strut;
  const avoid = (opts.avoid || []).filter((r) => r && r.length > 2);
  const bound = opts.bound && opts.bound.length > 2 ? opts.bound : null;
  const segs = [];
  for (const r of bound ? [...avoid, bound] : avoid) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      segs.push({ a, b, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) });
    }
  }

  const rings = [];
  for (const face of faces) {
    const fb = bboxOf(face);
    if (fb.x1 < wx0 || fb.x0 > wx1 || fb.y1 < wy0 || fb.y0 > wy1) continue;
    const shrunk = insetRing(face, inset);
    if (!shrunk) { stats.tooSmall++; continue; }
    // A star cut by the frame can fall into several pieces, and the wood
    // between two of them is the sliced-off tip of a notch - it can be thinner
    // than a strut. Take the biggest piece first; the others only when they
    // are far enough from the ones already taken.
    const pieces = clipToRect(shrunk, wx0, wy0, wx1, wy1).sort((p, q) => ringArea(q) - ringArea(p));
    const kept = [];
    for (const piece of pieces) {
      if (kept.some((k) => ringDistance(k, piece) < strut - 1e-9)) { stats.tooSmall++; continue; }
      const area = ringArea(piece);
      if ((2 * area) / perimeter(piece) < minHole / 2 || area < minHole * minHole || !isSimple(piece)) {
        stats.tooSmall++;
        continue;
      }
      const pb = bboxOf(piece);
      let bad = false;
      for (const sg of segs) {
        if (sg.x1 < pb.x0 - gap || sg.x0 > pb.x1 + gap || sg.y1 < pb.y0 - gap || sg.y0 > pb.y1 + gap) continue;
        for (let i = 0; i < piece.length && !bad; i++) {
          if (segSeg(piece[i], piece[(i + 1) % piece.length], sg.a, sg.b) < gap - 1e-9) bad = true;
        }
        if (bad) break;
      }
      // No segment nearby does not mean clear: an obstacle can sit wholly
      // inside a hole (a small mortise), a hole wholly inside an obstacle (a
      // big logo plaque), or a hole outside the outline.
      for (let k = 0; k < avoid.length && !bad; k++) {
        if (pointInRing(avoid[k][0], piece) || pointInRing(piece[0], avoid[k])) bad = true;
      }
      if (!bad && bound && !pointInRing(piece[0], bound)) bad = true;
      if (bad) { stats.nearJoint++; continue; }
      kept.push(piece);
      rings.push(piece);
    }
  }
  stats.holes = rings.length;
  return { rings, stats };
}

/**
 * Default safe window for a panel (panel coordinates, y-up): the outline's
 * bounding box shrunk by `margin`. When a row of holes spans much of the width
 * near the bottom (floor mortises) or the top (lid or shelf mortises), the
 * window is raised or lowered clear of it. Other holes - divider mortises,
 * hinge holes - are avoided hole by hole through `avoid` in patternHoles, so
 * the window need not give up area for them.
 */
export function safeRect(panel, margin) {
  const b = bboxOf(panel.outlineNominal || panel.outline);
  const W = b.x1 - b.x0, H = b.y1 - b.y0;
  let x0 = b.x0 + margin, x1 = b.x1 - margin, y0 = b.y0 + margin, y1 = b.y1 - margin;
  const holes = (panel.holesNominal || panel.holes || []).map(bboxOf);
  const band = (sel) => {
    const hs = holes.filter(sel);
    const cover = hs.reduce((s, h) => s + (h.x1 - h.x0), 0);
    return cover > W * 0.3 ? hs : [];
  };
  const low = band((h) => h.y1 < b.y0 + H * 0.35);
  const high = band((h) => h.y0 > b.y1 - H * 0.35);
  if (low.length) y0 = Math.max(y0, Math.max(...low.map((h) => h.y1)) + margin);
  if (high.length) y1 = Math.min(y1, Math.min(...high.map((h) => h.y0)) - margin);
  if (x1 - x0 < 5 || y1 - y0 < 5) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
