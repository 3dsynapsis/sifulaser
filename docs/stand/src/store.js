// Single source of truth. Same shape as the Box Maker, Puzzle and Text stores.

import { DEFAULTS, buildStand, STYLE_PRESETS, sizeOf } from './geom/stand.js';
import { faceLoaded } from './geom/text.js';

const STORAGE_KEY = 'stand-maker.project.v1';

/**
 * The boards actually kept on the shelf, shared with the Box Maker.
 *
 * A material is one real thing, so its numbers travel together: picking one sets
 * the thickness the geometry is cut for, the kerf that thickness burns at, and
 * the colour the 3D preview paints. Letting them drift apart lets somebody
 * preview walnut and cut a file dimensioned for 3 mm falcata.
 *
 * `char`: a CO2 beam leaves a burnt near-black edge on wood, MDF and card.
 * Acrylic comes off the bed with a clean polished edge instead.
 * `grain`: which procedural board surface the 3D preview paints on the faces.
 */
export const MATERIALS = [
  { id: 'custom', name: 'Custom material', t: DEFAULTS.thickness, color: '#d2b48c', kerf: DEFAULTS.kerf, char: true, grain: 'wood' },
  { id: 'falcata3', name: 'Falcata', t: 3, color: '#efe3c6', kerf: 0.2, char: true, grain: 'wood' },
  { id: 'falcata52', name: 'Falcata', t: 5.2, color: '#efe3c6', kerf: 0.25, char: true, grain: 'wood' },
  { id: 'basswood', name: 'Basswood', t: 3, color: '#e6d2a8', kerf: 0.2, char: true, grain: 'wood' },
  { id: 'mdf3', name: 'MDF', t: 3, color: '#c9a97e', kerf: 0.22, char: true, grain: 'mdf' },
  { id: 'mdf5', name: 'MDF', t: 5, color: '#c9a97e', kerf: 0.26, char: true, grain: 'mdf' },
  { id: 'walnut', name: 'Black Walnut', t: 3, color: '#5d4632', kerf: 0.2, char: true, grain: 'wood' },
  { id: 'sapele', name: 'Sapele', t: 3, color: '#8d4a30', kerf: 0.2, char: true, grain: 'wood' },
  { id: 'acrylic-black', name: 'Acrylic (Black)', t: 3, color: '#232323', kerf: 0.15, grain: 'none' },
  { id: 'acrylic-clear', name: 'Acrylic (Clear)', t: 3, color: '#cfe3e8', kerf: 0.15, grain: 'none' },
  { id: 'acrylic-red', name: 'Acrylic (Red)', t: 3, color: '#b3202a', kerf: 0.15, grain: 'none' },
  { id: 'card2', name: 'Cardboard', t: 2, color: '#c8ab7f', kerf: 0.3, char: true, grain: 'mdf' },
];

// Custom, not a named board. DEFAULTS already says 5 mm at 0.2 kerf - the house
// plywood these are cut on, which is not one of the stocked sheets above - and
// starting on a named board would quietly re-cut everyone's default stand at a
// different kerf. Custom's own numbers are set from DEFAULTS below so the picker
// and the thickness field never disagree on the first paint.
const DEFAULT_MATERIAL = 'custom';

export const materialOf = (id) => MATERIALS.find((m) => m.id === id) || MATERIALS[0];

/** The board currently chosen, for the 3D preview and the inspector swatch. */
export const material = () => materialOf(state.material);

function initialState() {
  const m = materialOf(DEFAULT_MATERIAL);
  return {
    params: { ...DEFAULTS, thickness: m.t, kerf: m.kerf },
    material: m.id,
    speed: 20,           // mm/s cutting, for the time estimate only
    view: '3d',          // assembled | flat | 3d
    backdrop: 'light',
    sheetWidth: 600,
    name: 'Untitled stand',
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

// Rebuilding traces a distance field, which is tens of milliseconds rather than
// the fraction of one the other tools take, so the result is cached against the
// settings that produced it. Dragging a slider then redraws once per change
// instead of once per read.
let cache = null;
let cacheKey = '';

export function getResult() {
  const face = faceLoaded(state.params.face);
  const face2 = state.params.face2 ? faceLoaded(state.params.face2) : null;
  const key = `${JSON.stringify(state.params)}|${face ? face.id : '-'}`
    + `|${face2 ? face2.id : '-'}`;
  if (cache && cacheKey === key) return cache;
  cache = buildStand({ ...state.params, faceData: face, faceData2: face2 });
  cache.face = face;
  cache.face2 = face2 || face;
  cacheKey = key;
  return cache;
}

export function invalidate() { cacheKey = ''; }

// The material rides in the undo snapshot because it owns two of the params.
// Leaving it out would let an undo put the thickness back to 3 mm while the
// picker still read "Black Walnut (3 mm)" - or worse, still read a 5 mm board.
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

/**
 * Choosing a board is one decision, not three.
 *
 * Thickness, kerf and colour are properties of the same physical sheet, so they
 * move together: pick walnut and the geometry is cut for 3 mm at a 0.2 mm kerf
 * and the preview shows walnut. Custom is the escape hatch and keeps whatever
 * numbers are already in the fields - somebody who has measured their own stock
 * should not lose it by opening the picker.
 */
/**
 * Load a design that came back from the account.
 *
 * One update() so it is a single undo step: opening the wrong design is one
 * Ctrl+Z away from being undone, rather than a field at a time.
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
 * Typing a thickness or a kerf by hand makes the board custom.
 *
 * The alternative is a picker that says "Falcata (3 mm)" beside a thickness
 * field reading 7 - which is not a label, it is a lie about what is on the bed.
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
 * Switching style is a preset, not a toggle.
 *
 * Cut-out letters and an engraved plate want completely different proportions -
 * a plate's 20 mm capital becomes a spindly cut-out, and a silhouette's line
 * spacing is negative because the rows of letters have to touch. Carrying one
 * style's numbers into the other produces something broken-looking, so the
 * whole coherent set moves together.
 */
export function setStyle(style) {
  update((s) => {
    s.params.style = style;
    Object.assign(s.params, STYLE_PRESETS[style] || {});
  });
}

export function setSize(id) {
  update((s) => {
    s.params.size = id;
    const preset = sizeOf(id);
    if (preset) { s.params.standW = preset.w; s.params.standH = preset.h; }
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
        speed: state.speed,
        view: state.view,
        backdrop: state.backdrop,
        sheetWidth: state.sheetWidth,
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
    state.material = data.material || state.material;
    state.speed = data.speed || state.speed;
    state.view = data.view || state.view;
    state.backdrop = data.backdrop || state.backdrop;
    state.sheetWidth = data.sheetWidth || state.sheetWidth;
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
