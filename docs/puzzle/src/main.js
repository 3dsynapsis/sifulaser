// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getPuzzle, subscribe, undo, redo, material, emit,
} from './store.js';
import { View } from './view.js';
import {
  renderInspector, renderBackdrop, renderActions, fillExportDialog, fillHelpDialog,
} from './ui.js';
import { puzzleToSvg } from './exportSvg.js';
import { puzzleToPdf } from './exportPdf.js';

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
  const v = els.exportDlg.returnValue;
  if (v === 'all') saveFile(buildFile('svg'));
  else if (v === 'pdf') saveFile(buildFile('pdf'));
  else if (v === 'whatsapp') sendWhatsApp();
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

/** The file itself, built but not yet handed anywhere. */
function buildFile(kind) {
  const puzzle = getPuzzle();
  if (!puzzle) return null;
  const base = (state.name || 'puzzle').trim().replace(/[^\w-]+/g, '-').toLowerCase()
    || 'puzzle';
  const opts = {
    split: state.splitLayers,
    title: `${state.name} - ${puzzle.derived.pieces} pieces`,
  };
  const body = kind === 'pdf' ? puzzleToPdf(puzzle, opts) : puzzleToSvg(puzzle, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  return {
    blob: new Blob([body], { type }),
    name: `${base}-${puzzle.params.cols}x${puzzle.params.rows}.${kind}`,
    type,
    puzzle,
  };
}

function saveFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * What the person cutting this needs to know, in the message rather than only
 * in the file. The cutting order is the part worth saying out loud: cut the
 * border first and the board is free of the sheet before the pieces are, so
 * every one of them shifts as it is released.
 */
function puzzleNote(puzzle) {
  const p = puzzle.params;
  const d = puzzle.derived;
  return [
    `*${state.name || 'Puzzle'}*`,
    `${d.pieces} pieces on a ${p.width} x ${p.height} mm board`,
    `Each about ${Math.round(d.pieceW * 10) / 10} x ${Math.round(d.pieceH * 10) / 10} mm`,
    state.splitLayers
      ? 'Cut in layer order: red lines, then blue, then the black border LAST.'
      : 'Cut the puzzle lines first and the black border LAST, or the pieces '
        + 'shift as the board comes free.',
  ].join('\n');
}

/**
 * Hand the cut file to WhatsApp.
 *
 * PDF rather than SVG: WhatsApp treats a PDF as a document anyone can open,
 * while an SVG arrives as a file most phones will not preview.
 *
 * Where the browser and the OS allow it the file goes across attached. Where
 * they do not - most desktops - nothing can push a file into WhatsApp through a
 * link: wa.me and the whatsapp: scheme carry text and nothing else. So the
 * fallback saves the file and opens WhatsApp with the job written out.
 *
 * canShare is checked synchronously, before anything is awaited. Past an await
 * the click is no longer a user gesture and the browser blocks the window.
 */
function sendWhatsApp() {
  const file = buildFile('pdf');
  if (!file) return;
  const text = puzzleNote(file.puzzle);

  let shareable = null;
  try {
    const f = new File([file.blob], file.name, { type: file.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) shareable = f;
  } catch {
    shareable = null;
  }

  if (shareable) {
    navigator.share({ files: [shareable], text }).catch(() => {});
    return;
  }

  saveFile(file);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

// The store emits on every mutation; the callers above already refresh, so this
// only has to catch anything that mutates state without going through them.
emit();
