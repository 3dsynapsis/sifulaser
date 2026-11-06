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

import { h, group, rnd } from './ui.js';
import * as gallery from './designs.js';
import { signedIn } from './cloud.js';
import * as vault from './posterVault.js';
import {
  planKey, posterRecord, readPoster, cleanPoster,
} from './posterSaved.js';
import { buildPuzzle } from './geom/puzzle.js';
import {
  PAPERS, UV_BED_MM, LOW_DPI, GOOD_DPI, planPoster, puzzleParams, effectiveDpi, pixelsFor,
} from './geom/poster.js';
import { rankSeeds } from './geom/strength.js';
import { buildSheet, sheetToPdf } from './exportJobSheet.js';
import {
  openPoster, renderPicture, pageImages, openForPrint, buildPrintPdf,
} from './posterPdf.js';
import { makeZip } from './zip.js';
import {
  LAYER_LOOK, inspectPrint, judgeLayers, releaseLayers,
} from './printCheck.js';

const PICTURE_PX = 1800;
const THUMB_PX = 120;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const S = {
  source: null,
  name: '',           // what this job is called, shown in the top bar
  fileHash: '',
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
const planFor = (page) => planPoster(page.widthMm, page.heightMm, S.choice);
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
    file: {
      name: source.name, size: source.bytes.length, hash: S.fileHash, pages: source.pages.length,
    },
    choice: S.choice,
    ticked: source.pages.filter((p) => p.ticked).map((p) => p.index),
    current: S.current,
    view: S.stageView,
    shuffle: S.shuffle,
    client: S.client,
    dateline: S.dateline,
    seeds: knownSeeds(),
  };
}

/** What counts as a change worth saving. Looking at another page does not. */
const settingsKey = () => JSON.stringify({
  name: S.name,
  hash: S.fileHash,
  choice: S.choice,
  ticked: S.source.pages.filter((p) => p.ticked).map((p) => p.index),
  shuffle: S.shuffle,
  client: S.client,
  dateline: S.dateline,
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
    deps.els.name.value = name;
    changed();
  },
  note: 'Yang disimpan ke akaun ialah tetapan: saiz, page, seed, client dan dateline. '
    + 'PDF kekal dalam browser ni. Kalau buka di PC lain, kena pilih PDF tu semula.',
  // Runs inside the save, so that two saves in a row wait for each other.
  prepare: async () => {
    await pinSeeds();
    try {
      await vault.putFile(S.fileHash, S.source.name, S.source.bytes);
      await vault.keepFile(S.fileHash);
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
  posterStore.rename(name.trim() || nameOf(S.source.name));
}

// ---- opening and closing --------------------------------------------------

const nameOf = (fileName) => fileName.replace(/\.pdf$/i, '').trim() || 'Poster';

const baseName = (name) => name.replace(/\.pdf$/i, '').trim()
  .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'poster';

function readError(err) {
  if (err?.name === 'PasswordException') {
    return 'PDF ni berkunci dengan password. Minta file tanpa password.';
  }
  return 'PDF ni tak dapat dibaca. Cuba simpan semula sebagai PDF biasa.';
}

function closeSource() {
  const { source } = S;
  if (!source) return;
  dropPrintCheck();
  for (const p of source.pages) {
    if (p.picture) URL.revokeObjectURL(p.picture);
    if (p.thumb) URL.revokeObjectURL(p.thumb);
  }
  source.doc.destroy().catch(() => {});
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
  S.current = Math.min(saved.current, pages.length - 1);
  S.pins.clear();
  for (const s of saved.seeds) S.pins.set(s.key, s.seed);
  for (const page of pages) page.ticked = saved.ticked.includes(page.index);
}

/**
 * @param restore when opening a saved job or the draft:
 *   { saved, name, design: { id, name }, savedKey, quiet }
 *   savedKey undefined means work it out, from whether this is the PDF that was saved.
 * @returns whether the poster is now open
 */
export async function openPosterFile(file, restore = null) {
  if (!file) return false;
  const complain = (text) => { if (!restore?.quiet) alert(text); };
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) {
    complain('Fail ni bukan PDF. Pilih poster dalam format PDF.');
    return false;
  }
  if (!restore && !(await confirmLeave())) return false;
  const wasActive = posterActive();
  deps.els.hint.textContent = 'Membaca PDF...';
  deps.els.hint.classList.add('show');
  let source;
  try {
    source = await openPoster(file);
  } catch (err) {
    complain(readError(err));
    deps.refresh();
    return false;
  }
  if (!source.pages.length) {
    complain('PDF ni tiada page.');
    deps.refresh();
    return false;
  }
  let hash = '';
  try {
    hash = await vault.hashBytes(source.bytes);
    await vault.putFile(hash, source.name, source.bytes);
  } catch { /* opens anyway; there will be no draft to come back to */ }

  // Replacing the PDF of a job that is already saved is the same job with a better
  // file: the sample swapped for the client's final one. Name and shapes stay.
  const sameJob = !restore && wasActive && gallery.current().id;
  closeSource();
  S.source = source;
  S.fileHash = hash;
  S.current = 0;
  S.stageView = 'panel';
  if (restore) {
    applyJob(restore.saved);
    S.name = restore.name;
  } else if (!sameJob) {
    S.shuffle = 0;
    S.pins.clear();
    S.name = nameOf(source.name);
    S.savedKey = null;
  }
  if (!wasActive) deps.setMode(true, S.name);
  else deps.els.name.value = S.name;
  if (restore) {
    gallery.setOpen(restore.design?.id ?? null, restore.design?.name ?? null);
    if (restore.savedKey !== undefined) S.savedKey = restore.savedKey;
    else S.savedKey = hash && hash === restore.saved.file.hash ? settingsKey() : null;
  }
  deps.refresh();
  loadThumbs(source);
  changed();
  return true;
}

/**
 * The PDF a saved job needs, when this browser no longer has it: another PC, or
 * browsing data cleared. Resolves to a File, or null if the person backs out.
 */
function askForPdf(saved) {
  return new Promise((resolve) => {
    const dlg = deps.els.posterDlg;
    const finish = (file) => {
      resolve(file);
      dlg.close();
    };
    const useAnyway = h('button', { type: 'button', class: 'primary', hidden: true }, 'Guna file ni');
    const warning = h('p', { class: 'warn-line', hidden: true });
    let chosen = null;
    useAnyway.addEventListener('click', () => finish(chosen));
    dlg.addEventListener('close', () => resolve(null), { once: true });
    dlg.replaceChildren(h('div', { class: 'dlg-body' },
      h('h2', {}, 'Pilih PDF poster'),
      h('p', { class: 'muted' },
        `Design ni guna file "${saved.file.name}". File tu tiada dalam browser ni, jadi pilih file yang sama.`),
      h('label', { class: 'ghost file-pick' },
        h('input', {
          type: 'file',
          accept: 'application/pdf,.pdf',
          hidden: true,
          onchange: async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            let hash = '';
            try {
              hash = await vault.hashBytes(await file.arrayBuffer());
            } catch { /* cannot tell, so treat it as different */ }
            if (hash && hash === saved.file.hash) {
              finish(file);
              return;
            }
            chosen = file;
            warning.textContent = `"${file.name}" lain daripada file yang disimpan dulu. Saiz dan bentuk puzzle kekal, tapi artwork ikut file ni.`;
            warning.hidden = false;
            useAnyway.hidden = false;
          },
        }),
        'Pilih PDF'),
      warning,
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: () => finish(null) }, 'Batal'),
        useAnyway)));
    dlg.showModal();
  });
}

/** Open a job from the account. @returns false when nothing changed */
export async function openPosterDesign(row) {
  const saved = readPoster(row);
  if (!saved) return false;
  if (!(await confirmLeave())) return false;
  let file = null;
  if (saved.file.hash) {
    try {
      file = await vault.getFile(saved.file.hash);
    } catch { /* same as not having it */ }
  }
  if (!file) file = await askForPdf(saved);
  if (!file) return false;
  return openPosterFile(file, { saved, name: row.name, design: { id: row.id, name: row.name } });
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
  let file = null;
  if (saved?.file.hash) {
    try {
      file = await vault.getFile(saved.file.hash);
    } catch { /* same as not having it */ }
  }
  const opened = file && await openPosterFile(file, {
    saved,
    name: typeof draft.name === 'string' && draft.name ? draft.name : nameOf(saved.file.name),
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
  const hash = S.fileHash;
  closeSource();
  clearTimeout(draftTimer);
  S.fileHash = '';
  S.name = '';
  S.savedKey = null;
  S.pdfKept = true;
  S.shuffle = 0;
  S.pins.clear();
  S.client = '';
  S.dateline = '';
  S.choice = { paper: 'A3' };
  S.layerOn = allLayersOn();
  vault.clearDraft().catch(() => {});
  if (hash) vault.releaseFile(hash).catch(() => {});
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
  if (S.stageView === 'print') {
    const check = printCheckFor(page, plan);
    deps.view.renderPrint({
      plan,
      layers: check.layers,
      order: LAYER_LOOK.map((l) => l.name),
      on: S.layerOn,
      fitKey: `print:${S.current}:${plan.width}x${plan.height}`,
    });
    deps.els.hint.textContent = check.state === 'building'
      ? 'Membaca file print...'
      : `File print ${size(plan.panel.width, plan.panel.height)}`;
    deps.els.hint.classList.add('show');
    return;
  }
  const puzzle = previewPuzzle(plan);
  const fitKey = `${S.current}:${plan.width}x${plan.height}`;
  if (S.stageView === 'sheet') {
    deps.view.renderSheet(buildSheet(plan, puzzle, jobMeta()), `sheet:${fitKey}`);
  } else {
    deps.view.renderPoster({ plan, puzzle, imageUrl: page.picture, fitKey: `panel:${fitKey}` });
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
  const dpi = Math.min(...page.images.map((im) => effectiveDpi(im, plan)));
  if (dpi >= LOW_DPI) return null;
  const px = pixelsFor(plan);
  return `Resolusi artwork rendah: lebih kurang ${Math.round(dpi)} dpi pada saiz ni, jadi print `
    + `boleh nampak kabur. Elok minta file ${px.w} x ${px.h} px (${GOOD_DPI} dpi).`;
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
    h('button', { class: 'link', type: 'button', onclick: closePoster },
      'Tutup poster, balik ke puzzle biasa'),
  );
  root.scrollTop = scroll;
}

function fileGroup() {
  const { source } = S;
  const replace = h('label', { class: 'ghost file-pick' },
    h('input', {
      type: 'file',
      accept: 'application/pdf,.pdf',
      hidden: true,
      onchange: (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        openPosterFile(f);
      },
    }),
    'Tukar PDF');
  const single = source.pages.length === 1;
  return group('Poster', true,
    h('div', { class: 'stat' },
      h('span', { class: 'file-name', title: source.name }, source.name),
      h('b', {}, single ? '1 page' : `${source.pages.length} page`)),
    single ? null : pageList(),
    replace,
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
        'aria-label': `Buat page ${p.index + 1}`,
        ...(p.ticked ? { checked: true } : {}),
        onchange: (e) => {
          p.ticked = e.target.checked;
          changed();
        },
      }),
      h('button', { type: 'button', class: 'page-open', onclick: open },
        p.thumb ? h('img', { src: p.thumb, alt: '' }) : h('span', { class: 'page-blank' }),
        h('span', { class: 'page-text' },
          h('b', {}, `Page ${p.index + 1}`),
          h('span', {}, size(plan.width, plan.height)))));
  }));
}

function sizeGroup(page) {
  const isCustom = S.choice.height != null;
  return group('Saiz output', true,
    h('div', { class: 'presets three' }, PAPERS.map((paper) => {
      const plan = planPoster(page.widthMm, page.heightMm, { paper: paper.id });
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
    stat('Panel clear', size(panel.width, panel.height)),
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
    h('div', { class: 'seg seg-3' },
      choice('panel', 'Panel + artwork'), choice('sheet', 'Job sheet'), choice('print', 'File print')),
    S.stageView === 'print'
      ? layerPanel()
      : h('p', { class: 'hint' },
        'Merah ialah garisan cut. Kawasan pudar ialah bleed yang jatuh atas frame. Zoom dan semak '
        + 'teks tak terlalu rapat dengan garisan, terutama di tepi.'));
}

// ---- the print file's layers ------------------------------------------------
// Boss, 6 Nov 2026: a place to check the layers before the file goes to FlexiPrint,
// with an eye on each to switch it off and look underneath.

/** The print file of this page at this size, built and read back once. */
function printCheckFor(page, plan) {
  const key = `${page.index}|${planKey(plan)}|${S.fileHash}`;
  if (S.printCheck?.key === key) return S.printCheck;
  dropPrintCheck();
  const check = {
    key, state: 'building', layers: null, results: null, error: null,
  };
  S.printCheck = check;
  (async () => {
    // The very file the File print button gives, not a likeness of it.
    const file = await printFile(page);
    return inspectPrint(S.source.lib, new Uint8Array(await file.blob.arrayBuffer()));
  })().then((found) => {
    if (S.printCheck !== check) {
      releaseLayers(found.layers);
      return;
    }
    check.layers = found.layers;
    check.results = judgeLayers(found, plan, found.tolMm);
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
  const check = S.printCheck;
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
    h('span', { class: 'layer-text' }, h('b', {}, 'Kawasan kosong'), h('span', {}, 'Clear, tiada dakwat')));

  let status;
  if (!check || check.state === 'building') status = [h('p', { class: 'hint' }, 'Membaca file print...')];
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
      + 'Tutup mata Artwork untuk tengok Spot di bawahnya.'),
  ];
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

/** One size, one cut file: every page at this size is cut from it. */
async function cutFile(plan) {
  const puzzle = await finalPuzzle(plan);
  const sheet = buildSheet(plan, puzzle, jobMeta());
  const body = sheetToPdf(sheet, { title: `${S.source.name} - cut` });
  return {
    blob: new Blob([body], { type: 'application/pdf' }),
    name: `${baseName(S.source.name)}-cut-${rnd(plan.width, 1)}x${rnd(plan.height, 1)}.pdf`,
    type: 'application/pdf',
  };
}

async function printFile(page) {
  const plan = planFor(page);
  if (!S.source.printDoc) S.source.printDoc = openForPrint(S.source.bytes);
  const doc = await S.source.printDoc;
  const bytes = await buildPrintPdf(doc, page.index, plan, { title: `${S.source.name} - print` });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${baseName(S.source.name)}${pageTag(page)}-print-${rnd(plan.art.width, 1)}x${rnd(plan.art.height, 1)}.pdf`,
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
  return err?.constructor?.name === 'EncryptedPDFError' || /encrypted/i.test(err?.message || '')
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

  const multiPage = S.source.pages.length > 1;
  const sizes = sizesOf(ready);
  const forPages = (pages) => {
    if (!multiPage) return '';
    return pages.length === S.source.pages.length
      ? ', untuk semua page'
      : `, untuk page ${pages.map((p) => p.index + 1).join(', ')}`;
  };

  const cutRows = sizes.map(({ plan, pages }) => h('div', { class: 'file-row' },
    h('div', { class: 'file-row-text' },
      h('b', {}, 'File cut'),
      h('span', {}, `${size(plan.width, plan.height)}, ${plan.pieces} pieces${forPages(pages)}`)),
    fileButton('File cut', () => cutFile(plan))));

  const printRows = ready.map((p) => {
    const { art } = planFor(p);
    return h('div', { class: 'file-row' },
      h('div', { class: 'file-row-text' },
        h('b', {}, multiPage ? `Page ${p.index + 1}` : baseName(S.source.name)),
        h('span', {}, `Artwork ${size(art.width, art.height)}, dengan Spot 1 dan Spot 2`)),
      fileButton('File print', () => printFile(p)));
  });

  const all = h('button', { type: 'button', class: 'primary', ...(ready.length ? {} : { disabled: true }) },
    'Download semua (ZIP)');
  all.addEventListener('click', busy(all, async () => {
    const files = [];
    for (const { plan } of sizes) files.push(await forZip(await cutFile(plan)));
    for (const p of ready) files.push(await forZip(await printFile(p)));
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
    ...printRows,
    ...blocked.map((p) => h('p', { class: 'warn-line' },
      `Page ${p.index + 1}: ${blockedReason(planFor(p))}`)),
    first
      ? h('p', { class: 'note' },
        `File cut: garisan puzzle dulu, frame last. File print: artwork ${size(first.art.width, first.art.height)}, `
        + `${mm(first.art.x)} dari kiri dan ${mm(first.art.y)} dari atas panel. Spot 1 dan Spot 2 di bawahnya, sama saiz.`)
      : null,
    savedLine,
    message,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'ghost', onclick: () => dlg.close() }, 'Tutup'),
      all)));
  dlg.showModal();
  saveOnExport(savedLine);
}

export const POSTER_STEPS = [
  ['Cut acrylic clear dulu',
    'Garisan puzzle dulu, frame last. Jangan keluarkan pieces lagi.'],
  ['UV print atas panel tu',
    'Semak layer dulu di Preview, File print. Buka file print terus dalam FlexiPrint, layer Spot 1 dan Spot 2 dah ada. Letak panel atas bed tanpa keluarkan pieces, ikut arah file print. Lebihan artwork jatuh atas frame, jadi tepi puzzle tak tinggal kosong.'],
  ['Keluarkan pieces',
    'Frame clear habis fungsi selepas ni.'],
  ['Cut border dan backing',
    '4 batang border dan 1 backing dalam acrylic putih 3mm. Batang boleh dipindah ke offcut untuk jimat material.'],
  ['Lekat jadi tray',
    'Double tape di belakang border, lekat atas backing.'],
  ['Susun pieces dalam tray', 'Siap.'],
];
