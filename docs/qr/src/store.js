// Single source of truth. Same shape as the Box Maker, Puzzle, Text and Stand
// stores: params drive everything, history is a stack of JSON snapshots, and
// the browser keeps a copy so the tab can be closed mid-job.

import { DEFAULTS, buildTag, SIZE_PRESETS } from './geom/tag.js';

const STORAGE_KEY = 'qr-maker.project.v1';

/**
 * Which preset button is lit, worked out from the size rather than remembered
 * alongside it.
 *
 * Two fields that have to be kept in step eventually drift - reload a project
 * saved before a preset changed, or undo past the change that set one of them -
 * and then the buttons claim one size while the number field says another.
 * Deriving it means that cannot happen, and a size matching no preset lights
 * none of them, which is exactly what a custom size should look like.
 */
export const sizePreset = () => (
  SIZE_PRESETS.find((s) => s.mm === state.params.size)?.id ?? 'custom'
);

function initialState() {
  return {
    params: { ...DEFAULTS },
    view: 'artwork',     // artwork | layers
    backdrop: 'light',
    scanSpeed: 300,      // mm/s, raster - for the burn-time estimate only
    lineInterval: 0.1,   // mm between raster passes
    sheetWidth: 600,
    name: 'Untitled QR',
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

// Encoding runs Reed-Solomon over up to three thousand codewords and then scores
// eight masks over the whole grid, which at the big versions is milliseconds
// rather than microseconds. Typing a URL would redo all of it on every keystroke
// and again for every read, so the result is cached against the settings that
// produced it.
let cache = null;
let cacheKey = '';

export function getResult() {
  const key = JSON.stringify(state.params);
  if (cache && cacheKey === key) return cache;
  cache = buildTag(state.params);
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

export function setSizePreset(id) {
  const preset = SIZE_PRESETS.find((x) => x.id === id);
  if (preset) update((s) => { s.params.size = preset.mm; });
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
        backdrop: state.backdrop,
        scanSpeed: state.scanSpeed,
        lineInterval: state.lineInterval,
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
    state.view = data.view || state.view;
    state.backdrop = data.backdrop || state.backdrop;
    state.scanSpeed = data.scanSpeed || state.scanSpeed;
    state.lineInterval = data.lineInterval || state.lineInterval;
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
