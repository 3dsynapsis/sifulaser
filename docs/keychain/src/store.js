// Single source of truth. Same shape as the other seven tools.

import { DEFAULTS, buildKeychain, presetParams } from './geom/keychain.js';
import { faceLoaded } from './geom/text.js';

const STORAGE_KEY = 'keychain.project.v1';

/**
 * The sheets a keychain is cut from.
 *
 * Shorter than the box maker's list, and for a reason: a keychain is a small
 * part carried in a pocket, so the sheet has to be tough at three millimetres
 * and it has to look like something once it is. That rules out most of what a
 * box is made of. Falcata and basswood are what the shop keeps and what a
 * cheap keychain is; the acrylics are what a paid one is, because cast acrylic
 * comes off the bed with a polished edge and does not fur up in a pocket the
 * way a wooden edge does.
 *
 * The numbers travel together on purpose. A material is one real thing, so
 * choosing it sets the kerf that sheet burns at, the thickness it is sold in
 * and the colour the preview paints. Letting those drift apart lets somebody
 * preview black acrylic and cut a file compensated for plywood.
 *
 * `char` is whether the beam leaves a burnt edge - true for wood, MDF and
 * card, false for acrylic, which comes off clean and polished.
 */
export const MATERIALS = [
  { id: 'falcata3', name: 'Falcata', t: 3, color: '#efe3c6', kerf: 0.2, char: true },
  { id: 'basswood3', name: 'Basswood', t: 3, color: '#e6d2a8', kerf: 0.2, char: true },
  { id: 'walnut3', name: 'Black Walnut', t: 3, color: '#5d4632', kerf: 0.2, char: true },
  { id: 'mdf3', name: 'MDF', t: 3, color: '#c9a97e', kerf: 0.22, char: true },
  { id: 'acrylic-black', name: 'Acrylic (Black)', t: 3, color: '#232323', kerf: 0.15 },
  { id: 'acrylic-white', name: 'Acrylic (White)', t: 3, color: '#f4f3f0', kerf: 0.15 },
  { id: 'acrylic-clear', name: 'Acrylic (Clear)', t: 3, color: '#dfeaef', kerf: 0.15 },
  { id: 'acrylic-red', name: 'Acrylic (Red)', t: 3, color: '#b3202a', kerf: 0.15 },
  { id: 'mirror-gold', name: 'Mirror gold', t: 3, color: '#d9ab48', kerf: 0.15 },
  // Not a sheet off the shelf. Typing a thickness or a kerf by hand lands
  // here, so the picker can never read "Falcata (3 mm)" next to a thickness of
  // 5. It deliberately carries no `t` and no `kerf`: the numbers of a custom
  // sheet are the ones in the box, and setMaterial skips this entry rather
  // than overwriting them.
  { id: 'custom', name: 'Custom sheet', color: '#d2b48c' },
];

const DEFAULT_MATERIAL = 'falcata3';

export const materialOf = (id) => MATERIALS.find((m) => m.id === id) || MATERIALS[0];
export const material = () => materialOf(state.material);

function initialState() {
  const m = materialOf(DEFAULT_MATERIAL);
  return {
    params: { ...DEFAULTS, thickness: m.t, kerf: m.kerf },
    material: m.id,
    view: '3d',          // 3d | piece | flat
    backdrop: 'light',
    speed: 15,           // mm/s, for the cut-time estimate only
    name: 'Untitled keychain',
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

// Tracing a distance field twice - once for the lettering and once with the
// ring's lug welded on - costs the better part of a tenth of a second, so the
// result is cached against the settings that produced it. Typing then redraws
// once per change rather than once per read, and the inspector reads the
// result half a dozen times while it renders.
let cache = null;
let cacheKey = '';

export function getResult() {
  const face = faceLoaded(state.params.face);
  const key = `${JSON.stringify(state.params)}|${face ? face.id : '-'}`;
  if (cache && cacheKey === key) return cache;
  cache = buildKeychain({ ...state.params, faceData: face });
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
 * Merging into what is already there is the trap: the previous length, offset,
 * body and hole stay behind, and a preset tested at its own numbers builds at
 * somebody else's - which is how a warning-free preset arrives with two
 * warnings attached. So everything the preset does not name goes back to its
 * default, except the thickness and the kerf, which describe the sheet on the
 * bed and have nothing to do with which keychain was picked.
 */
export function applyPreset(preset) {
  update((s) => { s.params = presetParams(preset, s.params); });
}

/**
 * Load a design that came back from the account.
 *
 * One update() so it is a single undo step: somebody who opens the wrong
 * design presses Ctrl+Z once and is back where they were, rather than
 * unwinding a field at a time. The sheet goes through the same path as picking
 * one by hand, so a design saved in walnut comes back with walnut's kerf.
 */
export function applyDesign(row) {
  update((s) => {
    Object.assign(s.params, row.params || {});
    if (row.name) s.name = row.name;
    if (row.material) {
      const m = materialOf(row.material);
      s.material = m.id;
      if (m.id !== 'custom') {
        s.params.thickness = m.t;
        s.params.kerf = m.kerf;
      }
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
        material: state.material,
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
    // its thickness and kerf are the ones it was actually drawn at. Falling
    // back to custom keeps those numbers rather than quietly re-cutting it in
    // something else.
    state.material = data.material
      ? materialOf(data.material).id
      : (data.params ? 'custom' : state.material);
    // The view is deliberately not restored. It is how you are looking at the
    // keychain, not part of the keychain.
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
