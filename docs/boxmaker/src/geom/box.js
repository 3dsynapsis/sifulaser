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
// Hinge clearance rule: whatever sits BEHIND the pivot swings down as the front
// lifts, straight into the rim it was resting on. Keeping that tail to at most
// t/2 puts its lowest corner exactly on the wall's inner top corner, so the two
// are tangent at rest and separate immediately - which is why every hinged panel
// stops at the inner face of its own wall rather than at the outer edge.
//
// Local panel coordinates are millimetres, y-up, origin at the panel bbox corner.

import {
  sub, len as vlen, norm, dedupe, bbox, translate,
  offsetPolygon, ellipse, rect,
} from './path.js';

export const DEFAULTS = {
  style: 'open',        // 'open' | 'lidded' | 'double'
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

export const PANEL_ORDER = [
  'front', 'back', 'left', 'right', 'bottom', 'top', 'leafFront', 'leafBack',
];

export const PANEL_LABELS = {
  front: 'Front', back: 'Back', left: 'Left', right: 'Right',
  bottom: 'Bottom', top: 'Lid', leafFront: 'Leaf front', leafBack: 'Leaf back',
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

  // A half-round dip, used for the finger hole where the two leaves meet.
  if (opts.arc) {
    const rr = (e - s) / 2;
    const c = (s + e) / 2;
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const phi = (i / steps) * Math.PI;
      out.push([c - rr * Math.cos(phi), depth * Math.sin(phi)]);
    }
    out.push([e, 0]);
    return out;
  }

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
  const double = p.style === 'double';
  const hasLid = lidded || double;
  const wallH = hasLid ? H - t : H;
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

  const pivotZ = wallH + t / 2;
  // The pin's cross-section is pinH (along the hinge) by t (the board), so the hole
  // has to clear its half-diagonal. A shorter pin means a smaller hole, a smaller
  // lug, and less of it poking above the closed lid - the reference tool's lug
  // reaches almost exactly the top of the box, so keep this tight.
  const pinH = t * 0.65;
  const hingeR = Math.hypot(pinH, t) / 2 + Math.max(0.1, fit);
  const bossR = hingeR + Math.max(0.8, t * 0.3);
  const pivotBack = W - 1.5 * t;
  const pivotFront = 1.5 * t;
  // Which walls carry a hinge, in box Y. Two of them for the double-leaf style.
  const pivots = double ? [pivotFront, pivotBack] : lidded ? [pivotBack] : [];

  // A pair of leaves pinned only at its outer edges would drop straight into the
  // box when shut. Widening each leaf to the full length past its hinge lets it
  // land on the two side walls instead, so nothing extra is needed inside.
  // The shoulder has to start clear of the boss that rises above the wall.
  const bossHalf = Math.sqrt(Math.max(0, bossR * bossR - (t / 2) ** 2));
  const shoulderGap = bossHalf + Math.max(1, t * 0.4);
  const notchR = Math.max(4, Math.min(L * 0.075, (W / 2 - 3 * t) * 0.45, 14));

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
  // The top edge runs right->left and bulges into a boss at every hinge.
  function topEdgeWithBosses(bossUs) {
    const plain = edgeRun([W, wallH], [0, wallH], [], 0);
    const dz = pivotZ - wallH;
    if (!bossUs.length || bossR <= Math.abs(dz) + 0.05) return plain;
    const hw = Math.sqrt(bossR * bossR - dz * dz);
    const usable = bossUs
      .filter((u) => u + hw < W - 0.01 && u - hw > 0.01)
      .sort((a, b) => b - a); // walking from u = W down to u = 0
    if (!usable.length) return plain;
    const pts = [[W, wallH]];
    for (const bossU of usable) {
      const uA = bossU + hw;
      const uB = bossU - hw;
      pts.push([uA, wallH]);
      const a0 = Math.atan2(wallH - pivotZ, uA - bossU);
      const a1 = Math.atan2(wallH - pivotZ, uB - bossU);
      const sweep = (a1 - a0 + Math.PI * 2) % (Math.PI * 2);
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + sweep * (i / steps);
        pts.push([bossU + bossR * Math.cos(a), pivotZ + bossR * Math.sin(a)]);
      }
      pts.push([uB, wallH]);
    }
    pts.push([0, wallH]);
    return pts;
  }

  /** `uOf` maps a box-Y coordinate to this panel's local u. */
  const buildSide = (uOf) => {
    const bossUs = pivots.map(uOf);
    const pts = [
      ...edgeRun([0, 0], [W, 0], [], 0),
      ...edgeRun([W, 0], [W, wallH], vFeats, -t),
      ...topEdgeWithBosses(bossUs),
      ...edgeRun([0, wallH], [0, 0], flipFeatures(vFeats, wallH), -t),
    ];
    const holes = yFeats.map((f) => shrinkRect(f.s, floorZ, f.e - f.s, t, fit));
    const r = hingeR + Math.max(0.1, fit);
    for (const u of bossUs) holes.push(ellipse(u, pivotZ, r, r, 40));
    return { outline: dedupe(pts), holes };
  };

  {
    const g = buildSide((y) => W - y);
    panels.push(normalisePanel({
      id: 'left', label: PANEL_LABELS.left, outline: g.outline, holes: g.holes,
      frame: { origin: [0, W, 0], U: [0, -1, 0], V: [0, 0, 1], N: [-1, 0, 0] },
    }));
  }
  {
    const g = buildSide((y) => y);
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
  const lidX = () => ({ bx0: t + p.lidGap, bx1: L - t - p.lidGap });
  const pinAt = (y, from) => [{ s: y - pinH / 2 - from, e: y + pinH / 2 - from }];

  // Past its hinge the lid widens to the full length and lands on the side walls,
  // so the closed box reads as one flat top instead of a panel sunk between two
  // exposed wall edges.
  if (lidded) {
    const g = p.lidGap;
    const { bx0: xi0, bx1: xi1 } = lidX();
    const xo0 = 0;
    const xo1 = L;
    const fy = t;          // front edge: inner face of the front wall
    const by = W - t;      // rear edge: inner face of the back wall
    const sy = pivotBack - shoulderGap;
    const lipW = Math.min(L * 0.45, Math.max(24, L * 0.28));
    const lip = [{ s: L / 2 - lipW / 2, e: L / 2 + lipW / 2 }];
    const lipInset = [{ s: L / 2 - lipW / 2 - xi0, e: L / 2 + lipW / 2 - xi0 }];
    const pin = pinAt(pivotBack, sy);
    const wide = sy > fy + t;
    const pts = wide
      ? [
        ...edgeRun([xo0, fy], [xo1, fy], lip, t, { round: t * 0.75 }),
        ...edgeRun([xo1, fy], [xo1, sy], [], 0),
        ...edgeRun([xo1, sy], [xi1, sy], [], 0),
        ...edgeRun([xi1, sy], [xi1, by], pin, t + g),
        ...edgeRun([xi1, by], [xi0, by], [], 0),
        ...edgeRun([xi0, by], [xi0, sy], flipFeatures(pin, by - sy), t + g),
        ...edgeRun([xi0, sy], [xo0, sy], [], 0),
        ...edgeRun([xo0, sy], [xo0, fy], [], 0),
      ]
      : [
        ...edgeRun([xi0, fy], [xi1, fy], lipInset, t, { round: t * 0.75 }),
        ...edgeRun([xi1, fy], [xi1, by], pinAt(pivotBack, fy), t + g),
        ...edgeRun([xi1, by], [xi0, by], [], 0),
        ...edgeRun([xi0, by], [xi0, fy], flipFeatures(pinAt(pivotBack, fy), by - fy), t + g),
      ];
    panels.push(normalisePanel({
      id: 'top', label: PANEL_LABELS.top, outline: dedupe(pts), holes: [],
      hinge: { v: pivotBack, sign: -1 },
      frame: { origin: [0, 0, wallH + t], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] },
    }));
  }

  // Two leaves that meet across the middle, each pivoting on its own wall. Past
  // the hinge each widens to the full length so it rests on the side walls; the
  // half-round notch on the free edges becomes one finger hole when shut.
  if (double) {
    const g = p.lidGap;
    const { bx0: xi0, bx1: xi1 } = lidX(); // inset body, lets the pins reach
    const xo0 = 0;
    const xo1 = L;                          // shoulder, sits on the side walls
    const mid = W / 2;
    const arc = { arc: true };
    const notchMid = [{ s: L / 2 - notchR, e: L / 2 + notchR }];

    // front leaf: inner face of the front wall -> just short of the middle
    {
      const fy = mid - g / 2;
      const fy0 = t;
      const sy = pivotFront + shoulderGap;
      const pin = pinAt(pivotFront, fy0);
      const wide = sy < fy - t;
      const pts = wide
        ? [
          ...edgeRun([xi0, fy0], [xi1, fy0], [], 0),
          ...edgeRun([xi1, fy0], [xi1, sy], pin, t + g),
          ...edgeRun([xi1, sy], [xo1, sy], [], 0),
          ...edgeRun([xo1, sy], [xo1, fy], [], 0),
          ...edgeRun([xo1, fy], [xo0, fy], notchMid, -notchR, arc),
          ...edgeRun([xo0, fy], [xo0, sy], [], 0),
          ...edgeRun([xo0, sy], [xi0, sy], [], 0),
          ...edgeRun([xi0, sy], [xi0, fy0], flipFeatures(pin, sy - fy0), t + g),
        ]
        : [
          ...edgeRun([xi0, fy0], [xi1, fy0], [], 0),
          ...edgeRun([xi1, fy0], [xi1, fy], pin, t + g),
          ...edgeRun([xi1, fy], [xi0, fy], [{ s: xi1 - L / 2 - notchR, e: xi1 - L / 2 + notchR }], -notchR, arc),
          ...edgeRun([xi0, fy], [xi0, fy0], flipFeatures(pin, fy - fy0), t + g),
        ];
      panels.push(normalisePanel({
        id: 'leafFront', label: PANEL_LABELS.leafFront, outline: dedupe(pts), holes: [],
        hinge: { v: pivotFront, sign: 1 },
        frame: { origin: [0, 0, wallH + t], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] },
      }));
    }

    // back leaf: mirror of the above, hinged on the back wall
    {
      const by = mid + g / 2;
      const by1 = W - t;
      const sy = pivotBack - shoulderGap;
      const pin = pinAt(pivotBack, sy);
      const wide = sy > by + t;
      const pinNarrow = pinAt(pivotBack, by);
      const pts = wide
        ? [
          ...edgeRun([xo0, by], [xo1, by], notchMid, -notchR, arc),
          ...edgeRun([xo1, by], [xo1, sy], [], 0),
          ...edgeRun([xo1, sy], [xi1, sy], [], 0),
          ...edgeRun([xi1, sy], [xi1, by1], pin, t + g),
          ...edgeRun([xi1, by1], [xi0, by1], [], 0),
          ...edgeRun([xi0, by1], [xi0, sy], flipFeatures(pin, by1 - sy), t + g),
          ...edgeRun([xi0, sy], [xo0, sy], [], 0),
          ...edgeRun([xo0, sy], [xo0, by], [], 0),
        ]
        : [
          ...edgeRun([xi0, by], [xi1, by], [{ s: L / 2 - xi0 - notchR, e: L / 2 - xi0 + notchR }], -notchR, arc),
          ...edgeRun([xi1, by], [xi1, by1], pinNarrow, t + g),
          ...edgeRun([xi1, by1], [xi0, by1], [], 0),
          ...edgeRun([xi0, by1], [xi0, by], flipFeatures(pinNarrow, by1 - by), t + g),
        ];
      panels.push(normalisePanel({
        id: 'leafBack', label: PANEL_LABELS.leafBack, outline: dedupe(pts), holes: [],
        hinge: { v: pivotBack, sign: -1 },
        frame: { origin: [0, 0, wallH + t], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] },
      }));
    }
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
    derived: {
      wallH, floorZ, pivotZ, hingeR, bossR, pivots, shoulderGap,
      vFeats, xFeats, yFeats,
    },
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
