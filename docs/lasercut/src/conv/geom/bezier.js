// Everything curved, turned into cubic beziers.
//
// The internal drawing holds exactly two kinds of segment - a straight line and
// a cubic bezier - and nothing else. Arcs, ellipses, quadratics, DXF bulges and
// B-splines all arrive at the front door and are converted here, once, on the
// way in. That is what lets all three writers stay simple: an SVG "C", a PDF
// "c" and a DXF SPLINE span are the same four points in the same order, so a
// curve travels from any input to any output without ever being sampled.
//
// The conversions below are exact where the maths allows it and stated where it
// does not:
//
//   quadratic -> cubic    exact, algebraically
//   bulge     -> cubic    a circular arc, cut at 90 degrees, then the standard
//                         k = 4/3 tan(theta/4) handles. Worst radial error over
//                         a 90 degree span is about 0.00027 r - at r = 500 mm
//                         that is 0.14 micrometres, which no laser can find.
//   arc/ellipse -> cubic  same, per 90 degree span
//   B-spline chain -> cubic   EXACT and free: see isBezierChain().
//   general B-spline -> line  NOT exact. de Boor plus subdivision to a stated
//                         tolerance. This is the only lossy path in the tool
//                         and the UI has to name it when it is taken.

const TAU = Math.PI * 2;

/** A quadratic's two control points as a cubic's. Exact. */
export function quadToCubic(p0, qx, qy, x, y) {
  return [
    p0[0] + (2 / 3) * (qx - p0[0]),
    p0[1] + (2 / 3) * (qy - p0[1]),
    x + (2 / 3) * (qx - x),
    y + (2 / 3) * (qy - y),
    x, y,
  ];
}

/**
 * A centre-parameterised elliptical arc as a chain of cubics.
 *
 * `rot` is the ellipse's x-axis rotation in radians, `a0` the start angle and
 * `sweep` the signed angle travelled - positive is counter-clockwise, which is
 * the direction DXF's ARC always goes from its code 50 to its code 51.
 *
 * Returns Array<[x1, y1, x2, y2, x, y]> - each entry is one cubic's two handles
 * and its endpoint, ready to become a 'C' seg.
 */
export function arcToCubics(cx, cy, rx, ry, rot, a0, sweep) {
  const out = [];
  if (!Number.isFinite(sweep) || sweep === 0) return out;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const d = sweep / n;
  const k = (4 / 3) * Math.tan(d / 4);
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  // One place that turns (u, v) on the unit circle into a real point, so the
  // ellipse's radii and rotation cannot be applied to the endpoints but missed
  // on the handles.
  const map = (u, v) => [
    cx + rx * u * cosR - ry * v * sinR,
    cy + rx * u * sinR + ry * v * cosR,
  ];
  let a = a0;
  for (let i = 0; i < n; i++) {
    const a1 = a + d;
    const c0 = Math.cos(a); const s0 = Math.sin(a);
    const c1 = Math.cos(a1); const s1 = Math.sin(a1);
    const p1 = map(c0 - k * s0, s0 + k * c0);
    const p2 = map(c1 + k * s1, s1 - k * c1);
    const p3 = map(c1, s1);
    out.push([p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]);
    a = a1;
  }
  return out;
}

/**
 * SVG's endpoint-parameterised arc ("A rx ry rot largeArc sweep x y") as cubics.
 * The conversion to centre form is the one in the SVG specification's appendix
 * F.6.5, including its two correction steps: a radius too small to reach the
 * endpoint is scaled up rather than rejected, and a zero radius degenerates to
 * a straight line, which is what the spec asks for.
 */
export function svgArcToCubics(x0, y0, rxIn, ryIn, rotDeg, largeArc, sweepFlag, x1, y1) {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return null; // caller draws a line instead
  if (x0 === x1 && y0 === y1) return [];
  const rot = (rotDeg * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const dx = (x0 - x1) / 2;
  const dy = (y0 - y1) / 2;
  const x1p = cosR * dx + sinR * dy;
  const y1p = -sinR * dx + cosR * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweepFlag) co = -co;
  const cxp = co * ((rx * y1p) / ry);
  const cyp = co * (-(ry * x1p) / rx);
  const cx = cosR * cxp - sinR * cyp + (x0 + x1) / 2;
  const cy = sinR * cxp + cosR * cyp + (y0 + y1) / 2;
  const ang = (ux, uy, vx, vy) => {
    const d = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let c = d === 0 ? 1 : (ux * vx + uy * vy) / d;
    c = Math.min(1, Math.max(-1, c));
    const a = Math.acos(c);
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const a0 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let sweep = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweepFlag && sweep > 0) sweep -= TAU;
  else if (sweepFlag && sweep < 0) sweep += TAU;
  return arcToCubics(cx, cy, rx, ry, rot, a0, sweep);
}

/**
 * The circle a DXF bulge describes, between two vertices.
 *
 * bulge = tan(theta / 4), where theta is the arc's included angle, and it
 * belongs to the segment LEAVING this vertex for the next one - it is a
 * property of the following edge, not of the point. On a closed polyline the
 * last vertex's bulge therefore applies to the closing edge back to vertex 0;
 * dropping it turns a rounded corner into a straight chord.
 *
 * The centre sits off the chord's midpoint by the apothem, along the chord's
 * LEFT normal, and the sign of the bulge carries through the tangent so a
 * negative bulge puts it on the other side. That sign is the whole game: get it
 * backwards and the arc bulges the wrong way, which is a drawing that still
 * looks entirely plausible and is wrong.
 */
export function bulgeArc(p0, p1, bulge) {
  const b = Number(bulge);
  if (!Number.isFinite(b) || b === 0) return null;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const chord = Math.hypot(dx, dy);
  if (chord === 0) return null;
  const theta = 4 * Math.atan(b);
  const r = chord / (2 * Math.sin(theta / 2));
  const h = (chord / 2) / Math.tan(theta / 2);
  // Left normal of the chord. With h positive (a positive bulge under a
  // half turn) the centre moves left, which is where a counter-clockwise arc
  // from p0 to p1 has to have it.
  const nx = -dy / chord;
  const ny = dx / chord;
  const cx = (p0[0] + p1[0]) / 2 + nx * h;
  const cy = (p0[1] + p1[1]) / 2 + ny * h;
  const a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
  return {
    cx, cy, r: Math.abs(r), a0, sweep: theta, sagitta: Math.abs(b) * chord / 2,
  };
}

/** The same arc, as cubics. Returns null when the bulge is not usable. */
export function bulgeToCubics(p0, p1, bulge) {
  const a = bulgeArc(p0, p1, bulge);
  if (!a) return null;
  return arcToCubics(a.cx, a.cy, a.r, a.r, 0, a.a0, a.sweep);
}

/** A point on one cubic. `c` is [x1, y1, x2, y2, x, y]. */
export function cubicPointAt(p0, c, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return [
    a * p0[0] + b * c[0] + d * c[2] + e * c[4],
    a * p0[1] + b * c[1] + d * c[3] + e * c[5],
  ];
}

/**
 * Where a cubic turns around, on either axis.
 *
 * This is why the bounding box in doc.js is computed and not guessed. The box
 * around a spline's control points CONTAINS the curve, so measuring that
 * overstates the drawing; the box around a bulged polyline's vertices misses
 * the arc that bulges outside the chord, so measuring that understates it. Both
 * are the obvious implementation and both are wrong, in opposite directions.
 * Solving B'(t) = 0 gives the two or four points that actually decide the size.
 */
export function cubicExtrema(p0, c) {
  const pts = [];
  for (const axis of [0, 1]) {
    const P0 = p0[axis];
    const P1 = c[axis];
    const P2 = c[axis + 2];
    const P3 = c[axis + 4];
    const a = -P0 + 3 * P1 - 3 * P2 + P3;
    const b = 2 * (P0 - 2 * P1 + P2);
    const k = P1 - P0;
    const roots = [];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) roots.push(-k / b);
    } else {
      const disc = b * b - 4 * a * k;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
      }
    }
    for (const t of roots) {
      if (t > 0 && t < 1) pts.push(cubicPointAt(p0, c, t));
    }
  }
  return pts;
}

/** de Casteljau split of one cubic at t; returns the two halves. */
function splitCubic(p0, c) {
  const p1 = [c[0], c[1]];
  const p2 = [c[2], c[3]];
  const p3 = [c[4], c[5]];
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a1 = m(p0, p1);
  const a2 = m(p1, p2);
  const a3 = m(p2, p3);
  const b1 = m(a1, a2);
  const b2 = m(a2, a3);
  const mid = m(b1, b2);
  return [
    { p0, c: [a1[0], a1[1], b1[0], b1[1], mid[0], mid[1]] },
    { p0: mid, c: [b2[0], b2[1], a3[0], a3[1], p3[0], p3[1]] },
  ];
}

/** How far the two handles stray from the chord - the flatness test. */
function cubicFlatness(p0, c) {
  const dx = c[4] - p0[0];
  const dy = c[5] - p0[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) {
    return Math.max(Math.hypot(c[0] - p0[0], c[1] - p0[1]),
      Math.hypot(c[2] - p0[0], c[3] - p0[1]));
  }
  const d1 = Math.abs((c[0] - p0[0]) * dy - (c[1] - p0[1]) * dx) / len;
  const d2 = Math.abs((c[2] - p0[0]) * dy - (c[3] - p0[1]) * dx) / len;
  return Math.max(d1, d2);
}

/**
 * One cubic as points, no closer together than the curve needs.
 *
 * Used for the previews and for measuring, never for writing a file - all three
 * writers carry the cubic itself.
 */
export function flattenCubic(p0, c, tol = 0.05, depth = 0) {
  if (depth > 18 || cubicFlatness(p0, c) <= tol) return [[c[4], c[5]]];
  const [L, R] = splitCubic(p0, c);
  return [
    ...flattenCubic(L.p0, L.c, tol, depth + 1),
    ...flattenCubic(R.p0, R.c, tol, depth + 1),
  ];
}

// ---------------------------------------------------------------------------
// B-splines

/**
 * Is this spline already a chain of beziers?
 *
 * A cubic B-spline whose knot vector is clamped at both ends (end multiplicity
 * degree + 1) and whose every interior knot repeats exactly `degree` times is
 * only C0 continuous at each interior knot - which is another way of saying its
 * control points ARE the bezier control points, three at a time, with the
 * fourth shared. No basis evaluation, no knot insertion, nothing to lose.
 *
 * This is not a rare special case. All 654 splines in the owner's own
 * modern-spline-mm.dxf are shaped exactly like this, because that is what a
 * vector drawing looks like after a CAD round trip. Recognising it is what
 * makes DXF -> SVG -> DXF give back the same numbers.
 */
export function isBezierChain(degree, knots, nCtrl) {
  if (degree !== 3) return false;
  if (!Array.isArray(knots) || knots.length !== nCtrl + degree + 1) return false;
  if ((nCtrl - 1) % 3 !== 0) return false;
  const eq = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  for (let i = 1; i < 4; i++) {
    if (!eq(knots[i], knots[0])) return false;
    if (!eq(knots[knots.length - 1 - i], knots[knots.length - 1])) return false;
  }
  // Every interior knot in a run of exactly three.
  let i = 4;
  const end = knots.length - 4;
  while (i < end) {
    let n = 1;
    while (i + n < end && eq(knots[i + n], knots[i])) n++;
    if (n !== 3) return false;
    i += n;
  }
  return true;
}

/** de Boor evaluation of a (possibly rational) B-spline at parameter t. */
export function deBoorPoint(degree, knots, ctrl, weights, t) {
  const n = ctrl.length;
  let k = degree;
  while (k < n - 1 && t >= knots[k + 1]) k++;
  const w = weights && weights.length === n ? weights : null;
  const d = [];
  for (let j = 0; j <= degree; j++) {
    const idx = k - degree + j;
    const wi = w ? w[idx] : 1;
    d.push([ctrl[idx][0] * wi, ctrl[idx][1] * wi, wi]);
  }
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = k - degree + j;
      const den = knots[i + degree + 1 - r] - knots[i];
      const a = den === 0 ? 0 : (t - knots[i]) / den;
      d[j] = [
        (1 - a) * d[j - 1][0] + a * d[j][0],
        (1 - a) * d[j - 1][1] + a * d[j][1],
        (1 - a) * d[j - 1][2] + a * d[j][2],
      ];
    }
  }
  const p = d[degree];
  return p[2] === 0 ? [p[0], p[1]] : [p[0] / p[2], p[1] / p[2]];
}

/**
 * A B-spline that is NOT a bezier chain, as points.
 *
 * This is the tool's only lossy conversion. The parameter range is bisected
 * wherever the midpoint of the curve strays further than `tol` from the chord,
 * so the result follows the real curve rather than a uniform sampling of it -
 * but it is line segments, and a caller who takes this path owes the user a
 * sentence saying so and naming the number.
 */
export function flattenSpline(degree, knots, ctrl, weights, tol = 0.02) {
  const t0 = knots[degree];
  const t1 = knots[ctrl.length];
  if (!(t1 > t0)) return ctrl.slice();
  const at = (t) => deBoorPoint(degree, knots, ctrl, weights, Math.min(t, t1 - 1e-12));
  const out = [at(t0)];
  const walk = (ta, pa, tb, pb, depth) => {
    const tm = (ta + tb) / 2;
    const pm = at(tm);
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    const len = Math.hypot(dx, dy);
    const dev = len < 1e-12
      ? Math.hypot(pm[0] - pa[0], pm[1] - pa[1])
      : Math.abs((pm[0] - pa[0]) * dy - (pm[1] - pa[1]) * dx) / len;
    if (depth >= 16 || dev <= tol) {
      out.push(pb);
      return;
    }
    walk(ta, pa, tm, pm, depth + 1);
    walk(tm, pm, tb, pb, depth + 1);
  };
  // Start with one span per knot interval so a long spline is not judged flat
  // on the strength of a single midpoint that happens to sit on the chord.
  const breaks = [t0];
  for (let i = degree + 1; i < ctrl.length; i++) {
    if (knots[i] > breaks[breaks.length - 1] + 1e-12 && knots[i] < t1) breaks.push(knots[i]);
  }
  breaks.push(t1);
  for (let i = 1; i < breaks.length; i++) {
    walk(breaks[i - 1], at(breaks[i - 1]), breaks[i], at(breaks[i]), 0);
  }
  return out;
}
