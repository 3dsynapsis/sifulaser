// Plane geometry shared by the PDF reader and cut-line detection.
// Matrices are PDF's [a b c d e f]; points are flat [x, y] pairs.

/** mul(ctm, M) means "apply M first, then ctm" - the order PDF's cm uses. */
export const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Parameters t in (0,1) where a cubic's x or y derivative is zero. */
export function cubicExtrema(p0, p1, p2, p3) {
  const ts = [];
  for (let k = 0; k < 2; k++) {
    const a = -p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k];
    const b = 2 * (p0[k] - 2 * p1[k] + p2[k]);
    const c = p1[k] - p0[k];
    const scale = Math.max(Math.abs(p0[k]), Math.abs(p1[k]), Math.abs(p2[k]), Math.abs(p3[k]), 1);
    if (Math.abs(a) < 1e-12 * scale) {
      if (Math.abs(b) > 1e-12 * scale) ts.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        ts.push((-b + s) / (2 * a), (-b - s) / (2 * a));
      }
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

export const bezierAt = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};

/** Even-odd ray cast against a flat [x0,y0,x1,y1,...] polygon. */
export function insidePoly(x, y, poly) {
  let c = false;
  const n = poly.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export const bbInside = (inner, outer, tol) => inner[0] >= outer[0] - tol && inner[1] >= outer[1] - tol
  && inner[2] <= outer[2] + tol && inner[3] <= outer[3] + tol;

export const bbOverlap = (a, b, tol = 0) => a[0] < b[2] - tol && b[0] < a[2] - tol && a[1] < b[3] - tol && b[1] < a[3] - tol;

export const bbIntersect = (a, b) => {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[0] < r[2] && r[1] < r[3] ? r : null;
};

export const bbUnion = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/**
 * Do two closed outlines CROSS? Proper crossings only: outlines that touch at a
 * point or run along a shared edge are not crossing (QA plan C25). Only the
 * segments near the overlap of the two boxes are compared, so two big outlines
 * that barely overlap stay cheap.
 */
export function outlinesCross(A, bbA, B, bbB) {
  const region = bbIntersect(bbA, bbB);
  if (!region) return false;
  const near = (P) => {
    const segs = [];
    for (let i = 0; i + 3 < P.length; i += 2) {
      const x0 = P[i], y0 = P[i + 1], x1 = P[i + 2], y1 = P[i + 3];
      if (Math.max(x0, x1) < region[0] || Math.min(x0, x1) > region[2] || Math.max(y0, y1) < region[1] || Math.min(y0, y1) > region[3]) continue;
      segs.push(i);
    }
    return segs;
  };
  const sa = near(A), sb = near(B);
  for (const i of sa) {
    const ax = A[i], ay = A[i + 1], bx = A[i + 2], by = A[i + 3];
    const la = Math.hypot(bx - ax, by - ay);
    if (la === 0) continue;
    for (const j of sb) {
      const cx = B[j], cy = B[j + 1], dx = B[j + 2], dy = B[j + 3];
      if (Math.max(ax, bx) < Math.min(cx, dx) || Math.max(cx, dx) < Math.min(ax, bx)
        || Math.max(ay, by) < Math.min(cy, dy) || Math.max(cy, dy) < Math.min(ay, by)) continue;
      const lb = Math.hypot(dx - cx, dy - cy);
      if (lb === 0) continue;
      const e = 1e-7 * la * lb + 1e-9;
      const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy);
      const o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
      const s = (v) => (v > e ? 1 : v < -e ? -1 : 0);
      if (s(o1) * s(o2) < 0 && s(o3) * s(o4) < 0) return true;
    }
  }
  return false;
}
