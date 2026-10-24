// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getPuzzle, subscribe, undo, redo, material, emit,
} from './store.js';
import { View } from './view.js';
import {
  renderInspector, renderBackdrop, renderActions, fillExportDialog, fillHelpDialog, h,
} from './ui.js';
import { puzzleToSvg } from './exportSvg.js';
import { puzzleToPdf } from './exportPdf.js';
import * as gallery from './designs.js';
import { signedIn } from './cloud.js';
import {
  UNTITLED, autoName, designParams, designMaterial, designExtra, readDesign,
} from './saved.js';

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
  // Start over is a new design: the next save must not overwrite the one that
  // was open, and the top bar must not keep showing its name.
  startOver: () => { gallery.forget(); els.name.value = state.name; },
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
  void saveAfterExport();
});

els.exportDlg.addEventListener('close', () => {
  const v = els.exportDlg.returnValue;
  // Every file that leaves saves the design too - after the layer split, say,
  // was changed in this dialog. Started first so that a download that fails
  // cannot take the save down with it; it does not wait, so WhatsApp's share
  // still runs inside the click.
  if (v === 'all' || v === 'pdf' || v === 'whatsapp') void gallery.saveQuietly(galleryStore);
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

// ---- saved designs -------------------------------------------------------
// The same as the other tools (Plak Box, Box Maker, Rehal...): Simpan and the
// "Reka bentuk saya" gallery in the top bar, and the design saves ITSELF to the
// account when Export opens and when a file is downloaded (Boss, 24 Oct 2026).
// Export already asks for a sign-in (/shared/export-gate.js), so by then there
// is a session. One design is updated where it stands, not a new entry each
// time.

/** What the gallery may see and change - narrow on purpose. */
const galleryStore = {
  name: () => (state.name && state.name !== UNTITLED ? state.name : autoName(state)),
  params: () => designParams(state),
  material: () => designMaterial(state),
  extra: () => designExtra(state),
  rename: (name) => {
    update((s) => { s.name = name === autoName(s) ? UNTITLED : name; }, { history: false });
    els.name.value = state.name;
    markSaved();
  },
  apply: (row) => applyDesign(row),
};

/** Open an account record: one undo step, and every control drawn again. */
function applyDesign(row) {
  const { state: d } = readDesign(row);
  update((s) => {
    s.params = d.params;
    s.material = d.material;
    s.splitLayers = d.splitLayers;
    s.name = d.name;
  }, { geometry: true });
  els.name.value = state.name;
  refresh();
}

const savedLine = $('#exportSaved');
async function saveAfterExport() {
  if (!signedIn()) { savedLine.hidden = true; return; }
  savedLine.hidden = false;
  savedLine.textContent = 'Menyimpan dalam "Reka bentuk saya"...';
  const ok = await gallery.saveQuietly(galleryStore);
  savedLine.textContent = ok
    ? `✓ Disimpan dalam "Reka bentuk saya" sebagai "${galleryStore.name()}" - buka semula bila-bila masa dari bar atas.`
    : 'Tak dapat simpan ke akaun kali ini. Fail tetap boleh dimuat turun.';
}

const dialogFiller = (build) => function fill(dlg) {
  const close = () => dlg.close();
  dlg.replaceChildren(build(h, galleryStore, close, () => fill(dlg)));
};
const fillSaveDialog = dialogFiller(gallery.saveDialogBody);
const fillFilesDialog = dialogFiller(gallery.filesDialogBody);
$('#saveBtn').addEventListener('click', () => { fillSaveDialog($('#saveDlg')); $('#saveDlg').showModal(); });
$('#filesBtn').addEventListener('click', () => { fillFilesDialog($('#filesDlg')); $('#filesDlg').showModal(); });

// The store emits on every mutation; the callers above already refresh, so this
// only has to catch anything that mutates state without going through them.
emit();

// Arriving from another tool's gallery: ?design=<id>. After the first paint, so
// the tool is usable even if the account is slow to answer; the parameter is
// dropped afterwards so a reload does not throw away the changes made since.
{
  const wanted = new URLSearchParams(location.search).get('design');
  if (wanted) {
    gallery.openById(galleryStore, wanted).finally(() => {
      const url = new URL(location.href);
      url.searchParams.delete('design');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    });
  }
}
