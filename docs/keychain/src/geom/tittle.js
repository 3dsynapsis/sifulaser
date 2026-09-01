/**
 * Bring the dot of an i down onto the letter it belongs to.
 *
 * A tittle is a separate contour. On a page that is exactly right; on a piece
 * of acrylic it is a loose chip that falls out of the sheet, so the tool has to
 * tie it back with a connector, and that connector is the first thing anybody
 * looks at. Routing it to the nearest letter instead of across the topper made
 * it short. This makes it unnecessary.
 *
 * The dot is moved, not redrawn: down by the gap plus a bite into the stem, so
 * the two weld into one shape. It reads as a script joining up, which is what
 * the face is doing everywhere else anyway.
 *
 * Three guards, because this runs on every glyph of every face and must not
 * touch anything that is not a tittle:
 *
 *   - the contour has to be small next to the one it sits over, so a real
 *     counter or a second stroke is left alone
 *   - it has to be clear ABOVE it and overlap it horizontally, which a dot does
 *     and an accent trailing off to the side does not
 *   - the gap has to be small enough to close without the letter looking wrong.
 *     A high tittle, an umlaut, a Malay accent - anything held deliberately far
 *     off - is left where the designer put it, and gets a connector as before.
 *
 * Millimetres are never involved: everything is proportional to the glyph, so
 * it behaves the same at 8 cm as at 30 cm.
 */

const flatBBox = (r) => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    if (r[i] < x0) x0 = r[i];
    if (r[i] > x1) x1 = r[i];
    if (r[i + 1] < y0) y0 = r[i + 1];
    if (r[i + 1] > y1) y1 = r[i + 1];
  }
  return { x0, x1, y0, y1 };
};

const flatArea = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    a += r[j] * r[i + 1] - r[i] * r[j + 1];
  }
  return a / 2;
};

/** Shortest distance from a point to a closed flat ring. */
function pointToRing(px, py, r) {
  let best = Infinity;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const ax = r[j];
    const ay = r[j + 1];
    const dx = r[i] - ax;
    const dy = r[i + 1] - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0
      ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      : 0;
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/**
 * Shortest distance between two rings.
 *
 * Measured both ways round. One way alone is wrong whenever the two are sampled
 * differently - a dot is a curve carrying dozens of points, a stem is a
 * straight edge carrying two - and the sparse one would only ever be measured
 * at its corners.
 */
function ringGap(a, b) {
  let best = Infinity;
  for (let i = 0; i < a.length; i += 2) {
    const d = pointToRing(a[i], a[i + 1], b);
    if (d < best) best = d;
  }
  for (let i = 0; i < b.length; i += 2) {
    const d = pointToRing(b[i], b[i + 1], a);
    if (d < best) best = d;
  }
  return best;
}

/** How small a tittle is next to its stem, at most. */
const TITTLE_SHARE = 0.34;
/** How far above the letter a dot may float and still be pulled down. */
const TITTLE_REACH = 0.2;
/** How far into the stem it is pushed, as a share of the dot's own height. */
const TITTLE_BITE = 0.25;

export function weldTittles(rings) {
  if (!rings || rings.length < 2) return rings;

  const areas = rings.map(flatArea);
  const boxes = rings.map(flatBBox);
  const solids = [];
  for (let i = 0; i < rings.length; i++) if (areas[i] > 0) solids.push(i);
  if (solids.length < 2) return rings;

  let body = solids[0];
  for (const i of solids) if (areas[i] > areas[body]) body = i;

  const whole = boxes.reduce((acc, b) => ({
    y0: Math.min(acc.y0, b.y0), y1: Math.max(acc.y1, b.y1),
  }), { y0: Infinity, y1: -Infinity });
  const glyphH = whole.y1 - whole.y0;
  if (!(glyphH > 0)) return rings;

  const moved = rings.map((r) => r);
  let touched = false;

  for (const i of solids) {
    if (i === body) continue;
    const dot = boxes[i];
    const stem = boxes[body];
    if (areas[i] > areas[body] * TITTLE_SHARE) continue;
    if (dot.y0 <= stem.y1) continue;
    if (dot.x1 <= stem.x0 || dot.x0 >= stem.x1) continue;

    const gap = ringGap(rings[i], rings[body]);
    if (!(gap > 0) || gap > glyphH * TITTLE_REACH) continue;

    const dy = -(gap + (dot.y1 - dot.y0) * TITTLE_BITE);
    // The dot and anything nested in it - a tittle with a counter is unusual,
    // but a shape left behind while its hole moves is a hole in the wrong place.
    for (let k = 0; k < rings.length; k++) {
      const b = boxes[k];
      const inside = k === i || (areas[k] < 0
        && b.x0 >= dot.x0 && b.x1 <= dot.x1 && b.y0 >= dot.y0 && b.y1 <= dot.y1);
      if (!inside) continue;
      const src = moved[k];
      const out = new Array(src.length);
      for (let m = 0; m < src.length; m += 2) {
        out[m] = src[m];
        out[m + 1] = src[m + 1] + dy;
      }
      moved[k] = out;
      touched = true;
    }
  }

  return touched ? moved : rings;
}
