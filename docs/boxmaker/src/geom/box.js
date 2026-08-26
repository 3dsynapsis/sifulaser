// Parametric panel generator for a finger-jointed laser-cut box.
//
// Joint scheme (reverse engineered from MakerWorld's Laser Box Maker, then
// re-derived so the maths is exact):
//   * vertical corners - front/back carry protruding tabs, left/right carry the
//     matching notches, so front/back bodies are (L - 2t) wide and left/right are
//     full W wide.
//   * floor - the bottom panel sits `floorOffset` above the lower edge and pushes
//     through-tenons into mortises in all four walls. Each tenon is split by
//     relief slits so it can compress into an interference fit.
//   * lid (lidded) - walls drop to H - t, the lid drops between them and pivots on
//     square pins riding in round holes inside a boss on the side walls. A rounded
//     lip on the front edge gives you something to hook a finger under.
//
// Local panel coordinates are millimetres, y-up, origin at the panel bbox corner.

import {
  sub, len as vlen, norm, dedupe, bbox, translate,
  offsetPolygon, ellipse, rect,
} from './path.js';

export const DEFAULTS = {
  style: 'open',        // 'open' | 'lidded'
  length: 100,          // X
  width: 76,            // Y
  height: 50,           // Z (outer, including the lid on a lidded box)
  thickness: 3,
  kerf: 0.2,            // laser beam width; cut paths are offset by half of it
  fit: 0.05,            // interference: slots shrink by this much (+ = tighter)
  fingerSize: 13,       // joint module; drives every finger/tenon count
  floorOffset: null,    // null -> one material thickness
  reliefSlits: 2,       // slits per floor tenon (0 disables)
  slitWidth: 0.4,
  slitOvershoot: 0.4,   // how far a slit reaches past the tenon root
  lidGap: 0.3,          // clearance each side so the lid can swing
};

export const PANEL_ORDER = ['front', 'back', 'left', 'right', 'bottom', 'top'];

export const PANEL_LABELS = {
  front: 'Front', back: 'Back', left: 'Left',
  right: 'Right', bottom: 'Bottom', top: 'Lid',
};

/**
 * Even run of joint features centred on an edge, alternating feature/gap at one
 * module each. n = round(edge / 2m) - 1 reproduces the reference tool exactly for
 * every size measured (50, 76, 100, 150 mm).
 */
export function featureLayout(edge, module_) {
  let n = Math.round(edge / (2 * module_)) - 1;
  n = Math.max(1, Math.min(24, n));
  let w = module_;
  const minMargin = Math.max(1.5, module_ * 0.3);
  const maxBlock = edge - 2 * minMargin;
  let block = (2 * n - 1) * w;
  if (block > maxBlock) {
    if (maxBlock <= 0) return [{ s: edge * 0.25, e: edge * 0.75 }];
    w = maxBlock / (2 * n - 1);
    block = maxBlock;
  }
  const start = (edge - block) / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = start + i * 2 * w;
    out.push({ s, e: s + w });
  }
  return out;
}

/** Mirror a feature list about an edge of length L (keeps it ordered). */
const flipFeatures = (feats, L) =>
  feats.map((f) => ({ s: L - f.e, e: L - f.s })).reverse();

/** Shift a feature list so it is measured from `off` instead of 0. */
const shiftFeatures = (feats, off) =>
  feats.map((f) => ({ s: f.s - off, e: f.e - off }));

/** Profile of one feature in (along, offset) space, walking from s to e. */
function featureProfile(s, e, depth, opts = {}) {
  const out = [[s, 0]];
  const sgn = Math.sign(depth) || 1;
  const r = Math.min(opts.round || 0, (e - s) / 2 - 0.01, Math.abs(depth) - 0.01);
  const rounded = r > 0.01;
  const cy = depth - sgn * r;

  if (rounded) {
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      out.push([s + r - r * Math.cos(a), cy + sgn * r * Math.sin(a)]);
    }
  } else {
    out.push([s, depth]);
  }

  const slits = opts.slits;
  if (slits && slits.count > 0 && e - s > slits.width * (slits.count + 2)) {
    const seg = (e - s) / (slits.count + 1);
    for (let i = 1; i <= slits.count; i++) {
      const c = s + seg * i;
      out.push([c - slits.width / 2, depth]);
      out.push([c - slits.width / 2, depth - sgn * slits.depth]);
      out.push([c + slits.width / 2, depth - sgn * slits.depth]);
      out.push([c + slits.width / 2, depth]);
    }
  }

  if (rounded) {
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      out.push([e - r + r * Math.sin(a), cy + sgn * r * Math.cos(a)]);
    }
  } else {
    out.push([e, depth]);
  }
  out.push([e, 0]);
  return out;
}

/**
 * Walk one edge a->b emitting `feats` as tabs (depth > 0, outward for a CCW ring)
 * or notches (depth < 0). Returns the points for this edge, excluding `b`.
 */
function edgeRun(a, b, feats, depth, opts = {}) {
  const d = sub(b, a);
  const L = vlen(d);
  const u = norm(d);
  const n = [u[1], -u[0]]; // outward normal of a CCW ring
  const P = (t, o) => [a[0] + u[0] * t + n[0] * o, a[1] + u[1] * t + n[1] * o];
  const pts = [a];
  for (const f of feats || []) {
    const s = Math.max(0, f.s);
    const e = Math.min(L, f.e);
    if (e - s <= 1e-6) continue;
    for (const [t, o] of featureProfile(s, e, depth, opts)) pts.push(P(t, o));
  }
  return pts;
}

function shrinkRect(x, y, w, h, by) {
  const b = by / 2;
  return rect(x + b, y + b, Math.max(0.2, w - by), Math.max(0.2, h - by));
}

function normalisePanel(panel) {
  const bb = bbox([panel.outline, ...panel.holes].flat());
  panel.outline = translate(panel.outline, -bb.x0, -bb.y0);
  panel.holes = panel.holes.map((h) => translate(h, -bb.x0, -bb.y0));
  panel.size = { w: bb.w, h: bb.h };
  panel.originShift = [bb.x0, bb.y0]; // panel-frame (u,v) of the normalised origin
  return panel;
}

/** Build every panel for the given parameters. */
export function buildBox(input = {}) {
  const p = { ...DEFAULTS, ...input };
  const t = Math.max(0.5, p.thickness);
  const L = Math.max(t * 8, p.length);
  const W = Math.max(t * 8, p.width);
  const H = Math.max(t * 6, p.height);
  const lidded = p.style === 'lidded';
  const wallH = lidded ? H - t : H;
  const floorZ = p.floorOffset == null ? t : Math.max(0, p.floorOffset);
  const m = Math.max(3, p.fingerSize);
  const fit = p.fit;

  const vFeats = featureLayout(wallH, m); // vertical corner joints
  const xFeats = featureLayout(L, m);     // floor tenons along X
  const yFeats = featureLayout(W, m);     // floor tenons along Y

  // The slit only has to clear the root for the tenon fingers to flex; the
  // reference tool stops about a third of a millimetre past it, and running any
  // deeper just weakens the floor.
  const slits = p.reliefSlits > 0
    ? { count: p.reliefSlits, width: p.slitWidth, depth: t + Math.max(0.1, p.slitOvershoot) }
    : null;

  const pivotY = W - 1.5 * t;
  const pivotZ = wallH + t / 2;
  const hingeR = t * 0.75;
  const bossR = hingeR + Math.max(1.2, t * 0.6);

  const panels = [];

  // ---- front / back -------------------------------------------------------
  const buildWall = () => {
    const x0 = t;
    const x1 = L - t;
    const pts = [
      ...edgeRun([x0, 0], [x1, 0], [], 0),
      ...edgeRun([x1, 0], [x1, wallH], vFeats, t),
      ...edgeRun([x1, wallH], [x0, wallH], [], 0),
      ...edgeRun([x0, wallH], [x0, 0], flipFeatures(vFeats, wallH), t),
    ];
    const holes = xFeats.map((f) => shrinkRect(f.s, floorZ, f.e - f.s, t, fit));
    return { outline: dedupe(pts), holes };
  };

  for (const id of ['front', 'back']) {
    const g = buildWall();
    panels.push(normalisePanel({
      id,
      label: PANEL_LABELS[id],
      outline: g.outline,
      holes: g.holes,
      frame: id === 'front'
        ? { origin: [0, 0, 0], U: [1, 0, 0], V: [0, 0, 1], N: [0, -1, 0] }
        : { origin: [L, W, 0], U: [-1, 0, 0], V: [0, 0, 1], N: [0, 1, 0] },
    }));
  }

  // ---- left / right -------------------------------------------------------
  // The top edge runs right->left; when lidded it bulges into a hinge boss.
  function topEdgeWithBoss(bossU) {
    const plain = edgeRun([W, wallH], [0, wallH], [], 0);
    if (!lidded) return plain;
    const dz = pivotZ - wallH;
    if (bossR <= Math.abs(dz) + 0.05) return plain;
    const hw = Math.sqrt(bossR * bossR - dz * dz);
    const uA = bossU + hw;
    const uB = bossU - hw;
    if (uA >= W - 0.01 || uB <= 0.01) return plain;
    const pts = [[W, wallH], [uA, wallH]];
    const a0 = Math.atan2(wallH - pivotZ, uA - bossU);
    const a1 = Math.atan2(wallH - pivotZ, uB - bossU);
    const sweep = (a1 - a0 + Math.PI * 2) % (Math.PI * 2);
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + sweep * (i / steps);
      pts.push([bossU + bossR * Math.cos(a), pivotZ + bossR * Math.sin(a)]);
    }
    pts.push([uB, wallH]);
    return pts;
  }

  const buildSide = (bossU) => {
    const pts = [
      ...edgeRun([0, 0], [W, 0], [], 0),
      ...edgeRun([W, 0], [W, wallH], vFeats, -t),
      ...topEdgeWithBoss(bossU),
      ...edgeRun([0, wallH], [0, 0], flipFeatures(vFeats, wallH), -t),
    ];
    const holes = yFeats.map((f) => shrinkRect(f.s, floorZ, f.e - f.s, t, fit));
    if (lidded) {
      const r = hingeR + Math.max(0.1, fit);
      holes.push(ellipse(bossU, pivotZ, r, r, 40));
    }
    return { outline: dedupe(pts), holes };
  };

  {
    const g = buildSide(1.5 * t);
    panels.push(normalisePanel({
      id: 'left', label: PANEL_LABELS.left, outline: g.outline, holes: g.holes,
      frame: { origin: [0, W, 0], U: [0, -1, 0], V: [0, 0, 1], N: [-1, 0, 0] },
    }));
  }
  {
    const g = buildSide(W - 1.5 * t);
    panels.push(normalisePanel({
      id: 'right', label: PANEL_LABELS.right, outline: g.outline, holes: g.holes,
      frame: { origin: [L, 0, 0], U: [0, 1, 0], V: [0, 0, 1], N: [1, 0, 0] },
    }));
  }

  // ---- bottom -------------------------------------------------------------
  {
    const x0 = t;
    const x1 = L - t;
    const y0 = t;
    const y1 = W - t;
    const o = { slits };
    const pts = [
      ...edgeRun([x0, y0], [x1, y0], shiftFeatures(xFeats, x0), t, o),
      ...edgeRun([x1, y0], [x1, y1], shiftFeatures(yFeats, y0), t, o),
      ...edgeRun([x1, y1], [x0, y1], shiftFeatures(flipFeatures(xFeats, L), x0), t, o),
      ...edgeRun([x0, y1], [x0, y0], shiftFeatures(flipFeatures(yFeats, W), y0), t, o),
    ];
    panels.push(normalisePanel({
      id: 'bottom', label: PANEL_LABELS.bottom, outline: dedupe(pts), holes: [],
      frame: { origin: [0, 0, floorZ + t], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] },
    }));
  }

  // ---- lid ----------------------------------------------------------------
  if (lidded) {
    const g = p.lidGap;
    const bx0 = t + g;
    const bx1 = L - t - g;
    const by0 = t;
    const by1 = W;
    const lipW = Math.min((bx1 - bx0) * 0.45, Math.max(24, L * 0.28));
    const lipDepth = t;
    const lipC = (bx0 + bx1) / 2;
    const lip = [{ s: lipC - lipW / 2 - bx0, e: lipC + lipW / 2 - bx0 }];
    const pinHalf = t / 2;
    const pinFeat = [{ s: pivotY - pinHalf - by0, e: pivotY + pinHalf - by0 }];
    const pinFlip = flipFeatures(pinFeat, by1 - by0);
    const pts = [
      ...edgeRun([bx0, by0], [bx1, by0], lip, lipDepth, { round: lipDepth * 0.75 }),
      ...edgeRun([bx1, by0], [bx1, by1], pinFeat, t + g),
      ...edgeRun([bx1, by1], [bx0, by1], [], 0),
      ...edgeRun([bx0, by1], [bx0, by0], pinFlip, t + g),
    ];
    panels.push(normalisePanel({
      id: 'top', label: PANEL_LABELS.top, outline: dedupe(pts), holes: [],
      frame: { origin: [0, 0, wallH + t], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] },
    }));
  }

  // ---- kerf compensation --------------------------------------------------
  const k = Math.max(0, p.kerf) / 2;
  for (const pan of panels) {
    pan.outlineNominal = pan.outline;
    pan.holesNominal = pan.holes;
    if (k > 0) {
      pan.outline = offsetPolygon(pan.outline, k);
      pan.holes = pan.holes.map((h) => offsetPolygon(h, -k));
    }
    pan.thickness = t;
  }

  return {
    params: { ...p, thickness: t, length: L, width: W, height: H },
    derived: { wallH, floorZ, pivotY, pivotZ, hingeR, bossR, vFeats, xFeats, yFeats },
    panels,
  };
}

/**
 * Map a point in normalised panel coordinates to world millimetres.
 * `frame.N` is the OUTWARD face normal - the side you decorate. Material fills the
 * space from the face inwards, so `depth` is negative inside the board.
 */
export function panelToWorld(panel, u, v, depth = 0) {
  const { origin, U, V, N } = panel.frame;
  const su = u + panel.originShift[0];
  const sv = v + panel.originShift[1];
  return [
    origin[0] + U[0] * su + V[0] * sv + N[0] * depth,
    origin[1] + U[1] * su + V[1] * sv + N[1] * depth,
    origin[2] + U[2] * su + V[2] * sv + N[2] * depth,
  ];
}
