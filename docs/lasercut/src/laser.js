// What the laser does with the drawing, and how long it takes.
//
// The layers (layers.js) say what each painted part is for - cut, score,
// engrave or ignore - and this file turns that into machine work:
//   cut / score   every line as drawn, every shape along its edge (holes too)
//   engrave       shapes are raster-filled, thick lines are engraved as bands
//                 of their width, hairlines as a vector line, pictures over
//                 their box
// Pieces of material are the outermost closed outlines of the CUT work. With
// nothing closed to cut (engraving only, or loose DXF lines) the material is
// the box around everything that is worked on.
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

import { MM_PER_PT, outermostRoots, piecesFromRoots } from './cut.js';
import { bbIntersect, bbOverlap } from './geom.js';
import { THICK_MM, isWhiteish } from './layers.js';

export const MOTION = { vmax: 300, v0: 15, acc: 3000 }; // mm/s, mm/s, mm/s^2 (bridge defaults)
export const ENGRAVE = { speed: 200, gap: 0.1 };        // mm/s, mm between scan lines
export const MARK_SPEED = 100;                           // mm/s, score line
const CORNER_DEG = 30;
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

function polyLenMm(pts) {
  let L = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) L += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
  return L * MM_PER_PT;
}

/**
 * @param read      readPdf()-shaped drawing, page points
 * @param assigned  assignLayers(read)
 * @param roles     { [layerKey]: 'cut' | 'engrave' | 'score' | 'ignore' }
 * @param speeds    { [materialId]: cut speed mm/s }
 */
export function laserJob(read, assigned, roles, speeds) {
  const TOL = 0.05 / MM_PER_PT;
  const { parts, rasterKey } = assigned;
  const roleOf = (key) => (key ? roles[key] || 'ignore' : 'ignore');
  const shown = (p) => !p.oc?.some((g) => g.off);

  // ---- pieces: outermost closed outlines of the cut work
  const cutPaths = read.paths.filter((p, i) => shown(p) && (roleOf(parts[i].stroke) === 'cut' || roleOf(parts[i].fill) === 'cut'));
  let pieces = piecesFromRoots(outermostRoots(cutPaths, { mediaBox: read.page?.mediaBox || null }).roots);
  const hasCutPieces = pieces.length > 0;
  if (!hasCutPieces) {
    let bb = null;
    const grow = (b) => { bb = bb ? [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])] : [...b]; };
    read.paths.forEach((p, i) => {
      if (!shown(p) || (roleOf(parts[i].stroke) === 'ignore' && roleOf(parts[i].fill) === 'ignore')) return;
      for (const s of p.subs) grow(p.clip ? (bbIntersect(s.bb, p.clip) || s.bb) : s.bb);
    });
    if (roleOf(rasterKey) !== 'ignore') for (const r of read.rasters || []) if (!r.oc?.some((g) => g.off)) grow(r.bb);
    if (!bb || (bb[2] - bb[0]) * MM_PER_PT < 0.5 || (bb[3] - bb[1]) * MM_PER_PT < 0.5) return { error: 'nothing' };
    pieces = [{ bb, outlines: [], holes: [] }];
  }
  const onMaterial = boxIndex(pieces.map((p) => p.bb), TOL);

  const cut = [];      // flat pts per cut line
  const score = [];
  const fills = [];    // closed outlines to engrave (flat pts)
  const bands = [];    // thick strokes: { pts, w } (w in pt)
  const rasters = [];  // boxes
  const ignored = [];  // switched-off artwork, drawn faintly so the customer sees it
  let outside = 0;     // worked-on parts lying outside every piece
  const seen = new Set();
  const addLine = (list, pts, closed) => {
    const p = closed ? closedPts(pts) : pts;
    const key = dupKey(bbOf(p), polyLenMm(p));
    if (seen.has(key)) return;
    seen.add(key);
    list.push(p);
  };

  read.paths.forEach((path, i) => {
    if (!shown(path)) return;
    const sRole = roleOf(parts[i].stroke), fRole = roleOf(parts[i].fill);
    if (sRole === 'ignore' && fRole === 'ignore') {
      // Paper-white fills and a picture's background are not worth showing.
      const paper = path.backdrop || (!path.stroke && isWhiteish(path.fillRGB)) || (path.stroke && !path.fill && isWhiteish(path.strokeRGB));
      if (!paper) for (const s of path.subs) ignored.push(s.closed ? closedPts(s.pts) : s.pts);
      return;
    }
    const inClip = path.subs.filter((s) => !path.clip || bbIntersect(s.bb, path.clip));
    const visible = inClip.filter((s) => onMaterial(s.bb));
    outside += inClip.length - visible.length;
    if (!visible.length) return;
    if (sRole === 'cut' || sRole === 'score') {
      for (const s of visible) addLine(sRole === 'cut' ? cut : score, s.pts, s.closed);
    } else if (sRole === 'engrave') {
      if (path.lw * MM_PER_PT >= THICK_MM) for (const s of visible) bands.push({ pts: s.closed ? closedPts(s.pts) : s.pts, w: path.lw });
      else for (const s of visible) addLine(score, s.pts, s.closed);
    }
    const closed = visible.filter((s) => s.closed);
    if (fRole === 'cut' || fRole === 'score') for (const s of closed) addLine(fRole === 'cut' ? cut : score, s.pts, true);
    else if (fRole === 'engrave') for (const s of closed) fills.push(closedPts(s.pts));
  });
  const rRole = roleOf(rasterKey);
  if (rRole !== 'ignore') {
    for (const r of read.rasters || []) {
      if (r.oc?.some((g) => g.off)) continue;
      if (!onMaterial(r.bb)) { outside++; continue; }
      const [x0, y0, x1, y1] = r.bb;
      const box = [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
      if (rRole === 'engrave') rasters.push(box);
      else addLine(rRole === 'cut' ? cut : score, box, true);
    }
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
    pieces, noCut: !hasCutPieces, cutMm, scoreMm, cutSec, scoreSec, rapidSec, engraveSec, engraveLines, engraveBox,
    counts: { cut: cut.length, score: score.length, fills: fills.length, bands: bands.length, rasters: rasters.length },
    outside,
    draw: { cut, score, fills, bands, rasters, ignored },
  };
}
