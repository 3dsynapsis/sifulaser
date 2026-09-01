// Single source of truth. Everything else subscribes and re-renders.
//
// Same shape as the Box Maker, Puzzle, QR and Stand stores: params drive
// everything, history is a stack of JSON snapshots, and the browser keeps a copy
// so the tab can be closed mid-job.

import { DEFAULTS, buildTag, SIZE_PRESETS, SHAPES } from './geom/tag.js';

// `char`: a CO2 beam leaves a burnt black edge on wood, MDF and card. Acrylic
// comes off the bed with a clean polished edge instead.
export const MATERIALS = [
  { id: 'custom', name: 'Custom material', t: 3, color: '#d2b48c', kerf: 0.2, char: true },
  { id: 'falcata3', name: 'Falcata', t: 3, color: '#efe3c6', kerf: 0.2, char: true },
  { id: 'falcata52', name: 'Falcata', t: 5.2, color: '#efe3c6', kerf: 0.25, char: true },
  { id: 'basswood', name: 'Basswood', t: 3, color: '#e6d2a8', kerf: 0.2, char: true },
  { id: 'mdf3', name: 'MDF', t: 3, color: '#c9a97e', kerf: 0.22, char: true },
  { id: 'mdf5', name: 'MDF', t: 5, color: '#c9a97e', kerf: 0.26, char: true },
  { id: 'walnut', name: 'Black Walnut', t: 3, color: '#5d4632', kerf: 0.2, char: true },
  { id: 'sapele', name: 'Sapele', t: 3, color: '#8d4a30', kerf: 0.2, char: true },
  { id: 'acrylic-black', name: 'Acrylic (Black)', t: 3, color: '#232323', kerf: 0.15 },
  { id: 'acrylic-clear', name: 'Acrylic (Clear)', t: 3, color: '#cfe3e8', kerf: 0.15 },
  { id: 'acrylic-red', name: 'Acrylic (Red)', t: 3, color: '#b3202a', kerf: 0.15 },
  { id: 'card2', name: 'Cardboard', t: 2, color: '#c8ab7f', kerf: 0.3, char: true },
];

const STORAGE_KEY = 'tag-maker.project.v1';
const DEFAULT_MATERIAL = 'falcata3';

export const SIDES = ['front', 'back'];
const emptyDecor = () => ({ front: [], back: [] });

/**
 * Which size preset is lit, worked out from the numbers rather than remembered
 * beside them.
 *
 * Two fields that have to be kept in step eventually drift - reload a project
 * saved before a preset changed, or undo past the change that set one of them -
 * and then the buttons claim one size while the number field says another.
 * Deriving it means that cannot happen, and a size matching no preset lights
 * none of them, which is exactly what a custom size should look like.
 */
export const sizePreset = () => (
  SIZE_PRESETS.find((s) => s.w === state.params.width && s.h === state.params.height)?.id
  ?? 'custom'
);

function initialState() {
  const m = MATERIALS.find((x) => x.id === DEFAULT_MATERIAL) || MATERIALS[0];
  return {
    params: { ...DEFAULTS, thickness: m.t, kerf: m.kerf },
    material: DEFAULT_MATERIAL,
    side: 'front',
    decor: emptyDecor(),
    selection: null,
    sheet: 'auto',
    showLabels: true,
    name: 'Untitled tag',
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

// Building a tag rounds every corner of a polygon, offsets three or four rings
// for the kerf and the border, sets two blocks of stroke text and then measures
// the slot against every segment of the outline. That is milliseconds rather
// than microseconds, and the inspector reads the result several times per
// render, so it is cached against the settings that produced it.
let cache = null;
let cacheKey = '';

export function getTag() {
  const key = JSON.stringify(state.params);
  if (cache && cacheKey === key) return cache;
  cache = buildTag(state.params);
  cacheKey = key;
  return cache;
}

export function invalidate() { cacheKey = ''; }

export function pieceById(id) {
  return getTag().pieces.find((p) => p.id === id) || getTag().pieces[0];
}

export function currentPiece() { return pieceById(state.side); }

export function decorFor(piece) { return state.decor[piece.id] || []; }

export function selectedObject() {
  if (!state.selection) return null;
  return decorFor(currentPiece()).find((o) => o.id === state.selection) || null;
}

function snapshot() {
  return JSON.stringify({ params: state.params, decor: state.decor, name: state.name });
}

function restore(json) {
  const data = JSON.parse(json);
  state.params = data.params;
  state.decor = { ...emptyDecor(), ...(data.decor || {}) };
  state.name = data.name ?? state.name;
}

/** Apply a mutation. `history` records an undo point. */
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
 * Switch material. Thickness and kerf follow, because they are properties of the
 * board rather than choices - except on `custom`, which is the one the user set
 * them on themselves and must not have overwritten.
 */
export function setMaterial(id) {
  const m = MATERIALS.find((x) => x.id === id);
  update((s) => {
    s.material = id;
    if (m && id !== 'custom') {
      s.params.thickness = m.t;
      s.params.kerf = m.kerf;
    }
  });
}

export function setSizePreset(id) {
  const preset = SIZE_PRESETS.find((x) => x.id === id);
  if (preset) update((s) => { s.params.width = preset.w; s.params.height = preset.h; });
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  state.selection = null;
  persist();
  emit();
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  state.selection = null;
  persist();
  emit();
}

/** Coalesce a drag into one undo entry. */
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
        decor: state.decor,
        material: state.material,
        sheet: state.sheet,
        showLabels: state.showLabels,
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
    state.decor = { ...emptyDecor(), ...(data.decor || {}) };
    state.material = data.material || state.material;
    state.sheet = data.sheet || state.sheet;
    state.showLabels = data.showLabels ?? state.showLabels;
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

/**
 * Load a design that came back from the account.
 *
 * The artwork is optional. A tag whose ornaments were too large to store comes
 * back as the tag alone - the shape, the slot, the words - and that is
 * deliberate: better a design that opens with its tag intact than a save that
 * refused outright because somebody imported a very detailed SVG.
 */
export function applyDesign(row) {
  let decor = null;
  if (row.extra) {
    try {
      const parsed = JSON.parse(row.extra);
      if (parsed && typeof parsed === 'object') decor = parsed.decor || null;
    } catch {
      decor = null;
    }
  }
  update((s) => {
    Object.assign(s.params, row.params || {});
    if (row.name) s.name = row.name;
    if (row.material) s.material = row.material;
    s.decor = decor ? { ...emptyDecor(), ...decor } : emptyDecor();
    s.selection = null;
  });
}

export const material = () => MATERIALS.find((m) => m.id === state.material)
  || MATERIALS.find((m) => m.id === DEFAULT_MATERIAL);

export const shapeName = () => (
  SHAPES.find((s) => s.id === state.params.shape)?.name || 'Tag'
);

/** Pull artwork back inside the piece after it shrank under them. */
export function clampDecor() {
  const t = getTag();
  for (const piece of t.pieces) {
    for (const o of state.decor[piece.id] || []) {
      o.x = Math.min(Math.max(o.x, -o.w), piece.size.w);
      o.y = Math.min(Math.max(o.y, -o.h), piece.size.h);
    }
  }
}

/** Every placed object across both sides - the element count in the readout. */
export function elementCount() {
  return SIDES.reduce((n, id) => n + (state.decor[id] || []).length, 0);
}
