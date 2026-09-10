// The ten patterns, and the promise that none of them leaves anything loose.
//
// Ten looks, three code paths. Seven of them are Hankin's polygons in contact
// on a different tiling with a different angle; two are parallel straps, which
// cannot go wrong and are therefore the fallback; one is the same star geometry
// read the other way round, punched as separate holes with the field between
// them left solid. Writing ten generators would have given ten places for the
// same bug to hide.
//
// THE CONSTRUCTION, and why it is this way round.
//
// The panel starts SOLID and cells are subtracted from it. It is not built up
// by thickening the strap network and welding bands on. The two descriptions
// give the same picture, and they are not equally safe:
//
//   - subtracting cannot sever anything. Every repair is "do not cut that one
//     after all", which only ever ADDS material, so the repair loop is monotone
//     and terminates and cannot strand something else while fixing this thing.
//   - a cell is only cut when the WHOLE of it is clear of the frame band, the
//     cartouche band and every joint land. So a strap is never severed by a
//     clip; the cell that would have severed it is simply not cut. The band is
//     material because nothing was taken out of it.
//
// Between them those two make an interior island impossible by construction,
// which is a real result and also a trap: a suite fed only generated patterns
// would pass forever without the checker working at all. That is why the test
// file carries hand-built island and pinch fixtures that never go near this
// file, and why the honest claim made anywhere in this directory is only ever
// "the geometry that came out passed both tests at this grid pitch".
//
// Millimetres, y-up, rings are [x, y] pairs, contours CCW and holes CW.

import {
  minWidth as minWidthOf, holeFloor as holeFloorOf, maxCell,
  frameBand as frameBandOf, jointLand, strapFloor, strapDefault, MIN_TIP_ANGLE,
  THETA_MAX,
} from './floors.js';
import { TILINGS } from './tilings.js';
import { picSegments, starCell } from './pic.js';
import { LATTICES, latticeSegments } from './lattice.js';
import {
  splitSegments, planarFaces, ringArea, ringBBox, inradius, minTipAngle, inRing,
} from './arrangement.js';
import { makeRegion, ringClearOf, cartoucheRing, CARTOUCHES } from './region.js';
import { rasterPanel, traceField } from './raster.js';
import { checkPanel } from './connect.js';

export const PRESETS = [
  {
    id: 'khatam8',
    name: 'Khatam 8',
    note: 'Bintang lapan bucu yang tajam - rupa klasik.',
    gen: 'pic',
    tiling: 'sq488',
    theta: 67.5,
  },
  {
    id: 'khatamTenang',
    name: 'Khatam Tenang',
    note: 'Persilangan hampir tegak; jalur paling sekata. Terbaik untuk papan 9 mm.',
    gen: 'pic',
    tiling: 'sq488',
    theta: 50,
  },
  {
    id: 'sitara6',
    name: 'Sitara 6',
    note: 'Bintang enam bucu bertemu hujung. Keluarga paling kukuh.',
    gen: 'pic',
    tiling: 'hex666',
    theta: 60,
  },
  {
    id: 'kagome',
    name: 'Kagome',
    note: 'Bintang enam dalam heksagon, simpul tiga dalam segi tiga.',
    gen: 'pic',
    tiling: 'kagome',
    theta: 65,
  },
  {
    id: 'shamsa12',
    name: 'Shamsa 12',
    note: 'Bintang dua belas. Sel terkecil, jadi jarak corak dinaikkan sendiri.',
    gen: 'pic',
    tiling: 'dod4612',
    theta: 72,
  },
  {
    id: 'girih10',
    name: 'Girih 10',
    note: 'Dekagon dan rama-rama, dipotong pada bingkai.',
    gen: 'pic',
    tiling: 'girih',
    theta: 72,
  },
  {
    id: 'jali',
    name: 'Jali',
    note: 'Kekisi pepenjuru yang tenang dan paling cepat dipotong.',
    gen: 'pic',
    tiling: 'sq4444',
    theta: 48,
  },
  {
    id: 'anyaman',
    name: 'Anyaman',
    note: 'Dua keluarga jalur bersilang. Tersambung mengikut binaan.',
    gen: 'lattice',
    lattice: 'weave45',
  },
  {
    id: 'tigaArah',
    name: 'Tiga Arah',
    note: 'Tiga keluarga jalur, sel segi tiga.',
    gen: 'lattice',
    lattice: 'tri60',
  },
  {
    id: 'bintangRingkas',
    name: 'Bintang Ringkas',
    note: 'Hanya bintang ditebuk, selebihnya pejal. Paling kukuh dan paling cepat.',
    gen: 'punch',
    tiling: 'sq488',
    theta: 67.5,
  },
];

export const presetOf = (id) => PRESETS.find((p) => p.id === id) || PRESETS[1];

/** The pitch range a preset accepts, and its default. */
export function pitchRange(preset) {
  const p = presetOf(preset.id ?? preset);
  if (p.gen === 'lattice') return LATTICES[p.lattice].pitch;
  return TILINGS[p.tiling].pitch;
}

const perimeter = (ring) => {
  let L = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    L += Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
  }
  return L;
};

/** Every strap of a preset, over a rectangle, before anything is clipped. */
export function presetSegments(preset, rect, pitch, thetaDeg) {
  const p = presetOf(preset.id ?? preset);
  if (p.gen === 'lattice') {
    return latticeSegments(rect, LATTICES[p.lattice].bearings, pitch);
  }
  const t = TILINGS[p.tiling];
  const theta = Math.max(t.thetaMin, Math.min(t.thetaMax, thetaDeg ?? p.theta));
  return picSegments(t.faces(rect, pitch), theta);
}

/**
 * The candidate cells: every space the straps enclose, or - in punch mode - the
 * stars alone.
 */
function candidateCells(p, rect, pitch, theta, segs) {
  if (p.gen === 'punch') {
    const t = TILINGS[p.tiling];
    const out = [];
    for (const f of t.faces(rect, pitch)) {
      const s = starCell(f, theta);
      if (s) out.push(s);
    }
    return out;
  }
  return planarFaces(splitSegments(segs, pitch * 2), { minArea: 0.05 });
}

/**
 * Build the pattern for one panel.
 *
 * The caller owns the panel: its outline, and the rings of any joint feature
 * the pattern has to stay away from. This function owns everything inside it.
 *
 * @param outline    panel outline, CCW pairs
 * @param thickness  board thickness in mm - the minimum feature width is
 *                   derived from it, never hard-coded
 * @param kerf       beam width in mm
 * @param preset     one of PRESETS
 * @param keepOut    rings the pattern must stay a joint land clear of
 * @param cartouche  { shape, cx, cy, a, b, band } or null
 */
export function buildPattern(opts) {
  const {
    outline,
    thickness = 9,
    kerf = 0.3,
    preset: presetId = 'khatamTenang',
    keepOut = [],
    cartouche = null,
    maxRepair = 2,
    maxRescale = 3,
  } = opts;

  const warnings = [];
  const t = thickness;
  const minW = minWidthOf(t, kerf);
  const hFloor = holeFloorOf(t, kerf);
  const cellMax = maxCell(t, kerf);
  const cell = Math.min(opts.cell ?? cellMax, cellMax);
  const frame = opts.frame ?? frameBandOf(t, kerf);
  const land = jointLand(t);

  let p = presetOf(presetId);
  const bb = ringBBox(outline);

  const excludes = keepOut.filter((r) => r && r.length > 2)
    .map((ring) => ({ ring, clearance: land }));
  let cRing = null;
  let bandW = 0;
  if (cartouche && cartouche.shape && cartouche.shape !== 'none') {
    bandW = cartouche.band ?? Math.max(6, 2.5 * minW);
    cRing = cartoucheRing(cartouche.shape, cartouche.cx, cartouche.cy, cartouche.a, cartouche.b);
    if (cRing) excludes.push({ ring: cRing, clearance: bandW });
  }
  const region = makeRegion({ outline, frame, excludes });

  // CLAMPED HERE, NOT IN THE WIDGET THAT HAPPENS TO SET THEM.
  //
  // ui.js's numberRow already holds the slider inside pitchRange, so nothing a
  // user can drag arrives out of range - but the slider is not the only way
  // in. store.js's applyDesign() and load() both Object.assign a saved design
  // straight over the parameters, so a design saved on another device, or a
  // hand-edited localStorage entry, gets here unvalidated. A pitch of 1 mm
  // then spends fifteen seconds inside splitSegments and dies with "Set
  // maximum size exceeded" - a crash rather than a refusal - and a non-finite
  // pitch propagates NaN into every coordinate with no error at all.
  //
  // A guard in the builder is worth more than a guard in one widget, because
  // the builder is what every path goes through.
  const pr = pitchRange(p);
  const wantPitch = opts.pitch ?? pr.def;
  let pitch = Number.isFinite(wantPitch)
    ? Math.max(pr.min, Math.min(pr.max, wantPitch)) : pr.def;
  if (Number.isFinite(wantPitch) && Math.abs(pitch - wantPitch) > 1e-9) {
    warnings.push(
      `Jarak corak ${wantPitch} mm di luar julat corak ini - digunakan `
      + `${pitch.toFixed(1)} mm (julat ${pr.min}-${pr.max} mm).`,
    );
  }
  const wantTheta = opts.theta ?? p.theta;
  let theta = Number.isFinite(wantTheta)
    ? Math.max(0, Math.min(THETA_MAX, wantTheta)) : p.theta;
  let substituted = false;
  let rescales = 0;
  let repairs = 0;
  let attempts = 0;
  let attempt = null;

  for (let round = 0; round <= maxRescale; round++) {
    const rect = {
      x0: bb.x0 - pitch, y0: bb.y0 - pitch, x1: bb.x1 + pitch, y1: bb.y1 + pitch,
    };
    const segs = presetSegments(p, rect, pitch, theta);

    let w = opts.strapWidth ?? strapDefault(t, kerf, pitch);
    const wFloor = strapFloor(t, kerf);
    if (w < wFloor) {
      warnings.push(
        `Lebar jalur dinaikkan ke ${wFloor.toFixed(2)} mm: web minimum `
        + `${minW.toFixed(2)} mm untuk papan ${t} mm (0.22 x ${t} + ${kerf} kerf), `
        + 'dan web antara dua lubang kehilangan satu kerf penuh.',
      );
      w = wFloor;
    }

    const cand = candidateCells(p, rect, pitch, theta, segs);
    let cells = [];
    let tooSmall = 0;
    let tooSharp = 0;
    for (const c of cand) {
      if (!ringClearOf(region, c)) continue;
      if (inradius(c) - w / 2 < hFloor) { tooSmall++; continue; }
      if (minTipAngle(c) < MIN_TIP_ANGLE) { tooSharp++; continue; }
      cells.push(c);
    }

    // Repair rounds. Every one of them drops a cell, which fills a hole back
    // in, which only adds material - so this cannot make the panel worse and
    // cannot fail to terminate.
    let res = renderAndCheck({ outline, cells, w, cell, kerf, frame, minW });
    for (let r = 0; r < maxRepair && !res.check.pass; r++) {
      const dropped = dropOffenders(cells, res.check, minW);
      if (!dropped) break;
      cells = cells.filter((c) => !dropped.has(c));
      repairs++;
      res = renderAndCheck({ outline, cells, w, cell, kerf, frame, minW });
    }
    attempts++;

    attempt = {
      res, cells, w, segs, pitch, theta, tooSmall, tooSharp, cand: cand.length,
    };
    if (res.check.pass && cells.length) break;

    if (round < maxRescale) {
      // Still failing, or the pattern came out empty. A coarser pitch makes
      // every cell bigger and every web longer, so it is the one knob that
      // helps both failure modes at once.
      pitch *= 1.15;
      rescales++;
    } else if (!substituted) {
      substituted = true;
      p = presetOf('anyaman');
      theta = undefined;
      pitch = pitchRange(p).def;
      round = -1;
      rescales = 0;
    }
  }

  const { res, cells, w, segs } = attempt;
  if (rescales) {
    warnings.push(
      `Jarak corak dinaikkan ${(rescales * 15)}% ke ${pitch.toFixed(1)} mm supaya `
      + `setiap lubang lebih besar daripada ${hFloor.toFixed(2)} mm.`,
    );
  }
  if (substituted) {
    warnings.push(
      `Corak "${presetOf(presetId).name}" tidak boleh dipotong dengan selamat pada `
      + `saiz dan ketebalan ini. Ditukar ke "Anyaman", yang tersambung mengikut binaan.`,
    );
  }
  if (!res.check.pass) {
    warnings.push('Semakan sambungan masih gagal - jangan potong fail ini.');
  }

  const panelArea = Math.abs(ringArea(outline));
  let holeArea = 0;
  for (const h of res.nominal.holes) holeArea += Math.abs(ringArea(h));
  const removed = (holeArea / panelArea) * 100;
  if (removed > 55) {
    // A rule of thumb about stiffness, not a stress calculation. Nobody has
    // computed this panel's bending capacity with a tessellation cut into it.
    warnings.push(
      `${removed.toFixed(0)}% papan dibuang. Melebihi 55% papan belakang jadi lembut.`,
    );
  }

  let cutLen = 0;
  for (const r of [...res.cut.outers, ...res.cut.holes]) cutLen += perimeter(r);

  let minHole = Infinity;
  for (const c of cells) minHole = Math.min(minHole, inradius(c) - w / 2);

  return {
    ok: res.check.pass,
    warnings,
    params: {
      preset: p.id,
      requested: presetId,
      pitch,
      theta: p.gen === 'lattice' ? null : theta,
      strapWidth: w,
      frame,
      band: bandW,
      minWidth: minW,
      holeFloor: hFloor,
      cell,
      kerf,
      thickness: t,
      land,
    },
    cells,
    segments: segs,
    cartouche: cRing,
    cut: res.cut,
    nominal: res.nominal,
    field: res.field,
    check: res.check,
    derived: {
      holeCount: res.cut.holes.length,
      // Every cell that was cut should have come out as its own hole. If two
      // holes have run into each other the strap between them has gone, which
      // is the failure mode a connectivity test cannot see: merging only ever
      // makes the remaining material a simpler shape, so the panel stays one
      // piece and looks fine while the pattern it was supposed to have has
      // dissolved. Counting is the cheapest way to notice.
      mergedHoles: cells.length - res.cut.holes.length,
      cellsKept: cells.length,
      areaRemovedPct: removed,
      cutLengthMm: cutLen,
      minWebMm: res.check.minWebMm,
      minHoleRadiusMm: Number.isFinite(minHole) ? minHole : 0,
      repairs,
      rescales,
      attempts,
      substituted,
    },
  };
}

function renderAndCheck({ outline, cells, w, cell, kerf, frame, minW }) {
  const field = rasterPanel({ outline, faces: cells, inset: w / 2, cell, kerf, frame });
  const cut = traceField(field, 'kerfed');
  const nominal = traceField(field, 'v');
  const check = checkPanel({
    rings: cut.rings, field, minWidth: minW, kerf, frame, which: 'kerfed',
  });
  return { field, cut, nominal, check };
}

/**
 * Which cells to stop cutting, given what the check complained about.
 *
 * An island is fixed by filling the hole that CONTAINS it, never by deleting
 * the island - deleting the island removes material and can strand something
 * else. A hairline is fixed by dropping the smaller of the two cells that are
 * pinching it.
 */
function dropOffenders(cells, check, minW) {
  const drop = new Set();
  const boxes = cells.map((c) => ({ c, b: ringBBox(c), a: Math.abs(ringArea(c)) }));
  const hit = (x, y, reach) => {
    let best = null;
    for (const e of boxes) {
      if (x < e.b.x0 - reach || x > e.b.x1 + reach
        || y < e.b.y0 - reach || y > e.b.y1 + reach) continue;
      if (!best || e.a < best.a) best = e;
    }
    return best;
  };
  for (const isl of check.islands) {
    const e = boxes.find((b) => inRing(isl.at[0], isl.at[1], b.c)) || hit(isl.at[0], isl.at[1], minW);
    if (e) drop.add(e.c);
  }
  for (const hl of check.hairlines) {
    const e = hit(hl.at[0], hl.at[1], minW * 2);
    if (e) drop.add(e.c);
  }
  return drop.size ? drop : null;
}

export { CARTOUCHES, cartoucheRing };
