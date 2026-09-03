// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.

import {
  state, update, setParam, getBox, currentPanel, decorFor, selectedObject,
  MATERIALS, material, canUndo, canRedo, clampDecor, reset, applyDesign,
} from './store.js';
import * as gallery from './designs.js';
import { PANEL_LABELS, SCREW } from './geom/box.js';
import { makeObject, PROCESSES, objectRings, measureText } from './geom/decor.js';
import { FONTS, loadFont } from './fonts.js';
import { SHEETS } from './exportSvg.js';

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

// While a slider is being dragged the inspector must not be rebuilt underneath it:
// that kills the drag and resets every <details> to its default state.
let sliderDragging = false;

/** A range input that holds the inspector still while it is being dragged. */
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
    ? liveRange({ min, max, step, value, onInput, onDisplay: (v) => { num.value = rnd(v, 3); } })
    : null;
  const wrap = h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { class: 'row' },
      range,
      h('div', { class: 'num', style: 'flex:0 0 92px' }, num, unit && h('span', { class: 'unit' }, unit)),
    ));
  return wrap;
}

const clamp = (v, min, max) => {
  if (Number.isNaN(v)) return min ?? 0;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
};

function segmented(options, current, onPick) {
  return h('div', { class: 'seg' }, options.map((o) =>
    h('button', {
      type: 'button', 'aria-pressed': String(o.id === current),
      title: o.hint || '',
      onclick: () => onPick(o.id),
    }, o.label)));
}

// ---- box-style thumbnails -------------------------------------------------
// Isometric illustration built from the same box the app makes, tinted with the
// material you picked so the two cards preview the real thing.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return `#${ch.map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

const P = (pts) => pts.map((p) => p.join(',')).join(' ');
const shift = (p, dx, dy) => [p[0] + dx, p[1] + dy];

function boxThumb(style, base) {
  const c = {
    lid: shade(base, 0.26),
    rim: shade(base, 0.14),
    left: shade(base, -0.04),
    right: shade(base, -0.3),
    inner: shade(base, -0.46),
    innerB: shade(base, -0.36),
    floor: shade(base, -0.16),
    edge: shade(base, -0.62),
  };

  // top rim diamond, its inner opening, and the floor sitting below it
  const T = [48, 26]; const R = [80, 40]; const F = [48, 54]; const L = [16, 40];
  const H = 16;
  const Rb = shift(R, 0, H); const Fb = shift(F, 0, H); const Lb = shift(L, 0, H);
  const iT = [48, 28.6]; const iR = [74, 40]; const iF = [48, 51.4]; const iL = [22, 40];
  const D = 11;
  const fT = shift(iT, 0, D); const fR = shift(iR, 0, D);
  const fL = shift(iL, 0, D); const fF = shift(iF, 0, D);

  // floor mortises punched through the two faces we can see
  const dashL = (u, drop) => {
    const p = [L[0] + (F[0] - L[0]) * u, L[1] + (F[1] - L[1]) * u + drop];
    return P([p, shift(p, 5.5, 2.4), shift(p, 5.5, 4.8), shift(p, 0, 2.4)]);
  };
  const dashR = (u, drop) => {
    const p = [F[0] + (R[0] - F[0]) * u, F[1] + (R[1] - F[1]) * u + drop];
    return P([p, shift(p, 5.5, -2.4), shift(p, 5.5, 0), shift(p, 0, 2.4)]);
  };

  /** A leaf hinged on edge p->q, tilted open along d. */
  const leaf = (p1, q1, d) => {
    const a = shift(p1, d[0], d[1]);
    const b = shift(q1, d[0], d[1]);
    return `<polygon points="${P([p1, q1, b, a])}" fill="${c.lid}"/>` +
      `<polygon points="${P([a, b, shift(b, 0, 2.6), shift(a, 0, 2.6)])}" fill="${c.right}"/>` +
      `<polygon points="${P([p1, q1, b, a])}" fill="none" stroke="${c.edge}" ` +
      `stroke-width=".9" stroke-linejoin="round"/>`;
  };

  // Lift-off: a second tray, drawn hovering clear of the first. Everything the
  // style is about is in the gap, so the gap is what the card shows.
  const liftOff = style === 'shoebox' ? (() => {
    const S = 1.06; const UP = 22; const D = 6;
    const q = (pt) => [48 + (pt[0] - 48) * S, 40 + (pt[1] - 40) * S - UP];
    const lT = q(T); const lR = q(R); const lF = q(F); const lL = q(L);
    const lRb = shift(lR, 0, D); const lFb = shift(lF, 0, D); const lLb = shift(lL, 0, D);
    // The thumb notch sits on the face you would actually lift from, so it has
    // to follow that face's slope rather than sit level.
    const mx = (lLb[0] + lFb[0]) / 2; const my = (lLb[1] + lFb[1]) / 2;
    const deg = Math.atan2(lFb[1] - lLb[1], lFb[0] - lLb[0]) * 180 / Math.PI;
    return `<polygon points="${P([lL, lF, lFb, lLb])}" fill="${c.left}"/>` +
      `<polygon points="${P([lF, lR, lRb, lFb])}" fill="${c.right}"/>` +
      `<polygon points="${P([lT, lR, lF, lL])}" fill="${c.lid}"/>` +
      `<path d="M-3.4 0a3.4 3.4 0 0 0 6.8 0Z" fill="${c.edge}" opacity=".45" ` +
      `transform="translate(${mx} ${my}) rotate(${deg})"/>` +
      `<g fill="none" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round" opacity=".85">` +
      `<path d="M${P([lL, lF, lFb, lLb])}Z"/><path d="M${P([lF, lR, lRb, lFb])}Z"/>` +
      `<path d="M${P([lT, lR, lF, lL])}Z"/></g>`;
  })() : '';

  const lid = style === 'lidded'
    ? leaf(L, T, [-3, -21]) +
      `<circle cx="${T[0] - 5}" cy="${T[1] - 2}" r="1.7" fill="${c.edge}" opacity=".55"/>`
    : '';
  // Double: two leaves lean apart from the middle, each on its own wall.
  const leafBack = style === 'double' ? leaf(T, R, [11, -14]) : '';
  const leafFront = style === 'double' ? leaf(F, L, [-11, -14]) : '';

  return `<svg viewBox="0 0 96 74" aria-hidden="true">
  ${lid}
  ${leafBack}
  <polygon points="${P([iL, iT, fT, fL])}" fill="${c.inner}"/>
  <polygon points="${P([iT, iR, fR, fT])}" fill="${c.innerB}"/>
  <polygon points="${P([fT, fR, fF, fL])}" fill="${c.floor}"/>
  <path d="M${P([T, R, F, L])}Z M${P([iT, iR, iF, iL])}Z" fill="${c.rim}" fill-rule="evenodd"/>
  <polygon points="${P([L, F, Fb, Lb])}" fill="${c.left}"/>
  <polygon points="${P([F, R, Rb, Fb])}" fill="${c.right}"/>
  <g fill="${c.edge}" opacity=".5">
    <polygon points="${dashL(0.26, 11)}"/><polygon points="${dashL(0.62, 11)}"/>
    <polygon points="${dashR(0.16, 11)}"/><polygon points="${dashR(0.52, 11)}"/>
  </g>
  <g fill="none" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round" opacity=".8">
    <path d="M${P([L, F, Fb, Lb])}Z"/><path d="M${P([F, R, Rb, Fb])}Z"/>
    <path d="M${P([T, R, F, L])}Z"/><path d="M${P([iT, iR, iF, iL])}Z"/>
  </g>
  ${leafFront}
  ${liftOff}
</svg>`;
}

/**
 * Card art for the divider choice: the same open box, looked into from above,
 * with the interior panels standing in it.
 */
function dividerThumb(count, base) {
  const c = {
    rim: shade(base, 0.14),
    inner: shade(base, -0.46),
    innerB: shade(base, -0.36),
    floor: shade(base, -0.16),
    div: shade(base, -0.02),
    divTop: shade(base, 0.2),
    edge: shade(base, -0.62),
  };

  const T = [48, 26]; const R = [80, 40]; const F = [48, 54]; const L = [16, 40];
  const H = 16;
  const Rb = shift(R, 0, H); const Fb = shift(F, 0, H); const Lb = shift(L, 0, H);
  const iT = [48, 28.6]; const iR = [74, 40]; const iF = [48, 51.4]; const iL = [22, 40];
  const D = 11;
  const fT = shift(iT, 0, D); const fR = shift(iR, 0, D);
  const fL = shift(iL, 0, D); const fF = shift(iF, 0, D);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  // Dividers stop short of the rim, so their tops sit below the opening.
  const SUNK = D * 0.4;
  /** A divider standing between the two rim midpoints p and q. */
  const wall = (p0, q0) => {
    const p = shift(p0, 0, SUNK);
    const q = shift(q0, 0, SUNK);
    const a = shift(p0, 0, D);
    const b = shift(q0, 0, D);
    return `<polygon points="${P([p, q, b, a])}" fill="${c.div}"/>` +
      `<polygon points="${P([p, q, shift(q, 0, 2.2), shift(p, 0, 2.2)])}" fill="${c.divTop}"/>` +
      `<polygon points="${P([p, q, b, a])}" fill="none" stroke="${c.edge}" ` +
      `stroke-width=".9" stroke-linejoin="round"/>`;
  };

  // The length divider runs from one long side to the other; the width divider
  // crosses it. Drawing the crossing one last reads as the half-lap.
  const dLength = count >= 2 ? wall(mid(iL, iT), mid(iF, iR)) : '';
  const dWidth = count >= 4 ? wall(mid(iT, iR), mid(iL, iF)) : '';

  return `<svg viewBox="0 0 96 74" aria-hidden="true">
  <polygon points="${P([iL, iT, fT, fL])}" fill="${c.inner}"/>
  <polygon points="${P([iT, iR, fR, fT])}" fill="${c.innerB}"/>
  <polygon points="${P([fT, fR, fF, fL])}" fill="${c.floor}"/>
  ${dLength}
  ${dWidth}
  <path d="M${P([T, R, F, L])}Z M${P([iT, iR, iF, iL])}Z" fill="${c.rim}" fill-rule="evenodd"/>
  <polygon points="${P([L, F, Fb, Lb])}" fill="${shade(base, -0.04)}"/>
  <polygon points="${P([F, R, Rb, Fb])}" fill="${shade(base, -0.3)}"/>
  <g fill="none" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round" opacity=".8">
    <path d="M${P([L, F, Fb, Lb])}Z"/><path d="M${P([F, R, Rb, Fb])}Z"/>
    <path d="M${P([T, R, F, L])}Z"/><path d="M${P([iT, iR, iF, iL])}Z"/>
  </g>
</svg>`;
}

// ---- viewport cube -------------------------------------------------------
// One cabinet-projection cube; the face that matters is tinted. Faces that would
// be hidden (back, left, bottom) reuse a visible face and mirror the whole cube,
// which reads as "looking from over there".
const CUBE_FACES = {
  front: '4 8 17 8 17 21 4 21',
  top: '4 8 7.5 4.5 20.5 4.5 17 8',
  right: '17 8 20.5 4.5 20.5 17.5 17 21',
};

const CUBE_VIEWS = {
  persp: { shade: { top: 0.3, front: 0.14, right: 0.05 } },
  front: { shade: { front: 0.32 } },
  back: { shade: { front: 0.32 }, flip: 'x' },
  right: { shade: { right: 0.32 } },
  left: { shade: { right: 0.32 }, flip: 'x' },
  top: { shade: { top: 0.32 } },
  bottom: { shade: { top: 0.32 }, flip: 'y' },
};

function cubeIcon(view) {
  const spec = CUBE_VIEWS[view] || CUBE_VIEWS.persp;
  const t = spec.flip === 'x'
    ? ' transform="translate(24 0) scale(-1 1)"'
    : spec.flip === 'y' ? ' transform="translate(0 24) scale(1 -1)"' : '';
  const fills = Object.entries(CUBE_FACES).map(([name, pts]) => {
    const a = spec.shade[name];
    return a ? `<polygon points="${pts}" fill="currentColor" fill-opacity="${a}"/>` : '';
  }).join('');
  const edges = [
    'M4 8 17 8 17 21 4 21Z',          // front face
    'M4 8 7.5 4.5 20.5 4.5 17 8',     // top face
    'M17 8 20.5 4.5 20.5 17.5 17 21', // right face
  ].map((d) => `<path d="${d}"/>`).join('');
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><g${t}>${fills}` +
    `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">` +
    `${edges}</g></g></svg>`;
}

const STYLES = [
  { id: 'open', label: 'Open', hint: 'Four walls and a floor' },
  {
    id: 'lidded',
    label: 'Lidded',
    hint: 'One lid that pivots on pins in the side walls',
  },
  {
    id: 'double',
    label: 'Double Window',
    hint: 'Two leaves meeting in the middle, each hinged on its own wall and '
      + 'resting on the side walls, with a finger hole where they join',
  },
  {
    id: 'shoebox',
    label: 'Lift-off Lid',
    hint: 'A second tray inverted over the first - it comes off completely, '
      + 'the way a shoe box does',
  },
];

const DIVIDERS = [
  { id: 0, label: 'None', hint: 'One open compartment' },
  {
    id: 2,
    label: '2 spaces',
    hint: 'One panel across the middle of the length, tenoned into the front and '
      + 'back walls',
  },
  {
    id: 4,
    label: '4 spaces',
    hint: 'Two panels half-lapped into a cross, each tenoned into its own pair of '
      + 'walls',
  },
];

export const BACKDROPS = [
  {
    id: 'dark',
    label: 'Dark backdrop',
    swatch: 'radial-gradient(120% 110% at 28% 18%, #4c4c50 0%, #2b2b2e 78%)',
  },
  {
    id: 'light',
    label: 'Light backdrop',
    swatch: 'radial-gradient(120% 110% at 28% 18%, #ffffff 0%, #dde1e8 78%)',
  },
];

/** Backdrop is a viewing preference, so it lives on the stage, not the inspector. */
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

// ---------------------------------------------------------------- bottom bar
const CAMERAS = [
  ['persp', 'Persp.'], ['front', 'Front'], ['right', 'Right'],
  ['left', 'Left'], ['back', 'Back'], ['top', 'Top'], ['bottom', 'Bottom'],
];

const faceButton = ({ view, label, pressed, title, onclick, badge }) =>
  h('button', { class: 'face', 'aria-pressed': String(pressed), title, onclick },
    h('span', { class: 'face-ico', html: cubeIcon(view) },
      badge ? h('span', { class: 'badge' }, String(badge)) : null),
    h('span', { class: 'face-label' }, label));

/** 3D mode shows camera presets; 2D mode shows the panel tabs. */
export function renderFaces(root, { onFace, onCamera, camera }) {
  root.replaceChildren();
  if (state.view === '3d') {
    for (const [id, label] of CAMERAS) {
      if (id === 'top' && state.params.style === 'open') continue;
      root.append(faceButton({
        view: id,
        label,
        pressed: camera === id,
        title: id === 'persp' ? 'Perspective view' : `View from the ${label.toLowerCase()}`,
        onclick: () => onCamera(id),
      }));
      if (id === 'persp') root.append(h('span', { class: 'face-sep' }));
    }
    return;
  }
  for (const panel of getBox().panels) {
    root.append(faceButton({
      view: panel.id,
      label: panel.label,
      pressed: state.face === panel.id,
      title: `Edit the ${panel.label.toLowerCase()} face`,
      badge: decorFor(panel).length,
      onclick: () => onFace(panel.id),
    }));
  }
}

// ------------------------------------------------------------- inspector
/**
 * What the dialogs are allowed to see of the store.
 *
 * extra() is what makes this tool different from the others: a box carries
 * the outline of every ornament on it, which is raw geometry rather than a
 * setting. The gallery measures it and decides whether it will fit.
 */
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

export function renderInspector(root, ctx) {
  if (sliderDragging) return; // the live control stays put until the drag ends
  root.replaceChildren();
  const obj = state.view === '2d' ? selectedObject() : null;
  root.append(h('h2', { class: 'insp-title' }, obj ? labelFor(obj) : 'Overall'));
  if (obj) objectInspector(root, obj, ctx);
  else overallInspector(root, ctx);
}

const labelFor = (o) => ({
  text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', star: 'Star',
  polygon: 'Polygon', image: 'Artwork', svg: 'Vector art',
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
  const mat = material();

  root.append(group('Box Style', true,
    h('div', { class: 'cards' }, STYLES.map(({ id, label, hint }) =>
      h('button', {
        class: 'card', type: 'button', 'aria-pressed': String(p.style === id),
        title: hint,
        onclick: () => { setParam('style', id); clampDecor(); ctx.refresh(); },
      },
      h('span', { class: 'art', html: boxThumb(id, mat.color) }),
      label))),
    ...(p.style === 'shoebox' ? liftOffRows(p, ctx) : [])));

  root.append(group('Divider', true,
    h('div', { class: 'cards' }, DIVIDERS.map(({ id, label, hint }) =>
      h('button', {
        class: 'card', type: 'button',
        'aria-pressed': String((p.divider || 0) === id),
        title: hint,
        onclick: () => { setParam('divider', id); clampDecor(); ctx.refresh(); },
      },
      h('span', { class: 'art', html: dividerThumb(id, mat.color) }),
      label))),
    (p.divider ? numberRow('Divider height (% of depth)', p.dividerHeight, {
      min: 20, max: 100, step: 5,
      onInput: (v) => { setParam('dividerHeight', Math.round(v)); ctx.refresh(); },
    }) : null),
    h('p', { class: 'hint' },
      'Dividers tenon through the walls the same way the floor does, and the '
      + 'four-space pair half-laps in the middle so it locks itself square. '
      + 'Keeping them short of the rim leaves room to reach in, and a lid closes '
      + 'over them rather than onto them.')));

  root.append(group('Dimensions', true,
    dimRow('Length', 'length', ctx),
    dimRow('Width', 'width', ctx),
    dimRow('Height', 'height', ctx),
    h('p', { class: 'hint' }, 'Outer dimensions, including the lid.')));

  const matSel = h('select', {
    onchange: (e) => {
      const m = MATERIALS.find((x) => x.id === e.target.value);
      update((s) => {
        s.material = m.id;
        if (m.id !== 'custom') {
          s.params.thickness = m.t;
          s.params.kerf = m.kerf;
        }
      }, { geometry: true });
      ctx.refresh();
    },
  }, MATERIALS.map((m) => h('option', {
    value: m.id, ...(m.id === state.material ? { selected: true } : {}),
  }, m.id === 'custom' ? m.name : `${m.name} (${m.t} mm)`)));

  root.append(group('Material & Laser', true,
    h('div', { class: 'field' }, h('label', {}, 'Material'), matSel),
    h('div', { class: 'row' },
      h('span', { class: 'swatch', style: `background:${mat.color}` }),
      h('span', { class: 'muted' }, `${mat.name} · ${p.thickness} mm board`)),
    numberRow('Board thickness (mm)', p.thickness, {
      min: 0.5, max: 12, step: 0.1,
      onInput: (v) => { setParam('thickness', v); ctx.refresh(); },
    }),
    numberRow('Kerf compensation (mm)', p.kerf, {
      min: 0, max: 0.6, step: 0.01,
      onInput: (v) => { setParam('kerf', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'Half the kerf is added to every outline and taken off every slot, so parts '
      + 'finish at nominal size. The preset is a CO2 starting point - cut a 20 mm '
      + 'test square, measure it, and add the shortfall here.'),
  ));

  const fitTicks = ['Looser', 'Loose', 'Standard', 'Tight', 'Tighter'];
  const d = getBox().derived;
  root.append(group('Joints', false,
    h('div', { class: 'field' },
      h('label', {}, 'Corner joint'),
      h('div', { class: 'seg' }, [
        ['standard', 'Standard'], ['screw', 'Screw'],
      ].map(([id, label]) => h('button', {
        type: 'button', 'aria-pressed': String((p.joint || 'standard') === id),
        title: id === 'standard'
          ? 'Finger joints, glued. Permanent.'
          : 'Finger joints plus M3 screws into captive nuts. Comes apart again.',
        onclick: () => { setParam('joint', id); ctx.refresh(); },
      }, label))),
      p.joint === 'screw' && d.screwTooSmall
        ? h('p', { class: 'warn' },
          'This box is too small for screws: the nut pockets reaching in from '
          + 'opposite edges would run into each other. Make it larger, or use '
          + 'the standard joint.')
        : p.joint === 'screw'
          ? h('p', { class: 'hint' },
            `${d.screwCount} x ${SCREW.name} screws, ${d.screwZs.length} on each `
            + 'of the four corners. The finger joints hold the box square by '
            + 'themselves, so you press it together first and then drive the '
            + 'screws one-handed. No glue, and it comes apart again.')
          : h('p', { class: 'hint' },
            'Finger joints, glued. Pick Screw to make the box demountable.')),
    p.joint === 'screw' && !d.screwTooSmall
      ? numberRow('Screws per corner', p.screwsPerEdge, {
        min: 1, max: 4, step: 1,
        onInput: (v) => { setParam('screwsPerEdge', Math.round(v)); ctx.refresh(); },
      })
      : null,
    p.joint === 'screw' && d.screwEar > 0
      ? h('p', { class: 'hint' },
        `The side walls stand ${rnd(d.screwEar, 1)} mm proud at the corners. `
        + 'That overhang is what gives the screw hole enough edge to hold on to '
        + `at ${p.thickness} mm board - it shrinks on thicker stock and is gone `
        + 'by 7 mm. The box measures that much wider across, front to back.')
      : null,
    h('div', { class: 'field' },
      h('label', {}, 'Interference fit'),
      liveRange({
        min: -0.15, max: 0.25, step: 0.05, value: p.fit,
        onInput: (v) => { setParam('fit', v); ctx.refresh(); },
      }),
      h('div', { class: 'tick-labels' }, fitTicks.map((t) => h('span', {}, t))),
      h('p', { class: 'hint' }, `Slots shrink by ${rnd(p.fit, 2)} mm. Tenons stay nominal and the relief slits let them squeeze in.`)),
    numberRow('Joint module (mm)', p.fingerSize, {
      min: 5, max: 40, step: 0.5,
      onInput: (v) => { setParam('fingerSize', v); ctx.refresh(); },
    }),
    numberRow('Relief slits per tenon', p.reliefSlits, {
      min: 0, max: 4, step: 1,
      onInput: (v) => { setParam('reliefSlits', Math.round(v)); ctx.refresh(); },
    }),
    numberRow('Slit reach past root (mm)', p.slitOvershoot, {
      min: 0.1, max: 2, step: 0.05,
      onInput: (v) => { setParam('slitOvershoot', v); ctx.refresh(); },
    }),
    numberRow('Floor height above base (mm)', p.floorOffset ?? p.thickness, {
      min: 0, max: Math.max(20, p.height / 3), step: 0.5,
      onInput: (v) => { setParam('floorOffset', v); ctx.refresh(); },
    }),
  ));

  root.append(group('Cut summary', false, ...summaryRows()));

  root.append(h('button', {
    class: 'link', type: 'button',
    onclick: () => {
      if (!confirm('Start over? This clears the dimensions and every decoration.')) return;
      reset();
      ctx.refresh();
    },
  }, 'Start over'));
}

/**
 * Controls for the lift-off lid. Two of the three change how the box FITS rather
 * than how it looks, so each one says in millimetres what it just did - a
 * percentage of a wall height nobody has measured is not a number you can check
 * against the thing on your bench.
 */
function liftOffRows(p, ctx) {
  const d = getBox().derived.lid;
  if (!d) return [];
  const seg = (label, key, on, value) => h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { class: 'seg' }, [[true, 'On'], [false, 'Off']].map(([v, text]) =>
      h('button', {
        type: 'button', 'aria-pressed': String(on === v),
        onclick: () => { setParam(key, v); ctx.refresh(); },
      }, text))),
    value);
  return [
    numberRow('Lid depth (% of the wall)', p.lidDrop ?? 35, {
      min: 10, max: 95, step: 5,
      onInput: (v) => { setParam('lidDrop', Math.round(v)); ctx.refresh(); },
    }),
    numberRow('Lid clearance (mm)', p.lidSlack ?? 0.4, {
      min: 0.1, max: 1.5, step: 0.05,
      onInput: (v) => { setParam('lidSlack', v); ctx.refresh(); },
    }),
    seg('Thumb notch', 'lidNotch', (p.lidNotch ?? true) !== false, null),
    h('p', { class: 'hint' },
      `The skirt covers ${rnd(d.drop, 1)} mm of the wall, and the finished box `
      + `measures ${rnd(d.outerL, 1)} x ${rnd(d.outerW, 1)} mm - the lid rides `
      + 'outside the walls, so it is wider than the Length and Width below.'),
    h('p', { class: 'hint' },
      'Clearance is the gap on each side, and it is the only gap there is: kerf '
      + 'is already compensated on both parts. Too little and the lid will not go '
      + 'on at all, and there is nothing to do about that afterwards but cut '
      + 'another one. Start at 0.4 mm, and open it up on materials that swell.'),
  ];
}

function dimRow(label, key, ctx) {
  const p = state.params;
  const maxima = { length: 900, width: 900, height: 600 };
  return numberRow(`${label} (mm)`, p[key], {
    min: p.thickness * 8,
    max: maxima[key],
    step: 1,
    onInput: (v) => {
      setParam(key, clamp(v, p.thickness * 8, maxima[key]));
      clampDecor();
      ctx.refresh();
    },
  });
}

function summaryRows() {
  const box = getBox();
  let cut = 0;
  let area = 0;
  for (const panel of box.panels) {
    for (const ring of [panel.outline, ...panel.holes]) cut += perimeter(ring);
    area += panel.size.w * panel.size.h;
    for (const o of decorFor(panel)) {
      for (const r of objectRings(o)) cut += perimeter(r);
    }
  }
  return [
    h('div', { class: 'stat' }, h('span', {}, 'Panels'), h('b', {}, String(box.panels.length))),
    h('div', { class: 'stat' }, h('span', {}, 'Path length'), h('b', {}, `${(cut / 1000).toFixed(2)} m`)),
    h('div', { class: 'stat' }, h('span', {}, 'Board area'), h('b', {}, `${(area / 100).toFixed(0)} cm²`)),
    h('div', { class: 'stat' }, h('span', {}, 'Wall height'), h('b', {}, `${rnd(box.derived.wallH, 1)} mm`)),
    box.derived.lid
      ? h('div', { class: 'stat' },
        h('span', {}, 'Overall size'),
        h('b', {}, `${rnd(box.derived.lid.outerL, 1)} x ${rnd(box.derived.lid.outerW, 1)} `
          + `x ${rnd(box.params.height, 1)} mm`))
      : null,
    box.derived.screwCount
      ? h('div', { class: 'stat' },
        h('span', {}, 'Hardware'),
        h('b', {}, `${box.derived.screwCount} x ${SCREW.name}x${box.derived.screwLength} `
          + `+ ${box.derived.screwCount} nuts`))
      : null,
    box.derived.screwCount
      ? h('p', { class: 'hint' },
        'Button head or pan head, not countersunk - a flat head needs a '
        + 'countersink drilled by hand afterwards, which the laser cannot do.')
      : null,
    h('p', { class: 'hint' }, 'Path length counts every cut and outline once - a fill engrave takes far longer than its outline suggests.'),
  ];
}

function perimeter(ring) {
  let d = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    d += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return d;
}

// ------------------------------------------------------- object inspector
function objectInspector(root, obj, ctx) {
  const set = (patch, geometry = false) => {
    update((s) => {
      const list = s.decor[state.face];
      const target = list.find((o) => o.id === obj.id);
      Object.assign(target, patch);
    }, { geometry });
    ctx.refresh();
  };

  root.append(group('Laser Settings', true,
    h('div', { class: 'field' },
      h('label', {}, 'Process type'),
      segmented(PROCESSES.map((p) => ({ id: p.id, label: p.label, hint: p.hint })),
        obj.process, (id) => set({ process: id }))),
    h('div', { class: 'field' },
      h('label', {}, `Power ${Math.round(obj.power * 100)}%`),
      liveRange({
        min: 0.05, max: 1, step: 0.05, value: obj.power,
        onInput: (v) => set({ power: v }),
      }),
      h('div', { class: 'tick-labels' }, ['Low', 'Medium', 'High'].map((t) => h('span', {}, t)))),
    obj.process === 'cut'
      ? h('p', { class: 'hint' }, 'Cuts become real holes in the 3D preview and in the exported outline.')
      : null));

  const attrs = [];
  if (obj.type === 'text') {
    attrs.push(h('div', { class: 'field' },
      h('label', {}, 'Text'),
      h('textarea', {
        oninput: (e) => {
          const target = state.decor[state.face].find((o) => o.id === obj.id);
          target.text = e.target.value;
          const m = measureText(target);
          target.w = m.w || target.w;
          target.h = m.h || target.h;
          update(() => {}, { history: false });
          ctx.refresh({ keepFocus: e.target });
        },
      }, obj.text)));
    attrs.push(h('div', { class: 'field' },
      h('label', {}, 'Font'),
      h('select', {
        onchange: async (e) => {
          await loadFont(e.target.value);
          const target = state.decor[state.face].find((o) => o.id === obj.id);
          target.font = e.target.value;
          const m = measureText(target);
          target.w = m.w || target.w;
          target.h = m.h || target.h;
          update(() => {});
          ctx.refresh();
        },
      }, FONTS.map((f) => h('option', {
        value: f.id, ...(f.id === obj.font ? { selected: true } : {}),
      }, f.name)))));
    attrs.push(numberRow('Size (mm)', obj.size, {
      min: 2, max: 200, step: 0.5,
      onInput: (v) => {
        const target = state.decor[state.face].find((o) => o.id === obj.id);
        target.size = v;
        const m = measureText(target);
        target.w = m.w || target.w;
        target.h = m.h || target.h;
        update(() => {});
        ctx.refresh();
      },
    }));
    attrs.push(numberRow('Letter spacing (mm)', obj.letterSpacing || 0, {
      min: -2, max: 10, step: 0.1,
      onInput: (v) => {
        const target = state.decor[state.face].find((o) => o.id === obj.id);
        target.letterSpacing = v;
        const m = measureText(target);
        target.w = m.w || target.w;
        target.h = m.h || target.h;
        update(() => {});
        ctx.refresh();
      },
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

  const panel = currentPanel();
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
      onclick: () => set({ x: panel.size.w / 2 - obj.w / 2 }),
    }, 'Centre H'),
    h('button', {
      class: 'ghost', style: 'flex:1', type: 'button',
      onclick: () => set({ y: panel.size.h / 2 - obj.h / 2 }),
    }, 'Centre V')));

  root.append(group('Attribute', true, ...attrs));

  root.append(group('Arrange', false,
    h('div', { class: 'row' },
      h('button', {
        class: 'ghost', style: 'flex:1', type: 'button',
        onclick: () => {
          update((s) => {
            const list = s.decor[state.face];
            const copy = { ...obj, id: makeObject(obj.type, panel).id, x: obj.x + 4, y: obj.y - 4 };
            list.push(copy);
            s.selection = copy.id;
          });
          ctx.refresh();
        },
      }, 'Duplicate'),
      h('button', {
        class: 'ghost', style: 'flex:1', type: 'button',
        onclick: () => {
          update((s) => {
            const list = s.decor[state.face];
            const i = list.findIndex((o) => o.id === obj.id);
            list.push(list.splice(i, 1)[0]);
          });
          ctx.refresh();
        },
      }, 'Bring to front')),
    h('button', {
      class: 'ghost', type: 'button', style: `color:var(--danger)`,
      onclick: () => ctx.deleteSelected(),
    }, 'Delete object')));
}

// ------------------------------------------------------------- popovers
const SHAPES = [
  ['ellipse', '◯', 'Ellipse'],
  ['star', '★', 'Star'],
  ['polygon', '⬟', 'Polygon'],
  ['rect', '▭', 'Rectangle'],
];

const EMOJI = ('😀 😁 😂 🤣 😊 😍 😎 🤩 🥳 😴 🤔 🙃 👍 👎 👏 🙌 💪 ✌️ 🤝 ❤️ 🧡 💛 💚 💙 💜 ⭐ 🌟 ✨ ⚡ 🔥 💧 🌈 ☀️ 🌙 ☁️ ❄️ 🌸 🌼 🌻 🌵 🍀 🌲 🐶 🐱 🐭 🐰 🦊 🐻 🐼 🐨 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🦄 🐝 🦋 🐙 🐳 🍎 🍊 🍋 🍉 🍇 🍓 🥑 🌽 🍕 🍔 🍟 🌮 🍣 🍰 🍪 ☕ 🍺 🎁 🎈 🎉 🎂 🏆 🎯 🎮 🎧 🎸 📷 💡 🔧 🔨 ⚙️ 🔒 🔑 📦 📌 ✏️ 📐 🧩 🚀 ✈️ 🚗 🏠 🌍 ⏰ 💎 ♻️').split(' ');

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
    h('div', { class: 'shape-list' }, SHAPES.map(([id, icon, label]) =>
      h('button', { type: 'button', onclick: () => onPick(id) },
        h('span', { style: 'font-size:16px;width:20px' }, icon), label))));
}

export function emojiMenu(onPick) {
  const grid = h('div', { class: 'emoji-grid' }, EMOJI.map((e) =>
    h('button', { type: 'button', onclick: () => onPick(e) }, e)));
  const search = h('input', {
    type: 'text', placeholder: 'Filter…',
    oninput: (e) => {
      const q = e.target.value.trim();
      grid.replaceChildren(...EMOJI.filter((x) => !q || x.includes(q))
        .map((x) => h('button', { type: 'button', onclick: () => onPick(x) }, x)));
    },
  });
  return h('div', {}, h('div', { class: 'pop-title' }, 'Emoji'), search, grid);
}

export function imageMenu(onFile) {
  const input = h('input', {
    type: 'file', accept: '.png,.jpg,.jpeg,.svg,image/*', style: 'display:none',
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
  }, 'Drop a PNG, JPG or SVG here', h('br'), h('span', { class: 'muted' }, 'or click to browse · max 10 MB'));
  return h('div', {}, h('div', { class: 'pop-title' }, 'Artwork'), drop, input);
}

// --------------------------------------------------------------- dialogs
export function fillExportDialog(dlg, box) {
  const sel = dlg.querySelector('#sheetSel');
  sel.replaceChildren(...SHEETS.map((s) => h('option', {
    value: s.id, ...(s.id === state.sheet ? { selected: true } : {}),
  }, `${s.w} × ${s.h} mm`)));
  sel.onchange = (e) => update((s) => { s.sheet = e.target.value; }, { history: false });
  // A lift-off lid rides outside the walls, so the box that comes off the bed is
  // wider than the Length and Width that were typed in. This line is the last
  // thing anyone reads before cutting, so it names the size they will measure.
  const outer = box.derived.lid
    ? `${rnd(box.derived.lid.outerL, 1)} × ${rnd(box.derived.lid.outerW, 1)} × ${box.params.height} mm overall`
    : `${box.params.length} × ${box.params.width} × ${box.params.height} mm`;
  dlg.querySelector('#exportSummary').textContent =
    `${box.panels.length} panels · ${outer} · ${box.params.thickness} mm board`;
  // Placed images cannot go into the PDF. A PDF image is an XObject with its own
  // encoding, and a PNG cannot be carried across as it stands. Saying so is the
  // whole point: artwork that silently fails to appear is worse than artwork
  // that was never offered.
  const art = box.panels.reduce(
    (n, p) => n + decorFor(p).filter((o) => o.type === 'image').length, 0);
  dlg.querySelector('#exportNote').textContent =
    `Kerf ${box.params.kerf} mm and a ${rnd(box.params.fit, 2)} mm interference fit are already baked into the paths — cut as-is.`
    + (art
      ? ` The PDF holds the vectors only — ${art} placed image${art === 1 ? '' : 's'}`
        + ` ${art === 1 ? 'is' : 'are'} in the SVG alone.`
      : '');
}

const STEPS = [
  ['Clean the parts', 'Wipe the soot off every edge or the joints will feel tight for the wrong reason.'],
  ['Lay them out', 'Two long walls (front/back), two short walls (left/right), the floor, and the lid if you made one.'],
  ['Floor into the front wall', 'The slitted tenons push through the mortises. They should click, not fight.'],
  ['Add a side wall', 'The tabs on the front wall drop into the notches on the side wall; the floor tenon goes in at the same time.'],
  ['Screw joints: nuts in first', 'Drop an M3 nut into each pocket before you '
    + 'close that corner up. Once the box is together you cannot reach them. They '
    + 'stay put on their own - the pocket is cut to the nut, not to a gap.'],
  ['Dividers before the far walls', 'Stand the long divider in the front wall '
    + 'mortises, drop the crossing one onto it, then bring the side walls in over '
    + 'their tenons. Once the box is closed they cannot go in.'],
  ['Lid pins first (lidded and double)', 'Slot each lid or leaf pin into the hole in the side wall boss before you close the second side. The double style has two of them per side.'],
  ['Close it up', 'Fit the remaining side and the back wall, then press the whole box square on a flat surface.'],
];

export function fillAssembleDialog(dlg) {
  dlg.querySelector('#assembleSteps').replaceChildren(...STEPS.map(([t, d]) =>
    h('li', {}, t, h('br'), h('span', {}, d))));
}

export { rnd };
