// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getResult, undo, redo, material,
} from './store.js';
import { loadFace, putFace } from './geom/text.js';
import { mirrorOf } from './geom/stand.js';
import { View } from './view.js';
import { View3D } from './view3d.js';
import {
  renderInspector, renderBackdrop, renderActions, renderWarnings,
  fillExportDialog, fillHelpDialog, rnd,
  fillSaveDialog, fillFilesDialog, saveQuietly, openDesignById,
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
  vAssembled: $('#vAssembled'),
  vFlat: $('#vFlat'),
  v3d: $('#v3d'),
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

/**
 * The 3D view is built the first time somebody asks for it, not at start-up.
 *
 * Two reasons, and the second is the important one. A WebGL context and a
 * megabyte of three.js are not worth paying for on a machine that only ever
 * uses the flat view - but more than that, creating the context can throw
 * outright on a machine with no working GL, and a name stand tool that cannot
 * draw a 2D outline because a 3D preview failed is a worse tool.
 */
let view3d = null;
let view3dFailed = false;
function ensure3d() {
  if (view3d || view3dFailed) return view3d;
  try {
    view3d = new View3D(els.stage3d);
  } catch {
    view3dFailed = true;
  }
  return view3d;
}

const rgb = (hex) => [
  (parseInt(hex.slice(1), 16) >> 16) & 255,
  (parseInt(hex.slice(1), 16) >> 8) & 255,
  parseInt(hex.slice(1), 16) & 255,
];

const hex2 = (ch) => `#${ch.map((c) => Math.max(0, Math.min(255, Math.round(c)))
  .toString(16).padStart(2, '0')).join('')}`;

/** A polished acrylic edge: the stock's own colour, a shade darker. */
const shadeHex = (hex, k) => hex2(rgb(hex).map((c) => (k >= 0 ? c + (255 - c) * k : c * (1 + k))));

/** Soot black, holding a trace of the stock so walnut and falcata still differ. */
const charColor = (hex) => hex2(rgb(hex).map((c) => 16 + c * 0.09));

/** Engraving reads dark on pale stock and pale on dark - black acrylic burns light. */
function burnColor(hex) {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 90 ? '#e8e2d8' : '#3a2a1c';
}

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
  // The backdrop lives on the stage, which is the parent of both panes, and the
  // 3D canvas is drawn with an alpha channel - so one gradient sits behind all
  // three views and the picker means the same thing in every one of them.
  els.stage.dataset.backdrop = state.backdrop;
  // Asking for 3D on a machine with no working GL falls back to the assembled
  // elevation rather than to an empty pane.
  const is3d = state.view === '3d' && ensure3d() != null;
  els.preview.hidden = is3d;
  els.stage3d.hidden = !is3d;

  if (is3d) {
    const m = material();
    view3d.build(r, {
      color: m.color,
      // Wood, MDF and card come off the bed with a charred edge; acrylic keeps
      // its own colour, just darker where the light does not reach.
      edge: m.char ? charColor(m.color) : shadeHex(m.color, -0.18),
      charred: !!m.char,
      grain: m.grain || 'wood',
      burn: burnColor(m.color),
      mirror: mirrorOf(state.params.letterFinish).color,
      backdrop: state.backdrop,
    });
    view3d.resize();
  } else {
    view.render(r, {
      mode: state.view === 'flat' ? 'flat' : 'assembled',
      sheetWidth: state.sheetWidth,
    });
  }

  const d = r.derived;
  const label = d.empty
    ? 'Type a name to begin'
    : `${rnd(d.baseW, 1)} x ${rnd(d.baseD, 1)} x ${rnd(d.standHeight, 1)} mm`;
  els.hint.textContent = is3d && !d.empty ? 'Drag to orbit, scroll to zoom' : label;
  els.hint.classList.add('show');
  els.readout.textContent = d.empty ? '' : label;
  renderWarnings(els.warnings);
  markSaved();
}

function refresh() {
  // Opening a saved design renames the project, and the box in the top bar has
  // to follow - but never while it is focused, or a rewrite would move the
  // cursor mid-word.
  if (document.activeElement !== els.name) els.name.value = state.name;
  drawPreview();
  renderInspector(els.inspector, ctx);
  renderBackdrop(els.backdrop, (id) => {
    update((s) => { s.backdrop = id; }, { history: false });
    refresh();
  });
  renderActions({ undoBtn: els.undo, redoBtn: els.redo });
  els.vAssembled.setAttribute('aria-selected', String(state.view === 'assembled'));
  els.vFlat.setAttribute('aria-selected', String(state.view === 'flat'));
  // A tab that cannot be shown should not be offered. If GL is missing the tool
  // quietly becomes the two-view tool it was before, rather than a three-view
  // tool with one view that does nothing.
  els.v3d.hidden = view3dFailed;
  els.v3d.setAttribute('aria-selected', String(state.view === '3d' && !view3dFailed));
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

  // Arrived from the gallery in another tool: ?design=<id> says which one to
  // open. After the first paint, so the tool is usable while it loads, and the
  // parameter is cleared afterwards so a refresh does not undo whatever has
  // been changed since.
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
els.v3d.addEventListener('click', () => setView('3d'));

// A hidden pane measures zero, so the observer inside View3D reports nothing
// useful while the 2D view is showing. Resizing the window then switching to 3D
// would leave a canvas the wrong size until something else nudged it.
window.addEventListener('resize', () => view3d?.resize());

$('#helpBtn').addEventListener('click', () => {
  fillHelpDialog(els.helpDlg);
  els.helpDlg.showModal();
});

$('#exportBtn').addEventListener('click', () => {
  fillExportDialog(els.exportDlg);
  els.exportDlg.showModal();
});

// The 3D scene is the one part of this tool a node test cannot reach, so leave a
// way to read it back from a browser. Behind a query flag, because a global
// handle on the store is a debugging tool and not part of the app.
if (new URLSearchParams(location.search).has('debug')) {
  window.__app = { state, refresh, getResult, view, get view3d() { return view3d; } };
}

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
// moment worth keeping. It updates whatever design is already open rather than
// adding another, or three exports in an afternoon leave three near-identical
// entries in the list.
//
// Hung on the click rather than on the dialog closing: a save must not be lost
// because the download threw on the line before it, and the close event is not
// dispatched the same way by every browser.
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

/**
 * The file itself, built but not yet handed anywhere. Split out because it is
 * now wanted twice: once to save to disk, once to send.
 */
function buildFile(kind) {
  const r = getResult();
  if (!r.panels.length) return null;
  const title = state.name || 'stand';
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  const base = (r.params.line1 || title).trim().replace(/[^\w-]+/g, '-').toLowerCase()
    || 'stand';

  // One file, even for a Plate 3D, which is cut from two sheets. What keeps the
  // mirror letters from being cut out of the plywood is not a second file but a
  // layer of their own: cut the board layer, change the sheet, cut that one.
  const opts = { title, sheetWidth: state.sheetWidth };
  const body = kind === 'pdf' ? toPdf(r.panels, opts) : toSvg(r.panels, opts);
  return { blob: new Blob([body], { type }), name: `${base}.${kind}`, type, result: r };
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
 * What the cutter needs to know, in the message rather than only in the file.
 * A Plate 3D is two materials, and that is the part that goes wrong if it is
 * left to be discovered by opening the drawing.
 */
function jobNote(r) {
  const p = r.params;
  const d = r.derived;
  const style = { silhouette: 'Cut-out', plate3d: 'Plate 3D' }[p.style] || 'Plate';
  const out = [
    `*${p.line1}*${p.line2 ? ` / ${p.line2}` : ''}`,
    `${style} - ${rnd(d.baseW, 1)} x ${rnd(d.standHeight, 1)} mm`,
    // "Custom material" is what the picker calls a board nobody named. On a
    // works order that reads like a specification when it is the absence of one.
    `Board: ${material().id === 'custom' ? '' : `${material().name} `}${rnd(p.thickness, 1)} mm`,
  ];
  if (r.panels.some((x) => x.material === 'mirror')) {
    out.push(`Name: ${mirrorOf(p.letterFinish).name} ${rnd(d.letterT, 1)} mm - cut the `
      + '"Cut (Mirror acrylic)" layer from that, everything else from the board, '
      + 'then glue the letters onto the scored guide.');
  }
  return out.join('\n');
}

/**
 * Hand the cut file to WhatsApp.
 *
 * Where the browser and the OS allow it, the file goes across attached. Where
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
  const file = buildFile('svg');
  if (!file) return;
  const text = jobNote(file.result);

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

export { putFace };
