// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getResult, undo, redo,
} from './store.js';
import { loadFace } from './geom/text.js';
import { View } from './view.js';
import {
  renderInspector, renderBackdrop, renderActions, fillExportDialog, fillHelpDialog,
  rnd, h,
} from './ui.js';
import { toSvg, toPdf } from './export.js';
import * as gallery from './designs.js';
import { signedIn } from './cloud.js';
import {
  autoName, designParams, designMaterial, designExtra, readDesign,
} from './saved.js';

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

const booted = boot();

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
  void saveAfterExport();
});

els.exportDlg.addEventListener('close', () => {
  const v = els.exportDlg.returnValue;
  // Every file that leaves saves the design too - after the first save, an
  // update of the same entry, so the account holds what was actually cut.
  if (v === 'svg' || v === 'pdf' || v === 'whatsapp') void gallery.saveQuietly(galleryStore);
  if (v === 'svg') download('svg');
  else if (v === 'pdf') download('pdf');
  else if (v === 'whatsapp') sendWhatsApp();
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

function buildFile(kind) {
  const r = getResult();
  if (!r.paths.length) return null;
  const title = state.name || 'text';
  const opts = { title, smooth: r.smooth };
  const body = kind === 'pdf'
    ? toPdf(r.paths, r.size, opts)
    : toSvg(r.paths, r.size, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  const base = title.trim().replace(/[^\w-]+/g, '-').toLowerCase() || 'text';

  return { blob: new Blob([body], { type }), name: `${base}.${kind}`, type };
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
  const lines = String(state.params.text || '').split(/\r?\n/).filter((l) => l.trim());
  return [
    `*${lines.join(' / ') || state.name || 'Text'}*`,
    `${rnd(r.size.width, 1)} x ${rnd(r.size.height, 1)} mm, ${r.paths.length} strokes`,
    'Single-line strokes - set the machine to Line or Engrave, never Fill.',
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

// ---- saved designs --------------------------------------------------------
// The same as the other tools (Box Maker, Plak Box, Rehal...): Simpan and
// "Reka bentuk saya" in the top bar, and the design saves itself to the account
// when Export is opened and when a file is downloaded. Export already asks for
// a sign-in (/shared/export-gate.js), so by then there is a session. One design
// is updated where it stands, not a new entry every time.

/** The top bar's placeholder: a design called this has no name of its own. */
const UNTITLED = 'Untitled text';

/** What a design is: the settings, not the preview backdrop or the outline. */
const design = () => ({ params: state.params, speed: state.speed });

/** What the gallery may see and change - narrow on purpose. */
const galleryStore = {
  name: () => (state.name && state.name !== UNTITLED ? state.name : autoName(design())),
  params: () => designParams(design()),
  material: () => designMaterial(design()),
  extra: () => designExtra(design()),
  // Accepting the automatic name keeps it automatic, so it follows the text.
  rename: (name) => {
    update((s) => { s.name = name === autoName(design()) ? UNTITLED : name; },
      { history: false });
    els.name.value = state.name;
  },
  apply: (row) => applyDesign(row),
};

function applyDesign(row) {
  const d = readDesign(row, faces.map((f) => f.id));
  // With history, so opening a design over unsaved work is one Undo away.
  update((s) => {
    s.params = d.state.params;
    s.speed = d.state.speed;
    s.name = d.name || UNTITLED;
  });
  els.name.value = state.name;
  refresh();
}

const savedLine = $('#exportSaved');
async function saveAfterExport() {
  // Nothing to cut, nothing worth keeping - and no empty entries in the list.
  if (!signedIn() || !getResult().paths.length) { savedLine.hidden = true; return; }
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

// Arriving from another tool's gallery: ?design=<id>. Once the faces are in,
// so the design's typeface is there to draw with and the tool is already usable
// if the account is slow to answer. The parameter is removed afterwards, so a
// reload does not throw away the changes made since.
{
  const wanted = new URLSearchParams(location.search).get('design');
  if (wanted) {
    booted.catch(() => {})
      .then(() => gallery.openById(galleryStore, wanted))
      .finally(() => {
        const url = new URL(location.href);
        url.searchParams.delete('design');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      });
  }
}
