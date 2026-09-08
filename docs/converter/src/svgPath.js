// Reading an SVG "d" attribute, and reading back an SVG this tool wrote.
//
// Pure text and arithmetic - no DOM - so both halves can be tested in node.
//
// Why a path parser at all, when the Adjuster gets curves out of an SVG for
// free through getPointAtLength? Because that route samples. It turns every
// bezier into a few hundred straight segments at a tolerance measured in the
// file's own viewBox units, which means the same drawing exported at two
// different viewBox scales comes out at two different fidelities, and it throws
// away the open/closed distinction on the way. For a tool whose one promise is
// that it changes the container and not the drawing, reading the curve is the
// only honest option: an SVG "C", a PDF "c" and a DXF spline span are all the
// same four points, so a curve read here survives to any output untouched.
//
// Coordinates come out in the SVG's own user units, Y DOWN, exactly as written.
// Turning them into millimetres and flipping to y-up happens once, above.

import { svgArcToCubics } from './geom/bezier.js';

const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const CMD = /[MmLlHhVvCcSsQqTtAaZz]/;

/** "M 0 0 L 10 0" -> the command letters and their numbers, in order. */
function tokenizePath(d) {
  const out = [];
  const s = String(d || '');
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (CMD.test(ch)) {
      out.push({ cmd: ch, args: [] });
      i++;
      continue;
    }
    if (!out.length) { i++; continue; }
    NUM.lastIndex = i;
    const m = NUM.exec(s);
    if (!m || m.index !== i) { i++; continue; }
    out[out.length - 1].args.push(parseFloat(m[0]));
    i = NUM.lastIndex;
  }
  return out;
}

/**
 * A "d" attribute as subpaths.
 *
 * Returns Array<{ start: [x, y], segs: Seg[], closed: boolean }> in SVG user
 * units, y-down. Each Z closes the subpath it appears in AND returns the pen to
 * that subpath's start, which is what the specification says and what catches
 * people out: "M a ... Z L b" draws the L from a, not from wherever Z landed.
 *
 * `transform` is an optional [a, b, c, d, e, f] matrix applied to every control
 * point - the element's own CTM, so nested <g transform> comes out right
 * without going anywhere near the browser's path maths.
 */
export function parsePathData(d, transform = null) {
  const toks = tokenizePath(d);
  const T = transform;
  const ap = (x, y) => (T ? [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]] : [x, y]);

  const subs = [];
  let cur = null;         // current subpath
  let px = 0; let py = 0; // pen, in raw user units (pre-transform)
  let sx = 0; let sy = 0; // subpath start, raw
  let lastC = null;       // previous cubic's second handle, raw - for S/s
  let lastQ = null;       // previous quadratic's control point, raw - for T/t

  const open = (x, y) => {
    cur = { start: ap(x, y), segs: [], closed: false };
    subs.push(cur);
    sx = x; sy = y;
  };
  const lineTo = (x, y) => {
    if (!cur) open(px, py);
    const p = ap(x, y);
    cur.segs.push(['L', p[0], p[1]]);
  };
  const cubicTo = (x1, y1, x2, y2, x, y) => {
    if (!cur) open(px, py);
    const a = ap(x1, y1); const b = ap(x2, y2); const c = ap(x, y);
    cur.segs.push(['C', a[0], a[1], b[0], b[1], c[0], c[1]]);
  };

  for (const t of toks) {
    const rel = t.cmd === t.cmd.toLowerCase();
    const a = t.args;
    const up = t.cmd.toUpperCase();
    let k = 0;
    if (up === 'Z') {
      if (cur) {
        cur.closed = true;
        px = sx; py = sy;
      }
      // A following command starts a new subpath from the closed one's start.
      cur = null;
      lastC = null; lastQ = null;
      continue;
    }
    if (up === 'M') {
      // The first pair is a moveto; every pair after it is an implicit lineto.
      while (k + 1 < a.length) {
        const x = rel ? px + a[k] : a[k];
        const y = rel ? py + a[k + 1] : a[k + 1];
        if (k === 0) open(x, y);
        else lineTo(x, y);
        px = x; py = y;
        k += 2;
      }
      lastC = null; lastQ = null;
      continue;
    }
    while (k < a.length) {
      if (up === 'L') {
        const x = rel ? px + a[k] : a[k];
        const y = rel ? py + a[k + 1] : a[k + 1];
        lineTo(x, y); px = x; py = y; k += 2;
        lastC = null; lastQ = null;
      } else if (up === 'H') {
        const x = rel ? px + a[k] : a[k];
        lineTo(x, py); px = x; k += 1;
        lastC = null; lastQ = null;
      } else if (up === 'V') {
        const y = rel ? py + a[k] : a[k];
        lineTo(px, y); py = y; k += 1;
        lastC = null; lastQ = null;
      } else if (up === 'C') {
        const x1 = rel ? px + a[k] : a[k];
        const y1 = rel ? py + a[k + 1] : a[k + 1];
        const x2 = rel ? px + a[k + 2] : a[k + 2];
        const y2 = rel ? py + a[k + 3] : a[k + 3];
        const x = rel ? px + a[k + 4] : a[k + 4];
        const y = rel ? py + a[k + 5] : a[k + 5];
        cubicTo(x1, y1, x2, y2, x, y);
        lastC = [x2, y2]; lastQ = null; px = x; py = y; k += 6;
      } else if (up === 'S') {
        // The first handle is the previous one reflected through the pen.
        const x1 = lastC ? 2 * px - lastC[0] : px;
        const y1 = lastC ? 2 * py - lastC[1] : py;
        const x2 = rel ? px + a[k] : a[k];
        const y2 = rel ? py + a[k + 1] : a[k + 1];
        const x = rel ? px + a[k + 2] : a[k + 2];
        const y = rel ? py + a[k + 3] : a[k + 3];
        cubicTo(x1, y1, x2, y2, x, y);
        lastC = [x2, y2]; lastQ = null; px = x; py = y; k += 4;
      } else if (up === 'Q') {
        const qx = rel ? px + a[k] : a[k];
        const qy = rel ? py + a[k + 1] : a[k + 1];
        const x = rel ? px + a[k + 2] : a[k + 2];
        const y = rel ? py + a[k + 3] : a[k + 3];
        cubicTo(px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py),
          x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
        lastQ = [qx, qy]; lastC = null; px = x; py = y; k += 4;
      } else if (up === 'T') {
        const qx = lastQ ? 2 * px - lastQ[0] : px;
        const qy = lastQ ? 2 * py - lastQ[1] : py;
        const x = rel ? px + a[k] : a[k];
        const y = rel ? py + a[k + 1] : a[k + 1];
        cubicTo(px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py),
          x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
        lastQ = [qx, qy]; lastC = null; px = x; py = y; k += 2;
      } else if (up === 'A') {
        const rx = a[k]; const ry = a[k + 1]; const rot = a[k + 2];
        const large = a[k + 3] !== 0; const sweep = a[k + 4] !== 0;
        const x = rel ? px + a[k + 5] : a[k + 5];
        const y = rel ? py + a[k + 6] : a[k + 6];
        const cs = svgArcToCubics(px, py, rx, ry, rot, large, sweep, x, y);
        if (cs === null) lineTo(x, y);
        else for (const c of cs) cubicTo(c[0], c[1], c[2], c[3], c[4], c[5]);
        lastC = null; lastQ = null; px = x; py = y; k += 7;
      } else {
        break;
      }
    }
  }
  return subs.filter((s) => s.segs.length || s.closed);
}

// ---------------------------------------------------------------------------

/**
 * Read back an SVG THIS TOOL WROTE.
 *
 * This is not a general SVG reader and must never be used as one. It knows the
 * exact shape of src/export.js's output - one <g> per layer, no transforms, no
 * <defs>, no <use>, no CSS - and nothing else. A stranger's file goes through
 * importSvg.js, which has a browser under it.
 *
 * It exists for two reasons. The right-hand preview has to be drawn from the
 * bytes that were actually produced, or it is a picture of the input pretending
 * to be a picture of the output. And a round-trip test that goes through the
 * browser is a test that cannot run in node.
 *
 * Returns { paths, layers } in millimetres, y-up - the internal convention -
 * because that is what our own writer emits, one user unit to the millimetre.
 */
export function readOwnSvg(text) {
  const src = String(text || '');
  const layers = [];
  const paths = [];
  const gRe = /<g\b([^>]*)>([\s\S]*?)<\/g>/g;
  const attr = (tag, name) => {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
    return m ? m[1] : null;
  };
  let g;
  let any = false;
  while ((g = gRe.exec(src))) {
    any = true;
    const head = g[1];
    const name = attr(head, 'data-layer') || attr(head, 'id') || '0';
    const stroke = attr(head, 'stroke');
    const fill = attr(head, 'fill');
    const li = layers.length;
    layers.push({ name, colour: stroke && stroke !== 'none' ? stroke : '#000000' });
    collectPaths(g[2], li, stroke, fill, paths);
  }
  if (!any) collectPaths(src, 0, null, null, paths);
  if (!layers.length) layers.push({ name: '0', colour: '#000000' });
  return { paths, layers };
}

function collectPaths(chunk, li, stroke, fill, out) {
  const pRe = /<path\b([^>]*?)\/?>/g;
  let m;
  while ((m = pRe.exec(chunk))) {
    const dm = m[1].match(/\bd\s*=\s*"([^"]*)"/i);
    if (!dm) continue;
    const ownStroke = m[1].match(/\bstroke\s*=\s*"([^"]*)"/i);
    const ownFill = m[1].match(/\bfill\s*=\s*"([^"]*)"/i);
    for (const sub of parsePathData(dm[1])) {
      out.push({
        // Our own writer negates y on the way out, so reading it back negates
        // again and the numbers land exactly where they started.
        start: [sub.start[0], -sub.start[1]],
        segs: sub.segs.map((s) => (s[0] === 'C'
          ? ['C', s[1], -s[2], s[3], -s[4], s[5], -s[6]]
          : ['L', s[1], -s[2]])),
        closed: sub.closed,
        layer: li,
        stroke: (ownStroke ? ownStroke[1] : stroke) || null,
        fill: (ownFill ? ownFill[1] : fill) || null,
      });
    }
  }
}
