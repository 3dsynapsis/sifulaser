// Turning a module grid into something a laser can run.
//
// The encoder gives back a square of true/false. Everything interesting happens
// after that, and none of it is in the QR standard:
//
//   - A module has to be a real size in millimetres, and that size is what
//     decides whether the finished thing scans. Everything else here is in
//     service of being able to say that number out loud.
//
//   - The quiet zone is four modules of nothing on all four sides. It is not
//     decoration - a reader locates the code by finding light either side of the
//     finder patterns, and a code cut hard to its own edge does not scan. So the
//     size the user sets is the size *including* it, and the quiet zone is
//     carried in the geometry as an explicit bounds rectangle rather than being
//     left implicit in the whitespace.
//
//   - Dark modules become filled rectangles, and horizontally adjacent modules
//     in a row are merged into one. A version 10 code is 57x57; unmerged that is
//     up to sixteen hundred separate squares, and every one of them is a path
//     the controller has to plan, sort and travel between. Merged it is a few
//     hundred. The engraved result is identical - two squares sharing an edge
//     are exactly the rectangle that covers both.
//
// Millimetres throughout, y-up, outer contours counter-clockwise, holes
// clockwise. The grid arrives with row 0 at the top, so the row index is
// flipped exactly once, here.

import { roundedRect, ellipse, offsetPolygon, toCCW, bbox } from './path.js';
import { encodeQR, moduleCount, capacityBytes, MAX_VERSION, eclOf } from './qr.js';

/** Modules of clear space the standard requires on every side. */
export const QUIET = 4;

// Below this, the spread of the burn starts closing the gaps between modules and
// readers begin to fail. Above it, an ordinary phone camera copes.
export const MODULE_MIN = 0.8;
// Below this there is nothing to discuss. The kerf of a diode laser is already
// a large fraction of half a millimetre.
export const MODULE_HOPELESS = 0.5;

export const DEFAULTS = {
  text: 'https://sifulaser.com',
  ecl: 'M',              // L | M | Q | H
  version: 0,            // 0 = smallest that fits
  boost: true,           // spend spare capacity on a stronger level, free

  size: 35,              // mm across the whole code, quiet zone included
  frame: 'plaque',       // none | plaque | keychain

  margin: 4,             // mm of board outside the quiet zone
  corner: 3,             // plaque corner radius, mm
  holeDia: 4,            // keychain hole, mm
  holeEdge: 3,           // mm of board between the hole and the outside edge

  thickness: 3,
  kerf: 0.2,
};

export const SIZE_PRESETS = [
  { id: 'sticker', name: 'Sticker', mm: 25 },
  { id: 'keyring', name: 'Keyring', mm: 35 },
  { id: 'card', name: 'Card', mm: 50 },
  { id: 'sign', name: 'Sign', mm: 80 },
];

export const FRAMES = [
  { id: 'none', name: 'None' },
  { id: 'plaque', name: 'Plaque' },
  { id: 'keychain', name: 'Keychain' },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rnd1 = (v) => Math.round(v * 10) / 10;

// Rounds a measurement DOWN, for the warnings that compare it against a
// threshold. Rounding to the nearest would let 0.7826 print as "0.8 mm", which
// is the threshold itself, so the sentence would read as arguing with its own
// number. Truncating cannot cross the threshold in either direction.
const down2 = (v) => Math.floor(v * 100) / 100;

/**
 * A finite number, or the default.
 *
 * Every dimension below is used in arithmetic that NaN and Infinity travel
 * straight through: Math.max(0, NaN) is NaN, `NaN > 0` is false, and a rectangle
 * with a NaN corner writes "NaN" into the SVG and the PDF without one clamp or
 * one warning firing anywhere along the way. The UI never sends such a value,
 * but this module is also the API the tests and any later caller use, and a
 * geometry layer that answers nonsense quietly is worse than one that refuses.
 * Substituting the default and saying so is the only honest option, since there
 * is no sensible number to guess at.
 */
function finite(value, fallback, name, complaints) {
  // null and undefined are how a caller leaves a field out - the spread over
  // DEFAULTS turns an explicit `size: undefined` into exactly that - so they
  // take the default without comment. A number that is not a number is a
  // different thing, and gets said out loud.
  if (value == null) return fallback;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  complaints.push(`${name} was not a number, so the default of ${fallback} mm `
    + 'was used instead.');
  return fallback;
}

/**
 * Dark modules as filled rectangles, one per horizontal run.
 *
 * Only horizontal runs are merged. A full two-dimensional decomposition would
 * shave off a few more paths, but a raster engraver sweeps in rows anyway, so
 * the row is the unit that matters and the extra machinery would buy nothing
 * the machine can use.
 *
 * Each rectangle is a flat [x,y,x,y,...] ring wound counter-clockwise, which is
 * the same shape the export writer takes for filled engraving.
 */
export function moduleRects(grid, x0, y0, m) {
  const n = grid.length;
  const rects = [];
  for (let row = 0; row < n; row++) {
    const cells = grid[row];
    // Row 0 of the grid is the top row of the code, and y counts up from the
    // bottom of the block, so the last grid row is the one at y0.
    const y = y0 + (n - 1 - row) * m;
    let c = 0;
    while (c < n) {
      if (!cells[c]) { c++; continue; }
      let e = c;
      while (e + 1 < n && cells[e + 1]) e++;
      const xa = x0 + c * m;
      const xb = x0 + (e + 1) * m;
      rects.push([xa, y, xb, y, xb, y + m, xa, y + m]);
      c = e + 1;
    }
  }
  return rects;
}

/** Total area the rectangles cover, mm^2. Merging cannot change this. */
export function rectsArea(rects) {
  let a = 0;
  for (const r of rects) {
    a += Math.abs(r[2] - r[0]) * Math.abs(r[5] - r[1]);
  }
  return a;
}

function ringLength(pts) {
  let d = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    d += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  }
  return d;
}

const EMPTY = (reason, extra = {}) => ({
  params: { ...DEFAULTS },
  panels: [],
  qr: null,
  derived: {
    empty: true, reason, warnings: [], notes: [],
    version: 0, ecl: 'M', modules: 0, moduleMm: 0,
    codeMm: 0, quietMm: 0, blockMm: 0, partW: 0, partH: 0,
    darkModules: 0, rects: 0, engraveArea: 0, engraveCoverage: 0,
    cutLength: 0, hasCut: false, hasEngraveFill: false, hasEngraveLine: false,
    ...extra,
  },
});

/**
 * Build the whole tag: the encoded code, the board around it and the numbers
 * somebody needs to decide whether to press go.
 */
export function buildTag(input = {}) {
  const p = { ...DEFAULTS, ...input };
  const text = String(p.text ?? '');

  // Everything the caller can hand over that has to be a number, checked once,
  // here, before any of it reaches arithmetic. See finite() above for why the
  // usual Math.max clamps are not enough on their own.
  const warnings = [];
  const num = (key, label) => finite(p[key], DEFAULTS[key], label, warnings);
  const sizeIn = num('size', 'Size');
  const marginIn = num('margin', 'Margin');
  const cornerIn = num('corner', 'Corner radius');
  const holeDiaIn = num('holeDia', 'Hole diameter');
  const holeEdgeIn = num('holeEdge', 'Hole edge distance');
  const thicknessIn = num('thickness', 'Thickness');
  const kerfIn = num('kerf', 'Kerf');

  const qr = encodeQR(text, { ecl: p.ecl, version: p.version, boost: p.boost });
  if (qr.empty) {
    if (qr.reason === 'too-long') {
      return EMPTY('too-long', {
        warnings: [...warnings,
          `That is ${qr.bytes} bytes of text. The largest QR code there `
          + `is holds ${qr.limit} at level ${eclOf(p.ecl).id}. Shorten the link - `
          + 'a link shortener is the usual answer - or drop to level L.'],
      });
    }
    return EMPTY('empty');
  }

  const n = qr.size;
  const blockModules = n + QUIET * 2;
  const size = Math.max(5, sizeIn);
  const m = size / blockModules;          // one module, in millimetres
  const codeMm = n * m;
  const quietMm = QUIET * m;

  const t = Math.max(0.5, thicknessIn);
  const kerf = Math.max(0, kerfIn);
  const k = kerf / 2;
  warnings.push(...qr.complaints);

  // ---- the board around it ------------------------------------------------
  const framed = p.frame !== 'none';
  const margin = framed ? Math.max(0, marginIn) : 0;
  const holeDia = clamp(holeDiaIn, 1, 20);
  const holeEdge = Math.max(0.5, holeEdgeIn);

  // The keychain needs a strip at the top with room for the hole and board on
  // both sides of it. If the plain margin is already that generous, no extra
  // strip is added - a big margin should not push the hole further out still.
  const topNeed = p.frame === 'keychain'
    ? Math.max(margin, holeDia + holeEdge * 2)
    : margin;

  const partW = size + margin * 2;
  const partH = size + margin + topNeed;
  const blockX = margin;
  const blockY = margin;

  const panel = {
    id: 'tag',
    label: p.frame === 'keychain' ? 'Keychain' : p.frame === 'plaque' ? 'Plaque' : 'QR code',
    outline: null,
    holes: [],
    loose: [],
    engrave: [],
    engraveFill: [],
    thickness: t,
    // The nominal extent of the artwork, quiet zone included, and a FLOOR under
    // what the writers measure rather than a replacement for it. With no frame
    // there is no cut path at all, and without this the file would be trimmed to
    // the outermost dark module - throwing the quiet zone away and taking the
    // scan with it. It is nominal, so it does not include the half kerf the
    // outline below is grown by; bboxOf takes the union of the two.
    bounds: { x0: 0, y0: 0, x1: partW, y1: partH },
  };

  if (framed) {
    const r = clamp(cornerIn, 0, Math.min(partW, partH) / 2);
    panel.outline = roundedRect(0, 0, partW, partH, r);
  }

  if (p.frame === 'keychain') {
    const cy = partH - holeEdge - holeDia / 2;
    panel.holes.push(ellipse(partW / 2, cy, holeDia / 2, holeDia / 2, 48).reverse());
  }

  panel.engraveFill = moduleRects(qr.grid, blockX + quietMm, blockY + quietMm, m);

  // ---- kerf ---------------------------------------------------------------
  // Cut paths only. Engraving does not remove a slug of material the way a
  // through-cut does, so there is no half-kerf to give back; the burn spreading
  // sideways is a real effect but it is a property of the material and the
  // power, not a number this tool can know. It is what the module-size warning
  // below is about.
  panel.outlineNominal = panel.outline;
  if (k > 0) {
    if (panel.outline) panel.outline = offsetPolygon(panel.outline, k);
    // offsetPolygon's sign is relative to the winding - positive grows a
    // counter-clockwise ring - and a hole is wound clockwise. Rather than pass
    // the sign that happens to work, turn the hole the right way round, shrink
    // it, and turn it back, so the intent survives being read later.
    panel.holes = panel.holes.map((hole) => offsetPolygon(toCCW(hole), -k).reverse());
  }

  let cutLength = 0;
  for (const ring of [panel.outline, ...panel.holes].filter(Boolean)) {
    cutLength += ringLength(ring);
  }
  if (panel.outline) {
    const bb = bbox(panel.outline);
    panel.size = { w: bb.w, h: bb.h };
  } else {
    panel.size = { w: partW, h: partH };
  }

  // ---- what to say before anyone burns a sheet ----------------------------
  //
  // This is the whole reason the tool exists rather than a QR website. A QR code
  // is only as good as its smallest feature, and on a laser the smallest feature
  // is one module. Say the number, then say the three things that change it.
  if (m < MODULE_HOPELESS) {
    warnings.push(`Each module comes out ${down2(m)} mm across. Nothing will read `
      + 'this: the burn spreads far enough to close the gaps between modules. '
      + fixes(blockModules, qr));
  } else if (m < MODULE_MIN) {
    warnings.push(`Each module comes out ${down2(m)} mm across, and below about `
      + `${MODULE_MIN} mm the burn spreads into its neighbours and scanners `
      + 'start failing. ' + fixes(blockModules, qr));
  }

  if (p.frame === 'keychain') {
    if (holeEdge < 2) {
      warnings.push(`Only ${rnd1(holeEdge)} mm of board between the hole and the `
        + 'edge. A keyring pulls on that all day - give it 2 mm or more.');
    }
    if (holeDia < 3) {
      warnings.push(`A ${rnd1(holeDia)} mm hole is smaller than most split rings. `
        + '4 mm is the usual size.');
    }
  }
  if (framed && margin < quietMm * 0.25 && p.frame !== 'none') {
    warnings.push('The board barely extends past the quiet zone. A little more '
      + 'margin gives you somewhere to hold it.');
  }

  const notes = [];
  if (qr.boosted) {
    notes.push(`Level raised from ${qr.requestedEcl} to ${qr.ecl} - version `
      + `${qr.version} had the room to spare, so it costs nothing.`);
  }

  const engraveArea = rectsArea(panel.engraveFill);

  return {
    // The parameters ACTUALLY used, not the ones handed in: a caller that reads
    // params back and gets its own NaN returned to it learns nothing.
    params: {
      ...p,
      size,
      margin: framed ? margin : marginIn,
      corner: cornerIn,
      holeDia,
      holeEdge,
      thickness: t,
      kerf,
    },
    panels: [panel],
    qr,
    derived: {
      empty: false,
      reason: '',
      version: qr.version,
      ecl: qr.ecl,
      requestedEcl: qr.requestedEcl,
      boosted: qr.boosted,
      mask: qr.mask,
      bytes: qr.bytes,
      capacity: qr.capacity,
      modules: n,
      moduleMm: m,
      codeMm,
      quietMm,
      blockMm: size,
      partW,
      partH,
      darkModules: qr.dark,
      rects: panel.engraveFill.length,
      engraveArea,
      engraveCoverage: engraveArea / (codeMm * codeMm),
      cutLength,
      // Only the layers this job actually contains - an unframed code has
      // nothing red in it at all.
      hasCut: Boolean(panel.outline) || panel.holes.length > 0,
      hasEngraveFill: panel.engraveFill.length > 0,
      hasEngraveLine: panel.engrave.length > 0,
      warnings,
      notes,
    },
  };
}

/**
 * The three levers, with the number each one would have to reach.
 *
 * Vague advice is no advice. "Make it bigger" is useless next to "51 mm would
 * do it", and whether dropping a level even helps depends on whether it lets
 * the code fall to a smaller version, which is worth working out rather than
 * guessing at.
 */
function fixes(blockModules, qr) {
  // Rounded up to a whole millimetre with a hair to spare, so the size named
  // here always lands strictly clear of the threshold instead of exactly on it
  // and coming back a rounding error short of its own advice.
  const need = Math.ceil(MODULE_MIN * blockModules + 0.01);
  const out = [`Raise the size to ${need} mm`];

  // Would a weaker level fit a smaller version? Only then is dropping it worth
  // suggesting, and only by as much as it actually buys.
  let bestVer = qr.version;
  let bestEcl = null;
  for (const cand of ['H', 'Q', 'M', 'L']) {
    if (eclOf(cand).recovers >= eclOf(qr.ecl).recovers) continue;
    for (let v = 1; v <= MAX_VERSION; v++) {
      if (capacityBytes(v, cand) >= qr.bytes) {
        if (v < bestVer) { bestVer = v; bestEcl = cand; }
        break;
      }
    }
  }
  if (bestEcl) {
    out.push(`drop to level ${bestEcl}, which fits in version ${bestVer} `
      + `(${moduleCount(bestVer)} modules instead of ${qr.size})`);
  }

  // How short would the link have to be to lose a version? Only mention it when
  // there is a smaller version to fall to.
  if (qr.version > 1) {
    const room = capacityBytes(qr.version - 1, qr.ecl);
    out.push(`or shorten the link to ${room} characters, which drops it to `
      + `version ${qr.version - 1}`);
  } else {
    out.push('or shorten the link');
  }
  return `${out.join(', ')}.`;
}

export { ringLength };
