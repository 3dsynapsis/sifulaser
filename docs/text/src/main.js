// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getResult, undo, redo,
} from './store.js';
import { loadFace } from './geom/text.js';
import { View } from './view.js';
import {
  renderInspector, renderBackdrop, renderActions, fillExportDialog, fillHelpDialog,
  rnd,
} from './ui.js';
import { toSvg, toPdf } from './export.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  stage: $('#stage'),
  preview: $('#stagePreview'),
  inspector: $('#inspector'),
  backdrop: $('#backdropPick'),
  hint: $('#stageHint'),
  readout: $('#sizeReadout'),
  status: $('#status'),
  name: $('#projectName'),
  undo: $('#undoBtn'),
  redo: $('#redoBtn'),
  exportDlg: $('#exportDlg'),
  helpDlg: $('#helpDlg'),
};

load();
els.name.value = state.name;

const view = new View(els.preview);
let faces = [];

const ctx = {
  faces: [],
  refresh: () => refresh(),
  // Typing should not rebuild the whole panel underneath the caret.
  refreshPreviewOnly: () => drawPreview(),
};

let statusTimer = null;
function markSaved() {
  els.status.textContent = 'Saving...';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = 'Saved'; }, 400);
}

function drawPreview() {
  const r = getResult();
  els.stage.dataset.backdrop = state.backdrop;
  view.render(r, { showBox: state.showBox, smooth: r.smooth });
  const label = r.paths.length
    ? `${rnd(r.size.width, 1)} x ${rnd(r.size.height, 1)} mm`
    : 'Type something to begin';
  els.hint.textContent = label;
  els.hint.classList.add('show');
  els.readout.textContent = r.paths.length ? label : '';
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
}

/**
 * Load every face up front. The whole set is about 100 KB of JSON and the
 * typeface list previews each one in its own strokes, so there is nothing to
 * gain by deferring them - and a picker that fills in one row at a time looks
 * broken.
 */
async function boot() {
  const res = await fetch(new URL('./font/index.json', import.meta.url));
  faces = await res.json();
  ctx.faces = faces;
  refresh();
  await Promise.all(faces.map((f) => loadFace(f.id).catch(() => null)));
  if (!faces.some((f) => f.id === state.params.face)) {
    update((s) => { s.params.face = faces[0].id; }, { history: false });
  }
  refresh();
}

boot();

els.name.addEventListener('change', () => {
  update((s) => { s.name = els.name.value.trim() || 'Untitled text'; },
    { history: false });
  markSaved();
});

els.undo.addEventListener('click', () => { undo(); els.name.value = state.name; refresh(); });
els.redo.addEventListener('click', () => { redo(); els.name.value = state.name; refresh(); });

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
  // Let the textarea keep its own undo stack.
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
  e.preventDefault();
  if (e.shiftKey) redo(); else undo();
  els.name.value = state.name;
  refresh();
});

function download(kind) {
  const r = getResult();
  if (!r.paths.length) return;
  const title = state.name || 'text';
  const opts = { title, smooth: r.smooth };
  const body = kind === 'pdf'
    ? toPdf(r.paths, r.size, opts)
    : toSvg(r.paths, r.size, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  const base = title.trim().replace(/[^\w-]+/g, '-').toLowerCase() || 'text';

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
