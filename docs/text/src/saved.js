// Saved designs: the engraver's state as an account record, and back again.
//
// What is kept is the SETTINGS - the words, the typeface, the size and spacing,
// slant, width, margin, curve fitting and the engrave speed - never the SVG or
// PDF. A few hundred bytes, still editable, and always laid out by the current
// version of the tool. The preview backdrop and the page-outline toggle are
// how this browser looks at a design, not part of it, so they stay out.
// Storage itself (Firestore, the gallery) is in designs.js and cloud.js, the
// same as every other tool; this file is only the shape of the data.
//
// Pure: no DOM. Tested by scripts/test-text-designs.mjs.

import { DEFAULTS } from './geom/text.js';

/** Fresh state, as the store starts it and as "Start over" leaves it. */
export function defaultState() {
  return {
    params: { ...DEFAULTS, margin: 5, smooth: true },
    speed: 200,          // mm/s, for the time estimate only
  };
}

// The inspector's own limits. Nothing the controls can produce falls outside
// them, so clamping here only ever touches a record that did not come from us.
const RANGES = {
  capHeight: [2, 300],
  letterSpacing: [-5, 30],
  wordSpacing: [-5, 40],
  lineSpacing: [0.8, 4],
  margin: [0, 50],
  slant: [-30, 30],
  width: [50, 200],
};
const SPEED = [10, 1000];
const ALIGNS = ['left', 'center', 'right'];
// Face ids are file names in src/font/. Without the live list to check against,
// anything shaped like one is accepted and the tool falls back if it is missing.
const FACE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/i;

const num = (v, fallback, [lo, hi]) => (typeof v === 'number' && Number.isFinite(v)
  ? Math.min(hi, Math.max(lo, v))
  : fallback);

const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Every value checked, every key present, nothing foreign. Idempotent, which
 * is what makes the round trip exact: what is saved has already been through
 * here, so reading it back changes nothing.
 * `faces` is the list of face ids the tool has; omit it to accept any id.
 */
function clean(state, faces) {
  const d = defaultState();
  const src = isMap(state) ? state : {};
  const p = isMap(src.params) ? src.params : {};
  const params = { ...d.params };
  if (typeof p.text === 'string') params.text = p.text;
  if (typeof p.face === 'string'
    && (faces && faces.length ? faces.includes(p.face) : FACE_ID.test(p.face))) {
    params.face = p.face;
  }
  for (const [k, range] of Object.entries(RANGES)) params[k] = num(p[k], d.params[k], range);
  if (ALIGNS.includes(p.align)) params.align = p.align;
  if (typeof p.smooth === 'boolean') params.smooth = p.smooth;
  return { params, speed: num(src.speed, d.speed, SPEED) };
}

// Room for the words in an automatic name, in UTF-16 units - what the 120 the
// record allows is counted in. Cut on whole characters, so an emoji is never
// split in half.
const WORDS_MAX = 60;

/** Automatic name: the words themselves, and how big. Used until the user names it. */
export function autoName(state) {
  const { params } = clean(state);
  const words = params.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' / ');
  if (!words) return 'Teks tanpa nama';
  let shown = words;
  if (words.length > WORDS_MAX) {
    shown = '';
    for (const ch of words) {
      if (shown.length + ch.length > WORDS_MAX - 1) break;
      shown += ch;
    }
    shown = `${shown.trimEnd()}…`;
  }
  return `Teks "${shown}", ${Math.round(params.capHeight * 10) / 10} mm`;
}

/**
 * The params field: the layout settings plus the speed, flat - twelve keys,
 * every one a string, a finite number or a boolean. The words go here too, as
 * they do in the Stand and Keychain tools: they are the design, and a line of
 * text is far smaller than anything else a tool might carry.
 */
export function designParams(state) {
  const s = clean(state);
  return { ...s.params, speed: s.speed };
}

/** A stroke file is not cut from anything in particular: no material. */
export const designMaterial = () => '';

/** Nothing beyond the settings, so no extra field at all. */
export const designExtra = () => null;

/**
 * Record from the account -> { name, state }. Every value is checked: the
 * record is data from a server, and a broken value has to land on the default,
 * not on NaN in the layout. Unknown keys are ignored, and so is `extra` - this
 * tool never writes one. `name` is '' when the record carries the automatic
 * name, so it stays automatic and follows the text once it is edited.
 */
export function readDesign(row, faces) {
  const p = isMap(row?.params) ? row.params : {};
  const state = clean({ params: p, speed: p.speed }, faces);
  const raw = typeof row?.name === 'string' ? row.name.trim() : '';
  return {
    name: raw && raw !== autoName(state) ? raw.slice(0, 120) : '',
    state,
  };
}
