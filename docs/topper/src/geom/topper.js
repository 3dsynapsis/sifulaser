// Cake topper: a name cut out in one piece, standing on stakes pushed into a cake.
//
// It is the same machine as the name stand's cut-out face - lettering welded
// into a single shape by a distance field - with the base swapped for stakes and
// two things the stand never needed.
//
// The first is thickening. A topper is nearly always set in a script, and a
// script at 6 inches wide has strokes around a millimetre. That will not survive
// being pushed into a cake, let alone washed. Growing the shape fixes it, and in
// a distance field growing is free: the field already holds the distance to the
// nearest ink, so a millimetre of thickening is a millimetre off the level being
// traced. It also does a second job - it drags neighbouring letters and
// overlapping lines into contact.
//
// The second is that lines are meant to overlap. The line height defaults below
// 100% on purpose, because a topper is one piece: "Happy" has to physically
// touch "Birthday" or it falls on the floor on the way to the table.
//
// Millimetres throughout, y-up, outer rings counter-clockwise.

import { offsetPolygon, bbox } from './path.js';
import { layout, isOutline } from './text.js';
import { strokesToOutline, ringArea } from './outline.js';

export const DEFAULTS = {
  text: 'Happy\nBirthday\nSylvia',
  face: 'great-vibes',
  align: 'center',

  width: 150,            // mm across the whole topper
  lineHeight: 72,        // % of cap height between baselines; under 100 overlaps
  thicken: 0,            // mm added all round the lettering
  weight: 4,             // stroke faces only: what a skeleton gets fattened to

  connect: 'dots-and-letters',   // dots-and-letters | dots | none
  bridge: 2.5,           // mm across a bridge

  stakes: 2,             // 0, 1 or 2
  stakeLength: 55,       // mm the stake stands proud below the lettering
  stakeWidth: 9,         // mm across the stake where it meets the text
  stakeTaper: 40,        // % narrower at the tip
  stakeSpread: 55,       // % of the width between two stakes
  stakeSnap: true,       // slide each stake under the nearest letter

  thickness: 3,
  kerf: 0.2,
};

/** Cast acrylic is what these are made from, and the reason is not cosmetic. */
export const MIN_STROKE = 2.5;   // mm; thinner than this snaps in 3 mm acrylic

export const CONNECT_MODES = [
  ['dots-and-letters', 'Dots and letters'],
  ['dots', 'Dots only'],
  ['none', 'Nothing'],
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const EMPTY = {
  params: { ...DEFAULTS },
  panels: [],
  derived: {
    width: 0, height: 0, textWidth: 0, textHeight: 0, capMM: 0,
    pieces: 0, loose: 0, holes: 0, bridges: 0, stroke: 0, suggestThicken: 0,
    stakeAt: [], stakeSnapped: 0, balance: 0, cutLength: 0,
    lines: 0, warnings: [], empty: true,
  },
};

function shiftRings(rings, dx, dy) {
  return rings.map((r) => {
    const out = new Array(r.length);
    for (let k = 0; k < r.length; k += 2) {
      out[k] = r[k] + dx;
      out[k + 1] = r[k + 1] + dy;
    }
    return out;
  });
}

function scaleRings(rings, s) {
  return rings.map((r) => {
    const out = new Array(r.length);
    for (let k = 0; k < r.length; k++) out[k] = r[k] * s;
    return out;
  });
}

function ringsBBox(groups) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of groups) {
    for (const r of g) {
      for (let k = 0; k < r.length; k += 2) {
        if (r[k] < x0) x0 = r[k];
        if (r[k] > x1) x1 = r[k];
        if (r[k + 1] < y0) y0 = r[k + 1];
        if (r[k + 1] > y1) y1 = r[k + 1];
      }
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : null;
}

/**
 * Area-weighted centroid of flat [x,y,...] contours.
 *
 * Counters subtract themselves, because a hole is wound the other way and the
 * shoelace sum carries the sign - so the middle of an O is not counted as part
 * of the O.
 */
export function centroidOf(groups) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (const g of groups) {
    for (const ring of g) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const cross = ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
        a += cross;
        cx += (ring[j] + ring[i]) * cross;
        cy += (ring[j + 1] + ring[i + 1]) * cross;
      }
    }
  }
  a /= 2;
  return Math.abs(a) < 1e-9
    ? { x: 0, y: 0, area: 0 }
    : { x: cx / (6 * a), y: cy / (6 * a), area: a };
}

/**
 * The x runs where a set of filled contours is solid at height y.
 *
 * Used to park the stakes somewhere they will actually weld on. A stake is a
 * finger nine millimetres wide; drop it in the gap between two letters of a
 * script and it comes off the sheet as a separate splinter.
 */
export function inkSpansAt(groups, y) {
  const xs = [];
  for (const g of groups) {
    for (const ring of g) {
      for (let k = 0, m = ring.length - 2; k < ring.length; m = k, k += 2) {
        const ay = ring[m + 1];
        const by = ring[k + 1];
        if ((ay <= y) === (by <= y)) continue;
        const t = (y - ay) / (by - ay);
        xs.push([ring[m] + t * (ring[k] - ring[m]), by > ay ? 1 : -1]);
      }
    }
  }
  if (xs.length < 2) return [];
  xs.sort((p, q) => p[0] - q[0]);
  const spans = [];
  let wind = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    wind += xs[i][1];
    if (wind === 0) continue;
    const a = xs[i][0];
    const b = xs[i + 1][0];
    if (b - a < 1e-6) continue;
    const last = spans[spans.length - 1];
    if (last && a - last[1] < 1e-6) last[1] = b;
    else spans.push([a, b]);
  }
  return spans;
}

/** A stake: a flat-tipped wedge, wide where it meets the letters. */
export function stakePolygon(cx, yTop, length, width, taperPct) {
  const w = Math.max(1, width);
  const tip = Math.max(1, w * (1 - clamp(taperPct, 0, 85) / 100));
  const yBot = yTop - Math.max(4, length);
  // Flat tipped rather than pointed. A point in 3 mm acrylic chips the first
  // time it meets a cake board, and a 1 mm tip goes in just as easily.
  return [
    cx - w / 2, yTop,
    cx - tip / 2, yBot,
    cx + tip / 2, yBot,
    cx + w / 2, yTop,
  ];
}

/** Mean stroke width of filled letters: twice the area over the perimeter. */
export function meanStroke(groups) {
  let area = 0;
  let per = 0;
  for (const g of groups) {
    for (const ring of g) {
      let a = 0;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
        per += Math.hypot(ring[i] - ring[j], ring[i + 1] - ring[j + 1]);
      }
      area += Math.abs(a / 2);
    }
  }
  return per > 0 ? (2 * area) / per : 0;
}

function nearestPair(a, b, samples = 300) {
  const sa = Math.max(1, Math.floor(a.length / samples));
  const sb = Math.max(1, Math.floor(b.length / samples));
  let best = Infinity;
  let seg = null;
  for (let i = 0; i < a.length; i += sa) {
    for (let j = 0; j < b.length; j += sb) {
      const d = (a[i][0] - b[j][0]) ** 2 + (a[i][1] - b[j][1]) ** 2;
      if (d < best) { best = d; seg = [a[i][0], a[i][1], b[j][0], b[j][1]]; }
    }
  }
  return seg;
}

/**
 * Outline everything, then tie back whichever floating pieces the user asked for.
 *
 * The three modes matter because a dot and a letter are different problems. The
 * dot on an i has nothing holding it and always needs a bridge. A whole letter
 * left adrift usually means the line height or the thickening is wrong, and
 * bridging it papers over that - so "dots only" fixes the unavoidable and leaves
 * the avoidable visible.
 */
function weld(input, opts, mode, bridgeW, dotArea) {
  let res = strokesToOutline(input.strokes || [], opts);
  const bridges = [];
  if (mode === 'none' || !(bridgeW > 0)) return { res, bridges: 0 };

  for (let round = 0; round < 3 && res.outers.length > 1; round++) {
    const main = res.outers[0];
    const want = res.outers.slice(1).filter((o) => (
      mode === 'dots-and-letters' || Math.abs(ringArea(o)) <= dotArea
    ));
    if (!want.length) break;
    for (const o of want) {
      const seg = nearestPair(o, main);
      if (seg) bridges.push(seg);
    }
    res = strokesToOutline(input.strokes || [], {
      ...opts, bridges: { paths: bridges, weight: bridgeW },
    });
  }
  return { res, bridges: bridges.length };
}

export function buildTopper(input = {}) {
  const p = { ...DEFAULTS, ...input };
  const face = p.faceData;
  if (!face) return EMPTY;

  const lines = String(p.text ?? '').split(/\r?\n/).map((l) => l.replace(/\t/g, ' '));
  if (!lines.some((l) => l.trim())) return EMPTY;

  // ---- lay the lines out at a nominal size, then scale to the width asked for.
  // Scaling the finished geometry is exact and avoids laying the text out twice.
  const NOMINAL = 100;
  const laid = lines.map((l) => (l.trim()
    ? layout({ text: l, capHeight: NOMINAL, faceData: face, align: 'left' })
    : null));
  const widest = Math.max(1, ...laid.map((r) => (r ? r.advance : 0)));
  const step = NOMINAL * (clamp(p.lineHeight, 10, 300) / 100);
  const outlineFace = isOutline(face);

  let groups = [];
  const strokePaths = [];
  laid.forEach((r, i) => {
    if (!r) return;
    const dx = p.align === 'center' ? (widest - r.advance) / 2
      : p.align === 'right' ? widest - r.advance : 0;
    const dy = -i * step;
    if (outlineFace) {
      for (const rings of r.shapes) groups.push(shiftRings(rings, dx, dy));
    } else {
      for (const st of r.paths) {
        const out = new Array(st.length);
        for (let k = 0; k < st.length; k += 2) {
          out[k] = st[k] + dx;
          out[k + 1] = st[k + 1] + dy;
        }
        strokePaths.push(out);
      }
    }
  });

  const measure = outlineFace ? ringsBBox(groups) : ringsBBox([strokePaths]);
  if (!measure || !(measure.w > 0)) return EMPTY;
  // The width asked for is the width of the finished piece, so the lettering is
  // scaled to leave room for what is added afterwards: thickening grows it by
  // its amount on each side, and kerf compensation by half a beam on each side.
  // Without this, thickening quietly makes the topper wider than the number in
  // the box, which is exactly the kind of promise a tool should not break.
  const addedW = Math.max(0, p.thicken) * 2 + Math.max(0, p.kerf);
  const s = Math.max(0.01, p.width - addedW) / measure.w;
  const capMM = NOMINAL * s;
  groups = groups.map((g) => scaleRings(g, s));
  const strokes = strokePaths.map((st) => st.map((v) => v * s));

  const thicken = Math.max(0, p.thicken);
  const penW = Math.max(0.6, p.weight);
  const rawStroke = outlineFace ? meanStroke(groups) : penW;
  // Thickening adds its amount to each side, so a stroke gains twice it.
  const stroke = rawStroke + thicken * 2;

  const ink = outlineFace ? ringsBBox(groups) : ringsBBox([strokes]);
  const lastBase = -(laid.length - 1) * step * s;

  // ---- stakes ------------------------------------------------------------
  // They have to bite into the lettering, so the top of a stake sits above the
  // last baseline rather than under the descenders.
  const nStakes = clamp(Math.round(p.stakes), 0, 2);
  const rise = Math.max(2, capMM * 0.18);
  const yTop = lastBase + rise;
  const probeY = lastBase + rise * 0.35;
  const spans = outlineFace ? inkSpansAt(groups, probeY) : [];
  const mid = (ink.x0 + ink.x1) / 2;
  const half = (p.width * clamp(p.stakeSpread, 0, 100)) / 200;
  let wanted = nStakes === 2 ? [mid - half, mid + half] : nStakes === 1 ? [mid] : [];

  let snapped = 0;
  if (p.stakeSnap && spans.length) {
    wanted = wanted.map((x) => {
      const inside = spans.some(([a, b]) => x >= a - 0.01 && x <= b + 0.01);
      if (inside) return x;
      let best = x;
      let bestD = Infinity;
      for (const [a, b] of spans) {
        const c = Math.max(a, Math.min(b, x));
        const d = Math.abs(c - x);
        if (d < bestD) { bestD = d; best = (b - a) > p.stakeWidth ? c : (a + b) / 2; }
      }
      snapped++;
      return best;
    });
  }
  const stakeShapes = wanted.map((x) => [
    stakePolygon(x, yTop, p.stakeLength, p.stakeWidth, p.stakeTaper),
  ]);

  // ---- one shape -----------------------------------------------------------
  const all = [...groups, ...stakeShapes];
  const dotArea = Math.max(2, (stroke * 2) ** 2);
  const { res, bridges } = weld(
    { strokes },
    { weight: penW, glyphs: all, grow: thicken },
    p.connect,
    Math.max(0, Math.min(p.bridge, Math.max(stroke, 1.2))),
    dotArea,
  );
  if (!res.outers.length) return EMPTY;

  const warnings = [];
  const pieces = res.outers.length;
  if (pieces > 1) {
    warnings.push(`${pieces} separate pieces - ${pieces - 1} will drop out of the `
      + 'sheet loose. Close the line height so the lines overlap, thicken the '
      + 'letters, or set Connect to join them.');
  }
  // Many bridges means the face is not really joining up, and a row of little
  // connectors looks like what it is. Thickening merges the letters properly.
  if (bridges > 4) {
    warnings.push(`${bridges} bridges were needed to hold this together. Thickening `
      + 'the letters merges them into each other instead, which looks better than '
      + 'a row of connectors - or pick a face that joins up on its own.');
  }
  if (stroke < MIN_STROKE) {
    const need = Math.ceil(((MIN_STROKE - stroke) / 2) * 10) / 10;
    warnings.push(`The letters average ${stroke.toFixed(1)} mm across. Below about `
      + `${MIN_STROKE} mm they snap when the topper is pushed into a cake or `
      + `washed. Thicken by ${need} mm, or make it wider.`);
  }

  // ---- will it stand up? ---------------------------------------------------
  // A topper hangs off its stakes. If the lettering's weight is not over them it
  // leans, and on a soft cake it keeps leaning. Nobody checks this, and it is
  // the difference between a photo and a slice of humiliation.
  // The lettering only. The stakes are buried in the cake, so their weight is
  // not what leans the thing over - what leans it is everything above the icing.
  const cent = centroidOf(outlineFace ? groups : [strokes]);
  let balance = 0;
  if (wanted.length) {
    const lo = Math.min(...wanted);
    const hi = Math.max(...wanted);
    const span = Math.max(hi - lo, p.stakeWidth);
    balance = (cent.x - (lo + hi) / 2) / (span / 2);
    if (Math.abs(balance) > 1) {
      warnings.push('The weight of the lettering sits outside the stakes, so it '
        + 'will lean. Move the stakes apart, or nudge the text with spaces.');
    }
  } else {
    warnings.push('No stakes: this will not stand in a cake. Add one or two.');
  }

  // ---- kerf ---------------------------------------------------------------
  const k = Math.max(0, p.kerf) / 2;
  const shift = (ring, dx, dy) => ring.map(([x, y]) => [x + dx, y + dy]);
  const full = bbox([...res.outers.flat(), ...res.holes.flat()]);
  const dx = -full.x0;
  const dy = -full.y0;
  let outer = shift(res.outers[0], dx, dy);
  let loose = res.outers.slice(1).map((r) => shift(r, dx, dy));
  let holes = res.holes.map((r) => shift(r, dx, dy));
  if (k > 0) {
    outer = offsetPolygon(outer, k);
    loose = loose.map((r) => offsetPolygon(r, k));
    holes = holes.map((r) => offsetPolygon(r, -k));
  }

  let cutLength = 0;
  for (const ring of [outer, ...loose, ...holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      cutLength += Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
    }
  }
  const size = bbox(outer);

  return {
    params: { ...p },
    panels: [{
      id: 'topper',
      label: 'Cake topper',
      outline: outer,
      holes,
      loose,
      engrave: [],
      engraveFill: [],
      size: { w: size.w, h: size.h },
      thickness: p.thickness,
    }],
    derived: {
      width: size.w,
      height: size.h,
      textWidth: ink.w,
      textHeight: ink.h,
      capMM,
      lines: laid.filter(Boolean).length,
      pieces,
      loose: loose.length,
      holes: holes.length,
      bridges,
      stroke,
      rawStroke,
      suggestThicken: stroke < MIN_STROKE
        ? Math.ceil(((MIN_STROKE - stroke) / 2) * 10) / 10 : 0,
      stakeAt: wanted.map((x) => x + dx),
      stakeSnapped: snapped,
      balance,
      cutLength,
      engraveLength: 0,
      engraveFill: false,
      engraveLine: false,
      warnings,
      empty: false,
    },
  };
}

export { ringArea };
