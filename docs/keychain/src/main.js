// Wiring: store -> preview + inspector, and the toolbar actions.

import { state, load, update, getResult, undo, redo, material } from './store.js';
import { loadFace } from './geom/text.js';
import { MIN_NECK } from './geom/keychain.js';
import { View, burnFor } from './view.js';
import { View3D } from './view3d.js';
import {
  renderInspector, renderBackdrop, renderActions, renderWarnings,
  fillExportDialog, fillHelpDialog, fillSaveDialog, fillFilesDialog,
  saveQuietly, openDesignById, rnd,
} from './ui.js';
import { toSvg, toPdf } from './export.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  stage: $('#stage'),
  preview: $('#stagePreview'),
  stage3d: $('#stage3d'),
  inspector: $('#inspector'),
  backdrop: $('#backdropPick'),
  warnings: $('#warnings'),
  hint: $('#stageHint'),
  readout: $('#sizeReadout'),
  status: $('#status'),
  name: $('#projectName'),
  undo: $('#undoBtn'),
  redo: $('#redoBtn'),
  v3d: $('#v3d'),
  vPiece: $('#vPiece'),
  vFlat: $('#vFlat'),
  saveBtn: $('#saveBtn'),
  filesBtn: $('#filesBtn'),
  saveDlg: $('#saveDlg'),
  filesDlg: $('#filesDlg'),
  exportDlg: $('#exportDlg'),
  helpDlg: $('#helpDlg'),
};

load();
els.name.value = state.name;

const view = new View(els.preview);
// Made on first use in drawPreview: a WebGL context is not free, and
// somebody who lands on the cut file and exports never needs one.
let view3d = null;

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

// Tracing a distance field is a few tens of milliseconds, which is enough to be
// felt on every keystroke. One frame of coalescing keeps typing smooth without
// the preview ever falling further behind than that.
let queued = false;
function schedulePreview() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; drawPreview(); });
}

function drawPreview() {
  const r = getResult();
  // The backdrop lives on the stage, so one gradient sits behind both views and
  // the picker means the same thing in either.
  els.stage.dataset.backdrop = state.backdrop;
  const m = material();
  // Clear acrylic has no colour of its own to paint, so the board keeps the
  // stylesheet's neutral rather than being washed pale blue - which means the
  // engraving has to be worked out against that neutral instead, and the
  // neutral is whichever backdrop is showing.
  const clear = m.id === 'acrylic-clear';
  const d0 = r.derived;
  const board = clear ? (state.backdrop === 'dark' ? '#7c828c' : '#e6e9ef') : m.color;
  const is3d = state.view === '3d';
  els.stage3d.hidden = !is3d;
  els.preview.hidden = is3d;
  if (is3d) {
    if (!view3d) {
      // Made on first use. A WebGL context is not free, and somebody who lands
      // on the cut file and exports never needs one.
      view3d = new View3D(els.stage3d);
    }
    view3d.build(r, {
      color: clear ? null : m.color,
      burn: burnFor(board),
      thickness: m.t,
      dark: state.backdrop === 'dark',
      ring: d0.holeAt
        ? {
          x: d0.holeAt[0], y: d0.holeAt[1], holeR: d0.holeR,
          r: Math.max(3.5, d0.holeR * 2.2), end: state.params.holeEnd,
        }
        : null,
    });
  }
  view.render(r, {
    mode: state.view === 'flat' ? 'flat' : 'piece',
    color: clear ? null : m.color,
    burn: burnFor(board),
    showWeak: true,
    minNeck: MIN_NECK,
  });

  const d = r.derived;
  const label = d.empty
    ? 'Type a name to begin'
    : `${rnd(d.width, 1)} x ${rnd(d.height, 1)} mm`;
  els.hint.textContent = label;
  els.hint.classList.add('show');
  els.readout.textContent = d.empty ? '' : label;
  renderWarnings(els.warnings);
  markSaved();
}

function refresh() {
  drawPreview();
  // Opening a saved design renames the project, and the box in the top bar has
  // to follow. Never while it is focused: refresh runs on every keystroke
  // elsewhere, and rewriting the field under a cursor would move it to the end
  // mid-word.
  if (document.activeElement !== els.name) els.name.value = state.name;
  renderInspector(els.inspector, ctx);
  renderBackdrop(els.backdrop, (id) => {
    update((s) => { s.backdrop = id; }, { history: false });
    refresh();
  });
  renderActions({ undoBtn: els.undo, redoBtn: els.redo });
  els.v3d.setAttribute('aria-selected', String(state.view === '3d'));
  els.vPiece.setAttribute('aria-selected', String(state.view === 'piece'));
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

  // Arrived from the gallery in another tool: ?design=<id> says which one to
  // open. Done after the first paint so the tool is already usable if the fetch
  // is slow, and the parameter is cleared afterwards so a refresh does not undo
  // whatever has been changed since.
  const wanted = new URLSearchParams(location.search).get('design');
  if (wanted) {
    const opened = await openDesignById(wanted);
    if (opened) {
      await loadFace(state.params.face).catch(() => null);
      els.name.value = state.name;
      refresh();
    }
    const url = new URL(location.href);
    url.searchParams.delete('design');
    history.replaceState(null, '', url.pathname + url.search);
  }
}

boot();

els.name.addEventListener('change', () => {
  update((s) => { s.name = els.name.value.trim() || 'Untitled keychain'; },
    { history: false });
  markSaved();
});

els.undo.addEventListener('click', () => { undo(); els.name.value = state.name; refresh(); });
els.redo.addEventListener('click', () => { redo(); els.name.value = state.name; refresh(); });

const setView = (v) => {
  update((s) => { s.view = v; }, { history: false });
  refresh();
};
els.v3d.addEventListener('click', () => setView('3d'));
els.vPiece.addEventListener('click', () => setView('piece'));
els.vFlat.addEventListener('click', () => setView('flat'));

// The one part of this tool a node test cannot see is the drawing, so leave a
// way to read the store back from a browser. Behind a query flag, because a
// global handle on the store is a debugging tool and not part of the app.
if (new URLSearchParams(location.search).has('debug')) {
  window.__app = { state, refresh, getResult, view };
}

$('#helpBtn').addEventListener('click', () => {
  fillHelpDialog(els.helpDlg);
  els.helpDlg.showModal();
});

$('#exportBtn').addEventListener('click', () => {
  fillExportDialog(els.exportDlg);
  els.exportDlg.showModal();
});

els.saveBtn.addEventListener('click', () => {
  fillSaveDialog(els.saveDlg, ctx);
  els.saveDlg.showModal();
});

els.filesBtn.addEventListener('click', () => {
  fillFilesDialog(els.filesDlg, ctx);
  els.filesDlg.showModal();
});

els.exportDlg.addEventListener('close', () => {
  const v = els.exportDlg.returnValue;
  if (v === 'svg') download('svg');
  else if (v === 'pdf') download('pdf');
  else if (v === 'whatsapp') sendWhatsApp();
});

// Exporting is the moment somebody decides a design is finished, so it is the
// moment worth keeping - and they are signed in by then, because the download
// asked them to be. It updates whatever design is already open rather than
// adding another, or three exports in an afternoon leave three near-identical
// entries in the list.
//
// Hung on the click rather than on the dialog closing, for two reasons. A save
// must not be lost because the download threw on the line before it. And the
// close event is not dispatched the same way everywhere, which is a poor thing
// for the only copy of a design to depend on.
els.exportDlg.addEventListener('click', (event) => {
  const button = event.target.closest && event.target.closest('button');
  if (!button) return;
  if (!['svg', 'pdf', 'whatsapp'].includes(button.value)) return;
  void saveQuietly();
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
  if (!r.panels.length) return null;
  const title = state.name || 'keychain';
  const opts = { title, sheetWidth: 900 };
  const body = kind === 'pdf' ? toPdf(r.panels, opts) : toSvg(r.panels, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  // The file is named after the name on the keychain, which is what somebody
  // wants it called when six of them are sitting in a downloads folder.
  const lines = String(r.params.text || title).split(/\r?\n/).filter((l) => l.trim());
  const base = (lines[0] || title).trim()
    .replace(/[^\w-]+/g, '-').toLowerCase() || 'keychain';

  return { blob: new Blob([body], { type }), name: `${base}-keychain.${kind}`, type };
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
 *
 * The hole size is in here because it is the one number that cannot be read off
 * the drawing at a glance and the one that decides whether the split ring in
 * the drawer actually fits.
 */
function jobNote() {
  const r = getResult();
  const d = r.derived;
  const lines = String(r.params.text || '').split(/\r?\n/).filter((l) => l.trim());
  const out = [
    `*${lines.join(' / ') || state.name || 'Keychain'}*`,
    `Keychain - ${rnd(d.width, 1)} x ${rnd(d.height, 1)} mm`,
    `${rnd(r.params.thickness, 1)} mm ${material().name}`,
    `${rnd(r.params.holeD, 1)} mm hole for the split ring`,
  ];
  if (d.engraveFill || d.engraveLine) {
    out.push('Engrave first, then cut. Layers: red cut, blue line, black fill.');
  } else {
    out.push('All cut, nothing to engrave.');
  }
  if (d.loose) out.push(`${d.loose} small piece(s) drop out of the sheet.`);
  return out.join('\n');
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
    // Cancelling the share sheet rejects; that is a choice, not a failure, so
    // it must not then go and open a second thing behind them.
    navigator.share({ files: [shareable], text }).catch(() => {});
    return;
  }

  saveFile(file);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
