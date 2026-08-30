// Wiring: store -> the two preview panes and the inspector, and the toolbar
// actions.
//
// Importing lives here rather than in the store because it needs the DOM: the
// SVG sampler measures paths with the browser's own geometry engine. The store
// keeps the file's text and hands it back on a reload for this module to
// re-sample.

import {
  state, load, update, getResult, undo, redo, setSource, invalidate, subscribe,
} from './store.js';
import { readAsText, svgTextToShapes, svgDocScale, unitFactor } from './importArt.js';
import { jointedPanel, sampleSvg } from './geom/sample.js';
import { View } from './view.js';
import {
  renderInspector, renderBackdrop, renderActions, renderWarnings,
  fillExportDialog, fillHelpDialog, rnd,
} from './ui.js';
import { toSvg, toPdf, splitLayers } from './export.js';
import { describe } from './geom/refit.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  stage: $('#stage'),
  preview: $('#stagePreview'),
  inspector: $('#inspector'),
  backdrop: $('#backdropPick'),
  warnings: $('#warnings'),
  empty: $('#emptyState'),
  veil: $('#dropVeil'),
  tally: $('#tally'),
  readout: $('#sizeReadout'),
  status: $('#status'),
  name: $('#projectName'),
  undo: $('#undoBtn'),
  redo: $('#redoBtn'),
  exportBtn: $('#exportBtn'),
  fileInput: $('#fileInput'),
  exportDlg: $('#exportDlg'),
  helpDlg: $('#helpDlg'),
};

const saved = load();
els.name.value = state.name;

const view = new View(els.preview);

const ctx = {
  refresh: () => refresh(),
  pickFile: () => els.fileInput.click(),
  loadSample: () => loadSample(),
};

let statusTimer = null;
function markSaved() {
  els.status.textContent = 'Saving...';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = 'Saved'; }, 400);
}

// A refit of a few hundred rings is a handful of milliseconds, but a slider
// drag fires far faster than that, so redraws are coalesced onto one frame.
let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    draw();
  });
}

function draw() {
  const r = getResult();
  els.stage.dataset.backdrop = state.backdrop;
  els.empty.hidden = !!state.source;
  view.render(r, { showMarks: state.showMarks });
  if (r) {
    const rep = r.report;
    els.tally.textContent = describe(rep);
    els.tally.classList.toggle('has-unknown', rep.unrecognised > 0);
    els.readout.textContent = `${rnd(r.originalBounds.w, 1)} -> ${rnd(r.bounds.w, 1)} mm`;
  } else {
    els.tally.textContent = '';
    els.readout.textContent = '';
  }
  renderWarnings(els.warnings);
  markSaved();
}

function refresh() {
  draw();
  renderInspector(els.inspector, ctx);
  renderBackdrop(els.backdrop, (id) => {
    update((s) => { s.backdrop = id; }, { history: false });
    refresh();
  });
  renderActions({ undoBtn: els.undo, redoBtn: els.redo, exportBtn: els.exportBtn });
}

// Slider drags mutate the store without going through refresh(), so the panes
// follow the store directly and the inspector is only rebuilt when something
// asks for it.
subscribe(() => schedule());

// ---- importing ------------------------------------------------------------

/**
 * Sample an SVG into rings and hand them to the store.
 *
 * The unit scale is read from the file's own width/viewBox rather than assumed,
 * because the thickness knob is a real-world measurement: a file drawn in
 * inches would otherwise have its 3 mm slots read as 3 units and refitted to
 * something 25 times too small.
 */
function importText(name, text) {
  const shapes = svgTextToShapes(text, { tolerance: 0.35 });
  if (!shapes.length) {
    els.tally.textContent = 'nothing readable in that file';
    return false;
  }
  const scale = svgDocScale(text);
  setSource({
    name,
    text,
    shapes,
    mmPerUnit: scale.mmPerUnit,
    unitSource: scale.source,
    // The override list is built here because unitFactor() is the importer's
    // table and the store has no business knowing what a pica is.
    overrideFactors: Object.fromEntries(
      ['mm', 'px', 'in', 'pt'].map((id) => [id, unitFactor(id)]),
    ),
  });
  els.name.value = state.name;
  refresh();
  return true;
}

async function openFile(file) {
  if (!file) return;
  const text = await readAsText(file);
  importText(file.name, String(text));
}

function loadSample() {
  importText('sample-jointed-panel.svg', sampleSvg(jointedPanel({ t: 3 })));
}

els.fileInput.addEventListener('change', (e) => {
  openFile(e.target.files?.[0]);
  e.target.value = '';
});

$('#openBtn2').addEventListener('click', () => els.fileInput.click());
$('#sampleBtn2').addEventListener('click', () => loadSample());

let dragDepth = 0;
els.stage.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  els.veil.hidden = false;
});
els.stage.addEventListener('dragover', (e) => e.preventDefault());
els.stage.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.veil.hidden = true;
});
els.stage.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.veil.hidden = true;
  openFile(e.dataTransfer?.files?.[0]);
});

// ---- toolbar --------------------------------------------------------------

els.name.addEventListener('change', () => {
  update((s) => { s.name = els.name.value.trim() || 'Untitled refit'; },
    { history: false });
  markSaved();
});

els.undo.addEventListener('click', () => { undo(); els.name.value = state.name; refresh(); });
els.redo.addEventListener('click', () => { redo(); els.name.value = state.name; refresh(); });

$('#helpBtn').addEventListener('click', () => {
  fillHelpDialog(els.helpDlg);
  els.helpDlg.showModal();
});

els.exportBtn.addEventListener('click', () => {
  if (!state.source) return;
  fillExportDialog(els.exportDlg);
  els.exportDlg.showModal();
});

els.exportDlg.addEventListener('close', () => {
  const v = els.exportDlg.returnValue;
  if (v === 'svg') download('svg');
  else if (v === 'pdf') download('pdf');
  else if (v === 'whatsapp') sendWhatsApp();
});

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key.toLowerCase() !== 'z') return;
  const t = e.target;
  // Let text fields keep their own undo stack.
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
  e.preventDefault();
  if (e.shiftKey) redo(); else undo();
  els.name.value = state.name;
  refresh();
});

function buildFile(kind) {
  const r = getResult();
  if (!r) return null;
  const layers = splitLayers(r.rings, state.source.shapes, {
    keepLayers: state.params.keepLayers,
  });
  const opts = { title: state.name || 'Refitted template' };
  const body = kind === 'pdf' ? toPdf(layers, opts) : toSvg(layers, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  const base = (state.name || 'refit').trim().replace(/[^\w-]+/g, '-').toLowerCase()
    || 'refit';

  return { blob: new Blob([body], { type }), name: `${base}-${rnd(r.report.t1, 2)}mm.${kind}`, type };
}

function saveFile(file) {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function download(kind) {
  const file = buildFile(kind);
  if (file) saveFile(file);
}

/**
 * What the person cutting this needs to know, in the message rather than only
 * in the file. They may well open it on a phone, hours later, without the tool
 * in front of them.
 */
function jobNote() {
  const r = getResult();
  if (!r) return '';
  return [
    `*${state.name || 'Refitted template'}*`,
    `Refitted for ${rnd(r.report.t1, 2)} mm material`,
    `${rnd(r.bounds.w, 2)} x ${rnd(r.bounds.h, 2)} mm, ${r.rings.length} shapes`,
    `${r.report.slots} slot${r.report.slots === 1 ? '' : 's'} and ${r.report.tabs} tab${r.report.tabs === 1 ? '' : 's'} moved.`,
  ].join('\n');
}

/**
 * Hand the cut file to WhatsApp.
 *
 * PDF rather than SVG: WhatsApp treats a PDF as a document anyone can open,
 * while an SVG arrives as a file most phones will not preview and some clients
 * refuse outright.
 *
 * Where the browser and the OS allow it the file goes across attached. Where
 * they do not - which is most desktops - nothing can push a file into WhatsApp
 * through a link: wa.me and the whatsapp: scheme carry text and nothing else.
 * So the fallback saves the file and opens WhatsApp with the job written out,
 * leaving one attachment to do by hand.
 *
 * canShare is checked synchronously, before anything is awaited. Past an await
 * the click is no longer a user gesture and the browser blocks the window it
 * would otherwise open.
 */
function sendWhatsApp() {
  const file = buildFile('pdf');
  if (!file) return;
  const text = jobNote();

  let shareable = null;
  try {
    const f = new File([file.blob], file.name, { type: file.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) shareable = f;
  } catch {
    shareable = null;
  }

  if (shareable) {
    // Cancelling the share sheet rejects; that is a choice, not a failure, so it
    // must not then go and open a second thing behind them.
    navigator.share({ files: [shareable], text }).catch(() => {});
    return;
  }

  saveFile(file);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}


// ---- start ----------------------------------------------------------------

// The saved project carries the SVG text, not the rings: re-sampling costs a
// few milliseconds and a stale ring cache would be a silent lie about what is
// on screen.
if (saved?.text) {
  const keep = { ...state.params };
  const keepName = state.name;
  if (importText(saved.name, saved.text)) {
    update((s) => {
      Object.assign(s.params, keep);
      s.name = keepName;
    }, { history: false });
    els.name.value = state.name;
    invalidate();
  }
}
refresh();
