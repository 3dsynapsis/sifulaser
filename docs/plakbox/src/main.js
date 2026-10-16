// Plak Box: input -> buildPlakBox -> paparan 3D + ringkasan -> STL.
//
// Satu fail kerana alatnya kecil: tiada editor 2D, tiada undo. Panel tetapan
// dibina SEKALI; perubahan hanya menulis semula pratonton dan bahagian yang
// bergantung pada ukuran (senarai keping akrilik, ringkasan), supaya slider
// yang sedang diseret tidak dibina semula di bawah jari pengguna.

import {
  buildPlakBox, cleanParams, profileOf, BASE_TYPES, DEFAULTS, LIMITS, trianglesToStl,
} from './geom/base.js';
import { View3D } from './view3d.js';

const $ = (s) => document.querySelector(s);
// v2: jenis tapak, dan bibir kini diukur dari tepi permukaan atas (lalai 8 -
// tapak Standard kekal 280.8 mm). Simpanan v1 diabaikan supaya bibir 12 lama
// tidak tiba-tiba membesarkan tapak.
const KEY = 'sifulaser.plakbox.v2';

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
  // Paparan "angkat" dahulu satu tab; kini butang animasi di atas pentas.
  show: saved.show === 'tapak' ? 'tapak' : 'siap',
  color: COLORS.some((c) => c.id === saved.color) ? saved.color : COLORS[0].id,
  backdrop: saved.backdrop === 'dark' ? 'dark' : 'light',
};
// Jenis yang tersimpan tetapi sudah dibuang (Terapung) kembali ke Standard.
if (!BASE_TYPES.some((t) => t.id === state.params.type)) state.params.type = DEFAULTS.type;
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
const isSlot = () => !!model.derived.slot;
const ACRYLIC_G_PER_CM3 = 1.19;

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
  paintLift();
  save();
}

// ------------------------------------------------------------ butang angkat
// Macam "Open the box" dalam Box Maker: kotak akrilik terangkat dari alur
// (atau plak tercabut dari slot) secara beranimasi, dan turun semula.
const liftBtn = $('#liftBtn');
function paintLift() {
  liftBtn.hidden = state.show === 'tapak';
  const up = view.lifted;
  liftBtn.replaceChildren(h('span', { class: 'arrow', 'aria-hidden': 'true' }, up ? '↓' : '↑'),
    up ? 'Turunkan kotak' : 'Angkat kotak');
  liftBtn.setAttribute('aria-pressed', String(up));
  liftBtn.title = up ? 'Turunkan kotak akrilik ke dalam alur'
    : isSlot() ? 'Angkat kotak akrilik dari tapak - plak pun terangkat keluar dari slot'
      : 'Angkat kotak akrilik dari tapak';
}
liftBtn.addEventListener('click', () => { view.setLifted(!view.lifted); paintLift(); });

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
  const type = state.params.type;
  for (const b of typeCards.children) b.setAttribute('aria-pressed', String(b.dataset.id === type));
  const shown = typeFields[type] || [];
  for (const el of fieldBlocks) el.hidden = !shown.includes(el);
  typeNote.textContent = BASE_TYPES.find((t) => t.id === type).note + '.';
  frontSeg.paint(model.params.slantFrontOnly ? 'depan' : 'semua');
  sheetSeg.paint(model.params.sheetT);
  // Jenis slot: plak sekeping akrilik dicucuk ke slot di tengah - slot itu
  // menggantikan poket. Kotak akrilik dan alurnya sama seperti jenis lain.
  const slot = type === 'slot';
  pocketBlock.hidden = slot;
  sheetRow.hidden = !slot;
  plakWLabel.textContent = slot ? 'Ruang plak (depan ke belakang)' : 'Lebar (depan ke belakang)';
  plakWHint.hidden = !slot;
  plakTitle.textContent = slot ? 'Plak akrilik' : 'Plak yang dimasukkan';
  plakHint.textContent = slot
    ? 'Plak sekeping akrilik, dicucuk tegak ke dalam slot tepat di tengah tapak. Kotak akrilik dikira daripada saiz ini.'
    : 'Saiz LUAR plak, termasuk tapak plak itu sendiri. Kotak akrilik dan tapak dikira daripada saiz ini.';
}

function seg(options, current, onPick) {
  const wrap = h('div', { class: 'seg' });
  const paint = (cur) => {
    for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.id === String(cur)));
  };
  wrap.paint = paint;
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

// ---- jenis tapak
/** Keratan rentas kecil bagi satu jenis, dari profil sebenar pada nilai lalai. */
function profileIcon(type) {
  const def = BASE_TYPES.find((t) => t.id === type);
  const { p } = cleanParams({ ...DEFAULTS, type, baseH: def.baseH });
  const prof = profileOf(p);
  const k = 24 / p.baseH, half = 17, floor = 36;
  const R = prof.map((q) => `${(32 + half + q.o.r * k).toFixed(2)},${(floor - q.z * k).toFixed(2)}`);
  const L = prof.slice().reverse().map((q) => `${(32 - half - q.o.l * k).toFixed(2)},${(floor - q.z * k).toFixed(2)}`);
  const topY = floor - p.baseH * k;
  const wall = half - p.rim * k * 0.6;
  // Dinding kotak akrilik; jenis slot juga plak sekeping yang terbenam di tengah.
  const sheet = type === 'slot'
    ? `<path d="M32 ${(topY + p.slotDepth * k).toFixed(2)}V9" stroke="#8fb8c7" stroke-width="2.4" fill="none"/>`
    : '';
  return '<svg viewBox="0 0 64 40" aria-hidden="true">'
    + `<polygon points="${[...R, ...L].join(' ')}" fill="currentColor"/>`
    + `<path d="M${32 - wall} ${topY + 1}V2M${32 + wall} ${topY + 1}V2" stroke="#8fb8c7" stroke-width="1.6" fill="none"/>`
    + `${sheet}</svg>`;
}

function pickType(id) {
  const def = BASE_TYPES.find((t) => t.id === id);
  state.params.type = id;
  state.params.baseH = def.baseH; // setiap jenis ada tinggi yang sesuai dengan profilnya
  rebuild();
  sync();
}

const typeCards = h('div', { class: 'types', role: 'group', 'aria-label': 'Jenis tapak' },
  BASE_TYPES.map((t) => {
    const b = h('button', { type: 'button', 'data-id': t.id, title: t.note, onclick: () => pickType(t.id) });
    b.innerHTML = profileIcon(t.id);
    b.append(h('span', {}, t.name));
    return b;
  }));
const typeNote = h('p', { class: 'hint' });
const frontSeg = seg([{ id: 'semua', label: 'Semua sisi' }, { id: 'depan', label: 'Depan sahaja' }],
  state.params.slantFrontOnly ? 'depan' : 'semua', (v) => { state.params.slantFrontOnly = v === 'depan'; rebuild(); sync(); });
const sub = (...kids) => h('div', { class: 'group-body', style: 'padding:0' }, ...kids);
const tierSub = sub(
  numberRow('tierInset', 'Tingkat atas masuk ke dalam', { step: 0.5 }),
  numberRow('tierRatio', 'Tinggi tingkat bawah', { step: 1, unit: '%' }),
  numberRow('tierChamfer', 'Serong tepi tingkat', { step: 0.5, hint: '0 = tepi tajam.' }));
const slotSub = sub(
  numberRow('slotDepth', 'Dalam slot', { step: 0.5, hint: 'Berapa dalam plak terbenam dalam tapak.' }),
  numberRow('slotClear', 'Kelonggaran slot (setiap sisi)', { step: 0.05,
    hint: 'Lebar slot = tebal plak + 2 × kelonggaran. 0.2–0.3 mm muat ketat untuk akrilik potong laser; '
      + 'naikkan 0.05 kalau terlalu ketat.' }),
  h('p', { class: 'hint' }, 'Slot tegak dan tepat di tengah tapak, jadi plak masuk lurus.'));
const typeBlocks = {
  standard: sub(
    numberRow('stepW', 'Tingkat tepi atas: lebar', { step: 0.5, hint: '0 = blok lurus tanpa tingkat.' }),
    numberRow('stepH', 'Tingkat tepi atas: dalam', { step: 0.5 })),
  serong: sub(
    numberRow('slantAngle', 'Sudut serong (dari tegak)', { step: 0.5, unit: '°' }),
    h('div', { class: 'field' }, h('label', {}, 'Sisi yang serong'), frontSeg),
    h('p', { class: 'hint' }, 'Lebar di bawah, mengecil ke atas - tanpa support pada mana-mana sudut. '
      + '"Depan sahaja" memberi muka depan condong macam podium.')),
  klasik: sub(
    numberRow('ogeeR', 'Saiz lengkung', { step: 0.5,
      hint: 'Lengkung S (ogee) setinggi dan selebar 2 × nilai ini, macam tepi tapak trofi kayu.' })),
};
// Jenis -> blok medan yang ditunjuk. Dua Tingkat dan Dua Tingkat Slot berkongsi
// blok tingkat yang SAMA (satu set input, satu nilai).
const typeFields = {
  standard: [typeBlocks.standard], serong: [typeBlocks.serong], klasik: [typeBlocks.klasik],
  tingkat: [tierSub], slot: [slotSub, tierSub],
};
const fieldBlocks = [typeBlocks.standard, typeBlocks.serong, typeBlocks.klasik, slotSub, tierSub];

const sheetSeg = seg([3, 5, 6, 8, 10].map((v) => ({ id: v, label: `${v} mm` })), state.params.sheetT,
  (v) => { state.params.sheetT = v; rebuild(); sync(); });
const sheetRow = h('div', { class: 'field' }, h('label', {}, 'Tebal plak akrilik'), sheetSeg);
const plakWRow = numberRow('plakW', 'Lebar (depan ke belakang)');
const plakWLabel = plakWRow.querySelector('label');
const plakWHint = h('p', { class: 'hint' }, 'Plak berdiri tepat di tengah ruang ini. '
  + 'Dalam kotak = ruang ini + 2 × ruang di keliling plak.');
plakWRow.append(plakWHint);
const plakTitle = h('summary', {}, 'Plak yang dimasukkan');
const plakHint = h('p', { class: 'hint', style: 'margin:0' });

// Poket untuk tapak plak - tiada pada jenis slot (slot yang memegang plak).
const pocketBlock = sub(
  h('label', { class: 'check' }, pocketChk, ' Poket untuk tapak plak (supaya plak tidak bergeser)'),
  pocketFields);

const piecesBox = h('div', { class: 'pieces' });
const acrylicNote = h('p', { class: 'hint' });
const summaryBox = h('div', { class: 'summary' });

function renderStatic() {
  const root = $('#inspector');
  root.replaceChildren(
    h('h2', { class: 'insp-title' }, 'Plak Box'),

    h('details', { class: 'group', open: true }, plakTitle, h('div', { class: 'group-body' },
      plakHint,
      numberRow('plakL', 'Panjang (kiri ke kanan)'),
      plakWRow,
      numberRow('plakH', 'Tinggi'),
      sheetRow)),

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
      h('div', { class: 'field' }, h('label', {}, 'Jenis tapak'), typeCards),
      typeNote,
      ...fieldBlocks,
      numberRow('baseH', 'Tinggi tapak'),
      numberRow('rim', 'Bibir di luar alur', { hint: 'Permukaan atas yang rata di luar alur akrilik.' }),
      numberRow('grooveDepth', 'Dalam alur akrilik', { step: 0.5 }),
      numberRow('grooveClear', 'Kelonggaran alur (setiap sisi)', { step: 0.05,
        hint: 'Lebar alur = tebal akrilik + 2 × kelonggaran. 0.3–0.5 mm biasanya muat untuk PLA.' }),
      pocketBlock,
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
      h('p', { class: 'hint' }, 'Tapak pepejal sepenuhnya - ketumpatan (infill) ditetapkan dalam Bambu Studio. '
        + 'Semua jenis boleh dicetak tanpa support.')),

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
  const typeName = BASE_TYPES.find((t) => t.id === p.type).name;
  summaryBox.replaceChildren(
    stat('Jenis tapak', typeName),
    stat('Tapak', `${mm(d.baseL)} × ${mm(d.baseW)} × ${mm(p.baseH)} mm`),
    d.namePlate ? stat('Ruang plat nama (depan)', `${mm(d.namePlate.w)} × ${mm(d.namePlate.h)} mm`) : null,
    stat('Kotak akrilik (luar)', `${mm(d.coverOutL)} × ${mm(d.coverOutW)} × ${mm(d.coverH)} mm`),
    d.slot ? stat('Slot (di tengah)', `${mm(d.slot.x1 - d.slot.x0, 2)} × ${mm(d.slot.y1 - d.slot.y0, 2)} × ${mm(d.slot.depth)} mm`) : null,
    d.slot ? stat('Plak akrilik', `${mm(p.plakL)} × ${mm(p.plakH)} × ${mm(p.sheetT)} mm`) : null,
    d.slot ? stat('Berat plak lebih kurang', `${Math.round((p.plakL * p.plakH * p.sheetT / 1000) * ACRYLIC_G_PER_CM3)} g`) : null,
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
  const parts = model.bodies.length > 1 ? `${model.bodies.length} fail STL binari` : 'STL binari satu jasad';
  $('#exportSummary').textContent =
    `${parts}: tapak ${mm(d.baseL)} × ${mm(d.baseW)} × ${mm(p.baseH)} mm, `
    + `${model.stats.triangles} segitiga, isipadu ${mm(model.stats.volumeMm3 / 1000)} cm³.`;
  $('#exportNote').textContent =
    `Sudah menghadap betul: bawah rata di plat, alur${isSlot() ? ' dan slot' : ''} ke atas. `
    + 'Setiap sisi mengecil ke atas atau tegak, jadi tiada support diperlukan.';
  const actions = $('#exportActions');
  actions.replaceChildren(h('button', { value: 'cancel', class: 'ghost' }, 'Batal'),
    ...model.bodies.map((bd) => h('button', { value: bd.id, class: 'primary' },
      model.bodies.length > 1 ? `STL ${bd.name.toLowerCase()}` : 'Muat turun STL')));
  exportDlg.showModal();
});
exportDlg.addEventListener('close', () => {
  const body = model.bodies.find((bd) => bd.id === exportDlg.returnValue);
  if (!body) return;
  const d = model.derived;
  const p = model.params;
  const tag = `${mm(d.baseL, 0)}x${mm(d.baseW, 0)}x${mm(p.baseH, 0)}`;
  const buf = trianglesToStl(body.mesh, `SifuLaser Plak Box ${body.id} ${p.type} ${tag}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'model/stl' }));
  a.download = `plakbox-${p.type}-${body.id}-${tag}.stl`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  showHint(`Fail STL ${body.name.toLowerCase()} dimuat turun`);
});

// ------------------------------------------------------------ cara pasang
$('#helpBtn').addEventListener('click', () => {
  const p = model.params;
  const slotStep = [
    `Cucuk plak akrilik ${mm(p.plakL)} × ${mm(p.plakH)} × ${mm(p.sheetT)} mm tegak ke dalam slot di tengah tapak.`,
    'Kalau terlalu ketat, naikkan kelonggaran slot 0.05 mm dan cetak semula. Kemudian turunkan kotak akrilik ke dalam alur.'];
  const steps = [
    ['Muat turun STL dan buka dalam Bambu Studio (atau slicer lain).',
      'Ia sudah menghadap betul dan tidak perlu support. Tetapkan infill dan dinding dalam slicer.'],
    ['Potong 5 keping akrilik ikut senarai "Keping untuk dipotong".',
      'Kupas kertas pelindung hanya selepas siap dipasang.'],
    ['Berdirikan depan dan belakang, masukkan kiri dan kanan di antaranya.',
      'Lekat selotip pada empat bucu tegak.'],
    ['Letak keping atas di atas keempat-empat dinding.', 'Lekat selotip pada empat tepinya.'],
    isSlot() ? slotStep : ['Letak plak dalam poket tapak, kemudian turunkan kotak akrilik ke dalam alur.',
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
