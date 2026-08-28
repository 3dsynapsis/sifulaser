// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.
// Layout and control idioms follow the Box Maker so the two feel like one tool.

import {
  state, update, setParam, getPuzzle, MATERIALS, material,
  canUndo, canRedo, reset,
} from './store.js';
import { riskLevel, riskFactor } from './geom/puzzle.js';
import { layersFor, pathLength } from './exportSvg.js';

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

// ---- size presets ---------------------------------------------------------
// Real board sizes people actually buy or already have on the bed, plus the two
// paper sizes because photo prints are the usual puzzle artwork.
const SIZE_PRESETS = [
  { label: 'A5', w: 210, h: 148 },
  { label: 'A4', w: 297, h: 210 },
  { label: 'A3', w: 420, h: 297 },
  { label: '300 x 200', w: 300, h: 200 },
  { label: '400 x 300', w: 400, h: 300 },
  { label: '600 x 400', w: 600, h: 400 },
];

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
  root.replaceChildren();
  root.append(h('h2', { class: 'insp-title' }, 'Puzzle'));
  const p = state.params;
  const mat = material();
  const puzzle = getPuzzle();
  const d = puzzle.derived;

  // ---- Size comes first: it is the number people already know before they
  // open the tool, and everything below is a fraction of it.
  root.append(group('Size', true,
    h('div', { class: 'seg seg-wrap' }, SIZE_PRESETS.map((s) => h('button', {
      type: 'button',
      'aria-pressed': String(p.width === s.w && p.height === s.h),
      title: `${s.w} x ${s.h} mm`,
      onclick: () => {
        update((st) => { st.params.width = s.w; st.params.height = s.h; }, { geometry: true });
        ctx.refresh();
      },
    }, s.label))),
    numberRow('Width (mm)', p.width, {
      min: 20, max: 1200, step: 1,
      onInput: (v) => { setParam('width', v); ctx.refresh(); },
    }),
    numberRow('Height (mm)', p.height, {
      min: 20, max: 900, step: 1,
      onInput: (v) => { setParam('height', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'The finished board. Cut your picture to exactly this size and stick it '
      + 'down before you cut the puzzle.')));

  root.append(group('Pieces', true,
    numberRow('Columns', p.cols, {
      min: 2, max: 60, step: 1,
      onInput: (v) => { setParam('cols', Math.round(v)); ctx.refresh(); },
    }),
    numberRow('Rows', p.rows, {
      min: 2, max: 60, step: 1,
      onInput: (v) => { setParam('rows', Math.round(v)); ctx.refresh(); },
    }),
    h('div', { class: 'stat' }, h('span', {}, 'Pieces'), h('b', {}, String(d.pieces))),
    h('div', { class: 'stat' },
      h('span', {}, 'Piece size'),
      h('b', {}, `${rnd(d.pieceW, 1)} x ${rnd(d.pieceH, 1)} mm`)),
    d.pieceW < 12 || d.pieceH < 12
      ? h('p', { class: 'warn' },
        'Under about 12 mm a piece gets fiddly to pick up, and thin board starts '
        + 'snapping at the neck of the tab.')
      : null));

  const risk = riskLevel(p);
  root.append(group('Piece shape', true,
    numberRow('Tab size (%)', p.tabSize, {
      min: 10, max: 30, step: 0.5,
      onInput: (v) => { setParam('tabSize', v); ctx.refresh(); },
    }),
    numberRow('Jitter (%)', p.jitter, {
      min: 0, max: 13, step: 0.5,
      onInput: (v) => { setParam('jitter', v); ctx.refresh(); },
    }),
    h('div', { class: 'field' },
      h('label', {}, 'Seed'),
      h('div', { class: 'row' },
        h('input', {
          type: 'number', value: p.seed, min: 0, max: 99999, step: 1,
          onchange: (e) => {
            setParam('seed', Math.round(clamp(parseFloat(e.target.value), 0, 99999)));
            ctx.refresh();
          },
        }),
        h('button', {
          class: 'ghost', type: 'button', style: 'flex:0 0 auto',
          onclick: () => ctx.shuffle(),
        }, 'Shuffle'))),
    risk !== 'ok'
      ? h('p', { class: 'warn' },
        risk === 'danger'
          ? 'Too far: at this tab size and jitter the lines cross each other and '
            + 'the file will cut to scrap. Bring one of them down.'
          : 'Close to the limit. Any higher and neighbouring tabs start to touch.')
      : h('p', { class: 'hint' },
        'Jitter is how far each tab wanders off the regular grid. Seed picks one '
        + `of 100,000 arrangements - same seed, same puzzle. Headroom used: ${Math.round(riskFactor(p) / 0.5 * 100)}%.`)));

  root.append(group('Border', false,
    numberRow('Corner radius (mm)', p.cornerRadius, {
      min: 0, max: 40, step: 0.5,
      onInput: (v) => { setParam('cornerRadius', v); ctx.refresh(); },
    })));

  const matSel = h('select', {
    onchange: (e) => {
      const m = MATERIALS.find((x) => x.id === e.target.value);
      update((s) => {
        s.material = m.id;
        if (m.id !== 'custom') s.params.kerf = m.kerf;
      }, { geometry: true });
      ctx.refresh();
    },
  }, MATERIALS.map((m) => h('option', {
    value: m.id, ...(m.id === state.material ? { selected: true } : {}),
  }, m.name)));

  root.append(group('Material & Laser', true,
    h('div', { class: 'field' }, h('label', {}, 'Material'), matSel),
    h('div', { class: 'row' },
      h('span', { class: 'swatch', style: `background:${mat.color}` }),
      h('span', { class: 'muted' }, `${mat.name} · kerf ${p.kerf} mm`)),
    numberRow('Kerf (mm)', p.kerf, {
      min: 0, max: 0.6, step: 0.01,
      onInput: (v) => { setParam('kerf', v); ctx.refresh(); },
    }),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', ...(p.kerfComp ? { checked: true } : {}),
        onchange: (e) => { setParam('kerfComp', e.target.checked); ctx.refresh(); },
      }),
      ' Keep the pieces gripping after the kerf'),
    h('p', { class: 'hint' },
      'The line between two pieces belongs to both of them, so it cannot be '
      + 'offset the way a box outline can - moving it just steals from one piece '
      + 'and gives to the other. What the beam does take away is the bite of the '
      + `tab, so this widens each head by ${rnd(d.grip, 2)} mm to put it back. `
      + 'Turn it off to match the original generator exactly.'),
    h('p', { class: 'hint' },
      `Even so the assembled puzzle finishes about ${rnd(d.shrinkX, 1)} x `
      + `${rnd(d.shrinkY, 1)} mm smaller than the board, because every cut line `
      + 'eats one kerf. Nothing can recover that - plan the artwork around it.')));

  root.append(group('Cut summary', false,
    h('div', { class: 'stat' }, h('span', {}, 'Pieces'), h('b', {}, String(d.pieces))),
    h('div', { class: 'stat' },
      h('span', {}, 'Path length'),
      h('b', {}, `${rnd(pathLength(puzzle) / 1000, 2)} m`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Board'),
      h('b', {}, `${p.width} x ${p.height} mm`)),
    h('p', { class: 'hint' },
      'Path length is an estimate for sizing the job, not an exact figure - the '
      + 'knobs wander more than a straight line suggests.')));

  root.append(h('button', {
    class: 'link', type: 'button',
    onclick: () => {
      if (!confirm('Start over? This clears the size and every setting.')) return;
      reset();
      ctx.refresh();
    },
  }, 'Start over'));
}

// ---- dialogs --------------------------------------------------------------
export function fillExportDialog(dlg) {
  const puzzle = getPuzzle();
  const p = puzzle.params;
  dlg.querySelector('#exportSummary').textContent =
    `${puzzle.derived.pieces} pieces on a ${p.width} x ${p.height} mm board, `
    + `each about ${rnd(puzzle.derived.pieceW, 1)} x ${rnd(puzzle.derived.pieceH, 1)} mm.`;

  const chk = dlg.querySelector('#splitChk');
  chk.checked = state.splitLayers;
  chk.onchange = () => {
    update((s) => { s.splitLayers = chk.checked; }, { history: false });
    fillExportDialog(dlg);
  };

  dlg.querySelector('#layerKey').replaceChildren(...layersFor(state.splitLayers)
    .map((L) => h('span', {},
      h('i', { style: `background:${L.color}` }), L.label)));

  dlg.querySelector('#exportNote').textContent =
    'Layers come out in cutting order. Cut the puzzle lines first and the outer '
    + 'border last - once the border is through, the board is loose and every '
    + 'piece it releases can shift.';
}

const STEPS = [
  ['Stick the picture down first',
    'Glue or tape your print onto the board and let it dry. Cutting first and '
    + 'sticking afterwards never lines up.'],
  ['Mask the surface',
    'Low-tack masking tape over the picture keeps the smoke stain off it. Peel '
    + 'it after cutting.'],
  ['Cut a test square',
    'Cut a 20 mm square in the same board, measure it, and put the shortfall in '
    + 'the Kerf box. That number is what keeps the pieces tight.'],
  ['Puzzle lines first, border last',
    'Run the layers in the order they are named. If the border goes first the '
    + 'board floats free and the rest of the cut wanders.'],
  ['Hold the board down',
    'Magnets or pin jigs at the corners. A warped board lifts mid-cut and the '
    + 'beam defocuses right where the tabs are thinnest.'],
  ['Push it out from the back',
    'Press the whole sheet out onto a flat surface in one go rather than '
    + 'picking pieces out one at a time.'],
];

export function fillHelpDialog(dlg) {
  dlg.querySelector('#helpSteps').replaceChildren(...STEPS.map(([t, s]) =>
    h('li', {}, t, h('br'), h('span', {}, s))));
}

export function renderActions({ undoBtn, redoBtn }) {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
}

export { rnd };
