// The panel as a sampled field, and the two things that fall out of it.
//
// The panel starts solid and cells are cut out of it, which in field terms is
//
//     v = max( sd(panel) , -( sd(cell) + w/2 ) )        negative is material
//
// - an intersection with the complement of every hole, done with max() over a
// negated distance. No polygon boolean, no inward offset of a star cell with
// three acute tips, no winding to get right. Which matters, because the inward
// offset is exactly where offsetPolygon folds a ring through itself and returns
// something that still looks like a ring.
//
// Kerf is then a single subtraction on the level. Growing the material by half
// a kerf everywhere moves the panel outline OUT by half a kerf and every hole
// edge IN by half a kerf, which is the house rule (box.js:1287) stated in one
// line and with no way to get the sign wrong on a clockwise ring.
//
// The same grid then answers the connectivity question and the minimum-width
// question, so the picture on the screen and the numbers in the report cannot
// disagree with each other. That is the whole reason for doing it this way.
//
// Millimetres, y-up. marchSquares is the one in outline.js - the lettering
// tools have been using it for a year and there is no reason for a second.

import { marchSquares, simplifyRing } from '../outline.js';
import { ringArea, ringBBox } from './arrangement.js';

const FAR = 1e3;

/** Distance from a point to a segment. */
function distSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const vv = vx * vx + vy * vy;
  let t = vv > 1e-12 ? (wx * vx + wy * vy) / vv : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(wx - t * vx, wy - t * vy);
}

/**
 * Signed distance to a polygon over a local window: sign by scanline, magnitude
 * by distance to the edges.
 *
 * Only a band either side of the outline gets a real number. Everything deeper
 * is set to +/- FAR, which is all the contour tracer looks at - but the band
 * has to be wide enough that no zero crossing ever lands on the join, or the
 * contour gets pulled onto the edge of the measured region.
 */
function localSD(ring, ox, oy, cell, i0, i1, j0, j1, band) {
  const gw = i1 - i0 + 1;
  const gh = j1 - j0 + 1;
  const out = new Float32Array(gw * gh);
  const inside = new Uint8Array(gw * gh);
  for (let j = j0; j <= j1; j++) {
    const py = oy + j * cell;
    const xs = [];
    for (let k = 0, m = ring.length - 1; k < ring.length; m = k, k++) {
      const ay = ring[m][1];
      const by = ring[k][1];
      if ((ay <= py) === (by <= py)) continue;
      const t = (py - ay) / (by - ay);
      xs.push(ring[m][0] + t * (ring[k][0] - ring[m][0]));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let s = 0; s + 1 < xs.length; s += 2) {
      const ia = Math.max(i0, Math.ceil((xs[s] - ox) / cell));
      const ib = Math.min(i1, Math.floor((xs[s + 1] - ox) / cell));
      for (let i = ia; i <= ib; i++) inside[(j - j0) * gw + (i - i0)] = 1;
    }
  }
  const dist = new Float32Array(gw * gh).fill(FAR);
  for (let k = 0, m = ring.length - 1; k < ring.length; m = k, k++) {
    const ax = ring[m][0]; const ay = ring[m][1];
    const bx = ring[k][0]; const by = ring[k][1];
    const ea = Math.max(i0, Math.floor((Math.min(ax, bx) - band - ox) / cell));
    const eb = Math.min(i1, Math.ceil((Math.max(ax, bx) + band - ox) / cell));
    const ec = Math.max(j0, Math.floor((Math.min(ay, by) - band - oy) / cell));
    const ed = Math.min(j1, Math.ceil((Math.max(ay, by) + band - oy) / cell));
    for (let j = ec; j <= ed; j++) {
      const py = oy + j * cell;
      for (let i = ea; i <= eb; i++) {
        const li = (j - j0) * gw + (i - i0);
        const d = distSeg(ox + i * cell, py, ax, ay, bx, by);
        if (d < dist[li]) dist[li] = d;
      }
    }
  }
  for (let n = 0; n < out.length; n++) {
    const d = dist[n] < FAR ? dist[n] : FAR;
    out[n] = inside[n] ? -d : d;
  }
  return { sd: out, gw, gh };
}

/**
 * Sample the panel.
 *
 * @param outline  the panel outline, CCW pairs
 * @param faces    the cells that are going to be cut, as arrangement faces
 * @param inset    how far in from the cell the hole edge sits - half a strap
 * @param cell     grid pitch; the caller is responsible for it being small
 *                 enough, and connect.js refuses to run on one that is not
 * @param kerf     beam width; the level is shifted by half of it
 * @param frame    how deep the panel's own signed distance has to be measured.
 *                 The flood fill in connect.js seeds from the frame band, and
 *                 it can only do that if the field knows how far in that band
 *                 reaches - a band measured only two cells deep would seed a
 *                 strip too thin to survive the erosion, and the fill would
 *                 start with nothing.
 */
export function rasterPanel({ outline, faces = [], inset = 0, cell, kerf = 0, frame = 0 }) {
  const bb = ringBBox(outline);
  const band = kerf + cell * 4;
  const panelBand = Math.max(band, frame + cell * 2);
  const pad = band + cell * 2;
  const ox = bb.x0 - pad;
  const oy = bb.y0 - pad;
  const nx = Math.ceil((bb.x1 + pad - ox) / cell) + 1;
  const ny = Math.ceil((bb.y1 + pad - oy) / cell) + 1;
  if (nx * ny > 12e6) return { tooFine: true, nx, ny, cell };

  const v = new Float32Array(nx * ny).fill(FAR);
  const panel = localSD(outline, ox, oy, cell, 0, nx - 1, 0, ny - 1, panelBand);
  v.set(panel.sd);
  const panelSD = new Float32Array(panel.sd);

  const iOf = (x) => (x - ox) / cell;
  const jOf = (y) => (y - oy) / cell;
  for (const f of faces) {
    const fb = ringBBox(f);
    const fband = inset + band;
    const i0 = Math.max(0, Math.floor(iOf(fb.x0 - fband)));
    const i1 = Math.min(nx - 1, Math.ceil(iOf(fb.x1 + fband)));
    const j0 = Math.max(0, Math.floor(jOf(fb.y0 - fband)));
    const j1 = Math.min(ny - 1, Math.ceil(jOf(fb.y1 + fband)));
    if (i1 < i0 || j1 < j0) continue;
    const loc = localSD(f, ox, oy, cell, i0, i1, j0, j1, fband);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const li = (j - j0) * loc.gw + (i - i0);
        const cut = -(loc.sd[li] + inset);
        const gi = j * nx + i;
        if (cut > v[gi]) v[gi] = cut;
      }
    }
  }

  const kerfed = new Float32Array(v);
  if (kerf) for (let i = 0; i < kerfed.length; i++) kerfed[i] -= kerf / 2;

  return { v, kerfed, panelSD, nx, ny, ox, oy, cell };
}

/**
 * Trace a field, sorted into outer contours and holes.
 *
 * Rings are classified by the sign of their area, which is what marchSquares
 * guarantees: it emits with the inside on the left, so an outer contour comes
 * back counter-clockwise and a hole clockwise.
 */
export function traceField(field, which = 'kerfed', opts = {}) {
  const v = field[which] || field.v;
  const raw = marchSquares(v, field.nx, field.ny, field.ox, field.oy, field.cell);
  const tol = opts.tolerance ?? field.cell * 0.3;
  const minArea = opts.minArea ?? field.cell * field.cell * 2;
  const outers = [];
  const holes = [];
  for (const ring of raw) {
    const s = simplifyRing(ring, tol);
    const a = ringArea(s);
    if (Math.abs(a) < minArea) continue;
    (a > 0 ? outers : holes).push(s);
  }
  outers.sort((a, b) => ringArea(b) - ringArea(a));
  holes.sort((a, b) => ringArea(a) - ringArea(b));
  return { outers, holes, rings: [...outers, ...holes] };
}

/**
 * Exact squared Euclidean distance transform (Felzenszwalb-Huttenlocher).
 *
 * Two passes of a one-dimensional lower envelope, one per axis, in linear time.
 * Returns squared distance IN CELLS from every set cell to the nearest unset
 * one; the caller multiplies by the pitch.
 */
export function edt(mask, nx, ny) {
  const INF = 1e20;
  const f = new Float64Array(Math.max(nx, ny));
  const d = new Float64Array(Math.max(nx, ny));
  const vv = new Int32Array(Math.max(nx, ny));
  const z = new Float64Array(Math.max(nx, ny) + 1);
  const out = new Float64Array(nx * ny);

  const pass = (n, get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0;
    vv[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[vv[k]] + vv[k] * vv[k])) / (2 * q - 2 * vv[k]);
      while (s <= z[k]) {
        k--;
        s = ((f[q] + q * q) - (f[vv[k]] + vv[k] * vv[k])) / (2 * q - 2 * vv[k]);
      }
      k++;
      vv[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - vv[k]) * (q - vv[k]) + f[vv[k]];
    }
    for (let q = 0; q < n; q++) set(q, d[q]);
  };

  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    pass(nx, (q) => (mask[row + q] ? INF : 0), (q, val) => { out[row + q] = val; });
  }
  for (let i = 0; i < nx; i++) {
    pass(ny, (q) => out[q * nx + i], (q, val) => { out[q * nx + i] = val; });
  }
  return out;
}

/**
 * Label 4-connected components of a boolean grid.
 *
 * Four, not eight. An eight-connected fill leaks diagonally through a single
 * shared cell corner, which reports two holes that meet at exactly one point as
 * connected material - the precise false pass this whole check exists to
 * eliminate, and the one the ring-parity test already gives for free.
 */
export function label4(mask, nx, ny) {
  const lab = new Int32Array(nx * ny).fill(-1);
  const stack = new Int32Array(nx * ny);
  const comps = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || lab[start] >= 0) continue;
    const id = comps.length;
    let sp = 0;
    stack[sp++] = start;
    lab[start] = id;
    let count = 0;
    let sx = 0;
    let sy = 0;
    while (sp) {
      const p = stack[--sp];
      const i = p % nx;
      const j = (p - i) / nx;
      count++;
      sx += i;
      sy += j;
      if (i > 0 && mask[p - 1] && lab[p - 1] < 0) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (i < nx - 1 && mask[p + 1] && lab[p + 1] < 0) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (j > 0 && mask[p - nx] && lab[p - nx] < 0) { lab[p - nx] = id; stack[sp++] = p - nx; }
      if (j < ny - 1 && mask[p + nx] && lab[p + nx] < 0) { lab[p + nx] = id; stack[sp++] = p + nx; }
    }
    comps.push({ id, count, ci: sx / count, cj: sy / count });
  }
  return { lab, comps };
}

export { distSeg, FAR };
