// Single source of truth. Same shape as the other five tools.

import { DEFAULTS, buildTopper } from './geom/topper.js';
import { faceLoaded } from './geom/text.js';

const STORAGE_KEY = 'cake-topper.project.v1';

/** Width is kept in millimetres; the picker only changes how it is shown. */
export const UNITS = [
  { id: 'mm', name: 'mm', per: 1, step: 1, dp: 0 },
  { id: 'cm', name: 'cm', per: 10, step: 0.5, dp: 1 },
  { id: 'in', name: 'inch', per: 25.4, step: 0.25, dp: 2 },
];

export const unitOf = (id) => UNITS.find((u) => u.id === id) || UNITS[0];

function initialState() {
  return {
    params: { ...DEFAULTS },
    view: 'cake',        // cake | flat
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
