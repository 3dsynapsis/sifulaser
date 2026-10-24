// Reka bentuk tersimpan: tukar keadaan dulang kepada rekod akaun dan kembali.
//
// Yang disimpan ialah TETAPAN (saiz, mod laser/cetak, bahan, petak, pembahagi,
// tetapan cetak dan fail potong), bukan fail SVG atau STL - beberapa ratus
// bait, boleh diedit semula, dan sentiasa dibina dengan versi alat yang
// terkini. Penyimpanan itu sendiri (Firestore, galeri) dalam designs.js dan
// cloud.js, sama seperti alat lain; fail ini hanya bentuk datanya.
//
// params ialah tetapan rata (<= 40 kunci - firestore.rules). Pokok belahan
// mod cetak (params.layout) bersarang dan boleh dalam, jadi ia pergi ke
// extra sebagai teks bersama tetapan pratonton dan fail potong.
//
// Tiada DOM; diuji oleh scripts/test-tray-designs.mjs.

import { DEFAULTS, cleanFractions } from './geom/tray.js';
import { PRINT_DEFAULTS, PRINTERS } from './geom/tray3d.js';
import { cleanTree } from './geom/layout.js';
import { SHEETS, DEFAULT_SHEET } from './export.js';
import { MATERIALS, FILAMENTS } from './store.js';

/** Nama dalam bar atas yang bermaksud "belum dinamakan". */
export const UNTITLED = 'Dulang tanpa nama';
const DEFAULT_MATERIAL = 'falcata3';
const DEFAULT_FILAMENT = 'pla-putih';

const r1 = (v) => Math.round(Number(v) * 10) / 10;

/** Kunci params yang disimpan, dengan lalai masing-masing. */
const PARAMS = {
  ...DEFAULTS,
  ...PRINT_DEFAULTS,
  mode: 'laser',
  // Saiz katil 'custom' - hanya dibaca bila printer === 'custom'.
  bedX: null, bedY: null, bedZ: null,
};

export function defaultState() {
  const m = MATERIALS.find((x) => x.id === DEFAULT_MATERIAL);
  return {
    params: {
      ...PARAMS,
      thickness: m.t,
      kerf: m.kerf,
      cols: DEFAULTS.cols.slice(),
      rows: DEFAULTS.rows.slice(),
      layout: null,
    },
    material: DEFAULT_MATERIAL,
    filament: DEFAULT_FILAMENT,
    sheet: DEFAULT_SHEET,
    showLabels: true,
    name: UNTITLED,
  };
}

/** Nama automatik: saiz dan mod. Dipakai selagi pengguna tidak menamakannya sendiri. */
export const autoName = (state) => {
  const p = state.params;
  return `Dulang ${r1(p.length)} x ${r1(p.width)} x ${r1(p.height)} mm`
    + (p.mode === 'cetak' ? ' (cetak 3D)' : ' (laser)');
};

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Satu nilai params yang sah untuk kunci k, atau undefined. */
function cleanParam(k, v) {
  const d = PARAMS[k];
  if (k === 'cols' || k === 'rows') {
    const out = cleanFractions(v, []);
    return out.length ? out : undefined;
  }
  if (k === 'mode') return v === 'cetak' || v === 'laser' ? v : undefined;
  if (k === 'printer') return v === 'custom' || PRINTERS.some((q) => q.id === v) ? v : undefined;
  // floorOffset dan saiz katil: nombor, atau null (= ikut lalai).
  if (d === null) return v === null || (finite(v) && v > 0) ? v : undefined;
  if (typeof d === 'number') return finite(v) ? v : undefined;
  if (typeof d === 'boolean') return typeof v === 'boolean' ? v : undefined;
  if (typeof d === 'string') return typeof v === 'string' && v.length <= 40 ? v : undefined;
  return undefined;
}

/** Parameter untuk disimpan: kunci yang alat ini faham sahaja, nilai rosak jatuh ke lalai. */
export function designParams(state) {
  const base = defaultState().params;
  const out = {};
  for (const k of Object.keys(PARAMS)) {
    const v = cleanParam(k, state.params?.[k]);
    out[k] = v === undefined ? base[k] : v;
  }
  return out;
}

/** Bahan, sebagai teks yang dibaca manusia dalam rekod. */
export function designMaterial(state) {
  if (state.params?.mode === 'cetak') {
    return (FILAMENTS.find((f) => f.id === state.filament) || FILAMENTS[0]).name;
  }
  const m = MATERIALS.find((x) => x.id === state.material) || MATERIALS.find((x) => x.id === DEFAULT_MATERIAL);
  return `${m.name} ${r1(state.params?.thickness ?? m.t)}mm`;
}

/** Selebihnya: pokok petak mod cetak, bahan, warna pratonton, tetapan fail potong. */
export const designExtra = (state) => ({
  layout: state.params?.layout || null,
  material: state.material,
  filament: state.filament,
  sheet: state.sheet,
  showLabels: state.showLabels,
});

function parseExtra(extra) {
  if (typeof extra !== 'string' || !extra) return {};
  try {
    const v = JSON.parse(extra);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Rekod dari akaun -> { name, state }. Setiap nilai disemak: rekod itu data
 * dari pelayan, dan nilai yang rosak mesti jatuh ke lalai, bukan ke NaN dalam
 * mesh. name '' bila rekod memakai nama automatik, supaya ia kekal automatik.
 */
export function readDesign(row) {
  const state = defaultState();
  const src = row && typeof row.params === 'object' && row.params ? row.params : {};
  for (const k of Object.keys(PARAMS)) {
    const v = cleanParam(k, src[k]);
    if (v !== undefined) state.params[k] = v;
  }
  const x = parseExtra(row?.extra);
  if (x.layout && typeof x.layout === 'object') {
    const t = cleanTree(x.layout);
    state.params.layout = t.s ? t : null;
  }
  if (MATERIALS.some((m) => m.id === x.material)) state.material = x.material;
  if (FILAMENTS.some((f) => f.id === x.filament)) state.filament = x.filament;
  if (SHEETS.some((s) => s.id === x.sheet)) state.sheet = x.sheet;
  if (typeof x.showLabels === 'boolean') state.showLabels = x.showLabels;
  const name = typeof row?.name === 'string' ? row.name.trim().slice(0, 120) : '';
  state.name = name && name !== autoName(state) ? name : UNTITLED;
  return { name: state.name === UNTITLED ? '' : state.name, state };
}
