// The picture the customer confirms before they trust the price: artwork in
// grey, cut lines in red, each piece labelled with its size.
//
// Built here as plain data (SVG path strings in millimetres, y DOWN, page
// /Rotate applied) so the worker can hand it over in one message and node can
// test it. PDF is y-up and SVG is y-down: an asymmetric "F" must not come out
// mirrored (QA plan C37), so the flip lives in exactly one function.
//
// /Rotate changes only the picture and which side is called width. It never
// changes an area or whether a piece fits the bed.

import { MM_PER_PT } from './cut.js';

const MAX_ART_POINTS = 150_000;

/** Page point (pt) -> view point (mm, y down), as a viewer shows the page. */
export function toView(x, y, rotate) {
  const X = x * MM_PER_PT, Y = y * MM_PER_PT;
  switch (rotate) {
    case 90: return [Y, X];
    case 180: return [-X, Y];
    case 270: return [-Y, -X];
    default: return [X, -Y];
  }
}

export function viewBox(bb, rotate) {
  const pts = [toView(bb[0], bb[1], rotate), toView(bb[2], bb[1], rotate), toView(bb[0], bb[3], rotate), toView(bb[2], bb[3], rotate)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const r2 = (v) => Math.round(v * 100) / 100;

export function pathD(flat, rotate, closed = true) {
  if (!flat || flat.length < 4) return '';
  let d = '';
  for (let i = 0; i < flat.length; i += 2) {
    const [x, y] = toView(flat[i], flat[i + 1], rotate);
    d += `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`;
  }
  return closed ? `${d}Z` : d;
}

export function buildPreview(read, pieces, rotate = 0, highlight = new Set()) {
  let budget = MAX_ART_POINTS;
  let art = '';
  let truncated = false;
  for (const p of read.paths) {
    for (const s of p.subs) {
      const n = s.pts.length / 2;
      if (n > budget) { truncated = true; break; }
      budget -= n;
      art += pathD(s.pts, rotate, s.closed);
    }
    if (truncated) break;
  }
  const out = pieces.map((pc, i) => ({
    d: pc.outlines.map((o) => pathD(o, rotate)).join(''),
    holesD: pc.holes.map((o) => pathD(o, rotate)).join(''),
    box: viewBox(pc.bb, rotate),
    highlight: highlight.has(i),
  }));
  let bounds = null;
  for (const pc of out) {
    const b = pc.box;
    bounds = bounds
      ? { x0: Math.min(bounds.x0, b.x), y0: Math.min(bounds.y0, b.y), x1: Math.max(bounds.x1, b.x + b.w), y1: Math.max(bounds.y1, b.y + b.h) }
      : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
  }
  return { art, truncated, pieces: out, bounds };
}
