// Saved designs: the puzzle on screen -> an account record, and back.
//
// What is kept is the SETTINGS - board size, piece grid, tab size, jitter,
// seed, corner radius, kerf, material and the layer split - never the SVG or
// PDF. A few hundred bytes, still editable, and always cut by the current
// version of the generator. Same seed, same puzzle, so nothing is lost by not
// keeping the lines themselves.
//
// The storage itself (Firestore, the gallery) is designs.js and cloud.js, the
// same two files every other tool carries; this file is only the shape of the
// data.
//
// params is state.params exactly as buildPuzzle takes it: flat, ten keys, well
// under the 40 that firestore.rules allows. The material and the layer split
// are not generator inputs, so they travel beside it in extra. The preview
// backdrop is not kept at all - it is how you look at the puzzle, not the
// puzzle.
//
// Pure: no DOM. Tested by scripts/test-puzzle-designs.mjs.

import { DEFAULTS } from './geom/puzzle.js';
import { MATERIALS } from './store.js';

/** The top-bar name that means "not named yet". store.js starts with it. */
export const UNTITLED = 'Untitled puzzle';
const DEFAULT_MATERIAL = 'falcata3'; // the same as store.js

/**
 * What each control in ui.js lets you set: [min, max, whole number].
 *
 * A record outside these is not something this tool can make, and some of
 * what lies outside - a hundred thousand columns - would hang the tab building
 * it. So a number is held to the edge of its range rather than trusted.
 */
const RANGE = {
  width: [20, 1200],
  height: [20, 900],
  cols: [2, 60, true],
  rows: [2, 60, true],
  tabSize: [10, 30],
  jitter: [0, 13],
  seed: [0, 99999, true],
  cornerRadius: [0, 40],
  kerf: [0, 0.6],
};

const r1 = (v) => Math.round(Number(v) * 10) / 10;

/** A fresh puzzle, the way the tool opens with nothing saved. */
export function defaultState() {
  const m = MATERIALS.find((x) => x.id === DEFAULT_MATERIAL) || MATERIALS[0];
  return {
    params: { ...DEFAULTS, kerf: m.kerf },
    material: m.id,
    splitLayers: false,
    name: UNTITLED,
  };
}

/** One clean value for params[k], or undefined when v will not do. */
function cleanParam(k, v) {
  const d = DEFAULTS[k];
  if (typeof d === 'boolean') return typeof v === 'boolean' ? v : undefined;
  if (typeof d === 'string') return typeof v === 'string' && v.length <= 40 ? v : undefined;
  if (typeof d !== 'number' || typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const [min = -Infinity, max = Infinity, whole = false] = RANGE[k] || [];
  return Math.min(max, Math.max(min, whole ? Math.round(v) : v));
}

/** The generator settings to store: the keys it knows today, nothing else. */
export function designParams(state) {
  const base = defaultState().params;
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = cleanParam(k, state?.params?.[k]);
    out[k] = v === undefined ? base[k] : v;
  }
  return out;
}

const materialId = (id) => (MATERIALS.some((m) => m.id === id) ? id : DEFAULT_MATERIAL);

/** Name by size: used for as long as the person has not named it themselves. */
export function autoName(state) {
  const p = designParams(state);
  return `Puzzle ${r1(p.width)} x ${r1(p.height)} mm, ${p.cols} x ${p.rows} keping`;
}

/** The material, as text a person reads in the record. */
export function designMaterial(state) {
  const id = materialId(state?.material);
  return (MATERIALS.find((m) => m.id === id) || {}).name || '';
}

/** The rest: which material was picked, and whether the export splits layers. */
export const designExtra = (state) => ({
  material: materialId(state?.material),
  splitLayers: state?.splitLayers === true,
});

function parseExtra(extra) {
  if (typeof extra !== 'string' || !extra) return {};
  try {
    const v = JSON.parse(extra);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * A record from the account -> { name, state }.
 *
 * Every value is checked: the record is data from a server, and a bad one has
 * to land on the default rather than become NaN in a cut path. Keys this tool
 * does not know are dropped. name is '' when the record carries the automatic
 * name, so that it stays automatic and follows the size when it changes.
 */
export function readDesign(row) {
  const state = defaultState();
  const src = row && row.params && typeof row.params === 'object' && !Array.isArray(row.params)
    ? row.params : {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = cleanParam(k, src[k]);
    if (v !== undefined) state.params[k] = v;
  }
  const x = parseExtra(row?.extra);
  if (MATERIALS.some((m) => m.id === x.material)) state.material = x.material;
  if (typeof x.splitLayers === 'boolean') state.splitLayers = x.splitLayers;
  const name = typeof row?.name === 'string' ? row.name.trim().slice(0, 120) : '';
  state.name = name && name !== autoName(state) ? name : UNTITLED;
  return { name: state.name === UNTITLED ? '' : state.name, state };
}
