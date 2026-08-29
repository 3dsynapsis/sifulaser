// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getResult, undo, redo,
} from './store.js';
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
  vArtwork: $('#vArtwork'),
  vLayers: $('#vLayers'),
  exportDlg: $('#exportDlg'),
  helpDlg: $('#helpDlg'),
};

load();
els.name.value = state.name;

const view = new View(els.preview);

const ctx = {
  refresh: () => refresh(),
  // Typing a link should not rebuild the whole panel underneath the caret.
  refreshPreviewOnly: () => schedulePreview(),
};

let statusTimer = null;
function markSaved() {
  els.status.textContent = 'Saving...';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = 'Saved'; }, 400);
}

// Re-encoding is milliseconds at the larger versions - enough to be felt on
// every keystroke of a long URL. One frame of coalescing keeps typing smooth
// without the preview ever lagging behind by more than that.
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
    ? (d.reason === 'too-long' ? 'Too much text for any QR code' : 'Paste a link to begin')
    : `${rnd(d.partW, 1)} x ${rnd(d.partH, 1)} mm - version ${d.version}${d.ecl}, `
      + `${rnd(d.moduleMm, 2)} mm modules`;
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
  els.vArtwork.setAttribute('aria-selected', String(state.view === 'artwork'));
  els.vLayers.setAttribute('aria-selected', String(state.view === 'layers'));
}

refresh();

els.name.addEventListener('change', () => {
  update((s) => { s.name = els.name.value.trim() || 'Untitled QR'; },
    { history: false });
  markSaved();
});

els.undo.addEventListener('click', () => { undo(); els.name.value = state.name; refresh(); });
els.redo.addEventListener('click', () => { redo(); els.name.value = state.name; refresh(); });

const setView = (v) => {
  update((s) => { s.view = v; }, { history: false });
  refresh();
};
els.vArtwork.addEventListener('click', () => setView('artwork'));
els.vLayers.addEventListener('click', () => setView('layers'));

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
  if (r.derived.empty || !r.panels.length) return;
  const title = state.name || 'qr';
  const opts = { title, sheetWidth: state.sheetWidth };
  const body = kind === 'pdf' ? toPdf(r.panels, opts) : toSvg(r.panels, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  // Name the file after the link rather than the project, because a folder of
  // these is otherwise forty files called qr.svg. Strip the scheme first - the
  // "https" on the front of every one of them tells nobody anything.
  const base = String(r.params.text || title)
    .replace(/^[a-z]+:\/\//i, '')
    .trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .toLowerCase() || 'qr';

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
