// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.
// Control idioms follow the Box Maker so the six tools feel like one family.

import {
  state, update, setParam, getResult, canUndo, canRedo, reset, CM,
  MATERIALS, material, setMaterial, setBoardNumber, applyPreset,
} from './store.js';
import { layout, faceLoaded, faceFailed, loadFace, isOutline } from './geom/text.js';
import {
  CONNECT_MODES, MIN_STROKE, PRESETS, matchesPreset,
  CAKE_SIZES, cakeSizeOf, cakeSizeFor,
} from './geom/topper.js';
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
      h('div', { class: 'num', style: 'flex:0 0 92px' },
        num, unit && h('span', { class: 'unit' }, unit))));
}

function seg(options, current, onPick) {
  return h('div', { class: 'seg' }, options.map(([id, label]) => h('button', {
    type: 'button', 'aria-pressed': String(current === id),
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

// ---- typeface picker ------------------------------------------------------
export const CATEGORY_NAMES = {
  script: 'Cursive',
  block: 'Block',
  serif: 'Serif',
  display: 'Display',
  line: 'Single line',
};

const CATEGORY_NOTES = {
  script: 'Joined by nature, which is exactly what a topper needs - the letters '
    + 'hold hands and the whole message comes off the sheet in one piece.',
  block: 'Upright and separate. Every letter will need thickening or a bridge to '
    + 'reach its neighbour.',
  serif: 'Formal, and mostly too fine to cut this small. Thicken generously.',
  display: 'Heavy, so it cuts well - but the letters still stand apart.',
  line: 'Skeleton faces with no thickness of their own. The tool gives them one.',
};

// Cursive first. On a cake topper it is not one option among five, it is the
// answer nine times out of ten.
const CATEGORY_ORDER = ['script', 'display', 'block', 'serif', 'line'];

let activeCat = null;

function faceThumb(face) {
  const r = layout({ faceData: face, text: face.name, capHeight: 10, align: 'left' });
  if (!r.paths.length) return '';
  const { bbox } = r;
  const w = Math.max(0.01, bbox.x1 - bbox.x0);
  const hgt = Math.max(0.01, bbox.y1 - bbox.y0);
  const filled = isOutline(face);
  const d = r.paths.map((st) => {
    const seg2 = [`M ${(st[0] - bbox.x0).toFixed(2)} ${(bbox.y1 - st[1]).toFixed(2)}`];
    for (let k = 2; k < st.length; k += 2) {
      seg2.push(`L ${(st[k] - bbox.x0).toFixed(2)} ${(bbox.y1 - st[k + 1]).toFixed(2)}`);
    }
    return seg2.join(' ') + (filled ? ' Z' : '');
  }).join(' ');
  return `<svg viewBox="-1 -1 ${w + 2} ${hgt + 2}" preserveAspectRatio="xMinYMid meet" `
    + `aria-hidden="true" class="${filled ? 'thumb-fill' : 'thumb-line'}">`
    + `<path d="${d}"/></svg>`;
}

function facePicker(ctx) {
  const p = state.params;
  const current = ctx.faces.find((f) => f.id === p.face);
  if (!activeCat) activeCat = current?.cat || 'script';
  const cats = CATEGORY_ORDER.filter((c) => ctx.faces.some((f) => f.cat === c));
  const inCat = ctx.faces.filter((f) => f.cat === activeCat);

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
      return h('button', {
        class: 'face-opt', type: 'button',
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
 * Somebody opening this tool for the first time wants a cake topper, not a
 * lesson in line height. These go at the very top because one click gets them a
 * finished, warning-free piece they can then type their own name into - which
 * is also the fastest way to learn what the settings underneath are for.
 *
 * A preset that matches what is on screen is shown as chosen, but only until
 * anything is edited: it is a starting point, not a mode.
 */
function presetPicker(ctx) {
  const p = state.params;
  const current = PRESETS.find((x) => matchesPreset(x, p));
  return [
    h('div', { class: 'cards presets' }, PRESETS.map((x) => h('button', {
      class: 'card', type: 'button', title: x.note,
      'aria-pressed': String(current?.id === x.id),
      onclick: () => {
        applyPreset(x);
        // The face a preset asks for is usually not in memory: the picker only
        // fetches a category when somebody opens it. Draw with what is there,
        // then draw again when the face lands - or when it does not. A failed
        // fetch has to redraw as well, because the preset's face is already
        // committed by then and the canvas is blank until something says why.
        if (!faceLoaded(x.params.face)) {
          loadFace(x.params.face).then(() => ctx.refresh(), () => ctx.refresh());
        }
        ctx.refresh();
      },
    }, x.name))),
    h('p', { class: 'hint' },
      'Each of these sets the whole design - the words, the typeface, the width, '
      + 'the line height, the thickening and the stakes - because those numbers '
      + 'only work together. Type your own name over the placeholder.'),
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

export function renderInspector(root, ctx) {
  if (sliderDragging) return;
  const active = document.activeElement;
  const keepText = active && active.classList.contains('text-area');
  const caret = keepText ? [active.selectionStart, active.selectionEnd] : null;

  root.replaceChildren();
  root.append(h('h2', { class: 'insp-title' }, 'Cake topper'));
  const p = state.params;
  const r = getResult();
  const d = r.derived;

  // ---- the message is the whole object, so it goes first.
  const area = h('textarea', {
    class: 'text-area', spellcheck: 'false', rows: 3,
    placeholder: 'Happy\nBirthday\nSylvia',
    oninput: (e) => {
      update((s) => { s.params.text = e.target.value; }, { history: false });
      ctx.refreshPreviewOnly();
    },
    onchange: (e) => { setParam('text', e.target.value); ctx.refresh(); },
  });
  area.value = p.text;

  root.append(group('Start from', true, ...presetPicker(ctx)));

  root.append(group('Message', true,
    area,
    h('div', { class: 'field' },
      h('label', {}, 'Alignment'),
      seg(ALIGNS, p.align, (id) => { setParam('align', id); ctx.refresh(); })),
    numberRow('Line height (%)', p.lineHeight, {
      min: 30, max: 140, step: 1,
      onInput: (v) => { setParam('lineHeight', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'Under 100% the lines overlap, and on a topper that is the point - the '
      + 'whole message has to come off the sheet as one piece. Spaces are a '
      + 'good way to nudge a short line into line with a long one.')));

  // Nobody knows what width a topper should be; everybody knows what size their
  // cake is. So the size is offered as the cake, and the millimetres follow.
  const matched = cakeSizeFor(p.width);
  root.append(group('Size', true,
    h('div', { class: 'field' },
      h('label', {}, 'Common sizes'),
      seg(CAKE_SIZES.map((c) => [c.id, c.name]), matched ? matched.id : '',
        (id) => { setParam('width', cakeSizeOf(id).width); ctx.refresh(); })),
    h('p', { class: 'hint' },
      'These are topper widths, not cake widths: 12 cm suits a 6 inch cake and '
      + '18 cm an 8 inch one. A topper wants to be an inch or two narrower than '
      + 'the top of the cake so a border of icing still shows around it - wider '
      + 'than that and it hangs over the edge.'),
    numberRow('Width across (cm)', p.width / CM, {
      min: 4, max: 50, step: 0.5,
      onInput: (v) => { setParam('width', v * CM); ctx.refresh(); },
    }),
    h('div', { class: 'stat' },
      h('span', {}, 'Finished piece'),
      h('b', {}, `${rnd(d.width / CM, 1)} x ${rnd(d.height / CM, 1)} cm`)),
    // What the piece measures and what anyone at the table sees are different
    // numbers, because a good part of it is in the cake.
    d.visibleHeight < d.height - 0.5
      ? h('div', { class: 'stat' },
        h('span', {}, 'Shows above the cake'),
        h('b', {}, `${rnd(d.visibleHeight / CM, 1)} cm tall`))
      : null));

  root.append(group('Typeface', true, ...facePicker(ctx)));

  const thin = d.stroke < MIN_STROKE;
  root.append(group('Joining', true,
    h('div', { class: 'stat' },
      h('span', {}, 'Letters measure'),
      h('b', { class: thin ? 'bad' : '' }, `${rnd(d.stroke, 1)} mm across`)),
    numberRow('Thicken (mm)', p.thicken, {
      min: 0, max: 8, step: 0.1,
      onInput: (v) => { setParam('thicken', v); ctx.refresh(); },
    }),
    d.suggestThicken > 0
      ? h('button', {
        class: 'link', type: 'button',
        onclick: () => { setParam('thicken', p.thicken + d.suggestThicken); ctx.refresh(); },
      }, `Thicken by ${d.suggestThicken} mm to reach ${MIN_STROKE} mm`)
      : null,
    h('p', { class: 'hint' },
      'Thickening grows the letters in every direction. It is what makes a fine '
      + 'script strong enough to push into a cake, and it also drags neighbouring '
      + 'letters into each other so they need no bridge at all.'),
    h('div', { class: 'field' },
      h('label', {}, 'Connect what is left floating'),
      seg(CONNECT_MODES, p.connect, (id) => { setParam('connect', id); ctx.refresh(); })),
    p.connect !== 'none'
      ? numberRow('Bridge width (mm)', p.bridge, {
        min: 0.5, max: 8, step: 0.1,
        onInput: (v) => { setParam('bridge', v); ctx.refresh(); },
      })
      : null,
    h('p', { class: 'hint' },
      'The dot on an i has nothing holding it, so it always needs a bridge. A '
      + 'whole letter adrift usually means the line height or the thickening is '
      + 'wrong - "Dots only" fixes what cannot be avoided and leaves the rest '
      + `visible.${d.bridges ? ` ${d.bridges} bridges here.` : ''}`)));

  root.append(group('Stakes', true,
    h('div', { class: 'field' },
      h('label', {}, 'How many'),
      seg([['0', 'None'], ['1', 'One'], ['2', 'Two']], String(p.stakes),
        (id) => { setParam('stakes', Number(id)); ctx.refresh(); })),
    p.stakes > 0
      ? numberRow('Length below the text (mm)', p.stakeLength, {
        min: 15, max: 140, step: 1,
        onInput: (v) => { setParam('stakeLength', v); ctx.refresh(); },
      })
      : null,
    p.stakes > 0
      ? numberRow('Width (mm)', p.stakeWidth, {
        min: 3, max: 30, step: 0.5,
        onInput: (v) => { setParam('stakeWidth', v); ctx.refresh(); },
      })
      : null,
    p.stakes > 0
      ? numberRow('Taper (%)', p.stakeTaper, {
        min: 0, max: 80, step: 5,
        onInput: (v) => { setParam('stakeTaper', v); ctx.refresh(); },
      })
      : null,
    p.stakes === 2
      ? numberRow('Spread (% of width)', p.stakeSpread, {
        min: 10, max: 95, step: 1,
        onInput: (v) => { setParam('stakeSpread', v); ctx.refresh(); },
      })
      : null,
    p.stakes > 0
      ? h('label', { class: 'check' },
        h('input', {
          type: 'checkbox', ...(p.stakeSnap ? { checked: true } : {}),
          onchange: (e) => { setParam('stakeSnap', e.target.checked); ctx.refresh(); },
        }),
        ' Slide each stake under the nearest letter')
      : null,
    p.stakes > 0
      ? h('p', { class: 'hint' },
        'A stake dropped in the gap between two letters welds to nothing and '
        + 'comes off the sheet as a splinter, so by default each one moves to the '
        + `nearest letter.${d.stakeSnapped ? ` ${d.stakeSnapped} moved.` : ''}`)
      : null,
    p.stakes > 0
      ? h('div', { class: 'stat' },
        h('span', {}, 'Balance'),
        h('b', { class: Math.abs(d.balance) > 1 ? 'bad' : '' },
          Math.abs(d.balance) > 1 ? 'leans over' : 'sits square'))
      : null));

  const mat = material();
  const matSel = h('select', {
    'aria-label': 'Acrylic sheet',
    onchange: (e) => { setMaterial(e.target.value); ctx.refresh(); },
  }, MATERIALS.map((m) => h('option', {
    value: m.id, ...(m.id === state.material ? { selected: true } : {}),
  }, m.id === 'custom' ? m.name : `${m.name} (${m.t} mm)`)));

  root.append(group('Material', false,
    h('div', { class: 'field' }, h('label', {}, 'Acrylic'), matSel),
    h('div', { class: 'row' },
      h('span', { class: 'swatch', style: `background:${mat.color}` }),
      h('span', { class: 'muted' },
        `${mat.name} · ${rnd(p.thickness, 2)} mm · ${rnd(p.kerf, 2)} mm kerf`)),
    // Both of these are the sheet's own numbers, so the picker sets them - but a
    // shop that has measured its actual stock has to be able to overrule it, and
    // doing so is what makes the sheet custom.
    numberRow('Thickness (mm)', p.thickness, {
      min: 1, max: 10, step: 0.1,
      onInput: (v) => { setBoardNumber('thickness', v); ctx.refresh(); },
    }),
    numberRow('Kerf (mm)', p.kerf, {
      min: 0, max: 1, step: 0.02,
      onInput: (v) => { setBoardNumber('kerf', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      mat.finish === 'wood'
        ? 'Falcata makes a good topper and a cheaper one, but it is for one '
          + 'occasion. Wood is porous: it takes up moisture and grease from the '
          + 'cake and cannot be washed clean again, so it does not come back out '
          + 'for the next birthday the way acrylic does.'
        : 'Cast acrylic wipes clean and can be used again, which is why most of '
          + 'this list is acrylic - a topper goes into food. Cast also cuts with '
          + 'a polished edge where extruded acrylic goes cloudy. Falcata is there '
          + 'too, for a single occasion.')));

  root.append(h('button', {
    class: 'link', type: 'button',
    onclick: () => {
      if (!confirm('Start over? This clears the message and every setting.')) return;
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
  // A typeface that did not arrive leaves buildTopper with nothing to build from
  // and no warning to give - it cannot tell a face that failed from one that is
  // still on its way, and the second is what every face is at start-up. So the
  // one place that does know says it, rather than leaving a blank canvas to be
  // read as "type a message".
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
  dlg.querySelector('#exportSummary').textContent =
    `One piece, ${rnd(d.width, 1)} x ${rnd(d.height, 1)} mm, in `
    + `${rnd(r.params.thickness, 1)} mm material. ${rnd(d.cutLength / 1000, 2)} m of `
    + `cutting, roughly ${formatTime(state.speed > 0 ? d.cutLength / state.speed : 0)}.`;
  dlg.querySelector('#layerKey').replaceChildren(
    h('span', {}, h('i', {
      style: `background:${LAYERS.cut.color};border:1px solid var(--line-strong)`,
    }), LAYERS.cut.label));
  dlg.querySelector('#exportNote').textContent =
    'Everything is cut - there is nothing to engrave on a topper. Both files '
    + 'carry real millimetres, so they import at size. Cast acrylic, and peel '
    + 'the masking off before the first wash.';
  const empty = !r.panels.length;
  dlg.querySelector('#dlSvg').disabled = empty;
  dlg.querySelector('#dlPdf').disabled = empty;
}

export function fillHelpDialog(dlg) {
  dlg.querySelector('#helpBody').replaceChildren(
    h('p', {},
      'A cake topper is one piece of acrylic with a name cut out of it and two '
      + 'stakes that push into the cake. The whole difficulty is the words "one '
      + 'piece".'),
    h('h3', {}, 'Why the lines overlap'),
    h('p', {},
      'Line height sits under 100% on purpose. If "Happy" does not physically '
      + 'touch "Birthday" then they are two separate bits of acrylic, and one of '
      + 'them is on the floor.'),
    h('h3', {}, 'Why thickening matters more than it looks'),
    h('p', {},
      'A script at 150 mm wide has strokes around a millimetre. That snaps the '
      + 'first time it is pushed into a cake. Thickening grows the letters, and '
      + 'it does a second job at the same time - it drags neighbouring letters '
      + 'into contact, so they need no bridges.'),
    h('h3', {}, 'Bridges'),
    h('p', {},
      'The dot on an i is not attached to anything. A bridge is a deliberate '
      + 'thin connector that keeps it on. If the tool has added a lot of them, '
      + 'thicken instead - a row of little connectors looks like what it is.'),
    h('h3', {}, 'Will it stand up'),
    h('p', {},
      'A topper hangs off its stakes. If the weight of the lettering is not over '
      + 'them it leans, and on a soft cake it goes on leaning. The tool works out '
      + 'where the weight actually sits and says so before you cut.'),
    h('h3', {}, 'Material'),
    h('p', {},
      'Cast acrylic, and the list has nothing else in it. A topper goes into '
      + 'food: wood is porous, takes up moisture and grease, and cannot be '
      + 'washed clean. Cast also cuts with a polished edge where extruded goes '
      + 'cloudy. Choosing a sheet sets the kerf as well as the colour, because '
      + 'both are properties of the same real material.'),
    h('h3', {}, 'The three views'),
    h('p', {},
      'On the cake shows what will be above the icing and what will be buried, '
      + 'and marks where the weight sits against where the stakes hold it. Flat '
      + 'is the piece exactly as the file is written. 3D is the finish - mirror '
      + 'and glitter are not colours, they are surfaces, and this is the only '
      + 'view that can show you the difference before you cut one.'),
    h('h3', {}, 'Credits'),
    h('p', { class: 'hint' },
      'The idea came from Cuttle’s Cake Topper Generator, including the nine '
      + 'typefaces it recommends. The engine here is our own - the same distance '
      + 'field that welds the lettering in our Stand Nama tool. Every typeface is '
      + 'public domain, SIL Open Font License or Apache 2.0, listed with its '
      + 'licence in src/font/LICENCES.txt. The 3D view is drawn with three.js, '
      + 'MIT licensed, vendored in vendor/.'));
}

export function renderActions({ undoBtn, redoBtn }) {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
}

export { rnd, formatTime };
