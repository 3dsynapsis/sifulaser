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
//   * lid (shoebox) - a second tray, wider by the fit gap plus two board
//     thicknesses, inverted over the first. Its walls carry the same corner
//     joints as the box; its top is caught in notches cut into their top edges,
//     so it finishes flush rather than sitting in a well. This is the only style
//     whose lid rides OUTSIDE the walls, and so the only one where the finished
//     box is bigger than length x width.
//   * dividers - interior panels standing on the floor, tenoned through the walls
//     the same way the floor is. They stop short of the rim so the compartments
//     stay easy to reach into and a lid never lands on them. Four compartments
//     means two of them crossing, so they are half-lapped: the length divider is
//     notched from its top edge, the width divider from its bottom edge, and the
//     second drops straight onto the first.
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
  style: 'open',        // 'open' | 'lidded' | 'double' | 'shoebox' | 'almari'
  joint: 'standard',    // 'standard' (glue) | 'screw' (M3 captive nut, demountable)
  screwsPerEdge: 2,     // screws on each vertical corner when joint = 'screw'
  divider: 0,           // interior compartments: 0 (none) | 2 | 4
  dividerHeight: 60,    // % of the interior depth the dividers stand up
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
  lidSlack: 0.4,        // lift-off lid: gap between its inner face and the box
  lidDrop: 35,          // lift-off lid: % of the wall height its skirt covers
  lidNotch: true,       // lift-off lid: thumb notch in the front of the skirt

  // ---- Almari Laci (drawer cabinet) -------------------------------------
  tingkat: 2,        // levels: 1 or 2 only, equal size, one drawer each
  drawerSide: 0.4,   // running gap on EACH side of a drawer, mm (total is 2x)
  drawerTop: 0.8,    // headroom above the drawer. It rests on the board below,
                     // so ALL of the vertical allowance is above it: a gap
                     // underneath would be a step, not a clearance.
  drawerInset: 2,    // how far the drawer front finishes inside the cabinet
                     // face. The drawer stops on its BACK against the back
                     // wall, so the reveal you see and the gap behind it are
                     // the same number by construction.
  drawerNotch: true, // thumb notch in the top edge of each drawer front
};

export const PANEL_ORDER = [
  'front', 'back', 'left', 'right', 'bottom', 'divLength', 'divWidth',
  'top', 'leafFront', 'leafBack',
  'lidTop', 'lidFront', 'lidBack', 'lidLeft', 'lidRight',
  // Almari Laci. 'back', 'left', 'right' and 'bottom' are reused as they are.
  // This list is the only source of state.decor's keys (store.js emptyDecor),
  // and the decor writer indexes it without a guard - an id missing here is a
  // TypeError the first time anyone puts artwork on that drawer front.
  'cabTop', 'shelf',
  'd1Front', 'd1Back', 'd1Left', 'd1Right', 'd1Base',
  'd2Front', 'd2Back', 'd2Left', 'd2Right', 'd2Base',
];

export const PANEL_LABELS = {
  front: 'Front', back: 'Back', left: 'Left', right: 'Right',
  bottom: 'Bottom', top: 'Lid', leafFront: 'Leaf front', leafBack: 'Leaf back',
  divLength: 'Divider (across)', divWidth: 'Divider (along)',
  lidTop: 'Lid top', lidFront: 'Lid front', lidBack: 'Lid back',
  lidLeft: 'Lid left', lidRight: 'Lid right',
  // 'cabTop' rather than reusing 'top', whose label already reads 'Lid'. A new
  // id keeps every label single-sourced here instead of one style writing a
  // literal string at push time. Keep them short: the etched panel label is
  // centred with no width clamp, and 'D1 base' has to fit a small drawer floor.
  cabTop: 'Top', shelf: 'Shelf',
  d1Front: 'D1 front', d1Back: 'D1 back', d1Left: 'D1 left',
  d1Right: 'D1 right', d1Base: 'D1 base',
  d2Front: 'D2 front', d2Back: 'D2 back', d2Left: 'D2 left',
  d2Right: 'D2 right', d2Base: 'D2 base',
};

/**
 * M3, and only M3 - one screw, one nut, one drill bit to own.
 *
 * The hard part is edge distance, not thickness. The screw has to run inside the
 * thickness of the wall it threads into, so on the wall it passes through the
 * hole lands only t/2 from the edge. On 3 mm board that is 1.5 mm and a 3.2 mm
 * hole would break clean out. `ear` in buildBox is the answer: the side wall's
 * fingers stand slightly proud at the corners, which is all the room the hole
 * needs, and it shrinks to nothing on thicker board.
 */
export const SCREW = {
  name: 'M3',
  clear: 3.2,        // clearance hole through the panel the screw passes through
  nutAF: 5.5,        // hex nut across the flats
  nutSlack: 0.2,     // pocket is this much wider, so the nut drops in but cannot turn
  nutT: 2.4,         // nut thickness, i.e. how much thread the screw must reach
  nutLen: 5.5,       // pocket depth, long enough to push the nut in with a finger
  neck: 6,           // channel from the panel edge to the pocket
  headD: 5.5,        // button head, for the summary only
};

const STOCK_LENGTHS = [8, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40];

/**
 * The shortest stock screw that still reaches the nut: through the wall it
 * passes, down the neck, and into the thread. Nobody wants to be told to buy an
 * M3 x 21, so this only ever names a length you can actually order.
 */
export const screwLength = (t) => {
  const min = t + SCREW.neck + SCREW.nutT;
  return STOCK_LENGTHS.find((L) => L >= min) ?? Math.ceil(min / 5) * 5;
};

/**
 * Pocket depth. Above 20 mm the stock lengths jump in fives, so on thick board
 * the screw we just named can be a good deal longer than it strictly needs to
 * be - and a screw that bottoms out on solid board never clamps anything. The
 * pocket is therefore cut deep enough to swallow whatever screw was chosen.
 */
export const pocketDepth = (t) =>
  Math.max(SCREW.nutLen, screwLength(t) - t - SCREW.neck + 1);

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
  feats.map((f) => ({ ...f, s: L - f.e, e: L - f.s })).reverse();

/** Shift a feature list so it is measured from `off` instead of 0. */
const shiftFeatures = (feats, off) =>
  feats.map((f) => ({ s: f.s - off, e: f.e - off }));

/** Profile of one feature in (along, offset) space, walking from s to e. */
function featureProfile(s, e, depth, opts = {}) {
  const out = [[s, 0]];
  const sgn = Math.sign(depth) || 1;

  // The screw joint's keyhole: a narrow channel in from the edge that opens into
  // a pocket the nut drops into. The pocket is only as wide as the nut's flats,
  // so the nut cannot turn - which is the whole point, you tighten the screw
  // one-handed. `s..e` is the pocket width; the channel is centred inside it.
  if (opts.tslot) {
    const { channel, pocketW, pocketL, neck } = opts.tslot;
    const mid = (s + e) / 2;
    const d1 = sgn * neck;
    const d2 = sgn * (neck + pocketL);
    return [
      [mid - channel / 2, 0], [mid - channel / 2, d1],
      [mid - pocketW / 2, d1], [mid - pocketW / 2, d2],
      [mid + pocketW / 2, d2], [mid + pocketW / 2, d1],
      [mid + channel / 2, d1], [mid + channel / 2, 0],
    ];
  }

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
 *
 * A feature may carry its own `depth` and `opts`, which lets one edge mix kinds -
 * the screw joint puts finger tabs and nut pockets on the same edge, pointing
 * opposite ways. Features must be sorted along the walk.
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
    const fd = f.depth == null ? depth : f.depth;
    const fo = f.opts || opts;
    for (const [t, o] of featureProfile(s, e, fd, fo)) pts.push(P(t, o));
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
  // A lid that lifts clean off, so the walls stop a board short and the lid's own
  // top makes up the height - the same bookkeeping as the hinged styles.
  const shoebox = p.style === 'shoebox';
  // A drawer cabinet: open at the front, closed everywhere else. Its top board is
  // CAPTURED between the side walls exactly as the floor is rather than sitting
  // on them, so it does NOT join hasLid - the walls run the full height and the
  // finished cabinet really is length x width x height.
  const almari = p.style === 'almari';
  const hasLid = lidded || double || shoebox;
  const wallH = hasLid ? H - t : H;
  // Exactly two legal states, so the level arithmetic and the panel ids agree.
  // Declared up here rather than with the rest of the level maths because the
  // floor cap below needs to know how many boards are going to be stacked.
  const tingkat = p.tingkat === 1 ? 1 : 2;
  const floorRaw = p.floorOffset == null ? t : Math.max(0, p.floorOffset);
  // The cabinet stacks tingkat + 1 horizontal boards where every other style
  // stacks one, so a floor dragged near the top does not merely make a shallow
  // box here - it drives the shelf and the top board through each other, and
  // three boards cut for the same band is scrap with nothing to say so. Cap the
  // floor so each board keeps its own thickness. This is the almari's own limit;
  // the other styles keep the tolerance for an absurd floor that they already had.
  const floorZ = almari
    ? Math.min(floorRaw, Math.max(0, H - (tingkat + 1) * t))
    : floorRaw;
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

  // ---- dividers -----------------------------------------------------------
  // They stand on the floor and rise part-way up, so the compartments stay open
  // to reach into and a lid closes over them rather than onto them. Both run
  // through the middle: the "length" divider spans Y at x = L/2 and tenons into
  // the front and back walls, the "width" divider spans X at y = W/2 and tenons
  // into the side walls.
  const divCount = p.divider === 2 || p.divider === 4 ? p.divider : 0;
  const divBase = floorZ + t;      // top face of the floor
  const divFrac = Math.min(1, Math.max(0.2, (p.dividerHeight ?? 60) / 100));
  const divH = (wallH - divBase) * divFrac;
  const divCross = divCount === 4;
  // Dividers and drawers want the same interior, and the combination cannot be
  // assembled - the drawer would have to pass through the divider.
  const divOK = !almari && divCount > 0
    && divH > Math.max(6, t * 3)
    && Math.min(L, W) > 8 * t;
  // A divider only stands square if it is pinned in more than one place, so its
  // module is capped at a sixth of the height - that always yields >= 2 tenons
  // where the wall's own module would often have given 1.
  const divFeats = divOK
    ? featureLayout(divH, Math.max(2, Math.min(m, divH / 6)))
    : [];
  /** Mortises for one divider, centred on `u` in a wall's local frame. */
  const divMortises = (u) =>
    divFeats.map((f) => shrinkRect(u - t / 2, divBase + f.s, t, f.e - f.s, fit));

  // ---- almari levels ------------------------------------------------------
  // Hoisted above the screw block on purpose: screwHeights() has to know where
  // the shelf and the top board's notches sit before it picks a pocket height.
  // (`tingkat` itself is declared with floorZ, which is capped against it.)
  const botTop = floorZ + t;                              // top face of the floor
  const topZ = H - t;                                     // underside of the top
  const intH = topZ - botTop;                             // total clear interior
  const cellH = (intH - (tingkat - 1) * t) / tingkat;     // one level
  const shelfZ = botTop + cellH;                          // underside of the shelf
  /** Running surface of level i, i = 0 lowest. */
  const lz = (i) => botTop + i * (cellH + t);
  // Where a horizontal board is received by a CLOSED mortise. The top board is
  // not in this list: it is caught in open notches cut down from the top edges.
  const bandZs = almari
    ? (tingkat === 2 ? [floorZ, shelfZ] : [floorZ])
    : [];

  // ---- screw joint --------------------------------------------------------
  // Front and back carry the nut pockets, cut into their vertical edges; the
  // side walls carry the clearance holes. The screw therefore runs inside the
  // front wall's thickness, which is why the board has to be thicker than it.
  //
  // Screws go where the finger joint leaves room. Rather than force a spacing,
  // the free runs between tabs are measured and the biggest ones are used - so a
  // screw never lands on a tab, and there are only ever as many as asked for.
  const wantScrew = p.joint === 'screw';
  const nutPocketL = pocketDepth(t);
  const screwReachAhead = SCREW.neck + nutPocketL;
  // Two pockets reach in from opposite edges of the same wall, so the wall has to
  // be wide enough for both plus some material between them.
  // The cabinet has no front wall, so only the back carries pockets and L is the
  // dimension that has to be wide enough for them - not the smaller of the two.
  const screwSpan = almari ? L : Math.min(L, W);
  const screwRoom = screwSpan - 2 * t > 2 * screwReachAhead + 6;
  // The screw sits on the mid-plane of the wall it threads into, which is only
  // t/2 from the edge of the wall it passes through - on 3 mm board that is
  // 1.5 mm, and a 3.2 mm hole there breaks straight out of the edge. So the side
  // wall's fingers are made to stand a little proud at the corners, which buys
  // the hole the edge distance it needs. The overhang shrinks as the board gets
  // thicker and disappears entirely once t/2 alone is enough.
  const edgeWant = SCREW.clear / 2 + 1.8;
  const screwFits = wantScrew && screwRoom;
  const ear = screwFits ? Math.max(0, Math.round((edgeWant - t / 2) * 10) / 10) : 0;
  const pocketW = SCREW.nutAF + SCREW.nutSlack;
  const screwReach = screwReachAhead;
  const tslotOpts = {
    tslot: {
      channel: SCREW.clear, pocketW, pocketL: nutPocketL, neck: SCREW.neck,
    },
  };

  function screwHeights() {
    if (!screwFits) return [];
    const want = Math.max(1, Math.min(4, Math.round(p.screwsPerEdge ?? 2)));
    const need = pocketW + 3;
    // Free runs on the vertical edge: between the finger tabs, and clear of the
    // band where the floor's own mortises already are.
    // Every mortise band has to be in here. A pocket driven through one is cut
    // silently - nothing downstream looks at what the pocket lands on.
    const blocked = [
      ...vFeats.map((f) => [f.s, f.e]),
      [floorZ - 1, floorZ + t + 1],
      ...(almari ? [
        ...(tingkat === 2 ? [[shelfZ - 1, shelfZ + t + 1]] : []),
        [H - t - 1, H],                       // the top board's notch band
      ] : []),
    ].sort((a, b) => a[0] - b[0]);
    const free = [];
    let at = 0;
    for (const [bs, be] of blocked) {
      if (bs - at >= need) free.push([at, bs]);
      at = Math.max(at, be);
    }
    if (wallH - at >= need) free.push([at, wallH]);
    return free
      .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))
      .slice(0, want)
      .map(([a, b]) => (a + b) / 2)
      .sort((a, b) => a - b);
  }
  const screwZs = screwHeights();

  /** Nut pockets for one vertical edge, measured from the start of the walk. */
  const tslotFeats = (from, flip) => screwZs.map((z) => {
    const at = flip ? from - z : z - from;
    return {
      s: at - pocketW / 2, e: at + pocketW / 2,
      depth: -screwReach, opts: tslotOpts,
    };
  });

  /** Merge tabs and nut pockets onto one edge, in walk order. */
  const withSlots = (feats, from, flip) => (screwZs.length
    ? [...feats, ...tslotFeats(from, flip)].sort((a, b) => a.s - b.s)
    : feats);

  // ---- shared feature-list helpers ----------------------------------------
  // The receiving notch shrinks by `fit`, the same interference the floor
  // mortises are cut with.
  const snug = (fs) => fs.map((f) => ({ s: f.s + fit / 2, e: f.e - fit / 2 }));
  /** Re-express absolute-axis features for a walk from a to b along that axis. */
  const forWalk = (fs, a, b) => (b > a
    ? fs.map((f) => ({ s: f.s - a, e: f.e - a }))
    : fs.map((f) => ({ s: a - f.e, e: a - f.s })).reverse());
  /**
   * Keep only the features that fall wholly inside [a, b]. A feature straddling
   * the end of an edge produces a partial profile and a broken ring, so the SAME
   * filtered list must drive both the tenon and the mortise that receives it.
   */
  const keep = (fs, a, b) => fs.filter((f) => f.s > a && f.e < b);

  let lidInfo = null;

  const panels = [];

  // ---- front / back -------------------------------------------------------
  const buildWall = () => {
    const x0 = t;
    const x1 = L - t;
    const pts = [
      ...edgeRun([x0, 0], [x1, 0], [], 0),
      // right edge walks upward from z = 0, left edge downward from z = wallH
      ...edgeRun([x1, 0], [x1, wallH], withSlots(vFeats, 0, false), t),
      ...edgeRun([x1, wallH], [x0, wallH], [], 0),
      ...edgeRun([x0, wallH], [x0, 0],
        withSlots(flipFeatures(vFeats, wallH), wallH, true), t),
    ];
    const holes = xFeats.map((f) => shrinkRect(f.s, floorZ, f.e - f.s, t, fit));
    // The length divider sits dead centre, so it lands on u = L/2 either way round.
    if (divOK) holes.push(...divMortises(L / 2));
    return { outline: dedupe(pts), holes };
  };

  // The almari builds its own carcass below: it has no front wall at all, and its
  // side walls and boards carry a different set of joints. Rather than fork the
  // corner-joint maths in here with a mode flag, this style writes its own small
  // local builders, the way the lift-off lid already does.
  if (!almari) {
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
  }

  // ---- left / right -------------------------------------------------------
  // The top edge runs right->left and bulges into a boss at every hinge.
  function topEdgeWithBosses(bossUs, eL = 0, eR = W) {
    const plain = edgeRun([eR, wallH], [eL, wallH], [], 0);
    const dz = pivotZ - wallH;
    if (!bossUs.length || bossR <= Math.abs(dz) + 0.05) return plain;
    const hw = Math.sqrt(bossR * bossR - dz * dz);
    const usable = bossUs
      .filter((u) => u + hw < eR - 0.01 && u - hw > eL + 0.01)
      .sort((a, b) => b - a); // walking from the right end down to the left
    if (!usable.length) return plain;
    const pts = [[eR, wallH]];
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
    pts.push([eL, wallH]);
    return pts;
  }

  /** `uOf` maps a box-Y coordinate to this panel's local u. */
  const buildSide = (uOf) => {
    const bossUs = pivots.map(uOf);
    // Finger tips sit at -ear and W+ear; the notches still bottom out on the
    // inner face of the wall they receive, so they simply get `ear` deeper.
    const eL = -ear;
    const eR = W + ear;
    const pts = [
      ...edgeRun([eL, 0], [eR, 0], [], 0),
      ...edgeRun([eR, 0], [eR, wallH], vFeats, -(t + ear)),
      ...topEdgeWithBosses(bossUs, eL, eR),
      ...edgeRun([eL, wallH], [eL, 0], flipFeatures(vFeats, wallH), -(t + ear)),
    ];
    const holes = yFeats.map((f) => shrinkRect(f.s, floorZ, f.e - f.s, t, fit));
    if (divOK && divCross) holes.push(...divMortises(W / 2));
    // Clearance holes for the screws. They sit on the mid-plane of the wall the
    // screw threads into, which is half a board thickness in from each end.
    for (const z of screwZs) {
      for (const y of [t / 2, W - t / 2]) {
        holes.push(ellipse(uOf(y), z, SCREW.clear / 2, SCREW.clear / 2, 32));
      }
    }
    const r = hingeR + Math.max(0.1, fit);
    for (const u of bossUs) holes.push(ellipse(u, pivotZ, r, r, 40));
    return { outline: dedupe(pts), holes };
  };

  if (!almari) {
    const g = buildSide((y) => W - y);
    panels.push(normalisePanel({
      id: 'left', label: PANEL_LABELS.left, outline: g.outline, holes: g.holes,
      frame: { origin: [0, W, 0], U: [0, -1, 0], V: [0, 0, 1], N: [-1, 0, 0] },
    }));
  }
  if (!almari) {
    const g = buildSide((y) => y);
    panels.push(normalisePanel({
      id: 'right', label: PANEL_LABELS.right, outline: g.outline, holes: g.holes,
      frame: { origin: [L, 0, 0], U: [0, 1, 0], V: [0, 0, 1], N: [1, 0, 0] },
    }));
  }

  // ---- bottom -------------------------------------------------------------
  if (!almari) {
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

  // ---- divider panels -----------------------------------------------------
  // `span` is the outer wall-to-wall run the panel bridges; the body stops at the
  // inner faces and tenons reach back out through them. `lap` cuts the half-lap
  // slot for the crossing pair - 'top' on the one that goes in first, 'bottom' on
  // the one that drops onto it.
  function buildDivider(span, lap) {
    const a = t;
    const b = span - t;
    const mid = span / 2;
    const half = divH / 2;
    const slotW = Math.max(0.3, t - fit);
    const slot = (from) => [{ s: from - slotW / 2, e: from + slotW / 2 }];
    const top = lap === 'top' ? slot(b - mid) : [];      // walked b -> a
    const bottom = lap === 'bottom' ? slot(mid - a) : []; // walked a -> b
    return dedupe([
      ...edgeRun([a, 0], [b, 0], bottom, -half),
      ...edgeRun([b, 0], [b, divH], divFeats, t),
      ...edgeRun([b, divH], [a, divH], top, -half),
      ...edgeRun([a, divH], [a, 0], flipFeatures(divFeats, divH), t),
    ]);
  }

  if (divOK) {
    panels.push(normalisePanel({
      id: 'divLength',
      label: PANEL_LABELS.divLength,
      outline: buildDivider(W, divCross ? 'top' : null),
      holes: [],
      frame: {
        origin: [L / 2 + t / 2, 0, divBase], U: [0, 1, 0], V: [0, 0, 1], N: [1, 0, 0],
      },
    }));
    if (divCross) {
      panels.push(normalisePanel({
        id: 'divWidth',
        label: PANEL_LABELS.divWidth,
        outline: buildDivider(L, 'bottom'),
        holes: [],
        frame: {
          origin: [0, W / 2 - t / 2, divBase], U: [1, 0, 0], V: [0, 0, 1], N: [0, -1, 0],
        },
      }));
    }
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

  // ---- lift-off lid -------------------------------------------------------
  // A second tray, inverted and dropped over the first. The walls carry the same
  // corner finger joints as the box; the top is caught in notches cut into their
  // top edges, so it finishes flush instead of sitting in a shallow well that
  // collects dust.
  //
  // The whole style hangs on one number: the gap between the lid's inner face and
  // the box's outer face. Kerf is already compensated on both parts, so this is a
  // real clearance and it is the only clearance there is - which is why it starts
  // generous. A lid half a millimetre too tight does not go on at all, and there
  // is nothing to do about it afterwards but cut another one.
  if (shoebox) {
    const slack = Math.max(0.05, p.lidSlack ?? DEFAULTS.lidSlack);
    // The screw joint leaves the side walls' fingers standing `ear` proud of W.
    // The lid has to clear what was actually cut, not the nominal width.
    const inL = L + 2 * slack;
    const inW = W + 2 * ear + 2 * slack;
    const oL = inL + 2 * t;
    const oW = inW + 2 * t;

    const frac = Math.min(0.95, Math.max(0.1, (p.lidDrop ?? DEFAULTS.lidDrop) / 100));
    // Under about two and a half board thicknesses there is no room left to cut a
    // corner joint into, so a very shallow lid is quietly deepened rather than
    // exported as a part that cannot be assembled.
    const drop = Math.min(wallH, Math.max(t * 2.5, wallH * frac));
    const hL = drop + t;

    // Corner joints are laid out over the skirt only, not the whole wall. They
    // stay clear of the top band either way - the two joints never share a place
    // along the edge - so this is a look, not a rule: every finger then falls in
    // the band you can actually see, and the top board is left unbroken for the
    // joint that holds the lid top.
    const skirt = hL - t;
    const lm = Math.max(3, Math.min(m, skirt / 5));
    const cFeats = featureLayout(skirt, lm);

    // Where the lid top's tabs land, in lid coordinates. featureLayout is centred
    // and therefore symmetric, so one list serves a wall and the wall facing it.
    const tabX = featureLayout(inL, m).map((f) => ({ s: t + f.s, e: t + f.e }));
    const tabY = featureLayout(inW, m).map((f) => ({ s: t + f.s, e: t + f.e }));
    // The thumb notch, so there is something to hook a finger under. It is capped
    // against the drop as well as the length: on a shallow lid a notch sized off
    // the length alone would cut straight through into the top.
    const thumbR = Math.min(
      Math.max(4, Math.min(oL * 0.06, 12)), drop * 0.5, inL * 0.2,
    );
    const thumb = (p.lidNotch ?? true) !== false && thumbR >= 2.5;

    /** Front and back of the lid: tabs on the corners, notches along the top. */
    const wallX = (withThumb) => {
      const x0 = t;
      const x1 = oL - t;
      const dip = withThumb && thumb
        ? [{ s: inL / 2 - thumbR, e: inL / 2 + thumbR }]
        : [];
      return dedupe([
        ...edgeRun([x0, 0], [x1, 0], dip, -thumbR, { arc: true }),
        ...edgeRun([x1, 0], [x1, hL], cFeats, t),
        ...edgeRun([x1, hL], [x0, hL], forWalk(snug(tabX), x1, x0), -t),
        ...edgeRun([x0, hL], [x0, 0], flipFeatures(cFeats, hL), t),
      ]);
    };

    /** Sides of the lid: they receive the corner tabs, and the top's Y tabs. */
    const wallY = () => dedupe([
      ...edgeRun([0, 0], [oW, 0], [], 0),
      ...edgeRun([oW, 0], [oW, hL], cFeats, -t),
      ...edgeRun([oW, hL], [0, hL], forWalk(snug(tabY), oW, 0), -t),
      ...edgeRun([0, hL], [0, 0], flipFeatures(cFeats, hL), -t),
    ]);

    /** The top itself: a plain panel with a tab run on all four edges. */
    const lidTop = () => {
      const x0 = t;
      const x1 = oL - t;
      const y0 = t;
      const y1 = oW - t;
      return dedupe([
        ...edgeRun([x0, y0], [x1, y0], forWalk(tabX, x0, x1), t),
        ...edgeRun([x1, y0], [x1, y1], forWalk(tabY, y0, y1), t),
        ...edgeRun([x1, y1], [x0, y1], forWalk(tabX, x1, x0), t),
        ...edgeRun([x0, y1], [x0, y0], forWalk(tabY, y1, y0), t),
      ]);
    };

    // Lid coordinates sit inside box coordinates: the skirt hangs `drop` below the
    // rim and stands t + slack outside the walls on every side.
    const ox = -(slack + t);
    const oy = -(ear + slack + t);
    const oz = wallH - drop;
    // How far it rises when you open the box in the preview: clear of the rim,
    // with enough daylight that it reads as lifted off rather than ajar.
    const lift = drop + Math.max(10, H * 0.3);
    const add = (id, outline, frame) => panels.push(normalisePanel({
      id, label: PANEL_LABELS[id], outline, holes: [], lift, frame,
    }));

    add('lidFront', wallX(true),
      { origin: [ox, oy, oz], U: [1, 0, 0], V: [0, 0, 1], N: [0, -1, 0] });
    add('lidBack', wallX(false),
      { origin: [ox + oL, oy + oW, oz], U: [-1, 0, 0], V: [0, 0, 1], N: [0, 1, 0] });
    add('lidLeft', wallY(),
      { origin: [ox, oy + oW, oz], U: [0, -1, 0], V: [0, 0, 1], N: [-1, 0, 0] });
    add('lidRight', wallY(),
      { origin: [ox + oL, oy, oz], U: [0, 1, 0], V: [0, 0, 1], N: [1, 0, 0] });
    add('lidTop', lidTop(),
      { origin: [ox, oy, oz + hL], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] });

    lidInfo = {
      slack, drop, height: hL, outerL: oL, outerW: oW,
      thumbR: thumb ? thumbR : 0,
    };
  }

  // ---- almari laci: drawer cabinet ----------------------------------------
  // Nothing is rotated and nothing is renamed. X is across the front, Y runs
  // front to back with the open face at y = 0, Z is floor to the top surface.
  //
  // The joints are the box's own, rearranged: the back wall carries the vertical
  // tabs and the side walls the matching notches, so there is one jointed corner
  // pair instead of four. All three horizontal boards - floor, shelf and top -
  // are the same part, tenoned through the sides and the back. The floor and the
  // shelf land in closed mortises; the top lands in open notches cut down from
  // the walls' top edges, because its own edge IS the top edge and a closed
  // mortise there would break out. So the top drops in from above, last.
  //
  // The drawer clearances are running gaps and are their own parameters. `fit` is
  // the opposite sign - it shrinks receiving slots for an interference - so
  // wiring a drawer gap to it would tighten the drawer as the user loosened the
  // joints.
  let almariInfo = null;
  if (almari) {
    const hSpan = W - t;                              // open front to the back
    // featureLayout degrades to a single feature spanning the middle half of a
    // short edge. Capping the module at a fifth of the span always resolves the
    // count to at least two, which is the difference between a joint and a peg.
    const hm = Math.max(3, Math.min(m, hSpan / 5));
    const yhFeats = featureLayout(hSpan, hm);         // absolute in box Y, from 0
    // yhFeats is symmetric about (W - t)/2, NOT about W/2, so unlike every other
    // run in this file it does not map onto itself under the left/right mirror.
    // The two side walls genuinely need different lists, and both look entirely
    // plausible on the cut sheet if you get it wrong.
    const yhLeft = flipFeatures(yhFeats, W);          // the same run in left-wall u
    // The wall body starts a board in from each end, so a tenon laid out over the
    // full length can begin inside the corner band. Filter once, share the list.
    const topX = keep(xFeats, t + 0.5, L - t - 0.5);

    // ---- back wall: tabs on both vertical corners, notches along the top ----
    {
      const x0 = t;
      const x1 = L - t;
      const outline = dedupe([
        ...edgeRun([x0, 0], [x1, 0], [], 0),
        ...edgeRun([x1, 0], [x1, H], withSlots(vFeats, 0, false), t),
        ...edgeRun([x1, H], [x0, H], forWalk(snug(topX), x1, x0), -t),
        ...edgeRun([x0, H], [x0, 0],
          withSlots(flipFeatures(vFeats, H), H, true), t),
      ]);
      // Panel u = L - x, and topX is symmetric about L/2, so one list serves both
      // the outline and the mortises.
      const holes = [];
      for (const z of bandZs) {
        holes.push(...topX.map((f) => shrinkRect(f.s, z, f.e - f.s, t, fit)));
      }
      panels.push(normalisePanel({
        id: 'back', label: PANEL_LABELS.back, outline, holes,
        frame: { origin: [L, W, 0], U: [-1, 0, 0], V: [0, 0, 1], N: [0, 1, 0] },
      }));
    }

    // ---- side walls: front edge free, back corner notched ------------------
    {
      // Left panel u = W - y: the open front is at u = W, the back at u = 0.
      const outline = dedupe([
        ...edgeRun([-ear, 0], [W, 0], [], 0),
        ...edgeRun([W, 0], [W, H], [], 0),                       // free front edge
        ...edgeRun([W, H], [-ear, H], forWalk(snug(yhLeft), W, -ear), -t),
        ...edgeRun([-ear, H], [-ear, 0], flipFeatures(vFeats, H), -(t + ear)),
      ]);
      const holes = [];
      for (const z of bandZs) {
        holes.push(...yhLeft.map((f) => shrinkRect(f.s, z, f.e - f.s, t, fit)));
      }
      // One clearance hole per screw, not two: there is no front wall to bolt to.
      for (const z of screwZs) {
        holes.push(ellipse(t / 2, z, SCREW.clear / 2, SCREW.clear / 2, 32));
      }
      panels.push(normalisePanel({
        id: 'left', label: PANEL_LABELS.left, outline, holes,
        frame: { origin: [0, W, 0], U: [0, -1, 0], V: [0, 0, 1], N: [-1, 0, 0] },
      }));
    }
    {
      // Right panel u = y: the open front is at u = 0, the back at u = W.
      const outline = dedupe([
        ...edgeRun([0, 0], [W + ear, 0], [], 0),
        ...edgeRun([W + ear, 0], [W + ear, H], vFeats, -(t + ear)),
        ...edgeRun([W + ear, H], [0, H], forWalk(snug(yhFeats), W + ear, 0), -t),
        ...edgeRun([0, H], [0, 0], [], 0),                       // free front edge
      ]);
      const holes = [];
      for (const z of bandZs) {
        holes.push(...yhFeats.map((f) => shrinkRect(f.s, z, f.e - f.s, t, fit)));
      }
      for (const z of screwZs) {
        holes.push(ellipse(W - t / 2, z, SCREW.clear / 2, SCREW.clear / 2, 32));
      }
      panels.push(normalisePanel({
        id: 'right', label: PANEL_LABELS.right, outline, holes,
        frame: { origin: [L, 0, 0], U: [0, 1, 0], V: [0, 0, 1], N: [1, 0, 0] },
      }));
    }

    // ---- the three horizontal boards ---------------------------------------
    // Floor, shelf and top are byte-identical parts; only the frame's z differs.
    // Nothing on the part tells them apart except the etched label, which is
    // worth saying out loud in the assembly steps rather than differentiating
    // three boards that do not need to differ.
    const board = () => {
      const x0 = t;
      const x1 = L - t;
      const y1 = W - t;
      const o = { slits };
      return dedupe([
        ...edgeRun([x0, 0], [x1, 0], [], 0),                     // flush at y = 0
        ...edgeRun([x1, 0], [x1, y1], yhFeats, t, o),
        ...edgeRun([x1, y1], [x0, y1],
          shiftFeatures(flipFeatures(topX, L), t), t, o),
        ...edgeRun([x0, y1], [x0, 0], flipFeatures(yhFeats, y1), t, o),
      ]);
    };
    const addBoard = (id, z) => panels.push(normalisePanel({
      id, label: PANEL_LABELS[id], outline: board(), holes: [],
      frame: { origin: [0, 0, z], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] },
    }));
    // Material fills from the outward face inwards, and all three N are +z
    // because each board is a surface something rests on.
    addBoard('bottom', floorZ + t);
    if (tingkat === 2) addBoard('shelf', shelfZ + t);
    addBoard('cabTop', H);

    // ---- the drawers --------------------------------------------------------
    const cs = Math.max(0, p.drawerSide);
    const ct = Math.max(0, p.drawerTop);
    const ci = Math.max(0, p.drawerInset);
    const dL = L - 2 * t - 2 * cs;    // outer width  (X)
    const dD = W - t - ci;            // outer depth  (Y)
    const dH = cellH - ct;            // outer height (Z)
    const ox = t + cs;                // world x of the drawer's left outer face
    // The base sits a board up, so the drawer runs on four thin wall edges rather
    // than on a whole panel - lower friction, and a loaded base cannot drag.
    const dFloorZ = t;
    // Quiet degradation, the same shape as divOK: a cabinet too small to hold a
    // jointed drawer emits none rather than emitting scrap.
    const drawersOK = dL >= Math.max(20, 8 * t)
      && dD >= Math.max(20, 6 * t)
      && dH >= Math.max(10, 4 * t);
    const drawerWhy = drawersOK ? null
      : dL < Math.max(20, 8 * t)
        ? 'The cabinet is too narrow for a drawer: the opening leaves '
          + `${Math.round(dL * 10) / 10} mm across, and a jointed drawer needs `
          + `at least ${Math.max(20, 8 * t)} mm.`
        : dD < Math.max(20, 6 * t)
          ? 'The cabinet is too shallow for a drawer: it leaves '
            + `${Math.round(dD * 10) / 10} mm front to back, and a jointed `
            + `drawer needs at least ${Math.max(20, 6 * t)} mm.`
          : 'Each level is too short for a drawer: it leaves '
            + `${Math.round(dH * 10) / 10} mm of headroom, and a jointed drawer `
            + `needs at least ${Math.max(10, 4 * t)} mm. Try one tingkat, a `
            + 'taller cabinet, or thinner board.';

    let drawerInfo = null;
    if (drawersOK) {
      // Same cap as the carcass's own short runs: a drawer wall is short enough
      // that the wall module would often give one feature, which is a peg.
      const dm = (edge) => Math.max(2, Math.min(m, edge / 5));
      const dvFeats = featureLayout(dH, dm(dH));   // corner joints, vertical
      const dxFeats = featureLayout(dL, dm(dL));   // base tenons along X
      const dyFeats = featureLayout(dD, dm(dD));   // base tenons along Y
      const dtX = keep(dxFeats, t + 0.5, dL - t - 0.5);
      const dtY = keep(dyFeats, t + 0.5, dD - t - 0.5);

      // The thumb notch, capped against the drawer front's OWN material rather
      // than against the cabinet - the same three-cap structure the lift-off
      // lid's notch uses, with the right denominators. Big enough to hook a
      // finger into is the point of it; neatness loses to that here.
      const thumbR = Math.min(
        Math.max(6, Math.min(dL * 0.09, 14)),   // comfort band
        dH - 2 * t - 1.5,                       // clear of its own base mortises
        // Reserves 30% of the walk to each corner tab. Measured, this is a
        // MARGIN and not a severing guard: on the shortest cabinet that still
        // gets a notch, dropping this cap leaves 2.6 mm of meat rather than
        // none. It buys a corner that looks deliberate instead of nibbled.
        (dL - 2 * t) * 0.2,
      );
      const thumb = (p.drawerNotch ?? true) !== false && thumbR >= 2.5;

      /** Front or back wall of a drawer. Only the front carries the notch. */
      const dWallX = (withThumb) => {
        const x0 = t;
        const x1 = dL - t;
        // The top edge is walked from x1 back to x0, so the walk's midpoint is
        // (dL - 2t)/2. Writing dL/2 here shifts the notch off centre by t.
        const dip = withThumb && thumb
          ? [{ s: (dL - 2 * t) / 2 - thumbR, e: (dL - 2 * t) / 2 + thumbR }]
          : [];
        return dedupe([
          ...edgeRun([x0, 0], [x1, 0], [], 0),
          ...edgeRun([x1, 0], [x1, dH], dvFeats, t),
          ...edgeRun([x1, dH], [x0, dH], dip, -thumbR, { arc: true }),
          ...edgeRun([x0, dH], [x0, 0], flipFeatures(dvFeats, dH), t),
        ]);
      };
      /** Side wall of a drawer. dtY is symmetric, so one outline serves both. */
      const dWallY = () => dedupe([
        ...edgeRun([0, 0], [dD, 0], [], 0),
        ...edgeRun([dD, 0], [dD, dH], dvFeats, -t),
        ...edgeRun([dD, dH], [0, dH], [], 0),
        ...edgeRun([0, dH], [0, 0], flipFeatures(dvFeats, dH), -t),
      ]);
      /** Drawer base: the main box's floor walk, with L -> dL and W -> dD. */
      const dBase = () => {
        const x0 = t;
        const x1 = dL - t;
        const y0 = t;
        const y1 = dD - t;
        const o = { slits };
        return dedupe([
          ...edgeRun([x0, y0], [x1, y0], shiftFeatures(dtX, x0), t, o),
          ...edgeRun([x1, y0], [x1, y1], shiftFeatures(dtY, y0), t, o),
          ...edgeRun([x1, y1], [x0, y1],
            shiftFeatures(flipFeatures(dtX, dL), x0), t, o),
          ...edgeRun([x0, y1], [x0, y0],
            shiftFeatures(flipFeatures(dtY, dD), y0), t, o),
        ]);
      };
      const wallXHoles = () =>
        dtX.map((f) => shrinkRect(f.s, dFloorZ, f.e - f.s, t, fit));
      const wallYHoles = () =>
        dtY.map((f) => shrinkRect(f.s, dFloorZ, f.e - f.s, t, fit));

      // How far a drawer comes out in the preview. Enough to read as open, never
      // so far that it leaves the board it runs on.
      const pull = Math.min(dD - t, Math.max(12, dD * 0.6));
      // A separate 3-vector, not `lift`: lift is a scalar meaning box Z, so a
      // drawer given one would float up through the cabinet top.
      const slide = [0, -pull, 0];

      for (let i = 0; i < tingkat; i++) {
        const n = i + 1;
        const z = lz(i);
        const add = (suffix, outline, holes, frame) => panels.push(normalisePanel({
          id: `d${n}${suffix}`, label: PANEL_LABELS[`d${n}${suffix}`],
          outline, holes, slide, frame,
        }));
        add('Front', dWallX(true), wallXHoles(),
          { origin: [ox, ci, z], U: [1, 0, 0], V: [0, 0, 1], N: [0, -1, 0] });
        add('Back', dWallX(false), wallXHoles(),
          { origin: [ox + dL, ci + dD, z], U: [-1, 0, 0], V: [0, 0, 1], N: [0, 1, 0] });
        add('Left', dWallY(), wallYHoles(),
          { origin: [ox, ci + dD, z], U: [0, -1, 0], V: [0, 0, 1], N: [-1, 0, 0] });
        add('Right', dWallY(), wallYHoles(),
          { origin: [ox + dL, ci, z], U: [0, 1, 0], V: [0, 0, 1], N: [1, 0, 0] });
        // z + dFloorZ + t: the base's outward face, with material filling down to
        // z + t, so it sits one board above the surface the drawer runs on.
        add('Base', dBase(), [],
          { origin: [ox, ci, z + 2 * t], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] });
      }

      drawerInfo = {
        outer: { l: dL, w: dD, h: dH },
        inner: { l: dL - 2 * t, w: dD - 2 * t, h: dH - 2 * t },
        side: cs, top: ct, inset: ci, bottom: 0,
        thumbR: thumb ? thumbR : 0,
        fingerGap: (thumb ? thumbR : 0) + ct,
        pull,
        // Past about 1.3 the drawer sits visibly crooked whatever the clearance.
        // That is geometry, not a number anyone can tune.
        rack: dL / dD,
        dvFeats, dtX, dtY,
      };
    }

    almariInfo = {
      tingkat, cellH, intH, botTop, topZ,
      shelfZ: tingkat === 2 ? shelfZ : null,
      interior: { l: L - 2 * t, w: W - t, h: intH },
      // The screw joint's fingers stand proud at the BACK on this style, because
      // the side walls' u axis runs front to back here.
      outerW: W + ear,
      yhFeats,
      drawer: drawerInfo,
      drawerWhy,
    };
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
      lid: lidInfo,
      vFeats, xFeats, yFeats,
      divCount: divOK ? divCount : 0, divBase, divH, divFeats,
      // This many screws on each jointed vertical corner. The cabinet has one
      // jointed corner PAIR - the back - where every other style has four
      // corners, so counting four here would tell the user to buy twice the
      // screws they need.
      screwZs,
      // How many corners actually get screwed. The Joints hint is the only place
      // the UI says where the hardware goes, so it reads this rather than saying
      // "four" beside a count that already knows better.
      screwCorners: almari ? 2 : 4,
      screwCount: screwZs.length * (almari ? 2 : 4),
      screwLength: screwLength(t),
      screwEar: ear,
      screwTooSmall: wantScrew && !screwRoom,
      // Screws were possible but the finger joint left room for fewer than were
      // asked for. Not the same thing as screwTooSmall, which means none at all.
      screwShort: wantScrew && screwRoom
        && screwZs.length < Math.max(1, Math.min(4, Math.round(p.screwsPerEdge ?? 2))),
      almari: almariInfo,
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
