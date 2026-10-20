// Plak Box: input -> buildPlakBox -> paparan 3D + ringkasan -> STL (tapak)
// dan SVG (kotak akrilik, src/acrylic.js).
//
// Satu fail kerana alatnya kecil: tiada editor 2D, tiada undo. Panel tetapan
// dibina SEKALI; perubahan hanya menulis semula pratonton dan bahagian yang
// bergantung pada ukuran (senarai keping akrilik, ringkasan), supaya slider
// yang sedang diseret tidak dibina semula di bawah jari pengguna.

import {
  buildPlakBox, cleanParams, profileOf, BASE_TYPES, DEFAULTS, LIMITS, trianglesToStl, ACRYLIC_OPTIONS,
} from './geom/base.js';
import { plakQuote, orderUrl, orderMessage, PRINT } from './price.js';
import { composeOrderImage, shareOrder } from './share.js';
import * as gallery from './designs.js';
import { signedIn } from './cloud.js';
import {
  autoName, designParams, designMaterial, designExtra, readDesign, designLink, readDesignLink,
} from './saved.js';
import { View3D } from './view3d.js';
import {
  acrylicFiles, SHEETS as ACR_SHEETS, DEFAULT_SHEET as ACR_SHEET, DEFAULT_KERF, cleanKerf,
} from './acrylic.js';

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
  // Nama reka bentuk dalam akaun; kosong = nama automatik ikut saiz plak.
  name: typeof saved.name === 'string' ? saved.name.slice(0, 120) : '',
  // Kuantiti untuk sebut harga (set).
  qty: Number.isSafeInteger(saved.qty) && saved.qty >= 1 && saved.qty <= 999 ? saved.qty : 1,
  // Tetapan fail potong akrilik: saiz katil laser, kerf, label.
  acr: {
    sheet: ACR_SHEETS.some((x) => x.id === saved.acr?.sheet) ? saved.acr.sheet : ACR_SHEET,
    kerf: cleanKerf(saved.acr?.kerf ?? DEFAULT_KERF),
    labels: saved.acr?.labels === true,
  },
};
// Jenis yang tersimpan tetapi sudah dibuang (Terapung) kembali ke Standard.
if (!BASE_TYPES.some((t) => t.id === state.params.type)) state.params.type = DEFAULTS.type;
// Dibuka dari pautan dalam mesej order WhatsApp (saved.js, designLink): reka
// bentuk itu tepat-tepat, menggantikan yang tersimpan dalam pelayar ini.
const fromLink = readDesignLink(location.search, COLORS);
if (fromLink) {
  state.params = fromLink.params;
  state.name = '';
  if (fromLink.color) state.color = fromLink.color;
}
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
function showHint(text, ms = 1800) {
  const el = $('#stageHint');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), ms);
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
  renderPrice();
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

// ---- harga: untuk pelanggan yang mahu order terus dari sini
const priceRange = h('div', { class: 'price-big' });
const priceSub = h('p', { class: 'muted price-sub' });
const qtyIn = h('input', {
  type: 'number', min: 1, max: 999, step: 1, value: state.qty, inputmode: 'numeric',
  oninput: (e) => {
    const n = Math.floor(Number(e.target.value));
    if (Number.isFinite(n) && n >= 1 && n <= 999) { state.qty = n; save(); renderPrice(); }
  },
  onchange: (e) => { e.target.value = state.qty; },
});
const orderBtn = h('a', {
  class: 'primary order-btn', target: '_blank', rel: 'noopener',
  // Pelanggan yang order: reka bentuknya disimpan juga (kalau sudah daftar
  // masuk), supaya staff dan pelanggan boleh membukanya semula.
  onclick: () => { void gallery.saveQuietly(galleryStore); },
}, 'Order melalui WhatsApp');
// Pilihan kedua: gambar 3D + butiran + mesej yang sama, melalui menu kongsi
// telefon (share.js). Pelanggan memilih chat kedai sendiri.
const shareBtn = h('button', { type: 'button', class: 'ghost share-btn', onclick: () => shareWithImage() },
  'Kongsi dengan gambar');

function shareWithImage() {
  const q = plakQuote(model, { qty: state.qty, sheet: state.acr.sheet });
  const p = model.params;
  const d = model.derived;
  const colorName = COLORS.find((c) => c.id === state.color)?.name || '';
  const text = orderMessage(model, q, { color: colorName, link: designLink(state.params, { color: state.color }) });
  // Gambar sentiasa pandangan "Siap" (kotak + plak), walaupun skrin di "Tapak
  // sahaja"; kamera pengguna dipulangkan selepas itu.
  const other = state.show !== 'siap';
  const cam = { p: view.camera.position.clone(), t: view.controls.target.clone() };
  if (other) view.build(model, { show: 'siap', color: state.color, backdrop: 'light' });
  const shot = view.snapshot(1080, 1080);
  if (other) {
    view.build(model, { show: state.show, color: state.color, backdrop: state.backdrop });
    view.camera.position.copy(cam.p);
    view.controls.target.copy(cam.t);
    view.controls.update();
  }
  const typeName = BASE_TYPES.find((t) => t.id === p.type).name;
  const canvas = composeOrderImage(shot, {
    title: `Plak Box · ${typeName}`,
    price: q.state === 'priced' ? q.totalText : 'Sebut harga',
    lines: [
      `Plak ${mm(p.plakL)} × ${mm(p.plakW)} × ${mm(p.plakH)} mm${d.slot ? ` · akrilik ${mm(p.sheetT)} mm dalam slot` : ''}`,
      `Tapak ${mm(d.baseL)} × ${mm(d.baseW)} × ${mm(p.baseH)} mm${colorName ? ` · ${colorName}` : ''}`,
      `Kotak akrilik Clear ${p.acrylic} mm · ${mm(d.coverOutL)} × ${mm(d.coverOutW)} × ${mm(d.coverH)} mm`,
      `Kuantiti ${state.qty} set · tidak termasuk plak`,
    ],
    footer: 'sifulaser.com/plakbox · Ambil sendiri di Shah Alam',
  });
  void gallery.saveQuietly(galleryStore);
  const how = shareOrder({
    canvas, text, waHref: orderBtn.href, download,
    filename: `plakbox-${p.type}-${mm(p.plakL, 0)}x${mm(p.plakW, 0)}x${mm(p.plakH, 0)}.png`,
  });
  showHint(how === 'share'
    ? 'Pilih WhatsApp, kemudian chat SifuLaser (+60 13-435 4118).'
    : 'Gambar dimuat turun. Lampirkan dalam chat WhatsApp yang dibuka.', 6000);
}

function renderPrice() {
  const q = plakQuote(model, { qty: state.qty, sheet: state.acr.sheet });
  const p = model.params;
  const color = COLORS.find((c) => c.id === state.color)?.name || '';
  orderBtn.href = orderUrl(model, q, { color, link: designLink(state.params, { color: state.color }) });
  if (q.state !== 'priced') {
    priceRange.textContent = 'Minta sebut harga';
    priceSub.textContent = 'Saiz ini perlu disemak staff dahulu.';
    return;
  }
  // Satu harga tepat, tanpa pecahan tapak / akrilik (Boss, 20 Okt 2026).
  // Kiraan di sebaliknya kekal sama - lihat price.js dan README.
  priceRange.textContent = q.totalText;
  priceSub.textContent = `${state.qty > 1 ? `${state.qty} set · ` : 'Seset · '}tapak + kotak akrilik ${p.acrylic} mm, tidak termasuk plak`;
}

const piecesBox = h('div', { class: 'pieces' });
const acrylicNote = h('p', { class: 'hint' });
const summaryBox = h('div', { class: 'summary' });

function renderStatic() {
  const root = $('#inspector');
  root.replaceChildren(
    h('h2', { class: 'insp-title' }, 'Plak Box'),

    group('Harga', true,
      priceRange, priceSub,
      h('div', { class: 'field qty-row' }, h('label', {}, 'Kuantiti (set)'), qtyIn),
      orderBtn,
      shareBtn,
      // Akrilik mudah pecah dalam pos - ambil sendiri sahaja (Boss, 20 Okt 2026).
      h('p', { class: 'hint' }, 'Ambil sendiri di Shah Alam, tiada pos buat masa ini. ',
        h('a', { href: '/ambil/', target: '_top' }, 'Ambil sendiri'), ' · ',
        h('a', { href: '/refund/', target: '_top' }, 'Bayaran balik'), ' · ',
        h('a', { href: '/terma/', target: '_top' }, 'Terma'))),

    h('details', { class: 'group', open: true }, plakTitle, h('div', { class: 'group-body' },
      plakHint,
      numberRow('plakL', 'Panjang (kiri ke kanan)'),
      plakWRow,
      numberRow('plakH', 'Tinggi'),
      sheetRow)),

    group('Kotak akrilik', true,
      h('div', { class: 'field' },
        h('label', {}, 'Tebal akrilik'),
        seg(ACRYLIC_OPTIONS.map((v) => ({ id: v, label: `${v} mm` })), model.params.acrylic,
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
    + 'Fail SVG potongnya di Export.';
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
    stat(`Berat anggaran (infill ${Math.round(PRINT.infill * 100)}%)`, `${Math.round(plakQuote(model).grams)} g PLA`),
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

function download(name, data, type) {
  // Simpan dahulu, sebelum muat turun: simpanan tidak boleh hilang kerana
  // muat turun gagal pada baris sebelumnya.
  void saveAfterExport();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function downloadStl(body) {
  const d = model.derived;
  const p = model.params;
  const tag = `${mm(d.baseL, 0)}x${mm(d.baseW, 0)}x${mm(p.baseH, 0)}`;
  const buf = trianglesToStl(body.mesh, `SifuLaser Plak Box ${body.id} ${p.type} ${tag}`);
  download(`plakbox-${p.type}-${body.id}-${tag}.stl`, buf, 'model/stl');
  showHint(`Fail STL ${body.name.toLowerCase()} dimuat turun`);
}

/**
 * Pratonton satu helaian: kotak helaian, keping di tempatnya, nama setiap
 * keping. Dilukis daripada susunan yang SAMA yang ditulis ke fail.
 */
function sheetPreview(sheet, note = null) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  // Bila nota terpaksa duduk di luar katil, kanvas fail lebih tinggi daripada
  // helaian: pratonton menunjukkan kedua-duanya, helaian di bawah.
  const H = note ? note.canvasH : sheet.h;
  const off = H - sheet.h;
  const svg = el('svg', { viewBox: `0 0 ${sheet.w} ${H}`, role: 'img' });
  svg.append(el('rect', { x: 0, y: off, width: sheet.w, height: sheet.h, fill: 'var(--surface-2, #f3f4f6)', stroke: 'var(--line-strong, #d0d4da)', 'stroke-width': sheet.w / 300 }));
  if (note) {
    // Nota bahan seperti dalam fail: dua baris hijau di atas keping.
    note.lines.forEach((s, i) => {
      const t = el('text', {
        x: note.x, y: H - note.rows[i] + note.caps[i] / 2, 'font-size': note.caps[i] * 1.35,
        fill: '#00a651', 'font-family': 'sans-serif',
      });
      t.textContent = s;
      svg.append(t);
    });
  }
  for (const pl of sheet.placed) {
    const y = H - pl.y - pl.h;   // fail y-ke-atas, pratonton y-ke-bawah
    svg.append(el('rect', { x: pl.x, y, width: pl.w, height: pl.h, fill: '#dbeef4', stroke: '#e0453a', 'stroke-width': sheet.w / 400 }));
    const t = el('text', {
      x: pl.x + pl.w / 2, y: y + pl.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': Math.min(pl.h * 0.22, pl.w * 0.16, sheet.w / 22), fill: '#3c4a52',
    });
    t.textContent = pl.piece.label + (pl.rot ? ' ↻' : '');
    svg.append(t);
  }
  return svg;
}

function renderAcrylicExport() {
  const root = $('#acrylicExport');
  const p = model.params;
  const files = acrylicFiles(model, state.acr);
  const nBox = files.box.length;
  const over = files.box.some((f) => f.sheet.overflow);
  const pieces = model.derived.panels.map((q) => `${q.qty}× ${q.name} ${mm(q.w)} × ${mm(q.h)}`).join(', ');
  const sheetSel = h('select', {
    onchange: (e) => { state.acr.sheet = e.target.value; save(); renderAcrylicExport(); },
  }, ACR_SHEETS.map((x) => h('option', { value: x.id, ...(x.id === state.acr.sheet ? { selected: true } : {}) }, x.name)));
  const kerfIn = h('input', {
    type: 'number', min: 0, max: 1, step: 0.01, value: state.acr.kerf,
    onchange: (e) => { state.acr.kerf = cleanKerf(e.target.value); save(); renderAcrylicExport(); },
  });
  const labelsChk = h('input', {
    type: 'checkbox', ...(state.acr.labels ? { checked: true } : {}),
    onchange: (e) => { state.acr.labels = e.target.checked; save(); renderAcrylicExport(); },
  });
  // replaceChildren menulis null sebagai teks "null" - buang dahulu.
  root.replaceChildren(...[
    h('p', { class: 'muted' },
      `${p.acrylic} mm akrilik jernih, 5 keping tanpa tanggam: ${pieces} mm (saiz siap). `
      + `Setiap garis potong dibesarkan ${mm(files.kerf / 2, 3)} mm di setiap sisi untuk kerf, `
      + 'jadi keping yang keluar dari mesin ialah saiz itu tepat.'),
    h('div', { class: 'acr-row' },
      h('div', { class: 'field' }, h('label', {}, 'Saiz katil laser / helaian'), sheetSel),
      h('div', { class: 'field' }, h('label', {}, 'Kerf (mm)'), kerfIn)),
    h('label', { class: 'acr-check' }, labelsChk,
      h('span', {}, 'Label nama keping, dalam lapisan kelabu sendiri. Jangan petakan lapisan itu kepada ukiran - akrilik jernih menyimpan setiap tanda.')),
    h('div', { class: 'sheet-prev' }, files.box.map((f, i) => h('figure', {},
      sheetPreview(f.sheet, f.note),
      h('figcaption', {}, `${nBox > 1 ? `Helaian ${i + 1} daripada ${nBox}` : 'Satu helaian'} · `
        + `${f.sheet.placed.length} keping${f.sheet.overflow ? ' · keping lebih besar daripada helaian!' : ''}`
        + (f.sheet.placed.some((x) => x.rot) ? ' · ↻ diputar 90°' : ''))))),
    over ? h('p', { class: 'note warn' }, 'Ada keping yang lebih besar daripada helaian ini. Pilih katil yang lebih besar, atau kecilkan plak.') : null,
    // Setiap helaian dalam dua bentuk: SVG untuk LightBurn / RDWorks, PDF untuk
    // tempat yang tidak boleh membuka SVG. Isinya sama, nota bahan sekali.
    h('div', { class: 'dlg-actions start' },
      files.box.flatMap((f, i) => [
        h('button', {
          type: 'button', class: 'primary',
          onclick: () => { download(f.name, f.svg, 'image/svg+xml'); showHint('Fail SVG kotak akrilik dimuat turun'); },
        }, nBox > 1 ? `SVG helaian ${i + 1}` : 'Muat turun SVG kotak'),
        h('button', {
          type: 'button', class: 'primary',
          onclick: () => { download(f.pdfName, f.pdf, 'application/pdf'); showHint('Fail PDF kotak akrilik dimuat turun'); },
        }, nBox > 1 ? `PDF helaian ${i + 1}` : 'Muat turun PDF kotak'),
      ]),
      files.plaque ? h('button', {
        type: 'button', class: 'ghost',
        onclick: () => { download(files.plaque.name, files.plaque.svg, 'image/svg+xml'); showHint('Fail SVG plak dimuat turun'); },
      }, `SVG plak ${p.sheetT} mm`) : null,
      files.plaque ? h('button', {
        type: 'button', class: 'ghost',
        onclick: () => { download(files.plaque.pdfName, files.plaque.pdf, 'application/pdf'); showHint('Fail PDF plak dimuat turun'); },
      }, `PDF plak ${p.sheetT} mm`) : null),
    files.plaque ? h('p', { class: 'hint' },
      `Plak akrilik sekeping ${mm(p.plakL)} × ${mm(p.plakH)} mm dalam fail sendiri: ia ${p.sheetT} mm, dipotong `
      + 'dari helaian lain. Fail itu garis luarnya sahaja - letak reka bentuk plak di dalamnya.') : null,
    h('p', { class: 'hint' }, 'Lapisan Potong merah, garisan 0.1 mm - LightBurn / RDWorks memetakannya terus. '
      + `Setiap fail ada nota bahan untuk pekerja ("Acrylic ${p.acrylic}mm Clear", helaian, bilangan keping) `
      + 'dalam lapisan Nota hijau - matikan Output lapisan itu, ia untuk dibaca sahaja. '
      + 'Kupas kertas pelindung hanya selepas kotak siap dipasang.'),
  ].filter(Boolean));
}

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
  $('#exportActions').replaceChildren(...model.bodies.map((bd) => h('button', {
    type: 'button', class: 'primary', onclick: () => downloadStl(bd),
  }, model.bodies.length > 1 ? `STL ${bd.name.toLowerCase()}` : 'Muat turun STL')));
  renderAcrylicExport();
  exportDlg.showModal();
  void saveAfterExport();
});

// ------------------------------------------------------------ reka bentuk tersimpan
// Sama seperti alat lain (Box Maker, Rehal, Cake Topper...): butang Simpan dan
// galeri "Reka bentuk saya" di bar atas, dan reka bentuk disimpan SENDIRI ke
// akaun bila Export ditekan dan bila fail dimuat turun (Boss, 20 Okt 2026).
// Export sudah meminta daftar masuk (/shared/export-gate.js), jadi pada saat
// itu sesi sudah ada. Satu reka bentuk dikemas kini di tempatnya, bukan entri
// baharu setiap kali.

/** Apa yang galeri boleh lihat dan ubah - sempit dengan sengaja. */
const galleryStore = {
  name: () => state.name || autoName(state.params),
  params: () => designParams(state.params),
  material: () => designMaterial(model.params),
  extra: () => designExtra(state),
  rename: (name) => { state.name = name === autoName(state.params) ? '' : name; save(); },
  apply: (row) => applyDesign(row),
};

function applyDesign(row) {
  const d = readDesign(row, COLORS);
  state.params = d.params;
  state.name = d.name;
  state.acr = d.acr;
  if (d.color) state.color = d.color;
  rebuild();
  renderStatic();   // segmen dan warna dibina dengan nilai semasa
  sync();
}

const savedLine = $('#exportSaved');
async function saveAfterExport() {
  if (!signedIn()) { savedLine.hidden = true; return; }
  savedLine.hidden = false;
  savedLine.textContent = 'Menyimpan dalam "Reka bentuk saya"...';
  const ok = await gallery.saveQuietly(galleryStore);
  savedLine.textContent = ok
    ? `✓ Disimpan dalam "Reka bentuk saya" sebagai "${galleryStore.name()}" - buka semula bila-bila masa dari bar atas.`
    : 'Tak dapat simpan ke akaun kali ini. Fail tetap boleh dimuat turun.';
}

const dialogFiller = (build) => function fill(dlg) {
  const close = () => dlg.close();
  dlg.replaceChildren(build(h, galleryStore, close, () => fill(dlg)));
};
const fillSaveDialog = dialogFiller(gallery.saveDialogBody);
const fillFilesDialog = dialogFiller(gallery.filesDialogBody);
$('#saveBtn').addEventListener('click', () => { fillSaveDialog($('#saveDlg')); $('#saveDlg').showModal(); });
$('#filesBtn').addEventListener('click', () => { fillFilesDialog($('#filesDlg')); $('#filesDlg').showModal(); });

// ------------------------------------------------------------ cara pasang
$('#helpBtn').addEventListener('click', () => {
  const p = model.params;
  const slotStep = [
    `Cucuk plak akrilik ${mm(p.plakL)} × ${mm(p.plakH)} × ${mm(p.sheetT)} mm tegak ke dalam slot di tengah tapak.`,
    'Kalau terlalu ketat, naikkan kelonggaran slot 0.05 mm dan cetak semula. Kemudian turunkan kotak akrilik ke dalam alur.'];
  const steps = [
    ['Muat turun STL dan buka dalam Bambu Studio (atau slicer lain).',
      'Ia sudah menghadap betul dan tidak perlu support. Tetapkan infill dan dinding dalam slicer.'],
    ['Potong 5 keping akrilik daripada fail SVG (Export → Kotak akrilik).',
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

// Pautan order: tetapan dibuang dari URL selepas dibaca (ia sudah disimpan
// dalam pelayar), supaya muat semula tidak membuang perubahan seterusnya.
if (fromLink) {
  const url = new URL(location.href);
  for (const k of [...Object.keys(DEFAULTS), 'warna']) url.searchParams.delete(k);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  showHint('Reka bentuk dari pautan order dibuka. Tekan Export untuk fail STL / SVG / PDF.', 6000);
}

// Datang dari galeri alat lain: ?design=<id>. Selepas lukisan pertama, supaya
// alat sudah boleh diguna walaupun akaun lambat menjawab; parameter dibuang
// selepas itu supaya muat semula tidak membuang perubahan seterusnya.
{
  const wanted = new URLSearchParams(location.search).get('design');
  if (wanted) {
    gallery.openById(galleryStore, wanted).finally(() => {
      const url = new URL(location.href);
      url.searchParams.delete('design');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    });
  }
}

if (new URLSearchParams(location.search).has('debug')) {
  window.__app = { state, rebuild, get model() { return model; }, view, galleryStore };
}
