// Refitting somebody else's cut file to the material you actually have.
//
// Two operations that look similar and are not:
//
//   scale       every coordinate multiplied. Uniform, reversible, and it moves
//               the slots with everything else - which is exactly the problem.
//   thickness   only the dimensions that exist BECAUSE the board has a
//               thickness. A slot is 3 mm wide because the board is 3 mm thick;
//               make the panel bigger and the slot must not follow.
//
// Nothing in the file says which is which. There is no metadata in an SVG that
// marks a rectangle as "a slot" - all we get is a bag of closed polygons. So
// this file infers, and the whole design is arranged around the inference being
// visibly incomplete rather than quietly wrong: every ring is classified, every
// classification is counted, and anything that could be read two ways is left
// exactly as it was and reported. A wrong slot is a wasted sheet; an unchanged
// slot is a line in the tally that somebody can go and look at.
//
// Millimetres throughout, y-up. Rings are closed: the last point joins the
// first, and the closing point is not repeated.

export const DEFAULTS = {
  tolerance: 0.35,  // mm a feature may sit from t0 and still be read as t0
  simplify: 0.005,  // mm of sampling noise flattened before anything is measured
  // The importer's own step, in millimetres. Needed here because a sampled
  // corner is not a corner - see restoreCorners().
  sampleStep: 0.35,
  angle: 3,         // degrees off square that still counts as square
  maxFeature: 30,   // mm - sheet material is not thicker than this
  minFeature: 0.4,  // mm - nor thinner
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Signed area; positive is counter-clockwise. */
export function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a / 2;
}

export function ringBBox(pts) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function boundsOf(rings) {
  let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of rings) {
    const t = ringBBox(r);
    b = {
      x0: Math.min(b.x0, t.x0),
      y0: Math.min(b.y0, t.y0),
      x1: Math.max(b.x1, t.x1),
      y1: Math.max(b.y1, t.y1),
    };
  }
  if (!Number.isFinite(b.x0)) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
  return { ...b, w: b.x1 - b.x0, h: b.y1 - b.y0 };
}

export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1])
      && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Flatten sampling noise.
 *
 * The importer walks each path with getPointAtLength, so a straight edge comes
 * back as fifty collinear points and a circle as three hundred. None of the
 * measuring below works on that: a rectangle has to have four corners before it
 * can be recognised as one. A vertex goes if it sits within `eps` of the line
 * through its neighbours, repeatedly until nothing moves.
 *
 * eps has to sit in a narrow window. The importer samples points that lie
 * exactly on the path, so a straight edge needs only enough slack to absorb
 * coordinates rounded to three decimals - half a micron. The ceiling is much
 * lower than it looks: the sagitta of a chord is L^2/8r, so at the importer's
 * 0.35 mm step a 1.5 mm fillet - the end of a stadium slot - bulges only ten
 * microns off its own chord. Five microns keeps that arc and still flattens
 * rounding noise. Anything like a tenth of a millimetre would quietly turn
 * every small slot into a straight line.
 */
export function simplifyRing(pts, eps = DEFAULTS.simplify) {
  let ring = dedupeRing(pts);
  if (ring.length < 4) return ring;
  for (let guard = 0; guard < 32; guard++) {
    const before = ring.length;
    ring = sweep(ring, eps);
    // The anchor is judged here, once, against two survivors - see sweep().
    if (ring.length > 3) {
      const n = ring.length;
      if (perpDist(ring[n - 1], ring[0], ring[1]) <= eps) ring = ring.slice(1);
    }
    if (ring.length === before) break;
  }
  return ring;
}

/** Distance from `cur` to the line through `prev` and `next`. */
function perpDist(prev, cur, next) {
  const ax = next[0] - prev[0];
  const ay = next[1] - prev[1];
  const l = Math.hypot(ax, ay);
  // prev and next coincide, so cur is a spike - keep it rather than dividing
  // by nothing.
  if (l < 1e-12) return Infinity;
  return Math.abs((cur[0] - prev[0]) * ay - (cur[1] - prev[1]) * ax) / l;
}

/**
 * One removal pass, keeping index 0.
 *
 * The pass is linear and a ring is not, and that difference is not cosmetic.
 * Vertex 0 has to be judged against vertex n-1, which the same pass may go on to
 * delete - so a corner can be dropped for being collinear with a point that
 * then disappears, and the edge it anchored disappears with it. That is a whole
 * side of a panel turning into a diagonal, silently. Pinning index 0 for the
 * length of the pass means every comparison is against a vertex that survived;
 * the anchor itself is tested afterwards, when both its neighbours are known.
 */
function sweep(ring, eps) {
  const n = ring.length;
  const out = [ring[0]];
  for (let i = 1; i < n; i++) {
    const prev = out[out.length - 1];
    const next = ring[(i + 1) % n];
    if (perpDist(prev, ring[i], next) <= eps && out.length + (n - i - 1) >= 3) continue;
    out.push(ring[i]);
  }
  return out;
}

export function dedupeRing(pts, eps = 1e-9) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push(p);
  }
  while (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps) out.pop();
    else break;
  }
  return out;
}

/**
 * Which rings are enclosed by something, and are therefore cut into it.
 *
 * Nesting depth, not winding: files come from every drawing program there is and
 * their winding conventions disagree, but containment does not.
 *
 * Depth, and NOT the textbook even-odd parity of it, for a reason that only
 * shows up in real downloads: a lot of cut files are drawn inside a sheet-border
 * rectangle. Under parity that one decorative frame makes every part in the file
 * "odd" - a hole - and every slot in those parts "even" - solid material. Every
 * slot in the file then falls out of the one test that recognises slots, and the
 * tool goes from resizing all of them to resizing none, which is the worst thing
 * it can do quietly. A border is not material and nothing is cut out of it, so
 * parity is counting a ring that was never part of the alternation.
 *
 * The rule that survives a border is the blunter one: anything with another ring
 * around it is a feature cut into something. The cost is an island - material
 * left standing inside a cut-out, the middle of a stencilled O, a small part
 * nested inside a big part's window - reading as a hole. That costs nothing for
 * the three decisions hole-ness actually feeds: a non-rectangular island falls
 * through to the same joint pass either way, and an island would have to be
 * itself the width of the board to be treated differently, which is not a shape
 * anybody cuts.
 */
export function nestRings(rings) {
  const boxes = rings.map(ringBBox);
  return rings.map((ring, i) => {
    let depth = 0;
    // The probe sits ON the ring, not inside it. Rings in a cut file never
    // cross, so a point on ring R is inside ring S exactly when R is inside S -
    // whereas a point in R's middle can easily be inside one of R's own holes.
    // A panel with a slot across its centre is the ordinary case where the
    // obvious probe calls the panel a hole in itself.
    const probe = probePoint(ring);
    // An empty ring encloses nothing and sits inside nothing. It cannot happen
    // through the importer, which drops anything under three points, but this is
    // an exported function and a caller with a stray [] deserves an answer
    // rather than a TypeError from the middle of the containment test.
    if (probe) {
      for (let j = 0; j < rings.length; j++) {
        if (j === i) continue;
        if (!rings[j].length) continue;
        const b = boxes[j];
        if (probe[0] < b.x0 || probe[0] > b.x1 || probe[1] < b.y0 || probe[1] > b.y1) continue;
        if (pointInRing(probe, rings[j])) depth++;
      }
    }
    return { ring, index: i, depth, hole: depth >= 1, bbox: boxes[i] };
  });
}

/**
 * A point on the ring's boundary. The middle of its longest edge, because a
 * vertex can coincide with a neighbouring shape's vertex and land ambiguously
 * on the ray-cast, while the middle of a long edge cannot. Null for an empty
 * ring, which has no boundary to stand on.
 */
function probePoint(ring) {
  if (!ring.length) return null;
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bestLen) { bestLen = l; best = i; }
  }
  return mid(ring[best], ring[(best + 1) % ring.length]);
}

/**
 * The narrowest the shape measures, in its own frame rather than the page's.
 *
 * A slot lying at 30 degrees is still 3 mm wide, but its axis-aligned bounding
 * box is 27 mm tall and 17 mm across and says nothing about the board it was cut
 * for. So the width is taken across every edge direction of the convex hull and
 * the smallest wins - rotating calipers, which is exact for the convex shapes
 * this is asked about (stadium slots) and near enough for the concave ones
 * (dogbones), where the hull bridges the corner reliefs and leaves the slot
 * width alone.
 */
export function minWidth(pts) {
  const hull = convexHull(pts);
  // A point or a line has no width to measure, and 0 is never within tolerance
  // of a board, so nothing downstream mistakes it for a slot.
  if (hull.length < 3) return 0;
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-12) continue;
    let far = 0;
    for (const p of hull) {
      far = Math.max(far, Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / l);
    }
    best = Math.min(best, far);
  }
  return Number.isFinite(best) ? best : 0;
}

/** Monotone chain. Counter-clockwise, no collinear points kept. */
function convexHull(pts) {
  // NaN coordinates are dropped rather than propagated: one bad point in a
  // sampled path would otherwise poison every comparison and make the hull
  // empty, and the ring around it is still perfectly measurable.
  const p = pts.filter((q) => Number.isFinite(q?.[0]) && Number.isFinite(q[1]))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half(p.slice().reverse())];
}

// ---------------------------------------------------------------------------
// Edges

function edgesOf(ring) {
  const n = ring.length;
  const e = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const d = sub(b, a);
    const l = Math.hypot(d[0], d[1]);
    e.push({ i, a, b, d, len: l, u: l > 1e-12 ? [d[0] / l, d[1] / l] : [1, 0] });
  }
  return e;
}

/**
 * Put back the corners the sampler walked past.
 *
 * getPointAtLength returns points at even intervals along the path, and an
 * interval almost never ends exactly on a corner. So every corner in an
 * imported file arrives as a tiny chamfer: the last sample before the turn, the
 * first sample after it, and the actual vertex missing. Both of those points sit
 * on the true outline, so nothing is wrong with them - but a 3 x 30 slot comes
 * out an octagon, and an octagon is not a rectangle, and a slot that is not a
 * rectangle does not get resized. Every rectangular slot in every imported file
 * would land in the "not recognised" pile.
 *
 * A chamfer is put back by intersecting the two long edges either side of it.
 * The test for one is that it is shorter than a single sampling step: within a
 * subpath the sampler cannot produce a chord longer than its step, so a real
 * edge that short would have to have been drawn under half a millimetre - and
 * the reconstructed corner is only accepted if it lands within a couple of
 * steps of the chamfer it replaces, so a genuine small bevel is left alone.
 */
export function restoreCorners(ring, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const n = ring.length;
  if (n < 5) return ring;
  const step = o.sampleStep;
  const e = edgesOf(ring);
  const used = new Array(n).fill(false);
  const replace = new Map();
  const drop = new Set();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (used[i] || used[j]) continue;
    if (e[i].len > step * 1.2) continue;
    const p = e[(i - 1 + n) % n];
    const q = e[j];
    // The neighbours have to be the real edges, not two more chamfers.
    if (p.len < e[i].len * 3 || q.len < e[i].len * 3) continue;
    // ...and they have to actually turn, or there is no corner to find.
    const cross = p.u[0] * q.u[1] - p.u[1] * q.u[0];
    if (Math.abs(cross) < 0.05) continue;
    const diff = sub(q.a, p.a);
    const t = (diff[0] * q.u[1] - diff[1] * q.u[0]) / cross;
    const hit = [p.a[0] + p.u[0] * t, p.a[1] + p.u[1] * t];
    const near = (a) => Math.hypot(hit[0] - a[0], hit[1] - a[1]) <= step * 2;
    if (!near(e[i].a) || !near(e[i].b)) continue;
    replace.set(i, hit);
    drop.add(j);
    used[i] = true;
    used[j] = true;
  }
  if (!replace.size) return ring;
  const out = [];
  for (let k = 0; k < n; k++) {
    if (drop.has(k)) continue;
    out.push(replace.has(k) ? replace.get(k) : ring[k]);
  }
  return out;
}

/** Simplify and then put the corners back - the shape as it was drawn. */
export function readable(ring, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  return restoreCorners(simplifyRing(dedupeRing(ring), o.simplify), o);
}

// ---------------------------------------------------------------------------
// Rectangles

/**
 * Read a ring as a rectangle, at any rotation.
 *
 * Four corners after simplification, four square corners, opposite sides equal.
 * Rounded corners and dogbones deliberately fail this: a slot with relieved
 * corners is a slot, but widening one correctly means moving arcs as well as
 * lines, and a half-done job on a corner relief is worse than leaving it. Those
 * land in the "not recognised" count instead.
 */
export function rectOf(sim, opts = DEFAULTS) {
  if (sim.length !== 4) return null;
  const e = edgesOf(sim);
  if (e.some((x) => x.len < 1e-9)) return null;
  const sinA = Math.sin((opts.angle * Math.PI) / 180);
  for (let i = 0; i < 4; i++) {
    if (Math.abs(dot(e[i].u, e[(i + 1) % 4].u)) > sinA) return null;
  }
  // Opposite sides have to agree, or it is a trapezium wearing a rectangle's
  // corner count. The slack is the simplifier's own, so a shape that only
  // failed by rounding still passes.
  const sideTol = Math.max(opts.simplify * 2, 0.05);
  if (Math.abs(e[0].len - e[2].len) > sideTol) return null;
  if (Math.abs(e[1].len - e[3].len) > sideTol) return null;
  const c = [
    (sim[0][0] + sim[1][0] + sim[2][0] + sim[3][0]) / 4,
    (sim[0][1] + sim[1][1] + sim[2][1] + sim[3][1]) / 4,
  ];
  const a = (e[0].len + e[2].len) / 2;
  const b = (e[1].len + e[3].len) / 2;
  return {
    c,
    // Each side is changed by sliding vertices along its OWN direction: the
    // extent measured along u0 is edge 0's length, so u0 is what moves it.
    sides: [
      { size: a, axis: e[0].u },
      { size: b, axis: e[1].u },
    ],
  };
}

/**
 * Resize one side of a rectangle to `want`, keeping the centre and the other
 * side. Vertices move rather than being rebuilt, so the winding the file came
 * with survives - some laser front-ends care.
 */
function resizeRectSide(ring, c, axis, from, want) {
  const delta = (want - from) / 2;
  return ring.map((p) => {
    const s = dot(sub(p, c), axis);
    const k = s >= 0 ? delta : -delta;
    return [p[0] + axis[0] * k, p[1] + axis[1] * k];
  });
}

// ---------------------------------------------------------------------------
// Jointed runs: fingers, tabs and edge notches

/**
 * Find the stretches of boundary that are a joint.
 *
 * A jointed edge only ever does two things: run along one line, or step across
 * it by the material thickness. So a run is a maximal stretch of edges that are
 * either parallel to the run direction, or perpendicular to it and t0 long.
 *
 * Requiring at least two risers AND three along-edges is what keeps a plain
 * rectangle out of here. A 3 mm x 50 mm strip in a 3 mm file has two edges of
 * exactly t0 that are perpendicular to their neighbours, and reading it as a
 * joint would silently turn a spacer into a different spacer. Three along-edges
 * means there is baseline on both sides of at least one step - a real tab.
 */
function findRuns(sim, t0, opts) {
  const n = sim.length;
  if (n < 5) return [];
  const e = edgesOf(sim);
  const cosA = Math.cos((opts.angle * Math.PI) / 180);
  const sinA = Math.sin((opts.angle * Math.PI) / 180);
  const isRiser = (k, u) => Math.abs(dot(e[k].u, u)) <= sinA
    && Math.abs(e[k].len - t0) <= opts.tolerance;
  const isAlong = (k, u) => Math.abs(dot(e[k].u, u)) >= cosA;

  const runs = [];
  const used = new Array(n).fill(false);
  for (let start = 0; start < n; start++) {
    if (used[start]) continue;
    const u = e[start].u;
    // Seeding from a riser gives a run one edge long, which fails the test at
    // the bottom and costs nothing; the real run is then found from one of its
    // along-edges. Cheaper than working out which edges are worth seeding from.
    // Walking backwards then forwards means a run is found once, from wherever
    // we happen to enter it.
    let lo = start;
    let count = 0;
    while (count < n) {
      const k = (lo - 1 + n) % n;
      if (!isAlong(k, u) && !isRiser(k, u)) break;
      lo = k;
      count++;
    }
    let hi = start;
    while (count < n) {
      const k = (hi + 1) % n;
      if (k === lo) break;
      if (!isAlong(k, u) && !isRiser(k, u)) break;
      hi = k;
      count++;
    }
    const idx = [];
    for (let k = lo; ; k = (k + 1) % n) {
      idx.push(k);
      if (k === hi) break;
      if (idx.length > n) break;
    }
    for (const k of idx) used[k] = true;
    const risers = idx.filter((k) => isRiser(k, u));
    const alongs = idx.filter((k) => isAlong(k, u));
    if (risers.length < 2 || alongs.length < 3) continue;
    runs.push({ idx, u, risers, alongs });
  }
  return runs;
}

/**
 * Split a run's along-edges into the two levels the joint alternates between,
 * and say which level is the feature.
 *
 * The feature is whichever level is less of the edge - one short tip between two
 * long baselines is a tab, and there is nothing to argue about. A proper finger
 * joint is half and half and genuinely undecidable from the two edges alone, so
 * the tie goes to the level further OUT: fingers stick out of a panel and the
 * panel's nominal size is the line they stand on. Moving the other level would
 * translate the whole edge of the part instead of lengthening its fingers.
 *
 * "Out" means out of a counter-clockwise ring, which is what an outline is once
 * the nesting is worked out, and an outline is where finger joints live. On a
 * hole wound the other way the tie would break inwards - but a joint inside a
 * cutout is a notch between two long baselines, so it is settled by length
 * before the tie-break is ever reached.
 */
function levelsOf(run, e, opts) {
  const [ux, uy] = run.u;
  const nrm = [uy, -ux]; // outward for a counter-clockwise ring
  const items = run.alongs.map((k) => ({
    k,
    off: dot(mid(e[k].a, e[k].b), nrm),
    len: e[k].len,
  }));
  const offs = items.map((x) => x.off).sort((a, b) => a - b);
  const lo = offs[0];
  const hi = offs[offs.length - 1];
  const gap = hi - lo;
  // Two levels, and only two: three means something else is going on in the
  // same straight stretch and guessing which pair is the joint is exactly the
  // kind of guess this tool refuses to make.
  const band = Math.max(opts.tolerance / 2, 0.05);
  const lowIt = items.filter((x) => Math.abs(x.off - lo) <= band);
  const highIt = items.filter((x) => Math.abs(x.off - hi) <= band);
  if (lowIt.length + highIt.length !== items.length) return null;
  if (!lowIt.length || !highIt.length) return null;
  return { lo, hi, gap, lowIt, highIt, nrm };
}

// ---------------------------------------------------------------------------
// Thickness guess

/**
 * Guess what the file was drawn for.
 *
 * Every small dimension that could plausibly be a thickness votes, and the
 * winner is the peak of the histogram. Slot widths vote three times because
 * they are the least ambiguous evidence in a cut file - a rectangular hole
 * 3 mm across in a sheet of joinery is a slot for a 3 mm board and very little
 * else. Perpendicular risers vote once; some of them are tabs and some are just
 * short edges.
 *
 * The peak is refined to the mean of its own cluster rather than reported as
 * the bin centre, so a file drawn for 3.175 mm ply comes back 3.175 and not 3.2.
 */
export function guessThickness(rings, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const votes = [];
  const push = (v, w) => {
    if (v >= o.minFeature && v <= o.maxFeature) votes.push({ v, w });
  };
  const nested = nestRings(rings);
  for (const { ring, hole } of nested) {
    const sim = readable(ring, o);
    if (sim.length < 3) continue;
    const r = hole && sim.length === 4 ? rectOf(sim, o) : null;
    if (r) {
      const sizes = r.sides.map((s) => s.size).sort((a, b) => a - b);
      push(sizes[0], 3);
      if (sizes[1] > sizes[0] + 1e-6) push(sizes[1], 1);
      continue;
    }
    const e = edgesOf(sim);
    const sinA = Math.sin((o.angle * Math.PI) / 180);
    for (let i = 0; i < e.length; i++) {
      const p = e[(i - 1 + e.length) % e.length];
      const q = e[(i + 1) % e.length];
      if (Math.abs(dot(e[i].u, p.u)) > sinA) continue;
      if (Math.abs(dot(e[i].u, q.u)) > sinA) continue;
      // A riser is short compared with what it steps off. Without this every
      // panel edge under 30 mm would vote for itself.
      if (e[i].len > Math.min(p.len, q.len) + 1e-9) continue;
      push(e[i].len, 1);
    }
  }
  if (!votes.length) return { value: null, votes: 0, total: 0, runnersUp: [] };

  const win = Math.max(o.tolerance, 0.15);
  const scored = votes.map((cand) => {
    const near = votes.filter((x) => Math.abs(x.v - cand.v) <= win);
    const weight = near.reduce((s, x) => s + x.w, 0);
    const mean = near.reduce((s, x) => s + x.v * x.w, 0) / weight;
    return { value: mean, weight, members: near.length };
  });
  scored.sort((a, b) => b.weight - a.weight || a.value - b.value);
  const best = scored[0];
  const runnersUp = [];
  for (const s of scored) {
    if (runnersUp.length >= 2) break;
    if (Math.abs(s.value - best.value) <= win) continue;
    if (runnersUp.some((r) => Math.abs(r.value - s.value) <= win)) continue;
    runnersUp.push({ value: round(s.value, 3), weight: s.weight });
  }
  return {
    value: round(best.value, 3),
    votes: best.members,
    total: votes.length,
    runnersUp,
  };
}

const round = (v, p) => Math.round(v * 10 ** p) / 10 ** p;

/**
 * The sentence on a mark, derived from the mark's own numbers rather than
 * written once and carried around.
 *
 * A mark outlives the frame it was made in. apply() refits in the file's own
 * frame and scales the result afterwards, so a mark made while the tool was
 * looking at a 3 mm slot describes a 4.5 mm slot by the time it reaches the
 * screen at 150%. Keeping `from` and `to` on the mark is what lets scaleMarks()
 * restate it; a string baked in at creation cannot be corrected and would go on
 * naming an internal number - "3.33 mm" - that the user never asked for and the
 * geometry never had.
 */
export function markWhy(kind, from, to) {
  if (kind === 'slot') return `slot ${round(from, 2)} -> ${round(to, 2)} mm`;
  if (kind === 'tab') return `tab depth ${round(from, 2)} -> ${round(to, 2)} mm`;
  return '';
}

// ---------------------------------------------------------------------------
// The thickness pass

/**
 * Change the features that exist because of material thickness, and nothing
 * else.
 *
 * Order matters. Rectangular holes are settled first and taken out of the
 * running, because the finger-joint test would also match a bare rectangle -
 * two opposite risers of t0 with a perpendicular edge between them - and would
 * move one of its long sides instead of widening it about its centre. Deciding
 * "rectangle" once, up front, is what stops that.
 *
 * Returns the rings, the sub-paths that changed (so the preview can point at
 * them) and a tally that has to add up.
 */
export function refitThickness(rings, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const t0 = Number(o.t0);
  const t1 = Number(o.t1);
  const out = [];
  const marks = [];
  const tally = {
    slots: 0, tabs: 0, unrecognised: 0, untouched: 0, open: 0, rings: rings.length,
  };
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t0 <= 0) {
    return { rings: rings.map((r) => r.slice()), marks, report: { ...tally, t0, t1 } };
  }

  const nested = nestRings(rings);
  for (const { ring, hole } of nested) {
    const raw = dedupeRing(ring);
    const sim = readable(raw, o);
    // Open strokes arrive from the importer as rings with no area - an engraved
    // line sampled end to end and then joined back to its start. Nothing about
    // them depends on thickness. The area is taken from the unsimplified ring
    // on purpose: if simplification is what flattened the shape, that is a bug
    // in the tolerance and it must not read as "this was only a line".
    if (raw.length < 3 || Math.abs(ringArea(raw)) < 0.01) {
      out.push(raw);
      tally.open++;
      continue;
    }

    if (hole) {
      const r = sim.length === 4 ? rectOf(sim, o) : null;
      if (r) {
        const hits = r.sides
          .map((s, i) => ({ ...s, i, off: Math.abs(s.size - t0) }))
          .filter((s) => s.off <= o.tolerance);
        if (hits.length === 2) {
          // A square the size of the material. It could be a slot for a board on
          // edge or a board flat, and the two answers are different rectangles.
          out.push(sim);
          tally.unrecognised++;
          marks.push({ kind: 'unknown', why: 'square hole - which side is the thickness?', pts: sim });
          continue;
        }
        if (hits.length === 1) {
          const s = hits[0];
          const next = resizeRectSide(sim, r.c, s.axis, s.size, t1);
          out.push(next);
          tally.slots++;
          marks.push({
            kind: 'slot',
            from: s.size,
            to: t1,
            why: markWhy('slot', s.size, t1),
            pts: next,
          });
          continue;
        }
        out.push(sim);
        tally.untouched++;
        continue;
      }
      // Not a rectangle, but slot-shaped and slot-sized: a stadium slot, a
      // dogbone, a slot someone drew with a stray node in it. Exactly the shape
      // that must not be silently mangled - so it has to be COUNTED, and the
      // narrowest measure is taken in the shape's own frame. A bounding box
      // would only find these when they happen to lie square to the page; a
      // slot at 45 degrees would measure 24 mm across, miss this test, and be
      // left alone with nothing in the tally to send anyone to look at it.
      if (Math.abs(minWidth(raw) - t0) <= o.tolerance) {
        out.push(sim);
        tally.unrecognised++;
        marks.push({ kind: 'unknown', why: 'slot-sized hole that is not a rectangle', pts: sim });
        continue;
      }
    }

    const res = refitRuns(sim, t0, t1, o);
    out.push(res.pts);
    tally.tabs += res.tabs;
    tally.unrecognised += res.unrecognised;
    if (!res.tabs && !res.unrecognised) tally.untouched++;
    marks.push(...res.marks);
  }

  return {
    rings: out,
    marks,
    report: {
      ...tally,
      t0,
      t1,
      changed: tally.slots + tally.tabs,
      recognised: tally.slots + tally.tabs > 0,
    },
  };
}

/** Move the feature level of every jointed run on one ring. */
function refitRuns(sim, t0, t1, o) {
  const delta = t1 - t0;
  const e = edgesOf(sim);
  const runs = findRuns(sim, t0, o);
  const moved = new Map(); // vertex index -> [dx, dy]
  const marks = [];
  let tabs = 0;
  let unrecognised = 0;
  const claimed = new Set();

  for (const run of runs) {
    for (const k of run.risers) claimed.add(k);
    const lv = levelsOf(run, e, o);
    if (!lv || Math.abs(lv.gap - t0) > o.tolerance) {
      unrecognised++;
      marks.push({
        kind: 'unknown',
        open: true,
        why: 'a joint that steps between more than two lines',
        pts: run.idx.map((k) => e[k].a),
      });
      continue;
    }
    const lowLen = lv.lowIt.reduce((s, x) => s + x.len, 0);
    const highLen = lv.highIt.reduce((s, x) => s + x.len, 0);
    // Less edge = the feature. Within a few percent the joint is symmetric and
    // undecidable that way, so the outer level wins - see levelsOf().
    const tie = Math.abs(lowLen - highLen) <= Math.max(lowLen, highLen) * 0.05;
    const takeHigh = tie ? true : highLen < lowLen;
    const feature = takeHigh ? lv.highIt : lv.lowIt;
    const sign = takeHigh ? 1 : -1;
    const vec = [lv.nrm[0] * delta * sign, lv.nrm[1] * delta * sign];
    const n = sim.length;
    for (const it of feature) {
      // Both ends of the tip edge move, which is what lengthens the risers
      // either side of it without touching their direction or the joint line.
      const v0 = it.k;
      const v1 = (it.k + 1) % n;
      moved.set(v0, vec);
      moved.set(v1, vec);
      tabs++;
      // The mark is the whole tab profile - up the riser, across the tip, back
      // down - because seeing only the tip moved tells you nothing about which
      // way it went.
      marks.push({
        kind: 'tab',
        from: t0,
        to: t1,
        why: markWhy('tab', t0, t1),
        open: true,
        pts: [
          sim[(v0 - 1 + n) % n],
          [sim[v0][0] + vec[0], sim[v0][1] + vec[1]],
          [sim[v1][0] + vec[0], sim[v1][1] + vec[1]],
          sim[(v1 + 1) % n],
        ],
      });
    }
  }

  // Anything of exactly the right length, square to both its neighbours, that
  // no run took: a lone riser. It looks like a tab depth and it is not one, so
  // it goes in the tally rather than being edited on a hunch.
  const sinA = Math.sin((o.angle * Math.PI) / 180);
  for (let i = 0; i < e.length; i++) {
    if (claimed.has(i)) continue;
    if (Math.abs(e[i].len - t0) > o.tolerance) continue;
    const p = e[(i - 1 + e.length) % e.length];
    const q = e[(i + 1) % e.length];
    if (Math.abs(dot(e[i].u, p.u)) > sinA) continue;
    if (Math.abs(dot(e[i].u, q.u)) > sinA) continue;
    if (e[i].len > Math.min(p.len, q.len) + 1e-9) continue;
    unrecognised++;
    marks.push({
      kind: 'unknown',
      open: true,
      why: 'a step of t0 that is not part of a joint',
      pts: [e[i].a, e[i].b],
    });
  }

  const pts = sim.map((p, i) => {
    const v = moved.get(i);
    return v ? [p[0] + v[0], p[1] + v[1]] : [p[0], p[1]];
  });
  return { pts, marks, tabs, unrecognised };
}

// ---------------------------------------------------------------------------
// Scale, and the two knobs together

export function scaleRings(rings, s) {
  return rings.map((r) => r.map(([x, y]) => [x * s, y * s]));
}

/**
 * Scale marks, sentence included.
 *
 * The geometry and the words on it have to move together or the annotation is
 * worse than none: a mark is the only per-feature explanation in the tool, and
 * one that quotes the thickness of an intermediate frame nobody can see is a
 * confident wrong answer. Marks with no numbers on them - the ones that only say
 * what could not be read - say nothing that scaling changes.
 */
export function scaleMarks(marks, s) {
  return marks.map((m) => {
    const pts = m.pts.map(([x, y]) => [x * s, y * s]);
    if (!Number.isFinite(m.from) || !Number.isFinite(m.to)) return { ...m, pts };
    const from = m.from * s;
    const to = m.to * s;
    return {
      ...m, pts, from, to, why: markWhy(m.kind, from, to),
    };
  });
}

/**
 * Both knobs, in the order that makes them independent.
 *
 * The thickness pass runs in the file's own frame and the scale is applied
 * afterwards. t1 is a real-world number - 5 mm of plywood is 5 mm whatever the
 * part is scaled to - so it is divided by the scale going in and multiplied
 * back by it coming out. Without that, asking for 5 mm at 1.5x delivers 7.5.
 *
 * Done this way the two operations commute exactly:
 *   scale(refit(r, t0, t1/s), s)  ===  refit(scale(r, s), t0*s, t1)
 * which is worth more than it looks: it is the proof that the size knob is not
 * quietly a second thickness knob.
 */
export function apply(rings, opts = {}) {
  const s = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  const res = refitThickness(rings, { ...opts, t1: Number(opts.t1) / s });
  return {
    rings: scaleRings(res.rings, s),
    marks: scaleMarks(res.marks, s),
    report: { ...res.report, t1: Number(opts.t1), scale: s },
  };
}

/**
 * Does this look like something that has to fit together?
 *
 * Used for one warning only, and a narrow one: scaling a joinery file without
 * touching the thickness turns a 3 mm slot into a 4.5 mm slot, and the box does
 * not go together. Anything with a recognised slot or tab counts.
 */
export function looksLikeJoinery(report) {
  return !!report && (report.slots > 0 || report.tabs > 0 || report.unrecognised > 0);
}

export function describe(report) {
  if (!report) return '';
  const bits = [];
  bits.push(`${report.slots} slot${report.slots === 1 ? '' : 's'} resized`);
  bits.push(`${report.tabs} tab depth${report.tabs === 1 ? '' : 's'} resized`);
  bits.push(`${report.unrecognised} feature${report.unrecognised === 1 ? '' : 's'} not recognised`);
  return bits.join(', ');
}
