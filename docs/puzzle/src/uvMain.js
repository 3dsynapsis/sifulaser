// The UV File tab (Boss, 11 Nov 2026): the Puzzle tab's poster flow with no puzzle.
//
// Put a PDF in and out come the panel's cut file (its outline, 10 mm border, R5
// corners) and the UV print file (the poster as a CMYK picture, 2 mm bleed, Spot 1 and
// Spot 2 under it). Sizes, Save, the draft, Export, Share and the layer check are the
// Puzzle tab's own code: posterFlow.js run with product 'panel'. Only the page around
// it is here, and what shows before any PDF is in.

import { View } from './view.js';
import { h, group, fillHelpDialog } from './ui.js';
import * as gallery from './designs.js';
import * as vault from './posterVault.js';
import {
  initPoster, posterActive, openPosterFiles, openPosterDesign, renderPoster,
  openPosterExport, restorePosterDraft, renamePoster, posterStore, PANEL_STEPS,
} from './posterFlow.js';
import { PANEL_BORDER_MM, PANEL_BLEED_MM } from './geom/panel.js';
import { VERSION } from './version.js';

// First, before anything reads them: this tab's designs and draft are its own.
gallery.useTool('uvfile', 'UV file tanpa nama');
vault.useDatabase('sifulaser-uvfile');

const $ = (sel) => document.querySelector(sel);

const els = {
  stage: $('#stage'),
  preview: $('#stagePreview'),
  inspector: $('#inspector'),
  hint: $('#stageHint'),
  status: $('#status'),
  name: $('#projectName'),
  posterDlg: $('#posterDlg'),
  helpDlg: $('#helpDlg'),
  zoomPick: $('#zoomPick'),
  drop: $('#uvDrop'),
  dropInput: $('#uvDropInput'),
  save: $('#saveBtn'),
  exportBtn: $('#exportBtn'),
};

const view = new View(els.preview);

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

const pickPdfs = (label, cls) => h('label', { class: `${cls} file-pick` },
  h('input', {
    type: 'file',
    accept: 'application/pdf,.pdf',
    multiple: true,
    hidden: true,
    onchange: (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      openPosterFiles(files);
    },
  }),
  label);

/** Before any PDF is in: what this tab makes, and the way in. */
function renderEmpty() {
  view.svg.replaceChildren();
  els.hint.classList.remove('show');
  els.status.textContent = '';
  els.status.classList.remove('unsaved');
  const stat = (label, value) => h('div', { class: 'stat' }, h('span', {}, label), h('b', {}, value));
  els.inspector.replaceChildren(
    h('h2', { class: 'insp-title' }, 'UV File'),
    group('Masukkan PDF', true,
      h('p', { class: 'uv-intro' },
        'Masukkan poster dalam PDF. Tool ni siapkan panel dan keluarkan file cut serta file print UV, '
        + 'sedia untuk FlexiPRINT.'),
      pickPdfs('Pilih PDF', 'primary'),
      h('p', { class: 'hint' },
        'Boleh pilih banyak PDF sekali. PDF kekal dalam browser ni dan tak dihantar ke mana-mana.')),
    group('Apa yang keluar', true,
      stat('Border', `${PANEL_BORDER_MM} mm keliling, bucu R5`),
      stat('Bleed', `${PANEL_BLEED_MM} mm atas border`),
      stat('Saiz', 'A4, A3, A2, tinggi sendiri, atau saiz asal PDF'),
      stat('Material', 'Acrylic putih 3mm, atau clear 2, 3, 5mm'),
      stat('File cut', 'Garis poster dan frame, material tertulis'),
      stat('File print UV', 'Gambar CMYK 300 dpi, Spot 1 dan Spot 2 (white)'),
      stat('Bed UV', '900 x 600 mm, panel disusun rapat')),
    h('p', { class: 'version-stamp' }, `Versi ${VERSION}`),
  );
}

function refresh() {
  if (posterActive()) renderPoster();
  else renderEmpty();
}

/** What the Save dialog and the gallery may see before any PDF is in. */
const idleStore = {
  name: () => '',
  params: () => ({}),
  material: () => '',
  extra: () => null,
  rename: () => {},
  note: 'Yang disimpan ke akaun ialah tetapan: saiz, page, client dan dateline. '
    + 'PDF kekal dalam browser ni. Kalau buka di PC lain, kena pilih PDF tu semula.',
  apply: (row) => openPosterDesign(row),
};
const activeStore = () => (posterActive() ? posterStore : idleStore);

const dialogFiller = (build) => function fill(dlg) {
  const close = () => dlg.close();
  dlg.replaceChildren(build(h, activeStore(), close, () => fill(dlg)));
};
const fillSaveDialog = dialogFiller(gallery.saveDialogBody);
const fillFilesDialog = dialogFiller(gallery.filesDialogBody);
function openSaveDialog() {
  if (!posterActive()) return;
  fillSaveDialog($('#saveDlg'));
  $('#saveDlg').showModal();
}

initPoster({
  product: 'panel',
  view,
  els,
  saveFile,
  refresh,
  openSave: openSaveDialog,
  applyRow: (row) => openPosterDesign(row),
  setMode: (on, name) => {
    document.body.classList.toggle('poster-mode', on);
    els.zoomPick.hidden = !on;
    els.drop.hidden = on;
    els.save.disabled = !on;
    els.exportBtn.disabled = !on;
    els.name.value = on ? name : 'UV File';
    // Closed: the next job is a new design, not the one that was open.
    if (!on) gallery.setOpen(null, null);
  },
});

$('#zoomIn').addEventListener('click', () => view.zoomBy(1.5));
$('#zoomOut').addEventListener('click', () => view.zoomBy(1 / 1.5));
$('#zoomFit').addEventListener('click', () => view.zoomFit());

// PDFs can be dropped anywhere on the stage, as in the Puzzle tab (a new job; Tambah PDF
// adds to one), or picked from the box in its middle.
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
els.stage.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  els.stage.classList.add('drag-over');
});
els.stage.addEventListener('dragleave', () => els.stage.classList.remove('drag-over'));
els.stage.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  els.stage.classList.remove('drag-over');
  openPosterFiles(e.dataTransfer.files);
});
els.dropInput.addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  openPosterFiles(files);
});

els.name.addEventListener('change', () => {
  if (posterActive()) renamePoster(els.name.value);
  else els.name.value = 'UV File';
});

$('#helpBtn').addEventListener('click', () => {
  fillHelpDialog(els.helpDlg, PANEL_STEPS, 'Cara buat file UV');
  els.helpDlg.showModal();
});
els.save.addEventListener('click', openSaveDialog);
$('#filesBtn').addEventListener('click', () => { fillFilesDialog($('#filesDlg')); $('#filesDlg').showModal(); });
els.exportBtn.addEventListener('click', () => { if (posterActive()) openPosterExport(); });

refresh();

// Arriving from another tool's gallery: ?design=<id>. Otherwise the job left on screen
// last time comes back as it was.
{
  const wanted = new URLSearchParams(location.search).get('design');
  if (wanted) {
    gallery.openById(activeStore(), wanted).then((opened) => {
      if (!opened) restorePosterDraft();
    }).finally(() => {
      const url = new URL(location.href);
      url.searchParams.delete('design');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    });
  } else {
    restorePosterDraft();
  }
}
