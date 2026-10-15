// Plak Box: input -> buildPlakBox -> paparan 3D + ringkasan -> STL.
//
// Satu fail kerana alatnya kecil: tiada editor 2D, tiada undo. Panel tetapan
// dibina SEKALI; perubahan hanya menulis semula pratonton dan bahagian yang
// bergantung pada ukuran (senarai keping akrilik, ringkasan), supaya slider
// yang sedang diseret tidak dibina semula di bawah jari pengguna.

import { buildPlakBox, DEFAULTS, LIMITS, trianglesToStl } from './geom/base.js';
import { View3D } from './view3d.js';

const $ = (s) => document.querySelector(s);
const KEY = 'sifulaser.plakbox.v1';

// Dalam iframe halaman #/plakbox, bar SifuLaser di atas sudah menamakan alat
// ini. Di telefon nama kedua itu memakan satu baris penuh (lihat styles.css).
if (window.self !== window.top) document.documentElement.classList.add('embedded');

const COLORS = [
  { id: '#6b4430', name: 'Walnut' },
  { id: '#a8774f', name: 'Kayu' },
  { id: '#2b2b2d', name: 'Hitam' },
  { id: '#f1f0ec', name: 'Putih' },
];

const load = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') return raw;
  } catch { /* tetingkap peribadi atau data tapak disekat */ }
  return {};
};
const saved = load();
const state = {
  params: { ...DEFAULTS, ...(saved.params || {}) },
  show: ['siap', 'angkat', 'tapak'].includes(saved.show) ? saved.show : 'siap',
  color: COLORS.some((c) => c.id === saved.color) ? saved.color : COLORS[0].id,
  backdrop: saved.backdrop === 'dark' ? 'dark' : 'light',
};
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* abaikan */ }
};

const view = new View3D($('#stage3d'));
let model = buildPlakBox(state.params);

const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};
const mm = (v, dp = 1) => `${Math.round(v * 10 ** dp) / 10 ** dp}`;

// ------------------------------------------------------------ pengiraan semula
let hintTimer = null;
function showHint(text) {
  const el = $('#stageHint');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function rebuild() {
  model = buildPlakBox(state.params);
  view.build(model, { show: state.show, color: state.color, backdrop: state.backdrop });
  const d = model.derived;
  const p = model.params;
  $('#sizeReadout').textContent = `Tapak ${mm(d.baseL)} × ${mm(d.baseW)} × ${mm(p.baseH)} mm`;
  const w = $('#warnings');
  w.hidden = !model.warnings.length;
  w.textContent = model.warnings.join(' ');
  renderDynamic();
  save();
}

// ------------------------------------------------------------ panel tetapan
const inputs = new Map(); // kunci parameter -> { num, range }

function numberRow(key, label, { step = 1, unit = 'mm', hint } = {}) {
  const [min, max] = LIMITS[key];
  const set = (v) => {
    const x = Number(v);
    if (!Number.isFinite(x)) return;
    state.params[key] = x;
    rebuild();
  };
  const range = h('input', {
    type: 'range', min, max, step, value: state.params[key],
    oninput: (e) => { num.value = e.target.value; set(e.target.value); },
    onchange: () => sync(),
  });
  const num = h('input', {
    type: 'number', min, max, step, value: state.params[key], inputmode: 'decimal',
    oninput: (e) => { if (e.target.value !== '') { range.value = e.target.value; set(e.target.value); } },
    onchange: () => sync(),
  });
  inputs.set(key, { num, range });
  return h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { class: 'row' }, range, h('div', { class: 'num', style: 'flex:0 0 96px' }, num, h('span', { class: 'unit' }, unit))),
    hint ? h('p', { class: 'hint' }, hint) : null);
}

/** Selepas pengguna melepaskan kawalan, tunjuk nilai yang benar-benar dipakai (selepas had). */
function sync() {
  for (const [key, { num, range }] of inputs) {
    const v = model.params[key];
    if (typeof v !== 'number') continue;
    if (document.activeElement !== num) num.value = mm(v, 2);
    range.value = v;
  }
  pocketChk.checked = model.params.pocket;
  pocketFields.hidden = !model.params.pocket;
}

function seg(options, current, onPick) {
  const wrap = h('div', { class: 'seg' });
  const paint = (cur) => {
    for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.id === String(cur)));
  };
  for (const o of options) {
    wrap.append(h('button', {
      type: 'button', 'data-id': String(o.id),
      onclick: () => { onPick(o.id); paint(o.id); },
    }, o.label));
  }
  paint(current);
  return wrap;
}

const group = (title, open, ...body) =>
  h('details', { class: 'group', ...(open ? { open: true } : {}) },
    h('summary', {}, title), h('div', { class: 'group-body' }, ...body));

const pocketChk = h('input', {
  type: 'checkbox', ...(state.params.pocket ? { checked: true } : {}),
  onchange: (e) => { state.params.pocket = e.target.checked; rebuild(); sync(); },
});
const pocketFields = h('div', { class: 'group-body', style: 'padding:0' },
  numberRow('pocketDepth', 'Dalam poket', { step: 0.5 }),
  numberRow('pocketClear', 'Kelonggaran poket (setiap sisi)', { step: 0.1 }));

const piecesBox = h('div', { class: 'pieces' });
const acrylicNote = h('p', { class: 'hint' });
const summaryBox = h('div', { class: 'summary' });

function renderStatic() {
  const root = $('#inspector');
  root.replaceChildren(
    h('h2', { class: 'insp-title' }, 'Plak Box'),

    group('Plak yang dimasukkan', true,
      h('p', { class: 'hint', style: 'margin:0' },
        'Saiz LUAR plak, termasuk tapak plak itu sendiri. Kotak akrilik dan tapak dikira daripada saiz ini.'),
      numberRow('plakL', 'Panjang (kiri ke kanan)'),
      numberRow('plakW', 'Lebar (depan ke belakang)'),
      numberRow('plakH', 'Tinggi')),

    group('Kotak akrilik', true,
      h('div', { class: 'field' },
        h('label', {}, 'Tebal akrilik'),
        seg([2, 3, 4, 5].map((v) => ({ id: v, label: `${v} mm` })), state.params.acrylic,
          (v) => { state.params.acrylic = v; rebuild(); sync(); })),
      numberRow('gap', 'Ruang di keliling plak', { hint: 'Jarak antara plak dan dinding akrilik, setiap sisi.' }),
      numberRow('gapTop', 'Ruang di atas plak'),
      h('div', { class: 'field' }, h('label', {}, 'Keping untuk dipotong'), piecesBox),
      acrylicNote),

    group('Tapak cetak 3D', true,
      numberRow('baseH', 'Tinggi tapak'),
      numberRow('rim', 'Bibir di luar alur'),
      numberRow('grooveDepth', 'Dalam alur akrilik', { step: 0.5 }),
      numberRow('grooveClear', 'Kelonggaran alur (setiap sisi)', { step: 0.05,
        hint: 'Lebar alur = tebal akrilik + 2 × kelonggaran. 0.3–0.5 mm biasanya muat untuk PLA.' }),
      h('label', { class: 'check' }, pocketChk, ' Poket untuk tapak plak (supaya plak tidak bergeser)'),
      pocketFields,
      numberRow('stepW', 'Tepi bertingkat: lebar', { step: 0.5, hint: '0 = tepi lurus tanpa tingkat.' }),
      numberRow('stepH', 'Tepi bertingkat: dalam', { step: 0.5 }),
      h('div', { class: 'field' },
        h('label', {}, 'Warna pratonton'),
        h('div', { class: 'swatches' }, COLORS.map((c) => h('button', {
          type: 'button', title: c.name, 'aria-pressed': String(c.id === state.color),
          style: `background:${c.id}`,
          onclick: (e) => {
            state.color = c.id;
            for (const b of e.target.parentNode.children) b.setAttribute('aria-pressed', String(b === e.target));
            rebuild();
          },
        })))),
      h('p', { class: 'hint' }, 'Tapak pepejal sepenuhnya - ketumpatan (infill) ditetapkan dalam Bambu Studio.')),

    group('Ringkasan', true, summaryBox),
  );
}

function renderDynamic() {
  const d = model.derived;
  const p = model.params;
  piecesBox.replaceChildren(...d.panels.map((q) => h('div', { class: 'piece' },
    h('span', { class: 'qty' }, `${q.qty}×`),
    h('b', {}, q.name),
    h('span', { class: 'mm' }, `${mm(q.w)} × ${mm(q.h)} mm`))));
  acrylicNote.textContent =
    `Akrilik ${p.acrylic} mm, tanpa tanggam: depan dan belakang penuh, kiri dan kanan masuk di antaranya, `
    + `atas duduk di atas keempat-empat dinding. Selotip lebih kurang ${mm(d.tape / 1000, 2)} m untuk 8 sambungan. `
    + 'Fail SVG potong akrilik akan datang dalam Bahagian 2.';
  const stat = (k, v) => h('div', { class: 'stat' }, h('span', {}, k), h('b', {}, v));
  summaryBox.replaceChildren(
    stat('Tapak', `${mm(d.baseL)} × ${mm(d.baseW)} × ${mm(p.baseH)} mm`),
    stat('Kotak akrilik (luar)', `${mm(d.coverOutL)} × ${mm(d.coverOutW)} × ${mm(d.coverH)} mm`),
    stat('Tinggi keseluruhan', `${mm(d.totalH)} mm`),
    stat('Isipadu tapak', `${mm(model.stats.volumeMm3 / 1000)} cm³`),
    stat('Berat jika 100% pepejal', `${Math.round(model.stats.gramsSolid)} g PLA`),
    stat('Segitiga STL', `${model.stats.triangles}`),
  );
}

// ------------------------------------------------------------ bar atas & pentas
document.querySelectorAll('.vt').forEach((b) => {
  b.setAttribute('aria-selected', String(b.dataset.show === state.show));
  b.addEventListener('click', () => {
    state.show = b.dataset.show;
    document.querySelectorAll('.vt').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    rebuild();
  });
});

const pick = $('#backdropPick');
for (const [id, bg] of [['light', '#f4f5f7'], ['dark', '#3a3a3e']]) {
  pick.append(h('button', {
    type: 'button', title: id === 'light' ? 'Latar cerah' : 'Latar gelap',
    'aria-pressed': String(state.backdrop === id), style: `background:${bg}`,
    onclick: (e) => {
      state.backdrop = id;
      $('#stage').dataset.backdrop = id;
      for (const x of pick.children) x.setAttribute('aria-pressed', String(x === e.target));
      rebuild();
    },
  }));
}
$('#stage').dataset.backdrop = state.backdrop;
$('#frameBtn').addEventListener('click', () => view.frame());

// ------------------------------------------------------------ export
const exportDlg = $('#exportDlg');
$('#exportBtn').addEventListener('click', () => {
  const d = model.derived;
  const p = model.params;
  $('#exportSummary').textContent =
    `STL binari satu jasad: tapak ${mm(d.baseL)} × ${mm(d.baseW)} × ${mm(p.baseH)} mm, `
    + `${model.stats.triangles} segitiga, isipadu ${mm(model.stats.volumeMm3 / 1000)} cm³.`;
  $('#exportNote').textContent =
    'Sudah menghadap betul: bawah rata di plat, alur ke atas. Tiada sokongan diperlukan - '
    + 'setiap permukaan sama ada rata menghadap ke atas atau tegak.';
  exportDlg.showModal();
});
exportDlg.addEventListener('close', () => {
  if (exportDlg.returnValue !== 'stl') return;
  const d = model.derived;
  const p = model.params;
  const tag = `${mm(d.baseL, 0)}x${mm(d.baseW, 0)}x${mm(p.baseH, 0)}`;
  const buf = trianglesToStl(model.mesh, `SifuLaser Plak Box tapak ${tag}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'model/stl' }));
  a.download = `plakbox-tapak-${tag}.stl`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  showHint('Fail STL dimuat turun');
});

// ------------------------------------------------------------ cara pasang
$('#helpBtn').addEventListener('click', () => {
  const steps = [
    ['Muat turun STL dan buka dalam Bambu Studio (atau slicer lain).',
      'Ia sudah menghadap betul. Tetapkan infill dan dinding dalam slicer.'],
    ['Potong 5 keping akrilik ikut senarai "Keping untuk dipotong".',
      'Kupas kertas pelindung hanya selepas siap dipasang.'],
    ['Berdirikan depan dan belakang, masukkan kiri dan kanan di antaranya.',
      'Lekat selotip pada empat bucu tegak.'],
    ['Letak keping atas di atas keempat-empat dinding.', 'Lekat selotip pada empat tepinya.'],
    ['Letak plak dalam poket tapak, kemudian turunkan kotak akrilik ke dalam alur.',
      'Kalau terlalu ketat, naikkan kelonggaran alur 0.1 mm dan cetak semula.'],
  ];
  $('#assembleSteps').replaceChildren(...steps.map(([a, b]) => h('li', {}, a, ' ', h('span', {}, b))));
  $('#helpDlg').showModal();
});

renderStatic();
rebuild();
sync();

if (new URLSearchParams(location.search).has('debug')) {
  window.__app = { state, rebuild, get model() { return model; }, view };
}
