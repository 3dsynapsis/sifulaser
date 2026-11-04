// Which seed gives the strongest pieces.
//
// Every seed draws a valid puzzle, but they are not equally good in 3 mm acrylic.
// A piece is weakest where two tabs nearly meet, because the material between
// them is what snaps. So each candidate is scored on the narrowest gap between
// any two different edges, with the corners left out: edges meet at a grid
// crossing by design, and that says nothing about how thin a piece gets.
//
// Pieces that are all sockets or all knobs count slightly against a seed. They
// are perfectly legal but too many of them make a puzzle look regular.

import { buildPuzzle } from './puzzle.js';

export const SEEDS_TO_TRY = 300;
const KEEP = 12;
const STEPS = 6;              // samples per curve: plenty to rank seeds by
const CELL = 6;               // mm, spatial hash cell
const REACH = 2;              // cells searched each way, so gaps up to 12 mm count
const CORNER_SHARE = 0.3;     // of a piece, around each grid crossing
const BALANCE_WEIGHT = 0.05;  // mm of clearance one all-socket piece is worth

/** Path data as one flat number list per line: x0 y0, then six numbers a curve. */
function readLines(d) {
  const out = [];
  for (const chunk of d.split('M ')) {
    if (!chunk.trim()) continue;
    out.push(chunk.replace(/C/g, ' ').trim().split(/\s+/).map(Number));
  }
  return out;
}

const cubic = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/**
 * @param puzzle result of buildPuzzle
 * @returns {{ clearance: number, allSockets: number, allKnobs: number }}
 *   clearance is in mm, and tops out at the search reach.
 */
export function scoreLayout(puzzle) {
  const { width, height, cols, rows } = puzzle.params;
  const pw = width / cols;
  const ph = height / rows;
  const hLines = readLines(puzzle.h);
  const vLines = readLines(puzzle.v);

  const edgeCount = (rows - 1) * cols + (cols - 1) * rows;
  const total = edgeCount * 3 * STEPS;
  const xs = new Float64Array(total);
  const ys = new Float64Array(total);
  const owner = new Int32Array(total);

  // Which way each edge's tab points: true is towards larger x or y.
  const hDown = [];
  const vRight = [];

  let n = 0;
  let edge = 0;
  const walk = (lines, store, axis, step) => {
    lines.forEach((line, li) => {
      const row = [];
      const edges = (line.length - 2) / 18;
      for (let e = 0; e < edges; e++) {
        for (let c = 0; c < 3; c++) {
          const o = 2 + (e * 3 + c) * 6;
          const x0 = line[o - 2]; const y0 = line[o - 1];
          const x1 = line[o]; const y1 = line[o + 1];
          const x2 = line[o + 2]; const y2 = line[o + 3];
          const x3 = line[o + 4]; const y3 = line[o + 5];
          for (let s = 1; s <= STEPS; s++) {
            const t = s / STEPS;
            xs[n] = cubic(x0, x1, x2, x3, t);
            ys[n] = cubic(y0, y1, y2, y3, t);
            owner[n] = edge;
            n++;
          }
          if (c === 1) {
            const apex = axis === 'y'
              ? cubic(y0, y1, y2, y3, 0.5) : cubic(x0, x1, x2, x3, 0.5);
            row.push(apex > (li + 1) * step);
          }
        }
        edge++;
      }
      store.push(row);
    });
  };
  walk(hLines, hDown, 'y', ph);
  walk(vLines, vRight, 'x', pw);

  const corner = CORNER_SHARE * Math.min(pw, ph);
  const corner2 = corner * corner;
  const gw = Math.ceil(width / CELL) + 2;
  const gh = Math.ceil(height / CELL) + 2;
  const head = new Int32Array(gw * gh).fill(-1);
  const next = new Int32Array(n);
  const reach2 = (CELL * REACH) ** 2;
  let best2 = reach2;

  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    const cx = x - Math.round(x / pw) * pw;
    const cy = y - Math.round(y / ph) * ph;
    if (cx * cx + cy * cy < corner2) continue;
    const gx = Math.max(0, Math.min(gw - 1, Math.floor(x / CELL)));
    const gy = Math.max(0, Math.min(gh - 1, Math.floor(y / CELL)));
    for (let a = Math.max(0, gx - REACH); a <= Math.min(gw - 1, gx + REACH); a++) {
      for (let b = Math.max(0, gy - REACH); b <= Math.min(gh - 1, gy + REACH); b++) {
        for (let j = head[a + b * gw]; j !== -1; j = next[j]) {
          if (owner[j] === owner[i]) continue;
          const dx = xs[j] - x;
          const dy = ys[j] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best2) best2 = d2;
        }
      }
    }
    const slot = gx + gy * gw;
    next[i] = head[slot];
    head[slot] = i;
  }

  let allSockets = 0;
  let allKnobs = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sides = [];
      if (r > 0) sides.push(hDown[r - 1][c]);
      if (r < rows - 1) sides.push(!hDown[r][c]);
      if (c > 0) sides.push(vRight[c - 1][r]);
      if (c < cols - 1) sides.push(!vRight[c][r]);
      if (sides.every(Boolean)) allSockets++;
      if (sides.every((v) => !v)) allKnobs++;
    }
  }

  return { clearance: Math.sqrt(best2), allSockets, allKnobs };
}

const worth = (s) => s.clearance - BALANCE_WEIGHT * (s.allSockets + s.allKnobs);

/**
 * The strongest seeds for these puzzle settings, best first. The same settings
 * always give the same list. Yields to the browser between batches so that a big
 * board does not freeze the page while it is choosing.
 */
export async function rankSeeds(params, { count = SEEDS_TO_TRY, onProgress } = {}) {
  const scored = [];
  let last = Date.now();
  for (let seed = 1; seed <= count; seed++) {
    const s = scoreLayout(buildPuzzle({ ...params, seed }));
    scored.push({ seed, ...s, worth: worth(s) });
    if (Date.now() - last > 40) {
      onProgress?.(seed / count);
      await new Promise((resolve) => { setTimeout(resolve); });
      last = Date.now();
    }
  }
  scored.sort((a, b) => (b.worth - a.worth) || (a.seed - b.seed));
  return scored.slice(0, KEEP);
}
