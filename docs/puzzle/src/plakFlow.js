// The UV Plak tab (Boss, 28 Nov 2026): a client's plaque design in, the cut files and the
// UV print file out.
//
// The plaque (geom/plak.js): a plywood plate with the design UV printed on it, a black
// border glued over its edge as four mitred strips, the big text cut from black plywood
// and glued on raised over its printed guide (geom/letters.js finds and traces it), and
// a black acrylic base the plate stands in. Each material gets its own cut file; the print
// file is the plate in its frame, as the UV File tab prints a panel.
//
// The rest is the Keychain UV tab's way of working: the design stays in this browser
// (posterVault.js, in a database of its own), every change goes to a draft, Simpan sends
// the settings to the account, and Export hands over the files one at a time, in a ZIP,
// or shared to WhatsApp.

import { h, group, rnd } from './ui.js';
import * as gallery from './designs.js';
import { signedIn } from './cloud.js';
import * as vault from './posterVault.js';
import {
  openPoster, pageImages, pageImageBoxes, pageRaster, pagePicture, renderPicture, renderCutout, buildLayeredPrint,
} from './posterPdf.js';
import { buildPlakSheet, sheetToPdf } from './exportJobSheet.js';
import { makeZip } from './zip.js';
import { LOW_DPI, UV_BED_MM } from './geom/poster.js';
import { findContent } from './geom/crop.js';
import { findLetters, letterPath } from './geom/letters.js';
import {
  PLAK_SIZES, PLAK_MATERIALS, PLAK_BORDER_MM, PLAK_BLEED_MM, PLAK_FRAME_MM, PLAK_MIN_MM, WHITE_MODES,
  BASE_LAYER_MM, BASE_MATERIAL, CUSTOM_MAX_MM, SLOT_CLEAR_MM, PLAK_THICK_MM, BASE_OVERHANG_MM,
  planPlak, plakCutJobs, plakMaterial, cleanMaterials, cleanCustom, inkMargin, standingSize,
} from './geom/plak.js';
import {
  cleanPlak, plakRecord, readPlak, cleanLetterMin, LETTER_MIN_MM, LETTER_MIN_RANGE, QUANTITY_MAX,
} from './plakSaved.js';
import {
  LAYER_LOOK, inspectPrint, judgeBoxes, judgeUnderInk, releaseLayers,
} from './printCheck.js';
import { VERSION } from './version.js';
import { illustratorEditData } from './pdfWeight.js';
import {
  isPosterFile, stripExt, POSTER_ACCEPT, POSTER_FORMATS,
} from './posterFile.js';

const RASTER_PX = 2400;   // the page, looked at for its text: about 0.12 mm a pixel on A4
const PREVIEW_PX = 1800;  // the design on screen
const LETTER_THIN_MM = 1.2;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const allLayersOn = () => Object.fromEntries(LAYER_LOOK.map((l) => [l.name, true]));
const fresh = () => ({
  size: 'A4',
  custom: null,
  border: true,
  letters: true,
  letterMin: LETTER_MIN_MM,
  off: [],                         // letters clicked off, by their id on the page
  materials: cleanMaterials({}),
  base: true,
  white: WHITE_MODES[0].id,         // white ink under the design only, or everywhere
  quantity: 1,
  client: '',
  dateline: '',
  view: 'plak',
  sheet: '',                       // the cut file on screen: a material id, '' the first
});

const S = {
  file: null,     // { name, size, hash, bytes, lib, doc, pages, editData, kind }
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
export function initPlak(d) {
  deps = d;
}

export const plakActive = () => Boolean(S.file);
const currentPage = () => S.file.pages[S.page];

const r1 = (v) => Math.round(v * 10) / 10;
const size = (w, hh) => `${rnd(w, 1)} x ${rnd(hh, 1)} mm`;
const baseName = (name) => stripExt(name).trim()
  .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'plak';
const nameOf = (fileName) => stripExt(fileName).trim() || 'Plak';
const matLabel = (part) => plakMaterial(S.materials[part]).label;

/** The size a new design starts at: its own when it is about A4 or A3, or made to size. */
function startSize(one) {
  const p = one.pages[0];
  const long = Math.max(p.widthMm, p.heightMm);
  const near = PLAK_SIZES.find((s) => s.long && Math.abs(s.long - long) <= 3);
  if (near) return near.id;
  if (one.kind !== 'pdf') return 'A4';
  const plan = planPlak({ pageW: p.widthMm, pageH: p.heightMm, size: 'file', border: true, base: true });
  return plan.fitsBed && !plan.tooSmall ? 'file' : 'A4';
}

const planOf = () => {
  const p = currentPage();
  return planPlak({
    pageW: p.widthMm,
    pageH: p.heightMm,
    size: S.size,
    custom: S.custom,
    border: S.border,
    base: S.base,
  });
};

// ---- the job, as it gets saved ----------------------------------------------------

function job() {
  return {
    file: {
      name: S.file.name, size: S.file.size, hash: S.file.hash, pages: S.file.pages.length,
    },
    page: S.page,
    size: S.size,
    custom: S.custom,
    border: S.border,
    letters: S.letters,
    letterMin: S.letterMin,
    off: [...S.off],
    materials: { ...S.materials },
    base: S.base,
    white: S.white,
    quantity: S.quantity,
    client: S.client,
    dateline: S.dateline,
    view: S.view,
    sheet: S.sheet,
  };
}

/** What counts as a change worth saving. Looking at another view does not. */
const settingsKey = () => JSON.stringify({
  ...job(), view: undefined, sheet: undefined, name: S.name,
});

export const plakDirty = () => plakActive() && settingsKey() !== S.savedKey;

function paintStatus() {
  const el = deps.els.status;
  const dirty = plakDirty();
  el.classList.toggle('unsaved', dirty);
  if (dirty) el.textContent = 'Belum disimpan';
  else el.textContent = S.pdfKept ? 'Disimpan' : 'Disimpan, tanpa file design';
}

function writeDraft() {
  if (!plakActive()) return;
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

const record = () => plakRecord(job(), planOf(), chosenLetters().length);

/** What the Save dialog and the gallery may see and change while a job is open. */
export const plakStore = {
  name: () => S.name,
  params: () => record().params,
  material: () => record().material,
  extra: () => record().extra,
  rename: (name) => {
    S.name = name;
    S.nameAuto = false;
    deps.els.name.value = name;
    changed();
  },
  note: 'Yang disimpan ke akaun ialah tetapan: saiz, border, huruf timbul, base, material, client dan dateline. '
    + 'File design kekal dalam browser ni. Kalau buka di PC lain, kena pilih file tu semula.',
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
export function renamePlak(name) {
  if (name.trim()) plakStore.rename(name.trim());
  else {
    plakStore.rename(nameOf(S.file.name));
    S.nameAuto = true;
  }
}

// ---- opening and closing ------------------------------------------------------------

function readError(err) {
  if (err?.code === 'picture') return 'Gambar ni tak dapat dibaca. Cuba simpan semula sebagai PNG atau JPG.';
  if (err?.name === 'PasswordException') return 'PDF ni berkunci dengan password. Minta file tanpa password.';
  return 'PDF ni tak dapat dibaca. Cuba simpan semula sebagai PDF biasa.';
}

function forget(file) {
  for (const p of file.pages) {
    if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    if (p.cutoutUrl) URL.revokeObjectURL(p.cutoutUrl);
  }
  file.doc.destroy().catch(() => {});
}

function dropCheck() {
  if (S.check) releaseLayers(S.check.layers);
  S.check = null;
}

/** Ask before throwing away unsaved changes. Resolves true to carry on. */
function confirmLeave() {
  if (!plakDirty()) return Promise.resolve(true);
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
 * Open a PDF or a picture as the job. One design per job: of several files the first is taken.
 *
 * @param restore when opening a saved job or the draft:
 *   { saved, name, design: { id, name }, savedKey, quiet }
 * @returns whether a job is now open
 */
export async function openPlakFiles(fileList, restore = null) {
  const complain = (text) => { if (!restore?.quiet) alert(text); };
  const chosen = [...(fileList || [])].filter(Boolean);
  const pdfs = chosen.filter(isPosterFile);
  if (!pdfs.length) {
    if (chosen.length) complain(`File ni tak dapat dibuka. Pilih design plak dalam format ${POSTER_FORMATS}.`);
    return false;
  }
  if (pdfs.length > 1) complain(`Satu job satu design. Yang dibuka: ${pdfs[0].name}.`);
  if (!restore && !(await confirmLeave())) return false;
  const wasActive = plakActive();
  deps.els.hint.textContent = 'Membaca file...';
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
    complain('File ni tiada page.');
    one.doc.destroy().catch(() => {});
    deps.refresh();
    return false;
  }
  let hash = '';
  try {
    hash = await vault.hashBytes(one.bytes);
    await vault.putFile(hash, one.name, one.bytes);
  } catch { /* opens anyway; there will be no draft to come back to */ }

  // A new file for a saved job is the same job with a better file: settings stay.
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
    kind: one.kind,
    editData: one.kind === 'pdf' ? illustratorEditData(one.bytes) : null,
  };
  S.page = 0;
  if (restore) {
    const saved = restore.saved;
    Object.assign(S, {
      page: Math.min(saved.page, one.pages.length - 1),
      size: saved.size,
      custom: saved.custom,
      border: saved.border,
      letters: saved.letters,
      letterMin: saved.letterMin,
      off: [...saved.off],
      materials: { ...saved.materials },
      base: saved.base,
      white: saved.white,
      quantity: saved.quantity,
      client: saved.client,
      dateline: saved.dateline,
      view: saved.view,
      sheet: saved.sheet,
    });
    S.name = restore.name;
    S.nameAuto = false;
  } else if (!sameJob) {
    Object.assign(S, fresh());
    S.size = startSize(one);
    // A picture has no text of its own, only pixels: raised letters wait to be asked for.
    S.letters = one.kind === 'pdf';
    S.savedKey = null;
    S.nameAuto = true;
    S.name = nameOf(one.name);
  } else {
    S.off = [];
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

/** The saved job's file from this browser, or asked for. Resolves to a File or null. */
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
      h('h2', {}, 'Pilih file plak'),
      h('p', { class: 'muted' },
        `Design ni guna "${saved.file.name}", yang tiada dalam browser ni. Pilih file yang sama.`),
      h('label', { class: 'primary file-pick' },
        h('input', {
          type: 'file',
          accept: POSTER_ACCEPT,
          hidden: true,
          onchange: (e) => finish(e.target.files[0] || null),
        }),
        'Pilih file'),
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: () => finish(null) }, 'Batal'))));
    dlg.showModal();
  });
}

/** Open a job from the account. @returns false when nothing changed */
export async function openPlakDesign(row) {
  const saved = readPlak(row);
  if (!saved) return false;
  if (!(await confirmLeave())) return false;
  const file = await fileFor(saved);
  if (!file) return false;
  return openPlakFiles([file], { saved, name: row.name, design: { id: row.id, name: row.name } });
}

/** Whatever was on screen last time, put back. Called once when the tab starts. */
export async function restorePlakDraft() {
  let draft = null;
  try {
    draft = await vault.getDraft();
  } catch {
    return false;
  }
  if (!draft || plakActive()) return false;
  const saved = cleanPlak(draft.job);
  const file = saved && await fileFor(saved, { ask: false });
  const opened = file && await openPlakFiles([file], {
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
export async function closePlak() {
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

// ---- the design: its text, its pictures, its ink ----------------------------------------

/**
 * The design on this page, looked at once: the text that could be raised, where its ink
 * reaches, its pictures, and a picture of it for the screen. Null while it is being
 * worked out.
 */
function analysisOf(page) {
  if (page.analysis) return page.analysis;
  if (page.analysing) return null;
  const { file } = S;
  page.analysing = (async () => {
    const raster = await pageRaster(page.obj, RASTER_PX);
    const mm = raster.mmPerPx;
    const ink = findContent(raster.rgba, raster.width, raster.height);
    let boxes = [];
    try {
      boxes = await pageImageBoxes(file.lib, page);
    } catch { /* every patch of ink is a candidate then */ }
    const letters = findLetters(raster, boxes);
    let images = [];
    try {
      images = await pageImages(file.lib, page);
    } catch { /* no resolution to check */ }
    const previewUrl = await renderPicture(page, PREVIEW_PX);
    if (page.previewUrl) URL.revokeObjectURL(page.previewUrl);
    page.previewUrl = previewUrl;
    // The same with its white see-through: the wood shows there when the white ink goes
    // under the design's ink only.
    const cutoutUrl = await renderCutout(page, PREVIEW_PX);
    if (page.cutoutUrl) URL.revokeObjectURL(page.cutoutUrl);
    page.cutoutUrl = cutoutUrl;
    page.analysis = {
      letters,
      ink,
      mmPerPx: mm,
      pageMm: { width: raster.width * mm, height: raster.height * mm },
      images,
    };
  })().catch(() => {
    page.analysis = { failed: true };
  }).finally(() => {
    page.analysing = null;
    if (S.file === file && currentPage() === page) renderPlak();
  });
  return null;
}

const letterSize = (l, plan) => Math.max(l.box.width, l.box.height) * plan.scale;

/** The candidates tall enough to raise at this size. */
function eligibleLetters(a = currentPage().analysis, plan = planOf()) {
  if (!a || a.failed) return [];
  return a.letters.filter((l) => letterSize(l, plan) >= S.letterMin - 1e-9);
}

/** The letters raised: tall enough, and not clicked off. */
function chosenLetters(a = currentPage().analysis, plan = planOf()) {
  if (!S.letters) return [];
  const off = new Set(S.off);
  return eligibleLetters(a, plan).filter((l) => !off.has(l.id));
}

/** Why the files cannot be made yet, or null. */
function blockedReason(a, plan) {
  if (!a) return 'Tunggu sekejap, tool masih membaca design.';
  if (a.failed) return 'Page ni tak dapat dilukis. Cuba simpan semula file tu sebagai PDF biasa, PNG atau JPG.';
  if (plan.tooSmall) return `Plak terlalu kecil: sisi paling pendek ${PLAK_MIN_MM} mm.`;
  if (!plan.fitsBed) {
    return `Plak ${size(plan.width, plan.height)} dengan frame ${PLAK_FRAME_MM} mm tak muat bed UV `
      + `${UV_BED_MM.long} x ${UV_BED_MM.short} mm. Pilih saiz lebih kecil.`;
  }
  return null;
}

// ---- the files ---------------------------------------------------------------------------

const formatDate = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
};
const stem = () => `${baseName(S.file.name)}-plak`;
const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const PART_TEXT = {
  front: (plan) => `plak depan ${rnd(plan.plate.width, 1)} x ${rnd(plan.plate.height, 1)} mm${plan.tongue ? ` (kaki ${plan.tongue} mm)` : ''}`,
  border: (plan) => `border ${plan.border} mm, 4 keping sudut 45`,
  letters: (plan, n) => `${n} huruf timbul`,
  base: (plan) => `base ${plan.base.length} x ${plan.base.depth} mm, 1 keping, alur tembus ${plan.base.slot.width} mm`,
};

/** Every cut file this job needs: one per material. */
function cutJobs(plan = planOf()) {
  return plakCutJobs(plan, chosenLetters(undefined, plan), S.materials);
}

function sheetOf(cut, plan) {
  const n = chosenLetters(undefined, plan).length;
  return buildPlakSheet(cut, {
    client: S.client,
    dateline: formatDate(S.dateline),
    units: S.quantity,
    what: `PLAK UV ${rnd(plan.width, 1)} x ${rnd(plan.height, 1)} mm: ${cut.parts.map((p) => PART_TEXT[p](plan, n)).join(', ')}`,
  });
}

function cutFile(cut) {
  const plan = planOf();
  const body = sheetToPdf(sheetOf(cut, plan), { title: `${S.name} - plak cut ${cut.material.label}` });
  return {
    blob: new Blob([body], { type: 'application/pdf' }),
    name: `${stem()}-cut-${slug(cut.material.label)}-x${S.quantity}.pdf`,
    type: 'application/pdf',
  };
}

const pictureKey = (plan) => [
  S.file.hash || S.file.name, S.page, plan.width, plan.height, plan.printBox.x, plan.printBox.y,
  plan.printBox.width, plan.printBox.height, plan.page.height, S.white,
].join('|');
const underInkOnly = () => S.white === 'design';
/** The design on screen: its white see-through where the wood will show. */
const shownImage = (page) => (underInkOnly() ? page.cutoutUrl : page.previewUrl) || null;

/** The print file's picture, 300 dpi CMYK, kept for the layer check and Export. */
function printPictureOf(page, plan) {
  const key = pictureKey(plan);
  if (!page.prints) page.prints = new Map();
  if (!page.prints.has(key)) {
    const made = pagePicture(page.obj, plan.design, plan.printBox, 0, { whiteMask: underInkOnly() });
    made.catch(() => { if (page.prints.get(key) === made) page.prints.delete(key); });
    page.prints.set(key, made);
    if (page.prints.size > 2) page.prints.delete(page.prints.keys().next().value);
  }
  return page.prints.get(key);
}

async function printFile() {
  const page = currentPage();
  const plan = planOf();
  const blocked = blockedReason(page.analysis || null, plan);
  if (blocked) throw Object.assign(new Error(blocked), { code: 'blocked' });
  const { jpg, mask } = await printPictureOf(page, plan);
  const bytes = await buildLayeredPrint(plan.page, [{ jpg, box: plan.printBox, mask }], { title: `${S.name} - plak print` });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${stem()}-print-${rnd(plan.page.width, 0)}x${rnd(plan.page.height, 0)}-x${S.quantity}.pdf`,
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
    : 'File tak dapat dibina. Cuba simpan semula design tu sebagai PDF biasa, PNG atau JPG.';
}

// ---- the print file, read back -----------------------------------------------------------

function printCheckFor(plan) {
  const key = pictureKey(plan);
  if (S.check?.key === key) return S.check;
  dropCheck();
  const check = {
    key, state: 'building', layers: null, results: null, error: null,
  };
  S.check = check;
  (async () => {
    const file = await printFile();
    return inspectPrint(S.file.lib, new Uint8Array(await file.blob.arrayBuffer()), [plan.printBox], null,
      underInkOnly() ? { inkIn: plan.printBox } : {});
  })().then((found) => {
    if (S.check !== check) {
      releaseLayers(found.layers);
      return;
    }
    check.layers = found.layers;
    check.results = underInkOnly()
      ? judgeUnderInk(found, plan.printBox)
      : judgeBoxes(found, [plan.printBox], 'plak');
    check.state = 'ready';
    if (S.view === 'print') renderPlak();
  }).catch((err) => {
    if (S.check !== check) return;
    check.state = 'error';
    check.error = fileError(err);
    if (S.view === 'print') renderPlak();
  });
  return check;
}

// ---- drawing -----------------------------------------------------------------------------

export function renderPlak() {
  if (!plakActive()) return;
  renderStage();
  renderPanel();
  paintViews();
}

/** The view buttons in the top bar, showing the view on screen. */
function paintViews() {
  for (const btn of deps.els.views?.querySelectorAll('[data-view]') || []) {
    btn.setAttribute('aria-selected', String(btn.dataset.view === S.view));
  }
}

/** Show another view: Plak, 3D, File cut or File print. */
export function setPlakView(view) {
  if (!plakActive() || S.view === view) return;
  S.view = view;
  renderPlak();
  changed();
}

function hint(text) {
  deps.els.hint.textContent = text;
  deps.els.hint.classList.add('show');
}

/** The cut file on screen: the one picked, or the first. */
function shownCut(jobs) {
  return jobs.find((j) => j.material.id === S.sheet) || jobs[0];
}

function toggleLetter(id) {
  const off = new Set(S.off);
  if (off.has(id)) off.delete(id);
  else off.add(id);
  S.off = [...off].sort((a, b) => a - b);
  renderPlak();
  changed();
}

// ---- the 3D view (Boss, 28 Nov 2026: "macam tab box maker") ----------------------------

let viewer = null;        // a promise of the Plak3D, made the first time 3D is opened

/** What the 3D view builds the plaque from: the plan and the chosen letters, plate mm. */
function plak3dData(page, a, plan) {
  const F = plan.frame;
  return {
    width: plan.width,
    height: plan.height,
    tongue: plan.tongue,
    thick: PLAK_THICK_MM,
    printBox: {
      x: plan.printBox.x - F, y: plan.printBox.y - F, width: plan.printBox.width, height: plan.printBox.height,
    },
    imageUrl: shownImage(page),
    frontColour: plakMaterial(S.materials.front).colour,
    borderColour: plakMaterial(S.materials.border).colour,
    letterColour: plakMaterial(S.materials.letters).colour,
    baseColour: BASE_MATERIAL.colour,
    baseEdge: BASE_MATERIAL.edge,
    grain: S.materials.front === 'maple-3',
    strips: plan.strips,
    letters: chosenLetters(a, plan).map((l) => l.loops.map((loop) => loop.map(([x, y]) => [x * plan.scale, y * plan.scaleY]))),
    base: plan.base ? {
      length: plan.base.length, depth: plan.base.depth, layers: plan.base.layers, layerMm: BASE_LAYER_MM, slot: plan.base.slot,
      pieces: plan.base.pieces,
    } : null,
  };
}

/** Show the 3D pane or the flat one. */
function show3d(on) {
  deps.els.stage3d.hidden = !on;
  deps.els.preview.hidden = on;
  deps.els.zoomPick.hidden = on;
  if (!on && viewer) viewer.then((v) => v?.setActive(false));
}

function render3d(page, a, plan) {
  show3d(true);
  if (!viewer) {
    viewer = import('./plak3d.js')
      .then((m) => new m.Plak3D(deps.els.stage3d))
      .catch(() => null);
  }
  const data = plak3dData(page, a, plan);
  viewer.then((v) => {
    if (S.view !== '3d' || !plakActive()) return;
    if (!v) {
      hint('3D tak dapat dibuka dalam browser ni. Guna preview Plak.');
      return;
    }
    v.build(data);
    v.setActive(true);
  });
  hint(!a ? 'Membaca design...' : '3D · seret untuk pusing · klik dua kali untuk muat');
}

/** The design closed: the 3D pane goes, and stops drawing. */
export function closePlak3d() {
  deps.els.stage3d.hidden = true;
  deps.els.preview.hidden = false;
  if (viewer) viewer.then((v) => v?.setActive(false));
}

function renderStage() {
  const page = currentPage();
  const a = analysisOf(page);
  const plan = planOf();
  const blocked = blockedReason(a, plan);
  if (S.view === '3d') {
    render3d(page, a && !a.failed ? a : null, plan);
    return;
  }
  show3d(false);
  if (S.view === 'cut' && !blocked) {
    const jobs = cutJobs(plan);
    const cut = shownCut(jobs);
    deps.view.renderSheet(sheetOf(cut, plan), `plak-cut:${cut.material.id}:${plan.width}:${plan.height}`);
    hint(`File cut ${cut.material.label}: ${cut.parts.map((p) => PART_TEXT[p](plan, chosenLetters(a, plan).length)).join(', ')}`);
    return;
  }
  if (S.view === 'print' && !blocked) {
    const check = printCheckFor(plan);
    const F = plan.frame;
    deps.view.renderPrint({
      size: plan.page,
      layers: check.layers,
      order: LAYER_LOOK.map((l) => l.name),
      on: S.layerOn,
      cuts: [`M ${F} ${F} L ${F + plan.plate.width} ${F} L ${F + plan.plate.width} ${F + plan.plate.height} L ${F} ${F + plan.plate.height} Z`],
      fitKey: `plak-print:${plan.width}:${plan.height}`,
    });
    hint(check.state === 'building'
      ? 'Membina file print (gambar CMYK 300 dpi)...'
      : `File print ${size(plan.page.width, plan.page.height)}: plak dalam frame ${F} mm`);
    return;
  }
  const front = plakMaterial(S.materials.front);
  const eligible = a && !a.failed && S.letters ? eligibleLetters(a, plan) : [];
  const off = new Set(S.off);
  const F = plan.frame;
  deps.view.renderPlak({
    width: plan.width,
    height: plan.height,
    printBox: {
      x: plan.printBox.x - F, y: plan.printBox.y - F, width: plan.printBox.width, height: plan.printBox.height,
    },
    imageUrl: shownImage(page),
    front: front.colour,
    border: plakMaterial(S.materials.border).colour,
    letters: plakMaterial(S.materials.letters).colour,
    baseColour: BASE_MATERIAL.colour,
    baseEdge: BASE_MATERIAL.edge,
    strips: plan.strips,
    raised: eligible.map((l) => ({ id: l.id, d: letterPath(l, plan.scale, 0, 0, plan.scaleY), on: !off.has(l.id) })),
    base: plan.base ? { length: plan.base.length, height: plan.base.height } : null,
    fitKey: `plak:${plan.width}:${plan.height}:${S.base}`,
    onLetter: toggleLetter,
  });
  if (!a) hint('Membaca design dan mencari tulisan besar...');
  else if (a.failed) hint('Page ni tak dapat dilukis.');
  else {
    const n = chosenLetters(a, plan).length;
    const parts = [`Plak ${size(plan.width, plan.height)}`];
    if (plan.border) parts.push(`border ${plan.border} mm`);
    if (S.letters) {
      if (eligible.length) parts.push(`${n} huruf timbul · tekan huruf untuk buang atau tambah`);
      else parts.push(a.letters.length ? `tiada huruf setinggi ${S.letterMin} mm` : 'tiada tulisan besar dijumpai');
    }
    if (plan.base) parts.push(`base ${plan.base.length} x ${plan.base.depth} mm`);
    hint(parts.join(' · '));
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
  const plan = planOf();
  root.replaceChildren(...[
    h('h2', { class: 'insp-title' }, 'UV Plak'),
    fileGroup(a, plan),
    sizeGroup(plan),
    frontGroup(),
    borderGroup(a, plan),
    lettersGroup(a, plan),
    baseGroup(plan),
    previewGroup(a, plan),
    jobGroup(),
    h('button', { class: 'link', type: 'button', onclick: closePlak }, 'Tutup design'),
    h('p', { class: 'version-stamp' }, `Versi ${VERSION}`),
  ].filter(Boolean));
  root.scrollTop = scroll;
}

function fileGroup(a, plan) {
  const { pages } = S.file;
  const heavy = S.file.editData && S.file.editData.bytes >= 5e6;
  const picture = pages[0].obj.picture;
  const p = currentPage();
  const body = [
    h('div', { class: 'stat' },
      h('span', { class: 'file-name', title: S.file.name }, S.file.name),
      h('b', {}, picture ? `${picture.pxW} x ${picture.pxH} px` : pages.length === 1 ? '1 page' : `${pages.length} page`)),
    stat('Saiz dalam file', size(p.widthMm, p.heightMm)),
  ];
  if (pages.length > 1) {
    body.push(h('div', { class: 'field' },
      h('label', { for: 'plakPage' }, 'Page design'),
      h('select', {
        id: 'plakPage',
        onchange: (e) => set({ page: Number(e.target.value), off: [] }),
      }, pages.map((pg) => h('option', { value: pg.index, ...(pg.index === S.page ? { selected: true } : {}) }, `Page ${pg.index + 1}`)))));
  }
  if (a && !a.failed) {
    // The lowest resolution of the big pictures in it, at the plaque's size.
    const dpis = a.images.map((im) => im.pxW / ((im.fracW * plan.width) / 25.4)).filter((v) => Number.isFinite(v) && v > 0);
    if (dpis.length) {
      const dpi = Math.round(Math.min(...dpis));
      body.push(dpi < LOW_DPI
        ? h('p', { class: 'warn' }, `Resolusi gambar rendah: lebih kurang ${dpi} dpi pada saiz ni, print boleh nampak kabur.`)
        : stat('Resolusi gambar', `${dpi} dpi`));
    }
  }
  if (heavy) {
    body.push(h('div', { class: 'heavy-note' }, h('p', {}, `Lebih kurang ${rnd(S.file.editData.bytes / 1e6, 1)} MB dalam PDF ni ialah data edit `
      + 'Illustrator yang tak perlu untuk print. File print tetap betul.')));
  }
  body.push(
    h('div', { class: 'row-actions' },
      h('label', { class: 'ghost file-pick', title: `Ganti file design: ${POSTER_FORMATS}` },
        h('input', {
          type: 'file',
          accept: POSTER_ACCEPT,
          hidden: true,
          onchange: (e) => {
            const files = [...e.target.files];
            e.target.value = '';
            openPlakFiles(files);
          },
        }),
        'Tukar file')),
    h('p', { class: 'hint' },
      `${POSTER_FORMATS}. File kekal dalam browser ni dan tak dihantar ke mana-mana. `
      + 'Simpan cuma hantar tetapan ke akaun anda.'),
  );
  return group('Design', true, ...body);
}

/** A choice of the two plywoods for one part. */
function materialPick(part) {
  return h('div', { class: 'presets two' }, PLAK_MATERIALS.map((m) => h('button', {
    class: 'preset',
    type: 'button',
    'aria-pressed': String(S.materials[part] === m.id),
    title: m.label,
    onclick: () => {
      if (S.materials[part] !== m.id) set({ materials: { ...S.materials, [part]: m.id } });
    },
  },
  h('b', {}, h('span', { class: 'swatch-dot', style: `background:${m.colour}` }), m.kind),
  h('span', {}, `Plywood ${m.thick}`))));
}

function sizeGroup(plan) {
  const p = currentPage();
  const presets = h('div', { class: 'presets two' }, PLAK_SIZES.map((s) => {
    const at = planPlak({
      pageW: p.widthMm, pageH: p.heightMm, size: s.id, custom: S.custom ?? plan.width, border: S.border, base: S.base,
    });
    return h('button', {
      class: at.fitsBed && !at.tooSmall ? 'preset' : 'preset no-fit',
      type: 'button',
      'aria-pressed': String(S.size === s.id),
      title: `${s.label}: ${size(at.width, at.height)}`,
      onclick: () => {
        if (S.size === s.id) return;
        // Typing starts from the size on screen.
        set({ size: s.id, ...(s.id === 'custom' && S.custom == null ? { custom: plan.width } : {}) });
      },
    },
    h('b', {}, s.label),
    h('span', {}, s.id === 'custom' ? 'lebar atau tinggi' : `${rnd(at.width, 0)} x ${rnd(at.height, 0)}`));
  }));
  const ratio = plan.ratio;
  const field = (key, label, value) => h('div', { class: 'field' },
    h('label', { for: `plak${key}` }, label),
    h('input', {
      id: `plak${key}`,
      type: 'number',
      min: PLAK_MIN_MM,
      max: CUSTOM_MAX_MM,
      step: 1,
      value: rnd(value, 1),
      onchange: (e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isFinite(v) || v <= 0) {
          renderPanel();
          return;
        }
        set({ custom: cleanCustom(key === 'W' ? v : v * ratio) });
      },
    }));
  const custom = S.size === 'custom'
    ? [
      h('div', { class: 'field-pair' }, field('W', 'Lebar (mm)', plan.width), field('H', 'Tinggi (mm)', plan.height)),
      h('p', { class: 'hint' }, 'Taip lebar atau tinggi; satu lagi ikut nisbah design.'),
    ]
    : null;
  const stand = standingSize(plan);
  return group('Saiz plak', true,
    presets,
    custom,
    stat('Muka plak (design)', size(plan.width, plan.height)),
    plan.base ? stat('Berdiri atas base', `${size(stand.width, stand.height)}, dalam ${stand.depth} mm`) : null,
    plan.tooSmall ? h('p', { class: 'warn' }, `Terlalu kecil: sisi paling pendek ${PLAK_MIN_MM} mm.`) : null,
    !plan.fitsBed ? h('p', { class: 'warn' }, `Plak dengan frame ${PLAK_FRAME_MM} mm tak muat bed UV ${UV_BED_MM.long} x ${UV_BED_MM.short} mm.`) : null,
    h('p', { class: 'hint' }, 'Saiz ialah muka plak, sama dengan design: file A4 jadi plak A4. Nisbah design kekal.'));
}

function frontGroup() {
  return group('Plak depan', true,
    materialPick('front'),
    h('div', { class: 'field' },
      h('label', {}, 'White ink (Spot 1 dan Spot 2)'),
      h('div', { class: 'presets two' }, WHITE_MODES.map((m) => h('button', {
        class: 'preset',
        type: 'button',
        'aria-pressed': String(S.white === m.id),
        onclick: () => { if (S.white !== m.id) set({ white: m.id }); },
      }, h('b', {}, m.label), h('span', {}, m.note))))),
    h('p', { class: 'hint' }, S.white === 'design'
      ? `${matLabel('front')}, di-UV print: white hanya di bawah gambar dan tulisan, jadi bahagian putih design `
        + 'tak dicetak langsung dan kayu nampak. Tulisan besar pun dicetak sebagai panduan tampal huruf timbul.'
      : `${matLabel('front')}, di-UV print: white penuh di bawah seluruh kawasan print, latar jadi putih. `
        + 'Tulisan besar pun dicetak sebagai panduan tampal huruf timbul.'));
}

function borderGroup(a, plan) {
  const body = [
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        ...(S.border ? { checked: true } : {}),
        onchange: (e) => set({ border: e.target.checked }),
      }),
      `Border ${PLAK_BORDER_MM} mm keliling, ditampal atas depan`),
  ];
  if (S.border) {
    body.push(
      materialPick('border'),
      stat('Dipotong', `4 keping, sudut 45°: 2 x ${rnd(plan.width, 1)} mm, 2 x ${rnd(plan.height, 1)} mm`),
      h('p', { class: 'hint' }, `Jalur disusun rapat dalam file cut, jimat material. Bawah border tak dicetak, `
        + `kecuali ${PLAK_BLEED_MM} mm di tepi dalam, supaya gam lekat pada kayu.`),
    );
    const margin = a && !a.failed ? inkMargin(a.ink, a.mmPerPx, plan) : null;
    if (margin != null && margin < PLAK_BORDER_MM - 0.5) {
      body.push(h('p', { class: 'warn' }, `Design sampai ${Math.max(0, margin)} mm dari tepi: border ${PLAK_BORDER_MM} mm akan tutup sebahagian design. Semak preview.`));
    }
  } else {
    body.push(h('p', { class: 'hint' }, `Tanpa border: print lebih ${PLAK_BLEED_MM} mm lepas tepi plak.`));
  }
  return group('Border', true, ...body);
}

function lettersGroup(a, plan) {
  const body = [
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        ...(S.letters ? { checked: true } : {}),
        onchange: (e) => set({ letters: e.target.checked }),
      }),
      'Tulisan besar jadi timbul'),
  ];
  if (!S.letters) {
    body.push(h('p', { class: 'hint' }, `Huruf dipotong dari ${matLabel('letters')} dan ditampal atas tulisan yang dicetak.`));
    return group('Huruf timbul', true, ...body);
  }
  body.push(materialPick('letters'));
  body.push(h('div', { class: 'field' },
    h('label', { for: 'plakLetterMin' }, 'Huruf paling kecil (mm)'),
    h('input', {
      id: 'plakLetterMin',
      type: 'number',
      min: LETTER_MIN_RANGE[0],
      max: LETTER_MIN_RANGE[1],
      step: 1,
      value: S.letterMin,
      onchange: (e) => set({ letterMin: cleanLetterMin(e.target.value) }),
    })));
  if (!a) body.push(h('p', { class: 'hint' }, 'Mencari tulisan besar...'));
  else if (a.failed) body.push(h('p', { class: 'warn' }, 'Page ni tak dapat dilukis.'));
  else {
    const eligible = eligibleLetters(a, plan);
    const chosen = chosenLetters(a, plan);
    if (!eligible.length) {
      body.push(h('p', { class: 'warn' }, a.letters.length
        ? `Tiada huruf setinggi ${S.letterMin} mm pada saiz ni. Kecilkan "Huruf paling kecil".`
        : 'Tiada tulisan besar dijumpai dalam design ni. Tulisan dalam gambar (logo, foto) tak dikira.'));
    } else {
      body.push(stat('Huruf timbul', `${chosen.length} dari ${eligible.length}`));
      const thin = chosen.filter((l) => l.stroke * plan.scale < LETTER_THIN_MM);
      if (thin.length) {
        body.push(h('p', { class: 'warn' }, `${thin.length} huruf ada garisan nipis bawah ${LETTER_THIN_MM} mm: mudah patah bila dipotong 3 mm.`));
      }
      const b = plan.border;
      const under = b ? chosen.filter((l) => {
        const [kx, ky] = [plan.scale, plan.scaleY];
        return l.box.x * kx < b || l.box.y * ky < b
          || (l.box.x + l.box.width) * kx > plan.width - b || (l.box.y + l.box.height) * ky > plan.height - b;
      }) : [];
      if (under.length) body.push(h('p', { class: 'warn' }, `${under.length} huruf bertindih dengan border.`));
      body.push(h('p', { class: 'hint' }, 'Tekan huruf dalam preview Plak untuk buang atau tambah. '
        + 'Huruf dipotong di tempatnya, jadi boleh diangkat sekali dengan transfer tape dan ditampal atas tulisan yang dicetak.'));
      if (S.off.length) {
        body.push(h('button', { class: 'ghost', type: 'button', onclick: () => set({ off: [] }) }, 'Pilih semua huruf semula'));
      }
    }
  }
  return group('Huruf timbul', true, ...body);
}

function baseGroup(plan) {
  const body = [
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        ...(S.base ? { checked: true } : {}),
        onchange: (e) => set({ base: e.target.checked }),
      }),
      `Base ${BASE_MATERIAL.label}, plak berdiri dalam alur`),
  ];
  if (plan.base) {
    const b = plan.base;
    body.push(
      stat('Base', `${b.length} x ${b.depth} mm, 1 keping ${b.height} mm`),
      stat('Alur tembus', `${b.slot.width} x ${b.slot.length} mm`),
      stat('Kaki plak', `${plan.tongue} mm masuk alur`),
      h('p', { class: 'hint' }, `Satu keping ${BASE_MATERIAL.label}, alur dipotong tembus. Kaki plak ${plan.tongue} mm, `
        + `${rnd(b.height - plan.tongue, 1)} mm pendek dari tebal base, jadi tak tercucuk keluar di bawah dan base duduk rata. `
        + (plan.border ? 'Jalur border bawah duduk atas base dan jadi penahan. ' : '')
        + `Gam di alur. Alur ${PLAK_THICK_MM} mm + ${SLOT_CLEAR_MM} mm longgar. Base lebih ${BASE_OVERHANG_MM} mm kiri kanan.`),
    );
  } else {
    body.push(h('p', { class: 'hint' }, 'Tanpa base: plak tiada kaki, untuk digantung atau dipasang sendiri.'));
  }
  return group('Base', true, ...body);
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
          renderPlak();
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
    h('p', { class: 'hint' }, 'Dibaca dari file print sebenar. Warna untuk mata sahaja. Merah ialah garis cut plak.'),
  ];
}

function previewGroup(a, plan) {
  const choice = (id, label) => h('button', {
    type: 'button',
    'aria-pressed': String(S.view === id),
    onclick: () => {
      S.view = id;
      renderPlak();
      changed();
    },
  }, label);
  const body = [h('div', { class: 'seg seg-4' }, choice('plak', 'Plak'), choice('3d', '3D'), choice('cut', 'File cut'), choice('print', 'File print'))];
  const blocked = blockedReason(a, plan);
  if (S.view === 'cut' && !blocked) {
    const jobs = cutJobs(plan);
    const shown = shownCut(jobs);
    body.push(h('div', { class: jobs.length > 2 ? 'seg seg-3' : 'seg' }, jobs.map((j) => h('button', {
      type: 'button',
      'aria-pressed': String(j === shown),
      title: j.material.label,
      onclick: () => {
        S.sheet = j.material.id;
        renderPlak();
        changed();
      },
    }, j.material.label.replace(/^Plywood /, '')))));
    body.push(h('p', { class: 'hint' }, `Satu file cut untuk setiap material. Garis dipotong ikut susunan: lubang huruf dulu, `
      + 'kemudian huruf, jalur border, plak, dan frame paling last.'));
  } else if (S.view === 'print' && !blocked) {
    body.push(...layerPanel());
  } else if (S.view === '3d') {
    body.push(h('p', { class: 'hint' }, 'Plak siap dalam 3D: plak depan dengan print, border dan huruf timbul '
      + `${PLAK_THICK_MM} mm, berdiri dalam alur base ${BASE_MATERIAL.label}. Seret untuk pusing.`));
  } else if (blocked && S.view !== 'plak') {
    body.push(h('p', { class: 'warn' }, blocked));
  } else {
    body.push(h('p', { class: 'hint' }, 'Rupa plak siap dari depan: border, huruf timbul dan base. '
      + 'Huruf pudar bergaris biru cuma dicetak, tak ditimbulkan.'));
  }
  return group('Preview', true, ...body);
}

function jobGroup() {
  return group('Job sheet', true,
    h('div', { class: 'field' },
      h('label', { for: 'plakQty' }, 'Kuantiti plak'),
      h('input', {
        id: 'plakQty',
        type: 'number',
        min: 1,
        max: QUANTITY_MAX,
        step: 1,
        value: S.quantity,
        onchange: (e) => {
          const v = Math.round(parseFloat(e.target.value));
          set({ quantity: Number.isFinite(v) && v > 0 ? Math.min(v, QUANTITY_MAX) : 1 });
        },
      })),
    h('div', { class: 'field' },
      h('label', { for: 'plakClient' }, 'Nama client'),
      h('input', {
        id: 'plakClient',
        type: 'text',
        value: S.client,
        oninput: (e) => {
          S.client = e.target.value;
          changed();
        },
        onchange: () => { if (S.view === 'cut') renderStage(); },
      })),
    h('div', { class: 'field' },
      h('label', { for: 'plakDate' }, 'Dateline'),
      h('input', {
        id: 'plakDate',
        type: 'date',
        value: S.dateline,
        onchange: (e) => {
          S.dateline = e.target.value;
          if (S.view === 'cut') renderStage();
          changed();
        },
      })),
    h('p', { class: 'hint' }, 'Setiap file cut dan file print diulang ikut kuantiti.'));
}

// ---- Export ------------------------------------------------------------------------------

/**
 * Export saves a job the first time, as the other tools do, so a file sent to the laser
 * has its settings on record; a job already saved only gets a reminder.
 */
function saveOnExport(line) {
  const open = gallery.current();
  if (open.id) {
    if (!plakDirty()) return;
    line.textContent = `Perubahan ni belum disimpan dalam "${open.name}". Tekan Simpan lepas tutup dialog ni.`;
    line.hidden = false;
    return;
  }
  if (!signedIn()) return;
  line.textContent = 'Menyimpan dalam "Reka bentuk saya"...';
  line.hidden = false;
  gallery.saveQuietly(plakStore).then((ok) => {
    line.textContent = ok
      ? `✓ Disimpan dalam "Reka bentuk saya" sebagai "${S.name}".`
      : 'Tak dapat simpan ke akaun kali ni. File tetap boleh didownload.';
  });
}

export function openPlakExport() {
  const dlg = deps.els.posterDlg;
  const plan = planOf();
  const blocked = blockedReason(currentPage().analysis || null, plan);
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

  // Share to WhatsApp, as in the other UV tabs: a ticked file is built at once, so the
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
  const jobs = blocked ? [] : cutJobs(plan);
  const nLetters = chosenLetters(undefined, plan).length;
  const shareText = () => [
    `Nama File: ${S.name}`,
    `Material: ${jobs.map((j) => j.material.label).join(', ')}`,
    `Berapa Set: ${S.quantity}`,
    'Jenis Projek: Plak UV',
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

  const times = (verb) => `${verb} ${S.quantity} kali`;
  const rows = blocked ? [] : [
    ...jobs.map((cut) => row({
      kind: 'cut',
      title: `file cut ${cut.material.label}`,
      make: async () => cutFile(cut),
    },
    h('div', { class: 'file-row-text' },
      h('b', {}, `File cut ${cut.material.label}`),
      h('span', {}, `${cut.parts.map((p) => PART_TEXT[p](plan, nLetters)).join(', ')}. ${times('Cut')}`)),
    fileButton('File cut', async () => cutFile(cut)))),
    row({
      kind: 'print',
      title: 'file print UV plak',
      make: printFile,
    },
    h('div', { class: 'file-row-text' },
      h('b', {}, 'File print UV'),
      h('span', {}, `${matLabel('front')} ${size(plan.page.width, plan.page.height)} dalam frame, Spot 1 dan Spot 2 (white). ${times('UV print')}`)),
    fileButton('File print', printFile)),
  ];

  const all = h('button', { type: 'button', class: 'primary', ...(blocked ? { disabled: true } : {}) }, 'Download semua (ZIP)');
  all.addEventListener('click', busy(all, async () => {
    const files = [];
    for (const cut of jobs) files.push(await branded(cutFile(cut)));
    files.push(await branded(await printFile()));
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
      `Plak depan dicut dalam frame ${PLAK_FRAME_MM} mm dan jangan dikeluarkan sebelum UV print: frame tu diletak rapat bucu kiri atas bed. `
      + `File print UV: gambar CMYK 300 dpi, Spot 1 dan Spot 2 (white) ${underInkOnly() ? 'di bawah gambar dan tulisan sahaja, kayu nampak di bahagian putih' : 'penuh di bawah'}. `
      + (plan.border ? `Bawah border tak dicetak kecuali ${PLAK_BLEED_MM} mm. ` : '')
      + `Jumlah ${S.quantity} plak: setiap file cut dan print ${S.quantity} kali.`),
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

/** The tab's steps (Boss, 28 Nov 2026). */
export const PLAK_STEPS = [
  ['Cut plak depan',
    `File cut Plywood Maple (atau ikut material plak depan): plak dulu, frame ${PLAK_FRAME_MM} mm last. Jangan keluarkan plak dari frame lagi.`],
  ['UV print plak',
    'Semak layer dulu di Preview, File print. Letak frame atas bed rapat dari bucu kiri atas, sama arah dengan file. Buka file print terus dalam FlexiPRINT: Spot 1 dan Spot 2 (white) di bawah gambar dan tulisan sahaja, bahagian putih design tak dicetak supaya kayu nampak. Tulisan besar dicetak sekali sebagai panduan.'],
  ['Cut border dan huruf',
    `File cut Plywood Black: lubang huruf dulu, kemudian huruf, kemudian 4 jalur border ${PLAK_BORDER_MM} mm bersudut 45°. Dua jalur panjang sama, dua jalur pendek sama.`],
  ['Cut base',
    `File cut ${BASE_MATERIAL.label}: satu keping, alur dulu (tembus), kemudian base.`],
  ['Pasang',
    'Gam border atas tepi depan plak, sudut 45° bertemu di bucu. Angkat huruf dengan transfer tape dan tampal atas tulisan yang dicetak. Masukkan kaki plak 4 mm dalam alur base sampai border bawah duduk atas base, dan gam.'],
];
