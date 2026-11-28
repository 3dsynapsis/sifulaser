// Saved UV Plak jobs (Boss, 28 Nov 2026): the job on screen -> an account record, and
// back. The settings go to the account; the design file stays in this browser and is
// named here by its hash, as the other UV tabs do it (keychainSaved.js).
//
// Pure: no DOM. Tested by scripts/test-uvplak.mjs.

import {
  cleanCustom, cleanMaterials, plakMaterial, plakSizeId, BASE_MATERIAL, whiteMode,
} from './geom/plak.js';

const HASH = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_MAX = 200;
const NAME_MAX = 255;
const PAGES_MAX = 5000;
export const QUANTITY_MAX = 500;
export const LETTER_MIN_MM = 10;     // the smallest letter raised, by default
export const LETTER_MIN_RANGE = [5, 60];
const OFF_MAX = 300;
export const PLAK_VIEWS = ['plak', '3d', 'cut', 'print'];

const isWhole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** The smallest letter height raised, mm, kept in range. */
export function cleanLetterMin(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return LETTER_MIN_MM;
  return Math.round(Math.max(LETTER_MIN_RANGE[0], Math.min(LETTER_MIN_RANGE[1], n)) * 2) / 2;
}

/**
 * A job as it can safely be used, or null when it is not one. Every value is checked:
 * what comes back from the server must land on a default, not become NaN in a cut path.
 */
export function cleanPlak(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = raw.file;
  if (!f || typeof f !== 'object' || typeof f.name !== 'string' || !f.name.trim()) return null;
  const file = {
    name: f.name.slice(0, NAME_MAX),
    size: isWhole(f.size, 0, Number.MAX_SAFE_INTEGER) ? f.size : 0,
    hash: HASH.test(f.hash) ? f.hash : '',
    pages: isWhole(f.pages, 1, PAGES_MAX) ? f.pages : 1,
  };
  const off = Array.isArray(raw.off)
    ? [...new Set(raw.off.filter((v) => isWhole(v, 0, 10000)))].sort((a, b) => a - b).slice(0, OFF_MAX)
    : [];
  return {
    file,
    page: isWhole(raw.page, 0, file.pages - 1) ? raw.page : 0,
    size: plakSizeId(raw.size),
    custom: cleanCustom(raw.custom),
    border: raw.border !== false,
    letters: raw.letters !== false,
    letterMin: cleanLetterMin(raw.letterMin),
    off,
    materials: cleanMaterials(raw.materials),
    base: raw.base !== false,
    // Under the design's ink only, so the wood shows (Boss, 28 Nov 2026); or everywhere.
    white: whiteMode(raw.white),
    quantity: isWhole(raw.quantity, 1, QUANTITY_MAX) ? raw.quantity : 1,
    client: typeof raw.client === 'string' ? raw.client.slice(0, TEXT_MAX) : '',
    dateline: DATE.test(raw.dateline) ? raw.dateline : '',
    view: PLAK_VIEWS.includes(raw.view) ? raw.view : 'plak',
    sheet: typeof raw.sheet === 'string' ? raw.sheet.slice(0, 40) : '',
    // The job's "lihat sahaja" link, if it has one (share.js): Simpan keeps it up to date.
    share: typeof raw.share === 'string' && /^[A-Za-z0-9]{16,40}$/.test(raw.share) ? raw.share : '',
  };
}

/**
 * What gets stored. params are the numbers the list of saved designs can show, flat;
 * material is the front's, as on its cut file.
 * @param plan    result of planPlak for this job
 * @param letters how many letters are raised
 */
export function plakRecord(job, plan, letters = 0) {
  const clean = cleanPlak(job);
  const front = plakMaterial(clean?.materials.front);
  return {
    params: {
      width: plan.width,
      height: plan.height,
      border: plan.border,
      letters,
      baseLength: plan.base ? plan.base.length : 0,
      baseDepth: plan.base ? plan.base.depth : 0,
      quantity: clean?.quantity ?? 1,
    },
    material: plan.base ? `${front.label} + ${BASE_MATERIAL.label}` : front.label,
    extra: { material: front.id, plak: clean },
  };
}

/** The job inside an account record, or null. */
export function readPlak(row) {
  if (typeof row?.extra !== 'string' || !row.extra) return null;
  try {
    return cleanPlak(JSON.parse(row.extra)?.plak);
  } catch {
    return null;
  }
}
