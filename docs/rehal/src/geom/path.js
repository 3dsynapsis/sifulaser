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
 * Offset a closed ring so the region it encloses grows by `d` all round,
 * whichever way the ring happens to be wound.
 *
 * offsetPolygon walks the outward normals of a *counter-clockwise* ring, so on a
 * clockwise one - which is how a counter comes out of the outliner - the sign is
 * reversed, and a call meant to shrink a hole opens it up instead. Kerf
 * compensation is asking "move this edge out of the material"; it must not have
 * to know which kind of ring it was handed to get the answer right.
 */
export function growRing(pts, d) {
  if (!(Math.abs(d) > 1e-9)) return dedupe(pts);
  return offsetPolygon(pts, isCCW(pts) ? d : -d);
}

/** Even-odd point-in-polygon on a closed ring of [x, y] pairs. */
export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1])
        && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Sort a flat list of rings into solids, each with the holes that belong to it.
 *
 * Winding is not enough to decide this. A welded name arrives as the lettering,
 * the counters inside it and any piece that came away loose, all in one list
 * with no record of which contains which - so containment is counted instead. An
 * odd nesting depth is a hole, an even one is solid, which also gets the awkward
 * case right: the island inside the counter of an 'a' is at depth two and comes
 * back solid, because that is what drops out of the sheet.
 *
 * This lives here rather than in the 3D view because it is ring arithmetic with
 * no WebGL in it, and the view is the one place a node test cannot reach.
 */
export function nestRings(rings) {
  const valid = rings.filter((r) => r && r.length > 2);
  const depth = valid.map((r) => {
    let d = 0;
    for (const other of valid) {
      if (other !== r && pointInRing(r[0], other)) d++;
    }
    return d;
  });
  const solids = [];
  valid.forEach((r, i) => {
    if (depth[i] % 2 === 0) solids.push({ ring: r, holes: [] });
  });
  valid.forEach((r, i) => {
    if (depth[i] % 2 === 0) return;
    // A ring can sit inside several solids at once; it belongs to the tightest
    // one, or a counter is punched out of the whole piece standing behind it.
    let best = null;
    for (const s of solids) {
      if (!pointInRing(r[0], s.ring)) continue;
      if (!best || Math.abs(area(s.ring)) < Math.abs(area(best.ring))) best = s;
    }
    if (best) best.holes.push(r);
  });
  return solids;
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
