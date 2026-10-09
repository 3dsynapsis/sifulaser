// What the laser does with page 1, and how long it takes.
//
// Every painted path is sorted into one job:
//   cut      a hairline stroke (thinner than THICK_MM), or a filled shape that
//            IS a piece outline (the shape of the material itself)
//   score    a hairline stroke in blue: a vector line at MARK_SPEED, not cut
//   engrave  any other filled shape, a thick stroke, an image or a gradient
// White strokes and fills are paper, not laser work, and are ignored. So is
// anything in a hidden layer or lying outside every piece.
//
// Time follows the bridge's simulator (bridge/ui/index.html, segTime): each
// move accelerates from V0 to its speed and brakes back. A cut line only brakes
// at a real corner (sharper than CORNER_DEG), so a curve flattened into short
// segments is not charged as hundreds of stops. Engraving is raster: the head
// sweeps every scan line GAP apart from the first to the last mark on that line,
// which is how the controller engraves, so empty lines cost nothing and the
// width of a line is what matters.
//
// Units: page points in, millimetres and seconds out. Pure: runs in the worker
// and under node.

import { MM_PER_PT } from './cut.js';
import { bbOverlap, bbIntersect } from './geom.js';

export const MOTION = { vmax: 300, v0: 15, acc: 3000 }; // mm/s, mm/s, mm/s^2 (bridge defaults)
export const ENGRAVE = { speed: 200, gap: 0.1 };        // mm/s, mm between scan lines
export const MARK_SPEED = 100;                           // mm/s, score line
export const THICK_MM = 0.5;                             // a stroke this wide is artwork, engraved
const CORNER_DEG = 30;
const BACKGROUND_SHARE = 0.85; // a fill covering this much of a piece is its board colour
const WHITE = 0.98;
const MAX_SCAN_LINES = 3000; // sampled, then scaled to the real line count
const MAX_NN = 3000;         // nearest-neighbour ordering above this is file order

/** Seconds to move d mm at speed v, starting and ending at v0, accel a. */
export function segTime(d, v, v0 = MOTION.v0, a = MOTION.acc) {
  if (!(d > 0)) return 0;
  v = Math.max(v, 0.1);
  v0 = Math.min(Math.max(v0, 0), v);
  a = Math.max(a, 1);
  const dAcc = (v * v - v0 * v0) / (2 * a);
  if (2 * dAcc >= d) { const vp = Math.sqrt(v0 * v0 + a * d); return (2 * (vp - v0)) / a; }
  return (2 * (v - v0)) / a + (d - 2 * dAcc) / v;
}

const isWhite = (rgb) => !!rgb && rgb[0] >= WHITE && rgb[1] >= WHITE && rgb[2] >= WHITE;
export const isBlue = (rgb) => !!rgb && rgb[2] >= 0.5 && rgb[2] > rgb[0] + 0.25 && rgb[2] > rgb[1] + 0.15;

const bbOf = (pts) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < b[0]) b[0] = pts[i];
    if (pts[i + 1] < b[1]) b[1] = pts[i + 1];
    if (pts[i] > b[2]) b[2] = pts[i];
    if (pts[i + 1] > b[3]) b[3] = pts[i + 1];
  }
  return b;
};

/** A closed outline's points with the closing point added if it is missing. */
function closedPts(pts) {
  const n = pts.length;
  if (n >= 4 && (pts[0] !== pts[n - 2] || pts[1] !== pts[n - 1])) return [...pts, pts[0], pts[1]];
  return pts;
}

/**
 * Lengths (mm) of the runs between real corners. A run is driven as one move;
 * the head only brakes where the line turns by more than CORNER_DEG.
 */
function runsOf(pts, out) {
  const cosMax = Math.cos((CORNER_DEG * Math.PI) / 180);
  let run = 0, px = 0, py = 0, has = false, total = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const dx = (pts[i + 2] - pts[i]) * MM_PER_PT, dy = (pts[i + 3] - pts[i + 1]) * MM_PER_PT;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    const ux = dx / d, uy = dy / d;
    if (has && ux * px + uy * py < cosMax) { out.push(run); run = 0; }
    run += d; total += d;
    px = ux; py = uy; has = true;
  }
  if (run > 0) out.push(run);
  return total;
}

/** Same outline twice (a fill copy and a stroke copy) is cut once. */
function dupKey(bb, len) {
  const q = (v) => Math.round((v * MM_PER_PT) / 0.2);
  return `${q(bb[0])},${q(bb[1])},${q(bb[2])},${q(bb[3])},${Math.round(len / 0.5)}`;
}

/**
 * "Does this box touch any of these boxes?" without testing every pair: a file
 * with thousands of pieces and tens of thousands of paths stays fast.
 */
function boxIndex(boxes, tol) {
  if (boxes.length <= 64) return (bb) => boxes.some((b) => bbOverlap(bb, b, -tol));
  let all = boxes[0].slice();
  for (const b of boxes) all = [Math.min(all[0], b[0]), Math.min(all[1], b[1]), Math.max(all[2], b[2]), Math.max(all[3], b[3])];
  const G = 64;
  const cw = Math.max((all[2] - all[0]) / G, 1e-6), ch = Math.max((all[3] - all[1]) / G, 1e-6);
  const cell = (v, o, c) => Math.min(G - 1, Math.max(0, Math.floor((v - o) / c)));
  const grid = Array.from({ length: G * G }, () => []);
  boxes.forEach((b, i) => {
    for (let gx = cell(b[0] - tol, all[0], cw); gx <= cell(b[2] + tol, all[0], cw); gx++) {
      for (let gy = cell(b[1] - tol, all[1], ch); gy <= cell(b[3] + tol, all[1], ch); gy++) grid[gy * G + gx].push(i);
    }
  });
  return (bb) => {
    if (!bbOverlap(bb, all, -tol)) return false;
    for (let gx = cell(bb[0], all[0], cw); gx <= cell(bb[2], all[0], cw); gx++) {
      for (let gy = cell(bb[1], all[1], ch); gy <= cell(bb[3], all[1], ch); gy++) {
        for (const i of grid[gy * G + gx]) if (bbOverlap(bb, boxes[i], -tol)) return true;
      }
    }
    return false;
  };
}

/** Exact-ish box match (within tol) by hashing the lower-left corner. */
function sameBoxIndex(boxes, tol) {
  const cellSize = Math.max(tol * 4, 1e-6);
  const key = (x, y) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
  const map = new Map();
  for (const b of boxes) {
    const k = key(b[0], b[1]);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(b);
  }
  return (bb) => {
    const cx = Math.floor(bb[0] / cellSize), cy = Math.floor(bb[1] / cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const o of map.get(`${cx + dx},${cy + dy}`) || []) {
          if (Math.abs(o[0] - bb[0]) <= tol && Math.abs(o[1] - bb[1]) <= tol
            && Math.abs(o[2] - bb[2]) <= tol && Math.abs(o[3] - bb[3]) <= tol) return true;
        }
      }
    }
    return false;
  };
}

/** Two colours a person would call the same (a fill with its own outline). */
const sameColour = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.3;

function polyLenMm(pts) {
  let L = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) L += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
  return L * MM_PER_PT;
}

/**
 * @param read    readPdf() output
 * @param pieces  detectCut().pieces: { bb, outlines, holes } in page points
 * @param speeds  { [materialId]: cut speed mm/s }
 */
export function laserJob(read, pieces, speeds) {
  const TOL = 0.05 / MM_PER_PT;
  const onMaterial = boxIndex(pieces.map((p) => p.bb), TOL);

  // Outlines of the material: pieces and their holes. A filled shape that
  // matches one of these is the material, so it is cut along its edge.
  const outlineBoxes = [];
  for (const p of pieces) for (const o of [...p.outlines, ...(p.holes || [])]) outlineBoxes.push(bbOf(o));
  const isOutline = sameBoxIndex(outlineBoxes, TOL);

  // A fill covering (nearly) a whole piece is the colour of the board in a
  // mockup, not a request to engrave the entire surface: priced as engraving
  // it turns a RM30 cut job into hundreds of ringgit. Skipped, and the
  // customer is told so they can ask for full-surface engraving by WhatsApp.
  let background = 0;
  const isBackground = (subs) => {
    let bb = null;
    for (const s of subs) bb = bb ? [Math.min(bb[0], s.bb[0]), Math.min(bb[1], s.bb[1]), Math.max(bb[2], s.bb[2]), Math.max(bb[3], s.bb[3])] : [...s.bb];
    const area = (bb[2] - bb[0]) * (bb[3] - bb[1]);
    return pieces.length <= 500 && pieces.some((p) => {
      const pa = (p.bb[2] - p.bb[0]) * (p.bb[3] - p.bb[1]);
      const ov = bbIntersect(bb, p.bb);
      return pa > 0 && ov && (ov[2] - ov[0]) * (ov[3] - ov[1]) >= BACKGROUND_SHARE * pa && area <= pa / BACKGROUND_SHARE;
    });
  };

  const cut = [];      // flat pts per cut line
  const score = [];
  const fills = [];    // closed outlines to engrave (flat pts)
  const bands = [];    // thick strokes: { pts, w } (w in pt)
  const rasters = [];  // boxes
  const seen = new Set();
  const addLine = (list, pts, closed) => {
    const p = closed ? closedPts(pts) : pts;
    const key = dupKey(bbOf(p), polyLenMm(p));
    if (seen.has(key)) return;
    seen.add(key);
    list.push(p);
  };

  // Piece outlines are always cut, whatever painted them (CutContour spot,
  // cut layer, or the outermost shape).
  for (const p of pieces) {
    for (const o of p.outlines) addLine(cut, o, true);
    for (const o of p.holes || []) addLine(cut, o, true);
  }

  for (const path of read.paths) {
    if (path.oc.some((g) => g.off)) continue;
    const visible = path.subs.filter((s) => {
      if (path.clip && !bbIntersect(s.bb, path.clip)) return false;
      return onMaterial(s.bb);
    });
    if (!visible.length) continue;

    if (path.clipPainted) {
      for (const s of visible) fills.push(closedPts(s.pts));
      continue;
    }
    const piecePath = visible.some((s) => s.closed && isOutline(s.bb));
    // A filled shape outlined in its own colour (CorelDRAW's default outline)
    // is one engraved shape; the outline is not a cut line.
    const ownOutline = path.fill && path.stroke && !piecePath && !isWhite(path.fillRGB) && sameColour(path.fillRGB, path.strokeRGB);
    if (path.stroke && !isWhite(path.strokeRGB) && !ownOutline) {
      // A piece's own outline is cut however thick it was drawn.
      if (path.lw * MM_PER_PT >= THICK_MM && !piecePath) {
        for (const s of visible) bands.push({ pts: s.closed ? closedPts(s.pts) : s.pts, w: path.lw });
      } else {
        const list = isBlue(path.strokeRGB) ? score : cut;
        for (const s of visible) addLine(list, s.pts, s.closed);
      }
    }
    if (path.fill) {
      if (piecePath) {
        // The material's own shape (letters cut out of acrylic, a filled
        // plaque): its edge and its counters are cut, its fill is the board.
        for (const s of visible) if (s.closed) addLine(cut, s.pts, true);
      } else if (!isWhite(path.fillRGB) && (ownOutline || !(path.stroke && !isWhite(path.strokeRGB)))) {
        // Filled and stroked in another colour: the stroke says "cut here",
        // the fill is only a mockup of the material.
        const closed = visible.filter((s) => s.closed);
        if (closed.length && isBackground(closed)) { background++; continue; }
        for (const s of closed) fills.push(closedPts(s.pts));
      }
    }
  }
  for (const r of read.rasters || []) {
    if (r.oc.some((g) => g.off) || !onMaterial(r.bb)) continue;
    const [x0, y0, x1, y1] = r.bb;
    rasters.push([x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]);
  }

  // ---- cut and score: lengths, runs, time per material
  const cutRuns = [];
  let cutMm = 0;
  for (const p of cut) cutMm += runsOf(p, cutRuns);
  const scoreRuns = [];
  let scoreMm = 0;
  for (const p of score) scoreMm += runsOf(p, scoreRuns);
  const cutSec = {};
  for (const [id, v] of Object.entries(speeds)) {
    let t = 0;
    for (const d of cutRuns) t += segTime(d, v);
    cutSec[id] = t;
  }
  let scoreSec = 0;
  for (const d of scoreRuns) scoreSec += segTime(d, MARK_SPEED);

  // ---- travel between lines (nearest next start; closed lines end where they began)
  const lines = [...cut, ...score].filter((p) => p.length >= 4);
  let rapidSec = 0;
  if (lines.length) {
    const nn = lines.length <= MAX_NN;
    const used = new Uint8Array(lines.length);
    let cx = lines[0][0], cy = lines[0][1];
    for (let k = 0; k < lines.length; k++) {
      let best = k;
      if (nn) {
        let bd = Infinity;
        for (let i = 0; i < lines.length; i++) {
          if (used[i]) continue;
          const d = (lines[i][0] - cx) ** 2 + (lines[i][1] - cy) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
      used[best] = 1;
      const p = lines[best];
      rapidSec += segTime(Math.hypot(p[0] - cx, p[1] - cy) * MM_PER_PT, MOTION.vmax);
      cx = p[p.length - 2]; cy = p[p.length - 1];
    }
  }

  // ---- engraving: per scan line, the span from the first mark to the last
  const edges = [];
  const pushEdges = (pts) => {
    for (let i = 0; i + 3 < pts.length; i += 2) edges.push(pts[i] * MM_PER_PT, pts[i + 1] * MM_PER_PT, pts[i + 2] * MM_PER_PT, pts[i + 3] * MM_PER_PT);
  };
  for (const p of fills) pushEdges(p);
  for (const p of rasters) pushEdges(p);
  for (const b of bands) {
    // Each segment of a thick line as a quad of its width.
    const h = b.w / 2;
    for (let i = 0; i + 3 < b.pts.length; i += 2) {
      const x0 = b.pts[i], y0 = b.pts[i + 1], x1 = b.pts[i + 2], y1 = b.pts[i + 3];
      const d = Math.hypot(x1 - x0, y1 - y0);
      if (d < 1e-9) continue;
      const nx = (-(y1 - y0) / d) * h, ny = ((x1 - x0) / d) * h;
      pushEdges([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny, x0 + nx, y0 + ny]);
    }
  }
  let engraveSec = 0, engraveLines = 0, engraveBox = null;
  if (edges.length) {
    let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < edges.length; i += 4) {
      y0 = Math.min(y0, edges[i + 1], edges[i + 3]); y1 = Math.max(y1, edges[i + 1], edges[i + 3]);
      x0 = Math.min(x0, edges[i], edges[i + 2]); x1 = Math.max(x1, edges[i], edges[i + 2]);
    }
    engraveBox = [x0, y0, x1, y1];
    const H = y1 - y0;
    const step = Math.max(ENGRAVE.gap, H / MAX_SCAN_LINES);
    const n = Math.max(1, Math.ceil(H / step));
    const lo = new Float64Array(n).fill(Infinity), hi = new Float64Array(n).fill(-Infinity);
    for (let i = 0; i < edges.length; i += 4) {
      const ax = edges[i], ay = edges[i + 1], bx = edges[i + 2], by = edges[i + 3];
      if (ay === by) continue;
      const ya = Math.min(ay, by), yb = Math.max(ay, by);
      const k0 = Math.max(0, Math.ceil((ya - y0) / step - 0.5));
      const k1 = Math.min(n - 1, Math.ceil((yb - y0) / step - 0.5) - 1);
      for (let k = k0; k <= k1; k++) {
        const y = y0 + (k + 0.5) * step;
        const x = ax + ((y - ay) * (bx - ax)) / (by - ay);
        if (x < lo[k]) lo[k] = x;
        if (x > hi[k]) hi[k] = x;
      }
    }
    let t = 0, used = 0;
    for (let k = 0; k < n; k++) {
      if (!(hi[k] > lo[k])) continue;
      used++;
      t += segTime(hi[k] - lo[k], ENGRAVE.speed) + segTime(step, MOTION.vmax);
    }
    const scale = step / ENGRAVE.gap;
    engraveSec = t * scale;
    engraveLines = Math.round(used * scale);
  }

  return {
    cutMm, scoreMm, cutSec, scoreSec, rapidSec, engraveSec, engraveLines, engraveBox, background,
    counts: { cut: cut.length, score: score.length, fills: fills.length, bands: bands.length, rasters: rasters.length },
    draw: { cut, score, fills, bands, rasters },
  };
}
