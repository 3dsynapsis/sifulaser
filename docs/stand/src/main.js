// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getResult, undo, redo,
} from './store.js';
import { loadFace, putFace } from './geom/text.js';
import { View } from './view.js';
import {
  renderInspector, renderBackdrop, renderActions, renderWarnings,
  fillExportDialog, fillHelpDialog, rnd,
} from './ui.js';
import { toSvg, toPdf } from './export.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  stage: $('#stage'),
  preview: $('#stagePreview'),
  inspector: $('#inspector'),
  backdrop: $('#backdropPick'),
  warnings: $('#warnings'),
  hint: $('#stageHint'),
  readout: $('#sizeReadout'),
  status: $('#status'),
  name: $('#projectName'),
  undo: $('#undoBtn'),
  redo: $('#redoBtn'),
  vAssembled: $('#vAssembled'),
  vFlat: $('#vFlat'),
  exportDlg: $('#exportDlg'),
  helpDlg: $('#helpDlg'),
};

load();
els.name.value = state.name;

const view = new View(els.preview);

const ctx = {
  faces: [],
  refresh: () => refresh(),
  // Typing should not rebuild the whole panel underneath the caret.
  refreshPreviewOnly: () => schedulePreview(),
};

let statusTimer = null;
function markSaved() {
  els.status.textContent = 'Saving...';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = 'Saved'; }, 400);
}

// Tracing a distance field is tens of milliseconds, which is enough to be felt
// on every keystroke. One frame of coalescing makes typing smooth without the
// preview ever lagging behind by more than that.
let previewQueued = false;
function schedulePreview() {
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    drawPreview();
  });
}

function drawPreview() {
  const r = getResult();
  els.stage.dataset.backdrop = state.backdrop;
  view.render(r, { mode: state.view, sheetWidth: state.sheetWidth });
  const d = r.derived;
  const label = d.empty
    ? 'Type a name to begin'
    : `${rnd(d.baseW, 1)} x ${rnd(d.baseD, 1)} x ${rnd(d.standHeight, 1)} mm`;
  els.hint.textContent = label;
  els.hint.classList.add('show');
  els.readout.textContent = d.empty ? '' : label;
  renderWarnings(els.warnings);
  markSaved();
}

function refresh() {
  drawPreview();
  renderInspector(els.inspector, ctx);
  renderBackdrop(els.backdrop, (id) => {
    update((s) => { s.backdrop = id; }, { history: false });
    refresh();
  });
  renderActions({ undoBtn: els.undo, redoBtn: els.redo });
  els.vAssembled.setAttribute('aria-selected', String(state.view === 'assembled'));
  els.vFlat.setAttribute('aria-selected', String(state.view === 'flat'));
}

/**
 * The index is small; the faces are not. Only the face in use is fetched at
 * start-up and the picker fetches the rest of a category when you open it, so
 * the first paint does not wait on the best part of a megabyte of glyph data.
 */
async function boot() {
  const res = await fetch(new URL('./font/index.json', import.meta.url));
  ctx.faces = await res.json();
  if (!ctx.faces.some((f) => f.id === state.params.face)) {
    update((s) => { s.params.face = ctx.faces[0].id; }, { history: false });
  }
  refresh();
  await loadFace(state.params.face).catch(() => null);
  refresh();
}

boot();

els.name.addEventListener('change', () => {
  update((s) => { s.name = els.name.value.trim() || 'Untitled stand'; },
    { history: false });
  markSaved();
});

els.undo.addEventListener('click', () => { undo(); els.name.value = state.name; refresh(); });
els.redo.addEventListener('click', () => { redo(); els.name.value = state.name; refresh(); });

const setView = (v) => {
  update((s) => { s.view = v; }, { history: false });
  refresh();
};
els.vAssembled.addEventListener('click', () => setView('assembled'));
els.vFlat.addEventListener('click', () => setView('flat'));

$('#helpBtn').addEventListener('click', () => {
  fillHelpDialog(els.helpDlg);
  els.helpDlg.showModal();
});

$('#exportBtn').addEventListener('click', () => {
  fillExportDialog(els.exportDlg);
  els.exportDlg.showModal();
});

els.exportDlg.addEventListener('close', () => {
  const v = els.exportDlg.returnValue;
  if (v === 'svg') download('svg');
  else if (v === 'pdf') download('pdf');
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

function download(kind) {
  const r = getResult();
  if (!r.panels.length) return;
  const title = state.name || 'stand';
  const opts = { title, sheetWidth: state.sheetWidth };
  const body = kind === 'pdf' ? toPdf(r.panels, opts) : toSvg(r.panels, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  const base = (r.params.line1 || title).trim().replace(/[^\w-]+/g, '-').toLowerCase()
    || 'stand';

  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { putFace };
