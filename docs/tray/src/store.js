// Satu sumber kebenaran. Semua yang lain melanggan dan melukis semula.

import { buildTray, DEFAULTS } from './geom/tray.js';
import { buildTray3D, PRINT_DEFAULTS } from './geom/tray3d.js';
// three.js untuk triangulator jasad cetak. Pandangan 3D memuatnya juga, jadi
// ini salinan yang sama dan bukan muat turun kedua.
import * as THREE from '../vendor/three.module.js';

/** Warna filamen untuk pratonton sahaja; STL tidak membawa warna. */
export const FILAMENTS = [
  { id: 'pla-putih', name: 'PLA Putih', color: '#f1f1ee' },
  { id: 'pla-hitam', name: 'PLA Hitam', color: '#2c2c2e' },
  { id: 'pla-kelabu', name: 'PLA Kelabu', color: '#8f9296' },
  { id: 'pla-merah', name: 'PLA Merah', color: '#c9282d' },
  { id: 'pla-biru', name: 'PLA Biru', color: '#2a62c7' },
  { id: 'pla-hijau', name: 'PLA Hijau', color: '#2f8a4e' },
  { id: 'pla-oren', name: 'PLA Oren', color: '#e8761e' },
  { id: 'pla-kuning', name: 'PLA Kuning', color: '#e6c21f' },
  { id: 'pla-kayu', name: 'PLA Kayu', color: '#b98b5a' },
  { id: 'petg-jernih', name: 'PETG Jernih', color: '#cfe3e8' },
];

// `char`: alur CO2 meninggalkan tepi hitam hangus pada kayu, MDF dan kad.
// Akrilik keluar dengan tepi bersih berkilat.
// `grain`: permukaan papan prosedur yang pratonton 3D lukis pada muka.
export const MATERIALS = [
  { id: 'custom', name: 'Bahan sendiri', t: 3, color: '#d2b48c', kerf: 0.2, char: true, grain: 'wood' },
  { id: 'falcata3', name: 'Falcata', t: 3, color: '#efe3c6', kerf: 0.2, char: true, grain: 'wood' },
  { id: 'falcata52', name: 'Falcata', t: 5.2, color: '#efe3c6', kerf: 0.25, char: true, grain: 'wood' },
  { id: 'basswood', name: 'Basswood', t: 3, color: '#e6d2a8', kerf: 0.2, char: true, grain: 'wood' },
  { id: 'mdf3', name: 'MDF', t: 3, color: '#c9a97e', kerf: 0.22, char: true, grain: 'mdf' },
  { id: 'mdf5', name: 'MDF', t: 5, color: '#c9a97e', kerf: 0.26, char: true, grain: 'mdf' },
  { id: 'walnut', name: 'Black Walnut', t: 3, color: '#5d4632', kerf: 0.2, char: true, grain: 'wood' },
  { id: 'sapele', name: 'Sapele', t: 3, color: '#8d4a30', kerf: 0.2, char: true, grain: 'wood' },
  { id: 'acrylic-black', name: 'Akrilik (Hitam)', t: 3, color: '#232323', kerf: 0.15, grain: 'none' },
  { id: 'acrylic-clear', name: 'Akrilik (Jernih)', t: 3, color: '#cfe3e8', kerf: 0.15, grain: 'none' },
  { id: 'acrylic-red', name: 'Akrilik (Merah)', t: 3, color: '#b3202a', kerf: 0.15, grain: 'none' },
  { id: 'card2', name: 'Kadbod', t: 2, color: '#c8ab7f', kerf: 0.3, char: true, grain: 'mdf' },
];

const STORAGE_KEY = 'tray-organizer.project.v1';
const DEFAULT_MATERIAL = 'falcata3';

function initialState() {
  const m = MATERIALS.find((x) => x.id === DEFAULT_MATERIAL) || MATERIALS[0];
  return {
    params: {
      ...DEFAULTS,
      ...PRINT_DEFAULTS,
      // 'laser' (panel + SVG) atau 'cetak' (jasad + STL). Susun atur petak
      // dikongsi; yang bertukar ialah apa yang dibina daripadanya.
      mode: 'laser',
      thickness: m.t,
      kerf: m.kerf,
      cols: DEFAULTS.cols.slice(),
      rows: DEFAULTS.rows.slice(),
    },
    material: DEFAULT_MATERIAL,
    filament: 'pla-putih',
    view: '3d',
    sheet: '600x400',
    backdrop: 'light',
    showLabels: true,
    name: 'Dulang tanpa nama',
    // Petak yang dipilih dalam editor grid; butang "+ Lajur" / "+ Baris"
    // membelah petak INI, bukan petak terbesar.
    selected: { i: 0, j: 0 },
  };
}

export const state = initialState();

let tray = null;
let dirty = true;
const listeners = new Set();
const undoStack = [];
const redoStack = [];
let suspendHistory = false;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getTray() {
  if (dirty || !tray) {
    tray = state.params.mode === 'cetak'
      ? buildTray3D(state.params, THREE)
      : buildTray(state.params);
    dirty = false;
    clampSelection();
  }
  return tray;
}

export const isPrint = () => state.params.mode === 'cetak';

export function setMode(mode) {
  const m = mode === 'cetak' ? 'cetak' : 'laser';
  if (state.params.mode === m) return;
  update((s) => { s.params.mode = m; }, { geometry: true });
}

export const material = () => MATERIALS.find((m) => m.id === state.material)
  || MATERIALS.find((m) => m.id === DEFAULT_MATERIAL);

export const filament = () => FILAMENTS.find((f) => f.id === state.filament) || FILAMENTS[0];

export function setFilament(id) {
  if (!FILAMENTS.some((f) => f.id === id)) return;
  update((s) => { s.filament = id; }, { history: false });
}

function snapshot() {
  return JSON.stringify({ params: state.params, name: state.name, material: state.material });
}

function restore(json) {
  const data = JSON.parse(json);
  state.params = data.params;
  state.name = data.name ?? state.name;
  state.material = data.material ?? state.material;
  dirty = true;
}

/**
 * Laksanakan satu mutasi. `history` merekod titik undo; `geometry` menanda
 * dulang untuk dibina semula. Pemanggil mengelompokkan suntingan berkaitan
 * dengan history:false pada ekornya.
 */
export function update(mutator, { history = true, geometry = false } = {}) {
  if (history && !suspendHistory) {
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  mutator(state);
  if (geometry) dirty = true;
  persist();
  emit();
}

export function setParam(key, value, opts = {}) {
  update((s) => { s.params[key] = value; }, { geometry: true, ...opts });
}

/** Tukar bahan: ketebalan dan kerf ikut, kecuali 'custom' yang kekal apa yang ditaip. */
export function setMaterial(id) {
  const m = MATERIALS.find((x) => x.id === id);
  if (!m) return;
  update((s) => {
    s.material = id;
    if (id !== 'custom') {
      s.params.thickness = m.t;
      s.params.kerf = m.kerf;
    }
  }, { geometry: true });
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  persist();
  emit();
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  persist();
  emit();
}

/** Gabungkan satu seretan (atau satu sesi menaip) menjadi satu entri undo. */
export function beginGesture() {
  if (suspendHistory) return;
  undoStack.push(snapshot());
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  suspendHistory = true;
}

export function endGesture() {
  suspendHistory = false;
}

let persistTimer = null;
let statusCb = null;
/** Bar atas melanggan di sini untuk tunjuk "Menyimpan..." / "Disimpan". */
export function onPersist(fn) { statusCb = fn; }

function persist() {
  if (statusCb) statusCb('busy');
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        params: state.params,
        material: state.material,
        filament: state.filament,
        sheet: state.sheet,
        backdrop: state.backdrop,
        showLabels: state.showLabels,
        name: state.name,
      }));
    } catch { /* mod peribadi, kuota - tak berbaloi mengganggu pengguna */ }
    if (statusCb) statusCb('saved');
  }, 250);
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(state.params, data.params || {});
    // Rekod lama yang tiada medan baharu dapat lalainya, bukan `undefined`.
    for (const k of Object.keys(DEFAULTS)) {
      if (state.params[k] === undefined) state.params[k] = DEFAULTS[k];
    }
    for (const k of Object.keys(PRINT_DEFAULTS)) {
      if (state.params[k] === undefined) state.params[k] = PRINT_DEFAULTS[k];
    }
    if (state.params.mode !== 'cetak') state.params.mode = 'laser';
    if (FILAMENTS.some((f) => f.id === data.filament)) state.filament = data.filament;
    if (!Array.isArray(state.params.cols)) state.params.cols = DEFAULTS.cols.slice();
    if (!Array.isArray(state.params.rows)) state.params.rows = DEFAULTS.rows.slice();
    state.material = MATERIALS.some((m) => m.id === data.material) ? data.material : state.material;
    state.sheet = data.sheet || state.sheet;
    state.backdrop = data.backdrop || state.backdrop;
    if (typeof data.showLabels === 'boolean') state.showLabels = data.showLabels;
    state.name = data.name || state.name;
    dirty = true;
    return true;
  } catch {
    return false;
  }
}

export function reset() {
  update((s) => {
    Object.assign(s, initialState());
  }, { geometry: true });
}

export function emit() {
  for (const fn of listeners) fn(state);
}

// ---- operasi grid ----------------------------------------------------------
// Semuanya bekerja dalam MILIMETER pada saiz petak semasa, kemudian menyimpan
// mm itu semula sebagai `cols`/`rows`. Nilai itu pecahan - skala tidak
// penting - jadi menyimpan mm bermakna: ubah saiz luar dulang, dan petak
// mengecil secara berkadar; belah satu petak, dan JIRANNYA tidak bergerak.

const keyOf = (axis) => (axis === 'x' ? 'cols' : 'rows');
const sizesOf = (axis) => {
  const d = getTray().derived;
  return (axis === 'x' ? d.colW : d.rowD).slice();
};
const round2 = (v) => Math.round(v * 100) / 100;

function commitSizes(axis, sizes, opts = {}) {
  update((s) => { s.params[keyOf(axis)] = sizes.map(round2); }, { geometry: true, ...opts });
}

export const MAX_PER_AXIS = 13; // 12 pembahagi

/** Boleh petak `idx` dibelah dua dengan satu pembahagi di tengahnya? */
export function canSplit(axis, idx) {
  const sizes = sizesOf(axis);
  if (sizes.length >= MAX_PER_AXIS) return false;
  if (idx < 0 || idx >= sizes.length) return false;
  const { thickness: t, minCell } = getTray().params;
  return (sizes[idx] - t) / 2 >= minCell;
}

/** Belah petak `idx` menjadi dua sama besar. Petak lain tidak bergerak. */
export function splitCell(axis, idx) {
  if (!canSplit(axis, idx)) return false;
  const sizes = sizesOf(axis);
  const t = getTray().params.thickness;
  const half = (sizes[idx] - t) / 2;
  sizes.splice(idx, 1, half, half);
  commitSizes(axis, sizes);
  return true;
}

/** Buang pembahagi `k` (antara petak k dan k+1): dua petak itu bercantum. */
export function removeDivider(axis, k) {
  const sizes = sizesOf(axis);
  if (k < 0 || k >= sizes.length - 1) return false;
  const t = getTray().params.thickness;
  sizes.splice(k, 2, sizes[k] + sizes[k + 1] + t);
  commitSizes(axis, sizes);
  return true;
}

/**
 * Pindahkan pembahagi `k` ke `pos` - jarak garis tengahnya dari muka dalam
 * dinding pertama, dalam mm. Dua petak bersebelahan berkongsi jumlah yang
 * tetap, jadi satu membesar tepat sebanyak yang satu lagi mengecil.
 */
export function moveDivider(axis, k, pos, opts = {}) {
  const sizes = sizesOf(axis);
  if (k < 0 || k >= sizes.length - 1) return false;
  const { thickness: t, minCell } = getTray().params;
  let start = 0;
  for (let i = 0; i < k; i++) start += sizes[i] + t;
  const pair = sizes[k] + sizes[k + 1];
  let a = pos - t / 2 - start;
  a = Math.max(minCell, Math.min(pair - minCell, a));
  if (Math.abs(a - sizes[k]) < 1e-3) return false;
  sizes[k] = a;
  sizes[k + 1] = pair - a;
  commitSizes(axis, sizes, opts);
  return true;
}

/**
 * Tetapkan saiz dalaman petak `idx` kepada `mm`. Jiran sebelah kanan/bawah
 * menyerap bezanya; petak terakhir meminjam daripada jiran sebelumnya.
 * Satu petak sahaja: saiz luar dulang yang berubah, kerana tiada jiran.
 */
export function setCellMm(axis, idx, mm) {
  const sizes = sizesOf(axis);
  if (idx < 0 || idx >= sizes.length || !Number.isFinite(mm)) return false;
  const { thickness: t, minCell } = getTray().params;
  if (sizes.length === 1) {
    const key = axis === 'x' ? 'length' : 'width';
    setParam(key, Math.max(t * 8, mm + 2 * t));
    return true;
  }
  const j = idx < sizes.length - 1 ? idx + 1 : idx - 1;
  const pair = sizes[idx] + sizes[j];
  const a = Math.max(minCell, Math.min(pair - minCell, mm));
  sizes[idx] = a;
  sizes[j] = pair - a;
  commitSizes(axis, sizes);
  return true;
}

export function selectCell(i, j) {
  update((s) => { s.selected = { i, j }; }, { history: false });
}

/** Membuang pembahagi boleh menghapuskan petak yang sedang dipilih. */
function clampSelection() {
  if (!tray) return;
  const nC = tray.derived.colW.length;
  const nR = tray.derived.rowD.length;
  const sel = state.selected || { i: 0, j: 0 };
  state.selected = {
    i: Math.max(0, Math.min(nC - 1, sel.i | 0)),
    j: Math.max(0, Math.min(nR - 1, sel.j | 0)),
  };
}
