// Wiring: store -> preview + inspector, and the toolbar actions.

import { state, load, update, getResult, undo, redo, material } from './store.js';
import { loadFace } from './geom/text.js';
import { View } from './view.js';
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
  stage3dLoading: $('#stage3dLoading'),
  inspector: $('#inspector'),
  backdrop: $('#backdropPick'),
  warnings: $('#warnings'),
  hint: $('#stageHint'),
  readout: $('#sizeReadout'),
  status: $('#status'),
  name: $('#projectName'),
  undo: $('#undoBtn'),
  redo: $('#redoBtn'),
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
 * The 3D view is fetched and built the first time somebody asks for it, not at
 * start-up.
 *
 * Two reasons, and the second is the one that matters. A WebGL context and a
 * megabyte of three.js are not worth paying for on a machine that only ever
 * looks at the cake - so view3d.js, and the vendor files it pulls in, come in
 * through a dynamic import rather than a static one. A static import would put
 * them in this module's own graph, which means they are fetched on every load
 * whether or not the tab is ever touched, and a vendor file that 404s or fails
 * to parse takes main.js down with it - no views at all, not even the flat one.
 *
 * The second reason is that creating the context can throw outright where there
 * is no working GL, and a topper tool that cannot draw a flat outline because a
 * 3D preview failed is a worse tool than one with two views. Either failure -
 * the fetch or the context - lands in the same place: the tab hides itself, the
 * view falls back to the cake, and the other two carry on.
 */
let view3d = null;
let view3dFailed = false;
let view3dLoading = false;
function ensure3d() {
  if (view3d || view3dFailed || view3dLoading) return view3d;
  view3dLoading = true;
  import('./view3d.js')
    .then(({ View3D }) => { view3d = new View3D(els.stage3d); })
    .catch(() => { view3dFailed = true; })
    .then(() => { view3dLoading = false; refresh(); });
  return null;
}

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
  // The backdrop lives on the stage, which is the parent of both panes, and the
  // 3D canvas is drawn with an alpha channel - so one gradient sits behind all
  // three views and the picker means the same thing in every one of them.
  els.stage.dataset.backdrop = state.backdrop;
  // Asking for 3D on a machine with no working GL falls back to the cake rather
  // than to an empty pane - and puts the *state* back to the cake, not just the
  // drawing. A view the tool has given up on cannot be left as the chosen one:
  // the tab strip is rendered from state.view, so leaving it at '3d' with the
  // 3D tab hidden shows a segmented control with nothing selected, on every
  // refresh, for the rest of the session.
  if (state.view === '3d' && view3dFailed) {
    update((s) => { s.view = 'flat'; }, { history: false });
  }
  // "3D is not here yet" and "3D is never coming" are different states, and
  // treating them as one is what made this tool look like it opened on the
  // wrong tab. The module is about a megabyte, so on a cold load there is a
  // real gap between asking for 3D and having it - and in that gap the cake
  // view was being painted, in full, only to be replaced a second later.
  // Somebody watching that sees the flat view appear and reasonably reports
  // it as the tool ignoring the 3D tab.
  //
  // So: while it is on the wire, show neither drawing. The failure path is
  // unchanged - view3dFailed above has already put the state back to flat by
  // the time we get here, so `want3d` is false and the cake view returns.
  const want3d = state.view === '3d' && !view3dFailed;
  const is3d = want3d && ensure3d() != null;
  els.preview.hidden = want3d;
  els.stage3d.hidden = !is3d;
  els.stage3dLoading.hidden = !(want3d && !is3d);

  const m = material();
  if (is3d) {
    view3d.build(r, {
      color: m.color,
      finish: m.finish || 'none',
      backdrop: state.backdrop,
    });
    view3d.resize();
  } else if (!want3d) {
    view.render(r, {
      mode: state.view === 'flat' ? 'flat' : 'cake',
      // Clear acrylic has no colour to paint flat, so the cake view keeps its
      // own neutral rather than showing a pale blue topper.
      color: state.view === 'flat' || m.finish === 'clear' ? null : m.color,
    });
  }

  const d = r.derived;
  const label = d.empty
    ? 'Type a message to begin'
    : `${rnd(d.width / 10, 1)} x ${rnd(d.height / 10, 1)} cm`;
  els.hint.textContent = is3d && !d.empty ? 'Drag to orbit, scroll to zoom' : label;
  els.hint.classList.add('show');
  els.readout.textContent = d.empty ? '' : label;
  renderWarnings(els.warnings);
  markSaved();
}

function refresh() {
  drawPreview();
  // Opening a saved design renames the project, and the box in the top bar
  // has to follow. Never while it is focused: refresh runs on every
  // keystroke elsewhere, and rewriting the field under a cursor would move
  // it to the end mid-word.
  if (document.activeElement !== els.name) els.name.value = state.name;
  renderInspector(els.inspector, ctx);
  renderBackdrop(els.backdrop, (id) => {
    update((s) => { s.backdrop = id; }, { history: false });
    refresh();
  });
  renderActions({ undoBtn: els.undo, redoBtn: els.redo });
  // The cake view is retired from the tab strip: the 3D preview answers the
  // same question better, and two pictures of one object is one too many. The
  // drawing code stays - it is still what the 2D preview falls back to when
  // there is no working GL, tools/samples.mjs renders with it, and it is under
  // test - it simply has no tab any more.
  els.vFlat.setAttribute('aria-selected', String(state.view === 'flat'));
  // A tab that cannot be shown should not be offered. With no working GL the
  // tool quietly becomes the two-view tool it was before, rather than a
  // three-view tool with one view that does nothing.
  els.v3d.hidden = view3dFailed;
  els.v3d.setAttribute('aria-selected', String(state.view === '3d' && !view3dFailed));
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
  // open. Done after the first paint so the tool is already usable if the
  // fetch is slow, and the parameter is cleared afterwards so a refresh does
  // not undo whatever has been changed since.
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
els.vFlat.addEventListener('click', () => setView('flat'));
els.v3d.addEventListener('click', () => setView('3d'));

// A hidden pane measures zero, so the observer inside View3D reports nothing
// useful while a 2D view is showing. Resizing the window and then switching to
// 3D would otherwise leave a canvas the wrong size until something nudged it.
window.addEventListener('resize', () => view3d?.resize());

// The 3D scene and the framing of the cake view are the two parts of this tool
// a node test cannot see, so leave a way to read them back from a browser.
// Behind a query flag, because a global handle on the store is a debugging tool
// and not part of the app.
if (new URLSearchParams(location.search).has('debug')) {
  window.__app = {
    state, refresh, getResult, view, get view3d() { return view3d; },
  };
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
// close event is not dispatched the same way everywhere - the browser used to
// test this does not fire it at all - which is a poor thing for the only copy
// of a design to depend on.
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
  const title = state.name || 'topper';
  const opts = { title, sheetWidth: 900 };
  const body = kind === 'pdf' ? toPdf(r.panels, opts) : toSvg(r.panels, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  // The name is usually the last line, which is what somebody wants the file
  // called - not "Happy".
  const lines = String(r.params.text || title).split(/\r?\n/).filter((l) => l.trim());
  const base = (lines[lines.length - 1] || title).trim()
    .replace(/[^\w-]+/g, '-').toLowerCase() || 'topper';

  return { blob: new Blob([body], { type }), name: `${base}-topper.${kind}`, type };
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
  const first = String(r.params.text || '').split(/\r?\n/).filter((l) => l.trim());
  return [
    `*${first.join(' / ') || state.name || 'Cake topper'}*`,
    `Cake topper - ${rnd(d.width, 1)} x ${rnd(d.height, 1)} mm`,
    `${rnd(r.params.thickness, 1)} mm ${material().name}`,
    'All cut, nothing to engrave.',
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

