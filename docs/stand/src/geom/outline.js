// Turning single-stroke lettering into a shape that can be cut out.
//
// The Text Engraver's faces are skeletons: one line down the middle of every
// stroke. That is exactly right for engraving and useless for cutting - a line
// has no inside, so there is nothing for the laser to cut around. To cut letters
// out of a board the skeleton has to be given a width and the overlapping
// strokes have to merge into one shape, or the beam would run down every join
// twice and saw the letter apart.
//
// Merging outlines is a polygon union, which is a lot of fragile code. The
// distance field is the shortcut: sample how far each point on a grid is from
// the nearest stroke, subtract half the stroke width, and the letters are simply
// everywhere that value is negative. Overlaps merge for free - min() is the
// union - and the contour comes back out with marching squares.
//
// Two things fall out of it that a union would not give:
//   - joins are filleted, not knife-edged, which is what plywood wants
//   - the same code handles a solid rectangle, so the letters can be welded to
//     the bar that carries them without any special case
//
// Everything is millimetres, y-up. Outer contours come back counter-clockwise
// and holes clockwise, which is the convention the rest of the geometry uses.

const BIG = 1e6;

/** Distance from a point to a line segment. */
function distSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const vv = vx * vx + vy * vy;
  let t = vv > 1e-12 ? (wx * vx + wy * vy) / vv : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(wx - t * vx, wy - t * vy);
}

/** Signed distance to an axis-aligned rectangle; negative inside. */
function sdBox(px, py, x0, y0, x1, y1) {
  const dx = Math.max(x0 - px, px - x1);
  const dy = Math.max(y0 - py, py - y1);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0);
}

export function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a / 2;
}

/** Ramer-Douglas-Peucker on an open run of points. */
function rdp(pts, tol, lo, hi, keep) {
  if (hi <= lo + 1) return;
  const [ax, ay] = pts[lo];
  const [bx, by] = pts[hi];
  let worst = -1;
  let at = -1;
  for (let i = lo + 1; i < hi; i++) {
    const d = distSeg(pts[i][0], pts[i][1], ax, ay, bx, by);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) return;
  keep[at] = true;
  rdp(pts, tol, lo, at, keep);
  rdp(pts, tol, at, hi, keep);
}

/**
 * Thin a closed ring. Split at two far-apart anchors first, or a ring would
 * collapse: with the same point as both ends of the run every other point
 * measures zero deviation from it.
 */
export function simplifyRing(pts, tol) {
  const n = pts.length;
  if (n < 8 || tol <= 0) return pts;
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > best) { best = d; far = i; }
  }
  const keep = new Array(n).fill(false);
  keep[0] = true;
  keep[far] = true;
  rdp(pts, tol, 0, far, keep);
  // The second run wraps past the end, so walk it on a rotated copy.
  const tail = pts.slice(far).concat([pts[0]]);
  const tk = new Array(tail.length).fill(false);
  tk[0] = true;
  tk[tail.length - 1] = true;
  rdp(tail, tol, 0, tail.length - 1, tk);
  for (let i = 1; i < tail.length - 1; i++) if (tk[i]) keep[far + i] = true;
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out.length >= 3 ? out : pts;
}

/** True when the point is inside the ring (ray cast, ring assumed simple). */
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Trace the zero contour of a sampled field.
 *
 * Every crossing point is owned by the grid edge it sits on, and cells refer to
 * those edges by index rather than by coordinate, so neighbouring cells join up
 * exactly and the rings close without any tolerance to tune.
 *
 * Segments are emitted with the inside on the left, which makes outer rings come
 * back counter-clockwise and holes clockwise.
 */
export function marchSquares(v, nx, ny, ox, oy, cell) {
  const idx = (i, j) => i + j * nx;
  const pts = new Map();
  const segs = [];

  const hId = (i, j) => j * nx + i;
  const vId = (i, j) => nx * ny + j * nx + i;

  const hAt = (i, j) => {
    const k = hId(i, j);
    if (!pts.has(k)) {
      const a = v[idx(i, j)];
      const b = v[idx(i + 1, j)];
      const t = a === b ? 0.5 : a / (a - b);
      pts.set(k, [ox + (i + t) * cell, oy + j * cell]);
    }
    return k;
  };
  const vAt = (i, j) => {
    const k = vId(i, j);
    if (!pts.has(k)) {
      const a = v[idx(i, j)];
      const b = v[idx(i, j + 1)];
      const t = a === b ? 0.5 : a / (a - b);
      pts.set(k, [ox + i * cell, oy + (j + t) * cell]);
    }
    return k;
  };

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const va = v[idx(i, j)];
      const vb = v[idx(i + 1, j)];
      const vc = v[idx(i + 1, j + 1)];
      const vd = v[idx(i, j + 1)];
      const code = (va < 0 ? 1 : 0) | (vb < 0 ? 2 : 0)
        | (vc < 0 ? 4 : 0) | (vd < 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;

      const B = () => hAt(i, j);
      const T = () => hAt(i, j + 1);
      const L = () => vAt(i, j);
      const R = () => vAt(i + 1, j);

      switch (code) {
        case 1: segs.push([B(), L()]); break;
        case 2: segs.push([R(), B()]); break;
        case 3: segs.push([R(), L()]); break;
        case 4: segs.push([T(), R()]); break;
        case 6: segs.push([T(), B()]); break;
        case 7: segs.push([T(), L()]); break;
        case 8: segs.push([L(), T()]); break;
        case 9: segs.push([B(), T()]); break;
        case 11: segs.push([R(), T()]); break;
        case 12: segs.push([L(), R()]); break;
        case 13: segs.push([B(), R()]); break;
        case 14: segs.push([L(), B()]); break;
        // Saddles: two opposite corners inside. The centre says whether they are
        // one shape pinched in the middle or two that merely touch here.
        case 5:
          if ((va + vb + vc + vd) / 4 < 0) {
            segs.push([B(), R()]); segs.push([T(), L()]);
          } else {
            segs.push([B(), L()]); segs.push([T(), R()]);
          }
          break;
        case 10:
          if ((va + vb + vc + vd) / 4 < 0) {
            segs.push([L(), B()]); segs.push([R(), T()]);
          } else {
            segs.push([R(), B()]); segs.push([L(), T()]);
          }
          break;
        default: break;
      }
    }
  }

  const next = new Map();
  for (const [a, b] of segs) if (!next.has(a)) next.set(a, b);

  const used = new Set();
  const rings = [];
  for (const [a] of segs) {
    if (used.has(a)) continue;
    const ring = [];
    let k = a;
    while (k != null && !used.has(k)) {
      used.add(k);
      ring.push(pts.get(k));
      k = next.get(k);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/**
 * Build the cut-out shape.
 *
 * @param strokes  flat [x,y,...] polylines - the letter skeletons
 * @param opts.weight  stroke width in millimetres
 * @param opts.solids  axis-aligned [x0,y0,x1,y1] rectangles welded in
 * @param opts.cell    grid pitch; defaults to something sane for the size
 * @param opts.minArea drop specks smaller than this, in mm^2
 * @returns { rings, outers, holes, cell }
 */
export function strokesToOutline(strokes, opts = {}) {
  const r = Math.max(0.05, (opts.weight ?? 4) / 2);
  const solids = opts.solids || [];

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const st of strokes) {
    for (let k = 0; k < st.length; k += 2) {
      if (st[k] < x0) x0 = st[k];
      if (st[k] > x1) x1 = st[k];
      if (st[k + 1] < y0) y0 = st[k + 1];
      if (st[k + 1] > y1) y1 = st[k + 1];
    }
  }
  for (const s of solids) {
    x0 = Math.min(x0, s[0] - r); y0 = Math.min(y0, s[1] - r);
    x1 = Math.max(x1, s[2] + r); y1 = Math.max(y1, s[3] + r);
  }
  const groups = opts.glyphs || [];
  for (const rings of groups) {
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k += 2) {
        if (ring[k] - r < x0) x0 = ring[k] - r;
        if (ring[k] + r > x1) x1 = ring[k] + r;
        if (ring[k + 1] - r < y0) y0 = ring[k + 1] - r;
        if (ring[k + 1] + r > y1) y1 = ring[k + 1] + r;
      }
    }
  }
  if (!Number.isFinite(x0)) return { rings: [], outers: [], holes: [], cell: 0 };

  const span = Math.max(x1 - x0 + r * 2, y1 - y0 + r * 2, 1);
  const cell = opts.cell ?? Math.min(0.4, Math.max(0.06, span / 900));
  const pad = r + cell * 3;
  const ox = x0 - pad;
  const oy = y0 - pad;
  const nx = Math.ceil((x1 + pad - ox) / cell) + 1;
  const ny = Math.ceil((y1 + pad - oy) / cell) + 1;
  // A pathological setting (a hair-thin cell on a huge sign) would allocate
  // gigabytes; refuse rather than freeze the tab.
  if (nx * ny > 12e6) return { rings: [], outers: [], holes: [], cell, tooFine: true };

  const v = new Float32Array(nx * ny).fill(BIG);
  const iOf = (x) => (x - ox) / cell;
  const jOf = (y) => (y - oy) / cell;
  const clampI = (i) => Math.max(0, Math.min(nx - 1, i));
  const clampJ = (j) => Math.max(0, Math.min(ny - 1, j));

  // Only the band around each stroke is sampled. Outside it the true value is
  // more than a couple of cells positive, so leaving it at BIG cannot move a
  // zero crossing - and it turns an O(cells x segments) sweep into a local one.
  const stamp = (paths, radius) => {
    const band = radius + cell * 3;
    for (const st of paths) {
      for (let k = 2; k < st.length; k += 2) {
        const ax = st[k - 2];
        const ay = st[k - 1];
        const bx = st[k];
        const by = st[k + 1];
        const i0 = clampI(Math.floor(iOf(Math.min(ax, bx) - band)));
        const i1 = clampI(Math.ceil(iOf(Math.max(ax, bx) + band)));
        const j0 = clampJ(Math.floor(jOf(Math.min(ay, by) - band)));
        const j1 = clampJ(Math.ceil(jOf(Math.max(ay, by) + band)));
        for (let j = j0; j <= j1; j++) {
          const py = oy + j * cell;
          const row = j * nx;
          for (let i = i0; i <= i1; i++) {
            const d = distSeg(ox + i * cell, py, ax, ay, bx, by) - radius;
            if (d < v[row + i]) v[row + i] = d;
          }
        }
      }
      // A single-point stroke is a dot, and Hershey has a few.
      if (st.length === 2) {
        const ax = st[0];
        const ay = st[1];
        const i0 = clampI(Math.floor(iOf(ax - band)));
        const i1 = clampI(Math.ceil(iOf(ax + band)));
        const j0 = clampJ(Math.floor(jOf(ay - band)));
        const j1 = clampJ(Math.ceil(jOf(ay + band)));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const d = Math.hypot(ox + i * cell - ax, oy + j * cell - ay) - radius;
            if (d < v[j * nx + i]) v[j * nx + i] = d;
          }
        }
      }
    }
  };
  stamp(strokes, r);
  // Bridges are stamped thinner than the lettering on purpose: they exist to
  // stop a floating piece - the dot of an i, the bar of a diaeresis - dropping
  // out of the sheet, and a bridge as fat as a stem would read as one.
  if (opts.bridges?.paths?.length) {
    stamp(opts.bridges.paths, Math.max(0.05, (opts.bridges.weight ?? 2.5) / 2));
  }

  // A letter from a real font arrives as filled contours rather than a
  // skeleton, so its sign comes from a scanline fill and its magnitude from the
  // edges. Only a band either side of the outline is measured - that is all the
  // contour tracer looks at - and everything deeper just has to be negative.
  for (const rings of groups) {
    let gx0 = Infinity; let gy0 = Infinity; let gx1 = -Infinity; let gy1 = -Infinity;
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k += 2) {
        if (ring[k] < gx0) gx0 = ring[k];
        if (ring[k] > gx1) gx1 = ring[k];
        if (ring[k + 1] < gy0) gy0 = ring[k + 1];
        if (ring[k + 1] > gy1) gy1 = ring[k + 1];
      }
    }
    if (!Number.isFinite(gx0)) continue;
    const i0 = clampI(Math.floor(iOf(gx0 - cell * 3)));
    const i1 = clampI(Math.ceil(iOf(gx1 + cell * 3)));
    const j0 = clampJ(Math.floor(jOf(gy0 - cell * 3)));
    const j1 = clampJ(Math.ceil(jOf(gy1 + cell * 3)));
    const gw = i1 - i0 + 1;
    const gh = j1 - j0 + 1;
    if (gw <= 0 || gh <= 0) continue;
    const dist = new Float32Array(gw * gh).fill(BIG);
    const inside = new Uint8Array(gw * gh);

    for (let j = j0; j <= j1; j++) {
      const py = oy + j * cell;
      const xs = [];
      for (const ring of rings) {
        for (let k = 0, m = ring.length - 2; k < ring.length; m = k, k += 2) {
          const ay = ring[m + 1];
          const by = ring[k + 1];
          if ((ay <= py) === (by <= py)) continue;
          const t = (py - ay) / (by - ay);
          xs.push([ring[m] + t * (ring[k] - ring[m]), by > ay ? 1 : -1]);
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a[0] - b[0]);
      // Non-zero winding, so a counter subtracts but two overlapping strokes of
      // the same letter do not cancel each other out.
      let wind = 0;
      for (let s = 0; s < xs.length - 1; s++) {
        wind += xs[s][1];
        if (wind === 0) continue;
        const ia = Math.max(i0, Math.ceil(iOf(xs[s][0])));
        const ib = Math.min(i1, Math.floor(iOf(xs[s + 1][0])));
        for (let i = ia; i <= ib; i++) inside[(j - j0) * gw + (i - i0)] = 1;
      }
    }

    for (const ring of rings) {
      for (let k = 0, m = ring.length - 2; k < ring.length; m = k, k += 2) {
        const ax = ring[m];
        const ay = ring[m + 1];
        const bx = ring[k];
        const by = ring[k + 1];
        const ea = clampI(Math.floor(iOf(Math.min(ax, bx) - cell * 3)));
        const eb = clampI(Math.ceil(iOf(Math.max(ax, bx) + cell * 3)));
        const ec = clampJ(Math.floor(jOf(Math.min(ay, by) - cell * 3)));
        const ed = clampJ(Math.ceil(jOf(Math.max(ay, by) + cell * 3)));
        for (let j = Math.max(ec, j0); j <= Math.min(ed, j1); j++) {
          const py = oy + j * cell;
          for (let i = Math.max(ea, i0); i <= Math.min(eb, i1); i++) {
            const li = (j - j0) * gw + (i - i0);
            const d = distSeg(ox + i * cell, py, ax, ay, bx, by);
            if (d < dist[li]) dist[li] = d;
          }
        }
      }
    }

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const li = (j - j0) * gw + (i - i0);
        const d = dist[li];
        const val = inside[li] ? (d < BIG ? -d : -1e3) : d;
        const gi = j * nx + i;
        if (val < v[gi]) v[gi] = val;
      }
    }
  }

  for (const [sx0, sy0, sx1, sy1] of solids) {
    const i0 = clampI(Math.floor(iOf(sx0 - cell * 3)));
    const i1 = clampI(Math.ceil(iOf(sx1 + cell * 3)));
    const j0 = clampJ(Math.floor(jOf(sy0 - cell * 3)));
    const j1 = clampJ(Math.ceil(jOf(sy1 + cell * 3)));
    for (let j = j0; j <= j1; j++) {
      const py = oy + j * cell;
      const row = j * nx;
      for (let i = i0; i <= i1; i++) {
        const d = sdBox(ox + i * cell, py, sx0, sy0, sx1, sy1);
        if (d < v[row + i]) v[row + i] = d;
      }
    }
  }

  const raw = marchSquares(v, nx, ny, ox, oy, cell);
  const tol = opts.tolerance ?? cell * 0.35;
  // A speck smaller than this is grid noise, not geometry. The floor has to be
  // low for outline faces: the counter of a small 'e' is a real hole a couple of
  // square millimetres in size, and dropping it would fill the letter in.
  const minArea = opts.minArea ?? (strokes.length ? Math.max(0.5, r * r * 0.6) : 0.3);

  const outers = [];
  const holes = [];
  for (const ring of raw) {
    const s = simplifyRing(ring, tol);
    const a = ringArea(s);
    if (Math.abs(a) < minArea) continue;
    (a > 0 ? outers : holes).push(s);
  }
  outers.sort((a, b) => ringArea(b) - ringArea(a));
  return { rings: [...outers, ...holes], outers, holes, cell };
}

export { distSeg, sdBox };
