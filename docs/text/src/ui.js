// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.
// Control idioms follow the Box Maker so the three tools feel like one family.

import {
  state, update, setParam, getResult, canUndo, canRedo, reset,
} from './store.js';
import { layout, faceLoaded } from './geom/text.js';
import { LAYERS } from './export.js';

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
      h('div', { class: 'num', style: 'flex:0 0 92px' }, num, unit && h('span', { class: 'unit' }, unit))));
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

/**
 * Each typeface previews itself, in its own strokes. Nothing else describes a
 * face as well as the face - "Script" as a word tells you far less than seeing
 * it written.
 */
function faceThumb(face) {
  const r = layout({
    faceData: face, text: face.name, capHeight: 10, align: 'left',
    letterSpacing: 0, wordSpacing: 0, lineSpacing: 1.6,
  });
  if (!r.paths.length) return '';
  const { bbox } = r;
  const w = Math.max(0.01, bbox.x1 - bbox.x0);
  const hgt = Math.max(0.01, bbox.y1 - bbox.y0);
  const pad = 1;
  const d = r.paths.map((st) => {
    const seg = [`M ${(st[0] - bbox.x0).toFixed(2)} ${(bbox.y1 - st[1]).toFixed(2)}`];
    for (let k = 2; k < st.length; k += 2) {
      seg.push(`L ${(st[k] - bbox.x0).toFixed(2)} ${(bbox.y1 - st[k + 1]).toFixed(2)}`);
    }
    return seg.join(' ');
  }).join(' ');
  return `<svg viewBox="${-pad} ${-pad} ${w + pad * 2} ${hgt + pad * 2}" `
    + `preserveAspectRatio="xMinYMid meet" aria-hidden="true"><path d="${d}"/></svg>`;
}

const ALIGNS = [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']];

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

export function renderInspector(root, ctx) {
  if (sliderDragging) return;
  const active = document.activeElement;
  const keepText = active && active.classList.contains('text-area');
  const caret = keepText ? [active.selectionStart, active.selectionEnd] : null;

  root.replaceChildren();
  root.append(h('h2', { class: 'insp-title' }, 'Text'));
  const p = state.params;
  const r = getResult();

  // ---- What you type comes first; everything below shapes it.
  const area = h('textarea', {
    class: 'text-area', spellcheck: 'false', rows: 4,
    placeholder: 'Type here. Enter starts a new line.',
    oninput: (e) => {
      update((s) => { s.params.text = e.target.value; }, { history: false });
      ctx.refreshPreviewOnly();
    },
    onchange: (e) => { setParam('text', e.target.value); ctx.refresh(); },
  });
  area.value = p.text;

  root.append(group('Your text', true,
    area,
    h('div', { class: 'field' },
      h('label', {}, 'Alignment'),
      h('div', { class: 'seg' }, ALIGNS.map(([id, label]) => h('button', {
        type: 'button', 'aria-pressed': String(p.align === id),
        onclick: () => { setParam('align', id); ctx.refresh(); },
      }, label)))),
    p.text.includes('\t')
      ? h('p', { class: 'warn' }, 'Tabs are not a glyph in these faces - use spaces.')
      : null));

  root.append(group('Typeface', true,
    h('div', { class: 'faces-list' }, ctx.faces.map((f) => {
      const face = faceLoaded(f.id);
      return h('button', {
        class: 'face-opt', type: 'button',
        'aria-pressed': String(p.face === f.id),
        title: face ? `${f.name} (${face.source})` : f.name,
        onclick: () => { setParam('face', f.id); ctx.refresh(); },
      }, face
        ? h('span', { html: faceThumb(face) })
        : h('span', { class: 'muted' }, f.name));
    }))));

  root.append(group('Size & spacing', true,
    numberRow('Capital height (mm)', p.capHeight, {
      min: 2, max: 300, step: 0.5,
      onInput: (v) => { setParam('capHeight', v); ctx.refresh(); },
    }),
    numberRow('Letter spacing (mm)', p.letterSpacing, {
      min: -5, max: 30, step: 0.25,
      onInput: (v) => { setParam('letterSpacing', v); ctx.refresh(); },
    }),
    numberRow('Word spacing (mm)', p.wordSpacing, {
      min: -5, max: 40, step: 0.25,
      onInput: (v) => { setParam('wordSpacing', v); ctx.refresh(); },
    }),
    r.lines > 1
      ? numberRow('Line spacing (x cap)', p.lineSpacing, {
        min: 0.8, max: 4, step: 0.05,
        onInput: (v) => { setParam('lineSpacing', v); ctx.refresh(); },
      })
      : null,
    numberRow('Margin (mm)', p.margin, {
      min: 0, max: 50, step: 0.5,
      onInput: (v) => { setParam('margin', v); ctx.refresh(); },
    }),
    numberRow('Slant (deg)', p.slant, {
      min: -30, max: 30, step: 1,
      onInput: (v) => { setParam('slant', v); ctx.refresh(); },
    }),
    numberRow('Width (%)', p.width, {
      min: 50, max: 200, step: 5,
      onInput: (v) => { setParam('width', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'Capital height is measured on a capital H, so what you set is what you '
      + 'measure on the finished piece. Letters with tails hang below it. Slant '
      + 'and width shear and stretch the real letterform, which is how the '
      + 'italic and condensed cuts are made here.')));

  const seconds = state.speed > 0 ? r.length / state.speed : 0;
  root.append(group('Job', false,
    h('div', { class: 'stat' },
      h('span', {}, 'Size'),
      h('b', {}, `${rnd(r.size.width, 1)} x ${rnd(r.size.height, 1)} mm`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Travel'), h('b', {}, `${rnd(r.length / 1000, 2)} m`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Strokes'), h('b', {}, String(r.paths.length))),
    numberRow('Engrave speed (mm/s)', state.speed, {
      min: 10, max: 1000, step: 10,
      onInput: (v) => { update((s) => { s.speed = v; }, { history: false }); ctx.refresh(); },
    }),
    h('div', { class: 'stat' },
      h('span', {}, 'Rough time'), h('b', {}, formatTime(seconds))),
    h('p', { class: 'hint' },
      'Travel is the line the head actually follows. A filled font would cover '
      + 'the same letters many times over - that is the whole reason to use a '
      + 'single-line face for engraving.'),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', ...(p.smooth ? { checked: true } : {}),
        onchange: (e) => { setParam('smooth', e.target.checked); ctx.refresh(); },
      }),
      ' Fit curves through the strokes'),
    h('p', { class: 'hint' },
      r.face?.straight
        ? `${r.face.name} is drawn from straight segments on purpose, so curve `
          + 'fitting is skipped for it - the chamfers are the point. Pick another '
          + 'face to see the difference.'
        : 'The stroke data is straight segments, which shows as facets on round '
          + 'letters once they get big. Fitting curves through the same points '
          + 'keeps the letterform and loses the flats. Turn it off for raw '
          + 'polylines if your controller prefers them.'),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', ...(state.showBox ? { checked: true } : {}),
        onchange: (e) => {
          update((s) => { s.showBox = e.target.checked; }, { history: false });
          ctx.refresh();
        },
      }),
      ' Show the page outline in the preview')));

  root.append(h('button', {
    class: 'link', type: 'button',
    onclick: () => {
      if (!confirm('Start over? This clears the text and every setting.')) return;
      reset();
      ctx.refresh();
    },
  }, 'Start over'));

  if (caret) {
    const next = root.querySelector('.text-area');
    if (next) {
      next.focus();
      try { next.setSelectionRange(caret[0], caret[1]); } catch { /* ignore */ }
    }
  }
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
  dlg.querySelector('#exportSummary').textContent =
    `${rnd(r.size.width, 1)} x ${rnd(r.size.height, 1)} mm, ${r.paths.length} strokes, `
    + `${rnd(r.length / 1000, 2)} m of travel.`;
  dlg.querySelector('#layerKey').replaceChildren(
    h('span', {}, h('i', { style: `background:${LAYERS.engrave.color}` }),
      LAYERS.engrave.label));
  dlg.querySelector('#exportNote').textContent =
    'Both files carry real millimetres, so they import at the size shown. Set '
    + 'your machine to Line / Engrave, not Fill - these are open strokes, and a '
    + 'fill operation has nothing to fill.';
  const empty = r.paths.length === 0;
  dlg.querySelector('#dlSvg').disabled = empty;
  dlg.querySelector('#dlPdf').disabled = empty;
}

export function fillHelpDialog(dlg) {
  dlg.querySelector('#helpBody').replaceChildren(
    h('p', {},
      'An ordinary font describes the outline of each letter. To engrave it the '
      + 'machine traces that outline and then fills it in, so one letter is a '
      + 'stack of closed loops and the head passes over the same area again and '
      + 'again.'),
    h('p', {},
      'A single-line face is the skeleton instead: one pass down the middle of '
      + 'each stroke, exactly the line a pen would draw. Nothing to fill, nothing '
      + 'traced twice. On a laser it is dramatically faster and the result is a '
      + 'clean hairline rather than a dark block.'),
    h('p', {},
      'Set the job to Line or Engrave mode. If you point a Fill operation at '
      + 'these paths it will find no enclosed area and mark nothing.'),
    h('h3', {}, 'Credits'),
    h('p', { class: 'hint' },
      'The typefaces are the Hershey Fonts, originally created by Dr. A. V. '
      + 'Hershey while working at the U. S. National Bureau of Standards. The '
      + 'format of the font data in the distribution they came from was '
      + 'originally created by James Hurt, Cognition Inc. They are free for any '
      + 'use, including commercial.'),
    h('p', { class: 'hint' },
      'The idea for this tool came from templatemaker.nl’s single-stroke '
      + 'text creator. The fonts and the code here are our own.'));
}

export function renderActions({ undoBtn, redoBtn }) {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
}

export { rnd, formatTime };
