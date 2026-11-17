// The Keychain UV tab (Boss, 17 Nov 2026): a client's round design in, the sheet's cut
// file and UV print file out.
//
// Doing it by hand in CorelDRAW meant drawing the bleed, the cut line and the hole, and
// repeating the keychain over the sheet. Here the tool finds the design's circle in the
// PDF itself, makes the bleed where the file has none, takes a thin border line off the
// edge (it shows every shift between cut and print), and lays the keychains on the
// medal FRONT sheet Boss already uses (geom/keychain.js).
//
// The rest is the poster tabs' way of working, in a smaller form: the PDF stays in this
// browser (posterVault.js, in a database of its own), every change goes to a draft,
// Simpan sends the settings to the account, and Export hands over the two files, one at
// a time, in a ZIP, or shared to WhatsApp. The print file is the poster tabs' file
// (posterPdf.js): the picture in CMYK at 300 dpi, Spot 1 and Spot 2 (white) under it,
// here a disc with a hole in it for every keychain.

import { h, group, rnd } from './ui.js';
import * as gallery from './designs.js';
import { signedIn } from './cloud.js';
import * as vault from './posterVault.js';
import {
  openPoster, pageImages, pageRaster, keychainPicture, buildLayeredPrint,
} from './posterPdf.js';
import { buildKeychainSheet, sheetToPdf } from './exportJobSheet.js';
import { makeZip } from './zip.js';
import { PANEL_MATERIALS, panelMaterial } from './geom/panel.js';
import { LOW_DPI, UV_BED_MM } from './geom/poster.js';
import {
  KEYCHAIN_SIZES_MM, KEYCHAIN_BLEED_MM, KEYCHAIN_SHEETS, KEYCHAIN_GAP_MM, KEYCHAIN_EDGE_MM,
  HOLE_DIAMETER_MM, HOLE_INSET_MM, HOLE_MIN_WALL_MM, HOLE_R, QUANTITY_MAX,
  findDesignCircle, radialProfile, findBorder, layoutKeychains, holeOffset, holeFromPoint,
  KEYCHAIN_TYPES, keychainType, HOOK_R, HOOK_WALL_MM, hookOffset, unionPath,
  holeWall, cleanHole, circlePath, keychainDpi, cleanSheetSize, keychainSheet,
  CUSTOM_SHEET_DEFAULT, CUSTOM_SHEET_MIN_MM,
} from './geom/keychain.js';
import { cleanKeychain, keychainRecord, readKeychain } from './keychainSaved.js';
import {
  LAYER_LOOK, inspectPrint, judgeDiscs, releaseLayers,
} from './printCheck.js';
import { VERSION } from './version.js';
import { illustratorEditData } from './pdfWeight.js';

const RASTER_PX = 900;    // the page, looked at to find the circle
const PREVIEW_PX = 900;   // the keychain on screen
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const allLayersOn = () => Object.fromEntries(LAYER_LOOK.map((l) => [l.name, true]));
const fresh = () => ({
  size: 50,
  sheet: KEYCHAIN_SHEETS[0].id,
  custom: { ...CUSTOM_SHEET_DEFAULT },   // the Custom sheet's size, kept when another is picked
  quantity: null,                 // null: one full sheet
  material: PANEL_MATERIALS[0].id,
  hole: { angle: 0, inset: HOLE_INSET_MM },
  type: 'hole',                   // 'hole' inside the circle, or a 'hook' on its edge
  edge: 'auto',                   // 'auto': the design's own circle; 'page': the page's
  border: null,                   // null: take a border line out when one is found
  client: '',
  dateline: '',
  view: 'keychain',
});

const S = {
  file: null,     // { name, size, hash, bytes, lib, doc, pages, editData }
  page: 0,
  name: '',
  nameAuto: true,
  savedKey: null,
  pdfKept: true,
  check: null,    // the print file read back, for the File print view
  layerOn: allLayersOn(),
  ...fresh(),
};

let deps = null;
let draftTimer = null;

/** @param d { view, els, saveFile, refresh, setMode, openSave, applyRow } */
export function initKeychain(d) {
  deps = d;
}

export const keychainActive = () => Boolean(S.file);
const currentPage = () => S.file.pages[S.page];

const r1 = (v) => Math.round(v * 10) / 10;
const size = (w, hh) => `${rnd(w, 1)} x ${rnd(hh, 1)} mm`;
const cm = (mm) => `${mm / 10} cm`;
const baseName = (name) => name.replace(/\.pdf$/i, '').trim()
  .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'keychain';
const nameOf = (fileName) => fileName.replace(/\.pdf$/i, '').trim() || 'Keychain';
const materialLabel = () => panelMaterial(S.material).label;
const layout = () => layoutKeychains({
  sizeMm: S.size, sheet: S.sheet, custom: S.custom, quantity: S.quantity, type: S.type, hole: S.hole,
});
const hooked = () => S.type === 'hook';
/** The hole's centre from the keychain's centre: inside it, or in the hook on its edge. */
const holeAt = () => (hooked() ? hookOffset(S.hole, S.size) : holeOffset(S.hole, S.size));

// ---- the job, as it gets saved ----------------------------------------------------

function job() {
  return {
    file: {
      name: S.file.name, size: S.file.size, hash: S.file.hash, pages: S.file.pages.length,
    },
    page: S.page,
    size: S.size,
    sheet: S.sheet,
    custom: cleanSheetSize(S.custom),
    quantity: S.quantity,
    material: S.material,
    hole: cleanHole(S.hole, S.size),
    type: S.type,
    edge: S.edge,
    border: S.border,
    client: S.client,
    dateline: S.dateline,
    view: S.view,
  };
}

/** What counts as a change worth saving. Looking at another view does not. */
const settingsKey = () => JSON.stringify({ ...job(), view: undefined, name: S.name });

export const keychainDirty = () => keychainActive() && settingsKey() !== S.savedKey;

function paintStatus() {
  const el = deps.els.status;
  const dirty = keychainDirty();
  el.classList.toggle('unsaved', dirty);
  if (dirty) el.textContent = 'Belum disimpan';
  else el.textContent = S.pdfKept ? 'Disimpan' : 'Disimpan, tanpa PDF';
}

function writeDraft() {
  if (!keychainActive()) return;
  const open = gallery.current();
  vault.putDraft({
    job: job(), name: S.name, savedKey: S.savedKey, designId: open.id, designName: open.name,
  }).catch(() => { /* no draft in this browser; Simpan still works */ });
}

/** Call after anything in the job changes. */
function changed() {
  paintStatus();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(writeDraft, 300);
}

/** What the Save dialog and the gallery may see and change while a job is open. */
export const keychainStore = {
  name: () => S.name,
  params: () => keychainRecord(job(), layout()).params,
  material: () => keychainRecord(job(), layout()).material,
  extra: () => keychainRecord(job(), layout()).extra,
  rename: (name) => {
    S.name = name;
    S.nameAuto = false;
    deps.els.name.value = name;
    changed();
  },
  note: 'Yang disimpan ke akaun ialah tetapan: saiz, sheet, kuantiti, material, lubang, client dan dateline. '
    + 'PDF kekal dalam browser ni. Kalau buka di PC lain, kena pilih PDF tu semula.',
  prepare: async () => {
    try {
      await vault.putFile(S.file.hash, S.file.name, S.file.bytes);
      await vault.keepFile(S.file.hash);
      S.pdfKept = true;
    } catch {
      S.pdfKept = false;
    }
  },
  onSaved: (id, title) => {
    S.name = title;
    deps.els.name.value = title;
    S.savedKey = settingsKey();
    changed();
  },
  apply: (row) => deps.applyRow(row),
};

/** The name box in the top bar. */
export function renameKeychain(name) {
  if (name.trim()) keychainStore.rename(name.trim());
  else {
    keychainStore.rename(nameOf(S.file.name));
    S.nameAuto = true;
  }
}

// ---- opening and closing ------------------------------------------------------------

function readError(err) {
  if (err?.name === 'PasswordException') return 'PDF ni berkunci dengan password. Minta file tanpa password.';
  return 'PDF ni tak dapat dibaca. Cuba simpan semula sebagai PDF biasa.';
}

function forget(file) {
  for (const p of file.pages) {
    for (const entry of p.previews?.values() || []) if (entry.url) URL.revokeObjectURL(entry.url);
  }
  file.doc.destroy().catch(() => {});
}

function dropCheck() {
  if (S.check) releaseLayers(S.check.layers);
  S.check = null;
}

/** Ask before throwing away unsaved changes. Resolves true to carry on. */
function confirmLeave() {
  if (!keychainDirty()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const dlg = deps.els.posterDlg;
    const finish = (go) => {
      resolve(go);
      dlg.close();
    };
    dlg.addEventListener('close', () => resolve(false), { once: true });
    dlg.replaceChildren(h('div', { class: 'dlg-body' },
      h('h2', {}, 'Perubahan belum disimpan'),
      h('p', { class: 'muted' },
        `"${S.name}" ada perubahan yang belum disimpan. Kalau teruskan, perubahan tu akan hilang.`),
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: () => finish(false) }, 'Batal'),
        h('button', { type: 'button', class: 'ghost', onclick: () => finish(true) }, 'Buang perubahan'),
        h('button', {
          type: 'button',
          class: 'primary',
          onclick: () => {
            finish(false);
            deps.openSave();
          },
        }, 'Simpan dulu'))));
    dlg.showModal();
  });
}

/**
 * Open a PDF as the job. One design per job: of several files the first is taken.
 *
 * @param restore when opening a saved job or the draft:
 *   { saved, name, design: { id, name }, savedKey, quiet }
 * @returns whether a job is now open
 */
export async function openKeychainFiles(fileList, restore = null) {
  const complain = (text) => { if (!restore?.quiet) alert(text); };
  const chosen = [...(fileList || [])].filter(Boolean);
  const pdfs = chosen.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
  if (!pdfs.length) {
    if (chosen.length) complain('File ni bukan PDF. Pilih design keychain dalam format PDF.');
    return false;
  }
  if (pdfs.length > 1) complain(`Satu job satu design. Yang dibuka: ${pdfs[0].name}.`);
  if (!restore && !(await confirmLeave())) return false;
  const wasActive = keychainActive();
  deps.els.hint.textContent = 'Membaca PDF...';
  deps.els.hint.classList.add('show');

  let one;
  try {
    one = await openPoster(pdfs[0]);
  } catch (err) {
    complain(readError(err));
    deps.refresh();
    return false;
  }
  if (!one.pages.length) {
    complain('PDF ni tiada page.');
    one.doc.destroy().catch(() => {});
    deps.refresh();
    return false;
  }
  let hash = '';
  try {
    hash = await vault.hashBytes(one.bytes);
    await vault.putFile(hash, one.name, one.bytes);
  } catch { /* opens anyway; there will be no draft to come back to */ }

  // A new PDF for a saved job is the same job with a better file: settings stay.
  const sameJob = !restore && wasActive && gallery.current().id;
  if (S.file) forget(S.file);
  dropCheck();
  S.file = {
    name: one.name,
    size: one.bytes.length,
    hash,
    bytes: one.bytes,
    lib: one.lib,
    doc: one.doc,
    pages: one.pages,
    editData: illustratorEditData(one.bytes),
  };
  S.page = 0;
  if (restore) {
    const saved = restore.saved;
    Object.assign(S, {
      page: Math.min(saved.page, one.pages.length - 1),
      size: saved.size,
      sheet: saved.sheet,
      custom: saved.custom,
      quantity: saved.quantity,
      material: saved.material,
      hole: saved.hole,
      type: saved.type,
      edge: saved.edge,
      border: saved.border,
      client: saved.client,
      dateline: saved.dateline,
      view: saved.view,
    });
    S.name = restore.name;
    S.nameAuto = false;
  } else if (!sameJob) {
    Object.assign(S, fresh());
    S.savedKey = null;
    S.nameAuto = true;
    S.name = nameOf(one.name);
  }
  if (!wasActive) deps.setMode(true, S.name);
  else deps.els.name.value = S.name;
  if (restore) {
    gallery.setOpen(restore.design?.id ?? null, restore.design?.name ?? null);
    const same = hash && hash === restore.saved.file.hash;
    if (restore.savedKey !== undefined) S.savedKey = restore.savedKey;
    else S.savedKey = same ? settingsKey() : null;
  }
  deps.refresh();
  changed();
  return true;
}

/** The saved job's PDF from this browser, or asked for. Resolves to a File or null. */
async function fileFor(saved, { ask = true } = {}) {
  if (saved.file.hash) {
    try {
      const found = await vault.getFile(saved.file.hash);
      if (found) return found;
    } catch { /* ask instead */ }
  }
  if (!ask) return null;
  return new Promise((resolve) => {
    const dlg = deps.els.posterDlg;
    const finish = (value) => {
      resolve(value);
      dlg.close();
    };
    dlg.addEventListener('close', () => resolve(null), { once: true });
    dlg.replaceChildren(h('div', { class: 'dlg-body' },
      h('h2', {}, 'Pilih PDF keychain'),
      h('p', { class: 'muted' },
        `Design ni guna "${saved.file.name}", yang tiada dalam browser ni. Pilih file yang sama.`),
      h('label', { class: 'primary file-pick' },
        h('input', {
          type: 'file',
          accept: 'application/pdf,.pdf',
          hidden: true,
          onchange: (e) => finish(e.target.files[0] || null),
        }),
        'Pilih PDF'),
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: () => finish(null) }, 'Batal'))));
    dlg.showModal();
  });
}

/** Open a job from the account. @returns false when nothing changed */
export async function openKeychainDesign(row) {
  const saved = readKeychain(row);
  if (!saved) return false;
  if (!(await confirmLeave())) return false;
  const file = await fileFor(saved);
  if (!file) return false;
  return openKeychainFiles([file], { saved, name: row.name, design: { id: row.id, name: row.name } });
}

/** Whatever was on screen last time, put back. Called once when the tab starts. */
export async function restoreKeychainDraft() {
  let draft = null;
  try {
    draft = await vault.getDraft();
  } catch {
    return false;
  }
  if (!draft || keychainActive()) return false;
  const saved = cleanKeychain(draft.job);
  const file = saved && await fileFor(saved, { ask: false });
  const opened = file && await openKeychainFiles([file], {
    saved,
    name: typeof draft.name === 'string' && draft.name ? draft.name : nameOf(saved.file.name),
    design: { id: draft.designId, name: draft.designName },
    savedKey: draft.savedKey ?? null,
    quiet: true,
  });
  if (!opened) vault.clearDraft().catch(() => {});
  return Boolean(opened);
}

/** @returns whether it closed */
export async function closeKeychain() {
  if (!(await confirmLeave())) return false;
  const { hash } = S.file;
  forget(S.file);
  dropCheck();
  clearTimeout(draftTimer);
  Object.assign(S, fresh(), {
    file: null, page: 0, name: '', nameAuto: true, savedKey: null, pdfKept: true, layerOn: allLayersOn(),
  });
  vault.clearDraft().catch(() => {});
  if (hash) vault.releaseFile(hash).catch(() => {});
  deps.els.status.classList.remove('unsaved');
  deps.setMode(false);
  deps.refresh();
  return true;
}

// ---- the design: its circle, its border, its pictures ---------------------------------

/**
 * The design on this page, looked at once: where its circle is, whether its edge has a
 * border line, and the pictures in it. Null while it is being worked out.
 */
function analysisOf(page) {
  if (page.analysis) return page.analysis;
  if (page.analysing) return null;
  const { file } = S;
  page.analysing = (async () => {
    const raster = await pageRaster(page.obj, RASTER_PX);
    const found = findDesignCircle(raster.rgba, raster.width, raster.height);
    const border = found.kind === 'circle'
      ? findBorder(radialProfile(raster.rgba, raster.width, raster.height, found, found.r * 0.08), found.r)
      : null;
    const mm = raster.mmPerPx;
    const pageMm = { width: raster.width * mm, height: raster.height * mm };
    let images = [];
    try {
      images = await pageImages(file.lib, page);
    } catch { /* no resolution to check */ }
    page.analysis = {
      kind: found.kind,
      circle: { cx: found.cx * mm, cy: found.cy * mm, r: found.r * mm },
      pageCircle: { cx: pageMm.width / 2, cy: pageMm.height / 2, r: Math.min(pageMm.width, pageMm.height) / 2 },
      border,
      pageMm,
      images,
    };
  })().catch(() => {
    page.analysis = { failed: true };
  }).finally(() => {
    page.analysing = null;
    if (S.file === file && currentPage() === page) renderKeychain();
  });
  return null;
}

/** How this job's keychain picture is made from the design. */
function specOf(a) {
  const byPage = S.edge === 'page' || a.kind === 'blank';
  const kind = byPage ? 'page' : a.kind;
  const border = kind === 'circle' ? a.border : null;
  return {
    circle: byPage ? a.pageCircle : a.circle,
    kind,
    border,
    removeBorder: Boolean(border) && S.border !== false,
    sizeMm: S.size,
    bleedMm: KEYCHAIN_BLEED_MM,
    // A hook stands out past the bleed: the picture runs over it too, in the edge's colour.
    reachMm: S.size / 2 + KEYCHAIN_BLEED_MM + (hooked() ? HOOK_R : 0),
  };
}

const specKey = (spec) => [
  S.file.hash || S.file.name, S.page, spec.sizeMm, spec.reachMm, spec.kind, spec.removeBorder,
  rnd(spec.circle.cx, 3), rnd(spec.circle.cy, 3), rnd(spec.circle.r, 3),
].join('|');

/** The keychain on screen: an RGB picture, made once per way of making it. */
function previewOf(page, spec) {
  const key = specKey(spec);
  if (!page.previews) page.previews = new Map();
  let entry = page.previews.get(key);
  if (!entry) {
    entry = { url: null, failed: false };
    page.previews.set(key, entry);
    const { file } = S;
    keychainPicture(page.obj, spec, { mode: 'preview', px: PREVIEW_PX }).then(({ url }) => {
      entry.url = url;
      if (S.file === file && currentPage() === page && S.view === 'keychain') renderStage();
    }).catch(() => {
      entry.failed = true;
    });
    if (page.previews.size > 6) {
      const [oldKey, old] = page.previews.entries().next().value;
      if (old.url) URL.revokeObjectURL(old.url);
      page.previews.delete(oldKey);
    }
  }
  return entry;
}

/** The print file's picture, 300 dpi CMYK, kept for the layer check and Export. */
function printPictureOf(page, spec) {
  const key = specKey(spec);
  if (!page.prints) page.prints = new Map();
  if (!page.prints.has(key)) {
    const made = keychainPicture(page.obj, spec, { mode: 'print' });
    made.catch(() => { if (page.prints.get(key) === made) page.prints.delete(key); });
    page.prints.set(key, made);
    if (page.prints.size > 3) page.prints.delete(page.prints.keys().next().value);
  }
  return page.prints.get(key);
}

/** Why the files cannot be made yet, or null. */
function blockedReason(a, lay) {
  if (!a) return 'Tunggu sekejap, tool masih mencari bulatan design.';
  if (a.failed) return 'Page ni tak dapat dilukis. Cuba simpan semula PDF tu sebagai PDF biasa.';
  if (a.kind === 'blank') return 'Page ni kosong. Pilih page yang ada design.';
  if (!lay.fits) return `Keychain ${cm(S.size)} tak muat sheet ${lay.sheet.label}.`;
  return null;
}

// ---- the files ---------------------------------------------------------------------------

const formatDate = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
};
const jobMeta = () => ({
  client: S.client,
  dateline: formatDate(S.dateline),
  material: materialLabel(),
  hole: holeAt(),
  hookR: hooked() ? HOOK_R : null,
});
const stem = () => `${baseName(S.file.name)}-keychain`;
// The file name says what the operator is to do with it too: 30 a sheet, 3 times.
const tag = (lay) => `${S.size}mm${hooked() ? '-hook' : ''}-${lay.sheet.id === 'custom' ? `custom-${lay.sheet.width}x${lay.sheet.height}` : lay.sheet.id}`
  + `-${lay.perSheet}pcs-x${lay.sheets}`;

/**
 * Every keychain on the sheet as a disc with its hole, mm, and its hook's disc where it
 * has one, each grown by the bleed: the print file's shapes.
 */
function discsOf(lay) {
  const RB = S.size / 2 + KEYCHAIN_BLEED_MM;
  const off = holeAt();
  return lay.items.map((it) => ({
    cx: it.x,
    cy: it.y,
    r: RB,
    ...(hooked() ? { tab: { cx: it.x + off.dx, cy: it.y + off.dy, r: HOOK_R + KEYCHAIN_BLEED_MM } } : {}),
    hole: { cx: it.x + off.dx, cy: it.y + off.dy, r: HOLE_R },
  }));
}

async function cutFile() {
  const lay = layout();
  const sheet = buildKeychainSheet(lay, jobMeta());
  const body = sheetToPdf(sheet, { title: `${S.name} - keychain cut` });
  return {
    blob: new Blob([body], { type: 'application/pdf' }),
    name: `${stem()}-cut-${tag(lay)}.pdf`,
    type: 'application/pdf',
  };
}

async function printFile() {
  const page = currentPage();
  const a = page.analysis;
  const lay = layout();
  const blocked = blockedReason(a, lay);
  if (blocked) throw Object.assign(new Error(blocked), { code: 'blocked' });
  const spec = specOf(a);
  const { jpg } = await printPictureOf(page, spec);
  const reach = spec.reachMm;
  const placements = discsOf(lay).map((d) => ({
    jpg,
    box: { x: d.cx - reach, y: d.cy - reach, width: 2 * reach, height: 2 * reach },
    shape: d,
  }));
  const bytes = await buildLayeredPrint(lay.sheet, placements, { title: `${S.name} - keychain print` });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${stem()}-print-${tag(lay)}.pdf`,
    type: 'application/pdf',
  };
}

/** Files in a ZIP or shared skip the download hook that brands the others; done here. */
async function branded(file) {
  const bytes = new Uint8Array(await file.blob.arrayBuffer());
  try {
    const { brandFile } = await import('/shared/brand-core.js');
    const out = brandFile(file.name, file.type, bytes);
    return { name: out.name, data: out.data };
  } catch {
    return { name: file.name, data: bytes };
  }
}

function fileError(err) {
  if (err?.code === 'blocked') return err.message;
  if (err?.code === 'canvas') {
    return 'Browser ni tak cukup memori untuk lukis gambar print. Cuba di komputer, atau tutup tab lain.';
  }
  return /encrypted|password/i.test(err?.message || '')
    ? 'PDF ni ada perlindungan, jadi file print tak dapat dibina. Minta file tanpa perlindungan.'
    : 'File tak dapat dibina. Cuba simpan semula PDF tu sebagai PDF biasa.';
}

// ---- the print file, read back -----------------------------------------------------------

function printCheckFor(a, lay) {
  const key = [specKey(specOf(a)), S.sheet, lay.perSheet, JSON.stringify(cleanHole(S.hole, S.size))].join('|');
  if (S.check?.key === key) return S.check;
  dropCheck();
  const check = {
    key, state: 'building', layers: null, results: null, error: null,
  };
  S.check = check;
  const discs = discsOf(lay);
  (async () => {
    const file = await printFile();
    return inspectPrint(S.file.lib, new Uint8Array(await file.blob.arrayBuffer()), null, discs);
  })().then((found) => {
    if (S.check !== check) {
      releaseLayers(found.layers);
      return;
    }
    check.layers = found.layers;
    check.results = judgeDiscs(found, discs);
    check.state = 'ready';
    if (S.view === 'print') renderKeychain();
  }).catch((err) => {
    if (S.check !== check) return;
    check.state = 'error';
    check.error = fileError(err);
    if (S.view === 'print') renderKeychain();
  });
  return check;
}

// ---- drawing -----------------------------------------------------------------------------

export function renderKeychain() {
  if (!keychainActive()) return;
  renderStage();
  renderPanel();
}

const wallText = () => (hooked()
  ? `hook ${2 * HOOK_R} mm, ${HOOK_WALL_MM} mm acrylic keliling lubang`
  : `tinggal ${holeWall(S.hole, S.size)} mm acrylic ke tepi`);
/** A keychain's cut outline at (x, y) on the sheet, its hook too. */
const cutOutline = (x, y, off) => (hooked()
  ? unionPath({ cx: x, cy: y, r: S.size / 2 }, { cx: x + off.dx, cy: y + off.dy, r: HOOK_R })
  : circlePath(x, y, S.size / 2));

function hint(text) {
  deps.els.hint.textContent = text;
  deps.els.hint.classList.add('show');
}

function renderStage() {
  const page = currentPage();
  const a = analysisOf(page);
  const lay = layout();
  if (S.view === 'cut' && lay.fits) {
    deps.view.renderSheet(buildKeychainSheet(lay, jobMeta()), `kc-cut:${S.sheet}:${S.size}`);
    hint(`File cut: sheet ${lay.sheet.label} ${size(lay.sheet.width, lay.sheet.height)}, ${lay.perSheet} keychain`);
    return;
  }
  if (S.view === 'print' && a && !blockedReason(a, lay)) {
    const check = printCheckFor(a, lay);
    const off = holeAt();
    deps.view.renderPrint({
      size: lay.sheet,
      layers: check.layers,
      order: LAYER_LOOK.map((l) => l.name),
      on: S.layerOn,
      cuts: [
        lay.items.map((it) => circlePath(it.x + off.dx, it.y + off.dy, HOLE_R)).join(' '),
        lay.items.map((it) => cutOutline(it.x, it.y, off)).join(' '),
      ],
      fitKey: `kc-print:${S.sheet}:${S.size}`,
    });
    hint(check.state === 'building'
      ? 'Membina file print (gambar CMYK 300 dpi)...'
      : `File print sheet ${lay.sheet.label}, ${lay.perSheet} keychain`);
    return;
  }
  const spec = a && !a.failed ? specOf(a) : null;
  const preview = spec ? previewOf(page, spec) : null;
  deps.view.renderKeychain({
    sizeMm: S.size,
    bleedMm: KEYCHAIN_BLEED_MM,
    holeR: HOLE_R,
    hookR: hooked() ? HOOK_R : null,
    hole: holeAt(),
    imageUrl: preview?.url || null,
    clear: panelMaterial(S.material).clear,
    fitKey: `kc:${S.size}:${S.type}`,
    onHoleMove: (x, y) => {
      // A hole goes where it is let go; a hook only turns round the edge.
      const at = holeFromPoint(x, y, S.size);
      S.hole = hooked() ? { ...S.hole, angle: at.angle } : at;
      hint(`Lubang ${HOLE_DIAMETER_MM} mm, ${wallText()}`);
      return holeAt();
    },
    onHoleDone: () => {
      dropCheck();
      renderPanel();
      changed();
    },
  });
  if (!a) hint('Mencari bulatan design...');
  else if (a.failed) hint('Page ni tak dapat dilukis.');
  else {
    hint(`Keychain ${cm(S.size)}${hooked() ? ' hook' : ''} · lubang ${HOLE_DIAMETER_MM} mm, ${wallText()} · `
      + `${hooked() ? 'seret hook untuk pusing ikut tepi' : 'seret lubang untuk alih'}`);
  }
}

const stat = (label, value) => h('div', { class: 'stat' }, h('span', {}, label), h('b', {}, value));

function set(patch, { redrawPanel = true } = {}) {
  Object.assign(S, patch);
  dropCheck();
  renderStage();
  if (redrawPanel) renderPanel();
  changed();
}

function renderPanel() {
  const root = deps.els.inspector;
  const scroll = root.scrollTop;
  const page = currentPage();
  const a = page.analysis || null;
  const lay = layout();
  root.replaceChildren(...[
    h('h2', { class: 'insp-title' }, 'Keychain UV'),
    fileGroup(),
    materialGroup(),
    typeGroup(),
    sizeGroup(),
    designGroup(a),
    holeGroup(),
    sheetGroup(lay),
    previewGroup(),
    jobGroup(),
    h('button', { class: 'link', type: 'button', onclick: closeKeychain }, 'Tutup PDF'),
    h('p', { class: 'version-stamp' }, `Versi ${VERSION}`),
  ].filter(Boolean));
  root.scrollTop = scroll;
}

function fileGroup() {
  const { pages } = S.file;
  const heavy = S.file.editData && S.file.editData.bytes >= 5e6;
  return group('Design', true,
    h('div', { class: 'stat' },
      h('span', { class: 'file-name', title: S.file.name }, S.file.name),
      h('b', {}, pages.length === 1 ? '1 page' : `${pages.length} page`)),
    pages.length > 1
      ? h('div', { class: 'field' },
        h('label', { for: 'kcPage' }, 'Page design'),
        h('select', {
          id: 'kcPage',
          onchange: (e) => set({ page: Number(e.target.value) }),
        }, pages.map((p) => h('option', { value: p.index, ...(p.index === S.page ? { selected: true } : {}) }, `Page ${p.index + 1}`))))
      : null,
    heavy
      ? h('div', { class: 'heavy-note' }, h('p', {}, `Lebih kurang ${rnd(S.file.editData.bytes / 1e6, 1)} MB dalam PDF ni ialah data edit `
        + 'Illustrator yang tak perlu untuk print. File print tetap betul.'))
      : null,
    h('div', { class: 'row-actions' },
      h('label', { class: 'ghost file-pick', title: 'Ganti PDF design' },
        h('input', {
          type: 'file',
          accept: 'application/pdf,.pdf',
          hidden: true,
          onchange: (e) => {
            const files = [...e.target.files];
            e.target.value = '';
            openKeychainFiles(files);
          },
        }),
        'Tukar PDF')),
    h('p', { class: 'hint' },
      'PDF kekal dalam browser ni dan tak dihantar ke mana-mana. Simpan cuma hantar tetapan ke akaun anda.'));
}

function materialGroup() {
  return group('Material', true,
    h('div', { class: 'presets four' }, PANEL_MATERIALS.map((m) => h('button', {
      class: 'preset',
      type: 'button',
      'aria-pressed': String(S.material === m.id),
      title: m.label,
      onclick: () => { if (S.material !== m.id) set({ material: m.id }); },
    },
    h('b', {}, m.kind),
    h('span', {}, m.thick)))),
    h('p', { class: 'hint' }, `File cut tulis: ${materialLabel()}.`));
}

/** A hole inside the circle, or a hook on its edge (Boss, 17 Nov 2026). */
function typeGroup() {
  return group('Jenis keychain', true,
    h('div', { class: 'presets two' }, KEYCHAIN_TYPES.map((t) => h('button', {
      class: 'preset',
      type: 'button',
      'aria-pressed': String(S.type === t.id),
      title: `${t.label}: ${t.note}`,
      onclick: () => { if (S.type !== t.id) set({ type: t.id }); },
    },
    h('b', {}, t.label),
    h('span', {}, t.note)))),
    h('p', { class: 'hint' }, hooked()
      ? `Hook bulat ${2 * HOOK_R} mm di tepi atas, lubang ${HOLE_DIAMETER_MM} mm di tengahnya: `
        + `${HOOK_WALL_MM} mm acrylic keliling lubang, macam file Zahidah. Satu garis cut dengan keychain.`
      : 'Lubang di dalam bulatan.'));
}

function sizeGroup() {
  return group('Saiz keychain', true,
    h('div', { class: 'presets three' }, KEYCHAIN_SIZES_MM.map((mm) => h('button', {
      class: 'preset',
      type: 'button',
      'aria-pressed': String(S.size === mm),
      title: `Diameter ${mm} mm`,
      onclick: () => { if (S.size !== mm) set({ size: mm, hole: cleanHole(S.hole, mm) }); },
    },
    h('b', {}, cm(mm)),
    h('span', {}, `${mm} mm`)))),
    h('p', { class: 'hint' }, 'Diameter keychain siap, iaitu garis cut.'));
}

/** What the tool found in the PDF, and the border line. */
function designGroup(a) {
  const seg = (id, label) => h('button', {
    type: 'button',
    'aria-pressed': String(S.edge === id),
    onclick: () => { if (S.edge !== id) set({ edge: id }); },
  }, label);
  const body = [h('div', { class: 'seg' }, seg('auto', 'Cari bulatan'), seg('page', 'Ikut page'))];
  if (!a) {
    body.push(h('p', { class: 'hint' }, 'Mencari bulatan design...'));
    return group('Tepi design', true, ...body);
  }
  if (a.failed) {
    body.push(h('p', { class: 'warn' }, 'Page ni tak dapat dilukis. Semak file sebelum print.'));
    return group('Tepi design', true, ...body);
  }
  const spec = specOf(a);
  const r = spec.circle.r;
  if (S.edge === 'page') {
    body.push(h('p', { class: 'hint' }, `Bulatan ikut page: diameter ${r1(2 * r)} mm dalam PDF. Bleed dari design sendiri.`));
  } else if (a.kind === 'circle') {
    body.push(h('p', { class: 'hint' }, `Bulatan design dijumpai: diameter ${r1(2 * r)} mm dalam PDF. `
      + `Tiada bleed dalam file, jadi bleed ${KEYCHAIN_BLEED_MM} mm dibuat dari warna tepi design.`));
  } else if (a.kind === 'page') {
    body.push(h('p', { class: 'hint' }, 'Design penuh sampai tepi page, jadi bulatan ikut page dan bleed dari design sendiri.'));
  } else if (a.kind === 'box') {
    body.push(h('p', { class: 'warn' }, 'Design ni bukan bulat. Cut ikut bulatan terbesar dalam design. Semak preview.'));
  } else {
    body.push(h('p', { class: 'warn' }, 'Page ni kosong.'));
  }
  if (spec.border) {
    const widthMm = rnd(spec.border.fraction * (S.size / 2), 2);
    body.push(h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        ...(spec.removeBorder ? { checked: true } : {}),
        onchange: (e) => set({ border: e.target.checked }),
      }),
      `Buang garis border di tepi (${widthMm} mm pada saiz ni)`));
    body.push(h('p', { class: 'hint' }, spec.removeBorder
      ? 'Garis di tepi diganti dengan warna di sebelah dalamnya, jadi kalau print dan cut lari sikit, tak nampak senget.'
      : 'Garis border kekal. Kalau print dan cut lari 0.5 mm, garis tu nampak tebal sebelah dan hilang sebelah.'));
  } else if (spec.kind === 'circle') {
    body.push(h('p', { class: 'hint' }, 'Tiada garis border nipis di tepi.'));
  }
  const dpi = keychainDpi(a.images, a.pageMm, r, S.size);
  if (dpi !== null) {
    body.push(dpi < LOW_DPI
      ? h('p', { class: 'warn' }, `Resolusi rendah: lebih kurang ${dpi} dpi pada ${cm(S.size)}, print boleh nampak kabur.`)
      : stat('Resolusi', `${dpi} dpi`));
  }
  return group('Tepi design', true, ...body);
}

function holeGroup() {
  const h0 = cleanHole(S.hole, S.size);
  if (hooked()) {
    return group('Hook', true,
      stat('Hook', `bulat ${2 * HOOK_R} mm`),
      stat('Lubang', `${HOLE_DIAMETER_MM} mm, di tengah hook`),
      stat('Acrylic keliling lubang', `${HOOK_WALL_MM} mm`),
      stat('Kedudukan', h0.angle === 0 ? 'atas tengah' : `${Math.round(h0.angle)}° dari atas`),
      h('p', { class: 'hint' }, 'Seret hook dalam preview Keychain untuk pusing ikut tepi. '
        + 'Hook dan keychain satu garis cut; lubang dicut dulu, dan file print biarkan lubang kosong.'),
      h('button', {
        class: 'ghost',
        type: 'button',
        onclick: () => set({ hole: { ...S.hole, angle: 0 } }),
      }, 'Letak semula atas tengah'));
  }
  return group('Lubang', true,
    stat('Lubang', `${HOLE_DIAMETER_MM} mm`),
    stat('Tengah lubang dari tepi', `${rnd(h0.inset, 1)} mm`),
    stat('Acrylic ke tepi', `${holeWall(S.hole, S.size)} mm`),
    h('p', { class: 'hint' }, 'Seret lubang dalam preview Keychain untuk alih. '
      + `Paling dekat ${HOLE_MIN_WALL_MM} mm acrylic ke tepi. Lubang dicut dulu, dan file print biarkan lubang kosong.`),
    h('button', {
      class: 'ghost',
      type: 'button',
      onclick: () => set({ hole: { angle: 0, inset: HOLE_INSET_MM } }),
    }, `Letak semula atas tengah, tinggal ${HOLE_MIN_WALL_MM} mm ke tepi`));
}

function sheetGroup(lay) {
  // Kecil and Besar, Boss's medal sheets; Mini and Custom for a smaller print, which the
  // UV printer lands truer (Boss, 17 Nov 2026).
  const choices = [...KEYCHAIN_SHEETS.map((s) => s.id), 'custom'];
  const presets = h('div', { class: 'presets two' }, choices.map((id) => {
    const s = keychainSheet(id, S.custom);
    const fit = layoutKeychains({ sizeMm: S.size, sheet: id, custom: S.custom }).capacity;
    return h('button', {
      class: fit ? 'preset' : 'preset no-fit',
      type: 'button',
      'aria-pressed': String(S.sheet === id),
      title: `Sheet ${s.label} ${s.width} x ${s.height} mm: ${fit} keychain`,
      onclick: () => { if (S.sheet !== id) set({ sheet: id }); },
    },
    h('b', {}, s.label),
    h('span', {}, `${s.width} x ${s.height}, ${fit} pcs`));
  }));
  const side = (key, label) => h('div', { class: 'field' },
    h('label', { for: `kcSheet${key}` }, label),
    h('input', {
      id: `kcSheet${key}`,
      type: 'number',
      min: CUSTOM_SHEET_MIN_MM,
      max: UV_BED_MM.long,
      step: 1,
      value: cleanSheetSize(S.custom)[key],
      onchange: (e) => set({ custom: cleanSheetSize({ ...S.custom, [key]: e.target.value }) }),
    }));
  const custom = S.sheet === 'custom'
    ? [
      h('div', { class: 'field-pair' }, side('width', 'Lebar sheet (mm)'), side('height', 'Tinggi sheet (mm)')),
      h('p', { class: 'hint' }, `Paling kecil ${CUSTOM_SHEET_MIN_MM} mm, paling besar ${UV_BED_MM.long} x ${UV_BED_MM.short} mm (bed UV). `
        + 'Contoh: sheet Kecil dibahagi dua ialah 490 x 370.'),
    ]
    : null;
  const qty = h('input', {
    id: 'kcQty',
    type: 'number',
    min: 1,
    max: QUANTITY_MAX,
    step: 1,
    placeholder: `${lay.capacity} (satu sheet penuh)`,
    value: S.quantity ?? '',
    onchange: (e) => {
      const v = Math.round(parseFloat(e.target.value));
      set({ quantity: Number.isFinite(v) && v > 0 ? Math.min(v, QUANTITY_MAX) : null });
    },
  });
  return group('Sheet dan kuantiti', true,
    presets,
    custom,
    h('div', { class: 'field' }, h('label', { for: 'kcQty' }, 'Kuantiti keychain'), qty),
    lay.fits
      ? [
        stat('Satu sheet muat', `${lay.capacity} (${lay.cols} x ${lay.rows})`),
        stat('Satu keping', `${lay.perSheet} pcs`),
        stat('Cut dan UV print', `${lay.sheets} kali`),
        stat('Jumlah siap', lay.spare ? `${lay.total} (lebih ${lay.spare})` : `${lay.total}`),
      ]
      : h('p', { class: 'warn' }, 'Saiz ni tak muat sheet ni.'),
    h('p', { class: 'hint' },
      `Jarak ${KEYCHAIN_GAP_MM} mm antara garis cut, dan ${KEYCHAIN_EDGE_MM} mm dari tepi sheet (tiada masking tape). `
      + 'Masukkan jumlah termasuk lebihan. Kuantiti dibahagi sama rata, jadi satu file cut dan satu file print '
      + 'diulang ikut bilangan kali. '
      + 'Sheet kecil lebih tepat di UV, sebab print besar lari sikit di atas dan kiri.'));
}

const EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
  + '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_SHUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
  + '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><path d="M3 3l18 18"/></svg>';

function layerPanel() {
  const check = S.check;
  const rows = LAYER_LOOK.map((look) => {
    const on = S.layerOn[look.name];
    return h('div', { class: on ? 'layer-row' : 'layer-row off' },
      h('button', {
        type: 'button',
        class: 'eye',
        'aria-pressed': String(on),
        'aria-label': `${on ? 'Sembunyi' : 'Tunjuk'} ${look.name}`,
        title: `${on ? 'Sembunyi' : 'Tunjuk'} ${look.name}`,
        html: on ? EYE_OPEN : EYE_SHUT,
        onclick: () => {
          S.layerOn[look.name] = !on;
          renderKeychain();
        },
      }),
      h('span', { class: look.colour ? 'swatch' : 'swatch art', style: look.colour ? `background:${look.colour}` : null }),
      h('span', { class: 'layer-text' }, h('b', {}, look.name), h('span', {}, look.role)));
  });
  let status;
  if (!check || check.state === 'building') status = [h('p', { class: 'hint' }, 'Membina file print (gambar CMYK 300 dpi)...')];
  else if (check.state === 'error') status = [h('p', { class: 'warn' }, check.error)];
  else status = check.results.map((r) => h('p', { class: r.ok ? 'check-ok' : 'warn' }, `${r.ok ? '✓' : '✗'} ${r.text}`));
  return [
    h('div', { class: 'layer-list' }, rows),
    ...status,
    h('p', { class: 'hint' }, 'Dibaca dari file print sebenar. Warna untuk mata sahaja. Merah ialah garis cut.'),
  ];
}

function previewGroup() {
  const choice = (id, label) => h('button', {
    type: 'button',
    'aria-pressed': String(S.view === id),
    onclick: () => {
      S.view = id;
      renderKeychain();
      changed();
    },
  }, label);
  return group('Preview', true,
    h('div', { class: 'seg seg-3' }, choice('keychain', 'Keychain'), choice('cut', 'File cut'), choice('print', 'File print')),
    S.view === 'print'
      ? layerPanel()
      : h('p', { class: 'hint' }, 'Merah ialah garis cut. Biru ialah tepi bleed: gambar dicetak '
        + `${KEYCHAIN_BLEED_MM} mm lepas garis cut supaya tepi keychain tak tinggal putih. `
        + 'Lubang gelap tak dapat ink.'));
}

function jobGroup() {
  return group('Job sheet', true,
    h('div', { class: 'field' },
      h('label', { for: 'kcClient' }, 'Nama client'),
      h('input', {
        id: 'kcClient',
        type: 'text',
        value: S.client,
        oninput: (e) => {
          S.client = e.target.value;
          changed();
        },
        onchange: () => { if (S.view === 'cut') renderStage(); },
      })),
    h('div', { class: 'field' },
      h('label', { for: 'kcDate' }, 'Dateline'),
      h('input', {
        id: 'kcDate',
        type: 'date',
        value: S.dateline,
        onchange: (e) => {
          S.dateline = e.target.value;
          if (S.view === 'cut') renderStage();
          changed();
        },
      })));
}

// ---- Export ------------------------------------------------------------------------------

/**
 * Export saves a job the first time, as the other tools do, so a file sent to the laser
 * has its settings on record; a job already saved only gets a reminder.
 */
function saveOnExport(line) {
  const open = gallery.current();
  if (open.id) {
    if (!keychainDirty()) return;
    line.textContent = `Perubahan ni belum disimpan dalam "${open.name}". Tekan Simpan lepas tutup dialog ni.`;
    line.hidden = false;
    return;
  }
  if (!signedIn()) return;
  line.textContent = 'Menyimpan dalam "Reka bentuk saya"...';
  line.hidden = false;
  gallery.saveQuietly(keychainStore).then((ok) => {
    line.textContent = ok
      ? `✓ Disimpan dalam "Reka bentuk saya" sebagai "${S.name}".`
      : 'Tak dapat simpan ke akaun kali ni. File tetap boleh didownload.';
  });
}

export function openKeychainExport() {
  const dlg = deps.els.posterDlg;
  const lay = layout();
  const blocked = blockedReason(currentPage().analysis || null, lay);
  const message = h('p', { class: 'warn-line', role: 'alert', hidden: true });
  const savedLine = h('p', { class: 'note', hidden: true });

  const busy = (btn, work) => async () => {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sedang bina...';
    message.hidden = true;
    try {
      await work();
    } catch (err) {
      message.textContent = fileError(err);
      message.hidden = false;
    }
    btn.disabled = false;
    btn.textContent = label;
  };
  const fileButton = (label, make) => {
    const btn = h('button', { type: 'button', class: 'ghost' }, label);
    btn.addEventListener('click', busy(btn, async () => deps.saveFile(await make())));
    return btn;
  };

  // Share to WhatsApp, as in the poster tabs: a ticked file is built at once, so the
  // share sheet can open within the tap that asks for it.
  const items = [];
  const share = h('button', { type: 'button', class: 'ghost share-btn', disabled: true }, 'Share');
  const paintShare = () => {
    const chosen = items.filter((i) => i.on);
    const waiting = chosen.some((i) => !i.file && !i.error);
    share.disabled = !chosen.length || waiting;
    share.textContent = waiting ? 'Menyediakan...' : chosen.length ? `Share (${chosen.length})` : 'Share';
    const failed = chosen.find((i) => i.error);
    if (failed) {
      message.textContent = failed.error;
      message.hidden = false;
    }
  };
  const prepare = (item) => {
    if (item.building) return;
    item.building = (async () => {
      const out = await branded(await item.make());
      return new File([out.data], out.name, { type: 'application/pdf' });
    })().then((file) => {
      item.file = file;
      paintShare();
    }, (err) => {
      item.error = fileError(err);
      paintShare();
    });
  };
  const row = (item, ...content) => {
    const box = h('input', {
      type: 'checkbox',
      class: 'share-pick',
      'aria-label': `Pilih ${item.title} untuk share`,
      title: 'Pilih untuk share ke WhatsApp',
      onchange: (e) => {
        item.on = e.target.checked;
        if (item.on) prepare(item);
        paintShare();
      },
    });
    item.box = box;
    items.push(item);
    return h('div', { class: 'file-row' }, box, ...content);
  };
  const pick = (kind) => {
    for (const item of items) {
      item.on = item.kind === kind;
      item.box.checked = item.on;
      if (item.on) prepare(item);
    }
    paintShare();
  };
  // Four short lines (Boss, 17 Nov 2026: the long note was too much to read on the
  // phone): which job, what it is cut from, how many times the file is run, and what
  // it is. The files carry the rest: the cut file's label and both files' names.
  const shareText = () => [
    `Nama File: ${S.name}`,
    `Material: ${materialLabel()}`,
    `Berapa Set: ${lay.sheets}`,
    `Jenis Projek: ${hooked() ? 'Keychain hook' : 'Keychain'}`,
  ].join('\n');
  share.addEventListener('click', () => {
    const chosen = items.filter((i) => i.on && i.file);
    if (!chosen.length) return;
    const files = chosen.map((i) => i.file);
    const text = shareText();
    message.hidden = true;
    let canShare = false;
    try {
      canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files });
    } catch {
      canShare = false;
    }
    const byHand = (openWhatsApp) => {
      if (openWhatsApp) window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      for (const i of chosen) deps.saveFile({ blob: i.file, name: i.file.name, type: i.file.type });
      message.textContent = 'Browser ni tak boleh hantar file terus. File dah didownload: lampirkan dalam WhatsApp.';
      message.hidden = false;
    };
    if (!canShare) {
      byHand(true);
      return;
    }
    navigator.share({ files, text, title: S.name }).catch((err) => {
      if (err?.name !== 'AbortError') byHand(false);
    });
  });

  const sheetText = `sheet ${lay.sheet.label} ${size(lay.sheet.width, lay.sheet.height)}`;
  const times = (verb) => `${verb} ${lay.sheets} kali`;
  const rows = blocked ? [] : [
    row({
      kind: 'cut',
      title: 'file cut keychain',
      make: cutFile,
    },
    h('div', { class: 'file-row-text' },
      h('b', {}, 'File cut'),
      h('span', {}, `${cm(S.size)}${hooked() ? ' hook' : ''}, ${sheetText}, ${lay.perSheet} pcs satu sheet, ${materialLabel()}. ${times('Cut')}`)),
    fileButton('File cut', cutFile)),
    row({
      kind: 'print',
      title: 'file print UV keychain',
      make: printFile,
    },
    h('div', { class: 'file-row-text' },
      h('b', {}, 'File print UV'),
      h('span', {}, `${lay.perSheet} pcs satu sheet, Spot 1 dan Spot 2, lubang kosong. ${times('UV print')}`)),
    fileButton('File print', printFile)),
  ];

  const all = h('button', { type: 'button', class: 'primary', ...(blocked ? { disabled: true } : {}) }, 'Download semua (ZIP)');
  all.addEventListener('click', busy(all, async () => {
    const files = [await branded(await cutFile()), await branded(await printFile())];
    deps.saveFile({
      blob: new Blob([makeZip(files)], { type: 'application/zip' }),
      name: `${stem()}-uv.zip`,
      type: 'application/zip',
    });
  }));

  dlg.replaceChildren(h('div', { class: 'dlg-body' },
    h('h2', {}, 'Download file'),
    blocked ? h('p', { class: 'warn-line' }, blocked) : null,
    ...rows,
    blocked ? null : h('p', { class: 'note' },
      `File cut: FRONT biru ialah marking laser (tanda muka depan), kemudian lubang ${HOLE_DIAMETER_MM} mm, keychain, frame sheet last. `
      + 'Jangan keluarkan keychain sebelum UV print. Masa UV print, FRONT di bawah dan boleh dibaca. '
      + `File print UV: gambar CMYK 300 dpi, Spot 1 dan Spot 2 (white) di bawah setiap keychain, lubang kosong. `
      + `Jumlah ${lay.total} keychain: ${lay.perSheet} pcs satu sheet, cut dan UV print ${lay.sheets} kali.`),
    items.length
      ? h('div', { class: 'share-bar' },
        h('span', {}, 'Pilih untuk share:'),
        h('button', { type: 'button', class: 'ghost', onclick: () => pick('cut') }, 'File cut (laser)'),
        h('button', { type: 'button', class: 'ghost', onclick: () => pick('print') }, 'File print (UV)'))
      : null,
    savedLine,
    message,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'ghost', onclick: () => dlg.close() }, 'Tutup'),
      items.length ? share : null,
      all)));
  dlg.showModal();
  if (!blocked) saveOnExport(savedLine);
}

/** The tab's steps (Boss, 17 Nov 2026). */
export const KEYCHAIN_STEPS = [
  ['Cut sheet acrylic',
    'Ikut material dan bilangan PCS dalam file cut, dan cut file yang sama sebanyak KALI yang tertulis. FRONT biru di bawah sheet ialah marking laser (satu garisan), tanda muka depan. Lubang dulu, kemudian keychain, frame sheet last. Jangan keluarkan keychain lagi.'],
  ['UV print atas sheet',
    'Semak layer dulu di Preview, File print. Letak sheet atas bed rapat dari bucu kiri atas, tulisan FRONT di bawah dan boleh dibaca (tak terbalik), jadi muka depan menghadap atas. Buka file print terus dalam FlexiPRINT: Spot 1 dan Spot 2 (white) di bawah gambar, lubang kosong. Print setiap sheet: sebanyak KALI yang sama dengan cut.'],
  ['Keluarkan keychain',
    `Bleed ${KEYCHAIN_BLEED_MM} mm yang terlebih jatuh atas sheet dan terbuang. Pasang ring di lubang ${HOLE_DIAMETER_MM} mm.`],
];

