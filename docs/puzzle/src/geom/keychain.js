// The Keychain UV tab (Boss, 17 Nov 2026): a round acrylic keychain from a client's
// flat design, cut by the laser and UV printed on a whole sheet at once. Pure: no DOM.
//
//   * The size is the keychain's diameter, the cut line: 4, 5 or 6 cm.
//   * The design is found in the PDF by itself: the client's file is a round picture on
//     a white page, with no bleed and no cut line (the "Inisiatif Mengurangkan Gula"
//     job, 110 x 110 mm, the circle about 105.5 mm).
//   * The bleed is 2 mm past the cut. A file with none gets one made from the colour
//     just inside the cut, carried straight out (Boss chose this over enlarging the
//     design, which cut the lettering near the edge, or cutting inside it).
//   * A thin line of another colour right at the edge is taken out, the colour inside it
//     carried over it (Boss, 17 Nov 2026). Cut and print are never exactly on top of each
//     other: shifted 0.5 mm, a 0.4 mm blue line vanishes on one side and doubles on the
//     other, and the keychain looks crooked. With no line at the edge, the shift does
//     not show.
//   * One hole, 2 mm across, at the top. Boss's red dot put its centre 2 mm in from the
//     edge, which left 1 mm of acrylic: too close, said Boss, so 1.5 mm it is (centre
//     2.5 mm in), and no hole is dragged any closer. Otherwise it can go anywhere on the
//     keychain.
//   * Or a hook (Boss, 17 Nov 2026): a small round tab on the edge with the hole in it,
//     as on his "Lc Zahidah keychain" file, measured there: the tab a circle of 3.07 mm
//     round a 2.09 mm hole, its centre right on the body's edge, joined with no fillet.
//     Here the same 2 mm hole with 2 mm of acrylic round it, a 3 mm tab.
//   * The sheets are the medal FRONT templates Boss uses in CorelDRAW, Kecil 490 x 740
//     and Besar 550 x 850 mm, and smaller ones, Mini 300 x 400 or any size Boss types,
//     because a big UV print lands off at its top and left. Keychains stand 7 mm apart
//     and 7 mm in from the sheet's edge, cut line to cut line: a keychain sheet takes no
//     masking tape, so it holds as many as it can (Boss, 17 Nov 2026; the medal's 9 mm
//     and 15 mm of tape came first).
//   * An order is shared evenly over the sheets it needs, so one cut file and one print
//     file serve them all: "30 pcs a sheet, cut it 3 times, print it 3 times".

import { UV_BED_MM } from './poster.js';

export const KEYCHAIN_SIZES_MM = [40, 50, 60];
export const KEYCHAIN_BLEED_MM = 2;
export const HOLE_DIAMETER_MM = 2;
export const HOLE_MIN_WALL_MM = 1.5;   // acrylic between the hole and the edge, at least
export const HOLE_INSET_MM = HOLE_DIAMETER_MM / 2 + HOLE_MIN_WALL_MM;   // centre from the edge
export const KEYCHAIN_GAP_MM = 7;     // cut line to cut line
export const KEYCHAIN_EDGE_MM = 7;    // the sheet's edge to the nearest cut line
export const KEYCHAIN_SHEETS = [
  { id: 'kecil', label: 'Kecil', width: 490, height: 740 },
  { id: 'besar', label: 'Besar', width: 550, height: 850 },
  // Boss, 17 Nov 2026: the UV printer lands a little off at the top and left of a big
  // print, so a smaller sheet prints truer. 300 x 400 was his example.
  { id: 'mini', label: 'Mini', width: 300, height: 400 },
];
// Or a sheet of Boss's own size ("Custom"): from one 6 cm keychain and its edge up to
// the UV bed, 900 x 600 either way round. Half a Kecil sheet is 490 x 370.
export const CUSTOM_SHEET_MIN_MM = 100;
export const CUSTOM_SHEET_DEFAULT = { width: 300, height: 400 };
export const QUANTITY_MAX = 100000;
// A band at the edge this thin, against the radius, is a border line. At 5 cm it is
// 1.5 mm; anything wider is part of the design and stays.
export const BORDER_MAX_FRACTION = 0.06;
// How far past the line the colour inside it is carried, mm: the line's soft edge.
export const BORDER_MARGIN_MM = 0.15;

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A Custom sheet's size as it can be used: whole mm, within the limits above. */
export function cleanSheetSize(custom) {
  const pick = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : d);
  let width = clamp(pick(custom?.width, CUSTOM_SHEET_DEFAULT.width), CUSTOM_SHEET_MIN_MM, UV_BED_MM.long);
  let height = clamp(pick(custom?.height, CUSTOM_SHEET_DEFAULT.height), CUSTOM_SHEET_MIN_MM, UV_BED_MM.long);
  // Both sides past the bed's short side would not lie on it either way round.
  if (Math.min(width, height) > UV_BED_MM.short) {
    if (width <= height) width = UV_BED_MM.short;
    else height = UV_BED_MM.short;
  }
  return { width, height };
}

/** A sheet by id; 'custom' takes its size from `custom`. */
export function keychainSheet(id, custom) {
  if (id === 'custom') return { id: 'custom', label: 'Custom', ...cleanSheetSize(custom) };
  return KEYCHAIN_SHEETS.find((s) => s.id === id) || KEYCHAIN_SHEETS[0];
}
export const keychainSize = (mm) => (KEYCHAIN_SIZES_MM.includes(mm) ? mm : 50);

// ---- the design's circle --------------------------------------------------------

/** Not page: ink, more or less. Near-white and see-through count as page. */
export function isPainted(rgba, i) {
  return rgba[i + 3] > 16 && !(rgba[i] > 245 && rgba[i + 1] > 245 && rgba[i + 2] > 245);
}

/** Least squares circle through points [[x, y]]: { cx, cy, r }, or null. */
export function fitCircle(points) {
  if (points.length < 3) return null;
  // x² + y² = 2a x + 2b y + c, solved by its normal equations.
  let sxx = 0; let sxy = 0; let sx = 0; let syy = 0; let sy = 0; let n = 0;
  let sxz = 0; let syz = 0; let sz = 0;
  for (const [x, y] of points) {
    const z = x * x + y * y;
    sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y; n += 1;
    sxz += x * z; syz += y * z; sz += z;
  }
  const A = [[2 * sxx, 2 * sxy, sx], [2 * sxy, 2 * syy, sy], [2 * sx, 2 * sy, n]];
  const B = [sxz, syz, sz];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  if (Math.abs(d) < 1e-9) return null;
  const col = (k) => A.map((row, i) => row.map((v, j) => (j === k ? B[i] : v)));
  const a = det(col(0)) / d;
  const b = det(col(1)) / d;
  const c = det(col(2)) / d;
  const rr = c + a * a + b * b;
  return rr > 0 ? { cx: a, cy: b, r: Math.sqrt(rr) } : null;
}

/**
 * Where the design's circle is in a picture of the page.
 *
 * Rays from the middle of everything painted find its outer edge, and a circle is
 * fitted to the edge, again without the points far off it (the client's leaves poke out
 * past the ring). Then:
 *
 *   circle  a round design on a bare page: the bleed has to be made
 *   page    the design runs off every side of the page: what lies past the circle is
 *           the design's own, and the circle is the largest the page holds
 *   box     painted, but not round: the largest circle in what is painted
 *   blank   nothing painted at all
 *
 * @returns { cx, cy, r, kind, fit } in pixels; fit is the share of rays on the circle
 */
export function findDesignCircle(rgba, width, height) {
  const page = { cx: width / 2, cy: height / 2, r: Math.min(width, height) / 2, fit: 0 };
  let edge = 0;
  let edgeAll = 0;
  for (let x = 0; x < width; x += 2) {
    edgeAll += 2;
    edge += isPainted(rgba, x * 4) + isPainted(rgba, ((height - 1) * width + x) * 4);
  }
  for (let y = 0; y < height; y += 2) {
    edgeAll += 2;
    edge += isPainted(rgba, y * width * 4) + isPainted(rgba, (y * width + width - 1) * 4);
  }
  if (edge / edgeAll > 0.5) return { ...page, kind: 'page' };

  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (isPainted(rgba, (y * width + x) * 4)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { ...page, kind: 'blank' };
  const bx = (x0 + x1) / 2;
  const by = (y0 + y1) / 2;
  const box = { cx: bx, cy: by, r: Math.min(x1 - x0, y1 - y0) / 2, fit: 0, kind: 'box' };

  const RAYS = 360;
  const points = [];
  for (let k = 0; k < RAYS; k++) {
    const t = (2 * Math.PI * k) / RAYS;
    const c = Math.cos(t);
    const s = Math.sin(t);
    // From where the ray leaves the picture, inward to the first ink.
    const tx = c > 1e-9 ? (width - 1 - bx) / c : c < -1e-9 ? -bx / c : Infinity;
    const ty = s > 1e-9 ? (height - 1 - by) / s : s < -1e-9 ? -by / s : Infinity;
    for (let d = Math.floor(Math.min(tx, ty)); d > 0; d--) {
      const x = Math.round(bx + c * d);
      const y = Math.round(by + s * d);
      if (isPainted(rgba, (y * width + x) * 4)) {
        points.push([x, y]);
        break;
      }
    }
  }
  let fit = fitCircle(points);
  let kept = points;
  for (let i = 0; i < 4 && fit; i++) {
    const tol = Math.max(2, fit.r * 0.01);
    const f = fit;
    kept = points.filter(([x, y]) => Math.abs(Math.hypot(x - f.cx, y - f.cy) - f.r) <= tol);
    fit = fitCircle(kept);
  }
  if (!fit) return box;
  const share = kept.length / RAYS;
  const inside = fit.cx - fit.r >= x0 - 3 && fit.cx + fit.r <= x1 + 3
    && fit.cy - fit.r >= y0 - 3 && fit.cy + fit.r <= y1 + 3;
  return share >= 0.6 && inside ? { ...fit, fit: share, kind: 'circle' } : box;
}

// ---- the border line at its edge ------------------------------------------------

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The colour against the distance in from the circle's edge: per step, the median of
 * every angle, and how much the angles differ (a ring of one colour differs little).
 * @returns [{ depth, rgb, spread }], depth in pixels from the edge inward
 */
export function radialProfile(rgba, width, height, circle, depthPx, stepPx = 1, angles = 360) {
  const out = [];
  for (let depth = 1.5; depth <= depthPx; depth += stepPx) {
    const rr = circle.r - depth;
    if (rr <= 0) break;
    const ch = [[], [], []];
    for (let k = 0; k < angles; k++) {
      const t = (2 * Math.PI * k) / angles;
      const x = clamp(Math.round(circle.cx + rr * Math.cos(t)), 0, width - 1);
      const y = clamp(Math.round(circle.cy + rr * Math.sin(t)), 0, height - 1);
      const i = (y * width + x) * 4;
      ch[0].push(rgba[i]); ch[1].push(rgba[i + 1]); ch[2].push(rgba[i + 2]);
    }
    const rgb = ch.map(median);
    const spread = ch.map((c, j) => median(c.map((v) => Math.abs(v - rgb[j])))).reduce((a, b) => a + b, 0) / 3;
    out.push({ depth, rgb, spread });
  }
  return out;
}

/**
 * A thin ring of one colour at the very edge, with a different colour inside it: the
 * border line Boss takes out. Wider than BORDER_MAX_FRACTION of the radius it is part of
 * the design, and a ring whose colour changes round the circle is not a line at all.
 *
 * @param profile from radialProfile
 * @param r       the circle's radius, same units as the profile's depth
 * @returns null, or { fraction, rgb, inner }: its width against the radius, its colour,
 *          and the colour inside it
 */
export function findBorder(profile, r) {
  if (profile.length < 4) return null;
  const outer = profile[0];
  if (outer.spread > 40) return null;
  const isLine = (p) => distance(p.rgb, outer.rgb) > 60;
  for (let i = 1; i < profile.length - 2; i++) {
    if (isLine(profile[i]) && isLine(profile[i + 1])) {
      const width = profile[i].depth;
      if (width > r * BORDER_MAX_FRACTION) return null;
      const inner = profile[i + 1];
      if (inner.spread > 40) return null;
      return { fraction: width / r, rgb: outer.rgb, inner: inner.rgb };
    }
    if (profile[i].depth > r * BORDER_MAX_FRACTION) return null;
  }
  return null;
}

// ---- the bleed --------------------------------------------------------------------

/**
 * Carry the colour from just inside `keep` straight out, past the cut and over the
 * bleed, in place. Per angle the colour is the average of a band [from, to] (radii,
 * from < to <= keep), smoothed round the circle so one stray pixel does not streak.
 *
 * @param o { cx, cy, keep, from, to, onlyBlank }: pixels; onlyBlank: leave what is
 *          already painted, for a design that has some bleed of its own
 */
export function bleedOut(rgba, width, height, o) {
  const BINS = 720;
  const sum = new Float64Array(BINS * 3);
  const SAMPLES = 4;
  for (let b = 0; b < BINS; b++) {
    const t = ((b + 0.5) * 2 * Math.PI) / BINS;
    for (let s = 0; s < SAMPLES; s++) {
      const rr = o.from + ((o.to - o.from) * s) / (SAMPLES - 1);
      const x = clamp(Math.round(o.cx + rr * Math.cos(t)), 0, width - 1);
      const y = clamp(Math.round(o.cy + rr * Math.sin(t)), 0, height - 1);
      const i = (y * width + x) * 4;
      sum[b * 3] += rgba[i]; sum[b * 3 + 1] += rgba[i + 1]; sum[b * 3 + 2] += rgba[i + 2];
    }
  }
  const W = 4;   // bins either side
  const colour = new Uint8ClampedArray(BINS * 3);
  for (let b = 0; b < BINS; b++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -W; k <= W; k++) acc += sum[(((b + k) % BINS + BINS) % BINS) * 3 + c];
      colour[b * 3 + c] = acc / ((2 * W + 1) * SAMPLES);
    }
  }
  const keep2 = o.keep * o.keep;
  for (let y = 0; y < height; y++) {
    const dy = y + 0.5 - o.cy;
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - o.cx;
      if (dx * dx + dy * dy <= keep2) continue;
      const i = (y * width + x) * 4;
      if (o.onlyBlank && isPainted(rgba, i)) continue;
      let t = Math.atan2(dy, dx);
      if (t < 0) t += 2 * Math.PI;
      const b = Math.min(BINS - 1, Math.floor((t / (2 * Math.PI)) * BINS));
      rgba[i] = colour[b * 3]; rgba[i + 1] = colour[b * 3 + 1]; rgba[i + 2] = colour[b * 3 + 2]; rgba[i + 3] = 255;
    }
  }
}

/**
 * How the picture of one keychain is finished, in its own pixels.
 *
 * @param o { px: picture side, sizeMm, bleedMm, reachMm, kind, border, removeBorder }
 * @returns the bleedOut options, or null when the design already runs past the cut
 */
export function bleedPlan(o) {
  // The picture is a square round the keychain's centre, half of it `reachMm` across:
  // the cut and its bleed, or more where a hook stands out past them.
  const perMm = o.px / (2 * (o.reachMm ?? o.sizeMm / 2 + o.bleedMm));
  const c = o.px / 2;
  const cut = (o.sizeMm / 2) * perMm;
  if (o.kind === 'circle') {
    if (o.border && o.removeBorder) {
      const keep = cut - (o.border.fraction * (o.sizeMm / 2) + BORDER_MARGIN_MM) * perMm;
      return {
        cx: c, cy: c, keep, from: keep - 0.35 * perMm, to: keep - 0.1 * perMm, onlyBlank: false,
      };
    }
    // The edge's own colour carried out: inside a kept border line, its middle.
    const band = o.border ? o.border.fraction * (o.sizeMm / 2) * perMm : 0.4 * perMm;
    return {
      cx: c, cy: c, keep: cut, from: cut - 0.75 * band, to: cut - 0.25 * band, onlyBlank: false,
    };
  }
  // A design with ink past the cut keeps it; only bare page there gets the edge colour.
  return {
    cx: c, cy: c, keep: cut, from: cut - 0.3 * perMm, to: cut - 0.1 * perMm, onlyBlank: true,
  };
}

// ---- the hole ------------------------------------------------------------------------

export const HOLE_R = HOLE_DIAMETER_MM / 2;

/**
 * A hole as it can be used: `angle` degrees clockwise from the top, `inset` mm from
 * the cut edge to its centre, kept whole inside the keychain.
 */
export function cleanHole(hole, sizeMm) {
  const angle = Number.isFinite(hole?.angle) ? ((hole.angle % 360) + 360) % 360 : 0;
  const inset = Number.isFinite(hole?.inset) ? hole.inset : HOLE_INSET_MM;
  return { angle: r2(angle), inset: r2(clamp(inset, HOLE_R + HOLE_MIN_WALL_MM, sizeMm / 2)) };
}

/** The hole's centre from the keychain's centre, mm, y down. */
export function holeOffset(hole, sizeMm) {
  const h = cleanHole(hole, sizeMm);
  const rr = sizeMm / 2 - h.inset;
  const t = (h.angle * Math.PI) / 180;
  return { dx: r3(rr * Math.sin(t)), dy: r3(-rr * Math.cos(t)) };
}

/** Where a drag let go, from the keychain's centre, as a hole. */
export function holeFromPoint(dx, dy, sizeMm) {
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return cleanHole({ angle, inset: sizeMm / 2 - Math.hypot(dx, dy) }, sizeMm);
}

/** Acrylic left between the hole and the edge, mm. */
export const holeWall = (hole, sizeMm) => r2(cleanHole(hole, sizeMm).inset - HOLE_R);

// ---- the hook (Boss, 17 Nov 2026) ----------------------------------------------------

export const KEYCHAIN_TYPES = [
  { id: 'hole', label: 'Biasa', note: 'lubang dalam bulatan' },
  { id: 'hook', label: 'Hook', note: 'telinga di tepi, lubang di dalamnya' },
];
export const keychainType = (id) => (KEYCHAIN_TYPES.some((t) => t.id === id) ? id : 'hole');
export const HOOK_WALL_MM = 2;                // acrylic round the hole in the tab
export const HOOK_R = HOLE_R + HOOK_WALL_MM;  // the tab's radius, 3 mm

/** The hook's centre, and its hole's, from the keychain's centre: on the cut line. */
export function hookOffset(hole, sizeMm) {
  const angle = cleanHole(hole, sizeMm).angle;
  const t = (angle * Math.PI) / 180;
  return { dx: r3((sizeMm / 2) * Math.sin(t)), dy: r3((-sizeMm / 2) * Math.cos(t)) };
}

/**
 * The outline of a disc with a smaller one standing out over its edge, as SVG path data:
 * the body's arc the long way round, then the small disc's arc outside it, clockwise. No
 * fillet where they meet, as in Boss's file. Arcs go in pieces of a quarter turn at most.
 * A small disc wholly inside the body leaves the body's own circle.
 *
 * @param c { cx, cy, r } the body
 * @param t { cx, cy, r } the tab
 */
export function unionPath(c, t) {
  const dx = t.cx - c.cx;
  const dy = t.cy - c.cy;
  const d = Math.hypot(dx, dy);
  if (d + t.r <= c.r || d === 0) return circlePath(c.cx, c.cy, c.r);
  const at = (o, r, phi) => [o.cx + r * Math.cos(phi), o.cy + r * Math.sin(phi)];
  const arc = (o, r, from, to) => {   // clockwise on screen: the angle grows, y down
    const n = Math.max(1, Math.ceil((to - from) / (Math.PI / 2) - 1e-9));
    const parts = [];
    for (let k = 1; k <= n; k++) {
      const [x, y] = at(o, r, from + ((to - from) * k) / n);
      parts.push(`A ${r3(r)} ${r3(r)} 0 0 1 ${r3(x)} ${r3(y)}`);
    }
    return parts.join(' ');
  };
  const toward = Math.atan2(dy, dx);
  const a = (c.r * c.r - t.r * t.r + d * d) / (2 * d);
  const half = Math.acos(clamp(a / c.r, -1, 1));
  const b1 = toward + half;                 // where the tab leaves the body, going round
  const b2 = toward - half + 2 * Math.PI;   // and where it comes back, the long way
  const [p1x, p1y] = at(c, c.r, b1);
  const [p2x, p2y] = at(c, c.r, b2);
  const s2 = Math.atan2(p2y - t.cy, p2x - t.cx);
  let s1 = Math.atan2(p1y - t.cy, p1x - t.cx);
  while (s1 <= s2) s1 += 2 * Math.PI;
  return `M ${r3(p1x)} ${r3(p1y)} ${arc(c, c.r, b1, b2)} ${arc(t, t.r, s2, s1)} Z`;
}

/**
 * What one keychain takes on the sheet, from its centre: the box round its cut line,
 * a hook included. The sheet is laid out by these, so neighbours stay a gap apart.
 */
export function keychainFootprint(sizeMm, type, hole) {
  const R = sizeMm / 2;
  if (keychainType(type) !== 'hook') return { minX: -R, minY: -R, maxX: R, maxY: R };
  const o = hookOffset(hole, sizeMm);
  return {
    minX: Math.min(-R, o.dx - HOOK_R),
    minY: Math.min(-R, o.dy - HOOK_R),
    maxX: Math.max(R, o.dx + HOOK_R),
    maxY: Math.max(R, o.dy + HOOK_R),
  };
}

// ---- the sheet ---------------------------------------------------------------------------

/**
 * The keychains on a sheet. As many as the sheet holds, in a grid centred on it, with
 * 7 mm from every edge to the cut lines. An order bigger than one sheet is shared out
 * evenly over as few sheets as it needs, so every sheet takes the same two files: 100
 * on Kecil (96 a sheet) is two sheets of 50, not 96 and 4.
 *
 * @param o { sizeMm, sheet: id, custom: { width, height }, quantity, type, hole }:
 *          quantity left out is one full sheet; custom is the size of a 'custom' sheet;
 *          type 'hook' makes room for the hook where `hole` puts it
 * @returns { sheet, sizeMm, cols, rows, capacity, quantity, sheets, perSheet, total,
 *            spare, items: [{ x, y }] centres in mm from the sheet's top-left, fits }
 */
export function layoutKeychains(o) {
  const sheet = keychainSheet(o.sheet, o.custom);
  const size = keychainSize(o.sizeMm);
  const fp = keychainFootprint(size, o.type, o.hole);
  const boxW = fp.maxX - fp.minX;
  const boxH = fp.maxY - fp.minY;
  const pitchX = boxW + KEYCHAIN_GAP_MM;
  const pitchY = boxH + KEYCHAIN_GAP_MM;
  const margin = KEYCHAIN_EDGE_MM;   // sheet edge to cut line
  const fitIn = (len, pitch) => Math.max(0, Math.floor((len - 2 * margin + KEYCHAIN_GAP_MM + 1e-9) / pitch));
  const cols = fitIn(sheet.width, pitchX);
  const rows = fitIn(sheet.height, pitchY);
  const capacity = cols * rows;
  const base = {
    sheet: { ...sheet }, sizeMm: size, cols, rows, capacity,
  };
  if (!capacity) {
    return {
      ...base, quantity: 0, sheets: 0, perSheet: 0, total: 0, spare: 0, items: [], fits: false,
    };
  }
  const asked = Math.round(Number(o.quantity));
  const quantity = Number.isFinite(asked) && asked > 0 ? Math.min(asked, QUANTITY_MAX) : capacity;
  const sheets = Math.ceil(quantity / capacity);
  const perSheet = Math.ceil(quantity / sheets);
  const gridW = cols * boxW + (cols - 1) * KEYCHAIN_GAP_MM;
  const gridH = rows * boxH + (rows - 1) * KEYCHAIN_GAP_MM;
  const x0 = (sheet.width - gridW) / 2 - fp.minX;
  const y0 = (sheet.height - gridH) / 2 - fp.minY;
  const items = [];
  for (let i = 0; i < perSheet; i++) {
    items.push({ x: r2(x0 + (i % cols) * pitchX), y: r2(y0 + Math.floor(i / cols) * pitchY) });
  }
  return {
    ...base, quantity, sheets, perSheet, total: sheets * perSheet, spare: sheets * perSheet - quantity, items, fits: true,
  };
}

/** A circle as SVG path data: four quarter arcs, clockwise from the top. */
export function circlePath(cx, cy, r) {
  const [x, y, q] = [r3(cx), r3(cy), r3(r)];
  const a = (ex, ey) => `A ${q} ${q} 0 0 1 ${r3(ex)} ${r3(ey)}`;
  return `M ${x} ${r3(cy - r)} ${a(cx + r, cy)} ${a(cx, cy + r)} ${a(cx - r, cy)} ${a(cx, cy - r)} Z`;
}

/**
 * The design's resolution on the keychain: its biggest picture's pixels against the
 * millimetres they cover once the circle is the keychain's size. Null for a design
 * with no picture in it (all vector), which has no resolution to worry about.
 *
 * @param images  from pageImages: [{ pxW, pxH, fracW, fracH }]
 * @param pageMm  { width, height } of the page
 * @param circleR the design's radius on the page, mm
 */
export function keychainDpi(images, pageMm, circleR, sizeMm) {
  if (!images?.length || !(circleR > 0)) return null;
  const scale = sizeMm / (2 * circleR);
  const dpis = images.map((im) => Math.min(
    im.pxW / ((im.fracW * pageMm.width * scale) / 25.4),
    im.pxH / ((im.fracH * pageMm.height * scale) / 25.4),
  ));
  return Math.round(Math.min(...dpis));
}
