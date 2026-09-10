// The five cut pieces, in their own frames and in the world.
//
// Each part comes back as { id, outline, holes, frame, originShift } - the
// shape the 3D viewer and the exporter both already understand. Rings are
// [x, y] PAIRS, outlines counter-clockwise, holes clockwise, everything in
// millimetres.
//
// The frame is what places a flat piece in a leaning assembly, and it is done
// by writing each part's basis rather than by rotating a mesh: N is the
// OUTWARD face normal, the frame plane is the visible surface, and the board
// hangs behind it. Stand Nama does the same thing for the same reason -
// geometry that knows where it belongs cannot drift out of step with a
// transform applied somewhere else.
//
// The two cheeks are mirror images in their own local frames and identical as
// cut pieces: a plain plywood plate has no front and no back, so the exporter
// can nest one outline twice and the builder flips the second one over. That
// is what `mirrorOf` is telling it.

import { growRing } from '../path.js';
import { mortiseWidth, mortiseGrow, featureRun, mortiseRing } from './joints.js';

const rectRing = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const rectHole = (x0, y0, x1, y1) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0]];

const bboxOf = (rings) => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const r of rings) {
    for (const [x, y] of r) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
};

const shift = (ring, dx, dy) => ring.map(([x, y]) => [x + dx, y + dy]);

// Rings are PAIRS; engrave paths are FLAT, because that is what text.js emits
// and what the viewer expects on that layer. This is the only place the two
// meet in this file.
const flatten = (ring) => {
  const o = new Array(ring.length * 2 + 2);
  for (let i = 0; i < ring.length; i++) { o[i * 2] = ring[i][0]; o[i * 2 + 1] = ring[i][1]; }
  o[ring.length * 2] = ring[0][0];
  o[ring.length * 2 + 1] = ring[0][1];
  return o;
};

/** Reflect in u and reverse, so a hole stays a hole and an outline an outline. */
const mirror = (ring, about) => ring.map(([x, y]) => [about - x, y]).reverse();

/**
 * Move a part's rings to a bbox-corner origin and record where that origin
 * sits in the part's own frame.
 *
 * The 3D matrix is makeBasis(U, V, N) positioned at origin + U*shift[0] +
 * V*shift[1]. Leaving the shift out is the classic way to get a flat view that
 * looks perfect and a 3D view with every piece in the wrong place, because the
 * flat view never asked where the origin was.
 */
function normalise(part) {
  const bb = bboxOf([part.outline, ...part.holes]);
  const dx = -bb.x0;
  const dy = -bb.y0;
  // The nominal rings move with the cut ones. They are what the mass model and
  // every finished-fit measurement read, so leaving them behind would put the
  // centre of mass half a kerf out on the panel and a whole cheek out on the
  // cheek, and nothing would complain.
  const flat = (p) => {
    const o = new Array(p.length);
    for (let k = 0; k < p.length; k += 2) { o[k] = p[k] + dx; o[k + 1] = p[k + 1] + dy; }
    return o;
  };
  const out = {
    ...part,
    outline: shift(part.outline, dx, dy),
    holes: part.holes.map((h) => shift(h, dx, dy)),
    size: [bb.w, bb.h],
    originShift: [bb.x0, bb.y0],
  };
  if (part.outlineNominal) out.outlineNominal = shift(part.outlineNominal, dx, dy);
  if (part.holesNominal) out.holesNominal = part.holesNominal.map((h) => shift(h, dx, dy));
  if (part.engrave) out.engrave = part.engrave.map(flat);
  if (part.engraveFill) out.engraveFill = part.engraveFill.map(flat);
  return out;
}

/** Kerf, applied once and last: outline out by half, every hole in by half. */
function kerfPart(part, kerf) {
  const k = Math.max(0, kerf) / 2;
  if (!k) return { ...part, outlineNominal: part.outline, holesNominal: part.holes };
  return {
    ...part,
    outlineNominal: part.outline,
    holesNominal: part.holes,
    // growRing, never bare offsetPolygon: it asks "move this edge out of the
    // material" and does not have to be told which way the ring was wound.
    // A hole comes back clockwise and offsetPolygon(hole, -k) OPENS it.
    outline: growRing(part.outline, k),
    holes: part.holes.map((h) => growRing(h, -k)),
  };
}

/**
 * The back panel: a rectangle with tabs down each side edge that pass right
 * through the cheeks and finish flush with their outer faces. How many is
 * featureRun's business - three on a 250 mm edge - and it is asked the same
 * question the cheek asks, so the two cannot disagree.
 *
 * Panel coordinates are (across, up the slope) with the bottom edge at v = 0,
 * which is also the coordinate system the pattern is generated in.
 */
export function backPanelOutline(d) {
  const { panelW: W, height: H, t, module, land, tabStart } = d;
  const tabs = featureRun(H, module, land, { min: 2, max: 6, margin: tabStart });
  const o = [[t, 0], [W - t, 0]];
  for (const f of tabs) {
    o.push([W - t, f.s], [W, f.s], [W, f.e], [W - t, f.e]);
  }
  o.push([W - t, H], [t, H]);
  for (let i = tabs.length - 1; i >= 0; i--) {
    const f = tabs[i];
    o.push([t, f.e], [0, f.e], [0, f.s], [t, f.s]);
  }
  return { outline: o, tabs };
}

/**
 * The cheek: the piece that makes the reading angle a fact rather than a hope.
 *
 * Its top edge runs parallel to the reading face a land proud of it, drops to
 * the trough wall, and runs on past the lip to a toe. The bottom edge carries
 * through-tenons into the base and an open notch that the lip passes through.
 * The notch is open at the bottom on purpose - the base closes it, and a
 * closed mortise there would leave a strip of end grain under the lip with
 * nothing holding it.
 */
export function cheekPart(d) {
  const {
    t, kerf, tMeasured, land, module, tabStart, hLip, wallTop,
    xCheekFront, xLipFront, xLipRear, uRear, xLevel, railAtNose, vRail,
    backFoot, frontFoot, v: vDir, height: H,
  } = d;

  const mw = mortiseWidth(t, kerf, tMeasured);
  // Two different clearances that are easy to confuse and were confused here.
  // `slack` goes at the ENDS of a run, so a shoulder has somewhere to land.
  // `grow` goes ACROSS it, and is the only one that carries the caliper
  // reading - see mortiseGrow in joints.js for what mixing them up costs.
  const slack = mw - tMeasured;
  const grow = mortiseGrow(t, kerf, tMeasured);

  // Feet: through-tenons into the base. They can only go where there is base
  // under the cheek, so the cantilevered rear of the cheek gets none.
  const footFrom = Math.max(uRear, land);
  const footTo = xLipRear - land;
  const feet = featureRun(footTo - footFrom, module, land, { min: 2, max: 5 })
    .map((f) => ({ s: f.s + footFrom, e: f.e + footFrom }));

  const o = [[uRear, 0]];
  for (const f of feet) o.push([f.s, 0], [f.s, -t], [f.e, -t], [f.e, 0]);
  // The lip notch. Its walls stand `grow` outside the lip's nominal faces, so
  // the slot is mortiseWidth across whatever the caliper said; its head is
  // slack proud of the lip's top, which is the end clearance, not the width.
  o.push([xLipRear - grow, 0]);
  o.push([xLipRear - grow, hLip + slack / 2]);
  o.push([xLipFront + grow, hLip + slack / 2]);
  o.push([xLipFront + grow, 0]);
  o.push([xCheekFront, 0]);
  if (xLevel < xCheekFront) {
    o.push([xCheekFront, wallTop], [xLevel, wallTop]);
  } else {
    o.push([xCheekFront, railAtNose]);
  }
  o.push([uRear, vRail(uRear)]);

  // The panel's mortises, on the panel's mid-plane. The run along the panel is
  // the same run the panel's own tabs were laid out on, or the tenons miss
  // them - so both come from featureRun with the same arguments and neither
  // gets to decide for itself.
  const mid = [(backFoot[0] + frontFoot[0]) / 2, (backFoot[1] + frontFoot[1]) / 2];
  // vDir turned +90 degrees, which is what mortiseRing needs to wind the hole
  // the right way. It happens to point into the back of the panel rather than
  // out of its face; the mortise is symmetric about the mid-plane so that side
  // of it makes no difference, but the handedness does.
  const nRot = [-vDir[1], vDir[0]];
  const tabs = featureRun(H, module, land, { min: 2, max: 6, margin: tabStart });
  const holes = tabs.map((f) => mortiseRing(mid, vDir, nRot, f.s, f.e, mw, slack));

  return { outline: o, holes, feet, tabs, mortiseW: mw, slack, mid, nRot };
}

/** The base: a plain rectangle, with a mortise for every tenon that lands on it. */
export function basePart(d, cheek, lipTenons) {
  const {
    t, kerf, tMeasured, inset, width: W, depth: D, xLipRear, xLipFront,
  } = d;
  const mw = mortiseWidth(t, kerf, tMeasured);
  // `half` is end clearance along a tenon run; `grow` is what widens the slot
  // across the board. They are not interchangeable and used to be - see
  // mortiseGrow in joints.js.
  const half = (mw - tMeasured) / 2;
  const grow = mortiseGrow(t, kerf, tMeasured);
  const holes = [];
  for (const y0 of [inset, W - inset - t]) {
    for (const f of cheek.feet) {
      holes.push(rectHole(f.s - half, y0 - grow, f.e + half, y0 + t + grow));
    }
  }
  // The lip's tenons were laid out in the LIP's own coordinates, where u = 0 is
  // the lip's left end and the lip's left end is `inset` in from the base's
  // edge. The base's u is world x and its v is world y, so the run has to be
  // moved into the base's frame before it is drawn - the two are only a
  // fortnight of head-scratching apart because the numbers look plausible
  // either way.
  for (const f of lipTenons) {
    holes.push(rectHole(xLipRear - grow, inset + f.s - half, xLipFront + grow, inset + f.e + half));
  }
  return { outline: rectRing(0, 0, D, W), holes };
}

/**
 * The lip: the only thing holding the book on.
 *
 * Vertical, square to the BASE rather than to the panel, because a vertical
 * face catches the book's bottom corner square instead of glancing off it. Its
 * ends run right through the cheeks; its bottom edge tenons into the base.
 */
export function lipPart(d) {
  const {
    panelW: W, hLip, t, module, land,
  } = d;
  const from = t + land;
  const to = W - t - land;
  const tenons = featureRun(to - from, module, land, { min: 2, max: 5 })
    .map((f) => ({ s: f.s + from, e: f.e + from }));
  const o = [[0, 0]];
  for (const f of tenons) o.push([f.s, 0], [f.s, -t], [f.e, -t], [f.e, 0]);
  o.push([W, 0], [W, hLip], [0, hLip]);
  return { outline: o, tenons };
}

/**
 * Build all five, place them, and put the kerf on.
 *
 * `panelHoles` and `panelOutline` come from the pattern engine for the back
 * panel and are already kerf-compensated; everything else is compensated here.
 * The pattern's outline is a rasterised trace and is not accurate enough to
 * cut a joint to, so the exact outline is used for the panel and only the
 * pattern's holes are taken. They cannot disagree anywhere that matters: the
 * frame band keeps every hole at least a band's width from the outline, and
 * the trace is within a fraction of a grid cell of the exact line.
 */
export function buildParts(d, pattern, name = null) {
  const { t, kerf, inset, width: W, height: H, hLip } = d;
  const parts = [];

  const bp = backPanelOutline(d);
  // The medallion's own outline is engraved, not cut. It is the line that
  // makes the cleared area read as a cartouche rather than as a bald patch;
  // the pattern already stops a band's width short of it, so cutting it as
  // well would only put a moat round a solid island.
  const engrave = name && name.ring
    ? [flatten(name.ring), ...(name.engrave || [])]
    : (name ? [...(name.engrave || [])] : []);
  const engraveFill = name ? [...(name.engraveFill || [])] : [];

  const panel = {
    id: 'panel',
    name: 'Papan belakang',
    outline: bp.outline,
    holes: pattern ? pattern.cut.holes : [],
    holesNominal: pattern ? pattern.nominal.holes : [],
    engrave,
    engraveFill,
    frame: {
      origin: [d.frontFoot[0], inset, t + d.frontFoot[1]],
      U: [0, 1, 0],
      V: [d.v[0], 0, d.v[1]],
      N: [d.n[0], 0, d.n[1]],
    },
  };
  // The panel's holes arrive already compensated, so only its outline is.
  const panelK = {
    ...panel,
    outlineNominal: panel.outline,
    outline: kerf ? growRing(panel.outline, kerf / 2) : panel.outline,
  };
  parts.push(normalise(panelK));

  const cheek = cheekPart(d);
  const cheekL = normalise(kerfPart({
    id: 'cheekL',
    name: 'Pipi kiri',
    outline: cheek.outline,
    holes: cheek.holes,
    frame: { origin: [0, inset, t], U: [1, 0, 0], V: [0, 0, 1], N: [0, -1, 0] },
  }, kerf));
  parts.push(cheekL);

  const bbL = bboxOf([cheek.outline, ...cheek.holes]);
  const about = bbL.x0 + bbL.x1;
  const cheekR = normalise(kerfPart({
    id: 'cheekR',
    name: 'Pipi kanan',
    mirrorOf: 'cheekL',
    outline: mirror(cheek.outline, about),
    holes: cheek.holes.map((h) => mirror(h, about)),
    frame: { origin: [about, W - inset, t], U: [-1, 0, 0], V: [0, 0, 1], N: [0, 1, 0] },
  }, kerf));
  parts.push(cheekR);

  const lip = lipPart(d);
  parts.push(normalise(kerfPart({
    id: 'lip',
    name: 'Bibir penahan',
    outline: lip.outline,
    holes: [],
    frame: { origin: [d.xLipFront, inset, t], U: [0, 1, 0], V: [0, 0, 1], N: [1, 0, 0] },
  }, kerf)));

  const base = basePart(d, cheek, lip.tenons);
  parts.push(normalise(kerfPart({
    id: 'base',
    name: 'Tapak',
    outline: base.outline,
    holes: base.holes,
    frame: { origin: [0, 0, t], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] },
  }, kerf)));

  return {
    parts, cheek, lip, base, panelTabs: bp.tabs, panelSize: [d.panelW, H, hLip],
  };
}

export { bboxOf, rectRing, rectHole, normalise, kerfPart, mirror };
