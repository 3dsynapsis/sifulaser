// Single source of truth. Same shape as the Box Maker, Puzzle and Text stores.

import { DEFAULTS, buildStand, STYLE_PRESETS, sizeOf } from './geom/stand.js';
import { faceLoaded } from './geom/text.js';

const STORAGE_KEY = 'stand-maker.project.v1';

function initialState() {
  return {
    params: { ...DEFAULTS },
    speed: 20,           // mm/s cutting, for the time estimate only
    view: 'assembled',   // assembled | flat
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
  const key = JSON.stringify(state.params) + (face ? face.id : '-');
  if (cache && cacheKey === key) return cache;
  cache = buildStand({ ...state.params, faceData: face });
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
