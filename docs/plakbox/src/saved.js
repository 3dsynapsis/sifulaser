// Reka bentuk tersimpan: tukar keadaan alat kepada rekod akaun dan kembali.
//
// Yang disimpan ialah TETAPAN (saiz plak, jenis tapak, tebal akrilik, warna,
// tetapan fail potong), bukan fail STL atau SVG - beberapa ratus bait, boleh
// diedit semula, dan sentiasa dibina dengan versi alat yang terkini.
// Penyimpanan itu sendiri (Firestore, galeri) dalam designs.js dan cloud.js,
// sama seperti alat lain; fail ini hanya bentuk datanya.
//
// Tulen: tiada DOM, diuji oleh scripts/test-plakbox.mjs.

import { DEFAULTS, BASE_TYPES } from './geom/base.js';
import { SHEETS, DEFAULT_SHEET, DEFAULT_KERF, cleanKerf } from './acrylic.js';

const r1 = (v) => Math.round(Number(v) * 10) / 10;

/** Nama automatik: saiz plak. Dipakai selagi pengguna tidak menamakannya sendiri. */
export const autoName = (params) =>
  `Plak Box ${r1(params.plakL)} x ${r1(params.plakW)} x ${r1(params.plakH)} mm`;

/**
 * Parameter untuk disimpan: kunci DEFAULTS sahaja. Simpanan pelayar yang lama
 * mungkin membawa kunci jenis yang sudah dibuang (Terapung), dan peraturan
 * Firestore mengehadkan params kepada 40 kunci - jadi hanya yang alat ini
 * faham hari ini yang dihantar.
 */
export function designParams(params) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = params?.[k];
    out[k] = typeof v === typeof DEFAULTS[k] && (typeof v !== 'number' || Number.isFinite(v)) ? v : DEFAULTS[k];
  }
  return out;
}

/** Bahan, sebagai teks yang dibaca manusia dalam rekod. */
export const designMaterial = (params) => `Akrilik Clear ${params.acrylic}mm`;

/** Selebihnya - warna tapak dan tetapan fail potong - sebagai satu objek kecil. */
export const designExtra = (state) => ({
  color: state.color,
  acr: { sheet: state.acr.sheet, kerf: state.acr.kerf, labels: state.acr.labels },
});

/**
 * Rekod dari akaun -> keadaan alat. Setiap nilai disemak: rekod itu data dari
 * pelayan, dan nilai yang rosak mesti jatuh ke lalai, bukan ke NaN dalam mesh.
 * `colors` ialah senarai warna alat ({ id }); warna yang tiada dalam senarai
 * diabaikan.
 */
export function readDesign(row, colors = []) {
  const params = { ...DEFAULTS };
  for (const [k, v] of Object.entries(row?.params || {})) {
    if (!(k in DEFAULTS)) continue;
    if (typeof v !== typeof DEFAULTS[k]) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    params[k] = v;
  }
  if (!BASE_TYPES.some((t) => t.id === params.type)) params.type = DEFAULTS.type;

  let extra = {};
  try {
    const x = JSON.parse(row?.extra || '{}');
    if (x && typeof x === 'object') extra = x;
  } catch { /* extra rosak: abaikan, tetapan lain masih dibuka */ }
  const a = extra.acr && typeof extra.acr === 'object' ? extra.acr : {};
  const out = {
    params,
    // Nama yang sama dengan nama automatik kekal automatik, supaya ia ikut saiz
    // bila plak diubah selepas dibuka.
    name: row?.name && row.name !== autoName(params) ? String(row.name) : '',
    acr: {
      sheet: SHEETS.some((s) => s.id === a.sheet) ? a.sheet : DEFAULT_SHEET,
      kerf: cleanKerf(a.kerf ?? DEFAULT_KERF),
      labels: a.labels === true,
    },
  };
  if (colors.some((c) => c.id === extra.color)) out.color = extra.color;
  return out;
}

// ---- pautan reka bentuk -----------------------------------------------------
// Mesej "Order melalui WhatsApp" membawa pautan yang membuka reka bentuk itu
// tepat-tepat di alat ini. WhatsApp tidak boleh membawa fail dari laman web
// (wa.me hanya teks), jadi staff klik pautan itu, nampak 3D-nya, dan Export
// STL / SVG / PDF sendiri - fail yang sama yang pelanggan nampak. Tiada akaun,
// tiada pelayan: tetapan itu sendiri ada dalam URL.

export const LINK_BASE = 'https://sifulaser.com/plakbox/';
const LINK_ALWAYS = ['plakL', 'plakW', 'plakH', 'acrylic', 'type'];
// 0.001 mm: lebih halus daripada mana-mana input (langkah 0.05), jadi saiz
// yang dibuka semula sama dengan yang dipesan.
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Pautan bagi reka bentuk ini. Saiz plak, tebal akrilik dan jenis sentiasa
 * ditulis (supaya mudah dibaca dalam mesej); yang lain hanya bila berbeza
 * daripada lalai. `color` ialah id warna ('#6b4430'), ditulis sebagai `warna`.
 */
export function designLink(params, { color } = {}) {
  const p = designParams(params);
  const q = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) {
    const v = p[k];
    if (!LINK_ALWAYS.includes(k) && v === DEFAULTS[k]) continue;
    q.set(k, typeof v === 'number' ? String(round3(v)) : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  if (color) q.set('warna', String(color).replace('#', ''));
  return `${LINK_BASE}?${q}`;
}

/**
 * URL -> reka bentuk, atau null bila URL tidak membawa satu pun tetapan
 * (contohnya ?debug). Nilai yang rosak diabaikan dan lalai digunakan; had
 * saiz dikenakan oleh buildPlakBox seperti biasa.
 */
export function readDesignLink(search, colors = []) {
  const q = new URLSearchParams(search);
  const params = {};
  for (const [k, d] of Object.entries(DEFAULTS)) {
    if (!q.has(k)) continue;
    const raw = q.get(k).trim();
    if (typeof d === 'number') {
      const v = Number(raw);
      if (raw !== '' && Number.isFinite(v)) params[k] = v;
    } else if (typeof d === 'boolean') {
      if (['1', 'true'].includes(raw)) params[k] = true;
      else if (['0', 'false'].includes(raw)) params[k] = false;
    } else {
      params[k] = raw;
    }
  }
  if (!Object.keys(params).length) return null;
  const out = { params: readDesign({ params }, colors).params };
  const c = q.get('warna');
  if (c && colors.some((x) => x.id === `#${c}`)) out.color = `#${c}`;
  return out;
}
