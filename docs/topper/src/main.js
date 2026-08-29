// Wiring: store -> preview + inspector, and the toolbar actions.

import { state, load, update, getResult, undo, redo } from './store.js';
import { loadFace } from './geom/text.js';
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
  vCake: $('#vCake'),
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
  refreshPreviewOnly: () => schedulePreview(),
};

let statusTimer = null;
function markSaved() {
  els.status.textContent = 'Saving...';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = 'Saved'; }, 400);
}

// Tracing a distance field is tens of milliseconds, which is enough to be felt
// on every keystroke. One frame of coalescing keeps typing smooth without the
// preview ever falling more than that far behind.
let queued = false;
function schedulePreview() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; drawPreview(); });
}

function drawPreview() {
  const r = getResult();
  els.stage.dataset.backdrop = state.backdrop;
  view.render(r, { mode: state.view });
  const d = r.derived;
  const label = d.empty
    ? 'Type a message to begin'
    : `${rnd(d.width, 1)} x ${rnd(d.height, 1)} mm`;
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
  els.vCake.setAttribute('aria-selected', String(state.view === 'cake'));
  els.vFlat.setAttribute('aria-selected', String(state.view === 'flat'));
}

/**
 * Thirty-three faces is well over a megabyte of glyph data. Only the one in use
 * is fetched at start-up; the picker fetches the rest of a category when you
 * open it, so the first paint does not wait on faces nobody looked at.
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
  update((s) => { s.name = els.name.value.trim() || 'Untitled topper'; },
    { history: false });
  markSaved();
});

els.undo.addEventListener('click', () => { undo(); els.name.value = state.name; refresh(); });
els.redo.addEventListener('click', () => { redo(); els.name.value = state.name; refresh(); });

const setView = (v) => {
  update((s) => { s.view = v; }, { history: false });
  refresh();
};
els.vCake.addEventListener('click', () => setView('cake'));
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
  const title = state.name || 'topper';
  const opts = { title, sheetWidth: 900 };
  const body = kind === 'pdf' ? toPdf(r.panels, opts) : toSvg(r.panels, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  // The name is usually the last line, which is what somebody wants the file
  // called - not "Happy".
  const lines = String(r.params.text || title).split(/\r?\n/).filter((l) => l.trim());
  const base = (lines[lines.length - 1] || title).trim()
    .replace(/[^\w-]+/g, '-').toLowerCase() || 'topper';

  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}-topper.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
