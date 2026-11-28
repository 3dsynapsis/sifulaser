// The big text in a plaque design, found and traced so it can be cut from black plywood
// and glued on raised (UV Plak tab, Boss, 28 Nov 2026). Pure: works on pixels, no DOM.
//
// The page is drawn at about 0.1 mm a pixel (posterPdf.js pageRaster), its pictures
// blanked out (a logo or a photo is printed, never cut), and what is left that is dark
// is ink. Each separate patch of ink is a candidate: a letter, or a dot, or part of a
// line drawing. A line drawing is told from a letter by its stroke: a letter's stroke is
// a good share of its height, a drawn line's is not.
//
// A candidate's outline is traced where the page's darkness crosses half (marching
// squares on the drawn page, so the antialiased edge gives the line to a fraction of a
// pixel), counters and all: an O comes out as two loops, cut both, and its middle falls
// out. The loops are thinned of points that add nothing (simplify).
//
// Which candidates become raised letters is the tab's choice (plakFlow.js): those at
// least so tall on the finished plaque, less any the person clicks off.

/** Darker than this (0 black, 255 white), on every channel, is ink. */
export const INK_LEVEL = 128;
/** A candidate is at least this tall on the page, mm: smaller is body text or a speck. */
export const CANDIDATE_MIN_MM = 2;
/** A letter's stroke is at least this share of its height; a drawn line's is far less. */
export const STROKE_SHARE_MIN = 0.045;
export const STROKE_MIN_MM = 0.3;
/** A candidate no bigger than this share of the page either way: a frame is not a letter. */
export const CANDIDATE_MAX_SHARE = 0.6;
export const CANDIDATES_MAX = 300;
/** Outline points closer than this to the line through their neighbours go, pixels. */
export const SIMPLIFY_PX = 0.35;

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * How dark each pixel is, 0 (white) to 1 (black), with the boxes blanked: the field the
 * outlines are traced on. Dark is by the brightest channel, not by luminance: the raised
 * letters are black plywood over black print, and a red logo's lettering, dark by
 * luminance, is not what gets raised. A see-through pixel is paper.
 * @param mask [{ x, y, w, h }] in pixels
 */
export function darkness(rgba, width, height, mask = []) {
  const f = new Float32Array(width * height);
  for (let i = 0, p = 0; i < f.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const top = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
    f[i] = a * (1 - top / 255);
  }
  for (const m of mask) {
    const x0 = Math.max(0, Math.floor(m.x));
    const y0 = Math.max(0, Math.floor(m.y));
    const x1 = Math.min(width, Math.ceil(m.x + m.w));
    const y1 = Math.min(height, Math.ceil(m.y + m.h));
    for (let y = y0; y < y1; y++) f.fill(0, y * width + x0, y * width + x1);
  }
  return f;
}

/**
 * The patches of ink, 8-connected: a label per pixel (0 for none) and, per label, its
 * box, its area and its edge (pixel sides between ink and not), all in pixels.
 */
export function inkPatches(f, width, height, level = 1 - INK_LEVEL / 255) {
  const labels = new Int32Array(width * height);
  const patches = [];
  const stack = new Int32Array(width * height);
  for (let start = 0; start < f.length; start++) {
    if (labels[start] || f[start] < level) continue;
    const id = patches.length + 1;
    const patch = {
      id, x0: width, y0: height, x1: -1, y1: -1, area: 0, edge: 0,
    };
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top) {
      const i = stack[--top];
      const x = i % width;
      const y = (i - x) / width;
      patch.area++;
      if (x < patch.x0) patch.x0 = x;
      if (x > patch.x1) patch.x1 = x;
      if (y < patch.y0) patch.y0 = y;
      if (y > patch.y1) patch.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const inside = xx >= 0 && yy >= 0 && xx < width && yy < height;
          const j = yy * width + xx;
          const ink = inside && f[j] >= level;
          if (!ink && (dx === 0 || dy === 0)) patch.edge++;
          if (ink && !labels[j]) {
            labels[j] = id;
            stack[top++] = j;
          }
        }
      }
    }
    patches.push(patch);
  }
  return { labels, patches };
}

// ---- tracing ---------------------------------------------------------------------------

/**
 * The outline of one patch: every closed line where the darkness crosses `level`, the
 * ink on its right going round (y down). Marching squares on pixel centres; pixels of
 * other patches count as paper, so a neighbour's edge never joins in.
 *
 * @returns [[[x, y], ...], ...] loops in pixels of the whole picture (a pixel's centre
 *          is at +0.5)
 */
export function traceOutline(f, labels, width, height, patch, level = 1 - INK_LEVEL / 255) {
  // The patch's box with a pixel of paper round it, so every line closes.
  const ox = patch.x0 - 1;
  const oy = patch.y0 - 1;
  const gw = patch.x1 - patch.x0 + 3;
  const gh = patch.y1 - patch.y0 + 3;
  const v = new Float32Array(gw * gh);
  for (let gy = 1; gy < gh - 1; gy++) {
    const y = oy + gy;
    for (let gx = 1; gx < gw - 1; gx++) {
      const x = ox + gx;
      const i = y * width + x;
      const lab = labels[i];
      v[gy * gw + gx] = lab === patch.id || lab === 0 ? f[i] : 0;
    }
  }
  // An edge's crossing, once per edge: horizontal edges first, then vertical.
  const hId = (x, y) => (y * gw + x) * 2;
  const vId = (x, y) => (y * gw + x) * 2 + 1;
  const at = new Map();
  const cross = (id, ax, ay, bx, by) => {
    if (!at.has(id)) {
      const va = v[ay * gw + ax];
      const vb = v[by * gw + bx];
      const t = (level - va) / (vb - va);
      at.set(id, [ax + t * (bx - ax), ay + t * (by - ay)]);
    }
    return id;
  };
  const next = new Map();
  const link = (a, b, inside) => {
    // Orient so the ink is on the right: in y-down pixels the cross product of the
    // line and the way to an ink corner is positive.
    const [ax, ay] = at.get(a);
    const [bx, by] = at.get(b);
    const c = (bx - ax) * (inside[1] - ay) - (by - ay) * (inside[0] - ax);
    if (c >= 0) next.set(a, b);
    else next.set(b, a);
  };
  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const tl = v[y * gw + x] >= level;
      const tr = v[y * gw + x + 1] >= level;
      const br = v[(y + 1) * gw + x + 1] >= level;
      const bl = v[(y + 1) * gw + x] >= level;
      const n = tl + tr + br + bl;
      if (n === 0 || n === 4) continue;
      const T = tl !== tr ? cross(hId(x, y), x, y, x + 1, y) : -1;
      const B = bl !== br ? cross(hId(x, y + 1), x, y + 1, x + 1, y + 1) : -1;
      const L = tl !== bl ? cross(vId(x, y), x, y, x, y + 1) : -1;
      const R = tr !== br ? cross(vId(x + 1, y), x + 1, y, x + 1, y + 1) : -1;
      const corner = { tl: [x, y], tr: [x + 1, y], br: [x + 1, y + 1], bl: [x, y + 1] };
      if (n === 2 && tl === br) {
        // A saddle: the middle decides whether the two ink corners join.
        const mid = (v[y * gw + x] + v[y * gw + x + 1] + v[(y + 1) * gw + x + 1] + v[(y + 1) * gw + x]) / 4;
        const joined = mid >= level;
        const inkTl = tl;
        if (joined) {
          // The ink runs through the middle: cut off the two paper corners.
          if (inkTl) {
            linkAway(T, R, corner.tr);
            linkAway(L, B, corner.bl);
          } else {
            linkAway(T, L, corner.tl);
            linkAway(R, B, corner.br);
          }
        } else if (inkTl) {
          link(T, L, corner.tl);
          link(R, B, corner.br);
        } else {
          link(T, R, corner.tr);
          link(L, B, corner.bl);
        }
        continue;
      }
      const ends = [T, R, B, L].filter((e) => e >= 0);
      const ink = tl ? corner.tl : tr ? corner.tr : br ? corner.br : corner.bl;
      link(ends[0], ends[1], ink);
    }
  }
  // A line that cuts a paper corner off: the ink is on the side away from it.
  function linkAway(a, b, paper) {
    const [ax, ay] = at.get(a);
    const [bx, by] = at.get(b);
    const c = (bx - ax) * (paper[1] - ay) - (by - ay) * (paper[0] - ax);
    if (c <= 0) next.set(a, b);
    else next.set(b, a);
  }

  const loops = [];
  const seen = new Set();
  for (const startId of next.keys()) {
    if (seen.has(startId)) continue;
    const loop = [];
    let id = startId;
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      const [px, py] = at.get(id);
      loop.push([ox + px + 0.5, oy + py + 0.5]);
      id = next.get(id);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Signed area of a loop: positive when it goes clockwise on a y-down picture. */
export function loopArea(loop) {
  let s = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    s += loop[j][0] * loop[i][1] - loop[i][0] * loop[j][1];
  }
  return s / 2;
}

function distToLine(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / len;
}

function rdp(points, tol, from, to, keep) {
  let worst = -1;
  let at = -1;
  for (let i = from + 1; i < to; i++) {
    const d = distToLine(points[i], points[from], points[to]);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst > tol) {
    keep[at] = 1;
    rdp(points, tol, from, at, keep);
    rdp(points, tol, at, to, keep);
  }
}

/** A closed loop with the points that add less than `tol` taken out (Douglas-Peucker). */
export function simplifyLoop(loop, tol = SIMPLIFY_PX) {
  if (loop.length <= 4) return loop.slice();
  // Split at the point farthest from the first, so both halves are open lines.
  let far = 0;
  let best = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const ring = [...loop, loop[0]];
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[far] = 1;
  keep[ring.length - 1] = 1;
  rdp(ring, tol, 0, far, keep);
  rdp(ring, tol, far, ring.length - 1, keep);
  const out = [];
  for (let i = 0; i < ring.length - 1; i++) if (keep[i]) out.push(ring[i]);
  return out.length >= 3 ? out : loop.slice();
}

// ---- the candidates ----------------------------------------------------------------------

/**
 * Every patch of ink on the page that could be a letter, traced.
 *
 * @param raster { rgba, width, height, mmPerPx }: the page drawn whole
 * @param mask   [{ x, y, width, height }] mm on the page: its pictures, left out
 * @returns [{ id, box: { x, y, width, height }, stroke, area, loops }], all mm on the
 *          page, left to right, then down; `loops` are closed, holes
 *          included, ink on the right going round; ids 0, 1, 2... in that order
 */
export function findLetters(raster, mask = [], o = {}) {
  const { rgba, width, height, mmPerPx: k } = raster;
  const minMm = o.minMm ?? CANDIDATE_MIN_MM;
  const f = darkness(rgba, width, height, mask.map((m) => ({
    x: m.x / k, y: m.y / k, w: m.width / k, h: m.height / k,
  })));
  const { labels, patches } = inkPatches(f, width, height);
  const kept = [];
  for (const p of patches) {
    const w = (p.x1 - p.x0 + 1) * k;
    const hgt = (p.y1 - p.y0 + 1) * k;
    if (Math.max(w, hgt) < minMm) continue;
    if (w > CANDIDATE_MAX_SHARE * width * k && hgt > CANDIDATE_MAX_SHARE * height * k) continue;
    if (w > 0.9 * width * k || hgt > 0.9 * height * k) continue;
    // A stroke of width s and length l: area s*l, edge about 2*l.
    const stroke = p.edge ? (2 * p.area / p.edge) * k : 0;
    if (stroke < STROKE_MIN_MM || stroke < STROKE_SHARE_MIN * Math.max(w, hgt)) continue;
    kept.push({ p, w, hgt, stroke });
  }
  kept.sort((a, b) => b.p.area - a.p.area);
  const out = kept.slice(0, o.max ?? CANDIDATES_MAX).map(({ p, w, hgt, stroke }) => {
    const loops = traceOutline(f, labels, width, height, p)
      .map((loop) => simplifyLoop(loop))
      .filter((loop) => Math.abs(loopArea(loop)) * k * k >= 0.05)
      .map((loop) => loop.map(([x, y]) => [r3(x * k), r3(y * k)]));
    return {
      box: { x: r3(p.x0 * k), y: r3(p.y0 * k), width: r3(w), height: r3(hgt) },
      stroke: r3(stroke),
      area: r3(p.area * k * k),
      loops,
    };
  }).filter((c) => c.loops.length);
  // Left to right, then down, each letter by its own box: the same page gives the same
  // ids every time, so the letters clicked off stay off when the job is opened again.
  out.sort((a, b) => (a.box.x - b.box.x) || (a.box.y - b.box.y));
  return out.map((c, id) => ({ id, ...c }));
}

/** A candidate's loops as path data, mm on the plate: page mm times the scales, moved. */
export function letterPath(letter, scale = 1, dx = 0, dy = 0, scaleY = scale) {
  return letter.loops.map((loop) => `${loop.map(([x, y], i) => `${i ? 'L' : 'M'} ${r3(x * scale + dx)} ${r3(y * scaleY + dy)}`).join(' ')} Z`).join(' ');
}

/** The loops of a letter that are holes (counters), and those that are its outside. */
export function splitLoops(letter) {
  const outer = [];
  const holes = [];
  for (const loop of letter.loops) (loopArea(loop) >= 0 ? outer : holes).push(loop);
  return { outer, holes };
}
