// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getPuzzle, subscribe, undo, redo, material, emit,
} from './store.js';
import { View } from './view.js';
import {
  renderInspector, renderBackdrop, renderActions, fillExportDialog, fillHelpDialog,
} from './ui.js';
import { puzzleToSvg } from './exportSvg.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  stage: $('#stage'),
  preview: $('#stagePreview'),
  inspector: $('#inspector'),
  backdrop: $('#backdropPick'),
  hint: $('#stageHint'),
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

const ctx = {
  refresh: () => refresh(),
  shuffle: () => {
    update((s) => { s.params.seed = Math.floor(Math.random() * 100000); },
      { geometry: true });
    refresh();
  },
};

let statusTimer = null;
function markSaved() {
  els.status.textContent = 'Saving...';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = 'Saved'; }, 400);
}

function refresh() {
  const puzzle = getPuzzle();
  els.stage.dataset.backdrop = state.backdrop;
  view.render(puzzle, { boardColor: material().color });
  renderInspector(els.inspector, ctx);
  renderBackdrop(els.backdrop, (id) => {
    update((s) => { s.backdrop = id; }, { history: false });
    refresh();
  });
  renderActions({ undoBtn: els.undo, redoBtn: els.redo });
  els.hint.textContent =
    `${puzzle.derived.pieces} pieces · ${puzzle.params.width} x ${puzzle.params.height} mm`;
  els.hint.classList.add('show');
  markSaved();
}

subscribe(() => {});
refresh();

els.name.addEventListener('change', () => {
  update((s) => { s.name = els.name.value.trim() || 'Untitled puzzle'; },
    { history: false });
  markSaved();
});

els.undo.addEventListener('click', () => { undo(); els.name.value = state.name; refresh(); });
els.redo.addEventListener('click', () => { redo(); els.name.value = state.name; refresh(); });
$('#shuffleBtn').addEventListener('click', () => ctx.shuffle());

$('#helpBtn').addEventListener('click', () => {
  fillHelpDialog(els.helpDlg);
  els.helpDlg.showModal();
});

$('#exportBtn').addEventListener('click', () => {
  fillExportDialog(els.exportDlg);
  els.exportDlg.showModal();
});

els.exportDlg.addEventListener('close', () => {
  if (els.exportDlg.returnValue === 'all') download();
});

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    els.name.value = state.name;
    refresh();
  }
});

function download() {
  const puzzle = getPuzzle();
  const base = (state.name || 'puzzle').trim().replace(/[^\w-]+/g, '-').toLowerCase()
    || 'puzzle';
  const svg = puzzleToSvg(puzzle, {
    split: state.splitLayers,
    title: `${state.name} - ${puzzle.derived.pieces} pieces`,
  });
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}-${puzzle.params.cols}x${puzzle.params.rows}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// The store emits on every mutation; the callers above already refresh, so this
// only has to catch anything that mutates state without going through them.
emit();
