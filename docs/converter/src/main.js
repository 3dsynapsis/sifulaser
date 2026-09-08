// Wiring: bytes in, store, panels, previews, bytes out.
//
// This is the only file that touches document, FileReader, Blob or
// URL.createObjectURL. The store has no DOM and the conversion core has no
// browser, which is what lets tools/test-converter.js import the whole pipeline
// under plain node.
//
// The order below is the order convert.js insists on, and it is insisted on for
// one reason: settleUnit() throws rather than guessing. A version of this file
// that forgets to ask the unit question fails loudly here in development
// instead of quietly writing a file that gets cut at the wrong size.
//
// Files are read as an ArrayBuffer, never with readAsText. A binary DXF decoded
// as text comes back as mojibake with no error at all, the parser finds nothing
// in it, and the user is left looking at an empty preview concluding the tool
// is broken. readInput() sniffs the sentinel and refuses by name instead.

import {
  state, load, subscribe, setFile, setBusy, setError, setConverted, setUnitChoice,
  fileKey, clearFile,
} from './store.js';
import {
  readInput, parseInput, settleUnit, convert, sniffFormat, bounds,
} from './convert.js';
import { importSvg } from './importSvg.js';
import { View } from './view.js';
import {
  renderLeftPanel, renderRightPanel, renderUnitAsk, currentUnit, pickerVisible, fmtBytes,
} from './ui.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  work: $('#work'),
  empty: $('#emptyState'),
  banner: $('#banner'),
  paneLeft: $('#paneLeft'),
  paneRight: $('#paneRight'),
  askBox: $('#askBox'),
  leftPanel: $('#leftPanel'),
  rightPanel: $('#rightPanel'),
  fileInput: $('#fileInput'),
  openBtn: $('#openBtn'),
  openBtn2: $('#openBtn2'),
  status: $('#status'),
  veil: $('#dropVeil'),
};

const view = new View(els.paneLeft, els.paneRight);

const ctx = {
  pickFile: () => els.fileInput.click(),
  convert: () => doConvert(),
  download: () => download(),
  chooseUnit: (id) => chooseUnit(id),
  refresh: () => render(),
};

// ---------------------------------------------------------------------------
// drawing

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

function drawPanes() {
  if (!state.parsed) {
    view.render({ left: null, right: null, leftEmpty: '', rightEmpty: '' });
    return;
  }
  // Once the unit is settled the left pane is redrawn from the millimetre doc,
  // so both panes are measured in the same thing. Before that it is the file's
  // own numbers, and the pane says so rather than calling them millimetres.
  const leftDoc = state.settled ? state.settled.doc : state.parsed.doc;
  const unitLabel = state.settled ? 'mm' : 'unit fail';
  const right = state.result
    ? { doc: state.result.preview, bounds: bounds(state.result.preview) }
    : null;

  view.render({
    left: { doc: leftDoc, bounds: bounds(leftDoc) },
    right,
    unitLabel,
    rightEmpty: 'tekan Tukar',
  });

  if (state.result) {
    const r = state.result;
    view.right.setNote(r.previewSource === 'written'
      // Nothing here parses PDF, so this pane cannot be the produced bytes read
      // back. It is the exact coordinate list the writer consumed, and saying
      // which of the two it is beats quietly implying the stronger one.
      ? `Dilukis dari data yang ditulis ke PDF - ${fmtBytes(r.bytes)}`
      : `Dibaca semula dari fail ${r.ext.toUpperCase()} yang dihasilkan - ${fmtBytes(r.bytes)}`);
    view.right.setLabel(`Fail Ditukar (${r.ext.toUpperCase()})`);
  } else {
    view.right.setNote('');
    view.right.setLabel('Fail Ditukar (Pratonton)');
  }
}

function render() {
  els.work.hidden = !state.parsed;
  els.empty.hidden = !!state.parsed;
  els.openBtn.hidden = !state.parsed;

  els.banner.hidden = !state.error;
  if (state.error) els.banner.textContent = state.error.message;
  els.status.textContent = state.busy || '';

  const unit = currentUnit();
  const blocking = !!unit && unit.mmPerUnit == null;
  const showPicker = pickerVisible();

  els.askBox.hidden = !showPicker;
  els.paneRight.hidden = blocking;
  if (showPicker) renderUnitAsk(els.askBox, ctx, { blocking });

  if (state.parsed) {
    // Panels first, panes second. The panes frame themselves against their own
    // measured width, so they have to be measured against the layout the user
    // will actually see rather than against a half-built one.
    renderLeftPanel(els.leftPanel, ctx);
    renderRightPanel(els.rightPanel, ctx);
    drawPanes();
  } else {
    els.leftPanel.replaceChildren();
    els.rightPanel.replaceChildren();
  }
}

subscribe(() => schedule());

// The panes frame themselves against their own width, so a resize - including
// a phone turning sideways - has to reframe them. Only the drawing is redone;
// the panels have nothing that depends on the viewport.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.parsed) drawPanes(); }, 150);
});

// ---------------------------------------------------------------------------
// loading a file

function parseAndStore(input, { keepChoiceFor = null } = {}) {
  if (input.error) {
    setError(input.message);
    return;
  }
  const parsed = parseInput(input, { svgReader: importSvg });
  if (parsed.error) {
    setError(parsed.message);
    return;
  }
  setFile(
    {
      name: input.name, bytes: input.bytes, format: input.format,
      text: input.text, key: fileKey(input.name, input.text),
    },
    parsed,
    { keepChoiceFor },
  );
}

/**
 * A 4.5 MB DXF is about 150 ms of parsing plus the two previews. That is not
 * slow, but it is long enough that a click with no acknowledgement gets clicked
 * again - so the busy line is painted first and the work is handed to the next
 * task.
 */
function withBusy(message, work) {
  setBusy(message);
  setTimeout(() => {
    try {
      work();
    } catch (err) {
      setError(`Ada yang tak kena semasa membaca fail itu: ${err.message}`);
    }
  }, 0);
}

function openFile(file) {
  withBusy(`Membaca ${file.name}...`, () => {
    const reader = new FileReader();
    reader.onerror = () => setError('Fail itu tidak dapat dibaca.');
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result);
        parseAndStore(readInput(bytes, file.name));
      } catch (err) {
        setError(`Ada yang tak kena semasa membaca fail itu: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

els.fileInput.addEventListener('change', () => {
  const f = els.fileInput.files && els.fileInput.files[0];
  if (f) openFile(f);
  els.fileInput.value = '';
});
els.openBtn.addEventListener('click', () => ctx.pickFile());
els.openBtn2.addEventListener('click', () => ctx.pickFile());

let dragDepth = 0;
document.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  dragDepth++;
  els.veil.hidden = false;
});
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.veil.hidden = true;
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.veil.hidden = true;
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) openFile(f);
});

// ---------------------------------------------------------------------------
// converting and downloading

/**
 * The user answered the unit question, so apply it immediately.
 *
 * Waiting until Convert would leave the screen still saying "the file does not
 * state a unit" underneath an answer that has been given - and it would leave
 * the left preview measured in file units while the person reading it now
 * believes it is millimetres. Settling here is the one place both of those
 * become true at once.
 */
function chooseUnit(id) {
  setUnitChoice(id);
  withBusy('Menggunakan unit...', () => {
    setConverted(settleUnit(state.parsed, id), null);
  });
}

function doConvert() {
  if (!state.parsed) return;
  withBusy('Menukar...', () => {
    const settled = state.settled || settleUnit(state.parsed, state.params.unitChoice);
    const result = convert(settled.doc, state.params.target, { title: state.file.name });
    setConverted(settled, result);
  });
}

function download() {
  const r = state.result;
  if (!r) return;
  const base = String(state.file.name).replace(/\.[^.]+$/, '') || 'converted';
  const blob = new Blob([r.text], { type: r.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}.${r.ext}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// what was left here last time

const saved = load();
if (saved && saved.text) {
  // Rebuilt from the text rather than pushed back through readInput(): the
  // bytes are long gone and re-encoding them only to decode them again would
  // put a codepage round trip in the middle of a restore for no gain.
  const format = sniffFormat(saved.name, saved.text);
  if (format === 'svg' || format === 'dxf') {
    parseAndStore(
      {
        format,
        text: saved.text,
        name: saved.name,
        bytes: new TextEncoder().encode(saved.text).length,
      },
      { keepChoiceFor: saved.key },
    );
  } else {
    clearFile();
  }
}

render();
