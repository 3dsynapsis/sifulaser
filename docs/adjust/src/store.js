// Single source of truth. Same shape as the Box Maker, Puzzle, Text and Stand
// stores: one state object, one update(), undo/redo over a JSON snapshot, and a
// debounced write to localStorage.
//
// One thing here is not like the others. The four generator tools own their
// geometry - the parameters ARE the drawing. This tool does not: the drawing
// arrives from a file and the parameters only describe what to do to it. So the
// loaded file is part of the state and has to survive a reload, which means the
// SVG text is persisted alongside the numbers and re-imported on the way back
// in. Rings are never persisted; re-sampling the text is cheap and a stale ring
// cache would be a silent lie about what is on screen.

import {
  apply, guessThickness, boundsOf, looksLikeJoinery,
} from './geom/refit.js';

const STORAGE_KEY = 'template-adjuster.project.v1';

// Chrome gives an origin about 5 MB of localStorage. A cut file is normally a
// few hundred KB of path data; anything past this is a traced photograph or a
// map, and losing the auto-restore is better than throwing on every keystroke.
const MAX_PERSIST_BYTES = 400_000;

// The size knob's range, in percent, defined once. The Scale control and the
// "width across the whole file" box are two ways of setting the same number, so
// they have to agree about what it may be: with a wider limit here, typing a
// width could leave the store holding a scale the slider cannot show, and the
// next touch of the slider would silently throw it away.
export const SCALE_MIN = 10;
export const SCALE_MAX = 400;

export const DEFAULT_PARAMS = {
  units: 'auto',      // auto | mm | px | in | pt - how to read the file's numbers
  scalePct: 100,      // the size knob
  t0: null,           // null = take the guess
  t1: 5,              // 5 mm ply is the house standard
  tolerance: 0.35,    // how far a feature may sit from t0 and still be read as t0
  keepLayers: false,  // read cut/score/fill from the file's own colours
};

function initialState() {
  return {
    name: 'Untitled refit',
    params: { ...DEFAULT_PARAMS },
    file: null,     // { name, text }
    source: null,   // { shapes, rings, mmPerUnit, unitSource, bounds } in mm
    showMarks: true,
    backdrop: 'light',
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

/** How many millimetres one unit of the imported coordinates is worth. */
export function unitScale() {
  const s = state.source;
  if (!s) return 1;
  if (state.params.units === 'auto') return s.mmPerUnit;
  return s.overrideFactors[state.params.units] ?? s.mmPerUnit;
}

/** The thickness the file was drawn for: the override if there is one, else the guess. */
export function effectiveT0() {
  const p = state.params;
  if (Number.isFinite(p.t0) && p.t0 > 0) return p.t0;
  const g = state.source?.guess;
  return g && g.value ? g.value : null;
}

// Refitting a few hundred rings is a handful of milliseconds, but the two
// preview panes and the inspector all ask for the answer on every change, so it
// is worked out once and cached against the settings that produced it.
let cache = null;
let cacheKey = '';

export function getResult() {
  const src = state.source;
  if (!src) return null;
  const p = state.params;
  const t0 = effectiveT0();
  const scale = (Number(p.scalePct) || 100) / 100;
  const key = `${src.id}|${p.units}|${p.scalePct}|${t0}|${p.t1}|${p.tolerance}`;
  if (cache && cacheKey === key) return cache;

  const mm = unitScale();
  const original = src.rings.map((r) => r.map(([x, y]) => [x * mm, y * mm]));

  // Both knobs in one call, in the order that keeps them independent - see
  // apply() in refit.js for why the wanted thickness is divided by the scale
  // going in and multiplied back coming out.
  const pass = apply(original, {
    scale, t0, t1: Number(p.t1), tolerance: Number(p.tolerance),
  });

  cache = {
    original,
    originalBounds: boundsOf(original),
    rings: pass.rings,
    marks: pass.marks,
    bounds: boundsOf(pass.rings),
    report: pass.report,
    scale,
    t0,
    joinery: looksLikeJoinery(pass.report),
  };
  cacheKey = key;
  return cache;
}

export function invalidate() { cacheKey = ''; }

/**
 * Take a freshly imported file.
 *
 * The thickness guess is made once, here, rather than inside getResult(): it
 * depends only on the file and the unit scale, and re-running a histogram over
 * every edge on every drag of a slider would be the one genuinely slow thing in
 * the tool.
 */
export function setSource({ name, text, shapes, mmPerUnit, unitSource, overrideFactors }) {
  const rings = shapes.map((s) => s.pts);
  update((s) => {
    s.file = { name, text };
    s.source = {
      id: `${name}:${text.length}:${Date.now()}`,
      shapes: shapes.map((sh) => ({ stroke: sh.stroke, fill: sh.fill })),
      rings,
      mmPerUnit,
      unitSource,
      overrideFactors,
      guess: null,
    };
    s.name = name.replace(/\.svg$/i, '') || 'Untitled refit';
    s.params.t0 = null;
    s.params.scalePct = 100;
  }, { history: false });
  reguess();
}

/** Re-run the histogram - after a load, or after the unit reading is changed. */
export function reguess() {
  const src = state.source;
  if (!src) return;
  const mm = unitScale();
  const rings = src.rings.map((r) => r.map(([x, y]) => [x * mm, y * mm]));
  src.guess = guessThickness(rings, { tolerance: state.params.tolerance });
  invalidate();
  emit();
}

export function clearSource() {
  update((s) => {
    s.file = null;
    s.source = null;
    s.params = { ...DEFAULT_PARAMS };
    s.name = 'Untitled refit';
  }, { history: false });
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
  invalidate();
  persist();
  emit();
}

export function setParam(key, value) {
  update((s) => { s.params[key] = value; });
}

/**
 * The size knob, expressed the way somebody measures a finished part.
 *
 * Width is what people quote - "it is 100 mm and I want 150" - but the scale is
 * what actually gets applied, so typing a width sets a percentage rather than
 * the other way round. The width used is the ORIGINAL bounding box: the result
 * box can end up a millimetre or two different because deepening a finger makes
 * the part stick out further, and pretending otherwise would mean the number
 * you typed and the number on the result pane disagreeing with no explanation.
 *
 * The width asked for can be one the size knob cannot reach - 900 mm out of a
 * 100 mm file is 900%. It is clamped to the knob's own range, so the width box
 * reads back the width that was actually applied instead of standing next to a
 * slider that disagrees with it.
 */
export function scaleForWidth(mm, w) {
  if (!(w > 0) || !Number.isFinite(mm)) return null;
  const pct = Math.max(SCALE_MIN, Math.min(SCALE_MAX, (mm / w) * 100));
  return Math.round(pct * 1000) / 1000;
}

export function setTargetWidth(mm) {
  const r = getResult();
  const pct = scaleForWidth(mm, r?.originalBounds.w);
  if (pct == null) return;
  setParam('scalePct', pct);
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  invalidate();
  persist();
  emit();
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  invalidate();
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
      const text = state.file?.text || '';
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        params: state.params,
        name: state.name,
        showMarks: state.showMarks,
        backdrop: state.backdrop,
        file: text.length <= MAX_PERSIST_BYTES && state.file
          ? { name: state.file.name, text }
          : null,
      }));
    } catch { /* private mode, quota - not worth interrupting the user */ }
  }, 250);
}

/**
 * Read the saved project back. Returns the file text if there was one, for
 * main.js to re-import - the store has no DOM and cannot sample an SVG itself.
 */
export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    Object.assign(state.params, data.params || {});
    state.name = data.name || state.name;
    state.showMarks = data.showMarks !== false;
    state.backdrop = data.backdrop || state.backdrop;
    return data.file || null;
  } catch {
    return null;
  }
}

export function emit() {
  for (const fn of listeners) fn(state);
}
