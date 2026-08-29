// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.
// Control idioms follow the Box Maker so the five tools feel like one family.
//
// The panel order is the order somebody actually decides things in: the link
// first, because that is what they came to paste; then how big it is; then how
// much damage it should survive; then whether it needs a board round it.

import {
  state, update, setParam, setSizePreset, sizePreset, getResult,
  canUndo, canRedo, reset,
} from './store.js';
import {
  SIZE_PRESETS, FRAMES, MODULE_MIN, MODULE_HOPELESS, QUIET,
} from './geom/tag.js';
import { ECC_LEVELS, MAX_VERSION, capacityBytes } from './geom/qr.js';
import { LAYERS, nest } from './export.js';

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

const rnd = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p;

const clamp = (v, min, max) => {
  if (Number.isNaN(v)) return min ?? 0;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
};

let sliderDragging = false;

function liveRange({ min, max, step, value, onInput, onDisplay }) {
  return h('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => {
      sliderDragging = true;
      const v = parseFloat(e.target.value);
      onDisplay?.(v);
      onInput(v);
    },
    onchange: (e) => {
      sliderDragging = false;
      onInput(parseFloat(e.target.value));
    },
  });
}

function numberRow(label, value, { min, max, step = 1, unit, onInput, slider = true }) {
  const num = h('input', {
    type: 'number', value: rnd(value, 3), min, max, step,
    onchange: (e) => {
      sliderDragging = false;
      onInput(clamp(parseFloat(e.target.value), min, max));
    },
  });
  const range = slider
    ? liveRange({ min, max, step, value, onInput, onDisplay: (v) => { num.value = rnd(v, 3); } })
    : null;
  return h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { class: 'row' },
      range,
      h('div', { class: 'num', style: 'flex:0 0 92px' },
        num, unit && h('span', { class: 'unit' }, unit))));
}

function seg(options, current, onPick) {
  return h('div', { class: 'seg' }, options.map(([id, label, title]) => h('button', {
    type: 'button', 'aria-pressed': String(current === id), title,
    onclick: () => onPick(id),
  }, label)));
}

// ---- backdrop -------------------------------------------------------------
export const BACKDROPS = [
  {
    id: 'light',
    label: 'Light backdrop',
    swatch: 'radial-gradient(120% 110% at 28% 18%, #ffffff 0%, #dde1e8 78%)',
  },
  {
    id: 'dark',
    label: 'Dark backdrop',
    swatch: 'radial-gradient(120% 110% at 28% 18%, #4c4c50 0%, #2b2b2e 78%)',
  },
];

export function renderBackdrop(root, onPick) {
  root.replaceChildren(...BACKDROPS.map((b) => h('button', {
    type: 'button',
    title: b.label,
    'aria-label': b.label,
    'aria-pressed': String(state.backdrop === b.id),
    style: `background:${b.swatch}`,
    onclick: () => onPick(b.id),
  })));
}

// ---- inspector ------------------------------------------------------------
const groupOpen = new Map();

function group(title, open, ...body) {
  const isOpen = groupOpen.has(title) ? groupOpen.get(title) : open;
  const node = h('details', { class: 'group', ...(isOpen ? { open: true } : {}) },
    h('summary', {}, title),
    h('div', { class: 'group-body' }, ...body));
  node.addEventListener('toggle', () => groupOpen.set(title, node.open));
  return node;
}

const ECL_NOTES = {
  L: 'About 7% of the code can be lost. The smallest grid, so the biggest '
    + 'modules for a given size - the right choice when space is tight and the '
    + 'tag lives indoors.',
  M: 'About 15%. The usual choice, and what most generators default to.',
  Q: 'About 25%. Worth it on something that gets handled, scratched or left '
    + 'in the sun.',
  H: 'About 30%. The most robust, and the most modules to fit in - on a small '
    + 'tag it is often what pushes the modules below the size that scans.',
};

/** Time a raster fill takes, near enough to judge a job by. */
function burnSeconds(areaMm2, speed, interval) {
  if (!(speed > 0) || !(interval > 0)) return 0;
  // A raster fill sweeps line by line, so the head travels roughly one line
  // length per interval of height: area / interval millimetres in total. It
  // ignores the overscan at the end of each line, so the real time is a bit
  // longer - always in the same direction, which is the useful way to be wrong.
  return areaMm2 / interval / speed;
}

export function renderInspector(root, ctx) {
  if (sliderDragging) return;
  const active = document.activeElement;
  const keepId = active && active.classList.contains('text-line') ? active.dataset.k : null;
  const caret = keepId ? [active.selectionStart, active.selectionEnd] : null;

  root.replaceChildren();
  root.append(h('h2', { class: 'insp-title' }, 'QR code'));
  const p = state.params;
  const r = getResult();
  const d = r.derived;

  // ---- what it points at, first: it is what people came to paste ----------
  const link = h('textarea', {
    class: 'text-area text-line', spellcheck: 'false', 'data-k': 'text',
    placeholder: 'https://example.com',
    oninput: (e) => {
      update((s) => { s.params.text = e.target.value; }, { history: false });
      ctx.refreshPreviewOnly();
    },
    onchange: (e) => { setParam('text', e.target.value); ctx.refresh(); },
  });
  link.value = p.text ?? '';

  root.append(group('Link or text', true,
    link,
    h('p', { class: 'hint' },
      'Anything at all: a web address, a phone number, a WiFi string, a line of '
      + 'text. Longer content needs more modules, and more modules in the same '
      + 'millimetres means smaller ones. A plain web address costs one byte a '
      + 'character; an accent costs two and an emoji four.'),
    d.empty
      ? null
      : h('div', { class: 'stat' },
        h('span', {}, 'Used'),
        h('b', {}, `${d.bytes} of ${d.capacity} bytes`))));

  // ---- size ---------------------------------------------------------------
  const fine = !d.empty && d.moduleMm < MODULE_MIN;
  root.append(group('Size', true,
    // No "Custom" button: a size that is not one of the presets simply lights
    // none of them, and the millimetre field directly below says what it is.
    seg(SIZE_PRESETS.map((s) => [s.id, s.name, `${s.mm} mm`]),
      sizePreset(), (id) => { setSizePreset(id); ctx.refresh(); }),
    numberRow('Overall size (mm)', p.size, {
      min: 10, max: 300, step: 1, unit: 'mm',
      onInput: (v) => { setParam('size', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      `That is the whole code including the ${QUIET}-module quiet zone - the `
      + 'clear border a reader needs in order to find the code at all. It is '
      + 'part of the artwork even though nothing is burnt there.'),
    d.empty ? null : h('div', { class: 'stat' },
      h('span', {}, 'Code itself'),
      h('b', {}, `${rnd(d.codeMm, 1)} mm`)),
    d.empty ? null : h('div', { class: 'stat' },
      h('span', {}, 'Quiet zone, each side'),
      h('b', {}, `${rnd(d.quietMm, 1)} mm`)),
    d.empty ? null : h('div', { class: 'stat' },
      h('span', {}, 'Grid'),
      h('b', {}, `${d.modules} x ${d.modules} modules`)),
    d.empty ? null : h('div', { class: 'stat' },
      h('span', {}, 'One module'),
      h('b', { class: fine ? 'bad' : '' }, `${rnd(d.moduleMm, 2)} mm`)),
    d.empty ? null : h('p', { class: 'hint' },
      fine
        ? `Under ${MODULE_MIN} mm the burn spreads into the gaps and readers `
          + `start failing; under ${MODULE_HOPELESS} mm there is no point trying.`
        : 'Comfortably above the size a phone camera can resolve.')));

  // ---- error correction ---------------------------------------------------
  root.append(group('Error correction', true,
    seg(ECC_LEVELS.map((e) => [e.id, e.id, `recovers about ${e.recovers}%`]),
      p.ecl, (id) => { setParam('ecl', id); ctx.refresh(); }),
    h('p', { class: 'hint' }, ECL_NOTES[p.ecl] || ''),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', ...(p.boost ? { checked: true } : {}),
        onchange: (e) => { setParam('boost', e.target.checked); ctx.refresh(); },
      }),
      ' Use any spare room for a stronger level'),
    h('p', { class: 'hint' },
      'The grid comes in fixed sizes, so the chosen level usually leaves some '
      + 'capacity unused. Spending it on more error correction never adds a '
      + 'module and never shrinks anything - it is free protection.'),
    d.boosted
      ? h('div', { class: 'stat' },
        h('span', {}, 'Actually using'),
        h('b', {}, `Level ${d.ecl}, up from ${d.requestedEcl}`))
      : null,
    h('div', { class: 'field' },
      h('label', {}, 'Version'),
      versionSelect(ctx)),
    h('p', { class: 'hint' },
      'Leave it automatic unless you are matching an existing code. A pinned '
      + 'version that is too small for the text is ignored and reported.')));

  // ---- frame --------------------------------------------------------------
  const framed = p.frame !== 'none';
  root.append(group('Frame', true,
    seg(FRAMES.map((f) => [f.id, f.name]), p.frame,
      (id) => { setParam('frame', id); ctx.refresh(); }),
    h('p', { class: 'hint' },
      p.frame === 'none'
        ? 'Engraving only, no cut line. For burning onto something that already '
          + 'exists - a bottle, a lid, a piece you cut on another job.'
        : p.frame === 'keychain'
          ? 'A plaque with a hole for a split ring. The board and the hole are '
            + 'cut; the code is engraved.'
          : 'A rounded rectangle cut around the code.'),
    framed ? numberRow('Margin (mm)', p.margin, {
      min: 0, max: 25, step: 0.5, unit: 'mm',
      onInput: (v) => { setParam('margin', v); ctx.refresh(); },
    }) : null,
    framed ? h('p', { class: 'hint' },
      'Board outside the quiet zone. The quiet zone is already there; this is '
      + 'somewhere to hold the thing.') : null,
    framed ? numberRow('Corner radius (mm)', p.corner, {
      min: 0, max: 20, step: 0.5, unit: 'mm',
      onInput: (v) => { setParam('corner', v); ctx.refresh(); },
    }) : null,
    p.frame === 'keychain' ? numberRow('Hole diameter (mm)', p.holeDia, {
      min: 1, max: 12, step: 0.5, unit: 'mm',
      onInput: (v) => { setParam('holeDia', v); ctx.refresh(); },
    }) : null,
    p.frame === 'keychain' ? numberRow('Hole to edge (mm)', p.holeEdge, {
      min: 1, max: 12, step: 0.5, unit: 'mm',
      onInput: (v) => { setParam('holeEdge', v); ctx.refresh(); },
    }) : null,
    p.frame === 'keychain' ? h('p', { class: 'hint' },
      'Board between the hole and the outside. Under 2 mm it tears out; the '
      + 'strip at the top grows to make room for whatever you set.') : null,
    !d.empty && framed
      ? h('div', { class: 'stat' },
        h('span', {}, 'Finished part'),
        h('b', {}, `${rnd(d.partW, 1)} x ${rnd(d.partH, 1)} mm`))
      : null));

  // ---- material -----------------------------------------------------------
  root.append(group('Material', false,
    numberRow('Thickness (mm)', p.thickness, {
      min: 1, max: 12, step: 0.1, unit: 'mm',
      onInput: (v) => { setParam('thickness', v); ctx.refresh(); },
    }),
    numberRow('Kerf (mm)', p.kerf, {
      min: 0, max: 1, step: 0.02, unit: 'mm',
      onInput: (v) => { setParam('kerf', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'Kerf is how wide your beam burns. The cut lines move half of it - the '
      + 'outline outwards, the hole inwards - so the finished part measures '
      + 'what it says. The engraving is left alone: a fill removes no slug of '
      + 'material, and how far the burn spreads sideways depends on the board '
      + 'and the power, which is what the module size warning is about.')));

  // ---- job ----------------------------------------------------------------
  const sheet = nest(r.panels, { sheetWidth: state.sheetWidth });
  const seconds = burnSeconds(d.engraveArea, state.scanSpeed, state.lineInterval);
  root.append(group('Job', false,
    h('div', { class: 'stat' },
      h('span', {}, 'Engrave area'),
      h('b', {}, `${rnd(d.engraveArea / 100, 2)} cm2`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Of the code'),
      h('b', {}, `${Math.round(d.engraveCoverage * 100)}% dark`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Paths after merging'),
      h('b', {}, `${d.rects} (from ${d.darkModules} modules)`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Cut length'),
      h('b', {}, d.cutLength ? `${rnd(d.cutLength / 10, 1)} cm` : 'nothing to cut')),
    numberRow('Scan speed (mm/s)', state.scanSpeed, {
      min: 20, max: 1200, step: 10,
      onInput: (v) => {
        update((s) => { s.scanSpeed = v; }, { history: false });
        ctx.refresh();
      },
    }),
    numberRow('Line interval (mm)', state.lineInterval, {
      min: 0.02, max: 0.5, step: 0.01,
      onInput: (v) => {
        update((s) => { s.lineInterval = v; }, { history: false });
        ctx.refresh();
      },
    }),
    h('div', { class: 'stat' },
      h('span', {}, 'Rough burn time'), h('b', {}, formatTime(seconds))),
    h('p', { class: 'hint' },
      'The fill sweeps line by line, so the time is the area divided by the '
      + 'line interval and the speed. It ignores the overshoot at the end of '
      + 'each line, so the real job runs a little longer.'),
    h('div', { class: 'stat' },
      h('span', {}, 'Sheet needed'),
      h('b', {}, `${rnd(sheet.width, 1)} x ${rnd(sheet.height, 1)} mm`))));

  root.append(h('button', {
    class: 'link', type: 'button',
    onclick: () => {
      if (!confirm('Start over? This clears the link and every setting.')) return;
      reset();
      ctx.refresh();
    },
  }, 'Start over'));

  if (caret) {
    const next = root.querySelector(`.text-line[data-k="${keepId}"]`);
    if (next) {
      next.focus();
      try { next.setSelectionRange(caret[0], caret[1]); } catch { /* ignore */ }
    }
  }
}

/**
 * The version list, annotated with what each one would hold.
 *
 * A bare list of forty numbers means nothing. What somebody pinning a version
 * actually wants to know is whether their text fits in it, so each option
 * carries its grid size and its capacity at the level currently chosen.
 */
function versionSelect(ctx) {
  const p = state.params;
  const sel = h('select', {
    class: 'face-select',
    onchange: (e) => { setParam('version', Number(e.target.value)); ctx.refresh(); },
  });
  sel.append(h('option', { value: '0' }, 'Automatic - smallest that fits'));
  for (let v = 1; v <= MAX_VERSION; v++) {
    sel.append(h('option', { value: String(v) },
      `Version ${v} - ${v * 4 + 17} modules, holds ${capacityBytes(v, p.ecl)} bytes`));
  }
  sel.value = String(p.version || 0);
  return sel;
}

export function renderWarnings(root) {
  // Warnings only. The boosted-level note is good news, not a problem, and it
  // is already reported as a stat in the panel - putting it in a red-edged box
  // over the preview would read as something having gone wrong.
  const { warnings } = getResult().derived;
  root.replaceChildren(...warnings.map((w) => h('div', { class: 'warn-box' }, w)));
  root.hidden = !warnings.length;
}

function formatTime(s) {
  if (!Number.isFinite(s) || s <= 0) return '-';
  if (s < 60) return `${Math.ceil(s)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m} min ${rem} s`;
}

// ---- dialogs --------------------------------------------------------------
export function fillExportDialog(dlg) {
  const r = getResult();
  const d = r.derived;
  const sheet = nest(r.panels, { sheetWidth: state.sheetWidth });
  dlg.querySelector('#exportSummary').textContent = d.empty
    ? 'Nothing to export yet.'
    : `Version ${d.version}, level ${d.ecl}, ${d.modules} x ${d.modules} modules `
      + `at ${rnd(d.moduleMm, 2)} mm each. `
      + `${rnd(sheet.width, 1)} x ${rnd(sheet.height, 1)} mm of `
      + `${rnd(r.params.thickness, 1)} mm board.`;

  // Only the layers this particular job actually contains, so the key never
  // lists a colour that is not in the file.
  const key = [
    ['cut', d.hasCut],
    ['engraveFill', d.hasEngraveFill],
    ['engrave', d.hasEngraveLine],
  ].filter(([, on]) => on).map(([id]) => LAYERS[id]);
  dlg.querySelector('#layerKey').replaceChildren(...key.map((L) => h('span', {},
    h('i', { style: `background:${L.color};border:1px solid var(--line-strong)` }),
    L.label)));

  const notes = [];
  if (d.hasEngraveFill) {
    notes.push('Black is the modules - set it to Fill or Scan. A Line operation '
      + 'would outline every module and leave the middles bare, which looks '
      + 'like a QR code and does not scan.');
  }
  if (d.hasCut) notes.push('Red is cut.');
  notes.push('The burnt modules have to end up darker than the board around '
    + 'them. On a dark material engrave the background instead, or the contrast '
    + 'runs the wrong way.');
  notes.push('Both files carry real millimetres, so they import at size.');
  notes.push('Scan it off the screen before you cut fifty of them.');
  dlg.querySelector('#exportNote').textContent = notes.join(' ');
  const empty = d.empty || !r.panels.length;
  dlg.querySelector('#dlSvg').disabled = empty;
  dlg.querySelector('#dlPdf').disabled = empty;
}

export function fillHelpDialog(dlg) {
  dlg.querySelector('#helpBody').replaceChildren(
    h('p', {},
      'A QR code is a grid of squares called modules. How many there are is '
      + 'decided by how much text you put in and how much error correction you '
      + 'asked for - not by you, and not by the size in millimetres.'),
    h('h3', {}, 'Why the module size is the whole story'),
    h('p', {},
      'Set the size and the modules divide into it. A long link at level H can '
      + 'easily be a 57 x 57 grid, and 57 modules plus the quiet zone across a '
      + '25 mm keyring is under 0.4 mm each. The laser cannot burn a clean edge '
      + 'that small - the char spreads and the light gaps close up - and no '
      + 'phone will read it. Below about 0.8 mm it gets unreliable; below '
      + '0.5 mm it is finished.'),
    h('p', {},
      'Three things change it, and the tool works out the numbers for all '
      + 'three: make it bigger, shorten the link, or ask for less error '
      + 'correction.'),
    h('h3', {}, 'The quiet zone'),
    h('p', {},
      'Four modules of clear space on every side. A reader finds the code by '
      + 'looking for light around the three corner squares, so a code cut hard '
      + 'to its own edge will not be found at all. It is included in the size '
      + 'you set and it is included in the exported file, even though nothing '
      + 'is burnt there.'),
    h('h3', {}, 'Error correction'),
    h('p', {},
      'Every code carries spare information so it still reads when part of it '
      + 'is damaged. L recovers about 7%, M about 15%, Q about 25%, H about '
      + '30%. More correction means more modules, which on a small tag means '
      + 'smaller ones - so the strongest level is not automatically the best '
      + 'choice.'),
    h('h3', {}, 'Contrast'),
    h('p', {},
      'A scanner needs the modules darker than the background. Burning into '
      + 'light plywood or painted anodised aluminium is fine. Burning into '
      + 'black acrylic gives the opposite, and while many readers cope with an '
      + 'inverted code, not all do.'));
}

export function renderActions({ undoBtn, redoBtn }) {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
}

export { rnd, formatTime, burnSeconds };
