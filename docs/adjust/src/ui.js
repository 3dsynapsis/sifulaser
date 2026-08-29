// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.
// Control idioms follow the Box Maker so the five tools feel like one family.

import {
  state, update, setParam, setTargetWidth, getResult, canUndo, canRedo,
  effectiveT0, reguess, clearSource, beginGesture, endGesture,
  SCALE_MIN, SCALE_MAX,
} from './store.js';
import { UNIT_CHOICES } from './importArt.js';
import { LAYERS, splitLayers } from './export.js';

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

export const rnd = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p;

const clamp = (v, min, max) => {
  if (Number.isNaN(v)) return min ?? 0;
  let out = v;
  if (min != null) out = Math.max(min, out);
  if (max != null) out = Math.min(max, out);
  return out;
};

/**
 * A slider that is safe to drag.
 *
 * Two things have to be true at once. Dragging must not rebuild the inspector -
 * the node under the pointer would be replaced and the drag would end - so the
 * live callback only touches the store and lets the preview follow through its
 * subscription; the panel is rebuilt on release, when its readouts can be
 * brought up to date in one go. And the whole drag has to be one undo step, so
 * the gesture is opened on the first move rather than on every move.
 */
let dragging = false;

function liveRange({
  min, max, step, value, onInput, onDisplay,
}) {
  return h('input', {
    type: 'range',
    min,
    max,
    step,
    value,
    oninput: (e) => {
      if (!dragging) {
        dragging = true;
        beginGesture();
      }
      const v = parseFloat(e.target.value);
      onDisplay?.(v);
      onInput(v, true);
    },
    onchange: (e) => {
      dragging = false;
      // The last value goes in while history is still suspended, then the
      // gesture closes. The other way round, releasing the slider would push a
      // second entry holding the value the drag had already reached, and one
      // drag would cost two presses of undo.
      onInput(parseFloat(e.target.value), false);
      endGesture();
    },
  });
}

function numberRow(label, value, {
  min, max, step = 1, unit, onInput, slider = true, hint,
}) {
  const num = h('input', {
    type: 'number',
    value: rnd(value, 3),
    min,
    max,
    step,
    onchange: (e) => {
      if (dragging) {
        dragging = false;
        endGesture();
      }
      onInput(clamp(parseFloat(e.target.value), min, max), false);
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
      h('div', { class: 'num', style: 'flex:0 0 96px' },
        num,
        unit && h('span', { class: 'unit' }, unit))),
    hint && h('p', { class: 'hint' }, hint));
}

function group(title, open, ...body) {
  return h('details', { class: 'group', open },
    h('summary', {}, title),
    h('div', { class: 'group-body' }, ...body));
}

function stat(label, value, bad = false) {
  return h('div', { class: 'stat' },
    h('span', {}, label),
    h('b', { class: bad ? 'bad' : null }, value));
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

// ---- panels ---------------------------------------------------------------

function filePanel(ctx) {
  const src = state.source;
  const note = {
    mm: 'The file says millimetres, so its numbers are taken as they stand.',
    cm: 'The file is drawn in centimetres.',
    in: 'The file is drawn in inches.',
    pt: 'The file is drawn in points.',
    pc: 'The file is drawn in picas.',
    px: 'The file is sized in pixels, read at 96 dpi as the SVG spec says.',
    assumed: 'The file declares no physical size at all. Pixels at 96 dpi is the '
      + 'assumption; if the numbers below look wrong by 25.4 or by 3.78, the file '
      + 'was drawn in something else. Set it here.',
  }[src?.unitSource] || '';

  return group('File', true,
    src
      ? h('div', { class: 'file-row' },
        h('span', { class: 'file-name', title: state.file?.name }, state.file?.name || 'sample'),
        h('button', {
          class: 'link', type: 'button', onclick: () => { clearSource(); ctx.refresh(); },
        }, 'remove'))
      : h('p', { class: 'hint' }, 'Nothing loaded yet.'),
    h('div', { class: 'row' },
      h('button', { class: 'ghost wide', type: 'button', onclick: () => ctx.pickFile() },
        'Open an SVG'),
      h('button', { class: 'ghost wide', type: 'button', onclick: () => ctx.loadSample() },
        'Load a sample')),
    src && h('div', { class: 'field' },
      h('label', {}, 'File units'),
      h('select', {
        class: 'face-select',
        onchange: (e) => {
          setParam('units', e.target.value);
          reguess();
          ctx.refresh();
        },
      }, UNIT_CHOICES.map(([id, label]) => h('option', {
        value: id,
        selected: state.params.units === id,
      }, label)))),
    src && h('p', { class: 'hint' }, note),
    src && stat('Shapes read', src.rings.length));
}

function sizePanel(ctx) {
  const r = getResult();
  if (!r) return null;
  const ob = r.originalBounds;
  const targetW = (ob.w * r.scale);
  const targetH = (ob.h * r.scale);

  return group('Overall size', true,
    numberRow('Scale', state.params.scalePct, {
      min: SCALE_MIN,
      max: SCALE_MAX,
      step: 0.5,
      unit: '%',
      onInput: (v, live) => { setParam('scalePct', v); if (!live) ctx.refresh(); },
    }),
    h('div', { class: 'field' },
      h('label', {}, 'Width across the whole file'),
      h('div', { class: 'row' },
        h('div', { class: 'num', style: 'flex:1' },
          (() => {
            const inp = h('input', {
              type: 'number',
              step: 0.5,
              // The same range as the Scale row, expressed as a width, so the
              // two controls cannot be made to disagree.
              min: rnd((ob.w * SCALE_MIN) / 100, 2),
              max: rnd((ob.w * SCALE_MAX) / 100, 2),
              onchange: (e) => {
                setTargetWidth(parseFloat(e.target.value));
                ctx.refresh();
              },
            });
            inp.value = rnd(targetW, 2);
            return inp;
          })(),
          h('span', { class: 'unit' }, 'mm')),
        h('button', {
          class: 'ghost', type: 'button', onclick: () => { setParam('scalePct', 100); ctx.refresh(); },
        }, 'Reset'))),
    h('p', { class: 'hint' },
      `Was ${rnd(ob.w, 2)} x ${rnd(ob.h, 2)} mm, becomes ${rnd(targetW, 2)} x `
      + `${rnd(targetH, 2)} mm before the thickness pass. Scaling multiplies `
      + 'everything, slots included - which is why the thickness knob exists.'));
}

function thicknessPanel(ctx) {
  const r = getResult();
  if (!r) return null;
  const g = state.source?.guess;
  const t0 = effectiveT0();
  const overridden = Number.isFinite(state.params.t0) && state.params.t0 > 0;

  const guessLine = !g || !g.value
    ? h('p', { class: 'warn' },
      'Nothing in this file looks like a thickness. Type what it was drawn for.')
    : h('p', { class: 'hint' },
      `Guessed from the file: ${rnd(g.value, 3)} mm, from ${g.votes} of ${g.total} `
      + `small features${g.runnersUp.length
        ? `. Next most common: ${g.runnersUp.map((u) => `${rnd(u.value, 2)} mm`).join(', ')}`
        : ''}.`);

  return group('Material thickness', true,
    numberRow('Drawn for', t0 ?? 0, {
      min: 0.5,
      max: 30,
      step: 0.1,
      unit: 'mm',
      onInput: (v, live) => { setParam('t0', v); if (!live) ctx.refresh(); },
    }),
    guessLine,
    overridden && h('button', {
      class: 'link',
      type: 'button',
      onclick: () => { setParam('t0', null); ctx.refresh(); },
    }, 'use the guess again'),
    numberRow('You have', state.params.t1, {
      min: 0.5,
      max: 30,
      step: 0.1,
      unit: 'mm',
      onInput: (v, live) => { setParam('t1', v); if (!live) ctx.refresh(); },
    }),
    numberRow('Tolerance', state.params.tolerance, {
      min: 0.05,
      max: 1.5,
      step: 0.05,
      unit: 'mm',
      onInput: (v, live) => { setParam('tolerance', v); if (!live) ctx.refresh(); },
      hint: 'How far a feature may sit from the drawn-for thickness and still be '
        + 'treated as one. Widen it if slots are being missed; narrow it if things '
        + 'are being changed that should not be.',
    }));
}

/**
 * The tally.
 *
 * This panel is the point of the tool, not a status readout. Everything above it
 * is inference, and inference that cannot be audited is worse than no tool at
 * all - a slot resized wrongly looks exactly like a slot resized rightly until
 * the sheet is cut. So the counts are stated flatly, the ones that mean "go and
 * look" are coloured, and the sentence under them says out loud that this is a
 * guess about somebody else's drawing.
 */
function reportPanel() {
  const r = getResult();
  if (!r) return null;
  const rep = r.report;
  const nothing = rep.slots === 0 && rep.tabs === 0 && rep.unrecognised === 0;

  return group('What it found', true,
    stat('Slots resized', rep.slots),
    stat('Tab depths resized', rep.tabs),
    stat('Features not recognised', rep.unrecognised, rep.unrecognised > 0),
    stat('Shapes left alone', rep.untouched + rep.open),
    nothing
      ? h('p', { class: 'hint' },
        'Nothing in this file depends on material thickness - no slots, no tabs, '
        + 'nothing the width of a board. The thickness knob has nothing to do here '
        + 'and has changed nothing. Scaling it is safe.')
      : h('p', { class: 'hint' },
        'This is inference, not magic. Nothing in an SVG says "this rectangle is a '
        + 'slot" - shapes are measured and the ones that look like joinery are '
        + 'changed. Anything ambiguous is left exactly as it was and counted above. '
        + 'Check the orange marks in the result pane against what you expected, and '
        + 'check anything red by eye.'),
    rep.unrecognised > 0 && h('p', { class: 'warn' },
      `${rep.unrecognised} feature${rep.unrecognised === 1 ? '' : 's'} could be read `
      + 'more than one way and were not touched. They are the dashed red marks.'),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        checked: state.showMarks,
        onchange: (e) => {
          update((s) => { s.showMarks = e.target.checked; }, { history: false });
        },
      }),
      'Mark what changed'));
}

export function renderInspector(root, ctx) {
  root.replaceChildren(
    h('h2', { class: 'insp-title' }, 'Adjust'),
    filePanel(ctx),
    sizePanel(ctx),
    thicknessPanel(ctx),
    reportPanel(),
  );
}

// ---- warnings -------------------------------------------------------------

/**
 * The warnings this whole tool was built around.
 *
 * Scaling a joinery file is the mistake that wastes the sheet, and it wastes it
 * quietly: the part comes out the size that was asked for and simply does not
 * go together, because scaling multiplies a 3 mm slot into a 4.5 mm one while
 * the board is still 3 mm.
 *
 * The thickness pass holds every feature it recognised at the thickness you
 * asked for, so for those the danger is handled. It cannot be handled for the
 * ones it did not recognise - those have been scaled along with everything
 * else, and that is the second warning, which is the sharper of the two.
 *
 * Neither blocks the export. Somebody may genuinely want a scaled copy of a
 * decorative panel, and a tool that argues with you is a tool you stop reading.
 */
export function warningsFor(result) {
  if (!result) return [];
  const out = [];
  const rep = result.report;
  const scaled = Math.abs(result.scale - 1) > 0.001;
  const t0 = result.t0;
  const sameBoard = t0 != null && Math.abs(Number(rep.t1) - Number(t0)) <= 0.001;

  if (scaled && sameBoard && result.joinery) {
    out.push({
      kind: 'danger',
      text: `Scaled to ${rnd(result.scale * 100, 1)}% with the thickness left at the `
        + `${rnd(t0, 2)} mm this file was drawn for. Scaling multiplies slots too, so `
        + `a ${rnd(t0, 2)} mm slot would have come out ${rnd(t0 * result.scale, 2)} mm. `
        + `The ${rep.slots + rep.tabs} feature${rep.slots + rep.tabs === 1 ? '' : 's'} `
        + `that were recognised have been held at ${rnd(t0, 2)} mm instead. If you are `
        + 'cutting a different board, set "You have" to it.',
    });
  }
  if (scaled && rep.unrecognised > 0) {
    out.push({
      kind: 'danger',
      text: `${rep.unrecognised} feature${rep.unrecognised === 1 ? ' was' : 's were'} not `
        + `recognised, so ${rep.unrecognised === 1 ? 'it has' : 'they have'} been scaled `
        + `along with everything else. At ${rnd(result.scale * 100, 1)}% anything among `
        + `${rep.unrecognised === 1 ? 'it' : 'them'} that was a `
        + `${rnd(t0 ?? 0, 2)} mm feature is now ${rnd((t0 ?? 0) * result.scale, 2)} mm. `
        + 'They are the dashed red marks - check them before you cut.',
    });
  }
  if (result.t0 == null) {
    out.push({
      kind: 'warn',
      text: 'No thickness could be guessed from this file, so nothing has been '
        + 'refitted. Type the thickness it was drawn for.',
    });
  }
  if (state.source?.unitSource === 'assumed') {
    out.push({
      kind: 'warn',
      text: 'This file declares no physical size, so its millimetres are an '
        + 'assumption. Check the sizes under each pane before you cut.',
    });
  }
  return out;
}

export function renderWarnings(root) {
  const list = warningsFor(getResult());
  root.replaceChildren(...list.map((w) => h('div', {
    class: `warn-box ${w.kind}`,
  }, w.text)));
  root.hidden = list.length === 0;
}

// ---- toolbar --------------------------------------------------------------

export function renderActions({ undoBtn, redoBtn, exportBtn }) {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
  if (exportBtn) exportBtn.disabled = !state.source;
}

// ---- dialogs --------------------------------------------------------------

export function fillExportDialog(dlg) {
  const r = getResult();
  const summary = dlg.querySelector('#exportSummary');
  const key = dlg.querySelector('#layerKey');
  const note = dlg.querySelector('#exportNote');
  const opts = dlg.querySelector('#exportOpts');
  if (!r) return;

  const layers = splitLayers(r.rings, state.source.shapes, {
    keepLayers: state.params.keepLayers,
  });
  summary.textContent = `${rnd(r.bounds.w, 2)} x ${rnd(r.bounds.h, 2)} mm, `
    + `${r.rings.length} shapes. ${r.report.slots} slots and ${r.report.tabs} tab `
    + `depths were refitted to ${rnd(r.report.t1, 2)} mm; `
    + `${r.report.unrecognised} were not recognised.`;

  const present = [
    layers.cut.length && LAYERS.cut,
    layers.engraveFill.length && LAYERS.engraveFill,
    layers.engrave.length && LAYERS.engrave,
  ].filter(Boolean);
  key.replaceChildren(...present.map((l) => h('span', {},
    h('i', { class: 'swatch', style: `background:${l.color}` }), l.label)));

  opts.replaceChildren(h('label', { class: 'check' },
    h('input', {
      type: 'checkbox',
      checked: state.params.keepLayers,
      onchange: (e) => {
        setParam('keepLayers', e.target.checked);
        fillExportDialog(dlg);
      },
    }),
    "Read layers from the file's own colours"));

  note.textContent = state.params.keepLayers
    ? 'Red strokes cut, blue strokes score, filled shapes with no stroke engrave '
      + 'solid. Anything else cuts.'
    : 'Everything goes on the cut layer, which is what a downloaded template '
      + 'almost always is. Shapes with no area cannot be cut and are written as '
      + 'score lines.';
}

/**
 * Kerf, stated the way the tool actually behaves.
 *
 * Nothing here adds or removes kerf compensation - but the size knob multiplies
 * every coordinate, and an offset built into the original is a coordinate like
 * any other. Saying only "kerf is left alone" reads as a promise that the
 * compensation survives a resize, and it does not.
 */
export const KERF_NOTE = 'No kerf is added or taken away here. Whatever '
  + 'compensation the original had, the thickness pass leaves untouched - but the '
  + 'size knob multiplies it along with everything else, so a file drawn with '
  + '0.1 mm of compensation carries 0.15 mm at 150%. On a big change of size, '
  + 'compensate again in your laser software rather than trusting the original.';

export function fillHelpDialog(dlg) {
  dlg.querySelector('#helpBody').replaceChildren(
    h('p', { class: 'hint' },
      'Two knobs, and they are not the same operation. That is the whole tool.'),
    h('ol', { class: 'steps' },
      h('li', {}, 'Overall size ',
        h('span', {},
          '- multiplies every coordinate. The part gets bigger and so does every '
          + 'slot in it. On a decorative panel that is all you need.')),
      h('li', {}, 'Material thickness ',
        h('span', {},
          '- changes only the dimensions that exist because the board has a '
          + 'thickness: the width of a slot, the depth of a tab. It moves nothing '
          + 'else and it scales nothing.')),
      h('li', {}, 'Both at once ',
        h('span', {},
          '- a 100 mm box drawn for 3 mm ply, wanted at 150 mm out of 5 mm ply, '
          + 'needs both. The size knob alone would take its 3 mm slots to 4.5 mm '
          + 'and the box would not go together, so the thickness pass runs after '
          + 'the scale and puts every feature it recognised back to the board you '
          + 'said you have. The ones it did not recognise are the ones to check.'))),
    h('p', { class: 'hint' },
      'The thickness the file was drawn for is guessed by measuring every small '
      + 'feature in it and taking the most common answer. It is usually right and '
      + 'it is always shown, so you can overrule it.'),
    h('p', { class: 'hint' },
      'What gets recognised: rectangular holes with one side the thickness, and '
      + 'runs of tabs or notches on an outline whose depth is the thickness. What '
      + 'does not: slots with rounded or relieved corners, square holes, and '
      + 'anything else that could be read two ways. Those are counted, marked in '
      + 'red, and left exactly as they were.'),
    h('p', { class: 'hint' }, KERF_NOTE),
  );
}
