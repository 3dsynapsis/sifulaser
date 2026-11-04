// "Poster to puzzle": upload a PDF, pick a size, take away every file the job needs.
//
// The ordinary tool asks for numbers. This one works them out from the poster so
// that nobody has to, and hands back the two files the shop works from: the cut
// file (all three parts on a job sheet) and the print file (the artwork, placed).
//
// Its state lives here and not in store.js. The poster's bytes do not belong in
// localStorage, and leaving poster mode has to put the ordinary tool back exactly
// as it was.

import { h, group, rnd } from './ui.js';
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

const PICTURE_PX = 1800;
const THUMB_PX = 120;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const S = {
  source: null,
  choice: { paper: 'A3' },
  client: '',
  dateline: '',
  current: 0,
  stageView: 'panel',
  shuffle: 0,
  ranks: new Map(),
};

let deps = null;

/** @param d { view, els, saveFile, refresh, setMode, fillHelp } */
export function initPoster(d) { deps = d; }

export const posterActive = () => Boolean(S.source);

const currentPage = () => S.source.pages[S.current];
const planFor = (page) => planPoster(page.widthMm, page.heightMm, S.choice);
const size = (w, h) => `${rnd(w, 1)} x ${rnd(h, 1)} mm`;
const mm = (v) => `${rnd(v, 1)} mm`;

// ---- seeds ----------------------------------------------------------------
// Choosing takes a moment, so the preview draws with a stand-in until it is done.
// Pages at the same size share the ranked list but each takes a different seed
// from it, so two puzzles in one job cannot swap pieces.

function rankFor(plan) {
  const key = `${plan.width}x${plan.height}:${plan.cols}x${plan.rows}`;
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

const pick = (list, page) => list[(page.index + S.shuffle) % list.length].seed;

function previewPuzzle(plan, page) {
  const { list } = rankFor(plan);
  return buildPuzzle(puzzleParams(plan, list ? pick(list, page) : 1));
}

async function finalPuzzle(plan, page) {
  const list = await rankFor(plan).promise;
  return buildPuzzle(puzzleParams(plan, pick(list, page)));
}

// ---- opening and closing --------------------------------------------------

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
  for (const p of source.pages) {
    if (p.picture) URL.revokeObjectURL(p.picture);
    if (p.thumb) URL.revokeObjectURL(p.thumb);
  }
  source.doc.destroy().catch(() => {});
  S.source = null;
}

export async function openPosterFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) {
    alert('Fail ni bukan PDF. Pilih poster dalam format PDF.');
    return;
  }
  const wasActive = posterActive();
  deps.els.hint.textContent = 'Membaca PDF...';
  deps.els.hint.classList.add('show');
  let source;
  try {
    source = await openPoster(file);
  } catch (err) {
    alert(readError(err));
    deps.refresh();
    return;
  }
  if (!source.pages.length) {
    alert('PDF ni tiada page.');
    deps.refresh();
    return;
  }
  closeSource();
  S.source = source;
  S.current = 0;
  S.stageView = 'panel';
  S.shuffle = 0;
  if (!wasActive) deps.setMode(true, source.name);
  else deps.els.name.value = source.name;
  deps.refresh();
  loadThumbs(source);
}

export function closePoster() {
  closeSource();
  deps.setMode(false);
  deps.refresh();
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
  const puzzle = previewPuzzle(plan, page);
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
    h('p', { class: 'hint' }, 'PDF kekal dalam browser ni. Tiada apa-apa dihantar ke mana-mana.'));
}

function pageList() {
  const { pages } = S.source;
  return h('div', { class: 'page-list' }, pages.map((p) => {
    const plan = planFor(p);
    const open = () => { S.current = p.index; renderPoster(); };
    return h('div', { class: p.index === S.current ? 'page-row open' : 'page-row' },
      h('input', {
        type: 'checkbox',
        'aria-label': `Buat page ${p.index + 1}`,
        ...(p.ticked ? { checked: true } : {}),
        onchange: (e) => { p.ticked = e.target.checked; },
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
        onclick: () => { S.choice = { paper: paper.id }; renderPoster(); },
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
    onclick: () => { S.stageView = id; renderPoster(); },
  }, label);
  return group('Preview', true,
    h('div', { class: 'seg' }, choice('panel', 'Panel + artwork'), choice('sheet', 'Job sheet')),
    h('p', { class: 'hint' },
      'Merah ialah garisan cut. Kawasan pudar ialah bleed yang jatuh atas frame. Zoom dan semak '
      + 'teks tak terlalu rapat dengan garisan, terutama di tepi.'));
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
        oninput: (e) => { S.client = e.target.value; },
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
        },
      })));
}

export function shufflePoster() {
  S.shuffle += 1;
  renderStage();
}

// ---- files ----------------------------------------------------------------

const pageTag = (page) => (S.source.pages.length > 1 ? `-p${page.index + 1}` : '');
const filename = (page, kind, w, h2) => `${baseName(S.source.name)}${pageTag(page)}-${kind}-${rnd(w, 1)}x${rnd(h2, 1)}.pdf`;

async function cutFile(page) {
  const plan = planFor(page);
  const puzzle = await finalPuzzle(plan, page);
  const sheet = buildSheet(plan, puzzle, jobMeta());
  const body = sheetToPdf(sheet, { title: `${S.source.name} - cut` });
  return {
    blob: new Blob([body], { type: 'application/pdf' }),
    name: filename(page, 'cut', plan.width, plan.height),
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
    name: filename(page, 'print', plan.art.width, plan.art.height),
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

export function openPosterExport() {
  const dlg = deps.els.posterDlg;
  const ticked = S.source.pages.filter((p) => p.ticked);
  const ready = ticked.filter((p) => !blockedReason(planFor(p)));
  const blocked = ticked.filter((p) => blockedReason(planFor(p)));
  const message = h('p', { class: 'warn-line', role: 'alert', hidden: true });

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

  const rows = ready.map((p) => {
    const plan = planFor(p);
    return h('div', { class: 'file-row' },
      h('div', { class: 'file-row-text' },
        h('b', {}, S.source.pages.length > 1 ? `Page ${p.index + 1}` : baseName(S.source.name)),
        h('span', {}, `${size(plan.width, plan.height)}, ${plan.pieces} pieces`)),
      fileButton('File cut', () => cutFile(p)),
      fileButton('File print', () => printFile(p)));
  });

  const all = h('button', { type: 'button', class: 'primary', ...(ready.length ? {} : { disabled: true }) },
    'Download semua (ZIP)');
  all.addEventListener('click', busy(all, async () => {
    const files = [];
    for (const p of ready) {
      files.push(await forZip(await cutFile(p)));
      files.push(await forZip(await printFile(p)));
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
    ...rows,
    ...blocked.map((p) => h('p', { class: 'warn-line' },
      `Page ${p.index + 1}: ${blockedReason(planFor(p))}`)),
    first
      ? h('p', { class: 'note' },
        `File cut: garisan puzzle dulu, frame last. File print: artwork ${size(first.art.width, first.art.height)}, `
        + `${mm(first.art.x)} dari kiri dan ${mm(first.art.y)} dari atas panel.`)
      : null,
    message,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'ghost', onclick: () => dlg.close() }, 'Tutup'),
      all)));
  dlg.showModal();
}

export const POSTER_STEPS = [
  ['Cut acrylic clear dulu',
    'Garisan puzzle dulu, frame last. Jangan keluarkan pieces lagi.'],
  ['UV print atas panel tu',
    'Letak panel atas bed tanpa keluarkan pieces, ikut arah file print. Lebihan artwork jatuh atas frame, jadi tepi puzzle tak tinggal kosong.'],
  ['Keluarkan pieces',
    'Frame clear habis fungsi selepas ni.'],
  ['Cut border dan backing',
    '4 batang border dan 1 backing dalam acrylic putih 3mm. Batang boleh dipindah ke offcut untuk jimat material.'],
  ['Lekat jadi tray',
    'Double tape di belakang border, lekat atas backing.'],
  ['Susun pieces dalam tray', 'Siap.'],
];
