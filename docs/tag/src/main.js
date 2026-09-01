// Bootstraps the app and keeps the preview in sync with the store.

import {
  state, subscribe, update, getTag, currentPiece, decorFor, load, material,
  undo, redo, canUndo, canRedo, beginGesture, endGesture, clampDecor,
} from './store.js';
import { View2D } from './view2d.js';
import { makeObject, measureText } from './geom/decor.js';
import { bbox, simplify } from './geom/path.js';
import { loadFont, preload } from './fonts.js';
import { exportSvg, pieceToSvg } from './exportSvg.js';
import { exportPdf } from './exportPdf.js';
import { clipartSvg } from './clipart.js';
import { readAsText, svgTextToRings } from './importArt.js';
import {
  renderInspector, renderSides, openPopover, shapeMenu, clipartMenu, importMenu,
  fillExportDialog, fillAssembleDialog, fillSaveDialog, fillFilesDialog,
  saveQuietly, openDesignById, rnd,
} from './ui.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  stage2d: $('#stage2d'),
  tools: $('#tools'),
  sides: $('#sides'),
  inspector: $('#inspector'),
  status: $('#status'),
  popover: $('#popover'),
  readout: $('#sizeReadout'),
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
els.name.value = state.name;

const view2d = new View2D(els.stage2d, {
  select: (id) => { update((s) => { s.selection = id; }, { history: false }); refresh(); },
  change: () => { markDirty(); refresh({ light: true }); },
  gestureStart: () => beginGesture(),
  gestureEnd: () => { endGesture(); markDirty(); },
});

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

function refresh(opts = {}) {
  // Opening a saved design renames the project and the box in the top bar has
  // to follow - but never while it is focused, or a rewrite would move the
  // cursor mid-word.
  if (document.activeElement !== els.name) els.name.value = state.name;

  const tag = getTag();
  const piece = currentPiece();
  els.undo.disabled = !canUndo();
  els.redo.disabled = !canRedo();

  const active = document.activeElement;
  view2d.render(piece, decorFor(piece), state.selection, state.params);
  if (opts.keepFocus && document.contains(opts.keepFocus)) opts.keepFocus.focus();
  else if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName) && document.contains(active)) {
    active.focus();
  }

  els.readout.textContent =
    `${rnd(tag.derived.pieceW, 1)} × ${rnd(tag.derived.pieceH, 1)} mm `
    + `· ${material().name} ${tag.params.thickness} mm`;

  if (opts.light) return; // mid-drag: skip the panels so focus and scroll survive

  renderSides(els.sides, openSide);
  const keep = opts.keepFocus;
  renderInspector(els.inspector, ctx);
  if (keep && keep.tagName === 'TEXTAREA') {
    const again = els.inspector.querySelector('textarea');
    if (again) {
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    }
  }
}

function openSide(id) {
  update((s) => { s.side = id; s.selection = null; }, { history: false });
  refresh();
}

function addObject(type, extra = {}) {
  const piece = currentPiece();
  const obj = makeObject(type, piece, extra);
  update((s) => {
    s.decor[state.side].push(obj);
    s.selection = obj.id;
  });
  markDirty();
  refresh();
  return obj;
}

function deleteSelected() {
  if (!state.selection) return;
  update((s) => {
    const list = s.decor[s.side];
    const i = list.findIndex((o) => o.id === s.selection);
    if (i >= 0) list.splice(i, 1);
    s.selection = null;
  });
  markDirty();
  refresh();
}

// Half the finest kerf in the material list, so the thinning below can never
// move a line by as much as the beam already does.
const SIMPLIFY_MM = 0.05;

/**
 * Drop a ring set onto the piece at a sensible size.
 *
 * Shared by the clipart library and by SVG import, because they are the same
 * operation: both arrive as sampled rings in whatever units the drawing used,
 * and both want to land at half the width of the tag with their aspect kept.
 */
function placeRings(rings, process = 'engrave-line') {
  const piece = currentPiece();
  const bb = bbox(rings.flat());
  const scale = Math.min(
    (piece.size.w * 0.45) / (bb.w || 1),
    (piece.size.h * 0.45) / (bb.h || 1));

  // Thinned here, where the final size is known, rather than in the importer,
  // which samples in the source drawing's own units and cannot know it. An icon
  // drawn on a 100-unit grid arrives with a thousand points; at 22 mm on the tag
  // those sit seventy microns apart, a fifth of the kerf. SIMPLIFY_MM is in
  // finished millimetres and is divided back through the scale to get the
  // tolerance in the units the points are still in.
  const eps = scale > 0 ? SIMPLIFY_MM / scale : 0;
  const thinned = rings.map((r) => simplify(r, eps)).filter((r) => r.length > 2);

  return addObject('svg', {
    rings: thinned.length ? thinned : rings,
    w: (bb.w || 1) * scale,
    h: (bb.h || 1) * scale,
    process,
  });
}


// ------------------------------------------------------------------ tools
els.tools.addEventListener('click', async (e) => {
  const btn = e.target.closest('.tool');
  if (!btn) return;
  const tool = btn.dataset.tool;
  if (tool === 'text') {
    await loadFont('inter');
    const obj = addObject('text', { text: 'Text' });
    const m = measureText(obj);
    update((s) => {
      const t = s.decor[state.side].find((o) => o.id === obj.id);
      const piece = currentPiece();
      t.w = m.w || t.w;
      t.h = m.h || t.h;
      t.x = piece.size.w / 2 - t.w / 2;
      t.y = piece.size.h / 2 - t.h / 2;
    }, { history: false });
    refresh();
  } else if (tool === 'shape') {
    openPopover(btn, shapeMenu((id) => {
      els.popover.hidden = true;
      addObject(id);
    }), els.popover);
  } else if (tool === 'clipart') {
    openPopover(btn, clipartMenu((id) => {
      els.popover.hidden = true;
      const rings = svgTextToRings(clipartSvg(id));
      if (!rings.length) return;
      placeRings(rings);
    }), els.popover);
  } else if (tool === 'import') {
    openPopover(btn, importMenu((file) => {
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
  const name = file.name.toLowerCase();
  if (!name.endsWith('.svg') && file.type !== 'image/svg+xml') {
    alert('SVG only. A PNG or a photo has no paths in it for a laser to follow — '
      + 'trace it to vector first, then bring the SVG here.');
    return;
  }
  const rings = svgTextToRings(await readAsText(file));
  if (!rings.length) {
    alert('No drawable shapes found in that SVG.');
    return;
  }
  placeRings(rings);
}

// ------------------------------------------------------------------ chrome
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
  if (v === 'all') downloadAll();
  else if (v === 'pdf') downloadAllPdf();
  else if (v === 'whatsapp') sendWhatsApp();
  else if (v === 'piece') downloadPiece();
});

// Exporting is the moment somebody decides a tag is finished, so it is the
// moment worth keeping. It updates whatever design is already open rather than
// adding another.
//
// On the click rather than on the dialog closing: a save must not be lost
// because the download threw on the line before it, and the close event is not
// dispatched the same way by every browser.
els.exportDlg.addEventListener('click', (event) => {
  const button = event.target.closest && event.target.closest('button');
  if (!button) return;
  if (!['all', 'pdf', 'whatsapp', 'piece'].includes(button.value)) return;
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

const exportOpts = () => ({
  sheet: state.sheet,
  labels: state.showLabels,
  name: state.name,
});

function downloadAll() {
  const files = exportSvg(getTag(), decorFor, exportOpts());
  files.forEach((f, i) => setTimeout(() => download(f.name, f.svg), i * 200));
}

function downloadAllPdf() {
  const files = exportPdf(getTag(), decorFor, exportOpts());
  files.forEach((f, i) => setTimeout(
    () => download(f.name, f.pdf, 'application/pdf'), i * 200));
}

function downloadPiece() {
  const piece = currentPiece();
  const svg = pieceToSvg(piece, decorFor(piece), { kerf: state.params.kerf });
  const base = (state.name || 'tag').trim().replace(/[^\w-]+/g, '-').toLowerCase() || 'tag';
  download(`${base}-${piece.id}.svg`, svg);
}

/**
 * What the person cutting this needs to know, in the message rather than only in
 * the file. They may well open it on a phone, hours later, without the tool in
 * front of them - and a tag that arrives without its board thickness is a tag
 * that gets cut on the wrong board.
 *
 * The line about the two pieces is the one that matters most. Both are the same
 * outline, so a file with a front and a back in it looks exactly like a file
 * with two of the same thing, and the difference is only visible in the
 * engraving. Saying it out loud costs a sentence.
 */
function tagNote(sheets) {
  const t = getTag();
  const p = t.params;
  const out = [
    `*${state.name || 'Luggage tag'}*`,
    `${rnd(t.derived.pieceW, 1)} x ${rnd(t.derived.pieceH, 1)} mm per piece, `
    + `${p.thickness} mm board, kerf ${p.kerf} mm`,
    'TWO pieces: one front, one back. They are the same outline - the engraving '
    + 'is the only difference, so check the FRONT / BACK marks before cutting.',
    'Cut both face up, then glue them back to back with the slots lined up.',
    'Kerf is already in the paths - cut as-is.',
  ];
  if (p.slot !== 'none') {
    out.push(`Strap slot ${rnd(p.slotW, 1)} x ${rnd(p.slotH, 1)} mm.`);
  }
  if (sheets.length > 1) out.push(`${sheets.length} sheets.`);
  for (const w of t.derived.warnings) out.push(`WARNING: ${w}`);
  return out.join('\n');
}

/**
 * Hand the cut files to WhatsApp.
 *
 * PDF rather than SVG: WhatsApp treats a PDF as a document anyone can open,
 * while an SVG arrives as a file most phones will not preview.
 *
 * Where the browser and the OS allow it the files go across attached - all the
 * sheets at once, because half a tag is not a tag. Where they do not, which is
 * most desktops, nothing can push a file into WhatsApp through a link: wa.me and
 * the whatsapp: scheme carry text and nothing else. So the fallback saves the
 * sheets and opens WhatsApp with the job written out.
 *
 * canShare is checked SYNCHRONOUSLY, before anything is awaited. Past an await
 * the click is no longer a user gesture and the browser blocks the window.
 */
function sendWhatsApp() {
  const sheets = exportPdf(getTag(), decorFor, exportOpts());
  if (!sheets.length) return;
  const files = sheets.map((f) => ({
    name: f.name,
    blob: new Blob([f.pdf], { type: 'application/pdf' }),
  }));
  const text = tagNote(sheets);

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
    view2d.fit();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    openSide(state.side === 'front' ? 'back' : 'front');
  } else if (state.selection
    && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 5 : 0.5;
    const d = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, step], ArrowDown: [0, -step],
    }[e.key];
    update((s) => {
      const o = s.decor[s.side].find((x) => x.id === s.selection);
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
  window.__app = { state, refresh, addObject, deleteSelected, view2d, getTag };
}

async function boot() {
  refresh();
  view2d.fit();
  await preload();
  refresh();

  // Arrived from the gallery in another tool: ?design=<id> says which one to
  // open. Done after the first paint so the tool is already usable if the fetch
  // is slow, and the parameter is cleared afterwards so a refresh does not undo
  // whatever has been changed since.
  const wanted = new URLSearchParams(location.search).get('design');
  if (wanted) {
    if (await openDesignById(wanted)) {
      els.name.value = state.name;
      view2d.fit();
      refresh();
    }
    const url = new URL(location.href);
    url.searchParams.delete('design');
    history.replaceState(null, '', url.pathname + url.search);
  }
}

boot();
window.addEventListener('resize', () => view2d.applyViewBox());
