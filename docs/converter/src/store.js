// Single source of truth. Same shape as the other nine tools' stores: one
// module-level state object, one update(), a subscription, and a debounced
// write to localStorage.
//
// Two things here are not like the generators. Those tools own their geometry -
// the parameters ARE the drawing - so persisting the parameters persists
// everything. This tool owns nothing: the drawing arrives in a file and the
// only parameters are which format to write and, when the file did not say,
// which unit the user answered. So the file's TEXT is what gets persisted and
// the geometry is re-parsed on the way back in. A cached ring list would be a
// silent lie about what is on screen.
//
// The second is undo/redo, which the other stores all have and this one does
// not. There are two settings, both of them radio buttons with three or five
// options and both instantly re-clickable. An undo stack over that is a control
// that exists to match a pattern rather than to be used, and it would sit next
// to a Download button where a stray Ctrl+Z has a real cost.
//
// No document and no localStorage at module scope - every touch of either is
// inside a function body - because tools/test-converter.js imports from src/
// under plain node and a module-scope reference would kill the whole suite on
// load.

const STORAGE_KEY = 'file-converter.project.v1';

// Chrome gives an origin about 5 MB of localStorage. The owner's own R12
// drawing is 4.5 MB on its own, so it will not be remembered across a reload -
// and the UI says so out loud rather than letting the file quietly vanish.
export const MAX_PERSIST_BYTES = 400_000;

export const DEFAULT_PARAMS = {
  target: 'svg',      // svg | pdf | dxf
  unitChoice: null,   // null until the user answers, then 'mm' | 'cm' | 'in' | 'px' | 'pt'
};

function initialState() {
  return {
    params: { ...DEFAULT_PARAMS },
    file: null,       // { name, bytes, format, text, key }
    parsed: null,     // parseInput() result - geometry still in FILE units
    settled: null,    // settleUnit() result - geometry in millimetres
    result: null,     // convert() result - the output bytes and their preview
    busy: '',         // a sentence while a big file is being read
    error: null,      // { message } - a refusal we want on screen
    notice: null,     // a quieter aside, e.g. "too big to remember"
  };
}

export const state = initialState();

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

let persistTimer = null;

export function update(mutator) {
  mutator(state);
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 250);
  emit();
}

/**
 * A cheap identity for a file, so a remembered unit answer sticks to the file
 * it was an answer about.
 *
 * Name alone is not enough - "drawing.dxf" is the most common filename in the
 * world and the second one could easily be drawn in different units. Hashing
 * the whole of a 4.5 MB file to answer a question about a radio button is not
 * worth the milliseconds, so this takes the name, the byte length and the two
 * ends of the text. Two files that agree on all four and disagree about their
 * units is a case we are content to get wrong.
 */
export function fileKey(name, text) {
  const s = String(text || '');
  const sample = s.slice(0, 2048) + s.slice(-2048);
  let h = 2166136261;
  for (let i = 0; i < sample.length; i++) {
    h ^= sample.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${name}:${s.length}:${(h >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// setters

export function setBusy(message) {
  update((s) => { s.busy = message || ''; });
}

export function setError(message) {
  update((s) => {
    s.error = message ? { message } : null;
    s.busy = '';
  });
}

/**
 * A new file arrives.
 *
 * The unit answer is cleared unless this is the same file coming back - a
 * remembered "centimetres" applied to somebody else's drawing is exactly the
 * confident wrong measurement this whole tool is built to refuse.
 */
export function setFile(file, parsed, { keepChoiceFor = null } = {}) {
  update((s) => {
    s.file = file;
    s.parsed = parsed;
    s.settled = null;
    s.result = null;
    s.error = null;
    s.busy = '';
    if (keepChoiceFor !== file.key) s.params.unitChoice = null;
    s.notice = file.text.length > MAX_PERSIST_BYTES
      ? 'Fail ini terlalu besar untuk diingat selepas refresh (lebih 400 KB). Muat naik semula selepas refresh.'
      : null;
  });
}

export function clearFile() {
  update((s) => {
    s.file = null;
    s.parsed = null;
    s.settled = null;
    s.result = null;
    s.error = null;
    s.notice = null;
    s.params.unitChoice = null;
  });
}

/**
 * Changing the target throws the produced bytes away.
 *
 * The Download button hands over whatever `result` holds and the right-hand
 * pane draws it. Leaving a stale PDF sitting there while the SVG button looks
 * selected would mean the picture, the button and the file disagree, and the
 * one that reaches the customer is the file.
 */
export function setTarget(id) {
  update((s) => {
    if (s.params.target === id) return;
    s.params.target = id;
    s.result = null;
  });
}

/** The answer to the unit question. Same reasoning: the old output is void. */
export function setUnitChoice(id) {
  update((s) => {
    s.params.unitChoice = id;
    s.settled = null;
    s.result = null;
  });
}

export function setConverted(settled, result) {
  update((s) => {
    s.settled = settled;
    s.result = result;
    s.busy = '';
    s.error = null;
  });
}

// ---------------------------------------------------------------------------
// persistence

function persist() {
  try {
    const f = state.file;
    const payload = {
      params: state.params,
      file: f && f.text.length <= MAX_PERSIST_BYTES
        ? { name: f.name, text: f.text, key: f.key }
        : null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // A full quota, a private window, or a browser told to block site data.
    // Losing the restore is not worth throwing on the way out of an update().
  }
}

/**
 * What was left here last time, for main.js to re-parse.
 *
 * The parameters are restored into the store directly; the file text is handed
 * back rather than applied, because turning text into geometry needs the DOM
 * and the store has none.
 */
export function load() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    saved = null;
  }
  if (!saved) return null;
  if (saved.params) {
    state.params = { ...DEFAULT_PARAMS, ...saved.params };
  }
  return saved.file || null;
}
