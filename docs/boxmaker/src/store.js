// Single source of truth. Everything else subscribes and re-renders.

import { buildBox, DEFAULTS, PANEL_ORDER } from './geom/box.js';

// `char`: a CO2 beam leaves a burnt black edge on wood, MDF and card. Acrylic
// comes off the bed with a clean polished edge instead.
// `grain`: which procedural board surface the 3D preview paints on the faces.
export const MATERIALS = [
  { id: 'custom', name: 'Custom material', t: 3, color: '#d2b48c', kerf: 0.2, char: true, grain: 'wood' },
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

const STORAGE_KEY = 'box-maker.project.v1';

const emptyDecor = () => Object.fromEntries(PANEL_ORDER.map((id) => [id, []]));

const DEFAULT_MATERIAL = 'falcata3';

function initialState() {
  const m = MATERIALS.find((x) => x.id === DEFAULT_MATERIAL) || MATERIALS[0];
  return {
    params: { ...DEFAULTS, thickness: m.t, kerf: m.kerf },
    material: DEFAULT_MATERIAL,
    view: '3d',
    face: 'front',
    decor: emptyDecor(),
    selection: null,
    sheet: '600x400',
    lidOpen: false,
    backdrop: 'light',
    showLabels: true,
    name: 'Untitled box',
  };
}

export const state = initialState();

let box = null;
let dirty = true;
const listeners = new Set();
const undoStack = [];
const redoStack = [];
let suspendHistory = false;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getBox() {
  if (dirty || !box) {
    box = buildBox(state.params);
    dirty = false;
  }
  return box;
}

export function panelById(id) {
  return getBox().panels.find((p) => p.id === id) || getBox().panels[0];
}

export function currentPanel() {
  return panelById(state.face);
}

export function decorFor(panel) {
  return state.decor[panel.id] || [];
}

export function selectedObject() {
  if (!state.selection) return null;
  return decorFor(currentPanel()).find((o) => o.id === state.selection) || null;
}

function snapshot() {
  return JSON.stringify({ params: state.params, decor: state.decor, name: state.name });
}

function restore(json) {
  const data = JSON.parse(json);
  state.params = data.params;
  state.decor = data.decor;
  state.name = data.name ?? state.name;
  dirty = true;
}

/**
 * Apply a mutation. `history` records an undo point; `geometry` marks the box for
 * a rebuild. Callers batch related edits by passing history:false on the tail.
 */
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

export function endGesture() {
  suspendHistory = false;
}

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
        backdrop: state.backdrop,
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
    state.backdrop = data.backdrop || state.backdrop;
    state.name = data.name || state.name;
    dirty = true;
    return true;
  } catch {
    return false;
  }
}

export function reset() {
  update((s) => {
    Object.assign(s, initialState());
  }, { geometry: true });
}

export function emit() {
  for (const fn of listeners) fn(state);
}

/**
 * Load a design that came back from the account.
 *
 * The decoration is optional. A box whose ornaments were too large to store
 * comes back as the box alone - the size, the joints, the material - and that
 * is deliberate: better a design that opens with its box intact than a save
 * that refused outright because somebody imported a photograph.
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
    if (decor) s.decor = { ...emptyDecor(), ...decor };
  });
}

export const material = () => MATERIALS.find((m) => m.id === state.material)
  || MATERIALS.find((m) => m.id === DEFAULT_MATERIAL);

/** Drop decorations that no longer fit after the panel shrank. */
export function clampDecor() {
  const b = getBox();
  // Turning dividers or the lid off can delete the panel that was being edited.
  if (!b.panels.some((p) => p.id === state.face)) state.face = 'front';
  for (const p of b.panels) {
    for (const o of state.decor[p.id] || []) {
      o.x = Math.min(Math.max(o.x, -o.w), p.size.w);
      o.y = Math.min(Math.max(o.y, -o.h), p.size.h);
    }
  }
}
