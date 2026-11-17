// Saved Keychain UV jobs (Boss, 17 Nov 2026): the job on screen -> an account record,
// and back. The settings go to the account; the PDF stays in this browser and is named
// here by its hash, as the poster tabs do it (posterSaved.js).
//
// Pure: no DOM. Tested by tools/test-keychain.js.

import {
  QUANTITY_MAX, cleanHole, keychainSheet, keychainSize,
} from './geom/keychain.js';
import { panelMaterial } from './geom/panel.js';

const HASH = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_MAX = 200;
const NAME_MAX = 255;
const PAGES_MAX = 5000;

const isWhole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/**
 * A job as it can safely be used, or null when it is not one. Every value is checked:
 * what comes back from the server must land on a default, not become NaN in a cut path.
 */
export function cleanKeychain(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = raw.file;
  if (!f || typeof f !== 'object' || typeof f.name !== 'string' || !f.name.trim()) return null;
  const file = {
    name: f.name.slice(0, NAME_MAX),
    size: isWhole(f.size, 0, Number.MAX_SAFE_INTEGER) ? f.size : 0,
    hash: HASH.test(f.hash) ? f.hash : '',
    pages: isWhole(f.pages, 1, PAGES_MAX) ? f.pages : 1,
  };
  const size = keychainSize(raw.size);
  return {
    file,
    page: isWhole(raw.page, 0, file.pages - 1) ? raw.page : 0,
    size,
    sheet: keychainSheet(raw.sheet).id,
    quantity: isWhole(raw.quantity, 1, QUANTITY_MAX) ? raw.quantity : null,
    material: panelMaterial(raw.material).id,
    hole: cleanHole(raw.hole, size),
    edge: raw.edge === 'page' ? 'page' : 'auto',
    // null: take a border line out when one is found; true or false: Boss's own pick.
    border: typeof raw.border === 'boolean' ? raw.border : null,
    client: typeof raw.client === 'string' ? raw.client.slice(0, TEXT_MAX) : '',
    dateline: DATE.test(raw.dateline) ? raw.dateline : '',
    view: ['cut', 'print'].includes(raw.view) ? raw.view : 'keychain',
  };
}

/**
 * What gets stored. params are the numbers the list of saved designs can show, flat;
 * material is written as on the cut file.
 * @param layout result of layoutKeychains for this job
 */
export function keychainRecord(job, layout) {
  const material = panelMaterial(job?.material);
  return {
    params: {
      size: layout.sizeMm,
      sheetWidth: layout.sheet.width,
      sheetHeight: layout.sheet.height,
      perSheet: layout.perSheet,
      sheets: layout.sheets,
      quantity: layout.quantity,
    },
    material: material.label,
    extra: { material: material.id, keychain: cleanKeychain(job) },
  };
}

/** The job inside an account record, or null. */
export function readKeychain(row) {
  if (typeof row?.extra !== 'string' || !row.extra) return null;
  try {
    return cleanKeychain(JSON.parse(row.extra)?.keychain);
  } catch {
    return null;
  }
}
