// Single source of truth. Everything else subscribes and re-renders.
//
// Same shape as the Box Maker, Puzzle, QR and Stand stores: params drive
// everything, history is a stack of JSON snapshots, and the browser keeps a copy
// so the tab can be closed mid-job.

import {
  DEFAULTS, buildTag, SIZE_PRESETS, SHAPES, presetParams,
} from './geom/tag.js';
import { objectRings } from './geom/decor.js';

// `char`: a CO2 beam leaves a burnt black edge on wood, MDF and card. Acrylic
// comes off the bed with a clean polished edge instead.
//
// `grain`: which procedural board surface the 3D preview paints. Wood gets
// figure and pores, MDF a flat fine speckle, acrylic nothing at all - it is a
// sheet of colour and pretending otherwise would be a lie about the stock.
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
    // What the tool opens on. 3D, because the first thing anybody wants to know
    // about a tag is what it will look like - and because the back of a luggage
    // tag is half the product, and only the 3D view has a back to turn round to.
    view: '3d',
    // Light. A tag is cut from pale wood or bright acrylic, and on the dark
    // stage the engraving read as the light part of a dark object - the
    // opposite of the finished thing. The backdrop is how you are looking at
    // the tag, not part of it, so it is not persisted either.
    backdrop: 'light',          // light | dark
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

/**
 * Start from one of the ready designs.
 *
 * The whole parameter set is replaced, not merged, because a preset that
 * inherited a hand-set nudge or slot would build into something it was never
 * measured at. `presetParams` keeps the board's thickness and kerf.
 *
 * Placed artwork is NOT thrown away. It belongs to the person who drew it, and
 * a click that silently deleted it would be the worst thing in this tool - so
 * it is pulled back inside the new outline instead, the same way it is when a
 * tag is made smaller by hand. Undo covers the rest.
 */
export function applyPreset(preset) {
  update((s) => {
    s.params = presetParams(preset, s.params);
    s.selection = null;
  });
  clampDecor();
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
    // The view is deliberately NOT restored, and persist() deliberately does not
    // write it. It is how you are looking at the tag, not part of the tag.
    //
    // This is the third time in this codebase: the Cake Topper and the Stand
    // both had 3D as their default value for months while hardly anybody saw it,
    // because load() put the saved view back over the top. Anyone who had ever
    // opened the tool kept whichever tab they happened to leave on, and the
    // default quietly did nothing for them. A default that only reaches
    // first-time visitors is not a default.

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

/**
 * Pull artwork back inside the piece after the piece shrank under it.
 *
 * It used to clamp only the object's ORIGIN, into the range [-w, pieceW] -
 * which lets an object sit entirely off the part and still count as clamped.
 * Picking a smaller preset with a Cut shape placed was enough: on a 38 mm pet
 * disc a 40 x 20 cut rectangle stayed where it was, half of it past the edge,
 * and the exported cut layer ran off the tag and across the sheet. Nothing
 * warned, because nothing looked.
 *
 * So: shrink anything larger than the piece, then seat it fully inside.
 * Geometry for every type is derived from w/h - text is the exception, since
 * its glyphs come from its own size, which is why decorOutside() below still
 * has to check the result rather than trust this.
 */
export function clampDecor() {
  const t = getTag();
  for (const piece of t.pieces) {
    const { w: pw, h: ph } = piece.size;
    for (const o of state.decor[piece.id] || []) {
      if (o.w > pw || o.h > ph) {
        const k = Math.min(pw / o.w, ph / o.h);
        o.w *= k;
        o.h *= k;
      }
      o.x = Math.min(Math.max(o.x, 0), Math.max(0, pw - o.w));
      o.y = Math.min(Math.max(o.y, 0), Math.max(0, ph - o.h));
    }
  }
}

/**
 * Placed artwork that still falls outside the piece it sits on.
 *
 * clampDecor cannot always fix it - text does not shrink with w/h, and a
 * rotated object reaches past its own box - so the result is checked rather
 * than assumed. A cut path that leaves the tag is not a cosmetic problem: the
 * head follows it across the sheet and through whatever else is nested there.
 */
export function decorOutside() {
  const t = getTag();
  const out = [];
  for (const piece of t.pieces) {
    const { w: pw, h: ph } = piece.size;
    for (const o of state.decor[piece.id] || []) {
      let past = false;
      for (const ring of objectRings(o)) {
        for (const [x, y] of ring) {
          if (x < -0.01 || y < -0.01 || x > pw + 0.01 || y > ph + 0.01) { past = true; break; }
        }
        if (past) break;
      }
      if (past) out.push({ piece: piece.id, id: o.id, type: o.type, process: o.process });
    }
  }
  return out;
}

/** Every placed object across both sides - the element count in the readout. */
export function elementCount() {
  return SIDES.reduce((n, id) => n + (state.decor[id] || []).length, 0);
}
