// How big is this drawing, really - and does the file actually say?
//
// This is the file the whole tool is bent around. A converter that prints
// "20 cm x 15 cm" for a drawing that was made in inches gets somebody to cut a
// board at the wrong size, and they will blame the tool, correctly. So the only
// two answers allowed here are a number the file genuinely declared, and "I do
// not know, tell me".
//
// The enforcement is not a convention, it is the return value: when the state
// is unknown or implausible, mmPerUnit is null. Not 1, not 25.4/96, not a
// plausible-looking default. There is nothing to fall back to, so a caller that
// forgets to check the state divides by null and produces NaN, which is loud,
// instead of producing a confident wrong measurement, which is not.
//
//   UnitState = {
//     state:     'known' | 'nominal' | 'unknown' | 'implausible'
//     mmPerUnit: number | null   - null IFF state is unknown or implausible
//     source:    'mm' | 'in' | 'px' | 'insunits:4' | 'assumed' | 'user:cm' ...
//     declared:  { w, h } in mm, from the file's own words, or null
//     chosen:    the unit the user picked, or null
//     why:       one Bahasa Melayu sentence for the UI
//   }

import { svgDocScale, unitFactor } from './importArt.js';

export { unitFactor };

/**
 * The picker the UI shows when the file did not say.
 *
 * The brief asks for mm / cm / inch. px and pt are here as well because an SVG
 * with no units almost always came off the web or out of a PDF, and telling
 * somebody with an 800x600 export that their only choices are millimetres,
 * centimetres or inches is making them guess too.
 *
 * The Adjuster's own UNIT_CHOICES has no cm row at all (its private table does,
 * so unitFactor('cm') has always returned 10) - which is why this list is here
 * rather than imported. Editing the Adjuster's list would change its UI for a
 * reason that has nothing to do with the Adjuster.
 */
export const UNIT_CHOICES_CONV = [
  ['mm', 'Milimeter (mm)'],
  ['cm', 'Sentimeter (cm)'],
  ['in', 'Inci (in)'],
  ['px', 'Piksel (96 dpi)'],
  ['pt', 'Point (1/72 inci)'],
];

/**
 * DXF header variable $INSUNITS, group code 70, as millimetres per drawing unit.
 *
 * 0 is "Unitless" and is NOT a default of millimetres - it is the file saying
 * it does not know, which is exactly the same situation as the variable being
 * absent and gets exactly the same treatment. It is left out of this table on
 * purpose so a lookup cannot succeed on it.
 */
export const INSUNITS_MM = {
  1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6,
  8: 2.54e-5, 9: 0.0254, 10: 914.4, 11: 1e-7, 12: 1e-6, 13: 0.001,
  14: 100, 15: 10000, 16: 100000, 17: 1e12, 18: 1.495978707e14,
  19: 9.4607e18, 20: 3.0857e19, 21: 304.8006096, 22: 25.40005080,
  23: 914.4018288, 24: 1609347.219,
};

const INSUNITS_NAME = {
  1: 'inci', 2: 'kaki', 4: 'milimeter', 5: 'sentimeter', 6: 'meter',
};

// A drawing smaller than half a millimetre or wider than five kilometres is not
// a thing anybody cuts. The band is wide on purpose - it is here to catch a
// declared unit that is off by orders of magnitude (a file marked in light
// years, a drawing in metres that says inches), not to second-guess a small
// part. It is a judgement, not a measurement, and it should be tightened when
// somebody has looked at the range of files that actually come through.
const MIN_MM = 0.5;
const MAX_MM = 5_000_000;

const known = (mmPerUnit, source, declared, why) => ({
  state: 'known', mmPerUnit, source, declared: declared ?? null, chosen: null, why,
});

const unknown = (source, why) => ({
  state: 'unknown', mmPerUnit: null, source, declared: null, chosen: null, why,
});

/**
 * The unit state of an SVG.
 *
 * svgDocScale() is doing the reading; this function's whole job is deciding
 * what its answer means. It never returns null and never throws: with no usable
 * declared size it hands back a real mmPerUnit of 25.4/96 and flags the guess
 * only through source === 'assumed'. So the test is `source === 'assumed'`, and
 * the number is dropped on the floor when it is. It cannot be
 * `source === 'known'` either - on success source is the unit's NAME, and no
 * SVG in the world declares a unit called "known".
 */
export function svgUnits(text) {
  const s = svgDocScale(text);
  if (s.source === 'assumed') {
    return unknown('assumed',
      'Fail SVG ini tidak menyatakan saiz sebenar - hanya viewBox, atau saiz yang tidak boleh dipakai.');
  }
  if (s.source === 'px') {
    // Its own state, and not folded into either neighbour.
    //
    // A CSS pixel is 1/96 inch by specification, so the file IS making a
    // physical claim and refusing to show it would be over-strict - somebody
    // converting a web-sourced SVG would be asked a question the file answered.
    // But a bare width="800" out of a browser or an icon set is a canvas size
    // that nobody ever measured, and presenting 21.2 cm from it in the same
    // typeface as a declared 45 mm would be putting a guess and a fact side by
    // side. So: the number is shown, always with the qualifier, and the picker
    // stays open.
    return {
      state: 'nominal',
      mmPerUnit: s.mmPerUnit,
      source: 'px',
      declared: s.declared,
      chosen: null,
      why: 'Fail ini menyatakan saiz dalam piksel (96 dpi), bukan unit fizikal.',
    };
  }
  return known(s.mmPerUnit, s.source, s.declared,
    `Fail SVG menyatakan unitnya sendiri (${s.source}).`);
}

/**
 * The unit state of a DXF, from its header.
 *
 * `header` is the map dxf/parse.js builds - { insunits, acadver, codepage }.
 *
 * Do NOT be tempted to read $MEASUREMENT here. The owner's own
 * modern-spline-mm.dxf sets $MEASUREMENT = 0 (English) three lines above
 * $INSUNITS = 4 (millimetres), in a file that really is in millimetres.
 * $MEASUREMENT chooses which linetype and hatch pattern file AutoCAD loads; it
 * says nothing at all about the drawing's units. Reading it as a hint gets that
 * file wrong by a factor of 25.4.
 */
export function dxfUnits(header = {}) {
  const raw = header.insunits;
  if (raw == null) {
    const r12 = String(header.acadver || '').toUpperCase() === 'AC1009';
    return unknown('assumed', r12
      ? 'DXF R12 (AC1009) tidak ada medan unit langsung - bukan pengeksport yang malas, format itu memang tak boleh cakap.'
      : 'Fail DXF ini tiada $INSUNITS, jadi ia tidak menyatakan unitnya.');
  }
  const code = Number(raw);
  if (code === 0) {
    return unknown('insunits:0',
      'Fail DXF ini tulis $INSUNITS = 0, iaitu "tiada unit" - ia sendiri mengaku tidak tahu.');
  }
  const mm = INSUNITS_MM[code];
  if (mm == null) {
    return unknown(`insunits:${code}`,
      `Fail DXF ini tulis $INSUNITS = ${code}, kod yang kami tidak kenal.`);
  }
  const name = INSUNITS_NAME[code] || `kod $INSUNITS ${code}`;
  return known(mm, `insunits:${code}`, null, `Fail DXF menyatakan unitnya: ${name}.`);
}

/**
 * The user answered the question. Apply it - and keep saying so.
 *
 * source becomes 'user:cm', never plain 'cm'. That distinction is the only
 * thing standing between "the file said 45 mm" and "somebody typed 45 mm", and
 * it has to survive all the way into the downloaded file, because in six months
 * the file will have been emailed to a third person who was not here for this
 * conversation.
 */
export function applyUserUnit(state, id) {
  const f = unitFactor(id);
  if (f == null) return state;
  const label = (UNIT_CHOICES_CONV.find((c) => c[0] === id) || [id, id])[1];
  return {
    state: 'known',
    mmPerUnit: f,
    source: `user:${id}`,
    declared: state && state.declared ? state.declared : null,
    chosen: id,
    why: `Fail asal tidak menyatakan unit. Anda pilih ${label}.`,
  };
}

/** True when the size shown came from the user rather than from the file. */
export const isUserChosen = (state) => !!state && String(state.source || '').startsWith('user:');

/**
 * Second-guess a declared unit once the drawing's real extents are known.
 *
 * Runs after the geometry is read, because a unit code on its own is never
 * implausible - a file marked in light years is only obviously wrong once you
 * see that it makes the drawing 9.5e18 cm across.
 */
export function checkPlausible(state, wUnits, hUnits) {
  if (!state || state.mmPerUnit == null) return state;
  if (!Number.isFinite(wUnits) || !Number.isFinite(hUnits)) return state;
  const w = Math.abs(wUnits * state.mmPerUnit);
  const h = Math.abs(hUnits * state.mmPerUnit);
  const big = Math.max(w, h);
  if (big === 0) return state; // an empty drawing has no size to disbelieve
  if (big >= MIN_MM && big <= MAX_MM) return state;
  return {
    ...state,
    state: 'implausible',
    mmPerUnit: null,
    why: `Unit yang fail ini nyatakan menjadikan lukisan ${fmtMm(w)} x ${fmtMm(h)}. `
      + 'Nombor itu nampak tak masuk akal, jadi kami tanya dan bukan menganggap.',
  };
}

function fmtMm(mm) {
  if (mm >= 1e6 || (mm > 0 && mm < 0.01)) return `${mm.toExponential(2)} mm`;
  return `${Math.round(mm * 100) / 100} mm`;
}

/**
 * The drawing's size in centimetres, or null.
 *
 * null is a real answer here and the UI has to render it as one - not as a
 * greyed-out number, not as a guess in brackets. "The file does not say" is the
 * correct output when the file does not say.
 */
export function dimensionsCm(state, wUnits, hUnits) {
  if (!state || state.mmPerUnit == null) return null;
  if (!Number.isFinite(wUnits) || !Number.isFinite(hUnits)) return null;
  return {
    w: (wUnits * state.mmPerUnit) / 10,
    h: (hUnits * state.mmPerUnit) / 10,
  };
}

/** "116.7 cm x 86.9 cm", or null when there is no honest number to show. */
export function formatCm(dim) {
  if (!dim) return null;
  const r = (v) => (Math.round(v * 10) / 10).toFixed(1);
  return `${r(dim.w)} cm x ${r(dim.h)} cm`;
}
