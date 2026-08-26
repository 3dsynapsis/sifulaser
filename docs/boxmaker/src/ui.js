// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.

import {
  state, update, setParam, getBox, currentPanel, decorFor, selectedObject,
  MATERIALS, material, canUndo, canRedo, clampDecor, reset,
} from './store.js';
import { PANEL_LABELS } from './geom/box.js';
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

const MM_PER_IN = 25.4;
const toDisplay = (mm) => (state.units === 'in' ? mm / MM_PER_IN : mm);
const fromDisplay = (v) => (state.units === 'in' ? v * MM_PER_IN : v);
const unitLabel = () => (state.units === 'in' ? 'in' : 'mm');
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

  const lid = style === 'lidded' ? (() => {
    const d = [-3, -21];
    const a = shift(L, d[0], d[1]); const b = shift(T, d[0], d[1]);
    return `<polygon points="${P([L, T, b, a])}" fill="${c.lid}"/>` +
      `<polygon points="${P([a, b, shift(b, 0, 2.6), shift(a, 0, 2.6)])}" fill="${c.right}"/>` +
      `<polygon points="${P([L, T, b, a])}" fill="none" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round"/>` +
      `<circle cx="${T[0] - 5}" cy="${T[1] - 2}" r="1.7" fill="${c.edge}" opacity=".55"/>`;
  })() : '';

  return `<svg viewBox="0 0 96 74" aria-hidden="true">
  ${lid}
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
      if (id === 'top' && state.params.style !== 'lidded') continue;
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
    h('div', { class: 'cards' }, ['open', 'lidded'].map((id) =>
      h('button', {
        class: 'card', type: 'button', 'aria-pressed': String(p.style === id),
        title: id === 'open'
          ? 'Four walls and a floor'
          : 'Adds a lid that pivots on pins in the side walls',
        onclick: () => { setParam('style', id); clampDecor(); ctx.refresh(); },
      },
      h('span', { class: 'art', html: boxThumb(id, mat.color) }),
      id === 'open' ? 'Open' : 'Lidded')))));

  root.append(group('Dimensions', true,
    h('div', { class: 'field' },
      h('label', {}, 'Units'),
      segmented([{ id: 'mm', label: 'mm' }, { id: 'in', label: 'in' }], state.units,
        (id) => update((s) => { s.units = id; }, { history: false }))),
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
    numberRow(`Board thickness (${unitLabel()})`, toDisplay(p.thickness), {
      min: toDisplay(0.5), max: toDisplay(12), step: state.units === 'in' ? 0.005 : 0.1,
      onInput: (v) => { setParam('thickness', fromDisplay(v)); ctx.refresh(); },
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
  root.append(group('Joints', false,
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

function dimRow(label, key, ctx) {
  const p = state.params;
  const maxima = { length: 900, width: 900, height: 600 };
  return numberRow(`${label} (${unitLabel()})`, toDisplay(p[key]), {
    min: toDisplay(p.thickness * 8),
    max: toDisplay(maxima[key]),
    step: state.units === 'in' ? 0.05 : 1,
    onInput: (v) => {
      setParam(key, clamp(fromDisplay(v), p.thickness * 8, maxima[key]));
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
  dlg.querySelector('#exportSummary').textContent =
    `${box.panels.length} panels · ${box.params.length} × ${box.params.width} × ${box.params.height} mm · ${box.params.thickness} mm board`;
  dlg.querySelector('#exportNote').textContent =
    `Kerf ${box.params.kerf} mm and a ${rnd(box.params.fit, 2)} mm interference fit are already baked into the paths — cut as-is.`;
}

const STEPS = [
  ['Clean the parts', 'Wipe the soot off every edge or the joints will feel tight for the wrong reason.'],
  ['Lay them out', 'Two long walls (front/back), two short walls (left/right), the floor, and the lid if you made one.'],
  ['Floor into the front wall', 'The slitted tenons push through the mortises. They should click, not fight.'],
  ['Add a side wall', 'The tabs on the front wall drop into the notches on the side wall; the floor tenon goes in at the same time.'],
  ['Lid pins first (lidded only)', 'Slot one lid pin into the hole in the side wall boss before you close the second side.'],
  ['Close it up', 'Fit the remaining side and the back wall, then press the whole box square on a flat surface.'],
];

export function fillAssembleDialog(dlg) {
  dlg.querySelector('#assembleSteps').replaceChildren(...STEPS.map(([t, d]) =>
    h('li', {}, t, h('br'), h('span', {}, d))));
}

export { rnd };
