// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getResult, undo, redo,
} from './store.js';
import { View } from './view.js';
import {
  renderInspector, renderBackdrop, renderActions, renderWarnings,
  fillExportDialog, fillHelpDialog, rnd, h,
} from './ui.js';
import { toSvg, toPdf } from './export.js';
import * as gallery from './designs.js';
import { signedIn } from './cloud.js';
import {
  UNTITLED, ownName, autoName, designParams, designMaterial, designExtra, readDesign,
} from './saved.js';

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
  void saveAfterExport();
});

// Each file taken away saves the design as well - on the click rather than on
// the dialog closing, so a save is not lost because the download threw on the
// line before it. Not awaited: WhatsApp's share sheet needs the click to still
// be a user gesture when it is asked for.
els.exportDlg.addEventListener('click', (event) => {
  const button = event.target.closest && event.target.closest('button');
  if (!button || !['svg', 'pdf', 'whatsapp'].includes(button.value)) return;
  void gallery.saveQuietly(galleryStore);
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
  if (r.derived.empty || !r.panels.length) return null;
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
  const d = r.derived;
  return [
    `*${String(r.params.text || '').slice(0, 120)}*`,
    `QR tag - ${d.modules} x ${d.modules} modules, level ${d.ecl}`,
    `${rnd(r.params.size, 1)} mm across, ${rnd(r.params.thickness, 1)} mm board`,
    'Black is the fill - set it to Fill or Scan, not Line.',
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

// ---- saved designs ---------------------------------------------------------
// The same as the other tools (Plak Box, Box Maker, Rehal...): Save and the
// "Reka bentuk saya" gallery in the top bar, and the design saves itself to the
// account when Export is opened and when a file is taken. Export already asks
// for a sign-in (/shared/export-gate.js), so by then there is a session. One
// design is updated where it stands rather than a new entry every time.

/** What the gallery may see and change - narrow on purpose. */
const galleryStore = {
  name: () => ownName(state) || autoName(state),
  params: () => designParams(state),
  material: () => designMaterial(state),
  extra: () => designExtra(state),
  // The automatic name stays automatic, so it follows the size and the link
  // when they change after saving.
  rename: (name) => {
    update((s) => { s.name = name === autoName(s) || !ownName({ name }) ? UNTITLED : name; },
      { history: false });
    els.name.value = state.name;
  },
  apply: (row) => applyDesign(row),
};

/**
 * Put a saved design on screen. One undo step, like any other change, so a
 * design opened by mistake is one Ctrl+Z away from the one that was there.
 */
function applyDesign(row) {
  const { state: d } = readDesign(row);
  update((s) => {
    s.params = d.params;
    s.scanSpeed = d.scanSpeed;
    s.lineInterval = d.lineInterval;
    s.name = d.name;
  });
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

// Arrived from the gallery in another tool: ?design=<id>. After the first
// paint, so the tool is usable while the account answers, and the parameter is
// cleared afterwards so a reload does not throw away what was changed since.
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
