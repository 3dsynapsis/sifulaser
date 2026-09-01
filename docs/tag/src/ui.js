// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.

import {
  state, update, setParam, setMaterial, setSizePreset, sizePreset, getTag,
  currentPiece, decorFor, selectedObject, elementCount,
  MATERIALS, material, clampDecor, applyDesign, SIDES,
} from './store.js';
import * as gallery from './designs.js';
import {
  SHAPES, SLOTS, BORDERS, SIZE_PRESETS, SQUARE_SHAPES, fitShapeRing, ringLength,
} from './geom/tag.js';
import { ringsToPath } from './geom/path.js';
import { PROCESSES, objectRings, measureText, makeObject } from './geom/decor.js';
import { FONTS, loadFont } from './fonts.js';
import { CLIPART, clipartThumb } from './clipart.js';
import { SHEETS, layout } from './exportSvg.js';

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

// While a slider is being dragged the inspector must not be rebuilt underneath
// it: that kills the drag and resets every <details> to its default state.
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

const clamp = (v, min, max) => {
  if (Number.isNaN(v)) return min ?? 0;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
};

/** number input + slider bound to one value */
function numberRow(label, value, { min, max, step = 1, unit, onInput, slider = true }) {
  const num = h('input', {
    type: 'number', value: rnd(value, 3), min, max, step,
    onchange: (e) => {
      sliderDragging = false;
      onInput(clamp(parseFloat(e.target.value), min, max));
    },
  });
  const range = slider
    ? liveRange({
      min, max, step, value, onInput, onDisplay: (v) => { num.value = rnd(v, 3); },
    })
    : null;
  return h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { class: 'row' },
      range,
      h('div', { class: 'num', style: 'flex:0 0 92px' },
        num, unit && h('span', { class: 'unit' }, unit))));
}

function textField(label, value, onInput, { rows = 1, placeholder = '' } = {}) {
  const node = rows > 1
    ? h('textarea', { rows, placeholder, oninput: (e) => onInput(e.target.value) }, value)
    : h('input', {
      type: 'text', value, placeholder, maxlength: '80',
      oninput: (e) => onInput(e.target.value),
    });
  return h('div', { class: 'field' }, h('label', {}, label), node);
}

function segmented(options, current, onPick) {
  return h('div', { class: 'seg' }, options.map((o) =>
    h('button', {
      type: 'button', 'aria-pressed': String(o.id === current),
      title: o.hint || '',
      onclick: () => onPick(o.id),
    }, o.label)));
}

// ------------------------------------------------------------- shape cards
//
// The card art is the real outline, built by the same function that builds the
// tag. Hand-drawn thumbnails are a second drawing of the same thing, and the
// two drift: the card would go on showing a square-cornered octagon long after
// the corner radius started applying to it. This way the picture is always the
// shape you get, with your own corner radius already on it.
function shapeThumb(shape, radius) {
  const W = 46;
  const H = 62;
  const r = Math.max(0, Math.min(radius, Math.min(W, H) / 2)) * (W / 50);
  const ring = fitShapeRing(shape, W, H, r);
  // fitShapeRing works y-up; an SVG is y-down, so the group is flipped once.
  const d = ringsToPath([ring]);
  return `<svg viewBox="-3 -3 ${W + 6} ${H + 6}" aria-hidden="true">`
    + `<g transform="translate(0 ${H}) scale(1 -1)">`
    + `<path d="${d}" fill="currentColor" fill-opacity="0.12" `
    + 'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'
    + '</g></svg>';
}

// ------------------------------------------------------------------ gallery
const galleryStore = {
  name: () => state.name,
  params: () => ({ ...state.params }),
  material: () => state.material,
  extra: () => ({ decor: state.decor }),
  rename: (name) => update((s) => { s.name = name; }, { history: false }),
  apply: (row) => applyDesign(row),
};

/** Save without asking - used on the way out of Export. */
export const saveQuietly = () => gallery.saveQuietly(galleryStore);

/** Open a saved design by id, for arrivals from another tool. */
export const openDesignById = (id) => gallery.openById(galleryStore, id);

const dialogFiller = (build) => function fill(dlg, ctx) {
  const close = () => dlg.close();
  const again = () => fill(dlg, ctx);
  dlg.replaceChildren(build(h, galleryStore, () => { close(); ctx.refresh(); }, again));
};

export const fillSaveDialog = dialogFiller(gallery.saveDialogBody);
export const fillFilesDialog = dialogFiller(gallery.filesDialogBody);

// ---------------------------------------------------------------- side bar
export function renderSides(root, onPick) {
  root.replaceChildren(...SIDES.map((id) => h('button', {
    class: 'face', type: 'button', 'aria-pressed': String(state.side === id),
    onclick: () => onPick(id),
  },
  h('span', { class: 'face-ico', html: sideIcon(id) }),
  id === 'front' ? 'Front' : 'Back')));
}

const sideIcon = (id) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="1.6" stroke-linejoin="round">'
  + '<path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>'
  + '<rect x="10" y="5.5" width="4" height="2" rx="1"/>'
  + (id === 'front'
    ? '<path d="M8 14h8"/>'
    : '<path d="M8 12h8M8 15h8M8 18h5"/>')
  + '</svg>';

// -------------------------------------------------------------- inspector
export function renderInspector(root, ctx) {
  if (sliderDragging) return; // the live control stays put until the drag ends
  root.replaceChildren();
  const obj = selectedObject();
  root.append(h('h2', { class: 'insp-title' }, obj ? labelFor(obj) : 'The tag'));
  if (obj) objectInspector(root, obj, ctx);
  else overallInspector(root, ctx);
}

const labelFor = (o) => ({
  text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', star: 'Star',
  polygon: 'Polygon', svg: 'Artwork',
}[o.type] || 'Object');

// Which sections the user left open survives a re-render.
const groupOpen = new Map();

function group(title, open, ...body) {
  const isOpen = groupOpen.has(title) ? groupOpen.get(title) : open;
  const node = h('details', { class: 'group', ...(isOpen ? { open: true } : {}) },
    h('summary', {}, title),
    h('div', { class: 'group-body' }, ...body));
  node.addEventListener('toggle', () => groupOpen.set(title, node.open));
  return node;
}

function overallInspector(root, ctx) {
  const p = state.params;
  const t = getTag();
  const d = t.derived;
  const set = (key, v) => { setParam(key, v); clampDecor(); ctx.refresh(); };

  // ---- shape ----
  root.append(group('Shape', true,
    h('div', { class: 'cards cards-6' }, SHAPES.map((s) =>
      h('button', {
        class: 'card', type: 'button', 'aria-pressed': String(p.shape === s.id),
        title: s.hint,
        onclick: () => set('shape', s.id),
      },
      h('span', { class: 'art', html: shapeThumb(s.id, p.radius) }),
      s.name))),
    SQUARE_SHAPES.includes(p.shape)
      ? h('p', { class: 'hint' }, 'Height follows the width on this shape. '
        + 'Stretched, it stops being the shape you picked.')
      : null));

  // ---- size ----
  root.append(group('Size', true,
    segmented([
      ...SIZE_PRESETS.map((s) => ({ id: s.id, label: s.name, hint: `${s.w} x ${s.h} mm` })),
      { id: 'custom', label: 'Custom' },
    ], sizePreset(), (id) => { if (id !== 'custom') { setSizePreset(id); clampDecor(); ctx.refresh(); } }),
    numberRow('Width (mm)', p.width, {
      min: 15, max: 200, step: 1, onInput: (v) => set('width', v),
    }),
    SQUARE_SHAPES.includes(p.shape)
      ? null
      : numberRow('Height (mm)', p.height, {
        min: 15, max: 250, step: 1, onInput: (v) => set('height', v),
      }),
    numberRow('Corner radius (mm)', p.radius, {
      min: 0, max: Math.min(p.width, p.height) / 2, step: 0.5,
      onInput: (v) => set('radius', v),
    }),
    p.shape === 'circle' || p.shape === 'heart'
      ? h('p', { class: 'hint' }, 'This shape is already all curves, so the '
        + 'radius does nothing to it.')
      : null));

  // ---- slot ----
  root.append(group('Strap slot', true,
    segmented(SLOTS.map((s) => ({ id: s.id, label: s.name, hint: s.hint })),
      p.slot, (id) => set('slot', id)),
    p.slot === 'none' ? null : numberRow(
      p.slot === 'circle' ? 'Diameter (mm)' : 'Opening height (mm)', p.slotH, {
        min: 1, max: Math.max(2, p.height / 3), step: 0.5,
        onInput: (v) => set('slotH', v),
      }),
    p.slot === 'none' || p.slot === 'circle' ? null : numberRow('Slot width (mm)', p.slotW, {
      min: p.slotH, max: Math.max(p.slotH, p.width), step: 0.5,
      onInput: (v) => set('slotW', v),
    }),
    p.slot === 'none' ? null : numberRow('Down from the top (mm)', p.slotEdge, {
      min: 0, max: Math.max(1, p.height - p.slotH), step: 0.5,
      onInput: (v) => set('slotEdge', v),
    }),
    // The fix button, next to the number it changes. A warning that names a
    // measurement and then makes you go and type it is half a warning.
    d.slotFix != null
      ? h('button', {
        class: 'ghost wide', type: 'button',
        onclick: () => set('slotEdge', d.slotFix),
      }, `Move it to ${d.slotFix} mm, where it fits`)
      : null,
    d.bridge != null
      ? h('div', { class: 'stat' },
        h('span', {}, 'Board around the slot'),
        h('b', { class: d.bridge < 2 ? 'bad' : '' }, `${rnd(d.bridge, 1)} mm`))
      : null));

  // ---- border ----
  root.append(group('Border', false,
    segmented(BORDERS.map((b) => ({ id: b.id, label: b.name })),
      p.border, (id) => set('border', id)),
    p.border === 'none' ? null : numberRow('Inset from the edge (mm)', p.borderInset, {
      min: 0.5, max: Math.max(1, Math.min(p.width, p.height) / 3), step: 0.5,
      onInput: (v) => set('borderInset', v),
    }),
    p.border === 'double' ? numberRow('Gap between the lines (mm)', p.borderGap, {
      min: 0.3, max: 6, step: 0.1, onInput: (v) => set('borderGap', v),
    }) : null,
    h('p', { class: 'hint' }, 'The border is engraved, not cut, and the text is '
      + 'kept inside it.')));

  // ---- front ----
  root.append(group('Front - the name', true,
    textField('Name', p.frontLines, (v) => set('frontLines', v),
      { rows: 2, placeholder: 'One line per row' }),
    numberRow('Text height (mm)', p.frontCap, {
      min: 2, max: 30, step: 0.5, onInput: (v) => set('frontCap', v),
    }),
    numberRow('Nudge up / down (mm)', p.frontNudge, {
      min: -30, max: 30, step: 0.5, onInput: (v) => set('frontNudge', v),
    }),
    d.frontCapUsed && d.frontCapUsed < p.frontCap - 0.05
      ? h('p', { class: 'hint' }, `Set at ${rnd(d.frontCapUsed, 1)} mm so it fits `
        + 'the space; shorten the line or widen the tag for more.')
      : null));

  // ---- back ----
  root.append(group('Back - if found', true,
    textField('Heading', p.backHeading, (v) => set('backHeading', v)),
    textField('Name', p.backName, (v) => set('backName', v)),
    textField('Phone', p.backPhone, (v) => set('backPhone', v),
      { placeholder: '+60 12-345 6789' }),
    textField('Address', p.backAddress, (v) => set('backAddress', v),
      { rows: 3, placeholder: 'One line per row' }),
    numberRow('Text height (mm)', p.backCap, {
      min: 1.5, max: 12, step: 0.25, onInput: (v) => set('backCap', v),
    }),
    numberRow('Nudge up / down (mm)', p.backNudge, {
      min: -30, max: 30, step: 0.5, onInput: (v) => set('backNudge', v),
    }),
    h('p', { class: 'hint' }, 'Engraved as single lines, one pass per stroke - '
      + 'which is why a phone number stays readable down at 3 mm.')));

  // ---- material ----
  const mat = material();
  root.append(group('Material', false,
    h('div', { class: 'field' },
      h('label', {}, 'Board'),
      h('select', {
        onchange: (e) => { setMaterial(e.target.value); ctx.refresh(); },
      }, MATERIALS.map((m) => h('option', {
        value: m.id, ...(m.id === state.material ? { selected: true } : {}),
      }, m.id === 'custom' ? m.name : `${m.name} ${m.t} mm`)))),
    numberRow('Thickness (mm)', p.thickness, {
      min: 0.5, max: 12, step: 0.1,
      onInput: (v) => { setParam('thickness', v); ctx.refresh(); },
    }),
    numberRow('Kerf (mm)', p.kerf, {
      min: 0, max: 1, step: 0.01,
      onInput: (v) => { setParam('kerf', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' }, 'Kerf is already in the exported paths - the '
      + 'outline is grown by half of it and the slot shrunk by half, so the '
      + 'finished tag is the size on screen.'),
    state.material !== 'custom'
      ? h('p', { class: 'hint' }, `Changing the board resets these to ${mat.t} mm `
        + `and ${mat.kerf} mm. Pick Custom material to keep your own.`)
      : null));

  // ---- summary ----
  root.append(group('Numbers', true, ...summaryRows(ctx)));
}

function summaryRows(ctx) {
  const t = getTag();
  const d = t.derived;
  const sheets = layout(t, { sheet: state.sheet, labels: state.showLabels });
  const sheet = sheets[0];
  const decorCut = t.pieces.reduce((sum, pc) => sum + decorFor(pc)
    .reduce((n, o) => n + objectRings(o)
      .reduce((m, r) => m + ringLength(r), 0), 0), 0);

  return [
    h('div', { class: 'stat' },
      h('span', {}, 'One piece'),
      h('b', {}, `${rnd(d.pieceW, 1)} x ${rnd(d.pieceH, 1)} mm`)),
    h('div', { class: 'stat' },
      h('span', {}, sheets.length > 1 ? `Layout (${sheets.length} sheets)` : 'Whole layout'),
      h('b', {}, `${rnd(sheet.w, 1)} x ${rnd(sheet.h, 1)} mm`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Pieces'),
      h('b', {}, `${d.pieceCount} - one front, one back`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Placed elements'),
      h('b', {}, String(elementCount()))),
    h('div', { class: 'stat' },
      h('span', {}, 'Cut length'),
      h('b', {}, `${rnd((d.cutLength + decorCut) / 10, 1)} cm`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Engraved line'),
      h('b', {}, `${rnd(d.lineLength / 10, 1)} cm`)),
    ...d.warnings.map((w) => h('p', { class: 'warn-line' }, w)),
    ...d.notes.map((n) => h('p', { class: 'hint' }, n)),
    h('p', { class: 'hint' }, 'Both pieces are cut face up and glued back to '
      + 'back. Every shape here is symmetric and the slot is on the centre line, '
      + 'so the back needs no mirroring - flip it over and it still lines up.'),
  ];
}

// ------------------------------------------------------- object inspector
function objectInspector(root, obj, ctx) {
  const piece = currentPiece();
  const find = (s) => s.decor[state.side].find((o) => o.id === obj.id);
  const set = (patch) => {
    update((s) => { Object.assign(find(s), patch); });
    ctx.refresh();
  };

  root.append(group('Laser Settings', true,
    h('div', { class: 'field' },
      h('label', {}, 'Process type'),
      segmented(PROCESSES.map((pr) => ({ id: pr.id, label: pr.label, hint: pr.hint })),
        obj.process, (id) => set({ process: id }))),
    h('div', { class: 'field' },
      h('label', {}, `Power ${Math.round(obj.power * 100)}%`),
      liveRange({
        min: 0.05, max: 1, step: 0.05, value: obj.power,
        onInput: (v) => set({ power: v }),
      }),
      h('div', { class: 'tick-labels' }, ['Low', 'Medium', 'High'].map((x) => h('span', {}, x)))),
    obj.process === 'cut'
      ? h('p', { class: 'hint' }, 'A cut object becomes a real hole through the '
        + 'tag, with the kerf taken off it the same way the strap slot is.')
      : null));

  const attrs = [];
  // Text objects carry their own measured bounds, so every edit that changes the
  // shape of the words has to remeasure. Skipping it leaves the selection box
  // and the drag handles around where the old text used to be.
  const remeasure = (patch, keepFocus) => {
    update((s) => {
      const target = find(s);
      Object.assign(target, patch);
      const m = measureText(target);
      target.w = m.w || target.w;
      target.h = m.h || target.h;
    }, { history: false });
    ctx.refresh(keepFocus ? { keepFocus } : {});
  };

  if (obj.type === 'text') {
    attrs.push(h('div', { class: 'field' },
      h('label', {}, 'Text'),
      h('textarea', {
        oninput: (e) => remeasure({ text: e.target.value }, e.target),
      }, obj.text)));
    attrs.push(h('div', { class: 'field' },
      h('label', {}, 'Font'),
      h('select', {
        onchange: async (e) => {
          await loadFont(e.target.value);
          remeasure({ font: e.target.value });
        },
      }, FONTS.map((f) => h('option', {
        value: f.id, ...(f.id === obj.font ? { selected: true } : {}),
      }, f.name)))));
    attrs.push(numberRow('Size (mm)', obj.size, {
      min: 2, max: 120, step: 0.5, onInput: (v) => remeasure({ size: v }),
    }));
    attrs.push(numberRow('Letter spacing (mm)', obj.letterSpacing || 0, {
      min: -2, max: 10, step: 0.1, onInput: (v) => remeasure({ letterSpacing: v }),
    }));
  }
  if (obj.type === 'rect') {
    attrs.push(numberRow('Corner radius (mm)', obj.radius || 0, {
      min: 0, max: Math.min(obj.w, obj.h) / 2, step: 0.5,
      onInput: (v) => set({ radius: v }),
    }));
  }
  if (obj.type === 'star') {
    attrs.push(numberRow('Points', obj.points, {
      min: 3, max: 16, step: 1, onInput: (v) => set({ points: Math.round(v) }),
    }));
    attrs.push(numberRow('Inner radius', obj.inner, {
      min: 0.1, max: 0.9, step: 0.05, onInput: (v) => set({ inner: v }),
    }));
  }
  if (obj.type === 'polygon') {
    attrs.push(numberRow('Sides', obj.sides, {
      min: 3, max: 16, step: 1, onInput: (v) => set({ sides: Math.round(v) }),
    }));
  }

  attrs.push(h('div', { class: 'row' },
    h('div', { class: 'field', style: 'flex:1' },
      h('label', {}, 'Width (mm)'),
      h('input', {
        type: 'number', value: rnd(obj.w), step: 0.5, min: 0.5,
        onchange: (e) => set({ w: Math.max(0.5, parseFloat(e.target.value)) }),
      })),
    h('div', { class: 'field', style: 'flex:1' },
      h('label', {}, 'Height (mm)'),
      h('input', {
        type: 'number', value: rnd(obj.h), step: 0.5, min: 0.5,
        onchange: (e) => set({ h: Math.max(0.5, parseFloat(e.target.value)) }),
      }))));
  attrs.push(h('div', { class: 'row' },
    h('div', { class: 'field', style: 'flex:1' },
      h('label', {}, 'X (mm)'),
      h('input', {
        type: 'number', value: rnd(obj.x), step: 0.5,
        onchange: (e) => set({ x: parseFloat(e.target.value) }),
      })),
    h('div', { class: 'field', style: 'flex:1' },
      h('label', {}, 'Y (mm)'),
      h('input', {
        type: 'number', value: rnd(obj.y), step: 0.5,
        onchange: (e) => set({ y: parseFloat(e.target.value) }),
      }))));
  attrs.push(numberRow('Rotation (deg)', obj.rot || 0, {
    min: 0, max: 359, step: 1, onInput: (v) => set({ rot: v }),
  }));
  attrs.push(h('div', { class: 'row' },
    h('button', {
      class: 'ghost', style: 'flex:1', type: 'button',
      onclick: () => set({ x: piece.size.w / 2 - obj.w / 2 }),
    }, 'Centre H'),
    h('button', {
      class: 'ghost', style: 'flex:1', type: 'button',
      onclick: () => set({ y: piece.size.h / 2 - obj.h / 2 }),
    }, 'Centre V')));

  root.append(group('Attribute', true, ...attrs));

  root.append(group('Arrange', false,
    h('div', { class: 'row' },
      h('button', {
        class: 'ghost', style: 'flex:1', type: 'button',
        onclick: () => {
          update((s) => {
            const copy = {
              ...obj, id: makeObject(obj.type, piece).id, x: obj.x + 4, y: obj.y - 4,
            };
            s.decor[state.side].push(copy);
            s.selection = copy.id;
          });
          ctx.refresh();
        },
      }, 'Duplicate'),
      h('button', {
        class: 'ghost', style: 'flex:1', type: 'button',
        onclick: () => {
          update((s) => {
            const list = s.decor[state.side];
            const i = list.findIndex((o) => o.id === obj.id);
            list.push(list.splice(i, 1)[0]);
          });
          ctx.refresh();
        },
      }, 'Bring to front')),
    // Moving artwork to the other side rather than deleting and redrawing it.
    // A monogram belongs on the front and a "fragile" mark on the back, and
    // finding that out after placing it is the normal way round.
    h('button', {
      class: 'ghost wide', type: 'button',
      onclick: () => {
        const other = state.side === 'front' ? 'back' : 'front';
        update((s) => {
          const list = s.decor[state.side];
          const i = list.findIndex((o) => o.id === obj.id);
          if (i >= 0) s.decor[other].push(list.splice(i, 1)[0]);
          s.selection = null;
        });
        ctx.refresh();
      },
    }, state.side === 'front' ? 'Move to the back' : 'Move to the front'),
    h('button', {
      class: 'ghost wide', type: 'button', style: 'color:var(--danger)',
      onclick: () => ctx.deleteSelected(),
    }, 'Delete object')));
}

// ------------------------------------------------------------- popovers
const SHAPE_TOOLS = [
  ['ellipse', '◯', 'Ellipse'],
  ['star', '★', 'Star'],
  ['polygon', '⬟', 'Polygon'],
  ['rect', '▭', 'Rectangle'],
];

export function openPopover(anchor, node, popEl) {
  popEl.replaceChildren(node);
  popEl.hidden = false;
  const r = anchor.getBoundingClientRect();
  popEl.style.left = `${r.right + 8}px`;
  popEl.style.top = `${Math.min(r.top, window.innerHeight - popEl.offsetHeight - 12)}px`;
  const close = (e) => {
    if (popEl.contains(e.target) || anchor.contains(e.target)) return;
    popEl.hidden = true;
    document.removeEventListener('pointerdown', close);
  };
  setTimeout(() => document.addEventListener('pointerdown', close));
}

export function shapeMenu(onPick) {
  return h('div', {},
    h('div', { class: 'pop-title' }, 'Shape'),
    h('div', { class: 'shape-list' }, SHAPE_TOOLS.map(([id, icon, label]) =>
      h('button', { type: 'button', onclick: () => onPick(id) },
        h('span', { style: 'font-size:16px;width:20px' }, icon), label))));
}

export function clipartMenu(onPick) {
  const grid = h('div', { class: 'clip-grid' }, CLIPART.map((c) =>
    h('button', {
      type: 'button', title: c.name, onclick: () => onPick(c.id),
    }, h('span', { class: 'clip-art', html: clipartThumb(c) }))));
  const search = h('input', {
    type: 'text', placeholder: 'Filter…',
    oninput: (e) => {
      const q = e.target.value.trim().toLowerCase();
      grid.replaceChildren(...CLIPART
        .filter((c) => !q || c.name.toLowerCase().includes(q))
        .map((c) => h('button', {
          type: 'button', title: c.name, onclick: () => onPick(c.id),
        }, h('span', { class: 'clip-art', html: clipartThumb(c) }))));
    },
  });
  return h('div', {},
    h('div', { class: 'pop-title' }, 'Graphics'),
    search,
    grid,
    h('p', { class: 'hint' }, 'Drawn for this tool, released CC0.'));
}

export function importMenu(onFile) {
  const input = h('input', {
    type: 'file', accept: '.svg,image/svg+xml', style: 'display:none',
    onchange: (e) => e.target.files[0] && onFile(e.target.files[0]),
  });
  const drop = h('div', {
    class: 'drop',
    ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); },
    ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    onclick: () => input.click(),
  }, 'Drop an SVG here', h('br'),
  h('span', { class: 'muted' }, 'or click to browse · max 10 MB'));
  return h('div', {},
    h('div', { class: 'pop-title' }, 'Import SVG'),
    drop,
    input,
    // Said before the file picker opens rather than after the file is refused.
    h('p', { class: 'hint' }, 'Vector only. A PNG or a photo has no paths in '
      + 'it for a laser to follow, and tracing one is a job for a different '
      + 'tool - so it would arrive as a thousand-node smudge rather than a cut.'));
}

// --------------------------------------------------------------- dialogs
export function fillExportDialog(dlg) {
  const t = getTag();
  const d = t.derived;
  const sel = dlg.querySelector('#sheetSel');
  sel.replaceChildren(...SHEETS.map((s) => h('option', {
    value: s.id, ...(s.id === state.sheet ? { selected: true } : {}),
  }, s.w ? `${s.w} × ${s.h} mm` : s.name)));
  sel.onchange = (e) => {
    update((s) => { s.sheet = e.target.value; }, { history: false });
    fillExportDialog(dlg);
  };

  const chk = dlg.querySelector('#labelsChk');
  chk.checked = state.showLabels;
  chk.onchange = (e) => update((s) => { s.showLabels = e.target.checked; },
    { history: false });

  const sheets = layout(t, { sheet: state.sheet, labels: state.showLabels });
  dlg.querySelector('#exportSummary').textContent =
    `Front and back · ${rnd(d.pieceW, 1)} × ${rnd(d.pieceH, 1)} mm each · `
    + `${rnd(sheets[0].w, 1)} × ${rnd(sheets[0].h, 1)} mm of board · `
    + `${t.params.thickness} mm stock`;

  const bad = d.warnings.length;
  dlg.querySelector('#exportNote').textContent =
    `Kerf ${t.params.kerf} mm is already in the paths — cut as-is. `
    + 'Both pieces are cut face up and glued back to back.'
    + (bad ? ` ${bad} thing${bad === 1 ? '' : 's'} worth reading in the panel `
      + 'before you burn a sheet.' : '');
  dlg.querySelector('#exportNote').className = bad ? 'note warn-line' : 'note';
}

const STEPS = [
  ['Cut both pieces', 'The file holds a front and a back. They are the same '
    + 'outline, so the FRONT / BACK marks under each one are the only thing '
    + 'telling them apart — read them before you lift anything off the bed.'],
  ['Delete the grey layer first', 'Those marks are there to sort the pieces on '
    + 'screen, not to be burnt into them. Turn the labels layer off in your '
    + 'laser software, or untick it here before exporting.'],
  ['Clean the edges', 'Wipe the soot off both faces. Glue does not stick to soot.'],
  ['Glue back to back', 'Engraved faces outwards, slots lined up. A thin even '
    + 'coat of wood glue or a few drops of CA, then clamp it flat under a book '
    + 'until it is dry — a tag that dries curled will not sit against a bag.'],
  ['Thread the strap', 'Through both slots at once. If the strap will not pass, '
    + 'the slot was cut narrower than the strap, not the other way round.'],
];

export function fillAssembleDialog(dlg) {
  dlg.querySelector('#assembleSteps').replaceChildren(...STEPS.map(([t, d]) =>
    h('li', {}, t, h('br'), h('span', {}, d))));
}

export { rnd };
