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
