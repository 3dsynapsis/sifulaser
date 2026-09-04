// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.
// Control idioms follow the Box Maker so the eight tools feel like one family.

import {
  state, update, setParam, getResult, canUndo, canRedo, reset,
  MATERIALS, material, setMaterial, setBoardNumber, applyPreset, applyDesign,
  beginGesture, endGesture,
} from './store.js';
import { layout, faceLoaded, faceFailed, loadFace, isOutline } from './geom/text.js';
import {
  PRESETS, matchesPreset, MIN_NECK, MIN_WALL, HOLE_ENDS, PLATE_TEXT, NAME_MARKS,
} from './geom/keychain.js';
import { BODIES, bodyOf, isPlate } from './geom/body.js';
import { LAYERS } from './export.js';
import * as gallery from './designs.js';

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
  let out = v;
  if (min != null) out = Math.max(min, out);
  if (max != null) out = Math.min(max, out);
  return out;
};

// While a slider is being dragged the inspector must not re-render: replacing
// the input under the pointer drops the drag on the floor mid-gesture.
let sliderDragging = false;

function liveRange({ min, max, step, value, onInput, onDisplay }) {
  return h('input', {
    type: 'range',
    min,
    max,
    step,
    value,
    onpointerdown: () => beginGesture(),
    oninput: (e) => {
      sliderDragging = true;
      const v = parseFloat(e.target.value);
      onDisplay?.(v);
      onInput(v);
    },
    onchange: (e) => {
      sliderDragging = false;
      endGesture();
      onInput(parseFloat(e.target.value));
    },
  });
}

function numberRow(label, value, {
  min, max, step = 1, unit, onInput, slider = true,
}) {
  const numInput = h('input', {
    type: 'number',
    value: rnd(value, 3),
    min,
    max,
    step,
    onchange: (e) => {
      sliderDragging = false;
      onInput(clamp(parseFloat(e.target.value), min, max));
    },
  });
  const range = slider
    ? liveRange({
      min, max, step, value, onInput, onDisplay: (v) => { numInput.value = rnd(v, 3); },
    })
    : null;
  return h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { class: 'row' },
      range,
      h('div', { class: 'num', style: 'flex:0 0 92px' },
        numInput, unit && h('span', { class: 'unit' }, unit))));
}

function seg(options, current, onPick) {
  return h('div', { class: 'seg' }, options.map(([id, label]) => h('button', {
    type: 'button',
    'aria-pressed': String(current === id),
    onclick: () => onPick(id),
  }, label)));
}

const stat = (label, value, bad) => h('div', { class: 'stat' },
  h('span', {}, label), h('b', { class: bad ? 'bad' : '' }, value));

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

// ---- body picker ----------------------------------------------------------
/**
 * The thumbnail on a body card, drawn from the body's own idea of itself.
 *
 * Hand-drawn icons were the alternative and they are a trap: a picture of the
 * shape that disagrees with the shape is a picture that lies, and it goes on
 * lying every time one of them is adjusted. These are simple enough to draw
 * from the same words the note uses, but the outline shapes at least come out
 * of nothing but width and height.
 */
function bodyArt(id) {
  const box = 'viewBox="0 0 60 34" aria-hidden="true"';
  const ink = 'fill="none" stroke="currentColor" stroke-width="2.4"';
  switch (id) {
    case 'rounded':
      return `<svg ${box}><rect x="3" y="7" width="54" height="20" rx="6" ${ink}/>`
        + `<circle cx="11" cy="17" r="2.6" ${ink}/></svg>`;
    case 'tag':
      return `<svg ${box}><path d="M17 7h34a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6H17a10 10 0 0 1 0-20z" ${ink}/>`
        + `<circle cx="14" cy="17" r="2.6" ${ink}/></svg>`;
    case 'oval':
      return `<svg ${box}><ellipse cx="30" cy="17" rx="27" ry="12" ${ink}/>`
        + `<circle cx="9" cy="17" r="2.6" ${ink}/></svg>`;
    case 'circle':
      return `<svg ${box}><circle cx="30" cy="18" r="15" ${ink}/>`
        + `<circle cx="30" cy="6" r="2.6" ${ink}/></svg>`;
    default:
      // The word: two blobs run together, which is what the offset does.
      return `<svg ${box}><path d="M20 27c-5 0-8-4-8-10s3-10 9-10c5 0 7 3 9 7 2-4 5-7 10-7 6 0 9 4 9 10s-3 10-9 10z" ${ink}/>`
        + `<circle cx="9" cy="17" r="2.6" ${ink}/></svg>`;
  }
}

// ---- typeface picker ------------------------------------------------------
export const CATEGORY_NAMES = {
  block: 'Block',
  display: 'Display',
  script: 'Cursive',
  serif: 'Serif',
  line: 'Single line',
};

const CATEGORY_NOTES = {
  block: 'Upright, even and heavy enough to hold a hole near it. The safest '
    + 'thing to put on a keychain, and the reason the tool opens on one.',
  display: 'Heavy, so it cuts well and welds with very little offset. Wide, '
    + 'so a long name gets big.',
  script: 'The letters already touch, which is half the work done - but the '
    + 'hairlines between them are the thinnest thing on the piece, so watch '
    + 'the narrowest measurement rather than the picture.',
  serif: 'Formal, and mostly too fine at this size. Expect to run the offset up.',
  line: 'Skeleton faces with no thickness of their own. The tool gives them '
    + 'one, and you set it.',
};

// Block first. On a keychain it is not one option among five - it is the
// answer most of the time, because it is the only category that survives a
// pocket without being fattened past recognition.
const CATEGORY_ORDER = ['block', 'display', 'script', 'serif', 'line'];

let activeCat = null;

function faceThumb(face) {
  const r = layout({ faceData: face, text: face.name, capHeight: 10, align: 'left' });
  if (!r.paths.length) return '';
  const { bbox } = r;
  const w = Math.max(0.01, bbox.x1 - bbox.x0);
  const hgt = Math.max(0.01, bbox.y1 - bbox.y0);
  const filled = isOutline(face);
  const d = r.paths.map((st) => {
    const parts = [`M ${(st[0] - bbox.x0).toFixed(2)} ${(bbox.y1 - st[1]).toFixed(2)}`];
    for (let k = 2; k < st.length; k += 2) {
      parts.push(`L ${(st[k] - bbox.x0).toFixed(2)} ${(bbox.y1 - st[k + 1]).toFixed(2)}`);
    }
    return parts.join(' ') + (filled ? ' Z' : '');
  }).join(' ');
  return `<svg viewBox="-1 -1 ${w + 2} ${hgt + 2}" preserveAspectRatio="xMinYMid meet" `
    + `aria-hidden="true" class="${filled ? 'thumb-fill' : 'thumb-line'}">`
    + `<path d="${d}"/></svg>`;
}

function facePicker(ctx) {
  const p = state.params;
  const current = ctx.faces.find((f) => f.id === p.face);
  if (!activeCat) activeCat = current?.cat || 'block';
  const cats = CATEGORY_ORDER.filter((c) => ctx.faces.some((f) => f.cat === c));
  const inCat = ctx.faces.filter((f) => f.cat === activeCat);

  // Only the category on screen is fetched. Thirty-three faces is well over a
  // megabyte of glyph data and nobody opens all five tabs.
  const pending = inCat.filter((f) => !faceLoaded(f.id));
  if (pending.length) {
    Promise.all(pending.map((f) => loadFace(f.id).catch(() => null)))
      .then(() => ctx.refresh());
  }

  return [
    h('div', { class: 'cat-tabs' }, cats.map((c) => h('button', {
      type: 'button',
      'aria-pressed': String(activeCat === c),
      onclick: () => { activeCat = c; ctx.refresh(); },
    }, CATEGORY_NAMES[c] || c))),
    h('p', { class: 'hint' }, CATEGORY_NOTES[activeCat] || ''),
    h('div', { class: 'faces-list' }, inCat.map((f) => {
      const face = faceLoaded(f.id);
      return h('button', {
        class: 'face-opt',
        type: 'button',
        'aria-pressed': String(p.face === f.id),
        title: f.name,
        onclick: () => { setParam('face', f.id); ctx.refresh(); },
      }, face
        ? h('span', { class: 'thumb', html: faceThumb(face) })
        : h('span', { class: 'muted' }, f.name));
    })),
  ];
}

// ---- presets --------------------------------------------------------------
/**
 * Somebody opening this tool wants a keychain, not a lesson in offsets. One
 * click gets a finished, warning-free piece to type a name into, which is also
 * the fastest way to learn what the settings underneath are for.
 */
function presetPicker(ctx) {
  const p = state.params;
  const current = PRESETS.find((x) => matchesPreset(x, p));
  return [
    h('div', { class: 'cards presets' }, PRESETS.map((x) => h('button', {
      class: 'card',
      type: 'button',
      title: x.note,
      'aria-pressed': String(current?.id === x.id),
      onclick: () => {
        applyPreset(x);
        // The face a preset asks for is usually not in memory: the picker only
        // fetches a category when somebody opens it. Draw with what is there,
        // then draw again when the face lands - or when it does not. A failed
        // fetch has to redraw too, because the preset's face is committed by
        // then and the stage is blank until something says why.
        if (!faceLoaded(x.params.face)) {
          loadFace(x.params.face).then(() => ctx.refresh(), () => ctx.refresh());
        }
        activeCat = null;
        ctx.refresh();
      },
    }, x.name))),
    h('p', { class: 'hint' },
      'Each of these sets the whole design - the words, the face, the length, '
      + 'the offset and the ring - because those numbers only work together. '
      + 'Type your own name over the placeholder.'),
  ];
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

const ALIGNS = [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']];
const BORDER_STYLES = [['none', 'Plain'], ['line', 'Line inside the edge']];

/**
 * What the dialogs are allowed to see of the store.
 *
 * Narrow on purpose: the gallery needs to read the design and put one back,
 * and nothing else. Handing it the whole store would let it grow reaching into
 * parts that are none of its business.
 */
const galleryStore = {
  name: () => state.name,
  params: () => ({ ...state.params }),
  material: () => state.material,
  rename: (name) => update((s) => { s.name = name; }, { history: false }),
  apply: (row) => applyDesign(row),
};

/** Save the design on screen without asking - used on the way out of Export. */
export const saveQuietly = () => gallery.saveQuietly(galleryStore);

/** Open a saved design by id. Used when arriving from another tool. */
export const openDesignById = (id) => gallery.openById(galleryStore, id);

const dialogFiller = (build) => function fill(dlg, ctx) {
  const close = () => dlg.close();
  const again = () => fill(dlg, ctx);
  dlg.replaceChildren(build(h, galleryStore, () => { close(); ctx.refresh(); }, again));
};

export const fillSaveDialog = dialogFiller(gallery.saveDialogBody);
export const fillFilesDialog = dialogFiller(gallery.filesDialogBody);

// The four widths that sell. Anything else is the slider underneath them.
const LENGTHS = [40, 50, 60, 70];

export function renderInspector(root, ctx) {
  if (sliderDragging) return;
  const active = document.activeElement;
  const keepText = active && active.classList.contains('text-area');
  const caret = keepText ? [active.selectionStart, active.selectionEnd] : null;

  root.replaceChildren();
  root.append(h('h2', { class: 'insp-title' }, 'Keychain'));
  const p = state.params;
  const r = getResult();
  const d = r.derived;
  const plate = isPlate(p.body);
  const face = faceLoaded(p.face);
  const strokeFace = face ? !isOutline(face) : false;

  // ---- the name is the whole object, so it goes first.
  const area = h('textarea', {
    class: 'text-area',
    spellcheck: 'false',
    rows: 2,
    placeholder: 'Aisyah',
    oninput: (e) => {
      update((s) => { s.params.text = e.target.value; }, { history: false });
      ctx.refreshPreviewOnly();
    },
    onchange: (e) => { setParam('text', e.target.value); ctx.refresh(); },
  });
  area.value = p.text;

  root.append(group('Start from', true, ...presetPicker(ctx)));

  // ---- size: the promise ---------------------------------------------------
  // Above the name on purpose. The length is what somebody is actually buying -
  // a 6 cm thing - and everything below solves itself to fit it, so it is the
  // first decision rather than a slider found later.
  root.append(group('Size', true,
    h('div', { class: 'seg' }, LENGTHS.map((mm) => h('button', {
      type: 'button',
      // Pressed when the current length IS this one, however it got there - so
      // picking a Start from preset lights the button that matches it, and the
      // row never disagrees with the slider under it.
      'aria-pressed': String(Math.abs(p.length - mm) < 0.01),
      onclick: () => { setParam('length', mm); ctx.refresh(); },
    }, `${mm} mm`))),
    numberRow('Length across (mm)', p.length, {
      min: 20, max: 200, step: 1,
      onInput: (v) => { setParam('length', v); ctx.refresh(); },
    }),
    stat('Finished piece', `${rnd(d.width, 1)} x ${rnd(d.height, 1)} mm`),
    stat('Capital height', `${rnd(d.capMM, 1)} mm`),
    h('p', { class: 'hint' },
      'The length is the finished piece, edge to edge, and the lettering is '
      + 'solved to fit it - not the other way round. Somebody ordering a '
      + 'keychain is buying a 6 cm thing; what cap height that works out to is '
      + 'the tool’s problem. The four buttons are the sizes that sell; the '
      + 'slider is there for when a customer asks for something between them.'),
    h('p', { class: 'hint' },
      'A Start from preset carries its own length, so picking one after a size '
      + 'replaces it - the preset is a whole design, not just the words.')));

  root.append(group('Name', true,
    area,
    h('div', { class: 'field' },
      h('label', {}, 'Alignment'),
      seg(ALIGNS, p.align, (id) => { setParam('align', id); ctx.refresh(); })),
    d.lines > 1
      ? numberRow('Line height (%)', p.lineHeight, {
        min: 50, max: 260, step: 1,
        onInput: (v) => { setParam('lineHeight', v); ctx.refresh(); },
      })
      : null,
    h('p', { class: 'hint' },
      plate
        ? 'A second line is where the phone number goes. On a plain body the '
          + 'lines never have to touch, so line height is only spacing.'
        : 'A second line on a cut-out name has to physically touch the first '
          + 'or it is a separate piece of sheet. Under 100% they overlap, which '
          + 'is usually the only way to make two lines work.')));


  // ---- shape ---------------------------------------------------------------
  root.append(group('Shape', true,
    h('div', { class: 'cards' }, BODIES.map((b) => h('button', {
      type: 'button',
      class: 'card',
      'aria-pressed': String(p.body === b.id),
      onclick: () => { setParam('body', b.id); ctx.refresh(); },
    }, h('span', { class: 'art', html: bodyArt(b.id) }), b.name))),
    h('p', { class: 'hint' }, bodyOf(p.body).note),
    plate
      ? h('div', { class: 'field' },
        h('label', {}, 'The name is'),
        seg(PLATE_TEXT, p.plateText, (id) => { setParam('plateText', id); ctx.refresh(); }))
      : null,
    !plate
      ? h('div', { class: 'field' },
        h('label', {}, 'Mark the letters'),
        seg(NAME_MARKS, p.nameMark, (id) => { setParam('nameMark', id); ctx.refresh(); }))
      : null,
    !plate
      ? h('p', { class: 'hint' },
        p.nameMark === 'none'
          ? 'One cut and nothing else. At a small offset the letters still read '
            + 'on their own; run the offset up and they will not, because welding '
            + 'is what closes the gaps between them.'
          : 'The offset welds the letters together - that is what makes the name '
            + 'one object instead of six loose pieces - and the same weld closes '
            + 'the gaps between them, so a heavy offset comes off the bed as a '
            + 'blob with a name-shaped edge. This puts the letters back on as a '
            + `mark, at the size they were drawn, without changing the piece. `
            + (p.nameMark === 'fill'
              ? 'Filled is what you see here: the machine scans each letter '
                + 'solid, which reads from across a room and takes far longer to '
                + 'burn than the cut does. Outline traces them instead - much '
                + 'quicker, and enough to separate one letter from the next.'
              : 'Outline traces each letter, which is quick and enough to '
                + 'separate one from the next. Filled scans them solid: darker '
                + 'and readable further off, but much longer on the machine.'))
      : null,
    plate && p.plateText === 'cut'
      ? h('p', { class: 'hint' },
        'Cut through, the letters become holes and their middles - the inside '
        + 'of an o, the eye of an e - drop out of the sheet. What is left '
        + 'holding the plate together is the rib between one letter and the '
        + 'next, so this wants a heavy face on a big plate. The narrowest '
        + 'measurement below is the one to watch.')
      : null,
    plate && (p.body === 'rounded' || p.body === 'tag')
      ? numberRow('Corner radius (mm)', p.corner, {
        min: 0, max: 20, step: 0.5,
        onInput: (v) => { setParam('corner', v); ctx.refresh(); },
      })
      : null,
    plate
      ? h('div', { class: 'field' },
        h('label', {}, 'Border'),
        seg(BORDER_STYLES, p.border, (id) => { setParam('border', id); ctx.refresh(); }))
      : null,
    plate && p.border === 'line'
      ? numberRow('Border inset (mm)', p.borderInset, {
        min: 0.5, max: 12, step: 0.1,
        onInput: (v) => { setParam('borderInset', v); ctx.refresh(); },
      })
      : null,
    plate && p.border === 'line'
      ? h('p', { class: 'hint' },
        'An engraved line following the edge. It costs nothing in strength - '
        + 'it is a burn, not a cut - and it is what makes a plain blank look '
        + 'like it was designed rather than merely cut out.')
      : null));

  root.append(group('Typeface', true,
    ...facePicker(ctx),
    strokeFace
      ? numberRow('Line weight (mm)', p.weight, {
        min: 1, max: 14, step: 0.1,
        onInput: (v) => { setParam('weight', v); ctx.refresh(); },
      })
      : null,
    strokeFace
      ? h('p', { class: 'hint' },
        'A single-line face is a skeleton - one line down the middle of every '
        + 'stroke, with no width of its own. This is the width it is drawn at.')
      : null));

  // ---- the offset, and what it decides -------------------------------------
  const thin = d.neck > 0 && d.neck < MIN_NECK;
  root.append(group(plate ? 'Margin and strength' : 'Offset and strength', true,
    numberRow(plate ? 'Margin around the name (mm)' : 'Offset around the letters (mm)',
      p.outline, {
        min: plate ? 1 : 0, max: 20, step: 0.1,
        onInput: (v) => { setParam('outline', v); ctx.refresh(); },
      }),
    h('p', { class: 'hint' },
      plate
        ? 'How much plain material sits between the lettering and the edge of '
          + 'the plate. It sets how big the plate is, because the length is '
          + 'fixed and the lettering shrinks to leave room for it.'
        : 'This is the whole trick. The offset grows the letters in every '
          + 'direction at once, which welds neighbours into each other and then '
          + 'runs on outwards to become the edge of the piece. Too little and '
          + 'you get loose letters; too much and the name closes up into a blob.'),
    stat('Narrowest part', d.neck > 0 ? `${rnd(d.neck, 1)} mm` : '-', thin),
    thin
      ? h('p', { class: 'warn' },
        `Under ${MIN_NECK} mm it snaps in a pocket. The preview rings the spot.`)
      : null,
    !plate
      ? h('div', { class: 'field' },
        h('label', {}, 'Anything left floating'),
        seg([['auto', 'Bridge it'], ['none', 'Leave it']], p.connect,
          (id) => { setParam('connect', id); ctx.refresh(); }))
      : null,
    !plate && p.connect !== 'none'
      ? numberRow('Bridge width (mm)', p.bridge, {
        min: 0.4, max: 6, step: 0.1,
        onInput: (v) => { setParam('bridge', v); ctx.refresh(); },
      })
      : null,
    !plate
      ? h('p', { class: 'hint' },
        'The dot on an i has nothing holding it. Where the offset does not '
        + 'reach it, a bridge does - but a row of little connectors looks like '
        + `what it is, so raise the offset first.${d.bridges ? ` ${d.bridges} here.` : ''}`)
      : null));

  // ---- the ring ------------------------------------------------------------
  const wallBad = d.holeAt && d.wall < MIN_WALL - 0.05;
  root.append(group('Split ring', true,
    numberRow('Hole (mm)', p.holeD, {
      min: 1.5, max: 12, step: 0.1,
      onInput: (v) => { setParam('holeD', v); ctx.refresh(); },
    }),
    h('div', { class: 'field' },
      h('label', {}, 'Which end'),
      seg(HOLE_ENDS, p.holeEnd, (id) => { setParam('holeEnd', id); ctx.refresh(); })),
    numberRow('How far in (mm)', p.holeInset, {
      min: 1, max: 30, step: 0.1,
      onInput: (v) => { setParam('holeInset', v); ctx.refresh(); },
    }),
    !plate
      ? h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          ...(p.holeTab ? { checked: true } : {}),
          onchange: (e) => { setParam('holeTab', e.target.checked); ctx.refresh(); },
        }),
        ' Grow a lug around the hole')
      : null,
    stat('Material round the hole', d.holeAt ? `${rnd(d.wall, 1)} mm` : '-', wallBad),
    h('p', { class: 'hint' },
      plate
        ? 'The plate is drawn around the hole rather than the hole placed in '
          + `the plate, so it always keeps at least ${MIN_WALL} mm of material `
          + 'round the ring - which is where a keychain tears, every time.'
        : (p.holeTab
          ? 'The lug is a disc welded on under the hole, so the ring always has '
            + 'a full wall of material round it however thin the letter above it '
            + 'is. It cannot sit closer to the end than its own radius, so the '
            + 'distance below stops there.'
          : 'Without the lug the hole is punched straight through whatever '
            + 'letter is at that end, and how much is left round it depends '
            + `entirely on the letter. ${MIN_WALL} mm is the least it wants.`)),
    h('p', { class: 'hint' },
      '2.5 mm suits a thin split ring or a jump ring, and is what this tool '
      + 'now starts on. A standard 20 mm split ring needs about 4 mm, and a '
      + 'lanyard clip about 5 - so if you are threading the ring that comes in '
      + 'a bag of a hundred, put this back up. The hole comes out to size '
      + 'either way: it is cut a beam-width under, so the finished hole is the '
      + 'number you typed.')));

  // ---- material ------------------------------------------------------------
  const mat = material();
  const matSel = h('select', {
    'aria-label': 'Sheet',
    onchange: (e) => { setMaterial(e.target.value); ctx.refresh(); },
  }, MATERIALS.map((m) => h('option', {
    value: m.id, ...(m.id === state.material ? { selected: true } : {}),
  }, m.id === 'custom' ? m.name : `${m.name} (${m.t} mm)`)));

  root.append(group('Material', false,
    h('div', { class: 'field' }, h('label', {}, 'Sheet'), matSel),
    h('div', { class: 'row' },
      h('span', { class: 'swatch', style: `background:${mat.color}` }),
      h('span', { class: 'muted' },
        `${mat.name} · ${rnd(p.thickness, 2)} mm · ${rnd(p.kerf, 2)} mm kerf`)),
    numberRow('Thickness (mm)', p.thickness, {
      min: 1, max: 10, step: 0.1,
      onInput: (v) => { setBoardNumber('thickness', v); ctx.refresh(); },
    }),
    numberRow('Kerf (mm)', p.kerf, {
      min: 0, max: 1, step: 0.02,
      onInput: (v) => { setBoardNumber('kerf', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      mat.char === true
        ? 'Wood and MDF leave a burnt edge, which on a keychain is part of the '
          + 'look - but the edge also furs up with handling. Seal it, or cut it '
          + 'in acrylic if it is going to be sold.'
        : 'Cast acrylic comes off the bed with a polished edge and keeps it. '
          + 'It is the sheet to use for anything that gets carried every day. '
          + 'Choosing a sheet sets the kerf as well as the colour, because both '
          + 'are properties of the same real material.')));

  root.append(h('button', {
    class: 'link',
    type: 'button',
    onclick: () => {
      if (!confirm('Start over? This clears the name and every setting.')) return;
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

export function renderWarnings(root) {
  const r = getResult();
  const warnings = [...r.derived.warnings];
  // A typeface that did not arrive leaves the builder with nothing to build
  // from and no warning to give - it cannot tell a face that failed from one
  // still on its way, and the second is what every face is at start-up. So the
  // one place that does know says it, rather than leaving a blank stage to be
  // read as "type a name".
  if (!r.face && faceFailed(state.params.face)) {
    warnings.unshift(`The typeface "${state.params.face}" did not load, so there `
      + 'is nothing to draw. Check the connection and pick it again, or choose '
      + 'another face.');
  }
  root.replaceChildren(...warnings.map((w) => h('div', { class: 'warn-box' }, w)));
  root.hidden = !warnings.length;
}

function formatTime(s) {
  if (!Number.isFinite(s) || s <= 0) return '-';
  if (s < 60) return `${Math.ceil(s)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

// ---- dialogs --------------------------------------------------------------
export function fillExportDialog(dlg) {
  const r = getResult();
  const d = r.derived;
  const cutTime = state.speed > 0 ? d.cutLength / state.speed : 0;
  dlg.querySelector('#exportSummary').textContent =
    `One piece, ${rnd(d.width, 1)} x ${rnd(d.height, 1)} mm, in `
    + `${rnd(r.params.thickness, 1)} mm ${material().name.toLowerCase()}. `
    + `${rnd(d.cutLength / 1000, 2)} m of cutting, roughly `
    + `${formatTime(cutTime)}${d.engraveLength > 0
      ? `, plus ${rnd(d.engraveLength / 1000, 2)} m of engraving` : ''}.`;

  const key = dlg.querySelector('#layerKey');
  const rows = [[LAYERS.cut, true]];
  if (d.engraveFill) rows.push([LAYERS.engraveFill, true]);
  if (d.engraveLine) rows.push([LAYERS.engrave, true]);
  key.replaceChildren(...rows.map(([l]) => h('span', {},
    h('i', { style: `background:${l.color};border:1px solid var(--line-strong)` }),
    l.label)));

  dlg.querySelector('#exportNote').textContent = d.engraveFill || d.engraveLine
    ? 'Cut and engrave are separate layers in separate colours - assign the '
      + 'engraving first, or you will be engraving a piece that has already '
      + 'fallen through the bed. Both files carry real millimetres.'
    : 'Everything here is cut; there is nothing to engrave. Both files carry '
      + 'real millimetres, so they import at size.';

  const empty = !r.panels.length;
  dlg.querySelector('#dlSvg').disabled = empty;
  dlg.querySelector('#dlPdf').disabled = empty;
  dlg.querySelector('#dlWa').disabled = empty;
}

export function fillHelpDialog(dlg) {
  dlg.querySelector('#helpBody').replaceChildren(
    h('p', {},
      'A name keychain is one piece of sheet with a name cut out of it and a '
      + 'hole for the split ring. Everything difficult about it is in the '
      + 'words "one piece" and in the fact that it lives in a pocket.'),
    h('h3', {}, 'The offset is the tool'),
    h('p', {},
      'Set a name in any typeface and you have a row of separate letters. The '
      + 'offset grows every letter outwards in all directions at once: '
      + 'neighbours run into each other and weld, and the growth carries on '
      + 'past them to become the edge of the piece. That is the difference '
      + 'between a keychain and a bag of loose letters, and it is why there is '
      + 'no separate "thicken" control - the same number does both jobs.'),
    h('h3', {}, 'The length is a promise'),
    h('p', {},
      'You type the finished length and the lettering is solved to fit it, '
      + 'margins, ring room and kerf included. It is the wrong way round to '
      + 'pick a cap height and find out afterwards how big the thing came out, '
      + 'because nobody orders a keychain by cap height.'),
    h('h3', {}, 'Where it breaks'),
    h('p', {},
      'Two places, and both are measured before anything is cut. The ring hole '
      + `tears out through the edge - so the tool keeps at least ${MIN_WALL} mm `
      + 'of material round it, and grows a lug under it if the letter there is '
      + 'too thin to give that. And the piece snaps at its narrowest point, '
      + `which under about ${MIN_NECK} mm happens within a month. That point is `
      + 'usually not where you would guess: it is the hairline where two script '
      + 'letters just barely touched, or the rib between two cut-out letters. '
      + 'The tool finds it and rings it on the drawing.'),
    h('h3', {}, 'Cut or engraved'),
    h('p', {},
      'On a plain body the name can be cut clean through or burnt on. Engraved '
      + 'is nearly always the right answer for something carried: nothing on '
      + 'the piece is thinner than the plate itself, so there is nothing to '
      + 'snap. Cut through looks better and needs a heavy face on a big plate '
      + 'to survive.'),
    h('h3', {}, 'Materials'),
    h('p', {},
      'Three millimetres is the sensible thickness - thinner flexes and snaps, '
      + 'thicker will not sit flat in a pocket. Cast acrylic keeps its polished '
      + 'edge; wood is cheaper and the burnt edge is part of the look, but it '
      + 'furs up with handling unless it is sealed.'),
    h('h3', {}, 'Credits'),
    h('p', { class: 'hint' },
      'The controls follow Cuttle’s Keychain Generator, and the idea of a '
      + 'plain body with an engraved name and a border line comes from the '
      + 'luggage tag generators. The engine is our own: the same distance field '
      + 'that welds the lettering in our Cake Topper and Stand Nama tools. '
      + 'Every typeface is public domain, SIL Open Font License or Apache 2.0, '
      + 'listed with its licence in src/font/LICENCES.txt and src/font/'
      + 'CREDITS.txt.'));
}

export function renderActions({ undoBtn, redoBtn }) {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
}

export { rnd, formatTime };
