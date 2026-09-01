// Geometry primitives shared by the panel builder, the 2D editor and the SVG writer.
// Everything is in millimetres, y-up, contours counter-clockwise.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };

export function area(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a / 2;
}

export const isCCW = (pts) => area(pts) > 0;
export const toCCW = (pts) => (isCCW(pts) ? pts : pts.slice().reverse());

/** Drop consecutive duplicates (and the closing duplicate) so offsetting stays stable. */
export function dedupe(pts, eps = 1e-7) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push(p);
  }
  while (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps) out.pop();
    else break;
  }
  return out;
}

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function bboxOfMany(lists) {
  return bbox(lists.flat());
}

/**
 * Thin a sampled contour down to the points that carry its shape.
 *
 * The SVG importer samples every shape with getPointAtLength at a fixed
 * tolerance in the SOURCE drawing's units, which knows nothing about how big the
 * thing will end up. A clipart suitcase drawn on a 100-unit grid arrives with
 * about a thousand points, and once it is scaled onto a 20 mm tag those points
 * are seventy microns apart - a fifth of the kerf. They are not detail, they are
 * a thousand line segments the controller has to plan, sort and travel between
 * to draw a rounded rectangle, and a thousand coordinate pairs in every saved
 * design.
 *
 * Ramer-Douglas-Peucker: keep the two ends, find the point furthest from the
 * line between them, and if it is further than `eps` keep it and recurse on both
 * halves. `eps` is in the same units as the points, so the caller sets it from
 * the size the artwork will actually be cut at rather than from the size it was
 * drawn at.
 *
 * Iterative rather than recursive - a contour can arrive with several thousand
 * points and a deep recursion on a pathological one would blow the stack in the
 * middle of an import.
 */
export function simplify(pts, eps) {
  const n = pts.length;
  if (n < 3 || !(eps > 0)) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const norm2 = dx * dx + dy * dy;
    let worst = -1;
    let worstAt = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (norm2 < 1e-18) {
        // The two ends coincide, so "distance to the line" is undefined and the
        // radius from the point they share is the honest measure instead.
        d = Math.hypot(px - ax, py - ay);
      } else {
        d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / Math.sqrt(norm2);
      }
      if (d > worst) { worst = d; worstAt = i; }
    }
    if (worst > eps) {
      keep[worstAt] = 1;
      stack.push([a, worstAt], [worstAt, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

export function translate(pts, dx, dy) {
  return pts.map(([x, y]) => [x + dx, y + dy]);
}

/**
 * Offset a closed polygon by `d` along its outward normals (positive grows a CCW
 * contour). Adjacent offset edges are re-intersected; near-parallel joins fall back
 * to the bisector so the routine never blows up on the rectilinear panel outlines.
 */
export function offsetPolygon(pts, d) {
  const p = dedupe(pts);
  if (!p.length || Math.abs(d) < 1e-9) return p;
  const n = p.length;
  const dir = [], nrm = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const u = norm(sub(b, a));
    dir.push(u);
    nrm.push([u[1], -u[0]]); // outward for a CCW ring
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const a0 = add(p[i], mul(nrm[prev], d)); // point on the offset of edge prev
    const a1 = add(p[i], mul(nrm[i], d));    // point on the offset of edge i
    const cross = dir[prev][0] * dir[i][1] - dir[prev][1] * dir[i][0];
    if (Math.abs(cross) < 1e-6) { out.push(a1); continue; }
    // intersect line(a0, dir[prev]) with line(a1, dir[i])
    const diff = sub(a1, a0);
    const t = (diff[0] * dir[i][1] - diff[1] * dir[i][0]) / cross;
    const hit = add(a0, mul(dir[prev], t));
    const miter = len(sub(hit, p[i]));
    out.push(miter > Math.abs(d) * 4 ? a1 : hit);
  }
  return out;
}

/**
 * Where two segments cross, or null. Endpoints excluded, so a shared vertex
 * between consecutive segments is not a crossing.
 */
function segmentCross(a1, a2, b1, b2) {
  const rx = a2[0] - a1[0];
  const ry = a2[1] - a1[1];
  const sx = b2[0] - b1[0];
  const sy = b2[1] - b1[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null; // parallel
  const qpx = b1[0] - a1[0];
  const qpy = b1[1] - a1[1];
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  const E = 1e-9;
  if (t <= E || t >= 1 - E || u <= E || u >= 1 - E) return null;
  return [a1[0] + rx * t, a1[1] + ry * t];
}

/**
 * Cut the loops out of a contour that has folded through itself.
 *
 * offsetPolygon walks each edge's normal and re-intersects neighbours, which is
 * exact for a convex corner and wrong at a sharp one: the miter runs away, the
 * clamp that stops it leaves a zigzag, and on a shape with a real point - the
 * bottom of a heart, the apex of a triangle - the inset border comes out as a
 * bowtie crossing itself. A laser will burn that bowtie exactly as drawn.
 *
 * Where two segments cross, the contour between them is a loop. Cutting it out
 * at the crossing point and keeping whichever half has the larger area leaves
 * the border the offset was meant to be. O(n^2) per pass on a couple of hundred
 * points, a few passes, once per rebuild - which is nothing next to being
 * correct.
 */
export function unloop(pts, maxPasses = 8) {
  let ring = dedupe(pts);
  for (let pass = 0; pass < maxPasses; pass++) {
    const n = ring.length;
    if (n < 4) break;
    let cut = null;
    for (let i = 0; i < n && !cut; i++) {
      const a1 = ring[i];
      const a2 = ring[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        // The first and last segments share a vertex through the wrap.
        if (i === 0 && j === n - 1) continue;
        const p = segmentCross(a1, a2, ring[j], ring[(j + 1) % n]);
        if (p) { cut = { i, j, p }; break; }
      }
    }
    if (!cut) break;
    const inner = [cut.p, ...ring.slice(cut.i + 1, cut.j + 1)];
    const outer = [cut.p, ...ring.slice(cut.j + 1), ...ring.slice(0, cut.i + 1)];
    ring = Math.abs(area(outer)) >= Math.abs(area(inner)) ? outer : inner;
  }
  return dedupe(ring);
}

/** Circle / ellipse as a polygon, CCW. */
export function ellipse(cx, cy, rx, ry, seg = 64) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return pts;
}

export function rect(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** Axis-aligned rectangle with equal corner radii, CCW. */
export function roundedRect(x, y, w, h, r, seg = 8) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (rr < 1e-6) return rect(x, y, w, h);
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  corner(x + w - rr, y + rr, -Math.PI / 2);
  corner(x + w - rr, y + h - rr, 0);
  corner(x + rr, y + h - rr, Math.PI / 2);
  corner(x + rr, y + rr, Math.PI);
  return dedupe(pts);
}

export function star(cx, cy, rOuter, rInner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

export function regularPolygon(cx, cy, r, sides = 3) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

export function rotatePts(pts, cx, cy, deg) {
  if (!deg) return pts;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
}

const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Serialise one closed ring to an SVG path fragment. */
export function ringToPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${fmt(pts[i][0])} ${fmt(pts[i][1])}`;
  return d + 'Z';
}

/** Serialise an outline plus its holes to a single evenodd path. */
export function ringsToPath(rings) {
  return rings.map(ringToPath).filter(Boolean).join(' ');
}

export { fmt };
