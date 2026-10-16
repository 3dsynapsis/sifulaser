// Keel arch ("gerbang lunas", the mihrab outline) and the living hinge that
// bends a flat board over it. Pure: no imports, no DOM - tested in node by
// scripts/test-boxmaker-mihrab.mjs.
//
// THE OUTLINE, seen from the front, x across and z up:
//
//   * two vertical sides up to the spring line z = zS;
//   * a shoulder arc of radius R on each side, centred (R, zS) and (L - R, zS),
//     leaving the side vertically;
//   * a straight run up from each shoulder towards the middle;
//   * a small apex arc of radius ra, centred on x = L/2, whose top is z = H.
//
// The straight run is the common tangent of the shoulder circle and the apex
// circle, so the whole curve is smooth everywhere - which is what lets a single
// kerf-bent strip follow it, the apex included. A truly sharp keel cannot be
// bent from one board; ra is how pointed it can be and still bend.
//
// OFFSETS. Every piece of the curve is a line or an arc about a fixed centre, so
// the curve d millimetres inside it is the same curve with R - d, ra - d and the
// straight run moved in by d. The roof strip lies between offset 0 (its outside)
// and offset t (the edges of the panels it rests on).

const TAU = Math.PI * 2;

/**
 * Solve the arch for a front of width L whose arch springs at zS and tops out
 * at H. R and ra are WISHES: R is reduced until the straight run climbs at
 * least `minSlope` degrees - a shoulder taller than the apex would make the
 * curve dip - and ra is kept inside R and the rise.
 *
 * Returns { L, zS, H, R, ra, C1, C2, n, phi, slope, line } where n is the unit
 * outward normal of the left straight run (pointing up and left), phi its angle
 * - also the angle at which the run leaves both circles - and line its length.
 */
export function solveKeel({ L, zS, H, R, ra, minSlope = 12 }) {
  const rise = H - zS;
  ra = Math.max(0.5, Math.min(ra, rise - 0.5, L / 2 - 1));
  const tryR = (r) => {
    const C1 = [r, zS];
    const C2 = [L / 2, H - ra];
    const D = [C2[0] - C1[0], C2[1] - C1[1]];
    const d = Math.hypot(D[0], D[1]);
    if (!(d > Math.abs(r - ra) + 1e-9)) return null;
    // n . (C2 - C1) = r - ra: the line is at distance r from C1 and ra from C2,
    // both centres on the same side. Rotate D anticlockwise by acos(...).
    const phi = Math.atan2(D[1], D[0]) + Math.acos((r - ra) / d);
    const slope = (phi - Math.PI / 2) * 180 / Math.PI;
    if (!(slope >= minSlope && phi < Math.PI)) return null;
    const n = [Math.cos(phi), Math.sin(phi)];
    const T1 = [C1[0] + r * n[0], C1[1] + r * n[1]];
    const T2 = [C2[0] + ra * n[0], C2[1] + ra * n[1]];
    const line = Math.hypot(T2[0] - T1[0], T2[1] - T1[1]);
    if (!(T2[0] > T1[0])) return null;
    return { L, zS, H, R: r, ra, C1, C2, n, phi, slope, line };
  };
  let r = Math.max(ra + 0.5, Math.min(R, L / 2 - 0.5));
  let got = tryR(r);
  if (got) return got;
  // Bisect down towards the smallest legal shoulder.
  let lo = ra + 0.5;
  let hi = r;
  let best = tryR(lo);
  if (!best) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const m = tryR(mid);
    if (m) { best = m; lo = mid; } else hi = mid;
  }
  return best;
}

/**
 * The arch outline offset `d` inwards, as a polyline in (x, z). It runs from
 * the LEFT spring (d, zS) over the top to the RIGHT spring (L - d, zS): an open
 * curve - the caller adds whatever lies below the spring line.
 *
 * `opts.from`/`opts.to` clip it to an x range (inclusive) for the doors, which
 * each carry half. Arcs are sampled at about `step` mm.
 */
export function keelPath(k, d = 0, opts = {}) {
  const step = opts.step || 1.2;
  const { L, C1, C2, n, phi } = k;
  const R = k.R - d;
  const ra = k.ra - d;
  const left = [];
  // Shoulder arc, from the spring (angle pi) round to phi.
  const n1 = Math.max(4, Math.ceil(((Math.PI - phi) * Math.max(R, 1)) / step));
  for (let i = 0; i <= n1; i++) {
    const a = Math.PI - ((Math.PI - phi) * i) / n1;
    left.push([C1[0] + R * Math.cos(a), C1[1] + R * Math.sin(a)]);
  }
  // Apex arc from phi to the top (pi/2). The straight run is the gap between
  // the last shoulder point and the first apex point.
  const n2 = Math.max(3, Math.ceil(((phi - Math.PI / 2) * Math.max(ra, 0.5)) / step));
  for (let i = 0; i <= n2; i++) {
    const a = phi - ((phi - Math.PI / 2) * i) / n2;
    left.push([C2[0] + ra * Math.cos(a), C2[1] + ra * Math.sin(a)]);
  }
  left[0] = [d, k.zS];                       // exact spring, no float noise
  left[left.length - 1] = [L / 2, k.H - d];  // exact top
  const right = left.slice(0, -1).reverse().map(([x, z]) => [L - x, z]);
  let pts = [...left, ...right];
  if (opts.from != null || opts.to != null) {
    pts = clipX(pts, opts.from ?? -Infinity, opts.to ?? Infinity);
  }
  void n;
  return pts;
}

/** Keep the part of an x-monotone-ish polyline with from <= x <= to, cut exactly. */
function clipX(pts, from, to) {
  const out = [];
  const inside = (p) => p[0] >= from - 1e-9 && p[0] <= to + 1e-9;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) {
      const q = pts[i - 1];
      for (const xc of [from, to]) {
        if ((q[0] - xc) * (p[0] - xc) < 0) {
          const s = (xc - q[0]) / (p[0] - q[0]);
          out.push([xc, q[1] + s * (p[1] - q[1])]);
        }
      }
    }
    if (inside(p)) out.push(p);
  }
  return out;
}

/** Height of the outline (offset d) above x, on the arch part (x in [d, L - d]). */
export function keelZ(k, x, d = 0) {
  const xs = Math.min(x, k.L - x);           // fold onto the left half
  const R = k.R - d;
  const ra = k.ra - d;
  const T1x = k.C1[0] + R * k.n[0];
  const T2x = k.C2[0] + ra * k.n[0];
  if (xs <= T1x) {
    const dx = xs - k.C1[0];
    return k.C1[1] + Math.sqrt(Math.max(0, R * R - dx * dx));
  }
  if (xs >= T2x) {
    const dx = xs - k.C2[0];
    return k.C2[1] + Math.sqrt(Math.max(0, ra * ra - dx * dx));
  }
  const T1z = k.C1[1] + R * k.n[1];
  const T2z = k.C2[1] + ra * k.n[1];
  return T1z + ((xs - T1x) / (T2x - T1x)) * (T2z - T1z);
}

/**
 * The developed strip: the curve at offset t/2 (the board's mid-plane, which
 * is what keeps its length when it bends), from spring to spring. Returns its
 * length, the bend zones as [s0, s1] in arc length from the left end, and
 * `at(s)` -> { x, z, nx, nz }: the mid-plane point and outward normal there.
 */
export function strip(k, t) {
  const m = t / 2;
  const R = k.R - m;
  const ra = k.ra - m;
  const a1 = Math.PI - k.phi;                // shoulder sweep
  const a2 = k.phi - Math.PI / 2;            // half the apex sweep
  const sArc = R * a1;
  const sLine = k.line;
  const sApex = ra * a2 * 2;
  const total = 2 * sArc + 2 * sLine + sApex;
  const zones = [
    [0, sArc],
    [sArc + sLine, sArc + sLine + sApex],
    [total - sArc, total],
  ];
  const { C1, C2, n } = k;
  const T1 = [C1[0] + R * n[0], C1[1] + R * n[1]];
  const dir = [n[1], -n[0]];                 // along the run, upwards to the right
  function leftHalf(s) {
    if (s <= sArc) {
      const a = Math.PI - s / R;
      return { x: C1[0] + R * Math.cos(a), z: C1[1] + R * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) };
    }
    if (s <= sArc + sLine) {
      const u = s - sArc;
      return { x: T1[0] + dir[0] * u, z: T1[1] + dir[1] * u, nx: n[0], nz: n[1] };
    }
    const a = k.phi - (s - sArc - sLine) / ra;
    return { x: C2[0] + ra * Math.cos(a), z: C2[1] + ra * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) };
  }
  const at = (s) => {
    s = Math.max(0, Math.min(total, s));
    if (s <= total / 2) return leftHalf(s);
    const q = leftHalf(total - s);
    return { x: k.L - q.x, z: q.z, nx: -q.nx, nz: q.nz };
  };
  return { length: total, zones, at, sArc, sLine, sApex };
}

/**
 * Living hinge cuts for a strip `length` long and `width` wide, bending in the
 * given zones. Rows run across the strip (parallel to the bend axis) every
 * `pitch` mm; along a row the cuts alternate with bridges so that neighbouring
 * rows are staggered half a period. Odd rows leave a bridge at both edges;
 * even rows run out through the edges, so there is no unbroken rail down
 * either side to stop the bend.
 *
 * Returns { holes, notches }: holes are closed slots (rings), notches are the
 * edge-open cuts as { s, depth, edge: 0 | 1 } for the caller to walk into the
 * outline. `slot` is the drawn width of a cut before kerf compensation.
 */
export function livingHinge(length, width, zones, opts = {}) {
  const pitch = opts.pitch || 1.5;
  const slot = opts.slot || 0.5;
  const bridge = opts.bridge || 3;
  const period0 = opts.period || 22;
  const endClear = opts.endClear ?? 3;
  const n = Math.max(1, Math.round(width / period0));
  const P = width / n;
  const holes = [];
  const notches = [];
  const rows = [];
  for (const [a0, a1] of zones) {
    // One row past each end of the bend, so the curve never ends on solid board.
    const from = Math.max(endClear, a0 - pitch);
    const to = Math.min(length - endClear, a1 + pitch);
    for (let s = from; s <= to + 1e-9; s += pitch) rows.push(s);
  }
  rows.sort((a, b) => a - b);
  const kept = rows.filter((s, i) => i === 0 || s - rows[i - 1] > pitch * 0.6);
  kept.forEach((s, i) => {
    const s0 = s - slot / 2;
    const s1 = s + slot / 2;
    const box = (v0, v1) => [[s0, v0], [s1, v0], [s1, v1], [s0, v1]];
    if (i % 2 === 0) {
      for (let k = 0; k < n; k++) holes.push(box(k * P + bridge / 2, (k + 1) * P - bridge / 2));
    } else {
      const edge = P / 2 - bridge / 2;
      if (edge > 0.5) {
        notches.push({ s, w: slot, depth: edge, edge: 0 });
        notches.push({ s, w: slot, depth: edge, edge: 1 });
      }
      for (let k = 0; k < n - 1; k++) {
        holes.push(box(k * P + P / 2 + bridge / 2, (k + 1) * P + P / 2 - bridge / 2));
      }
    }
  });
  return { holes, notches, rows: kept.length, pitch, period: P };
}

export const _test = { clipX, TAU };
