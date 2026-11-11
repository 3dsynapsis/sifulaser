// "Poster to puzzle": upload a PDF, pick a size, take away every file the job needs.
//
// The ordinary tool asks for numbers. This one works them out from the poster so
// that nobody has to, and hands back the two files the shop works from: the cut
// file (all three parts on a job sheet) and the print file (the artwork, placed).
//
// Its state lives here and not in store.js. The poster's bytes do not belong in
// localStorage, and leaving poster mode has to put the ordinary tool back exactly
// as it was.
//
// Saving (Boss, 5 Nov 2026: no work should be lost by leaving the page or by a slip
// of the hand). Three layers, each covering what the one before cannot:
//
//   draft    every change goes to this browser by itself, so a reload or a crash
//            puts the job back whether or not Simpan was pressed (posterVault.js).
//   Simpan   the Save As dialog: a name, or overwrite an older file. Settings go to
//            the account, and the PDF stays in this browser (posterSaved.js).
//   guard    closing or replacing a job with unsaved changes asks first.
//
// A job can hold several PDFs (Boss, 11 Nov 2026: a client sent five one-page files).
// They are sorted by name and their pages numbered across all of them, so the rest
// of this file sees one list of pages, wherever each came from. And a job lies one
// way round (option A): when its pages are mixed portrait and landscape, the fewer
// are turned 90° clockwise, so every panel takes the same cut file.
//
// Print files are laid out for the UV bed (Boss, 11 Nov 2026): the cut panels go on it
// edge to edge, so one print file covers a whole bed load (geom/runs.js).

import { h, group, rnd } from './ui.js';
import * as gallery from './designs.js';
import { signedIn } from './cloud.js';
import * as vault from './posterVault.js';
import {
  planKey, posterRecord, readPoster, cleanPoster, jobNameOf,
} from './posterSaved.js';
import { buildPuzzle } from './geom/puzzle.js';
import {
  PAPERS, UV_BED_MM, LOW_DPI, GOOD_DPI, planPoster, puzzleParams, effectiveDpi, pixelsFor,
} from './geom/poster.js';
import { rankSeeds } from './geom/strength.js';
import {
  buildSheet, buildCardSheet, sheetToPdf, translatePath,
} from './exportJobSheet.js';
import {
  openPoster, renderPicture, pageImages, pagePicture, buildLayeredPrint,
} from './posterPdf.js';
import { planRuns, turnBox } from './geom/runs.js';
import { layoutCards, CARD_BLEED_MM, CARD_CORNER_MM } from './geom/cards.js';
import { borderPath } from './geom/puzzle.js';
import { makeZip } from './zip.js';
import {
  LAYER_LOOK, inspectPrint, judgeLayers, judgeCards, judgeBoxes, releaseLayers,
} from './printCheck.js';

const PICTURE_PX = 1800;
const THUMB_PX = 120;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const S = {
  source: null,       // { name, lib, pages }: every page of every PDF, in the job's order
  files: [],          // the PDFs: { name, size, hash, bytes, doc, pages }
  name: '',           // what this job is called, shown in the top bar
  nameAuto: true,     // the name came from the files, not from a person
  choice: { paper: 'A3' },
  client: '',
  dateline: '',
  current: 0,
  stageView: 'panel',
  shuffle: 0,
  ranks: new Map(),
  pins: new Map(),    // planKey -> seed: the seeds a saved job was made with
  savedKey: null,     // settingsKey() at the last save; null when never saved
  pdfKept: true,      // false when this browser refused to store the PDF
  printCheck: null,   // the print file of the page on screen, read back (printCheck.js)
  cards: false,       // make the A6 reference cards too (Boss, 11 Nov 2026)
  cardCheck: null,    // the cards' print file, read back
  layerOn: {},        // which layers the File print view shows; for the eye only
};
const allLayersOn = () => Object.fromEntries(LAYER_LOOK.map((l) => [l.name, true]));
S.layerOn = allLayersOn();

let deps = null;
let draftTimer = null;

/** @param d { view, els, saveFile, refresh, setMode, openSave, applyRow } */
export function initPoster(d) { deps = d; }

export const posterActive = () => Boolean(S.source);

const currentPage = () => S.source.pages[S.current];

/** A page's size the way it lies in this job: turned, if it is turned. */
const lyingSize = (page) => (page.turned
  ? { w: page.heightMm, h: page.widthMm }
  : { w: page.widthMm, h: page.heightMm });
const planFor = (page) => {
  const { w, h: hh } = lyingSize(page);
  return planPoster(w, hh, S.choice);
};
const filesKey = () => S.files.map((f) => f.hash || f.name).join(',');
const r2 = (v) => Math.round(v * 100) / 100;
const size = (w, h) => `${rnd(w, 1)} x ${rnd(h, 1)} mm`;
const mm = (v) => `${rnd(v, 1)} mm`;

// ---- seeds ----------------------------------------------------------------
// Choosing takes a moment, so the preview draws with a stand-in until it is done.
// Pages at the same size share one seed, so one cut file serves them all (Boss,
// 5 Nov 2026). Pieces of two posters can then swap, and only the picture tells them
// apart. A page at another size gets its own seed and its own cut file.

function rankFor(plan) {
  const key = planKey(plan);
  let entry = S.ranks.get(key);
  if (!entry) {
    entry = { list: null, promise: null };
    entry.promise = rankSeeds(puzzleParams(plan, 1)).then((list) => {
      entry.list = list;
      if (posterActive()) renderPoster();
      return list;
    });
    S.ranks.set(key, entry);
  }
  return entry;
}

const pick = (list) => list[S.shuffle % list.length].seed;

/** The seed a saved job fixed for this size, if any. */
const pinned = (plan) => S.pins.get(planKey(plan)) ?? null;

function previewPuzzle(plan) {
  let seed = pinned(plan);
  if (seed === null) {
    const { list } = rankFor(plan);
    seed = list ? pick(list) : 1;
  }
  return buildPuzzle(puzzleParams(plan, seed));
}

async function finalPuzzle(plan) {
  const seed = pinned(plan) ?? pick(await rankFor(plan).promise);
  return buildPuzzle(puzzleParams(plan, seed));
}

/** Each size among these pages once, with the pages at that size. */
function sizesOf(pages) {
  const sizes = new Map();
  for (const page of pages) {
    const plan = planFor(page);
    const key = planKey(plan);
    if (!sizes.has(key)) sizes.set(key, { plan, key, pages: [] });
    sizes.get(key).pages.push(page);
  }
  return [...sizes.values()];
}

// ---- the job, as it gets saved ---------------------------------------------

/** Seeds already known. Never starts ranking: this runs on every change. */
function knownSeeds() {
  const out = [];
  for (const { plan, key } of sizesOf(S.source.pages)) {
    let seed = pinned(plan);
    if (seed === null) {
      const list = S.ranks.get(key)?.list;
      if (list) seed = pick(list);
    }
    if (seed !== null) out.push({ key, seed });
  }
  return out;
}

function job() {
  const { source } = S;
  return {
    files: S.files.map((f) => ({
      name: f.name, size: f.size, hash: f.hash, pages: f.pages.length,
    })),
    choice: S.choice,
    ticked: source.pages.filter((p) => p.ticked).map((p) => p.index),
    current: S.current,
    view: S.stageView,
    shuffle: S.shuffle,
    client: S.client,
    dateline: S.dateline,
    seeds: knownSeeds(),
    cards: S.cards,
  };
}

/** What counts as a change worth saving. Looking at another page does not. */
const settingsKey = () => JSON.stringify({
  name: S.name,
  hash: filesKey(),
  choice: S.choice,
  ticked: S.source.pages.filter((p) => p.ticked).map((p) => p.index),
  shuffle: S.shuffle,
  client: S.client,
  dateline: S.dateline,
  cards: S.cards,
});

export const posterDirty = () => posterActive() && settingsKey() !== S.savedKey;

function paintStatus() {
  const el = deps.els.status;
  const dirty = posterDirty();
  el.classList.toggle('unsaved', dirty);
  if (dirty) el.textContent = 'Belum disimpan';
  else el.textContent = S.pdfKept ? 'Disimpan' : 'Disimpan, tanpa PDF';
}

function writeDraft() {
  if (!posterActive()) return;
  const open = gallery.current();
  vault.putDraft({
    job: job(),
    name: S.name,
    savedKey: S.savedKey,
    designId: open.id,
    designName: open.name,
  }).catch(() => { /* no draft in this browser; Simpan still works */ });
}

/** Call after anything in the job changes. */
function changed() {
  paintStatus();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(writeDraft, 300);
}

/** Fix the seed at every size, so what is saved is what will be cut. */
async function pinSeeds() {
  for (const { plan, key } of sizesOf(S.source.pages)) {
    if (pinned(plan) === null) S.pins.set(key, pick(await rankFor(plan).promise));
  }
}

const record = () => {
  const plan = planFor(currentPage());
  return posterRecord(job(), plan, pinned(plan) ?? 1);
};

/** What the Save dialog and the gallery may see and change while a poster is open. */
export const posterStore = {
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
  note: 'Yang disimpan ke akaun ialah tetapan: saiz, page, seed, client dan dateline. '
    + 'PDF kekal dalam browser ni. Kalau buka di PC lain, kena pilih PDF tu semula.',
  // Runs inside the save, so that two saves in a row wait for each other.
  prepare: async () => {
    await pinSeeds();
    try {
      for (const f of S.files) {
        await vault.putFile(f.hash, f.name, f.bytes);
        await vault.keepFile(f.hash);
      }
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
export function renamePoster(name) {
  if (name.trim()) posterStore.rename(name.trim());
  else {
    posterStore.rename(S.source.name);
    S.nameAuto = true;
  }
}

// ---- opening and closing --------------------------------------------------

const nameOf = (fileName) => fileName.replace(/\.pdf$/i, '').trim() || 'Poster';

/** File order: by name, numbers in their proper places, so 2 comes before 10. */
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });


/**
 * Option A (Boss, 11 Nov 2026): the job lies the way most of its pages do, a tie
 * going landscape, and a page the other way round is turned 90° clockwise. Then a
 * portrait A4 and a landscape A4 make the same panel and share one cut file.
 */
function settleTurns(pages) {
  const wide = (p) => p.widthMm > p.heightMm + 0.5;
  const tall = (p) => p.heightMm > p.widthMm + 0.5;
  const jobWide = pages.filter(wide).length >= pages.filter(tall).length;
  for (const p of pages) p.turned = jobWide ? tall(p) : wide(p);
}

/** Number the pages across the files, in the files' order. */
function lineUp(files) {
  const pages = [];
  files.forEach((f, fileIndex) => {
    f.pages.forEach((page, pageInFile) => {
      Object.assign(page, {
        index: pages.length,
        fileIndex,
        pageInFile,
        label: f.pages.length > 1 ? `${nameOf(f.name)} p${pageInFile + 1}` : nameOf(f.name),
      });
      pages.push(page);
    });
  });
  settleTurns(pages);
  return pages;
}

const baseName = (name) => name.replace(/\.pdf$/i, '').trim()
  .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'poster';

function readError(err) {
  if (err?.name === 'PasswordException') {
    return 'PDF ni berkunci dengan password. Minta file tanpa password.';
  }
  return 'PDF ni tak dapat dibaca. Cuba simpan semula sebagai PDF biasa.';
}

function forgetFile(f) {
  for (const p of f.pages) {
    if (p.picture) URL.revokeObjectURL(p.picture);
    if (p.thumb) URL.revokeObjectURL(p.thumb);
  }
  f.doc.destroy().catch(() => {});
}

function closeSource() {
  if (!S.source) return;
  dropPrintCheck();
  dropCardCheck();
  for (const f of S.files) forgetFile(f);
  S.files = [];
  S.source = null;
}

/**
 * Ask before throwing away unsaved changes. Resolves true to carry on.
 * "Simpan dulu" opens the Save dialog and stops here: the person does what they were
 * doing again afterwards, with nothing left to lose.
 */
function confirmLeave() {
  if (!posterDirty()) return Promise.resolve(true);
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

/** Put a saved job's settings on the pages of the PDF just opened. */
function applyJob(saved) {
  const { pages } = S.source;
  S.choice = saved.choice;
  S.client = saved.client;
  S.dateline = saved.dateline;
  S.shuffle = saved.shuffle;
  S.stageView = saved.view;
  S.cards = saved.cards;
  S.current = Math.min(saved.current, pages.length - 1);
  S.pins.clear();
  for (const s of saved.seeds) S.pins.set(s.key, s.seed);
  for (const page of pages) page.ticked = saved.ticked.includes(page.index);
}

/**
 * Open PDFs as one job.
 *
 * @param fileList File objects, any number
 * @param restore  when opening a saved job or the draft:
 *   { saved, name, design: { id, name }, savedKey, quiet }; the files then come in the
 *   saved order and every one of them must open. savedKey undefined means work it out,
 *   from whether these are the PDFs that were saved.
 * @param add      true: add these to the job already open, rather than replace it
 * @returns whether a poster is now open
 */
export async function openPosterFiles(fileList, restore = null, { add = false } = {}) {
  const complain = (text) => { if (!restore?.quiet) alert(text); };
  const chosen = [...(fileList || [])].filter(Boolean);
  if (!chosen.length) return false;
  const pdfs = chosen.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
  if (pdfs.length < chosen.length) {
    complain(chosen.length === 1
      ? 'File ni bukan PDF. Pilih poster dalam format PDF.'
      : `${chosen.length - pdfs.length} file bukan PDF, jadi tak dimasukkan.`);
  }
  if (!pdfs.length) return false;
  const adding = add && posterActive();
  if (!restore && !adding && !(await confirmLeave())) return false;
  const wasActive = posterActive();
  deps.els.hint.textContent = pdfs.length > 1 ? `Membaca ${pdfs.length} PDF...` : 'Membaca PDF...';
  deps.els.hint.classList.add('show');

  const opened = [];
  const problems = [];
  for (const file of pdfs) {
    let one;
    try {
      one = await openPoster(file);
    } catch (err) {
      problems.push(pdfs.length > 1 ? `${file.name}: ${readError(err)}` : readError(err));
      continue;
    }
    if (!one.pages.length) {
      problems.push(pdfs.length > 1 ? `${file.name}: PDF ni tiada page.` : 'PDF ni tiada page.');
      one.doc.destroy().catch(() => {});
      continue;
    }
    let hash = '';
    try {
      hash = await vault.hashBytes(one.bytes);
      await vault.putFile(hash, one.name, one.bytes);
    } catch { /* opens anyway; there will be no draft to come back to */ }
    opened.push({
      name: one.name, size: one.bytes.length, hash, bytes: one.bytes, lib: one.lib, doc: one.doc, pages: one.pages,
    });
  }
  if (problems.length) complain(problems.join('\n'));
  // A saved job needs all of its files back, or its page numbers would point elsewhere.
  if (!opened.length || (restore && opened.length < pdfs.length)) {
    for (const f of opened) forgetFile(f);
    deps.refresh();
    return false;
  }

  let files;
  let keep = null;
  if (adding) {
    // A file already in the job is not added twice.
    const fresh = opened.filter((o) => !S.files.some((f) => f.hash && f.hash === o.hash));
    for (const o of opened) if (!fresh.includes(o)) forgetFile(o);
    if (!fresh.length) {
      deps.refresh();
      return true;
    }
    // A file named like one already in the job is the newer copy of it (the client's
    // corrected A4 PUZZLE 1): it takes that file's place, and its pages keep their ticks.
    const sameName = (a, b) => a.name.toLowerCase() === b.name.toLowerCase();
    const replaced = S.files.filter((f) => fresh.some((o) => sameName(o, f)));
    const shown = currentPage();
    keep = { page: shown, label: shown.label };
    for (const old of replaced) {
      const newer = fresh.find((o) => sameName(o, old));
      newer.pages.forEach((page, i) => { if (old.pages[i]) page.ticked = old.pages[i].ticked; });
      forgetFile(old);
      if (old.hash) vault.releaseFile(old.hash).catch(() => {});
    }
    files = [...S.files.filter((f) => !replaced.includes(f)), ...fresh].sort(byName);
    dropPrintCheck();
    dropCardCheck();
  } else {
    // Replacing the PDFs of a job that is already saved is the same job with better
    // files: the sample swapped for the client's final one. Name and shapes stay.
    const sameJob = !restore && wasActive && gallery.current().id;
    closeSource();
    files = restore ? opened : opened.sort(byName);
    S.current = 0;
    S.stageView = 'panel';
    if (!restore && !sameJob) {
      S.shuffle = 0;
      S.pins.clear();
      S.savedKey = null;
      S.nameAuto = true;
    }
  }

  S.files = files;
  S.source = { name: jobNameOf(files.map((f) => f.name)), lib: files[0].lib, pages: lineUp(files) };
  if (keep) {
    // Stay on the page that was on screen, or on its newer copy.
    const same = S.source.pages.includes(keep.page) ? keep.page : S.source.pages.find((p) => p.label === keep.label);
    S.current = same ? same.index : Math.min(S.current, S.source.pages.length - 1);
  }
  if (restore) {
    applyJob(restore.saved);
    S.name = restore.name;
    S.nameAuto = false;
  } else if (S.nameAuto) {
    S.name = S.source.name;
  }
  if (!wasActive) deps.setMode(true, S.name);
  else deps.els.name.value = S.name;
  if (restore) {
    gallery.setOpen(restore.design?.id ?? null, restore.design?.name ?? null);
    const same = files.length === restore.saved.files.length
      && files.every((f, i) => f.hash && f.hash === restore.saved.files[i].hash);
    if (restore.savedKey !== undefined) S.savedKey = restore.savedKey;
    else S.savedKey = same ? settingsKey() : null;
  }
  deps.refresh();
  loadThumbs(S.source);
  changed();
  return true;
}

/**
 * The PDFs a saved job needs that this browser no longer has: another PC, or
 * browsing data cleared. The person picks them, any number at once; each is matched
 * by its content first and then by its name. Resolves to the job's files in its
 * order, or null if the person backs out.
 *
 * @param found what the browser still has, null where it has not
 */
function askForPdfs(saved, found) {
  return new Promise((resolve) => {
    const dlg = deps.els.posterDlg;
    const files = [...found];
    const differs = new Set();
    const finish = (value) => {
      resolve(value);
      dlg.close();
    };
    const list = h('div', { class: 'missing-list' });
    const open = h('button', { type: 'button', class: 'primary', disabled: true }, 'Buka');
    open.addEventListener('click', () => finish(files));
    const paint = () => {
      list.replaceChildren(...saved.files.map((f, i) => {
        if (found[i]) return null;
        const state = !files[i] ? 'belum dipilih' : differs.has(i) ? 'lain daripada yang disimpan' : 'ada';
        return h('p', { class: files[i] && !differs.has(i) ? 'check-ok' : 'warn-line' },
          `${files[i] && !differs.has(i) ? '✓' : '•'} ${f.name}: ${state}`);
      }));
      open.disabled = files.some((f) => !f);
    };
    dlg.addEventListener('close', () => resolve(null), { once: true });
    const missing = saved.files.filter((f, i) => !found[i]).length;
    dlg.replaceChildren(h('div', { class: 'dlg-body' },
      h('h2', {}, 'Pilih PDF poster'),
      h('p', { class: 'muted' },
        `Design ni guna ${saved.files.length} file PDF. ${missing} tiada dalam browser ni, jadi pilih file yang sama. `
        + 'Boleh pilih semua sekali.'),
      list,
      h('label', { class: 'ghost file-pick' },
        h('input', {
          type: 'file',
          accept: 'application/pdf,.pdf',
          multiple: true,
          hidden: true,
          onchange: async (e) => {
            const picked = [...e.target.files];
            e.target.value = '';
            for (const file of picked) {
              let hash = '';
              try {
                hash = await vault.hashBytes(await file.arrayBuffer());
              } catch { /* cannot tell, so it can only match by name */ }
              let at = saved.files.findIndex((f, i) => !found[i] && f.hash && f.hash === hash);
              if (at < 0) {
                at = saved.files.findIndex((f, i) => !found[i] && !files[i]
                  && f.name.toLowerCase() === file.name.toLowerCase());
                if (at >= 0) differs.add(at);
              } else {
                differs.delete(at);
              }
              if (at >= 0) files[at] = file;
            }
            paint();
          },
        }),
        'Pilih PDF'),
      h('p', { class: 'hint' }, 'File yang lain daripada yang disimpan tetap boleh dibuka: saiz dan bentuk puzzle kekal, artwork ikut file baru.'),
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: () => finish(null) }, 'Batal'),
        open)));
    paint();
    dlg.showModal();
  });
}

/** The saved job's files from this browser; asks for any it lacks unless told not to. */
async function gatherFiles(saved, { ask = true } = {}) {
  const found = await Promise.all(saved.files.map(async (f) => {
    if (!f.hash) return null;
    try {
      return await vault.getFile(f.hash);
    } catch {
      return null;
    }
  }));
  if (found.every(Boolean)) return found;
  return ask ? askForPdfs(saved, found) : null;
}

/** Open a job from the account. @returns false when nothing changed */
export async function openPosterDesign(row) {
  const saved = readPoster(row);
  if (!saved) return false;
  if (!(await confirmLeave())) return false;
  const files = await gatherFiles(saved);
  if (!files) return false;
  return openPosterFiles(files, { saved, name: row.name, design: { id: row.id, name: row.name } });
}

/** Whatever was on screen last time, put back. Called once when the tool starts. */
export async function restorePosterDraft() {
  let draft = null;
  try {
    draft = await vault.getDraft();
  } catch {
    return false;
  }
  if (!draft || posterActive()) return false;
  const saved = cleanPoster(draft.job);
  const files = saved && await gatherFiles(saved, { ask: false });
  const opened = files && await openPosterFiles(files, {
    saved,
    name: typeof draft.name === 'string' && draft.name ? draft.name : jobNameOf(saved.files.map((f) => f.name)),
    design: { id: draft.designId, name: draft.designName },
    savedKey: draft.savedKey ?? null,
    quiet: true,
  });
  // A draft that cannot be opened must not stand in the way of every later visit.
  if (!opened) vault.clearDraft().catch(() => {});
  return Boolean(opened);
}

/** @returns whether it closed */
export async function closePoster() {
  if (!(await confirmLeave())) return false;
  const hashes = S.files.map((f) => f.hash).filter(Boolean);
  closeSource();
  clearTimeout(draftTimer);
  S.name = '';
  S.nameAuto = true;
  S.savedKey = null;
  S.pdfKept = true;
  S.shuffle = 0;
  S.pins.clear();
  S.client = '';
  S.dateline = '';
  S.choice = { paper: 'A3' };
  S.layerOn = allLayersOn();
  S.cards = false;
  vault.clearDraft().catch(() => {});
  for (const hash of hashes) vault.releaseFile(hash).catch(() => {});
  deps.els.status.classList.remove('unsaved');
  deps.setMode(false);
  deps.refresh();
  return true;
}

// ---- pictures -------------------------------------------------------------
// One at a time. pdf.js can draw pages side by side, but a long PDF would then
// fight the page the person is actually looking at.

function ensurePicture(page) {
  if (page.picturePromise) return page.picturePromise;
  const { source } = S;
  const still = () => S.source === source;
  page.picturePromise = (async () => {
    page.picture = await renderPicture(page, PICTURE_PX);
    if (still() && currentPage() === page) renderStage();
    page.images = await pageImages(source.lib, page);
    if (still() && currentPage() === page) renderPanel();
  })().catch(() => {
    page.pictureFailed = true;
    if (still() && currentPage() === page) { renderStage(); renderPanel(); }
  });
  return page.picturePromise;
}

async function loadThumbs(source) {
  if (source.pages.length < 2) return;
  for (const page of source.pages) {
    if (S.source !== source) return;
    if (page.thumb) continue;
    try {
      page.thumb = await renderPicture(page, THUMB_PX);
      if (S.source === source) renderPanel();
    } catch { /* the row still works with no picture */ }
  }
}

// ---- drawing --------------------------------------------------------------

export function renderPoster() {
  if (!posterActive()) return;
  renderStage();
  renderPanel();
}

function renderStage() {
  const page = currentPage();
  const plan = planFor(page);
  ensurePicture(page);
  if (S.stageView === 'cards' && S.cards) {
    const layout = cardLayout();
    const check = cardCheckFor(layout);
    deps.view.renderPrint({
      size: layout.sheet,
      layers: check.layers,
      order: LAYER_LOOK.map((l) => l.name),
      on: S.layerOn,
      cuts: layout.cards.map((c) => translateCard(c)),
      fitKey: `cards:${layout.sheet.width}x${layout.sheet.height}`,
    });
    deps.els.hint.textContent = check.state === 'building'
      ? 'Membina file print kad (gambar CMYK 300 dpi)...'
      : `Sheet kad ${size(layout.sheet.width, layout.sheet.height)}, ${layout.cards.length} kad`;
    deps.els.hint.classList.add('show');
    return;
  }
  if (S.stageView === 'print') {
    const check = printCheckFor(page, plan);
    deps.view.renderPrint({
      size: check.size,
      layers: check.layers,
      order: LAYER_LOOK.map((l) => l.name),
      on: S.layerOn,
      fitKey: `print:${check.key}`,
    });
    deps.els.hint.textContent = check.state === 'building' ? 'Membina file print (gambar CMYK 300 dpi)...' : check.label;
    deps.els.hint.classList.add('show');
    return;
  }
  const puzzle = previewPuzzle(plan);
  const fitKey = `${S.current}:${plan.width}x${plan.height}`;
  if (S.stageView === 'sheet') {
    deps.view.renderSheet(buildSheet(plan, puzzle, { ...jobMeta(), units: unitsFor(plan) }), `sheet:${fitKey}`);
  } else {
    deps.view.renderPoster({
      plan, puzzle, imageUrl: page.picture, turn: page.turned ? 90 : 0, fitKey: `panel:${fitKey}`,
    });
  }
  deps.els.hint.textContent = `${plan.pieces} pieces · ${plan.width} x ${plan.height} mm`;
  deps.els.hint.classList.add('show');
}

const formatDate = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
};
const jobMeta = () => ({ client: S.client, dateline: formatDate(S.dateline) });

/** Why this page cannot be made at this size, or null. */
function blockedReason(plan) {
  if (plan.tooSmall) return 'Saiz ni terlalu kecil untuk dijadikan puzzle.';
  if (!plan.fitsBed) {
    return `Panel ${size(plan.panel.width, plan.panel.height)} tak muat UV bed `
      + `${UV_BED_MM.long} x ${UV_BED_MM.short} mm. Tinggi paling besar untuk poster ni: `
      + `${plan.maxHeight} mm.`;
  }
  return null;
}

function resolutionWarning(page, plan) {
  if (!page.images?.length) return null;
  // A turned page's pictures lie the other way round on the panel.
  const lying = page.turned
    ? page.images.map((im) => ({
      pxW: im.pxH, pxH: im.pxW, fracW: im.fracH, fracH: im.fracW,
    }))
    : page.images;
  const dpi = Math.min(...lying.map((im) => effectiveDpi(im, plan)));
  if (dpi >= LOW_DPI) return null;
  const px = pixelsFor(plan);
  const [w, hh] = page.turned ? [px.h, px.w] : [px.w, px.h];
  return `Resolusi artwork rendah: lebih kurang ${Math.round(dpi)} dpi pada saiz ni, jadi print `
    + `boleh nampak kabur. Elok minta file ${w} x ${hh} px (${GOOD_DPI} dpi).`;
}

function renderPanel() {
  const root = deps.els.inspector;
  const scroll = root.scrollTop;
  const page = currentPage();
  const plan = planFor(page);
  root.replaceChildren(
    h('h2', { class: 'insp-title' }, 'Poster ke puzzle'),
    fileGroup(),
    sizeGroup(page),
    resultGroup(page, plan),
    previewGroup(),
    jobGroup(),
    cardGroup(),
    h('button', { class: 'link', type: 'button', onclick: closePoster },
      'Tutup poster, balik ke puzzle biasa'),
  );
  root.scrollTop = scroll;
}

function fileGroup() {
  const { source } = S;
  const picker = (label, title, open) => h('label', { class: 'ghost file-pick', title },
    h('input', {
      type: 'file',
      accept: 'application/pdf,.pdf',
      multiple: true,
      hidden: true,
      onchange: (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        open(files);
      },
    }),
    label);
  const single = source.pages.length === 1;
  const many = S.files.length > 1;
  const turned = source.pages.filter((p) => p.turned).length;
  return group('Poster', true,
    h('div', { class: 'stat' },
      h('span', { class: 'file-name', title: S.files.map((f) => f.name).join('\n') },
        many ? `${S.files.length} file PDF` : S.files[0].name),
      h('b', {}, single ? '1 page' : `${source.pages.length} page`)),
    single ? null : pageList(),
    turned
      ? h('p', { class: 'turn-note' },
        `${turned} poster diputar 90° supaya semua guna satu bentuk puzzle dan satu file cut.`)
      : null,
    h('div', { class: 'row-actions' },
      picker('Tambah PDF', 'Masukkan PDF lain ke job ni', (files) => openPosterFiles(files, null, { add: true })),
      picker('Tukar PDF', 'Ganti semua PDF dalam job ni', (files) => openPosterFiles(files))),
    h('p', { class: 'hint' },
      'PDF kekal dalam browser ni dan tak dihantar ke mana-mana. Simpan cuma hantar tetapan ke akaun anda.'));
}

function pageList() {
  const { pages } = S.source;
  return h('div', { class: 'page-list' }, pages.map((p) => {
    const plan = planFor(p);
    const open = () => {
      S.current = p.index;
      renderPoster();
      changed();
    };
    return h('div', { class: p.index === S.current ? 'page-row open' : 'page-row' },
      h('input', {
        type: 'checkbox',
        'aria-label': `Buat ${p.label}`,
        ...(p.ticked ? { checked: true } : {}),
        onchange: (e) => {
          p.ticked = e.target.checked;
          // The units on the job sheet, the print runs and the cards all follow the ticks.
          renderPoster();
          changed();
        },
      }),
      h('button', { type: 'button', class: 'page-open', onclick: open },
        p.thumb ? h('img', { src: p.thumb, alt: '' }) : h('span', { class: 'page-blank' }),
        h('span', { class: 'page-text' },
          h('b', {}, S.files.length > 1 ? p.label : `Page ${p.index + 1}`),
          h('span', {}, `${size(plan.width, plan.height)}${p.turned ? ', diputar 90°' : ''}`))));
  }));
}

function sizeGroup(page) {
  const isCustom = S.choice.height != null;
  return group('Saiz output', true,
    h('div', { class: 'presets three' }, PAPERS.map((paper) => {
      const { w, h: hh } = lyingSize(page);
      const plan = planPoster(w, hh, { paper: paper.id });
      return h('button', {
        class: plan.fitsBed ? 'preset' : 'preset no-fit',
        type: 'button',
        'aria-pressed': String(!isCustom && S.choice.paper === paper.id),
        title: `${paper.id}: ${size(plan.width, plan.height)}, ${plan.pieces} pieces`,
        onclick: () => {
          S.choice = { paper: paper.id };
          renderPoster();
          changed();
        },
      },
      h('b', {}, paper.id),
      h('span', {}, `${rnd(plan.width, 0)} x ${rnd(plan.height, 0)}`));
    })),
    h('div', { class: 'field' },
      h('label', { for: 'posterHeight' }, 'Atau taip tinggi sendiri (mm)'),
      h('input', {
        id: 'posterHeight',
        type: 'number',
        min: 60,
        max: 2000,
        step: 1,
        placeholder: 'Contoh: 500',
        value: isCustom ? S.choice.height : '',
        onchange: (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v > 0) S.choice = { height: v };
          else if (isCustom) S.choice = { paper: 'A3' };
          renderPoster();
          changed();
        },
      })),
    h('p', { class: 'hint' },
      'Sisi panjang poster ikut sisi panjang kertas. Sisi pendek ikut ratio poster, tak dipaksa.'));
}

function resultGroup(page, plan) {
  const { art, panel } = plan;
  const stat = (label, value) => h('div', { class: 'stat' }, h('span', {}, label), h('b', {}, value));
  const blocked = blockedReason(plan);
  const lowRes = resolutionWarning(page, plan);
  return group('Hasil', true,
    blocked ? h('p', { class: 'warn' }, blocked) : null,
    lowRes ? h('p', { class: 'warn' }, lowRes) : null,
    page.pictureFailed
      ? h('p', { class: 'warn' }, 'Preview page ni tak dapat dilukis. Semak file sebelum print.')
      : null,
    stat('Puzzle', size(plan.width, plan.height)),
    stat('Pieces', `${plan.cols} x ${plan.rows} = ${plan.pieces}`),
    stat('Saiz piece', size(plan.pieceW, plan.pieceH)),
    stat('Artwork print', size(art.width, art.height)),
    stat('Bleed kiri/kanan', mm(art.bleedX)),
    stat('Bleed atas/bawah', mm(art.bleedY)),
    stat('Panel', size(panel.width, panel.height)),
    stat('Backing', size(panel.width, panel.height)),
    stat('Letak artwork', `${mm(art.x)} kiri, ${mm(art.y)} atas`));
}

function previewGroup() {
  const choice = (id, label) => h('button', {
    type: 'button',
    'aria-pressed': String(S.stageView === id),
    onclick: () => {
      S.stageView = id;
      renderPoster();
      changed();
    },
  }, label);
  return group('Preview', true,
    h('div', { class: S.cards ? 'seg seg-3 seg-4' : 'seg seg-3' },
      choice('panel', 'Panel + artwork'), choice('sheet', 'Job sheet'), choice('print', 'File print'),
      S.cards ? choice('cards', 'Kad A6') : null),
    S.stageView === 'print' || (S.stageView === 'cards' && S.cards)
      ? layerPanel()
      : h('p', { class: 'hint' },
        'Merah ialah garisan cut. Kawasan pudar ialah bleed yang jatuh atas frame. Zoom dan semak '
        + 'teks tak terlalu rapat dengan garisan, terutama di tepi.'));
}

// ---- the print file's layers ------------------------------------------------
// Boss, 6 Nov 2026: a place to check the layers before the file goes to FlexiPrint,
// with an eye on each to switch it off and look underneath.

/**
 * The print file this page goes out in, built and read back once: the run that holds
 * it, as Export gives it (Boss, 11 Nov 2026), or the page alone when it is not in one.
 */
function printCheckFor(page, plan) {
  const runs = printRuns(readyPages());
  const at = runs.findIndex((r) => r.pages.includes(page));
  const run = at >= 0 ? runs[at] : null;
  const key = run
    ? `run|${run.pages.map((p) => p.index).join(',')}|${planKey(plan)}|${filesKey()}`
    : `page|${page.index}|${planKey(plan)}|${filesKey()}`;
  if (S.printCheck?.key === key) return S.printCheck;
  dropPrintCheck();
  const check = {
    key,
    state: 'building',
    layers: null,
    results: null,
    error: null,
    size: run ? { width: run.width, height: run.height } : plan.panel,
    label: run
      ? `Run ${at + 1} dari ${runs.length}: ${run.pages.length} panel, ${size(run.width, run.height)}`
      : `File print ${size(plan.panel.width, plan.panel.height)}`,
  };
  S.printCheck = check;
  (async () => {
    // The very file the Export button gives, not a likeness of it.
    const file = run ? await runFile(run, at + 1) : await printFile(page);
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    return run ? inspectPrint(S.source.lib, bytes, runBoxes(run).map((b) => b.box)) : inspectPrint(S.source.lib, bytes);
  })().then((found) => {
    if (S.printCheck !== check) {
      releaseLayers(found.layers);
      return;
    }
    check.layers = found.layers;
    check.results = run
      ? judgeBoxes(found, runBoxes(run).map((b) => b.box), 'panel')
      : judgeLayers(found, plan, found.tolMm);
    check.state = 'ready';
    if (S.stageView === 'print') renderPoster();
  }).catch((err) => {
    if (S.printCheck !== check) return;
    check.state = 'error';
    check.error = printError(err);
    if (S.stageView === 'print') renderPoster();
  });
  return check;
}

function dropPrintCheck() {
  if (S.printCheck) releaseLayers(S.printCheck.layers);
  S.printCheck = null;
}

const EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
  + '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_SHUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
  + '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><path d="M3 3l18 18"/></svg>';

function layerPanel() {
  const check = S.stageView === 'cards' ? S.cardCheck : S.printCheck;
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
          renderPoster();
        },
      }),
      h('span', { class: look.colour ? 'swatch' : 'swatch art', style: look.colour ? `background:${look.colour}` : null }),
      h('span', { class: 'layer-text' }, h('b', {}, look.name), h('span', {}, look.role)));
  });
  const clear = h('div', { class: 'layer-row legend' },
    h('span', { class: 'eye-space' }),
    h('span', { class: 'swatch clear' }),
    h('span', { class: 'layer-text' }, h('b', {}, 'Kawasan kosong'), h('span', {}, 'Tiada dakwat')));

  let status;
  if (!check || check.state === 'building') status = [h('p', { class: 'hint' }, 'Membina file print (gambar CMYK 300 dpi)...')];
  else if (check.state === 'error') status = [h('p', { class: 'warn' }, check.error)];
  else {
    status = check.results.map((r) => h('p', { class: r.ok ? 'check-ok' : 'warn' },
      `${r.ok ? '✓' : '✗'} ${r.text}`));
  }
  return [
    h('div', { class: 'layer-list' }, rows, clear),
    ...status,
    h('p', { class: 'hint' },
      'Dibaca dari file print sebenar. Warna untuk mata sahaja, file print tak berubah. '
      + 'Tutup mata Artwork untuk tengok Spot di bawahnya.'
      + (S.stageView === 'cards' ? ' Merah ialah garisan cut kad, frame paling akhir.' : '')),
  ];
}

// ---- reference cards (Boss, 11 Nov 2026) -------------------------------------
// One A6 card for each ticked page, all on one sheet: cut once, printed once.

const cardPages = () => S.source.pages.filter((p) => p.ticked);
const cardLayout = () => layoutCards(cardPages().map((p) => {
  const { w, h: hh } = lyingSize(p);
  return { index: p.index, widthMm: w, heightMm: hh };
}));

/** A card's outline, where it sits on the sheet. */
const translateCard = (c) => translatePath(`${borderPath(c.width, c.height, CARD_CORNER_MM)} Z`, c.x, c.y);

function cardCheckFor(layout) {
  const key = `${layout.cards.map((c) => c.index).join(',')}|${filesKey()}`;
  if (S.cardCheck?.key === key) return S.cardCheck;
  dropCardCheck();
  const check = {
    key, state: 'building', layers: null, results: null, error: null,
  };
  S.cardCheck = check;
  (async () => {
    const file = await cardPrintFile(layout);
    return inspectPrint(S.source.lib, new Uint8Array(await file.blob.arrayBuffer()), layout.cards.map((c) => c.clip));
  })().then((found) => {
    if (S.cardCheck !== check) {
      releaseLayers(found.layers);
      return;
    }
    check.layers = found.layers;
    check.results = judgeCards(found, layout);
    check.state = 'ready';
    if (S.stageView === 'cards') renderPoster();
  }).catch((err) => {
    if (S.cardCheck !== check) return;
    check.state = 'error';
    check.error = printError(err);
    if (S.stageView === 'cards') renderPoster();
  });
  return check;
}

function dropCardCheck() {
  if (S.cardCheck) releaseLayers(S.cardCheck.layers);
  S.cardCheck = null;
}

function cardGroup() {
  const toggle = h('label', { class: 'check' },
    h('input', {
      type: 'checkbox',
      ...(S.cards ? { checked: true } : {}),
      onchange: (e) => {
        S.cards = e.target.checked;
        if (!S.cards && S.stageView === 'cards') S.stageView = 'panel';
        renderPoster();
        changed();
      },
    }),
    'Buat kad A6, satu untuk setiap page');
  if (!S.cards) {
    return group('Kad rujukan A6', true, toggle,
      h('p', { class: 'hint' }, 'Gambar penuh setiap poster, untuk rujukan bila pieces bercampur.'));
  }
  const layout = cardLayout();
  const stat = (label, value) => h('div', { class: 'stat' }, h('span', {}, label), h('b', {}, value));
  if (!layout) {
    return group('Kad rujukan A6', true, toggle, h('p', { class: 'warn' }, 'Tiada page di-tick.'));
  }
  const sizes = [...new Set(layout.cards.map((c) => size(c.width, c.height)))];
  return group('Kad rujukan A6', true, toggle,
    layout.fitsBed ? null : h('p', { class: 'warn' },
      `Sheet ${size(layout.sheet.width, layout.sheet.height)} tak muat UV bed ${UV_BED_MM.long} x ${UV_BED_MM.short} mm. `
      + 'Kurangkan page yang di-tick.'),
    stat('Kad', sizes.length === 1 ? sizes[0] : 'ikut ratio page'),
    stat('Bleed', `${CARD_BLEED_MM} mm keliling`),
    stat('Susunan', `${layout.cols} x ${layout.rows}, ${layout.cards.length} kad`),
    stat('Sheet', size(layout.sheet.width, layout.sheet.height)),
    h('p', { class: 'hint' }, 'Cut kad dulu, frame last. UV print atas sheet tu tanpa keluarkan kad. Tengok di Preview, Kad A6.'));
}

async function cardCutFile(layout) {
  const sheet = buildCardSheet(layout, jobMeta());
  const body = sheetToPdf(sheet, { title: `${S.source.name} - kad A6 cut` });
  return {
    blob: new Blob([body], { type: 'application/pdf' }),
    name: `${baseName(S.source.name)}-kad-a6-cut-${rnd(layout.sheet.width, 1)}x${rnd(layout.sheet.height, 1)}.pdf`,
    type: 'application/pdf',
  };
}

async function cardPrintFile(layout) {
  // Each card is its page's picture clipped to the card and its bleed. The Spot white
  // fills the same box, not the sheet: the frame stays clear.
  const placements = [];
  for (const c of layout.cards) {
    const p = S.source.pages[c.index];
    placements.push({ jpg: (await pictureFor(p, c.art, c.clip, p.turned ? 90 : 0)).jpg, box: c.clip });
  }
  const bytes = await buildLayeredPrint(layout.sheet, placements, { title: `${S.source.name} - kad A6 print` });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${baseName(S.source.name)}-kad-a6-print-${rnd(layout.sheet.width, 1)}x${rnd(layout.sheet.height, 1)}.pdf`,
    type: 'application/pdf',
  };
}

function jobGroup() {
  // Written straight to the state with no redraw: rebuilding the panel on every
  // key would take the cursor out of the box being typed in.
  return group('Job sheet', true,
    h('div', { class: 'field' },
      h('label', { for: 'posterClient' }, 'Nama client'),
      h('input', {
        id: 'posterClient',
        type: 'text',
        value: S.client,
        oninput: (e) => {
          S.client = e.target.value;
          changed();
        },
        onchange: () => { if (S.stageView === 'sheet') renderStage(); },
      })),
    h('div', { class: 'field' },
      h('label', { for: 'posterDate' }, 'Dateline'),
      h('input', {
        id: 'posterDate',
        type: 'date',
        value: S.dateline,
        onchange: (e) => {
          S.dateline = e.target.value;
          if (S.stageView === 'sheet') renderStage();
          changed();
        },
      })));
}

export function shufflePoster() {
  S.shuffle += 1;
  S.pins.clear();
  renderStage();
  changed();
}

// ---- files ----------------------------------------------------------------

const pageTag = (page) => (S.source.pages.length > 1 ? `-p${page.index + 1}` : '');

/**
 * A page drawn as the 300 dpi picture a print file carries, once for each place it is
 * put: the layer check and the Export after it ask for the same one. A few are kept
 * per page (its panel, its card, and a size it was just at), each a JPEG of 1 to 2 MB.
 */
function pictureFor(page, art, box, turn) {
  const key = [art.x, art.y, art.width, art.height, box.x, box.y, box.width, box.height, turn].join(',');
  if (!page.pictures) page.pictures = new Map();
  if (!page.pictures.has(key)) {
    const made = pagePicture(page.obj, art, box, turn);
    made.catch(() => { if (page.pictures.get(key) === made) page.pictures.delete(key); });
    page.pictures.set(key, made);
    if (page.pictures.size > 4) page.pictures.delete(page.pictures.keys().next().value);
  }
  return page.pictures.get(key);
}

/** Ticked pages that can be made at this size. */
const readyPages = () => S.source.pages.filter((p) => p.ticked && !blockedReason(planFor(p)));

/** Every ready panel, size by size, run by run, as it goes on the bed. */
function printRuns(pages) {
  const runs = [];
  for (const { plan, pages: group } of sizesOf(pages)) {
    for (const run of planRuns(group.length, plan.panel)) {
      runs.push({ ...run, plan, pages: group.slice(run.first, run.first + run.count) });
    }
  }
  return runs;
}

/** Where each panel's artwork lands on a run's page, and how far it turns. */
function runBoxes(run) {
  const art = run.turned ? turnBox(run.plan.art, run.plan.panel.height) : run.plan.art;
  return run.pages.map((page, i) => ({
    page,
    box: {
      x: r2(run.slots[i].x + art.x), y: r2(run.slots[i].y + art.y), width: art.width, height: art.height,
    },
    turn: (page.turned ? 90 : 0) + (run.turned ? 90 : 0),
  }));
}

/** One print file for one bed load: the cut panels laid edge to edge from the corner. */
async function runFile(run, number) {
  // One picture at a time: each one needs a canvas of up to 200 MB while it is drawn.
  const placements = [];
  for (const b of runBoxes(run)) {
    placements.push({ jpg: (await pictureFor(b.page, b.box, b.box, b.turn)).jpg, box: b.box });
  }
  const bytes = await buildLayeredPrint({ width: run.width, height: run.height }, placements, {
    title: `${S.source.name} - print run ${number}`,
  });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${baseName(S.source.name)}-print-run${number}-${rnd(run.width, 1)}x${rnd(run.height, 1)}.pdf`,
    type: 'application/pdf',
  };
}

/** How many puzzles the cut file at this size is for: the ready pages at that size. */
const unitsFor = (plan) => readyPages().filter((p) => planKey(planFor(p)) === planKey(plan)).length || 1;

/** One size, one cut file: every page at this size is cut from it, `units` times. */
async function cutFile(plan, units = unitsFor(plan)) {
  const puzzle = await finalPuzzle(plan);
  const sheet = buildSheet(plan, puzzle, { ...jobMeta(), units });
  const body = sheetToPdf(sheet, { title: `${S.source.name} - cut` });
  return {
    blob: new Blob([body], { type: 'application/pdf' }),
    name: `${baseName(S.source.name)}-cut-${rnd(plan.width, 1)}x${rnd(plan.height, 1)}.pdf`,
    type: 'application/pdf',
  };
}

/** One panel's print file on its own, for printing a single panel again. */
async function printFile(page) {
  const plan = planFor(page);
  const { jpg } = await pictureFor(page, plan.art, plan.art, page.turned ? 90 : 0);
  const bytes = await buildLayeredPrint(plan.panel, [{ jpg, box: plan.art }], { title: `${S.source.name} - print` });
  const stem = S.files.length > 1 ? baseName(page.label) : `${baseName(S.source.name)}${pageTag(page)}`;
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${stem}-print-${rnd(plan.art.width, 1)}x${rnd(plan.art.height, 1)}.pdf`,
    type: 'application/pdf',
  };
}

/**
 * Files inside a ZIP never pass through the download hook that brands the others,
 * so the same branding is applied here. It only exists on the live site, and a
 * file without it is still a good file.
 */
async function forZip(file) {
  const bytes = new Uint8Array(await file.blob.arrayBuffer());
  try {
    const { brandFile } = await import('/shared/brand-core.js');
    const out = brandFile(file.name, file.type, bytes);
    return { name: out.name, data: out.data };
  } catch {
    return { name: file.name, data: bytes };
  }
}

function printError(err) {
  if (err?.code === 'canvas') {
    return 'Browser ni tak cukup memori untuk lukis gambar print sebesar ni. Cuba di komputer, atau tutup tab lain.';
  }
  return err?.constructor?.name === 'EncryptedPDFError' || /encrypted|password/i.test(err?.message || '')
    ? 'PDF ni ada perlindungan, jadi file print tak dapat dibina. Minta file tanpa perlindungan.'
    : 'File tak dapat dibina. Cuba simpan semula PDF tu sebagai PDF biasa.';
}

/**
 * Export saves a job the first time, as every other tool does (Boss, 24 Oct 2026),
 * so that a file sent to the laser always has its settings on record. But it does not
 * overwrite one that is already saved: Boss asked to choose that himself, in the Save
 * dialog (5 Nov 2026). So a changed job only gets a reminder here.
 */
function saveOnExport(line) {
  const open = gallery.current();
  if (open.id) {
    if (!posterDirty()) return;
    line.textContent = `Perubahan ni belum disimpan dalam "${open.name}". Tekan Simpan lepas tutup dialog ni.`;
    line.hidden = false;
    return;
  }
  if (!signedIn()) return;
  line.textContent = 'Menyimpan dalam "Reka bentuk saya"...';
  line.hidden = false;
  gallery.saveQuietly(posterStore).then((ok) => {
    line.textContent = ok
      ? `✓ Disimpan dalam "Reka bentuk saya" sebagai "${S.name}".`
      : 'Tak dapat simpan ke akaun kali ni. File tetap boleh didownload.';
  });
}

export function openPosterExport() {
  const dlg = deps.els.posterDlg;
  const ticked = S.source.pages.filter((p) => p.ticked);
  const ready = ticked.filter((p) => !blockedReason(planFor(p)));
  const blocked = ticked.filter((p) => blockedReason(planFor(p)));
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
      message.textContent = printError(err);
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

  // ---- Share to WhatsApp (Boss, 11 Nov 2026) ----------------------------------
  // The cut files go to whoever runs the laser and the print files to whoever runs
  // the UV printer, so each row can be ticked and the ticked files shared at once.
  //
  // A phone opens the share sheet only within a few seconds of the tap, and a print
  // run takes longer than that to build. So a file is built the moment it is ticked,
  // and Share opens the sheet straight away. Files are branded exactly as a
  // download would be: the cut files carry "by sifulaser.com", the print files not.
  const shareItems = [];
  const share = h('button', { type: 'button', class: 'ghost share-btn', disabled: true }, 'Share');
  const paintShare = () => {
    const chosen = shareItems.filter((i) => i.on);
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
      const out = await forZip(await item.make());
      return new File([out.data], out.name, { type: 'application/pdf' });
    })().then((file) => {
      item.file = file;
      paintShare();
    }, (err) => {
      item.error = printError(err);
      paintShare();
    });
  };
  /** A file row with a box to tick it for sharing. */
  const shareRow = (item, ...content) => {
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
    shareItems.push(item);
    return h('div', { class: 'file-row' }, box, ...content);
  };
  const pickKinds = (kinds) => {
    for (const item of shareItems) {
      item.on = kinds.includes(item.kind);
      item.box.checked = item.on;
      if (item.on) prepare(item);
    }
    paintShare();
  };
  const shareText = (chosen) => {
    const lines = [`*${S.name}*`];
    if (S.client) lines.push(`Client: ${S.client}`);
    if (S.dateline) lines.push(`Dateline: ${formatDate(S.dateline)}`);
    for (const item of chosen) lines.push(`- ${item.note}`);
    return lines.join('\n');
  };
  // Where the browser cannot hand files to an app (most desktops without the share
  // sheet), nothing can: a WhatsApp link carries text only. So the files download
  // and WhatsApp opens with the note, for the files to be attached by hand.
  const shareByHand = (chosen, text, openWhatsApp) => {
    if (openWhatsApp) window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    for (const item of chosen) {
      deps.saveFile({ blob: item.file, name: item.file.name, type: item.file.type });
    }
    message.textContent = 'Browser ni tak boleh hantar file terus. File dah didownload: lampirkan dalam WhatsApp.';
    message.hidden = false;
  };
  share.addEventListener('click', () => {
    const chosen = shareItems.filter((i) => i.on && i.file);
    if (!chosen.length) return;
    const files = chosen.map((i) => i.file);
    const text = shareText(chosen);
    message.hidden = true;
    let canShare = false;
    try {
      canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files });
    } catch {
      canShare = false;
    }
    if (!canShare) {
      shareByHand(chosen, text, true);
      return;
    }
    // Nothing is awaited before this: the tap has to still count when it runs.
    navigator.share({ files, text, title: S.name }).catch((err) => {
      if (err?.name === 'AbortError') return;   // the person closed the sheet
      shareByHand(chosen, text, false);
    });
  });

  const multiPage = S.source.pages.length > 1;
  const sizes = sizesOf(ready);
  const forPages = (pages) => {
    if (!multiPage) return '';
    return pages.length === S.source.pages.length
      ? ', untuk semua page'
      : `, untuk page ${pages.map((p) => p.index + 1).join(', ')}`;
  };
  const labels = (pages) => pages.map((p) => (S.files.length > 1 ? p.label : `page ${p.index + 1}`)).join(', ');

  const cutRows = sizes.map(({ plan, pages }) => shareRow({
    kind: 'cut',
    title: `file cut ${size(plan.width, plan.height)}`,
    make: () => cutFile(plan, pages.length),
    note: `File cut ${size(plan.width, plan.height)}, ${plan.pieces} pieces, ${pages.length} unit: `
      + 'panel dan backing acrylic putih 3mm. Garisan puzzle dulu, frame last.',
  },
  h('div', { class: 'file-row-text' },
    h('b', {}, 'File cut'),
    h('span', {}, `${size(plan.width, plan.height)}, ${plan.pieces} pieces, ${pages.length} unit${forPages(pages)}`)),
  fileButton('File cut', () => cutFile(plan, pages.length))));

  // Print: one file per bed load (Boss, 11 Nov 2026). A single panel's file stays
  // to hand for printing one again, folded away.
  const runs = printRuns(ready);
  const runRows = runs.map((run, i) => shareRow({
    kind: 'run',
    title: `file print UV run ${i + 1}`,
    make: () => runFile(run, i + 1),
    note: `File print UV${runs.length > 1 ? ` run ${i + 1}` : ''}: ${run.pages.length} panel, ${size(run.width, run.height)}. `
      + `Letak panel rapat tepi ke tepi dari bucu kiri atas bed${multiPage ? ` (${labels(run.pages)})` : ''}.`,
  },
  h('div', { class: 'file-row-text' },
    h('b', {}, runs.length > 1 ? `File print UV, run ${i + 1} dari ${runs.length}` : 'File print UV'),
    h('span', {}, `${run.pages.length} panel, ${size(run.width, run.height)}${multiPage ? `: ${labels(run.pages)}` : ''}`)),
  fileButton('File print', () => runFile(run, i + 1))));

  const singleRows = ready.map((p) => {
    const { art } = planFor(p);
    const name = multiPage ? (S.files.length > 1 ? p.label : `Page ${p.index + 1}`) : baseName(S.source.name);
    return shareRow({
      kind: 'single',
      title: `file print ${name}`,
      make: () => printFile(p),
      note: `File print satu panel: ${name}.`,
    },
    h('div', { class: 'file-row-text' },
      h('b', {}, name),
      h('span', {}, `Artwork ${size(art.width, art.height)}${p.turned ? ', diputar 90°' : ''}`)),
    fileButton('File print', () => printFile(p)));
  });
  const singles = ready.length > 1
    ? h('details', { class: 'print-singles' }, h('summary', {}, 'File print satu panel (untuk ulang print)'), ...singleRows)
    : null;

  // The reference cards: one sheet for every ticked page, whatever its puzzle size.
  const layout = S.cards ? cardLayout() : null;
  const cardsReady = layout && layout.fitsBed;
  const cardRows = cardsReady ? [
    shareRow({
      kind: 'cardCut',
      title: 'file cut kad A6',
      make: () => cardCutFile(layout),
      note: `Kad A6 file cut: sheet ${size(layout.sheet.width, layout.sheet.height)}, ${layout.cards.length} kad, acrylic putih 3mm. Kad dulu, frame last.`,
    },
    h('div', { class: 'file-row-text' },
      h('b', {}, 'Kad A6: File cut'),
      h('span', {}, `Sheet ${size(layout.sheet.width, layout.sheet.height)}, ${layout.cards.length} kad`)),
    fileButton('File cut', () => cardCutFile(layout))),
    shareRow({
      kind: 'cardPrint',
      title: 'file print kad A6',
      make: () => cardPrintFile(layout),
      note: 'Kad A6 file print: UV print atas sheet kad tanpa keluarkan kad.',
    },
    h('div', { class: 'file-row-text' },
      h('b', {}, 'Kad A6: File print'),
      h('span', {}, `Bleed ${CARD_BLEED_MM} mm, dengan Spot 1 dan Spot 2`)),
    fileButton('File print', () => cardPrintFile(layout))),
  ] : [];
  const cardWarning = layout && !layout.fitsBed
    ? h('p', { class: 'warn-line' }, `Kad A6: sheet ${size(layout.sheet.width, layout.sheet.height)} tak muat UV bed. Kurangkan page.`)
    : null;

  const all = h('button', { type: 'button', class: 'primary', ...(ready.length || cardsReady ? {} : { disabled: true }) },
    'Download semua (ZIP)');
  all.addEventListener('click', busy(all, async () => {
    const files = [];
    for (const { plan, pages } of sizes) files.push(await forZip(await cutFile(plan, pages.length)));
    for (const [i, run] of runs.entries()) files.push(await forZip(await runFile(run, i + 1)));
    if (cardsReady) {
      files.push(await forZip(await cardCutFile(layout)));
      files.push(await forZip(await cardPrintFile(layout)));
    }
    const zip = makeZip(files);
    deps.saveFile({
      blob: new Blob([zip], { type: 'application/zip' }),
      name: `${baseName(S.source.name)}-puzzle.zip`,
      type: 'application/zip',
    });
  }));

  const first = ready[0] && planFor(ready[0]);
  dlg.replaceChildren(h('div', { class: 'dlg-body' },
    h('h2', {}, 'Download file'),
    ticked.length ? null : h('p', { class: 'warn-line' }, 'Tiada page dipilih. Tick sekurang-kurangnya satu page.'),
    ...cutRows,
    ...runRows,
    singles,
    ...cardRows,
    cardWarning,
    ...blocked.map((p) => h('p', { class: 'warn-line' },
      `${S.files.length > 1 ? p.label : `Page ${p.index + 1}`}: ${blockedReason(planFor(p))}`)),
    first
      ? h('p', { class: 'note' },
        'File cut: cut ikut bilangan UNIT dalam file. Garisan puzzle dulu, frame last. '
        + 'File print UV: letak panel rapat tepi ke tepi dari bucu kiri atas bed, ikut susunan file. '
        + 'Poster dalam file print ialah gambar CMYK 300 dpi, macam file Photoshop designer, jadi ringan dibuka. '
        + 'Spot 1 dan Spot 2 (white) di bawah setiap poster, sama saiz, macam file Photoshop designer.')
      : null,
    shareItems.length
      ? h('div', { class: 'share-bar' },
        h('span', {}, 'Pilih untuk share:'),
        h('button', { type: 'button', class: 'ghost', onclick: () => pickKinds(['cut', 'cardCut']) }, 'File cut (laser)'),
        h('button', { type: 'button', class: 'ghost', onclick: () => pickKinds(['run', 'cardPrint']) }, 'File print (UV)'))
      : null,
    savedLine,
    message,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'ghost', onclick: () => dlg.close() }, 'Tutup'),
      shareItems.length ? share : null,
      all)));
  dlg.showModal();
  saveOnExport(savedLine);
}

export const POSTER_STEPS = [
  ['Cut panel acrylic putih dulu',
    'Ikut bilangan UNIT dalam file cut. Garisan puzzle dulu, frame last. Jangan keluarkan pieces lagi.'],
  ['UV print atas panel tu',
    'Semak layer dulu di Preview, File print. Letak panel atas bed tanpa keluarkan pieces, rapat tepi ke tepi dari bucu kiri atas, ikut susunan file print UV: satu file untuk satu run. Buka file tu terus dalam FlexiPrint, layer Spot 1 dan Spot 2 dah ada. Lebihan artwork jatuh atas frame, jadi tepi puzzle tak tinggal kosong.'],
  ['Keluarkan pieces', 'Frame kekal, jadi dinding tray.'],
  ['Cut backing',
    'Backing dalam acrylic putih 3mm, ikut bilangan UNIT.'],
  ['Lekat jadi tray',
    'Double tape di belakang frame, lekat atas backing.'],
  ['Susun pieces dalam tray', 'Siap.'],
  ['Kad rujukan A6, kalau ada',
    'Cut sheet kad dulu, frame last. UV print atas sheet tu tanpa keluarkan kad, ikut arah file print kad. Kemudian keluarkan kad.'],
];
