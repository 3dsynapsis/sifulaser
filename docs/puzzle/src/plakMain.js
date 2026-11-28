// The UV Plak tab (Boss, 28 Nov 2026): the page around plakFlow.js, and what shows before
// any design is in. It lives with the Puzzle tab's code, as the UV File and Keychain UV
// tabs do, and uses its print file, its storage and its Save and Export.

import { View } from './view.js';
import { h, group, fillHelpDialog } from './ui.js';
import * as gallery from './designs.js';
import * as vault from './posterVault.js';
import { POSTER_ACCEPT, POSTER_FORMATS } from './posterFile.js';
import {
  initPlak, plakActive, openPlakFiles, openPlakDesign, renderPlak,
  openPlakExport, restorePlakDraft, renamePlak, plakStore, PLAK_STEPS, closePlak3d,
} from './plakFlow.js';
import {
  PLAK_BORDER_MM, PLAK_FRAME_MM, BASE_MATERIAL, PLAK_MATERIALS,
} from './geom/plak.js';
import { VERSION } from './version.js';

// First, before anything reads them: this tab's designs and draft are its own.
gallery.useTool('uvplak', 'UV Plak tanpa nama');
vault.useDatabase('sifulaser-uvplak');

const $ = (sel) => document.querySelector(sel);
const TITLE = 'UV Plak';

const els = {
  stage: $('#stage'),
  preview: $('#stagePreview'),
  stage3d: $('#stage3d'),
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

const pickPdf = (label, cls) => h('label', { class: `${cls} file-pick` },
  h('input', {
    type: 'file',
    accept: POSTER_ACCEPT,
    hidden: true,
    onchange: (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      openPlakFiles(files);
    },
  }),
  label);

/** Before any design is in: what this tab makes, and the way in. */
function renderEmpty() {
  view.svg.replaceChildren();
  els.hint.classList.remove('show');
  els.status.textContent = '';
  els.status.classList.remove('unsaved');
  const stat = (label, value) => h('div', { class: 'stat' }, h('span', {}, label), h('b', {}, value));
  els.inspector.replaceChildren(
    h('h2', { class: 'insp-title' }, TITLE),
    group('Masukkan design', true,
      h('p', { class: 'uv-intro' },
        `Masukkan design plak dalam ${POSTER_FORMATS}. Tool ni buat plak depan untuk UV print, border hitam `
        + '4 keping, huruf timbul dari tulisan besar, dan base acrylic hitam beralur, dengan file cut setiap material.'),
      pickPdf('Pilih file', 'primary'),
      h('p', { class: 'hint' }, 'File kekal dalam browser ni dan tak dihantar ke mana-mana.')),
    group('Apa yang keluar', true,
      stat('Saiz', 'A4, A3, ikut file, atau taip sendiri'),
      stat('Material', PLAK_MATERIALS.map((m) => m.label).join(', ')),
      stat('Border', `${PLAK_BORDER_MM} mm, 4 keping sudut 45°, ditampal atas depan`),
      stat('Huruf timbul', 'Tulisan besar dikesan sendiri, tekan huruf untuk pilih'),
      stat('Base', `${BASE_MATERIAL.label} satu keping, plak berdiri dalam alur tembus`),
      stat('File cut', 'Satu untuk setiap material'),
      stat('File print UV', `Plak dalam frame ${PLAK_FRAME_MM} mm, CMYK 300 dpi, white di bawah gambar dan tulisan sahaja`)),
    h('p', { class: 'version-stamp' }, `Versi ${VERSION}`),
  );
}

function refresh() {
  if (plakActive()) renderPlak();
  else renderEmpty();
}

/** What the Save dialog and the gallery may see before any design is in. */
const idleStore = {
  name: () => '',
  params: () => ({}),
  material: () => '',
  extra: () => null,
  rename: () => {},
  note: plakStore.note,
  apply: (row) => openPlakDesign(row),
};
const activeStore = () => (plakActive() ? plakStore : idleStore);

const dialogFiller = (build) => function fill(dlg) {
  const close = () => dlg.close();
  dlg.replaceChildren(build(h, activeStore(), close, () => fill(dlg)));
};
const fillSaveDialog = dialogFiller(gallery.saveDialogBody);
const fillFilesDialog = dialogFiller(gallery.filesDialogBody);
function openSaveDialog() {
  if (!plakActive()) return;
  fillSaveDialog($('#saveDlg'));
  $('#saveDlg').showModal();
}

initPlak({
  view,
  els,
  saveFile,
  refresh,
  openSave: openSaveDialog,
  applyRow: (row) => openPlakDesign(row),
  setMode: (on, name) => {
    document.body.classList.toggle('poster-mode', on);
    els.zoomPick.hidden = !on;
    els.drop.hidden = on;
    els.save.disabled = !on;
    els.exportBtn.disabled = !on;
    els.name.value = on ? name : TITLE;
    // Closed: the next job is a new design, not the one that was open.
    if (!on) {
      gallery.setOpen(null, null);
      closePlak3d();
    }
  },
});

$('#zoomIn').addEventListener('click', () => view.zoomBy(1.5));
$('#zoomOut').addEventListener('click', () => view.zoomBy(1 / 1.5));
$('#zoomFit').addEventListener('click', () => view.zoomFit());

els.dropInput.accept = POSTER_ACCEPT;
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
  openPlakFiles(e.dataTransfer.files);
});
els.dropInput.addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  openPlakFiles(files);
});

els.name.addEventListener('change', () => {
  if (plakActive()) renamePlak(els.name.value);
  else els.name.value = TITLE;
});

$('#helpBtn').addEventListener('click', () => {
  fillHelpDialog(els.helpDlg, PLAK_STEPS, 'Cara buat plak UV');
  els.helpDlg.showModal();
});
els.save.addEventListener('click', openSaveDialog);
$('#filesBtn').addEventListener('click', () => { fillFilesDialog($('#filesDlg')); $('#filesDlg').showModal(); });
els.exportBtn.addEventListener('click', () => { if (plakActive()) openPlakExport(); });

refresh();

// Arriving from another tool's gallery: ?design=<id>. Otherwise the job left on screen
// last time comes back as it was.
{
  const wanted = new URLSearchParams(location.search).get('design');
  if (wanted) {
    gallery.openById(activeStore(), wanted).then((opened) => {
      if (!opened) restorePlakDraft();
    }).finally(() => {
      const url = new URL(location.href);
      url.searchParams.delete('design');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    });
  } else {
    restorePlakDraft();
  }
}
