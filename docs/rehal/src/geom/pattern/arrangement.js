// From a heap of segments to the cells they enclose.
//
// The straps are drawn as lines. What gets cut out of the panel is the spaces
// BETWEEN them, so the engine has to be able to name those spaces, and that
// means building the planar subdivision the segments make and walking its
// bounded faces.
//
// Three things have to be right or the walk produces nonsense:
//
//  1. Endpoints must be snapped before anything else. In an even-sided tile,
//     rays from opposite edges arrive at the centre three or more at a time,
//     and floating point turns one meeting point into three nearly-coincident
//     ones with zero-area slivers between them. A 1/1000 mm grid is far finer
//     than any kerf and far coarser than the error.
//  2. Segments must be split wherever they cross. The engine mostly produces
//     crossings at ray endpoints already, but a clipped tile or an irregular
//     face can produce a genuine mid-segment crossing, and an un-split crossing
//     merges two cells into one that is not a cell.
//  3. The face walk has to keep the interior on the same side throughout.
//     next(u->v) is the outgoing edge at v that comes next CLOCKWISE from
//     v->u, which traverses every face with its interior on the left: bounded
//     faces come back counter-clockwise, and the one unbounded face comes back
//     clockwise. That sign is how they are told apart - not by area size, which
//     would pick the wrong one on a patch bigger than the panel.
//
// Millimetres. Segments in are flat [x0,y0,x1,y1]; faces out are rings of
// [x, y] pairs, counter-clockwise.

const SNAP = 1000; // 1/1000 mm
const key = (x, y) => `${Math.round(x * SNAP)},${Math.round(y * SNAP)}`;
const snap = (v) => Math.round(v * SNAP) / SNAP;

/**
 * Split every segment at every crossing with every other segment.
 *
 * Bucketed on a uniform grid so this stays roughly linear: a panel carries a
 * few thousand straps and the all-pairs version of this is the slowest thing in
 * the tool by an order of magnitude.
 */
export function splitSegments(segs, cell) {
  const n = segs.length;
  if (!n) return [];
  let span = 0;
  for (const s of segs) {
    span = Math.max(span, Math.hypot(s[2] - s[0], s[3] - s[1]));
  }
  const g = Math.max(cell || 0, span, 1e-6);
  const buckets = new Map();
  const put = (i, j, k) => {
    const b = `${i},${j}`;
    let a = buckets.get(b);
    if (!a) { a = []; buckets.set(b, a); }
    a.push(k);
  };
  const cellsOf = (s) => {
    const i0 = Math.floor(Math.min(s[0], s[2]) / g);
    const i1 = Math.floor(Math.max(s[0], s[2]) / g);
    const j0 = Math.floor(Math.min(s[1], s[3]) / g);
    const j1 = Math.floor(Math.max(s[1], s[3]) / g);
    return [i0, i1, j0, j1];
  };
  segs.forEach((s, k) => {
    const [i0, i1, j0, j1] = cellsOf(s);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) put(i, j, k);
  });

  const cuts = segs.map(() => new Set([0, 1]));
  const seen = new Set();
  for (const list of buckets.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const p = list[a];
        const q = list[b];
        const pk = p < q ? p * n + q : q * n + p;
        if (seen.has(pk)) continue;
        seen.add(pk);
        const s = segs[p];
        const t = segs[q];
        const dx1 = s[2] - s[0]; const dy1 = s[3] - s[1];
        const dx2 = t[2] - t[0]; const dy2 = t[3] - t[1];
        const den = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(den) < 1e-12) continue;
        const wx = t[0] - s[0]; const wy = t[1] - s[1];
        const u = (wx * dy2 - wy * dx2) / den;
        const v = (wx * dy1 - wy * dx1) / den;
        if (u < 1e-9 || u > 1 - 1e-9 || v < 1e-9 || v > 1 - 1e-9) continue;
        cuts[p].add(u);
        cuts[q].add(v);
      }
    }
  }

  // T-junctions, which the crossing test above cannot see. A strap that STOPS
  // part way along another one meets it at a parameter of exactly 1 on its own
  // side, and the test excludes that as an endpoint touch. Left unsplit, the
  // segment being landed on is one edge rather than two, the node has degree
  // two instead of three, and the two cells either side of the arriving strap
  // come back as a single cell - which the connectivity check happily passes,
  // because a bigger hole is still a hole.
  for (const list of buckets.values()) {
    for (const q of list) {
      const s = segs[q];
      const dx = s[2] - s[0];
      const dy = s[3] - s[1];
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-18) continue;
      for (const p of list) {
        if (p === q) continue;
        for (const e of [[segs[p][0], segs[p][1]], [segs[p][2], segs[p][3]]]) {
          const t = ((e[0] - s[0]) * dx + (e[1] - s[1]) * dy) / l2;
          if (t < 1e-9 || t > 1 - 1e-9) continue;
          const px = s[0] + dx * t;
          const py = s[1] + dy * t;
          if (Math.hypot(e[0] - px, e[1] - py) > 0.5 / SNAP) continue;
          cuts[q].add(t);
        }
      }
    }
  }

  const out = [];
  segs.forEach((s, k) => {
    const ts = [...cuts[k]].sort((a, b) => a - b);
    for (let i = 0; i < ts.length - 1; i++) {
      const a = ts[i]; const b = ts[i + 1];
      const ax = s[0] + (s[2] - s[0]) * a;
      const ay = s[1] + (s[3] - s[1]) * a;
      const bx = s[0] + (s[2] - s[0]) * b;
      const by = s[1] + (s[3] - s[1]) * b;
      if (Math.hypot(bx - ax, by - ay) < 1 / SNAP) continue;
      out.push([ax, ay, bx, by]);
    }
  });
  return out;
}

/**
 * The bounded faces of the arrangement, counter-clockwise.
 *
 * Faces smaller than `minArea` are dropped: after snapping, a triple crossing
 * can still leave a sliver of a few thousandths of a square millimetre, and it
 * is not a cell, it is the snap.
 */
/**
 * Throw away every dead-end run of segments.
 *
 * A strap that stops in the middle of nowhere - which happens at the ragged
 * edge of the generated patch, and inside an irregular tile where a ray reached
 * the boundary without meeting a partner - is not part of any cell, but the
 * face walk cannot ignore it: it goes out along the stub and back, and the cell
 * comes back as a ring with a zero-width slit in it, a zero-degree corner and
 * an inscribed circle that is smaller than it should be. Then the cell filter
 * rejects a perfectly good cell because of a whisker beside it.
 *
 * Cutting them is the right answer anyway. A strap thinner than a cell is going
 * to be a burnt whisker on the bed, and dropping it here means the space it
 * jutted into is simply part of the hole.
 */
function pruneStubs(segs) {
  let cur = segs;
  for (let pass = 0; pass < 24; pass++) {
    const deg = new Map();
    const bump = (k) => deg.set(k, (deg.get(k) || 0) + 1);
    for (const s of cur) { bump(key(s[0], s[1])); bump(key(s[2], s[3])); }
    const kept = cur.filter((s) => deg.get(key(s[0], s[1])) > 1 && deg.get(key(s[2], s[3])) > 1);
    if (kept.length === cur.length) return kept;
    cur = kept;
  }
  return cur;
}

export function planarFaces(segsIn, opts = {}) {
  const minArea = opts.minArea ?? 1e-4;
  const segs = opts.keepStubs ? segsIn : pruneStubs(segsIn);
  const nodes = new Map(); // key -> { p, out: [] }
  const nodeOf = (x, y) => {
    const k = key(x, y);
    let nd = nodes.get(k);
    if (!nd) { nd = { p: [snap(x), snap(y)], out: [] }; nodes.set(k, nd); }
    return nd;
  };

  const half = []; // { from, to, ang, next }
  const seenEdge = new Set();
  for (const s of segs) {
    const ka = key(s[0], s[1]);
    const kb = key(s[2], s[3]);
    if (ka === kb) continue;
    const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (seenEdge.has(ek)) continue;
    seenEdge.add(ek);
    const a = nodeOf(s[0], s[1]);
    const b = nodeOf(s[2], s[3]);
    const i = half.length;
    half.push({ from: a, to: b, ang: Math.atan2(b.p[1] - a.p[1], b.p[0] - a.p[0]), twin: i + 1 });
    half.push({ from: b, to: a, ang: Math.atan2(a.p[1] - b.p[1], a.p[0] - b.p[0]), twin: i });
    a.out.push(i);
    b.out.push(i + 1);
  }
  if (!half.length) return [];

  for (const nd of nodes.values()) {
    nd.out.sort((i, j) => half[i].ang - half[j].ang);
    nd.rank = new Map();
    nd.out.forEach((i, r) => nd.rank.set(i, r));
  }

  // next(e) = the outgoing edge at e.to that comes next going CLOCKWISE from
  // the twin of e. That keeps the face on the left all the way round.
  const next = new Array(half.length);
  for (let i = 0; i < half.length; i++) {
    const nd = half[i].to;
    const t = half[i].twin;
    const r = nd.rank.get(t);
    next[i] = nd.out[(r - 1 + nd.out.length) % nd.out.length];
  }

  const used = new Uint8Array(half.length);
  const faces = [];
  for (let i = 0; i < half.length; i++) {
    if (used[i]) continue;
    const ring = [];
    let e = i;
    let guard = 0;
    while (!used[e] && guard++ < half.length + 4) {
      used[e] = 1;
      ring.push(half[e].from.p);
      e = next[e];
    }
    if (ring.length < 3) continue;
    let a = 0;
    for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
      a += ring[j][0] * ring[k][1] - ring[k][0] * ring[j][1];
    }
    a /= 2;
    if (a > minArea) faces.push(ring);
  }
  return faces;
}

/** Signed area of a ring of pairs. */
export function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

export function ringBBox(ring) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Distance from a point to a ring, measured to its EDGES. */
export function distToRing(px, py, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0]; const ay = ring[j][1];
    const dx = ring[i][0] - ax; const dy = ring[i][1] - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

export function inRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py)
      && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The largest circle that fits inside a ring, as a radius.
 *
 * A coarse grid over the bounding box, then three rounds of halving around the
 * best point so far. Not exact, and it does not need to be: it decides whether
 * a cell is big enough to be worth cutting, and the answer only has to be
 * within a fraction of a millimetre of the truth to make that call. It is
 * deliberately NOT the centroid distance - a bowtie cell's centroid is outside
 * the cell.
 */
export function inradius(ring) {
  const b = ringBBox(ring);
  if (!(b.w > 0) || !(b.h > 0)) return 0;
  let step = Math.min(b.w, b.h) / 10;
  let bx = (b.x0 + b.x1) / 2;
  let by = (b.y0 + b.y1) / 2;
  let best = -1;
  for (let y = b.y0 + step / 2; y < b.y1; y += step) {
    for (let x = b.x0 + step / 2; x < b.x1; x += step) {
      if (!inRing(x, y, ring)) continue;
      const d = distToRing(x, y, ring);
      if (d > best) { best = d; bx = x; by = y; }
    }
  }
  if (best < 0) return 0;
  for (let round = 0; round < 4; round++) {
    step /= 2;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = bx + dx * step;
        const y = by + dy * step;
        if (!inRing(x, y, ring)) continue;
        const d = distToRing(x, y, ring);
        if (d > best) { best = d; bx = x; by = y; }
      }
    }
  }
  return best;
}

/** The sharpest corner of a ring, in degrees. */
export function minTipAngle(ring) {
  const n = ring.length;
  let worst = 180;
  for (let i = 0; i < n; i++) {
    const a = ring[(i + n - 1) % n];
    const b = ring[i];
    const c = ring[(i + 1) % n];
    let t = Math.atan2(a[1] - b[1], a[0] - b[0]) - Math.atan2(c[1] - b[1], c[0] - b[0]);
    while (t < 0) t += Math.PI * 2;
    const deg = (t * 180) / Math.PI;
    if (deg < worst) worst = deg;
  }
  return worst;
}

export { snap };
