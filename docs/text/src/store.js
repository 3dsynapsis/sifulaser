// Single source of truth. Same shape as the Box Maker and Puzzle stores.

import { DEFAULTS, layout, normalise, strokeLength, faceLoaded } from './geom/text.js';

const STORAGE_KEY = 'text-engraver.project.v1';

function initialState() {
  return {
    params: { ...DEFAULTS, margin: 5, smooth: true },
    speed: 200,          // mm/s, for the time estimate only
    backdrop: 'light',
    showBox: true,
    name: 'Untitled text',
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

/**
 * Lay the text out with whatever face is in the cache. Cheap enough to redo on
 * every keystroke - a page of text is a few thousand points - so there is no
 * dirty flag to get wrong.
 */
export function getResult() {
  const face = faceLoaded(state.params.face);
  const r = layout({ ...state.params, faceData: face });
  const m = Math.max(0, state.params.margin);
  const paths = normalise(r, m);
  return {
    ...r,
    face,
    paths,
    // A face built from deliberate straight segments must not be curve-fitted -
    // it would round off the very corners that define it.
    smooth: !!state.params.smooth && !face?.straight,
    size: { width: r.width + m * 2, height: r.height + m * 2 },
    length: strokeLength(paths),
  };
}

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
        speed: state.speed,
        backdrop: state.backdrop,
        showBox: state.showBox,
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
    state.backdrop = data.backdrop || state.backdrop;
    state.showBox = data.showBox !== false;
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
