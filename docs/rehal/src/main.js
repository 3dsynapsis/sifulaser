// Wiring: store -> preview + inspector, and the toolbar actions.

import {
  state, load, update, getResult, undo, redo, material, lastBuildMs,
} from './store.js';
import { loadFace } from './geom/text.js';
import { View2D } from './view2d.js';
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

const view2d = new View2D(els.preview);
// Made on first use in drawPreview: a WebGL context is not free, and somebody
// who lands on the cut file and exports never needs one.
let view3d = null;

const ctx = {
  faces: [],
  refresh: () => refresh(),
  refreshPreviewOnly: () => schedulePreview(),
};

let statusTimer = null;
function markSaved() {
  els.status.textContent = 'Menyimpan...';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = 'Disimpan'; }, 400);
}

/**
 * How the preview follows a slider.
 *
 * A rehal costs between a tenth and six tenths of a second to build - a
 * distance field over the whole panel, traced, then walked twice by the
 * connectivity prover. Rebuilding on every pointer event would spend the whole
 * drag inside the builder and the slider would stop moving under the finger.
 *
 * So: coalesce to one animation frame, which is what the other tools do, AND
 * measure. Once a build has been seen to cost more than a frame's worth of
 * patience, the scheduler stops chasing the drag and waits for a short pause
 * instead. The picture then arrives a moment after you stop moving rather than
 * fighting you while you move - which is the honest trade, because a preview
 * that eats the pointer events is worse than one that is slightly late.
 */
const SLOW_MS = 120;
let queued = false;
let pauseTimer = null;

function schedulePreview() {
  if (lastBuildMs() > SLOW_MS) {
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { drawPreview(); }, 90);
    return;
  }
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; drawPreview(); });
}

function drawPreview() {
  clearTimeout(pauseTimer);
  const r = getResult();
  // The backdrop lives on the stage, so one gradient sits behind both views and
  // the picker means the same thing in either.
  els.stage.dataset.backdrop = state.backdrop;
  const m = material();
  const acrylic = m.id.startsWith('acr');
  const is3d = state.view === '3d';
  els.stage3d.hidden = !is3d;
  els.preview.hidden = is3d;
  if (is3d) {
    if (!view3d) view3d = new View3D(els.stage3d);
    view3d.build(r, {
      color: m.colour,
      backdrop: state.backdrop,
      charred: !acrylic,
      grain: m.id.startsWith('mdf') ? 'mdf' : acrylic ? 'acrylic' : 'wood',
      showBook: state.showBook,
    });
  } else {
    view2d.render(r);
  }

  const d = r.derived;
  els.hint.textContent =
    `${rnd(d.overall[0], 0)} x ${rnd(d.overall[1], 0)} x ${rnd(d.overall[2], 0)} mm`
    + ` · ${rnd(r.stability.mass, 2)} kg dengan Quran`;
  els.hint.classList.add('show');
  els.readout.textContent = `${rnd(d.overall[0], 0)} x ${rnd(d.overall[1], 0)} mm`;
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
  els.vFlat.setAttribute('aria-selected', String(state.view === 'flat'));
}

/**
 * Thirty-three faces is well over a megabyte of glyph data. Only the one in use
 * is fetched at start-up; the picker fetches the rest of a group when you open
 * it, so the first paint does not wait on faces nobody looked at.
 */
async function boot() {
  const res = await fetch(new URL('./font/index.json', import.meta.url));
  ctx.faces = await res.json();
  refresh();
  await loadFace(state.params.faceId).catch(() => null);
  refresh();

  // Arrived from the gallery in another tool: ?design=<id> says which one to
  // open. Done after the first paint so the tool is already usable if the fetch
  // is slow, and the parameter is cleared afterwards so a refresh does not undo
  // whatever has been changed since.
  const wanted = new URLSearchParams(location.search).get('design');
  if (wanted) {
    const opened = await openDesignById(wanted);
    if (opened) {
      await loadFace(state.params.faceId).catch(() => null);
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
  update((s) => { s.name = els.name.value.trim() || 'Rehal tanpa nama'; },
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
els.vFlat.addEventListener('click', () => setView('flat'));

// The one part of this tool a node test cannot see is the drawing, so leave a
// way to read the store back from a browser. Behind a query flag, because a
// global handle on the store is a debugging tool and not part of the app.
if (new URLSearchParams(location.search).has('debug')) {
  window.__app = { state, refresh, getResult, view2d, view3d: () => view3d };
}

$('#helpBtn').addEventListener('click', () => {
  fillHelpDialog(els.helpDlg);
  els.helpDlg.showModal();
});

$('#exportBtn').addEventListener('click', () => {
  fillExportDialog(els.exportDlg, ctx);
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
  // The full prover, again, on the way out. getResult memoises it against the
  // parameters the Export dialog already asked for, so this is free - and it
  // means the file that lands on disk is the one that was checked, not a
  // cheaper build that happens to share its settings.
  const r = getResult({ verify: 'all' });
  if (!r.panels.length) return null;
  const title = state.name || 'rehal';
  const opts = { title, sheetWidth: 900 };
  const body = kind === 'pdf' ? toPdf(r.panels, opts) : toSvg(r.panels, opts);
  const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml';
  // Named after the name engraved on it, which is what somebody wants it
  // called when six of them are sitting in a downloads folder.
  const base = String(r.params.name || title).trim()
    .replace(/[^\w-]+/g, '-').toLowerCase() || 'rehal';

  return { blob: new Blob([body], { type }), name: `${base}-rehal.${kind}`, type };
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
 * The measured thickness is in here because it is the one number that cannot be
 * read off the drawing and the one that decides whether the tenons go home:
 * nominal 9 mm ply runs 8.5 to 9.5, which is wider than the whole clearance.
 */
function jobNote() {
  const r = getResult();
  const d = r.derived;
  const out = [
    `*${String(r.params.name || '').trim() || state.name || 'Rehal'}*`,
    `Rehal - ${rnd(d.overall[0], 0)} x ${rnd(d.overall[1], 0)} x ${rnd(d.overall[2], 0)} mm`,
    `${d.pieces} kepingan, ${material().name}`,
    `Papan diukur ${rnd(r.params.measuredThickness, 2)} mm - tanggam dipotong untuk ini`,
    `${rnd(d.cutLengthMm / 1000, 1)} m potongan`,
  ];
  if (r.panels.some((p) => (p.engrave || []).length || (p.engraveFill || []).length)) {
    out.push('Ukir dahulu, potong kemudian. Lapisan: merah potong, biru garis, hitam isi.');
  } else {
    out.push('Semuanya potongan, tiada ukiran.');
  }
  if (r.stability.verdict !== 'ok') {
    out.push(`AWAS: margin condong ${rnd(r.stability.phiBack, 1)} darjah.`);
  }
  return out.join('\n');
}

/**
 * Hand the cut file to WhatsApp.
 *
 * PDF rather than SVG: WhatsApp treats a PDF as a document anyone can open,
 * while an SVG arrives as a file most phones will not preview and some clients
 * refuse outright.
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
