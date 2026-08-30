// PDF writer. The same puzzle, the same cutting order, in the other format.
//
// The geometry here lives as SVG path data rather than as points, so this reads
// that back rather than re-deriving it - two writers working out the same knobs
// from the same seed by different routes is exactly how two exports of one
// puzzle drift apart.
//
// Two things have to be handled that the SVG gets for free:
//
//   - Arcs. The border's rounded corners are `A` commands, and PDF has no arc
//     operator at all. They are converted to cubic Béziers, which PDF does have.
//     A quarter circle approximated this way is off by about 0.03% of the radius
//     - some thousandths of a millimetre on a 2 mm corner, far under the beam.
//   - The y axis. SVG counts down the page and PDF counts up it, so every
//     coordinate is flipped against the puzzle's height on the way through.

import { LAYERS } from './exportSvg.js';

const MM_TO_PT = 72 / 25.4;

/** UTF-8 bytes, not characters - /Length and the xref offsets are byte counts. */
export function byteLength(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i);
    if (c > 0xffff) { n += 4; i++; } else if (c > 0x7ff) n += 3;
    else if (c > 0x7f) n += 2;
    else n += 1;
  }
  return n;
}

const pdfString = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`);

const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/**
 * Split path data into [command, ...numbers] steps.
 *
 * Only what this tool actually emits: M, L, C, A and Z, all absolute. Anything
 * else would be silently mis-drawn, so it throws instead - a puzzle that fails
 * to export is a bug report, a puzzle that exports wrong is a wasted sheet.
 */
export function parsePath(d) {
  const out = [];
  const re = /([MLCAZmlcaz])([^MLCAZmlcaz]*)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1];
    if (cmd !== cmd.toUpperCase()) {
      throw new Error(`relative path command "${cmd}" is not supported`);
    }
    const nums = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (cmd === 'Z') { out.push(['Z']); continue; }
    const size = { M: 2, L: 2, C: 6, A: 7 }[cmd];
    for (let i = 0; i + size <= nums.length; i += size) {
      // A repeated coordinate run after M means an implicit L, which is what
      // SVG says and what a reader would do.
      out.push([i && cmd === 'M' ? 'L' : cmd, ...nums.slice(i, i + size)]);
    }
  }
  return out;
}

/**
 * One SVG elliptical arc as a list of cubic Béziers.
 *
 * The endpoint-to-centre conversion in the SVG specification's implementation
 * notes, then the sweep is cut into pieces of at most a quarter turn - past that
 * a single cubic stops being a good fit for a circle.
 */
export function arcToCurves(x1, y1, rx, ry, deg, large, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  if (!rx || !ry) return [[x2, y2, x2, y2, x2, y2]];

  const phi = (deg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  let RX = Math.abs(rx);
  let RY = Math.abs(ry);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;

  // Radii too small to reach across the gap are scaled up until they just do,
  // which is what the specification asks for rather than an error.
  const lam = (x1p * x1p) / (RX * RX) + (y1p * y1p) / (RY * RY);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    RX *= s;
    RY *= s;
  }

  const num = RX * RX * RY * RY - RX * RX * y1p * y1p - RY * RY * x1p * x1p;
  const den = RX * RX * y1p * y1p + RY * RY * x1p * x1p;
  let co = den ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (large === sweep) co = -co;

  const cxp = (co * RX * y1p) / RY;
  const cyp = (-co * RY * x1p) / RX;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const ang = (ux, uy, vx, vy) => {
    const d = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let c = d ? (ux * vx + uy * vy) / d : 0;
    c = Math.max(-1, Math.min(1, c));
    const a = Math.acos(c);
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const t1 = ang(1, 0, (x1p - cxp) / RX, (y1p - cyp) / RY);
  let dt = ang((x1p - cxp) / RX, (y1p - cyp) / RY, (-x1p - cxp) / RX, (-y1p - cyp) / RY);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;

  const steps = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / steps;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const at = (t) => [
    cx + RX * Math.cos(t) * cos - RY * Math.sin(t) * sin,
    cy + RX * Math.cos(t) * sin + RY * Math.sin(t) * cos,
  ];
  const slope = (t) => [
    -RX * Math.sin(t) * cos - RY * Math.cos(t) * sin,
    -RX * Math.sin(t) * sin + RY * Math.cos(t) * cos,
  ];

  const curves = [];
  for (let i = 0; i < steps; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const [ax, ay] = at(a);
    const [bx, by] = at(b);
    const [adx, ady] = slope(a);
    const [bdx, bdy] = slope(b);
    curves.push([
      ax + alpha * adx, ay + alpha * ady,
      bx - alpha * bdx, by - alpha * bdy,
      bx, by,
    ]);
  }
  return curves;
}

/** Path data as PDF operators, y flipped against the sheet height. */
export function pathToOps(d, height) {
  const ops = [];
  const X = (v) => fmt(v * MM_TO_PT);
  const Y = (v) => fmt((height - v) * MM_TO_PT);
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const step of parsePath(d)) {
    const [cmd, ...n] = step;
    if (cmd === 'M') {
      [cx, cy] = n; [sx, sy] = n;
      ops.push(`${X(cx)} ${Y(cy)} m`);
    } else if (cmd === 'L') {
      [cx, cy] = n;
      ops.push(`${X(cx)} ${Y(cy)} l`);
    } else if (cmd === 'C') {
      ops.push(`${X(n[0])} ${Y(n[1])} ${X(n[2])} ${Y(n[3])} ${X(n[4])} ${Y(n[5])} c`);
      cx = n[4]; cy = n[5];
    } else if (cmd === 'A') {
      for (const c of arcToCurves(cx, cy, n[0], n[1], n[2], n[3], n[4], n[5], n[6])) {
        ops.push(`${X(c[0])} ${Y(c[1])} ${X(c[2])} ${Y(c[3])} ${X(c[4])} ${Y(c[5])} c`);
      }
      cx = n[5]; cy = n[6];
    } else if (cmd === 'Z') {
      ops.push('h');
      cx = sx; cy = sy;
    }
  }
  return ops;
}

const RGB = {
  '#ff0000': '1 0 0 RG',
  '#0000ff': '0 0 1 RG',
  '#000000': '0 0 0 RG',
};

/**
 * The whole puzzle as a single-page PDF.
 *
 * The groups are written in cutting order, the same as the SVG: interior lines
 * first, border last. On a puzzle that order is not a preference - cut the
 * border first and the board is free of the sheet before the pieces are, so
 * every one of them shifts as it is released.
 */
export function puzzleToPdf(puzzle, opts = {}) {
  const o = { strokeWidth: 0.1, split: false, border: true, title: 'Puzzle', ...opts };
  const { width, height } = puzzle.params;

  const groups = o.split
    ? [{ L: LAYERS['cut-h'], d: puzzle.h }, { L: LAYERS['cut-v'], d: puzzle.v }]
    : [{ L: LAYERS.cut, d: `${puzzle.h}${puzzle.v}` }];
  if (o.border) groups.push({ L: LAYERS.border, d: puzzle.border });

  const ops = [`${fmt(o.strokeWidth * MM_TO_PT)} w`, '1 J', '1 j'];
  for (const g of groups) {
    if (!g.d || !g.d.trim()) continue;
    const body = pathToOps(g.d.trim(), height);
    if (!body.length) continue;
    // Colour before the path is started: a graphics-state operator part way
    // through path construction is not legal.
    ops.push(RGB[g.L.color] || '0 0 0 RG');
    ops.push(...body);
    // One stroke for the whole group. `S` paints every subpath of the current
    // path, so a stroke per line would be the same picture and a much bigger
    // file.
    ops.push('S');
  }

  const stream = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(width * MM_TO_PT)} `
    + `${fmt(height * MM_TO_PT)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< /Title (${pdfString(o.title)}) /Creator (SifuLaser Puzzle Generator) >>`,
  ];

  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  return `${body}${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R `
    + `/Info ${objects.length} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
}
