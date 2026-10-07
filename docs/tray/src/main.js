// Pendawaian: bar atas, dua pandangan, inspector, dialog export dan bantuan.

import {
  state, subscribe, getTray, update, load, undo, redo, canUndo, canRedo,
  material, onPersist,
} from './store.js';
import { createInspector, warningsText } from './ui.js';
import { View3D } from './view3d.js';
import { View2D } from './view2d.js';
import { exportSvg, SHEETS, nest, sheetDef } from './export.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  name: $('#projectName'),
  status: $('#status'),
  v3d: $('#v3d'),
  v2d: $('#v2d'),
  stage: $('#stage'),
  stage3d: $('#stage3d'),
  stage2d: $('#stage2d'),
  backdropPick: $('#backdropPick'),
  warnings: $('#warnings'),
  hint: $('#stageHint'),
  readout: $('#sizeReadout'),
  undo: $('#undoBtn'),
  redo: $('#redoBtn'),
  help: $('#helpBtn'),
  frame: $('#frameBtn'),
  exportBtn: $('#exportBtn'),
  exportDlg: $('#exportDlg'),
  helpDlg: $('#helpDlg'),
  inspector: $('#inspector'),
};

load();

const view3d = new View3D(els.stage3d);
const view2d = new View2D(els.stage2d);
const inspector = createInspector(els.inspector);

// ---- bar atas ---------------------------------------------------------------
els.name.value = state.name;
els.name.addEventListener('change', () => {
  update((s) => { s.name = els.name.value.trim() || 'Dulang tanpa nama'; }, { history: false });
  els.name.value = state.name;
});

onPersist((st) => {
  els.status.textContent = st === 'busy' ? 'Menyimpan...' : 'Disimpan';
  els.status.classList.toggle('busy', st === 'busy');
});

els.undo.addEventListener('click', undo);
els.redo.addEventListener('click', redo);
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  if (e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  } else if (e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
  }
});

const setView = (v) => update((s) => { s.view = v; }, { history: false });
els.v3d.addEventListener('click', () => setView('3d'));
els.v2d.addEventListener('click', () => setView('2d'));
els.frame.addEventListener('click', () => view3d.frame());

// ---- latar belakang pratonton ----------------------------------------------
for (const [id, label, swatch] of [['light', 'Latar cerah', '#ffffff'], ['dark', 'Latar gelap', '#4c4c50']]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.style.background = swatch;
  b.dataset.backdrop = id;
  b.addEventListener('click', () => update((s) => { s.backdrop = id; }, { history: false }));
  els.backdropPick.append(b);
}

// ---- export ------------------------------------------------------------------
const sheetSel = $('#sheetSel');
for (const s of SHEETS) {
  const o = document.createElement('option');
  o.value = s.id;
  o.textContent = s.name;
  sheetSel.append(o);
}
const labelsChk = $('#labelsChk');
const exportSummary = $('#exportSummary');
const exportNote = $('#exportNote');

function refreshExportDialog() {
  const tray = getTray();
  const def = sheetDef(state.sheet);
  const sheets = nest(tray.panels, { sheetW: def.w, sheetH: def.h });
  const { length: L, width: W, height: H, thickness: t } = tray.params;
  exportSummary.textContent =
    `${tray.panels.length} panel untuk dulang ${L} x ${W} x ${H} mm, papan ${t} mm, `
    + `${sheets.length} kepingan ${def.id === 'auto' ? `(${Math.round(sheets[0].w)} x ${Math.round(sheets[0].h)} mm)` : def.name}.`;
  const over = sheets.some((s) => s.overflow);
  exportNote.textContent = over
    ? 'Ada panel lebih besar daripada kepingan yang dipilih - pilih kepingan lebih besar atau "saiz ikut perlu".'
    : 'Garisan merah = potong. Garisan kelabu = label panel; ukir pada kuasa rendah, atau padam lapisannya sebelum memotong.';
  exportNote.classList.toggle('warn', over);
}

els.exportBtn.addEventListener('click', () => {
  sheetSel.value = state.sheet;
  labelsChk.checked = state.showLabels;
  refreshExportDialog();
  els.exportDlg.showModal();
});
sheetSel.addEventListener('change', () => {
  update((s) => { s.sheet = sheetSel.value; }, { history: false });
  refreshExportDialog();
});
labelsChk.addEventListener('change', () => {
  update((s) => { s.showLabels = labelsChk.checked; }, { history: false });
});
els.exportDlg.addEventListener('close', () => {
  if (els.exportDlg.returnValue === 'svg') download();
});
// Klik pada tirai menutup dialog, seperti dialog lain di laman ini.
els.exportDlg.addEventListener('click', (e) => { if (e.target === els.exportDlg) els.exportDlg.close('cancel'); });
els.helpDlg.addEventListener('click', (e) => { if (e.target === els.helpDlg) els.helpDlg.close(); });

function saveBlob(name, body) {
  const blob = new Blob([body], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function download() {
  const tray = getTray();
  const files = exportSvg(tray, { sheet: state.sheet, labels: state.showLabels });
  // Satu fail setiap kepingan, dengan selang pendek: pelayar menggugurkan
  // muat turun kedua yang tiba dalam frame yang sama dengan yang pertama.
  files.forEach((f, i) => setTimeout(() => saveBlob(f.name, f.svg), i * 350));
  showHint(files.length > 1 ? `${files.length} fail SVG dimuat turun` : 'Fail SVG dimuat turun');
}

// ---- bantuan ----------------------------------------------------------------
els.help.addEventListener('click', () => {
  const d = getTray().derived;
  const steps = $('#assembleSteps');
  steps.replaceChildren();
  const add = (main, note) => {
    const li = document.createElement('li');
    li.textContent = main;
    if (note) {
      const s = document.createElement('span');
      s.textContent = ` ${note}`;
      li.append(s);
    }
    steps.append(li);
  };
  add('Pasang lantai ke dinding depan.', 'Tenon lantai masuk mortis di bahagian bawah dinding; slit kelegaan membenarkannya mampat.');
  add('Tambah dinding kiri dan kanan.', 'Tab depan masuk takuk sisi; tenon lantai sisi masuk mortis sisi.');
  if (d.divOK && !d.alih) {
    add('Masukkan pembahagi-X (yang memisahkan lajur) dahulu.', 'Tenon bawahnya masuk mortis dinding depan. Takuk half-lap menghadap ke ATAS.');
    add('Jatuhkan pembahagi-Y (memisahkan baris) dari atas.', 'Takuknya menghadap ke BAWAH dan mengunci pada pembahagi-X. Hujungnya masuk mortis dinding sisi.');
  }
  add('Tutup dengan dinding belakang.', 'Semua tenon dan tab mesti sejajar sebelum ditekan rapat. Gam pada sendi bucu kalau mahu kekal.');
  if (d.divOK && d.alih) {
    add('Gelongsor pembahagi-X turun ke dalam slot dinding depan dan belakang.', 'Takuk half-lap menghadap ke ATAS.');
    add('Gelongsor pembahagi-Y dari atas.', 'Takuknya menghadap ke BAWAH dan duduk atas pembahagi-X. Angkat pembahagi-Y dahulu bila mahu susun semula.');
  }
  els.helpDlg.showModal();
});

// ---- petunjuk pentas ----------------------------------------------------------
let hintTimer = null;
function showHint(text, ms = 2200) {
  els.hint.textContent = text;
  els.hint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => els.hint.classList.remove('show'), ms);
}

// ---- lukis ------------------------------------------------------------------
let lastTray = null;
let lastLook = '';

function render() {
  const tray = getTray();
  const m = material();
  const look = `${m.id}|${state.backdrop}`;

  // Pandangan.
  const is3d = state.view === '3d';
  els.v3d.setAttribute('aria-selected', String(is3d));
  els.v2d.setAttribute('aria-selected', String(!is3d));
  els.stage3d.hidden = !is3d;
  els.stage2d.hidden = is3d;
  els.backdropPick.hidden = !is3d;
  els.frame.hidden = !is3d;
  els.stage.dataset.backdrop = state.backdrop;
  for (const b of els.backdropPick.children) {
    b.setAttribute('aria-pressed', String(b.dataset.backdrop === state.backdrop));
  }

  if (tray !== lastTray || look !== lastLook) {
    view3d.build(tray, {
      color: m.color, grain: m.grain, charred: Boolean(m.char), backdrop: state.backdrop,
    });
    lastTray = tray;
    lastLook = look;
  }
  if (!is3d) view2d.render(tray, { sheet: state.sheet, labels: state.showLabels });

  inspector.render();

  const { length: L, width: W, height: H } = tray.params;
  els.readout.textContent = `${L} x ${W} x ${H} mm - ${tray.derived.cellCount} petak`;
  els.undo.disabled = !canUndo();
  els.redo.disabled = !canRedo();

  const warn = warningsText(tray.derived);
  els.warnings.hidden = !warn;
  els.warnings.textContent = warn;
}

subscribe(render);
render();
els.status.textContent = 'Disimpan';
showHint('Klik petak, tekan + Lajur / + Baris. Seret pembahagi untuk ubah saiz.', 4000);
