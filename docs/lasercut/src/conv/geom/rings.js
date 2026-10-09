// Three small ring helpers, lifted verbatim from
// 17_Template Adjuster/src/geom/refit.js (ringArea :38-44, ringBBox :46-55,
// boundsOf :57-70).
//
// They were copied rather than imported because refit.js is 896 lines of
// joinery inference - finger widths, slot detection, corner restoration - and
// this tool does none of that. Importing it to get twenty-five lines of
// bounding box would drag the whole thing into the vendored copy and invite
// the next person to reach for the rest of it.
//
// A ring here is Array<[x, y]>: an array of two-element arrays, never a flat
// [x0, y0, x1, y1]. Everything in this tool and in the Adjuster agrees on that
// shape, and mixing the two produces NaN in silence, because destructuring
// [x, y] out of a number gives undefined twice.

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
