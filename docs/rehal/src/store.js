// Single source of truth. Same shape as the other ten tools.
//
// The one thing that is not like the others: a rehal takes between a tenth and
// six tenths of a second to build, because the pattern is a distance field the
// size of the panel and the connectivity prover walks it twice. So the result
// is memoised hard - the inspector reads it a dozen times while it renders one
// pass, and every one of those reads has to be free.

import {
  buildRehal, initialParams, MATERIALS, materialOf, BOOKS, bookOf,
} from './geom/rehal/index.js';
import { faceLoaded } from './geom/text.js';

const STORAGE_KEY = 'rehal.project.v1';

export { MATERIALS, materialOf, BOOKS, bookOf };

export const material = () => materialOf(state.params.materialId);

function initialState() {
  return {
    params: initialParams(),
    view: '3d',          // 3d | flat
    backdrop: 'light',
    // Millimetres a second through 9 mm ply. An estimate, and the tool says so
    // where it is shown: it decides a customer-facing minutes figure and it has
    // never been checked against a real job on a real machine.
    speed: 6,
    showBook: true,
    name: 'Rehal tanpa nama',
  };
}

export const state = initialState();

const listeners = new Set();
const undoStack = [];
const redoStack = [];
let suspendHistory = false;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let cache = null;
let cacheKey = '';
let lastMs = 0;

/** How long the last build took. main.js uses it to decide how to follow a drag. */
export const lastBuildMs = () => lastMs;

/**
 * The stand, rebuilt only when something it depends on has changed.
 *
 * `verify` is part of the key on purpose. The full prover walks every piece,
 * not only the decorated panel, and costs a few hundred milliseconds more - so
 * it runs when Export is opened and not on every keystroke. That is a real
 * difference in what has been checked, so it must not share a cache entry with
 * the cheap build.
 */
export function getResult({ verify = 'pattern' } = {}) {
  const p = state.params;
  const face = faceLoaded(p.faceId);
  const key = `${JSON.stringify(p)}|${face ? face.id : '-'}|${verify}`;
  if (cache && cacheKey === key) return cache;
  const t0 = performance.now();
  cache = buildRehal({ ...p, faceData: face, verify });
  lastMs = performance.now() - t0;
  cacheKey = key;
  return cache;
}

export function invalidate() { cacheKey = ''; }

function snapshot() {
  return JSON.stringify({ params: state.params, name: state.name });
}

function restore(json) {
  const data = JSON.parse(json);
  state.params = data.params;
  state.name = data.name ?? state.name;
}

export function update(mutator, { history = true } = {}) {
  if (history && !suspendHistory) {
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  mutator(state);
  persist();
  emit();
}

export function setParam(key, value) {
  update((s) => { s.params[key] = value; });
}

/**
 * Choosing a sheet sets the four numbers that are properties of that sheet.
 *
 * The measured thickness follows the nominal one, because a fresh sheet has not
 * been measured yet and carrying the last sheet's caliper reading over to a
 * different board is worse than starting from the label. It is the number the
 * joints are actually cut to, so it must never be a leftover.
 */
export function setMaterial(id) {
  const m = materialOf(id);
  update((s) => {
    s.params.materialId = m.id;
    s.params.thickness = m.t;
    s.params.measuredThickness = m.t;
    s.params.kerf = m.kerf;
    s.params.density = m.density;
  });
}

export function setBook(id) {
  update((s) => { s.params.bookId = bookOf(id).id; });
}

/**
 * Hand the base depth back to the tipping calculation, or take it away.
 *
 * Turning automatic off keeps the depth that is on screen rather than jumping
 * to some default, so the switch changes who owns the number and nothing else.
 */
export function setDepthAuto(on, currentDepth) {
  update((s) => {
    s.params.depthAuto = !!on;
    if (!on) s.params.depth = Math.round(currentDepth);
  });
}

export function setDepth(mm) {
  update((s) => { s.params.depth = mm; s.params.depthAuto = false; });
}

/**
 * A pattern preset carries its own pitch and its own contact angle, so picking
 * one clears the two overrides rather than dragging the previous preset's
 * numbers into it. A pitch that was right for Jali is four cells across a
 * Shamsa panel.
 */
export function setPreset(id) {
  update((s) => {
    s.params.preset = id;
    s.params.pitch = null;
    s.params.theta = null;
    s.params.strapWidth = null;
  });
}

/**
 * Everything that arrives from outside this session, before it is trusted.
 *
 * A saved design is JSON that was last written by some other version of this
 * tool, on some other device, or by hand in the browser's storage inspector.
 * The controls cannot produce a bad number - ui.js's clamp maps even NaN onto
 * the slider minimum - but neither applyDesign nor load goes anywhere near the
 * controls: both Object.assign the saved parameters straight over the live
 * ones. A NaN width then propagates into every part outline as a non-finite
 * coordinate and the build comes out silently empty rather than failing.
 *
 * So a numeric parameter that is not a finite number is dropped, and the
 * default underneath it stands. Dropped rather than coerced: zero is a
 * plausible-looking width and NaN is not evidence that the user wanted one.
 * The ranges themselves are enforced in the builder, which is where every path
 * meets - see buildRehal and buildPattern.
 */
const NUMERIC = [
  'thickness', 'measuredThickness', 'kerf', 'density', 'width', 'height',
  'angle', 'depth', 'lipHeight', 'pitch', 'theta', 'strapWidth', 'capHeight',
  'band',
];
function sanitiseParams(raw) {
  const out = { ...(raw || {}) };
  for (const k of NUMERIC) {
    if (!(k in out)) continue;
    // null is how this store spells "no override, use the preset's own",
    // so it is a legitimate value and is left alone.
    if (out[k] === null) continue;
    if (!Number.isFinite(out[k])) delete out[k];
  }
  return out;
}

export function applyDesign(row) {
  update((s) => {
    Object.assign(s.params, sanitiseParams(row.params));
    if (row.name) s.name = row.name;
    if (row.material) {
      const m = materialOf(row.material);
      s.params.materialId = m.id;
    }
  });
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  persist();
  emit();
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  persist();
  emit();
}

/** Coalesce a slider drag into one undo entry. */
export function beginGesture() {
  undoStack.push(snapshot());
  redoStack.length = 0;
  suspendHistory = true;
}

export function endGesture() { suspendHistory = false; }

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        params: state.params,
        backdrop: state.backdrop,
        speed: state.speed,
        showBook: state.showBook,
        name: state.name,
      }));
    } catch { /* private mode, quota - not worth interrupting the user */ }
  }, 250);
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    // Merged over the defaults, never assigned: a project saved before a
    // parameter existed must come back with that parameter at its default
    // rather than undefined, or the first build reads NaN off it. And filtered
    // on the way through, because a stored parameter can be any JSON at all -
    // see sanitiseParams.
    Object.assign(state.params, sanitiseParams(data.params));
    state.backdrop = data.backdrop || state.backdrop;
    state.speed = data.speed || state.speed;
    state.showBook = data.showBook ?? state.showBook;
    state.name = data.name || state.name;
    // The view is deliberately not restored. It is how you are looking at the
    // stand, not part of the stand.
    return true;
  } catch {
    return false;
  }
}

export function reset() {
  update((s) => { Object.assign(s, initialState()); });
}

export function emit() {
  for (const fn of listeners) fn(state);
}
