// Hankin's polygons in contact - the one engine behind seven of the ten looks.
//
// Put two rays into the middle of every edge of every tile, at the same angle
// to that edge, and let them run until they hit something. That is the whole
// method, and the reason it works is worth stating because it is what makes the
// pattern continuous rather than a field of separate stars:
//
//   both tiles sharing an edge start their rays at the SAME point - the edge
//   midpoint - at the SAME angle to the SAME line. So one ray of tile A and one
//   ray of tile B are collinear: a single straight strap passes clean through
//   the edge. Nothing is stitched together afterwards.
//
// That is also why theta has to be one global number. Give each tile its own
// and every strap kinks at every edge midpoint, which looks like a bug in the
// tiling and is not.
//
// The closed form for a regular n-gon is in `starOracle` below, and the tests
// use it as an oracle: it is arithmetic, so if the propagator disagrees with it
// the propagator is wrong.
//
// Millimetres, y-up, CCW faces in, flat list of [x0,y0,x1,y1] straps out.

const D2R = Math.PI / 180;

/**
 * Where the valley of the star sits in a regular n-gon, and the two angles the
 * pattern is judged by. Circumradius R, contact angle theta in degrees.
 *
 *   rho      = R cos(gamma)                       the apothem - where the tips land
 *   rValley  = rho (cos g - sin g tan(theta - g))
 *   point    = 180 - 2 theta                      the crossing angle at a midpoint
 *   valley   = 180 + 2(theta - gamma)
 *
 * theta = gamma puts the valley on the midpoint polygon and the star vanishes;
 * theta = 90 puts every ray on the centre. Both ends are guarded by the tiling
 * table, not here.
 */
export function starOracle(n, R, thetaDeg) {
  const g = Math.PI / n;
  const th = thetaDeg * D2R;
  const rho = R * Math.cos(g);
  return {
    gamma: g / D2R,
    rho,
    rValley: rho * (Math.cos(g) - Math.sin(g) * Math.tan(th - g)),
    pointAngle: 180 - 2 * thetaDeg,
    valleyAngle: 180 + 2 * (thetaDeg - g / D2R),
  };
}

const EPS = 1e-7;

/** Intersect ray (o,d) with ray (p,e). Returns [s, u] or null. */
function rayRay(o, d, p, e) {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-12) return null;
  const wx = p[0] - o[0];
  const wy = p[1] - o[1];
  const s = (wx * e[1] - wy * e[0]) / den;
  const u = (wx * d[1] - wy * d[0]) / den;
  return [s, u];
}

/** Intersect ray (o,d) with segment a-b. Returns s along the ray, or Infinity. */
function raySeg(o, d, a, b) {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const r = rayRay(o, d, a, [ex, ey]);
  if (!r) return Infinity;
  const [s, u] = r;
  if (s <= EPS || u < -EPS || u > 1 + EPS) return Infinity;
  return s;
}

/**
 * Decorate one face.
 *
 * Every ray grows at the SAME RATE and two rays stop when their growing ends
 * touch. That is Hankin's construction and it is not the same thing as cutting
 * each ray at the first line it happens to cross, which is the obvious
 * implementation and is wrong.
 *
 * The difference shows up as soon as theta comes down. In a regular octagon at
 * 67.5 degrees the two rules agree. At 50 degrees they do not: the ray from one
 * edge midpoint crosses a ray from a further edge at a nearer point than the
 * one where it meets its own partner, so "first crossing" stops it at radius 42
 * where the closed form says 33.5, and every valley in the pattern lands in the
 * wrong place. Ordering the meetings by max(s_i, s_j) - by when the two ends
 * actually arrive, not by how far one of them has gone - fixes it, and the
 * result then agrees with starOracle at every angle. The tests pin that.
 *
 * A ray that meets nothing is cut at the face boundary. That is not a tidy-up:
 * in an irregular face - a girih bowtie with a 216 degree corner, or a tile the
 * panel edge has taken a bite out of - a ray genuinely can leave without
 * meeting anything, and one allowed to run on would be a strap heading off
 * across the panel with nothing at the end of it.
 */
function decorateFace(ring, thetaDeg, out) {
  const th = thetaDeg * D2R;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const n = ring.length;
  const rays = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) continue;
    const tx = dx / L;
    const ty = dy / L;
    // Interior is on the left of a->b for a CCW ring, so the inward normal is
    // t turned a quarter turn anticlockwise.
    const nx = -ty;
    const ny = tx;
    const m = [a[0] + dx / 2, a[1] + dy / 2];
    rays.push({ o: m, d: [c * tx + s * nx, c * ty + s * ny] });
    rays.push({ o: m, d: [-c * tx + s * nx, -c * ty + s * ny] });
  }

  // How far each ray can go before it leaves the tile. Nothing may meet beyond
  // this, or two tiles would decorate the same piece of plane.
  const bound = rays.map((r) => {
    let best = Infinity;
    for (let k = 0; k < n; k++) {
      const d = raySeg(r.o, r.d, ring[k], ring[(k + 1) % n]);
      if (d < best) best = d;
    }
    return best;
  });

  const events = [];
  for (let i = 0; i < rays.length; i++) {
    for (let j = i + 1; j < rays.length; j++) {
      const r = rayRay(rays[i].o, rays[i].d, rays[j].o, rays[j].d);
      if (!r) continue;
      const [si, sj] = r;
      if (si <= EPS || sj <= EPS) continue;
      if (si > bound[i] + EPS || sj > bound[j] + EPS) continue;
      events.push([Math.max(si, sj), i, j, si, sj]);
    }
  }
  events.sort((a, b) => a[0] - b[0]);
  const end = rays.map(() => Infinity);
  for (const [, i, j, si, sj] of events) {
    if (Number.isFinite(end[i]) || Number.isFinite(end[j])) continue;
    end[i] = si;
    end[j] = sj;
  }
  for (let i = 0; i < rays.length; i++) {
    if (!Number.isFinite(end[i])) end[i] = bound[i];
  }

  for (let i = 0; i < rays.length; i++) {
    const L = end[i];
    if (!Number.isFinite(L) || L < 1e-6) continue;
    const { o, d } = rays[i];
    out.push([o[0], o[1], o[0] + d[0] * L, o[1] + d[1] * L]);
  }
}

/**
 * Every strap of the pattern, as flat [x0,y0,x1,y1] segments.
 *
 * The result is one connected line network so long as the tiling is
 * edge-connected, because each shared edge midpoint is a point four strap ends
 * meet at. That is a statement about the un-clipped interior and nothing more -
 * what happens where the network is cut by the frame band or the cartouche is
 * decided in pattern.js and proved in connect.js, not here.
 */
export function picSegments(faces, thetaDeg) {
  const out = [];
  for (const f of faces) decorateFace(f, thetaDeg, out);
  return out;
}

/**
 * The star cell of one face: the 2n-gon with tips on the edge midpoints and
 * valleys on the bisectors. Only used by the punch-mode preset, which cuts the
 * stars and leaves the field between them solid, so it needs the star as a
 * polygon rather than as a face of an arrangement.
 *
 * Regular faces only - it is derived from the closed form. Punch mode is only
 * offered on 4.8.8 for that reason.
 */
export function starCell(ring, thetaDeg) {
  const n = ring.length;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) { cx += x / n; cy += y / n; }
  const mids = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    mids.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  const R = Math.hypot(ring[0][0] - cx, ring[0][1] - cy);
  const { rho, rValley } = starOracle(n, R, thetaDeg);
  if (!(rValley > 0) || !(rValley < rho)) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mids[i]);
    const m0 = mids[i];
    const m1 = mids[(i + 1) % n];
    // The valley sits on the bisector between two tips, at rValley from the
    // centre; the bisector direction is the average of the two tip directions.
    let bx = (m0[0] - cx) / rho + (m1[0] - cx) / rho;
    let by = (m0[1] - cy) / rho + (m1[1] - cy) / rho;
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl; by /= bl;
    out.push([cx + bx * rValley, cy + by * rValley]);
  }
  return out;
}
