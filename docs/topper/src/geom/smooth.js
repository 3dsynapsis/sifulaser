// Turning Hershey's polygons back into curves.
//
// Hershey digitised every glyph as straight segments, so a round letter is a
// polygon. At 10 mm nobody notices; at 100 mm the facets are obvious, and the
// reference tools that use real outline fonts stay smooth at any size.
//
// Fitting a Catmull-Rom spline through the existing points fixes it without
// moving the skeleton: the curve passes through every original vertex, so the
// letterform is unchanged - only the space between the points stops being flat.
//
// The one thing that must not be smoothed is a real corner. The turn angle
// tells them apart: measured across the whole font, curve sampling lands under
// 40 degrees, there is a gap at 60-80, and genuine corners (the foot of an L,
// the cusp where a script stroke reverses) sit at 80 and above. So the polyline
// is split at anything sharper than the threshold and each run is smoothed on
// its own, leaving corners as corners.

export const CORNER_DEG = 60;

const EPS = 1e-9;

/** Turn angle at b, in degrees: 0 is straight on, 180 is a full reversal. */
function turnAt(ax, ay, bx, by, cx, cy) {
  const d = Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax);
  const deg = (d * 180) / Math.PI;
  return Math.abs((((deg + 180) % 360) + 360) % 360 - 180);
}

/** Drop points that repeat, which would make the tangents blow up. */
function dedupe(flat) {
  const out = [];
  for (let k = 0; k < flat.length; k += 2) {
    const n = out.length;
    if (n >= 2 && Math.abs(out[n - 2] - flat[k]) < EPS
      && Math.abs(out[n - 1] - flat[k + 1]) < EPS) continue;
    out.push(flat[k], flat[k + 1]);
  }
  return out;
}

/**
 * Convert one flat [x,y,...] polyline into drawing commands.
 * Returns { start: [x,y], cmds: [['L',x,y] | ['C',c1x,c1y,c2x,c2y,x,y]] }
 * or null when there is nothing to draw.
 */
export function toSegments(flat, { cornerDeg = CORNER_DEG, smooth = true } = {}) {
  const p = dedupe(flat);
  const n = p.length / 2;
  if (n < 2) return null;

  const start = [p[0], p[1]];
  const cmds = [];
  const L = (i) => cmds.push(['L', p[i * 2], p[i * 2 + 1]]);

  if (!smooth || n === 2) {
    for (let i = 1; i < n; i++) L(i);
    return { start, cmds };
  }

  // A loop that returns to its start (Hershey draws 'O' that way) has no ends,
  // so its tangents should wrap rather than flatten out.
  const closed = n > 3
    && Math.abs(p[0] - p[(n - 1) * 2]) < EPS
    && Math.abs(p[1] - p[(n - 1) * 2 + 1]) < EPS;

  // Corner flags for the interior vertices.
  const corner = new Array(n).fill(false);
  for (let i = 1; i < n - 1; i++) {
    corner[i] = turnAt(
      p[(i - 1) * 2], p[(i - 1) * 2 + 1],
      p[i * 2], p[i * 2 + 1],
      p[(i + 1) * 2], p[(i + 1) * 2 + 1],
    ) > cornerDeg;
  }
  if (closed) {
    // The join is an interior vertex too; judge it the same way.
    const t = turnAt(
      p[(n - 2) * 2], p[(n - 2) * 2 + 1],
      p[0], p[1],
      p[2], p[3],
    );
    if (t > cornerDeg) { corner[0] = true; corner[n - 1] = true; }
  }

  // Split into runs at the corners; each run is smoothed independently.
  const runs = [];
  let run = [0];
  for (let i = 1; i < n; i++) {
    run.push(i);
    if (corner[i] && i < n - 1) {
      runs.push(run);
      run = [i];
    }
  }
  runs.push(run);

  const wrap = closed && !corner[0];
  for (const r of runs) {
    if (r.length === 2) { L(r[1]); continue; }
    const at = (j) => {
      const i = r[j];
      return [p[i * 2], p[i * 2 + 1]];
    };
    for (let j = 0; j < r.length - 1; j++) {
      const p1 = at(j);
      const p2 = at(j + 1);
      // Neighbours outside the run: wrap on a closed loop, otherwise repeat the
      // end point, which gives the run a natural flat-ish start and finish.
      const p0 = j > 0 ? at(j - 1)
        : wrap ? [p[(n - 2) * 2], p[(n - 2) * 2 + 1]] : p1;
      const p3 = j + 2 < r.length ? at(j + 2)
        : wrap ? [p[2], p[3]] : p2;
      cmds.push(['C',
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1]]);
    }
  }
  return { start, cmds };
}

/** Every polyline as segments, skipping anything degenerate. */
export function pathsToSegments(paths, opts) {
  const out = [];
  for (const flat of paths) {
    const s = toSegments(flat, opts);
    if (s && s.cmds.length) out.push(s);
  }
  return out;
}

/** How many of the commands ended up as curves - used by the tests. */
export function curveCount(segs) {
  let n = 0;
  for (const s of segs) for (const c of s.cmds) if (c[0] === 'C') n++;
  return n;
}
