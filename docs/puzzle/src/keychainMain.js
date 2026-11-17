// The Keychain UV tab (Boss, 17 Nov 2026): the page around keychainFlow.js, and what
// shows before any PDF is in. It lives with the Puzzle tab's code, as the UV File tab
// does, and uses its print file, its storage and its Save and Export.

import { View } from './view.js';
import { h, group, fillHelpDialog } from './ui.js';
import * as gallery from './designs.js';
import * as vault from './posterVault.js';
import {
  initKeychain, keychainActive, openKeychainFiles, openKeychainDesign, renderKeychain,
  openKeychainExport, restoreKeychainDraft, renameKeychain, keychainStore, KEYCHAIN_STEPS,
} from './keychainFlow.js';
import {
  KEYCHAIN_SIZES_MM, KEYCHAIN_BLEED_MM, HOLE_DIAMETER_MM, KEYCHAIN_SHEETS, KEYCHAIN_GAP_MM, KEYCHAIN_EDGE_MM,
} from './geom/keychain.js';
import { VERSION } from './version.js';

// First, before anything reads them: this tab's designs and draft are its own.
gallery.useTool('keychainuv', 'Keychain UV tanpa nama');
vault.useDatabase('sifulaser-keychainuv');

const $ = (sel) => document.querySelector(sel);
const TITLE = 'Keychain UV';

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

const pickPdf = (label, cls) => h('label', { class: `${cls} file-pick` },
  h('input', {
    type: 'file',
    accept: 'application/pdf,.pdf',
    hidden: true,
    onchange: (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      openKeychainFiles(files);
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
  const sheets = KEYCHAIN_SHEETS.map((s) => `${s.label} ${s.width} x ${s.height}`).join(', ');
  els.inspector.replaceChildren(
    h('h2', { class: 'insp-title' }, TITLE),
    group('Masukkan PDF', true,
      h('p', { class: 'uv-intro' },
        'Masukkan design keychain bulat dalam PDF. Tool ni cari bulatan design, buat bleed dan lubang, '
        + 'susun atas sheet, dan keluarkan file cut serta file print UV untuk FlexiPRINT.'),
      pickPdf('Pilih PDF', 'primary'),
      h('p', { class: 'hint' }, 'PDF kekal dalam browser ni dan tak dihantar ke mana-mana.')),
    group('Apa yang keluar', true,
      stat('Saiz', KEYCHAIN_SIZES_MM.map((mm) => `${mm / 10} cm`).join(', ')),
      stat('Jenis', 'Biasa (lubang dalam bulatan) atau Hook (telinga di tepi)'),
      stat('Lubang', `${HOLE_DIAMETER_MM} mm, atas tengah, boleh diseret`),
      stat('Bleed', `${KEYCHAIN_BLEED_MM} mm, dibuat dari warna tepi bila file tiada`),
      stat('Border tepi', 'Garis nipis di tepi dibuang supaya tak nampak senget'),
      stat('Sheet', `${sheets}, atau Custom`),
      stat('Jarak', `${KEYCHAIN_GAP_MM} mm antara keychain, ${KEYCHAIN_EDGE_MM} mm dari tepi`),
      stat('Kuantiti', 'Dibahagi sama rata: satu file, cut dan UV print N kali'),
      stat('File cut', 'Lubang, keychain, frame sheet'),
      stat('File print UV', 'Gambar CMYK 300 dpi, Spot 1 dan Spot 2 (white)')),
    h('p', { class: 'version-stamp' }, `Versi ${VERSION}`),
  );
}

function refresh() {
  if (keychainActive()) renderKeychain();
  else renderEmpty();
}

/** What the Save dialog and the gallery may see before any PDF is in. */
const idleStore = {
  name: () => '',
  params: () => ({}),
  material: () => '',
  extra: () => null,
  rename: () => {},
  note: keychainStore.note,
  apply: (row) => openKeychainDesign(row),
};
const activeStore = () => (keychainActive() ? keychainStore : idleStore);

const dialogFiller = (build) => function fill(dlg) {
  const close = () => dlg.close();
  dlg.replaceChildren(build(h, activeStore(), close, () => fill(dlg)));
};
const fillSaveDialog = dialogFiller(gallery.saveDialogBody);
const fillFilesDialog = dialogFiller(gallery.filesDialogBody);
function openSaveDialog() {
  if (!keychainActive()) return;
  fillSaveDialog($('#saveDlg'));
  $('#saveDlg').showModal();
}

initKeychain({
  view,
  els,
  saveFile,
  refresh,
  openSave: openSaveDialog,
  applyRow: (row) => openKeychainDesign(row),
  setMode: (on, name) => {
    document.body.classList.toggle('poster-mode', on);
    els.zoomPick.hidden = !on;
    els.drop.hidden = on;
    els.save.disabled = !on;
    els.exportBtn.disabled = !on;
    els.name.value = on ? name : TITLE;
    // Closed: the next job is a new design, not the one that was open.
    if (!on) gallery.setOpen(null, null);
  },
});

$('#zoomIn').addEventListener('click', () => view.zoomBy(1.5));
$('#zoomOut').addEventListener('click', () => view.zoomBy(1 / 1.5));
$('#zoomFit').addEventListener('click', () => view.zoomFit());

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
  openKeychainFiles(e.dataTransfer.files);
});
els.dropInput.addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  openKeychainFiles(files);
});

els.name.addEventListener('change', () => {
  if (keychainActive()) renameKeychain(els.name.value);
  else els.name.value = TITLE;
});

$('#helpBtn').addEventListener('click', () => {
  fillHelpDialog(els.helpDlg, KEYCHAIN_STEPS, 'Cara buat keychain UV');
  els.helpDlg.showModal();
});
els.save.addEventListener('click', openSaveDialog);
$('#filesBtn').addEventListener('click', () => { fillFilesDialog($('#filesDlg')); $('#filesDlg').showModal(); });
els.exportBtn.addEventListener('click', () => { if (keychainActive()) openKeychainExport(); });

refresh();

// Arriving from another tool's gallery: ?design=<id>. Otherwise the job left on screen
// last time comes back as it was.
{
  const wanted = new URLSearchParams(location.search).get('design');
  if (wanted) {
    gallery.openById(activeStore(), wanted).then((opened) => {
      if (!opened) restoreKeychainDraft();
    }).finally(() => {
      const url = new URL(location.href);
      url.searchParams.delete('design');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    });
  } else {
    restoreKeychainDraft();
  }
}
