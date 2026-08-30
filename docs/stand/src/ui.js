// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.
// Control idioms follow the Box Maker so the four tools feel like one family.

import {
  state, update, setParam, setStyle, setSize, getResult, canUndo, canRedo, reset,
  MATERIALS, material, setMaterial, setBoardNumber, applyDesign,
} from './store.js';
import * as gallery from './designs.js';
import { layout, faceLoaded, loadFace, isOutline } from './geom/text.js';
import { SIZE_PRESETS, sizeOf } from './geom/stand.js';
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
      h('div', { class: 'num', style: 'flex:0 0 92px' }, num, unit && h('span', { class: 'unit' }, unit))));
}

function seg(options, current, onPick) {
  return h('div', { class: 'seg' }, options.map(([id, label]) => h('button', {
    type: 'button', 'aria-pressed': String(current === id),
    onclick: () => onPick(id),
  }, label)));
}

function textRow(label, value, onChange, placeholder, key) {
  const input = h('input', {
    type: 'text', class: 'text-line', spellcheck: 'false', placeholder,
    'data-k': key,
    oninput: (e) => onChange(e.target.value, false),
    onchange: (e) => onChange(e.target.value, true),
  });
  input.value = value ?? '';
  return h('div', { class: 'field' }, h('label', {}, label), input);
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

// ---- typeface picker ------------------------------------------------------
export const CATEGORY_NAMES = {
  block: 'Block',
  serif: 'Serif',
  script: 'Cursive',
  display: 'Display',
  line: 'Single line',
};

const CATEGORY_NOTES = {
  block: 'Plain and upright. The most legible, and the safest to cut out.',
  serif: 'Formal. Offices, awards, anything that should look official.',
  script: 'Joined by nature, which is what makes it hold together when cut.',
  display: 'Heavy and decorative. Thick strokes cut cleanly.',
  line: 'Skeletons rather than shapes - no inside, so nothing to fill. The '
    + 'fastest thing there is to engrave, and they can still be cut out because '
    + 'the tool gives them a thickness of its own.',
};

// Single line goes last. The four real typeface groups are what somebody is
// choosing between; the stroke faces are a special case you reach for when you
// want engraving speed, not a starting point.
const CATEGORY_ORDER = ['block', 'serif', 'script', 'display', 'line'];

let activeCat = null;

/**
 * Each face draws its own name in its own letters. Nothing describes a typeface
 * as well as the typeface - "Cursive" as a word tells you far less than seeing
 * it written.
 */
function faceThumb(face) {
  const r = layout({ faceData: face, text: face.name, capHeight: 10, align: 'left' });
  if (!r.paths.length) return '';
  const { bbox } = r;
  const w = Math.max(0.01, bbox.x1 - bbox.x0);
  const hgt = Math.max(0.01, bbox.y1 - bbox.y0);
  const pad = 1;
  const filled = isOutline(face);
  const d = r.paths.map((st) => {
    const seg2 = [`M ${(st[0] - bbox.x0).toFixed(2)} ${(bbox.y1 - st[1]).toFixed(2)}`];
    for (let k = 2; k < st.length; k += 2) {
      seg2.push(`L ${(st[k] - bbox.x0).toFixed(2)} ${(bbox.y1 - st[k + 1]).toFixed(2)}`);
    }
    return seg2.join(' ') + (filled ? ' Z' : '');
  }).join(' ');
  return `<svg viewBox="${-pad} ${-pad} ${w + pad * 2} ${hgt + pad * 2}" `
    + `preserveAspectRatio="xMinYMid meet" aria-hidden="true" `
    + `class="${filled ? 'thumb-fill' : 'thumb-line'}"><path d="${d}"/></svg>`;
}

function facePicker(ctx) {
  const p = state.params;
  const current = ctx.faces.find((f) => f.id === p.face);
  if (!activeCat) activeCat = current?.cat || 'block';
  const cats = CATEGORY_ORDER.filter((c) => ctx.faces.some((f) => f.cat === c));
  const inCat = ctx.faces.filter((f) => f.cat === activeCat);

  // Only the category on screen is fetched. All twenty outline faces together
  // are the best part of a megabyte, and nobody looks at more than one group.
  const pending = inCat.filter((f) => !faceLoaded(f.id));
  if (pending.length) {
    Promise.all(pending.map((f) => loadFace(f.id).catch(() => null)))
      .then(() => ctx.refresh());
  }

  return [
    h('div', { class: 'cat-tabs' }, cats.map((c) => h('button', {
      type: 'button', 'aria-pressed': String(activeCat === c),
      onclick: () => { activeCat = c; ctx.refresh(); },
    }, CATEGORY_NAMES[c] || c))),
    h('p', { class: 'hint' }, CATEGORY_NOTES[activeCat] || ''),
    h('div', { class: 'faces-list' }, inCat.map((f) => {
      const face = faceLoaded(f.id);
      const thin = f.stroke != null && f.stroke < 3;
      return h('button', {
        class: 'face-opt', type: 'button',
        'aria-pressed': String(p.face === f.id),
        title: f.stroke != null
          ? `${f.name} - letters average ${f.stroke} mm at a 34 mm capital`
          : f.name,
        onclick: () => { setParam('face', f.id); ctx.refresh(); },
      },
      face ? h('span', { class: 'thumb', html: faceThumb(face) })
        : h('span', { class: 'muted' }, f.name),
      thin && p.style === 'silhouette'
        ? h('span', { class: 'pill warn' }, 'thin')
        : null);
    })),
  ];
}

/**
 * A compact picker for line 2.
 *
 * The name gets the big gallery of previews because that is the decision people
 * care about. Line 2 is usually a job title or a department - a real choice, but
 * a secondary one - so it gets a grouped list instead of a second wall of
 * thumbnails. What it looks like shows up in the preview immediately anyway.
 */
function face2Select(ctx) {
  const p = state.params;
  const sel2 = h('select', {
    class: 'face-select',
    onchange: (e) => {
      const id = e.target.value;
      setParam('face2', id);
      if (id && !faceLoaded(id)) loadFace(id).then(() => ctx.refresh()).catch(() => {});
      ctx.refresh();
    },
  });
  sel2.append(h('option', { value: '' }, 'Same as the name'));
  for (const c of CATEGORY_ORDER) {
    const inCat = ctx.faces.filter((f) => f.cat === c);
    if (!inCat.length) continue;
    const grp = h('optgroup', { label: CATEGORY_NAMES[c] || c });
    for (const f of inCat) grp.append(h('option', { value: f.id }, f.name));
    sel2.append(grp);
  }
  sel2.value = p.face2 || '';
  return h('div', { class: 'field' },
    h('label', {}, 'Typeface for line 2'),
    sel2,
    h('p', { class: 'hint' },
      'A job title reads better in something other than the name it sits under. '
      + 'Leave it following the name if you would rather they matched.'));
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

/**
 * What the dialogs are allowed to see of the store: read the design, put one
 * back, and nothing else.
 */
const galleryStore = {
  name: () => state.name,
  params: () => ({ ...state.params }),
  material: () => state.material,
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
  if (sliderDragging) return;
  const active = document.activeElement;
  const keepId = active && active.classList.contains('text-line') ? active.dataset.k : null;
  const caret = keepId ? [active.selectionStart, active.selectionEnd] : null;

  root.replaceChildren();
  root.append(h('h2', { class: 'insp-title' }, 'Name stand'));
  const p = state.params;
  const r = getResult();
  const d = r.derived;
  const silhouette = p.style === 'silhouette';
  const outlineFace = isOutline(r.face);

  // ---- Size comes first: it is the thing a customer chooses.
  root.append(group('Size', true,
    seg([...SIZE_PRESETS.map((s) => [s.id, s.name]), ['custom', 'Custom']],
      p.size, (id) => { setSize(id); ctx.refresh(); }),
    p.size === 'custom'
      ? h('div', {},
        numberRow('Width (mm)', p.standW, {
          min: 60, max: 600, step: 5,
          onInput: (v) => { setParam('standW', v); ctx.refresh(); },
        }),
        numberRow('Standing height (mm)', p.standH, {
          min: 25, max: 200, step: 5,
          onInput: (v) => { setParam('standH', v); ctx.refresh(); },
        }))
      : h('p', { class: 'hint' },
        `${sizeOf(p.size)?.w} x ${sizeOf(p.size)?.h} mm overall, base included - `
        + 'the way it is measured on a listing.'),
    h('div', { class: 'stat' },
      h('span', {}, 'Letter height'), h('b', {}, `${rnd(d.cap1, 1)} mm`)),
    h('p', { class: 'hint' },
      'The lettering is solved to the size, not the other way round: type a '
      + 'longer name and the letters come down to fit rather than the stand '
      + 'growing past the size you sold.')));

  root.append(group('Name', true,
    textRow('Name', p.line1, (v, commit) => {
      if (commit) { setParam('line1', v); ctx.refresh(); } else {
        update((s) => { s.params.line1 = v; }, { history: false });
        ctx.refreshPreviewOnly();
      }
    }, 'SHAKIMAH', 'line1'),
    textRow('Second line', p.line2, (v, commit) => {
      if (commit) { setParam('line2', v); ctx.refresh(); } else {
        update((s) => { s.params.line2 = v; }, { history: false });
        ctx.refreshPreviewOnly();
      }
    }, 'BINTI AB RAHMAN', 'line2'),
    textRow('On the base', p.baseText, (v, commit) => {
      if (commit) { setParam('baseText', v); ctx.refresh(); } else {
        update((s) => { s.params.baseText = v; }, { history: false });
        ctx.refreshPreviewOnly();
      }
    }, 'SK TANAH MERAH', 'baseText'),
    h('div', { class: 'field' },
      h('label', {}, 'Alignment'),
      seg(ALIGNS, p.align, (id) => { setParam('align', id); ctx.refresh(); }))));

  root.append(group('Style', true,
    seg([['plate', 'Plate'], ['silhouette', 'Cut-out']], p.style,
      (id) => { setStyle(id); ctx.refresh(); }),
    h('p', { class: 'hint' },
      silhouette
        ? 'The letters are the outline. Every one has to touch its neighbour or '
          + 'the bar under it, or it drops out of the sheet loose.'
        : 'A rounded plate with the name engraved on it. Nothing to break, and '
          + 'any typeface works however fine it is.'),
    !silhouette
      ? h('label', { class: 'check' },
        h('input', {
          type: 'checkbox', ...(p.border ? { checked: true } : {}),
          onchange: (e) => { setParam('border', e.target.checked); ctx.refresh(); },
        }),
        ' Engrave a border just inside the edge')
      : null,
    silhouette && p.line2
      ? h('label', { class: 'check' },
        h('input', {
          type: 'checkbox', ...(p.line2Cut ? { checked: true } : {}),
          onchange: (e) => { setParam('line2Cut', e.target.checked); ctx.refresh(); },
        }),
        ' Cut the second line out too')
      : null,
    silhouette && p.line2 && !p.line2Cut
      ? h('p', { class: 'hint' },
        'The second line is engraved on the bar. That is how the ones in the '
        + 'shops are made, and it always holds together.')
      : null,
    silhouette && p.line2Cut
      ? numberRow('Line 1 to line 2 (mm)', p.lineGap, {
        min: -30, max: 20, step: 0.5,
        onInput: (v) => { setParam('lineGap', v); ctx.refresh(); },
      })
      : null,
    silhouette && !outlineFace
      ? numberRow('Letter thickness (mm)', p.weight, {
        min: 1, max: 20, step: 0.5,
        onInput: (v) => { setParam('weight', v); ctx.refresh(); },
      })
      : null,
    silhouette && outlineFace
      ? h('div', { class: 'stat' },
        h('span', {}, 'Letters measure'),
        h('b', { class: d.cutStroke < 3 ? 'bad' : '' }, `${rnd(d.cutStroke, 1)} mm across`))
      : null,
    silhouette
      ? numberRow('Bar height (mm)', p.barHeight, {
        min: 4, max: 60, step: 1,
        onInput: (v) => { setParam('barHeight', v); ctx.refresh(); },
      })
      : null,
    silhouette
      ? numberRow('Bridge floating pieces (mm)', p.bridge, {
        min: 0, max: 8, step: 0.5,
        onInput: (v) => { setParam('bridge', v); ctx.refresh(); },
      })
      : null,
    silhouette
      ? h('p', { class: 'hint' },
        'The dot on an i has nothing holding it. A bridge is a deliberate thin '
        + 'connector that keeps it attached; set it to zero to leave the piece '
        + 'loose and glue it on by hand.'
        + (d.bridges ? ` ${d.bridges} added here.` : ''))
      : null));

  root.append(group('Typeface', true,
    ...facePicker(ctx),
    p.line2 ? face2Select(ctx) : null));

  root.append(group('Base', false,
    numberRow('Layers', p.baseLayers, {
      min: 1, max: 6, step: 1,
      onInput: (v) => { setParam('baseLayers', Math.round(v)); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      d.layers === 1
        ? 'One board with the slot cut straight through it. The face drops in '
          + `${rnd(d.tenonDepth, 1)} mm and finishes flush underneath - glue it `
          + 'and you are done.'
        : `${d.layers} boards glued up: the bottom one solid, ${d.layers - 1} with `
          + `the slot cut through. That leaves a socket ${rnd(d.tenonDepth, 1)} mm `
          + 'deep with a floor. A laser cannot cut half way into a board, so '
          + 'stacking is the only way to get a pocket out of it.'),
    numberRow('Depth (mm, 0 = automatic)', p.baseDepth, {
      min: 0, max: 140, step: 1,
      onInput: (v) => { setParam('baseDepth', v); ctx.refresh(); },
    }),
    numberRow('Overhang each side (mm)', p.overhang, {
      min: 0, max: 40, step: 1,
      onInput: (v) => { setParam('overhang', v); ctx.refresh(); },
    }),
    numberRow('Slot inset (mm)', p.slotInset, {
      min: 3, max: 60, step: 1,
      onInput: (v) => { setParam('slotInset', v); ctx.refresh(); },
    }),
    numberRow('Corner radius (mm)', p.corner, {
      min: 0, max: 20, step: 0.5,
      onInput: (v) => { setParam('corner', v); ctx.refresh(); },
    })));

  const mat = material();
  const matSel = h('select', {
    onchange: (e) => { setMaterial(e.target.value); ctx.refresh(); },
  }, MATERIALS.map((m) => h('option', {
    value: m.id, ...(m.id === state.material ? { selected: true } : {}),
  }, m.id === 'custom' ? m.name : `${m.name} (${m.t} mm)`)));

  root.append(group('Material', false,
    h('div', { class: 'field' }, h('label', {}, 'Board'), matSel),
    h('div', { class: 'row' },
      h('span', { class: 'swatch', style: `background:${mat.color}` }),
      h('span', { class: 'muted' },
        `${mat.name} · ${rnd(p.thickness, 2)} mm · ${rnd(p.kerf, 2)} mm kerf`)),
    // These two are the board's own numbers, so the picker sets them - but a
    // shop that has measured its actual stock has to be able to overrule it,
    // and doing so is what makes the board custom.
    numberRow('Thickness (mm)', p.thickness, {
      min: 1.5, max: 12, step: 0.1,
      onInput: (v) => { setBoardNumber('thickness', v); ctx.refresh(); },
    }),
    numberRow('Kerf (mm)', p.kerf, {
      min: 0, max: 1, step: 0.02,
      onInput: (v) => { setBoardNumber('kerf', v); ctx.refresh(); },
    }),
    // Fit is not a property of the board. It is how hard you want to push.
    numberRow('Fit (mm)', p.fit, {
      min: -0.3, max: 0.4, step: 0.01,
      onInput: (v) => { setParam('fit', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'A board is one thing, so choosing it sets the thickness the stand is cut '
      + 'for, the kerf that stock burns at, and the colour the 3D view shows. '
      + 'Kerf is how wide your beam burns; every path moves half of it so the '
      + 'finished part measures what it says. Fit makes the slot tighter than '
      + 'the tenon by that much, so it has to be pushed home.')));

  // Hidden for now at the boss's request - the numbers are all in the export
  // dialog and the top bar already carries the finished size. Flip this back on
  // to bring the panel and its speed and sheet-width controls back.
  const SHOW_JOB = false;
  const sheet = nest(r.panels, { sheetWidth: state.sheetWidth });
  const seconds = state.speed > 0 ? d.cutLength / state.speed : 0;
  if (SHOW_JOB) root.append(group('Job', false,
    h('div', { class: 'stat' },
      h('span', {}, 'Pieces'), h('b', {}, String(r.panels.length))),
    h('div', { class: 'stat' },
      h('span', {}, 'Stand'),
      h('b', {}, `${rnd(d.baseW, 1)} x ${rnd(d.baseD, 1)} x ${rnd(d.standHeight, 1)} mm`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Sheet needed'),
      h('b', {}, `${rnd(sheet.width, 1)} x ${rnd(sheet.height, 1)} mm`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Cut length'), h('b', {}, `${rnd(d.cutLength / 1000, 2)} m`)),
    h('div', { class: 'stat' },
      h('span', {}, 'Engrave length'), h('b', {}, `${rnd(d.engraveLength / 1000, 2)} m`)),
    numberRow('Cut speed (mm/s)', state.speed, {
      min: 2, max: 200, step: 1,
      onInput: (v) => { update((s) => { s.speed = v; }, { history: false }); ctx.refresh(); },
    }),
    h('div', { class: 'stat' },
      h('span', {}, 'Rough cut time'), h('b', {}, formatTime(seconds))),
    numberRow('Sheet width (mm)', state.sheetWidth, {
      min: 100, max: 1500, step: 10,
      onInput: (v) => {
        update((s) => { s.sheetWidth = v; }, { history: false });
        ctx.refresh();
      },
    })));

  root.append(h('button', {
    class: 'link', type: 'button',
    onclick: () => {
      if (!confirm('Start over? This clears the name and every setting.')) return;
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

export function renderWarnings(root) {
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
  dlg.querySelector('#exportSummary').textContent =
    `${r.panels.length} pieces on a ${rnd(sheet.width, 1)} x ${rnd(sheet.height, 1)} mm `
    + `sheet of ${rnd(r.params.thickness, 1)} mm board, `
    + `${rnd(d.cutLength / 1000, 2)} m of cutting.`;
  // Only the layers this particular job actually contains, so the key never
  // lists a colour that is not in the file.
  const key = [
    ['cut', true],
    ['engraveFill', d.engraveFill],
    ['engrave', d.engraveLine],
  ].filter(([, on]) => on).map(([id]) => LAYERS[id]);
  dlg.querySelector('#layerKey').replaceChildren(...key.map((L) => h('span', {},
    h('i', { style: `background:${L.color};border:1px solid var(--line-strong)` }),
    L.label)));

  const notes = ['Red is cut.'];
  if (d.engraveFill) {
    notes.push('Black is the filled shape of each letter - set it to Fill or '
      + 'Scan, because a Line operation would trace round them and leave them '
      + 'hollow.');
  }
  if (d.engraveLine) {
    notes.push('Blue is single-line strokes - set it to Line or Engrave, '
      + 'because a Fill would find no enclosed area and mark nothing.');
  }
  notes.push('Both files carry real millimetres, so they import at size.');
  notes.push(r.derived.layers === 1
    ? 'The slot goes right through the base; push the face in until it is flush '
      + 'underneath, then glue.'
    : 'Glue the base layers up with the face already in the slot, so they line up.');
  dlg.querySelector('#exportNote').textContent = notes.join(' ');
  const empty = !r.panels.length;
  dlg.querySelector('#dlSvg').disabled = empty;
  dlg.querySelector('#dlPdf').disabled = empty;
}

export function fillHelpDialog(dlg) {
  dlg.querySelector('#helpBody').replaceChildren(
    h('p', {},
      'A table name stand is two pieces: a face that carries the name, and a '
      + 'base with a slot for it to stand in.'),
    h('p', {},
      'The base is a stack of identical boards. Every layer but the bottom one '
      + 'has the slot cut right through, so once they are glued together the '
      + 'slot has a floor. That is the whole trick - a laser cuts through or it '
      + 'does not cut, so a blind pocket has to be built in layers.'),
    h('h3', {}, 'Plate or cut-out'),
    h('p', {},
      'A plate is a rounded rectangle with the name engraved on it. It is '
      + 'strong, quick, and any typeface works no matter how fine.'),
    h('p', {},
      'A cut-out makes the letters themselves the outline. It looks far better '
      + 'and it is far easier to get wrong: a letter that touches nothing falls '
      + 'out of the sheet. The tool counts the pieces and says so before you '
      + 'cut, and it can bridge the ones that float - the dot on an i has '
      + 'nothing holding it up.'),
    h('h3', {}, 'How thin is too thin'),
    h('p', {},
      'Cut-out letters need roughly 3 mm of material across a stroke to survive '
      + 'handling. A lot of well-known typefaces are nowhere near that at a '
      + 'normal size - Montserrat Regular measures 0.9 mm at a 34 mm capital. '
      + 'Those are marked, and they are still perfectly good engraved on a plate.'),
    h('h3', {}, 'Credits'),
    h('p', { class: 'hint' },
      'The single-line faces are derived from the Hershey Fonts, originally '
      + 'created by Dr. A. V. Hershey while working at the U. S. National Bureau '
      + 'of Standards. The rest are public domain (CC0) or under the SIL Open '
      + 'Font License; every one is listed with its licence in '
      + 'src/font/LICENCES.txt.'));
}

export function renderActions({ undoBtn, redoBtn }) {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
}

export { rnd, formatTime };
