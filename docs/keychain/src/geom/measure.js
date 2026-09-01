// The two numbers that decide whether a keychain survives being carried.
//
// A keychain lives in a pocket with a bunch of keys. It is levered, sat on and
// dropped, and it fails in exactly two places: the ring hole tears out through
// the edge, or the piece snaps at whatever its narrowest point happens to be.
// Both are measurable before anything is cut, and neither is obvious by eye -
// a 1.4 mm neck between two letters looks perfectly solid on a screen.
//
// Everything is millimetres. Rings are [[x, y], ...], counter-clockwise for
// solids and clockwise for holes, which is what the outliner produces.

/** Shortest distance from a point to a closed ring, measured to its edges. */
export function pointToRing(px, py, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0];
    const ay = ring[j][1];
    const dx = ring[i][0] - ax;
    const dy = ring[i][1] - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0
      ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
      : 0;
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/** Even-odd point in ring. */
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

/** Is this point in the material - inside a solid and not inside one of its holes? */
export function inSolid(px, py, outers, holes) {
  let hit = false;
  for (const o of outers) if (inRing(px, py, o)) { hit = true; break; }
  if (!hit) return false;
  for (const h of holes) if (inRing(px, py, h)) return false;
  return true;
}

/**
 * How much material is left around a hole of radius `r` at (cx, cy).
 *
 * Measured to every boundary the piece has, not only to the outside edge: on a
 * silhouette keychain the thing the ring hole is most likely to break into is
 * the counter of the letter next to it, and a check against the outline alone
 * would call that safe.
 *
 * Negative means the hole has already broken out.
 */
export function wallAround(cx, cy, r, rings) {
  let best = Infinity;
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    const d = pointToRing(cx, cy, ring);
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best - r : Infinity;
}

/** Every point of every ring, thinned to roughly `want` of them, tagged by ring. */
function sample(rings, want) {
  const total = rings.reduce((n, r) => n + r.length, 0);
  const stride = Math.max(1, Math.floor(total / Math.max(1, want)));
  const pts = [];
  rings.forEach((ring, ri) => {
    // Arc length is carried along so two samples on the same ring can be told
    // apart by how far round the boundary they are, not by their index - a
    // polygon from marching squares has points every cell on a curve and two
    // points on a long straight, so indices say nothing about distance.
    let run = 0;
    for (let i = 0; i < ring.length; i++) {
      if (i > 0) {
        run += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
      }
      if (i % stride === 0) pts.push([ring[i][0], ring[i][1], ri, run]);
    }
    // The ring's own perimeter, so the wrap-around distance can be worked out.
    let per = run;
    if (ring.length > 1) {
      per += Math.hypot(
        ring[0][0] - ring[ring.length - 1][0],
        ring[0][1] - ring[ring.length - 1][1],
      );
    }
    for (const p of pts) if (p[2] === ri) p[4] = per;
  });
  return pts;
}

/**
 * The narrowest place in the piece, in millimetres.
 *
 * This is a thickness, not a gap, and telling the two apart is the whole
 * difficulty. Two points a millimetre apart on the boundary can be either the
 * two sides of a neck about to snap, or the two sides of the space between two
 * letters that never touched - and the second is not a defect at all.
 *
 * Two tests separate them:
 *
 *   - the midpoint of the pair has to be IN the material. Across a neck it is;
 *     across the air between two letters it is not.
 *   - on one ring, the pair has to be far apart along the boundary compared
 *     with how far apart they are in space. Without that, every smooth curve
 *     reports its own sampling: two neighbouring points on a big disc are half
 *     a millimetre apart with material between them, and the disc would be
 *     called half a millimetre thick. A real neck is the opposite - a
 *     millimetre across and fifty millimetres round.
 *
 * Pairs on DIFFERENT rings need no such test: the material between a counter
 * and the outside edge is exactly the wall that breaks, however short the way
 * round either of them is.
 *
 * Returns { mm, at } - the width and where it is, or mm = Infinity when there
 * is nothing to measure.
 */
export function narrowestNeck(outers, holes, opts = {}) {
  const rings = [...outers, ...holes].filter((r) => r && r.length >= 3);
  if (!rings.length) return { mm: Infinity, at: null };
  const pts = sample(rings, opts.samples ?? 700);
  // How much longer the way round has to be than the way across. Three is
  // enough to clear any convex curve - a chord of length d on a circle is
  // subtended by an arc barely longer than d - while a genuine neck runs to
  // ten or twenty.
  const ratio = opts.ratio ?? 3;
  let best = Infinity;
  let at = null;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay, ar, aRun, aPer] = pts[i];
    for (let j = i + 1; j < pts.length; j++) {
      const [bx, by, br, bRun] = pts[j];
      const d = Math.hypot(ax - bx, ay - by);
      if (d >= best) continue;
      if (ar === br) {
        const gap = Math.abs(aRun - bRun);
        const round = Math.min(gap, (aPer || gap) - gap);
        if (!(round > ratio * d)) continue;
      }
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      if (!inSolid(mx, my, outers, holes)) continue;
      best = d;
      at = [mx, my];
    }
  }
  return { mm: best, at };
}

/**
 * The solid runs across the piece at one x (axis 'x') or one y (axis 'y').
 *
 * Used to park the ring's lug somewhere it will actually weld on. Non-zero
 * winding, so two overlapping letters do not cancel each other out.
 */
export function spansAt(rings, axis, at) {
  const xs = [];
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j];
      const b = ring[i];
      const av = axis === 'x' ? a[0] : a[1];
      const bv = axis === 'x' ? b[0] : b[1];
      if ((av <= at) === (bv <= at)) continue;
      const t = (at - av) / (bv - av);
      const other = axis === 'x'
        ? a[1] + t * (b[1] - a[1])
        : a[0] + t * (b[0] - a[0]);
      xs.push([other, bv > av ? 1 : -1]);
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
