// Single source of truth. Same shape as the other five tools.

import { DEFAULTS, buildTopper, presetParams } from './geom/topper.js';
import { faceLoaded } from './geom/text.js';

const STORAGE_KEY = 'cake-topper.project.v1';

/**
 * The sheets these are cut from, and it is a short list on purpose.
 *
 * Every one is cast acrylic. The other tools in the family offer falcata, MDF
 * and card; this one does not, because a topper goes into food. Wood is porous,
 * takes up moisture and grease from the icing and cannot be washed clean, and
 * cast acrylic also comes off the bed with a polished edge where extruded goes
 * cloudy. There is nothing to add to the list.
 *
 * A material is one real thing, so its numbers travel together: choosing one
 * sets the kerf that sheet burns at, the thickness it is sold in, and the
 * colour and finish the previews paint. Letting those drift apart lets somebody
 * preview mirror gold and cut a file compensated for the wrong beam width.
 *
 * In practice that binding does no work today, and it should be said plainly
 * rather than left to look like more than it is: these are all 3 mm cast
 * acrylic and they all burn the same 0.15 mm, so switching between them changes
 * the colour and nothing else. It is here because the pairing is what stops the
 * two drifting apart the day a 5 mm sheet or a different beam joins the list.
 * The only thing that moves the numbers today is typing them, which is what
 * makes the sheet custom.
 *
 * `finish` is what the 3D view does with it - a mirror sheet is not a colour,
 * it is a smooth metal surface, and glitter is not a pattern, it is thousands
 * of tiny mirrors at different angles. See src/texture.js.
 */
export const MATERIALS = [
  { id: 'mirror-gold', name: 'Mirror gold', t: 3, color: '#d9ab48', kerf: 0.15, finish: 'mirror' },
  { id: 'mirror-silver', name: 'Mirror silver', t: 3, color: '#cdd3d9', kerf: 0.15, finish: 'mirror' },
  { id: 'rose-gold', name: 'Rose gold', t: 3, color: '#cc8f7c', kerf: 0.15, finish: 'mirror' },
  { id: 'black', name: 'Black', t: 3, color: '#1b1c1f', kerf: 0.15, finish: 'none' },
  { id: 'white', name: 'White', t: 3, color: '#f4f3f0', kerf: 0.15, finish: 'none' },
  { id: 'clear', name: 'Clear', t: 3, color: '#dfeaef', kerf: 0.15, finish: 'clear' },
  { id: 'glitter', name: 'Glitter', t: 3, color: '#b47ec9', kerf: 0.15, finish: 'glitter' },
  // Not a sheet off the shelf. Typing a thickness or a kerf by hand lands here,
  // so the picker can never read "Mirror gold (3 mm)" next to a thickness of 5.
  // It deliberately carries no `t` and no `kerf`: the numbers of a custom sheet
  // are the ones in the box, and setMaterial skips this entry rather than
  // overwriting them. Constants here would only look like they did something.
  { id: 'custom', name: 'Custom acrylic', color: '#cdd3d9', finish: 'none' },
];

// Mirror gold is what most of these are ordered in, so it is what the tool
// opens on rather than an abstract default nobody would choose.
const DEFAULT_MATERIAL = 'mirror-gold';

export const materialOf = (id) => MATERIALS.find((m) => m.id === id) || MATERIALS[0];

/** The sheet currently chosen, for the previews and the inspector swatch. */
export const material = () => materialOf(state.material);

/** Width is kept in millimetres; the picker only changes how it is shown. */
export const UNITS = [
  { id: 'mm', name: 'mm', per: 1, step: 1, dp: 0 },
  { id: 'cm', name: 'cm', per: 10, step: 0.5, dp: 1 },
  { id: 'in', name: 'inch', per: 25.4, step: 0.25, dp: 2 },
];

export const unitOf = (id) => UNITS.find((u) => u.id === id) || UNITS[0];

function initialState() {
  const m = materialOf(DEFAULT_MATERIAL);
  return {
    params: { ...DEFAULTS, thickness: m.t, kerf: m.kerf },
    material: m.id,
    view: 'cake',        // cake | flat | 3d
    unit: 'mm',
    backdrop: 'light',
    speed: 15,           // mm/s, for the cut-time estimate only
    name: 'Untitled topper',
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

// Tracing a distance field costs tens of milliseconds, so the result is cached
// against the settings that produced it. Typing then redraws once per change
// rather than once per read.
let cache = null;
let cacheKey = '';

export function getResult() {
  const face = faceLoaded(state.params.face);
  const key = `${JSON.stringify(state.params)}|${face ? face.id : '-'}`;
  if (cache && cacheKey === key) return cache;
  cache = buildTopper({ ...state.params, faceData: face });
  cache.face = face;
  cacheKey = key;
  return cache;
}

export function invalidate() { cacheKey = ''; }

// The chosen sheet rides along with the parameters it sets. Leaving it out
// would let an undo put the thickness and kerf back while the picker went on
// naming the sheet they came from - a label that no longer describes anything.
function snapshot() {
  return JSON.stringify({
    params: state.params, material: state.material, name: state.name,
  });
}

function restore(json) {
  const data = JSON.parse(json);
  state.params = data.params;
  state.material = data.material ?? state.material;
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

/** Choosing a sheet sets the two numbers that are properties of that sheet. */
export function setMaterial(id) {
  const m = materialOf(id);
  update((s) => {
    s.material = m.id;
    if (m.id !== 'custom') {
      s.params.thickness = m.t;
      s.params.kerf = m.kerf;
    }
  });
}

/**
 * Typing a thickness or a kerf by hand makes the sheet custom.
 *
 * A shop that has measured its own stock has to be able to overrule the list,
 * and doing so is exactly what makes the sheet no longer one of the named ones.
 */
export function setBoardNumber(key, value) {
  update((s) => {
    s.params[key] = value;
    const m = materialOf(s.material);
    if (s.material !== 'custom' && value !== (key === 'thickness' ? m.t : m.kerf)) {
      s.material = 'custom';
    }
  });
}

/**
 * A preset replaces the whole design, not just the words.
 *
 * Merging into what is already there is the trap: the previous width, line
 * height, thickening and stakes stay behind, and a preset tested at its own
 * numbers builds at somebody else's. So everything the preset does not name
 * goes back to its default - except the thickness and the kerf, which describe
 * the sheet on the bed and have nothing to do with which message was picked.
 */
export function applyPreset(preset) {
  update((s) => { s.params = presetParams(preset, s.params); });
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
        material: state.material,
        view: state.view,
        unit: state.unit,
        backdrop: state.backdrop,
        speed: state.speed,
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
    Object.assign(state.params, data.params || {});
    // A saved project from before the sheet list existed has no material, and
    // its thickness and kerf are the ones it was actually drawn at. Falling back
    // to custom keeps those numbers rather than quietly re-cutting it in gold.
    state.material = data.material
      ? materialOf(data.material).id
      : (data.params ? 'custom' : state.material);
    state.view = data.view || state.view;
    state.unit = data.unit || state.unit;
    state.backdrop = data.backdrop || state.backdrop;
    state.speed = data.speed || state.speed;
    state.name = data.name || state.name;
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
