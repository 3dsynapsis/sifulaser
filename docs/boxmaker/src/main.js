// Bootstraps the app and keeps the three views in sync with the store.

import {
  state, subscribe, update, getBox, currentPanel, decorFor, panelById,
  load, material, undo, redo, canUndo, canRedo, beginGesture, endGesture, clampDecor,
} from './store.js';
import { View3D } from './view3d.js';
import { View2D } from './view2d.js';
import { makeObject, measureText } from './geom/decor.js';
import { loadFont, preload } from './fonts.js';
import { exportSvg, exportPanel } from './exportSvg.js';
import { exportPdf } from './exportPdf.js';
import {
  renderFaces, renderInspector, openPopover, shapeMenu, emojiMenu, imageMenu,
  fillExportDialog, fillAssembleDialog, renderBackdrop,
  fillSaveDialog, fillFilesDialog, saveQuietly, openDesignById, rnd,
} from './ui.js';
import {
  readAsDataUrl, readAsText, svgTextToRings, glyphToDataUrl, imageSize,
} from './importArt.js';
import { bbox } from './geom/path.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  stage3d: $('#stage3d'),
  stage2d: $('#stage2d'),
  tools: $('#tools'),
  faces: $('#faces'),
  inspector: $('#inspector'),
  hint: $('#stageHint'),
  lidBtn: $('#lidBtn'),
  status: $('#status'),
  popover: $('#popover'),
  stage: document.querySelector('.stage'),
  backdrop: $('#backdropPick'),
  name: $('#projectName'),
  undo: $('#undoBtn'),
  redo: $('#redoBtn'),
  saveBtn: $('#saveBtn'),
  filesBtn: $('#filesBtn'),
  saveDlg: $('#saveDlg'),
  filesDlg: $('#filesDlg'),
  exportDlg: $('#exportDlg'),
  assembleDlg: $('#assembleDlg'),
};

load();
// A saved design comes back with whatever face was last being edited, and the
// initial state's 'front' does not exist in every style - the drawer cabinet has
// no front panel at all. Repair it once, here, before anything reads it.
clampDecor();
els.name.value = state.name;

const view3d = new View3D(els.stage3d, { onPickFace: (id) => openFace(id) });
const view2d = new View2D(els.stage2d, {
  select: (id) => update((s) => { s.selection = id; }, { history: false }),
  change: () => { markDirty(); refresh({ light: true }); },
  gestureStart: () => beginGesture(),
  gestureEnd: () => { endGesture(); markDirty(); },
});

let cameraPreset = 'persp';
let statusTimer = null;
function markDirty() {
  els.status.textContent = 'Saving…';
  els.status.classList.add('busy');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    els.status.textContent = 'Saved';
    els.status.classList.remove('busy');
  }, 600);
}

const ctx = {
  refresh: (opts) => refresh(opts),
  deleteSelected: () => deleteSelected(),
};

/**
 * What the button on the stage says. A drawer cabinet never opens or closes - it
 * has no lid - so naming the motion is the difference between a control that
 * reads as broken and one that reads as obvious.
 */
function lidBtnLabel() {
  const almari = state.params.style === 'almari';
  if (almari) return state.lidOpen ? 'Push them back in' : 'Pull the drawers out';
  return state.lidOpen ? 'Close the box' : 'Open the box';
}

function refresh(opts = {}) {
  // Opening a saved design renames the project, and the box in the top bar has
  // to follow - but never while it is focused, or a rewrite would move the
  // cursor mid-word.
  if (document.activeElement !== els.name) els.name.value = state.name;
  const box = getBox();
  const mat = material();

  document.querySelectorAll('.vt').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.view === state.view));
  });
  els.stage3d.hidden = state.view !== '3d';
  els.stage2d.hidden = state.view !== '2d';
  els.tools.hidden = state.view !== '2d';
  els.lidBtn.hidden = !(state.view === '3d' && state.params.style !== 'open');
  els.backdrop.hidden = state.view !== '3d';
  els.stage.dataset.backdrop = state.backdrop;
  renderBackdrop(els.backdrop, (id) => {
    update((s) => { s.backdrop = id; }, { history: false });
    refresh();
  });
  els.lidBtn.textContent = lidBtnLabel();
  els.undo.disabled = !canUndo();
  els.redo.disabled = !canRedo();

  if (state.view === '3d') {
    view3d.build(box, decorFor, {
      color: mat.color,
      edge: mat.char ? charColor(mat.color) : shadeHex(mat.color, -0.18),
      charred: !!mat.char,
      grain: mat.grain || 'wood',
      burn: burnColor(mat.color),
      backdrop: state.backdrop,
    });
    view3d.setLidOpen(state.lidOpen);
    view3d.resize();
    els.hint.textContent = 'Click a face to edit it in 2D';
    els.hint.classList.add('show');
  } else {
    els.hint.classList.remove('show');
    const panel = currentPanel();
    const active = document.activeElement;
    view2d.render(panel, decorFor(panel), state.selection, state.params);
    if (opts.keepFocus && document.contains(opts.keepFocus)) opts.keepFocus.focus();
    else if (active && active.tagName === 'INPUT' && document.contains(active)) active.focus();
  }

  if (opts.light) return; // mid-drag: skip the panels so focus and scroll survive

  renderBar();
  const keep = opts.keepFocus;
  renderInspector(els.inspector, ctx);
  if (keep) {
    const again = els.inspector.querySelector('textarea');
    if (again && keep.tagName === 'TEXTAREA') {
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    }
  }
}

/** Bottom bar only - cheap enough to redraw on its own after a camera change. */
function renderBar() {
  renderFaces(els.faces, {
    onFace: openFace,
    onCamera: (id) => {
      cameraPreset = id;
      view3d.setView(id);
      renderBar();
    },
    camera: cameraPreset,
  });
}

const rgb = (hex) => [
  (parseInt(hex.slice(1), 16) >> 16) & 255,
  (parseInt(hex.slice(1), 16) >> 8) & 255,
  parseInt(hex.slice(1), 16) & 255,
];

const hex2 = (ch) => `#${ch.map((c) => Math.max(0, Math.min(255, Math.round(c)))
  .toString(16).padStart(2, '0')).join('')}`;

function shadeHex(hex, k) {
  return hex2(rgb(hex).map((c) => (k >= 0 ? c + (255 - c) * k : c * (1 + k))));
}

/** Soot black, holding a trace of the stock so walnut and pine differ slightly. */
function charColor(hex) {
  return hex2(rgb(hex).map((c) => 16 + c * 0.09));
}

function burnColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum < 90 ? '#e8e2d8' : '#3a2a1c'; // engrave reads light on dark stock
}

function openFace(id) {
  update((s) => {
    s.face = id;
    s.view = '2d';
    s.selection = null;
  }, { history: false });
  view2d.fit();
  refresh();
}

function addObject(type, extra = {}) {
  const panel = currentPanel();
  const obj = makeObject(type, panel, extra);
  update((s) => {
    s.decor[panel.id].push(obj);
    s.selection = obj.id;
    s.view = '2d';
  });
  markDirty();
  refresh();
  return obj;
}

function deleteSelected() {
  if (!state.selection) return;
  update((s) => {
    const list = s.decor[s.face];
    const i = list.findIndex((o) => o.id === s.selection);
    if (i >= 0) list.splice(i, 1);
    s.selection = null;
  });
  markDirty();
  refresh();
}

// ------------------------------------------------------------------ tools
els.tools.addEventListener('click', async (e) => {
  const btn = e.target.closest('.tool');
  if (!btn) return;
  const tool = btn.dataset.tool;
  if (tool === 'text') {
    await loadFont('inter');
    const obj = addObject('text', { text: 'Your text' });
    const m = measureText(obj);
    update((s) => {
      const t = s.decor[s.face].find((o) => o.id === obj.id);
      t.w = m.w || t.w;
      t.h = m.h || t.h;
      const panel = currentPanel();
      t.x = panel.size.w / 2 - t.w / 2;
      t.y = panel.size.h / 2 - t.h / 2;
    }, { history: false });
    refresh();
  } else if (tool === 'shape') {
    openPopover(btn, shapeMenu((id) => {
      els.popover.hidden = true;
      addObject(id);
    }), els.popover);
  } else if (tool === 'emoji') {
    openPopover(btn, emojiMenu(async (glyph) => {
      els.popover.hidden = true;
      const src = glyphToDataUrl(glyph);
      addObject('image', { src, w: 24, h: 24, process: 'engrave-fill' });
    }), els.popover);
  } else if (tool === 'image') {
    openPopover(btn, imageMenu((file) => {
      els.popover.hidden = true;
      importFile(file);
    }), els.popover);
  } else if (tool === 'fit') {
    view2d.fit();
  } else if (tool === 'delete') {
    deleteSelected();
  }
});

async function importFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    alert('That file is over 10 MB. Shrink it first — the laser only needs the outline.');
    return;
  }
  const panel = currentPanel();
  if (file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml') {
    const text = await readAsText(file);
    const rings = svgTextToRings(text);
    if (!rings.length) {
      alert('No drawable shapes found in that SVG.');
      return;
    }
    const bb = bbox(rings.flat());
    const scale = Math.min(panel.size.w * 0.5 / (bb.w || 1), panel.size.h * 0.5 / (bb.h || 1));
    addObject('svg', {
      rings,
      w: (bb.w || 1) * scale,
      h: (bb.h || 1) * scale,
      process: 'engrave-line',
    });
    return;
  }
  const src = await readAsDataUrl(file);
  const size = await imageSize(src);
  const scale = Math.min(panel.size.w * 0.5 / size.w, panel.size.h * 0.5 / size.h);
  addObject('image', { src, w: size.w * scale, h: size.h * scale });
}

// ------------------------------------------------------------------ chrome
document.querySelectorAll('.vt').forEach((b) => {
  b.addEventListener('click', () => {
    update((s) => { s.view = b.dataset.view; }, { history: false });
    if (b.dataset.view === '2d') view2d.fit();
    refresh();
  });
});

els.lidBtn.addEventListener('click', () => {
  update((s) => { s.lidOpen = !s.lidOpen; }, { history: false });
  view3d.setLidOpen(state.lidOpen);
  els.lidBtn.textContent = lidBtnLabel();
});

els.undo.addEventListener('click', () => { undo(); clampDecor(); refresh(); });
els.redo.addEventListener('click', () => { redo(); clampDecor(); refresh(); });

els.name.addEventListener('input', () => {
  update((s) => { s.name = els.name.value; }, { history: false });
  markDirty();
});

$('#assembleBtn').addEventListener('click', () => {
  fillAssembleDialog(els.assembleDlg);
  els.assembleDlg.showModal();
});

$('#exportBtn').addEventListener('click', () => {
  fillExportDialog(els.exportDlg, getBox());
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
  if (v === 'all') downloadAll();
  else if (v === 'pdf') downloadAllPdf();
  else if (v === 'whatsapp') sendWhatsApp();
  else if (v === 'panel') downloadPanel();
});

// Exporting is the moment somebody decides a box is finished, so it is the
// moment worth keeping. It updates whatever design is already open rather than
// adding another.
//
// On the click rather than on the dialog closing: a save must not be lost
// because the download threw on the line before it, and the close event is not
// dispatched the same way by every browser.
els.exportDlg.addEventListener('click', (event) => {
  const button = event.target.closest && event.target.closest('button');
  if (!button) return;
  if (!['all', 'pdf', 'whatsapp', 'panel'].includes(button.value)) return;
  void saveQuietly();
});

function download(name, text, type = 'image/svg+xml') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadAll() {
  const labels = $('#labelsChk').checked;
  const files = exportSvg(getBox(), decorFor, { sheet: state.sheet, labels });
  const base = (state.name || 'box').trim().replace(/[^\w-]+/g, '-').toLowerCase() || 'box';
  files.forEach((f, i) => {
    setTimeout(() => download(
      files.length > 1 ? `${base}-sheet${i + 1}.svg` : `${base}.svg`, f.svg), i * 200);
  });
}

function downloadAllPdf() {
  const labels = $('#labelsChk').checked;
  const files = exportPdf(getBox(), decorFor, { sheet: state.sheet, labels });
  const base = (state.name || 'box').trim().replace(/[^\w-]+/g, '-').toLowerCase() || 'box';
  files.forEach((f, i) => {
    setTimeout(() => download(
      files.length > 1 ? `${base}-sheet${i + 1}.pdf` : `${base}.pdf`,
      f.pdf, 'application/pdf'), i * 200);
  });
}

/**
 * What the person cutting this needs to know, in the message rather than only
 * in the file. They may well open it on a phone, hours later, without the tool
 * in front of them - and a box that arrives without its board thickness is a
 * box that gets cut on the wrong board.
 */
function boxNote(files) {
  const box = getBox();
  const p = box.params;
  const art = files.reduce((n, f) => n + f.art, 0);
  // The size somebody will measure, which is not always the size that was typed:
  // a lift-off lid rides outside the walls, and the drawer cabinet's screw-joint
  // fingers stand proud at the back. This sentence has a twin in ui.js's export
  // dialog - change one and the SVG dialog and the WhatsApp message disagree
  // about the same box.
  const a = box.derived.almari;
  const size = box.derived.lid
    ? `${rnd(box.derived.lid.outerL, 1)} x ${rnd(box.derived.lid.outerW, 1)} `
      + `x ${p.height} mm overall`
    : a && a.outerW > p.width
      // "overall", not "outside": the twin in ui.js says overall, and a customer
      // reads the two side by side.
      ? `${p.length} x ${rnd(a.outerW, 1)} x ${p.height} mm overall `
        + '(the screw fingers stand proud at the back)'
      : `${p.length} x ${p.width} x ${p.height} mm outside`;
  const out = [
    `*${state.name || 'Box'}*`,
    size,
    `${box.panels.length} panels on ${p.thickness} mm board, kerf ${p.kerf} mm`,
    'Kerf and fit are already in the paths - cut as-is.',
  ];
  // The one measurement a drawer cabinet needs and its outside size cannot give.
  if (a?.drawer) {
    const i = a.drawer.inner;
    out.push(`Drawer inside: ${rnd(i.l, 1)} x ${rnd(i.w, 1)} x ${rnd(i.h, 1)} mm`
      + (a.tingkat === 1 ? '.' : `, ${a.tingkat} of them.`));
  }
  if (files.length > 1) out.push(`${files.length} sheets.`);
  // Said out loud, because it is the one thing in the box that the PDF cannot
  // carry and nobody would think to check for.
  if (art) {
    out.push(`${art} placed image${art === 1 ? '' : 's'} `
      + `${art === 1 ? 'is' : 'are'} not in the PDF - ask for the SVG for those.`);
  }
  return out.join('\n');
}

/**
 * Hand the cut files to WhatsApp.
 *
 * PDF rather than SVG: WhatsApp treats a PDF as a document anyone can open,
 * while an SVG arrives as a file most phones will not preview.
 *
 * Where the browser and the OS allow it the files go across attached - all the
 * sheets at once, because half a box is not a box. Where they do not, which is
 * most desktops, nothing can push a file into WhatsApp through a link: wa.me
 * and the whatsapp: scheme carry text and nothing else. So the fallback saves
 * the sheets and opens WhatsApp with the job written out.
 *
 * canShare is checked synchronously, before anything is awaited. Past an await
 * the click is no longer a user gesture and the browser blocks the window.
 */
function sendWhatsApp() {
  const labels = $('#labelsChk').checked;
  const sheets = exportPdf(getBox(), decorFor, { sheet: state.sheet, labels });
  if (!sheets.length) return;
  const base = (state.name || 'box').trim().replace(/[^\w-]+/g, '-').toLowerCase() || 'box';
  const files = sheets.map((f, i) => ({
    name: sheets.length > 1 ? `${base}-sheet${i + 1}.pdf` : `${base}.pdf`,
    blob: new Blob([f.pdf], { type: 'application/pdf' }),
    art: f.art,
  }));
  const text = boxNote(files);

  let shareable = null;
  try {
    const fs = files.map((f) => new File([f.blob], f.name, { type: 'application/pdf' }));
    if (navigator.canShare && navigator.canShare({ files: fs })) shareable = fs;
  } catch {
    shareable = null;
  }

  if (shareable) {
    navigator.share({ files: shareable, text }).catch(() => {});
    return;
  }

  // The pdf text, not the blob: download() wraps whatever it is given in a Blob
  // of its own, and a Blob inside a Blob is a confusing way to write the same
  // bytes.
  files.forEach((f, i) => setTimeout(
    () => download(f.name, sheets[i].pdf, 'application/pdf'), i * 200));
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

function downloadPanel() {
  const panel = currentPanel();
  const svg = exportPanel(panel, decorFor(panel), { labels: false });
  const base = (state.name || 'box').trim().replace(/[^\w-]+/g, '-').toLowerCase() || 'box';
  download(`${base}-${panel.id}.svg`, svg);
}

// --------------------------------------------------------------- shortcuts
window.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    clampDecor();
    refresh();
    return;
  }
  if (typing) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
  } else if (e.key === 'Escape') {
    update((s) => { s.selection = null; }, { history: false });
    refresh();
  } else if (e.key === 'f') {
    if (state.view === '2d') view2d.fit(); else view3d.frame();
  } else if (state.selection && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 5 : 0.5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    update((s) => {
      const o = s.decor[s.face].find((x) => x.id === s.selection);
      if (o) { o.x += d[0]; o.y += d[1]; }
    });
    refresh();
  }
});

subscribe(() => {
  els.undo.disabled = !canUndo();
  els.redo.disabled = !canRedo();
});

if (new URLSearchParams(location.search).has('debug')) {
  window.__app = { state, refresh, addObject, deleteSelected, view2d, view3d, getBox };
}

preload().then(() => refresh());
refresh();
window.addEventListener('resize', () => view3d.resize());
