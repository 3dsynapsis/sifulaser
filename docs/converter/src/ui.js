// The panels either side of the two previews. Pure DOM, rebuilt from the store.
//
// The h() builder and the re-render-wholesale idiom are the other nine tools',
// so the family stays one family. What is specific to this tool is which
// sentences are allowed to appear together:
//
//   * a size is only ever printed when the file said what its units were, or
//     when the user answered - and in the second case the amber chip travels
//     with the number everywhere it is shown;
//   * the Illustrator paragraph sits under the format buttons whether or not
//     anybody asked, because the button it explains the absence of is the one
//     the owner's mockup drew;
//   * what was lost is counted by type and listed above the Download button,
//     not behind a badge.
//
// No document at module scope: tools/test-converter.js imports from src/ under
// plain node, and a module-scope DOM reference would take the suite down on
// load rather than in a test.

import { state, setTarget } from './store.js';
import { TARGETS, UNIT_CHOICES_CONV, fileInfo, isUserChosen } from './convert.js';
import { WARN } from './doc.js';

export const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
};

export function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** The current info block's source: settled geometry if we have it, else raw. */
const infoOf = () => (state.settled ? fileInfo(state.settled) : (state.parsed ? fileInfo(state.parsed) : null));

/**
 * The unit state as it stands NOW, which is not the same object the reader
 * returned once the user has answered.
 *
 * Reading state.parsed.unit after an answer is a live trap: it still says
 * "unknown" for ever, so the size stays hidden and the amber chip never
 * appears - the screen would quietly go back to being about the file when it
 * has become about the person.
 */
export const currentUnit = () => (state.settled && state.settled.unit)
  || (state.parsed && state.parsed.unit)
  || null;

/**
 * Whether the unit picker is on screen.
 *
 * It is up whenever the size stopped being purely the file's own word: the file
 * said nothing, the file said pixels, or somebody answered. Two callers need
 * the same answer - main.js to place it, and the left panel to keep quiet about
 * the reason, because the picker is already saying it two centimetres away.
 */
export const pickerVisible = () => {
  const u = currentUnit();
  return !!u && (u.mmPerUnit == null || u.state === 'nominal' || !!state.params.unitChoice);
};

/**
 * The chip that says a number on this screen came from a person and not from
 * the file. It is deliberately repeated rather than shown once: whoever reads
 * "182.8 cm" three seconds after choosing has forgotten, and whoever opens the
 * file next week was never told.
 */
const chosenChip = (unit) => h('span', { class: 'chip chip-warn' },
  `Unit dipilih anda: ${unit.chosen} - fail asal tidak menyatakan`);

function dimensionRow(info) {
  const u = info.unit;
  if (!u || u.mmPerUnit == null) {
    // Not a greyed-out number and not a guess in brackets. The file did not
    // say, so neither do we.
    return h('span', { class: 'dim-none' }, '- fail tidak menyatakan unit');
  }
  const text = info.dimensionsText || '-';
  if (isUserChosen(u)) {
    return h('span', {}, h('span', { class: 'dim' }, text), ' ', chosenChip(u));
  }
  if (u.state === 'nominal') {
    return h('span', {},
      h('span', { class: 'dim' }, text), ' ',
      h('span', { class: 'chip' }, 'dari piksel (96 dpi), bukan saiz sebenar'));
  }
  return h('span', { class: 'dim' }, text);
}

// ---------------------------------------------------------------------------
// left column: the file that arrived

export function renderLeftPanel(root, ctx) {
  const info = infoOf();
  const kids = [];

  if (info) {
    kids.push(h('div', { class: 'file-row' },
      h('span', { class: 'file-name', title: info.name }, info.name),
      h('button', { class: 'ghost small', onclick: () => ctx.pickFile() }, 'Tukar Fail')));

    kids.push(h('h3', { class: 'block-title' }, 'Maklumat Fail'));
    kids.push(h('dl', { class: 'info' },
      h('dt', {}, 'Format'), h('dd', {}, String(info.format || '-').toUpperCase()),
      h('dt', {}, 'Saiz'), h('dd', {}, fmtBytes(info.bytes)),
      h('dt', {}, 'Dimensi'), h('dd', {}, dimensionRow(info)),
      h('dt', {}, 'Objek'), h('dd', {}, `${info.objects} laluan, ${info.layers} lapisan`)));

    // The picker prints the same sentence, so this only speaks when it is not.
    if (info.unit && info.unit.why && !pickerVisible()) {
      kids.push(h('p', { class: 'why' }, info.unit.why));
    }
  }

  if (state.notice) kids.push(h('p', { class: 'notice' }, state.notice));

  root.replaceChildren(...kids);
}

// ---------------------------------------------------------------------------
// the unit question

/**
 * The unit picker.
 *
 * `blocking` is true when the file said nothing usable. Then this replaces the
 * converted preview, because there is nothing honest to put there yet: no unit
 * means no millimetres, and no millimetres means no output file.
 *
 * It stays on screen afterwards, and it is also shown for a px-declared file
 * that was never blocked. Both are the same reason: the moment the size on
 * screen stops being the file's own word, the control that made it that way has
 * to remain visible and changeable.
 */
export function renderUnitAsk(root, ctx, { blocking = true } = {}) {
  const u = currentUnit();
  if (!u) { root.replaceChildren(); return; }

  // px files open on px, which is what the file said - the picker is there to
  // be corrected, not to be answered from scratch.
  const selected = state.params.unitChoice || (u.state === 'nominal' ? 'px' : null);

  const buttons = UNIT_CHOICES_CONV.map(([id, label]) => h('button', {
    class: `unit-btn${selected === id ? ' is-on' : ''}`,
    onclick: () => ctx.chooseUnit(id),
  }, label));

  const head = blocking
    ? [
      h('h3', {}, 'Fail ini tidak beritahu unitnya.'),
      h('p', { class: 'why' }, u.why || ''),
      h('p', {}, 'Kami tidak meneka. Kalau kami teka salah, papan anda dipotong saiz yang salah.'),
      h('p', { class: 'ask-q' }, 'Lukisan asal dalam unit apa?'),
    ]
    : [
      h('h3', {}, 'Unit lukisan'),
      h('p', { class: 'why' }, isUserChosen(u)
        ? u.why
        : 'Fail ini menyatakan piksel. Tukar di sini kalau anda tahu unit sebenarnya.'),
    ];

  root.replaceChildren(
    h('div', { class: `ask${blocking ? ' ask-blocking' : ''}` },
      ...head,
      h('div', { class: 'unit-row' }, buttons)),
  );
}

// ---------------------------------------------------------------------------
// right column: what will come out

const hasFill = (c) => {
  if (!c) return false;
  const s = String(c).trim().toLowerCase();
  return !!s && s !== 'none' && s !== 'transparent' && s !== 'rgba(0, 0, 0, 0)';
};

/**
 * The losses that depend on where the file is going rather than where it came
 * from.
 *
 * The readers cannot raise these: at import time nobody has picked a target
 * yet. They are computed here, from the drawing that was actually read and the
 * button that is actually pressed, so nothing is claimed that did not happen -
 * a drawing with no filled shapes gets no "fills were lost" line, whatever
 * format it is heading for.
 */
export function targetWarnings() {
  const doc = (state.settled && state.settled.doc) || (state.parsed && state.parsed.doc);
  if (!doc) return [];
  const mk = (kind, n) => ({ kind, tier: WARN[kind].tier, count: n, text: WARN[kind].text(n) });
  const out = [];
  if (state.params.target === 'dxf') {
    const filled = doc.paths.filter((p) => hasFill(p.fill)).length;
    if (filled) out.push(mk('fillLost', filled));
    out.push(mk('strokeWidth', 1));
  }
  if (state.params.target === 'pdf') out.push(mk('pdfNoLayers', 1));
  // Every target rewrites line weight, not just DXF. Saying it only on the DXF
  // button left the other two quietly doing the same thing.
  if (state.params.target === 'svg' || state.params.target === 'pdf') {
    out.push(mk('strokeHairline', 1));
  }
  return out;
}

function warningsBlock() {
  const info = infoOf();
  const warnings = [...((info && info.warnings) || []), ...targetWarnings()];
  const loud = warnings.filter((w) => w.tier === 1);
  const quiet = warnings.filter((w) => w.tier === 2);
  const out = [];

  if (loud.length) {
    out.push(h('div', { class: 'warn-box' },
      h('h4', {}, 'Apa yang hilang'),
      h('ul', {}, loud.map((w) => h('li', {}, w.text)))));
  }
  if (quiet.length) {
    out.push(h('details', { class: 'quiet-warn' },
      h('summary', {}, 'Apa yang berubah'),
      h('ul', {}, quiet.map((w) => h('li', {}, w.text)))));
  }
  return out;
}

export function renderRightPanel(root, ctx) {
  const info = infoOf();
  const kids = [];
  const unit = currentUnit();
  const needsAnswer = !!unit && unit.mmPerUnit == null;

  kids.push(h('h3', { class: 'block-title' }, 'Tukar Kepada'));
  kids.push(h('div', { class: 'target-row' }, TARGETS.map((t) => h('button', {
    class: `target-btn${state.params.target === t.id ? ' is-on' : ''}`,
    'aria-pressed': state.params.target === t.id ? 'true' : 'false',
    onclick: () => { setTarget(t.id); ctx.refresh(); },
  }, t.label))));

  // The owner's mockup has an AI button. There is no honest one to build, and
  // the reason belongs on the screen rather than only in a comment - somebody
  // looking for that button is standing here.
  kids.push(h('p', { class: 'fineprint' },
    h('strong', {}, 'Guna PDF untuk Adobe Illustrator'),
    ' - Illustrator buka PDF dan SVG terus. Kami tidak tulis fail ',
    h('code', {}, '.ai'),
    '. Menulis PDF dan menamakannya ',
    h('code', {}, '.ai'),
    ' memang akan buka dalam Illustrator, tetapi memanggilnya "format Adobe '
    + 'Illustrator" adalah memberitahu anda sesuatu yang tidak benar tentang fail yang anda pegang.'));

  kids.push(...warningsBlock());

  const canConvert = !!state.parsed && !needsAnswer;
  const chip = info && info.unit && isUserChosen(info.unit) ? chosenChip(info.unit) : null;

  kids.push(h('div', { class: 'convert-row' },
    h('button', {
      class: 'primary',
      disabled: !canConvert || !!state.busy,
      onclick: () => ctx.convert(),
    }, state.result ? 'Tukar semula' : 'Tukar'),
    chip));

  if (needsAnswer) {
    kids.push(h('p', { class: 'why' },
      'Jawab soalan unit di atas dahulu - tiada saiz, tiada fail.'));
  }

  if (state.result) {
    const r = state.result;
    kids.push(h('p', { class: 'ok' },
      `Siap. ${r.ext.toUpperCase()} sedia dimuat turun - ${fmtBytes(r.bytes)}.`,
      chip ? ' ' : null,
      chip ? chosenChip(info.unit) : null));
  }

  kids.push(h('button', {
    // The site's sign-in gate hooks exactly this id, in the capture phase, and
    // calls stopImmediatePropagation(). Any other id and this is the one tool
    // on the site whose download skips the prompt, with nothing to warn you.
    id: 'exportBtn',
    class: 'primary wide',
    disabled: !state.result,
    onclick: () => ctx.download(),
  }, state.result ? `Muat Turun .${state.result.ext}` : 'Muat Turun'));

  root.replaceChildren(...kids);
}

/** The one-line size readout above the converted preview. */
export function outputSizeText() {
  if (!state.result) return null;
  return fmtBytes(state.result.bytes);
}
