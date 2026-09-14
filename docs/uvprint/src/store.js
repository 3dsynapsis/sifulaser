// Single source of truth, same shape as the family's other stores: one
// module-level state, update(), subscribe(), and a debounced localStorage
// write.
//
// Only the material is remembered between visits. The quantity belongs to one
// order, so a new file starts again at 1 set: a quantity typed for yesterday's
// file (or a half-typed, invalid one) never lands on today's. The file is
// NOT: it is the customer's artwork, it never leaves this browser, and keeping
// a copy in localStorage would be keeping it somewhere they did not ask for.
//
// No document and no localStorage at module scope - the node tests import this.

const STORAGE_KEY = 'uvprint.project.v1';

export const DEFAULT_PARAMS = {
  material: '3mm',
  qtyText: '1',
};

function initialState() {
  return {
    params: { ...DEFAULT_PARAMS },
    file: null,      // { name, size }
    analysis: null,  // analyseFile() result
    busy: '',
    error: null,     // { code } - a refusal before or instead of an analysis
    seq: 0,          // bumps per file, so a slow old read cannot land on a new file
  };
}

export const state = initialState();

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => { for (const fn of listeners) fn(); };

let persistTimer = null;
export function update(mutator) {
  mutator(state);
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 250);
  emit();
}

/**
 * A new file: everything about the old one goes, before anything is read.
 * Uploading a broken file after a good one must not leave the old price on
 * screen (QA plan F18).
 */
export function startFile(file) {
  let seq = 0;
  update((s) => {
    s.seq++;
    seq = s.seq;
    s.file = { name: String(file.name || ''), size: Number(file.size) || 0 };
    s.analysis = null;
    s.error = null;
    s.busy = 'Membaca fail...';
    s.params.qtyText = DEFAULT_PARAMS.qtyText;
  });
  return seq;
}

export function setAnalysis(seq, analysis) {
  if (seq !== state.seq) return false;
  update((s) => {
    s.analysis = analysis;
    s.error = analysis && !analysis.ok ? { code: analysis.code } : null;
    s.busy = '';
  });
  return true;
}

export function setError(seq, code) {
  if (seq !== state.seq) return false;
  update((s) => {
    s.analysis = null;
    s.error = { code };
    s.busy = '';
  });
  return true;
}

export function setMaterial(id) {
  update((s) => { s.params.material = id; });
}

export function setQtyText(text) {
  update((s) => { s.params.qtyText = String(text ?? ''); });
}

export function clearFile() {
  update((s) => {
    s.seq++;
    s.file = null;
    s.analysis = null;
    s.error = null;
    s.busy = '';
  });
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ params: { material: state.params.material } }));
  } catch {
    // Private window or blocked storage: remembering a radio button is not worth an error.
  }
}

export function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    // Older saves also held qtyText; it is ignored.
    if (typeof saved?.params?.material === 'string') state.params = { ...DEFAULT_PARAMS, material: saved.params.material };
  } catch {
    // ignore
  }
}
