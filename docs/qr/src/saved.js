// Saved designs: the tool's state as an account record, and back again.
//
// What is kept is the SETTINGS - the link, the size, the error correction, the
// frame, the board and the two burn-time inputs - never the SVG or the PDF. A
// few hundred bytes, still editable, and always cut by whatever this tool has
// become since. The storage itself (Firestore, the gallery) is designs.js and
// cloud.js, the same files every tool carries; this file is only the shape.
//
// params is one flat map: the twelve settings buildTag reads, plus the scan
// speed and line interval the store keeps beside them. Nothing here is nested
// or large - even the longest text a QR code can hold is under three thousand
// bytes - so there is no extra.
//
// Not kept: the view tab and the preview backdrop, which are how somebody is
// looking at the design rather than part of it, and the sheet width, which
// nothing lets a user change.
//
// No DOM; tested by scripts/test-qr-designs.mjs.

import { DEFAULTS, FRAMES } from './geom/tag.js';
import { ECC_LEVELS, MAX_VERSION } from './geom/qr.js';

/** What the top bar shows before the design has a name of its own. */
export const UNTITLED = 'Untitled QR';

// Names that mean "not named": the store's default, and what the Save dialog
// writes when its field is left empty (UNTITLED in designs.js).
const NO_NAME = new Set(['', UNTITLED, 'QR tanpa nama']);

// The same values store.js starts from, for the settings that live beside
// params rather than in it.
const JOB_DEFAULTS = { scanSpeed: 300, lineInterval: 0.1 };

/**
 * The longest text worth keeping. The largest QR code there is holds 2953
 * bytes, so anything longer cannot be encoded whatever it is cut to - and
 * cutting it here still leaves it too long, which is what the tool will say.
 * What it stops is a pasted page of text being carried into every save.
 */
export const TEXT_MAX = 4000;

// The ranges the inspector's own fields clamp to (ui.js). A record is data from
// a server, and a number outside these is pulled back in exactly as the field
// would pull back a number typed into it.
const RANGES = {
  size: [10, 300],
  margin: [0, 25],
  corner: [0, 20],
  holeDia: [1, 12],
  holeEdge: [1, 12],
  thickness: [1, 12],
  kerf: [0, 1],
  scanSpeed: [20, 1200],
  lineInterval: [0.02, 0.5],
};

const FRAME_WORDS = { none: 'ukiran sahaja', plaque: 'plak', keychain: 'keychain' };

const r1 = (v) => Math.round(Number(v) * 10) / 10;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** One value for key k, cleaned, or undefined when it cannot be used at all. */
function cleanValue(k, v) {
  if (k === 'text') {
    if (typeof v !== 'string') return undefined;
    if (v.length <= TEXT_MAX) return v;
    // Never leave half of an emoji on the end.
    const cut = v.slice(0, TEXT_MAX);
    return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut;
  }
  if (k === 'ecl') return ECC_LEVELS.some((e) => e.id === v) ? v : undefined;
  if (k === 'frame') return FRAMES.some((f) => f.id === v) ? v : undefined;
  if (k === 'boost') return typeof v === 'boolean' ? v : undefined;
  if (k === 'version') {
    return finite(v) ? Math.min(MAX_VERSION, Math.max(0, Math.round(v))) : undefined;
  }
  if (!finite(v)) return undefined;
  const [lo, hi] = RANGES[k] || [-Infinity, Infinity];
  return Math.min(hi, Math.max(lo, v));
}

/** Every setting, cleaned, with a default wherever the source has nothing usable. */
function cleanFlat(src) {
  const out = {};
  for (const [k, d] of Object.entries({ ...DEFAULTS, ...JOB_DEFAULTS })) {
    const v = cleanValue(k, src?.[k]);
    out[k] = v === undefined ? d : v;
  }
  return out;
}

/** The complete default state: what store.js starts from, less the view settings. */
export function defaultState() {
  return { params: { ...DEFAULTS }, ...JOB_DEFAULTS, name: UNTITLED };
}

/** The name the person gave it, or '' when it has none of its own. */
export function ownName(state) {
  const name = typeof state?.name === 'string' ? state.name.trim() : '';
  return NO_NAME.has(name) ? '' : name;
}

/** The text as it reads in a list: no scheme, one line, not too long. */
function shortText(text, max = 60) {
  const one = String(text || '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\s+/g, ' ')
    .replace(/\/$/, '')
    .trim();
  const chars = Array.from(one);
  return chars.length > max ? `${chars.slice(0, max).join('').trim()}...` : one;
}

/** Automatic name, used until the person names it: size, frame and what it points at. */
export function autoName(state) {
  const p = cleanFlat(state?.params);
  const head = `QR ${r1(p.size)} mm ${FRAME_WORDS[p.frame]}`;
  const what = shortText(p.text);
  return (what ? `${head} - ${what}` : head).slice(0, 120);
}

/**
 * The params map for the record: the settings this tool understands today and
 * nothing else, every value cleaned. A browser copy saved by an older version
 * may carry keys that have since gone, and the rules allow forty at most.
 */
export function designParams(state) {
  return cleanFlat({ ...state?.params, scanSpeed: state?.scanSpeed, lineInterval: state?.lineInterval });
}

/** The material, as a person reads it in the record. Engraving only has none. */
export function designMaterial(state) {
  const p = cleanFlat(state?.params);
  return p.frame === 'none' ? '' : `Papan ${r1(p.thickness)}mm`;
}

/** Nothing beyond params - see the top of this file. */
export const designExtra = () => null;

/**
 * Record from the account -> { name, state }. Every value is checked: the
 * record is data from a server, and a bad one has to fall back to the default
 * rather than travel into the geometry as NaN. name is '' when the record
 * carries the automatic name, so that it stays automatic once opened.
 */
export function readDesign(row) {
  const src = row && typeof row.params === 'object' && row.params && !Array.isArray(row.params)
    ? row.params : {};
  const flat = cleanFlat(src);
  const { scanSpeed, lineInterval, ...params } = flat;
  const state = { params, scanSpeed, lineInterval, name: UNTITLED };
  const given = ownName({ name: typeof row?.name === 'string' ? row.name.slice(0, 120) : '' });
  if (given && given !== autoName(state)) state.name = given;
  return { name: state.name === UNTITLED ? '' : state.name, state };
}
