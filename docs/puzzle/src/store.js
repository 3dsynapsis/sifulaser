// Single source of truth. Everything else subscribes and re-renders.
// Same shape as the Box Maker store so the two apps stay easy to read side by side.

import { buildPuzzle, DEFAULTS } from './geom/puzzle.js';

// Kerf presets are CO2 starting points, same numbers the Box Maker ships with.
export const MATERIALS = [
  { id: 'custom', name: 'Custom material', color: '#d2b48c', kerf: 0.2 },
  { id: 'falcata3', name: 'Falcata 3 mm', color: '#efe3c6', kerf: 0.2 },
  { id: 'falcata52', name: 'Falcata 5.2 mm', color: '#efe3c6', kerf: 0.25 },
  { id: 'basswood', name: 'Basswood 3 mm', color: '#e6d2a8', kerf: 0.2 },
  { id: 'mdf3', name: 'MDF 3 mm', color: '#c9a97e', kerf: 0.22 },
  { id: 'mdf5', name: 'MDF 5 mm', color: '#c9a97e', kerf: 0.26 },
  { id: 'acrylic-clear', name: 'Acrylic 3 mm (Clear)', color: '#cfe3e8', kerf: 0.15 },
  { id: 'card2', name: 'Cardboard 2 mm', color: '#c8ab7f', kerf: 0.3 },
];

const STORAGE_KEY = 'puzzle-gen.project.v1';
const DEFAULT_MATERIAL = 'falcata3';

function initialState() {
  const m = MATERIALS.find((x) => x.id === DEFAULT_MATERIAL) || MATERIALS[0];
  return {
    params: { ...DEFAULTS, kerf: m.kerf },
    material: DEFAULT_MATERIAL,
    backdrop: 'light',
    splitLayers: false,
    name: 'Untitled puzzle',
  };
}

export const state = initialState();

let puzzle = null;
let dirty = true;
const listeners = new Set();
const undoStack = [];
const redoStack = [];
let suspendHistory = false;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPuzzle() {
  if (dirty || !puzzle) {
    puzzle = buildPuzzle(state.params);
    dirty = false;
  }
  return puzzle;
}

function snapshot() {
  return JSON.stringify({ params: state.params, name: state.name });
}

function restore(json) {
  const data = JSON.parse(json);
  state.params = data.params;
  state.name = data.name ?? state.name;
  dirty = true;
}

export function update(mutator, { history = true, geometry = false } = {}) {
  if (history && !suspendHistory) {
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  mutator(state);
  if (geometry) dirty = true;
  persist();
  emit();
}

export function setParam(key, value) {
  update((s) => { s.params[key] = value; }, { geometry: true });
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
        backdrop: state.backdrop,
        splitLayers: state.splitLayers,
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
    state.backdrop = data.backdrop || state.backdrop;
    state.splitLayers = !!data.splitLayers;
    state.name = data.name || state.name;
    dirty = true;
    return true;
  } catch {
    return false;
  }
}

export function reset() {
  update((s) => { Object.assign(s, initialState()); }, { geometry: true });
}

export function emit() {
  for (const fn of listeners) fn(state);
}

export const material = () => MATERIALS.find((m) => m.id === state.material)
  || MATERIALS.find((m) => m.id === DEFAULT_MATERIAL);
