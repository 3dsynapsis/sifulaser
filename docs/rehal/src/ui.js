// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.
// The control idioms follow the Box Maker so the eleven tools feel like one
// family; the words are Bahasa Melayu, like the rest of this tool's shell.
//
// One thing here is not like the other tools and the reason is worth stating:
// a rehal takes between a tenth and six tenths of a second to build, because
// the pattern is a distance field over the whole panel and the connectivity
// prover walks it twice. So a slider drag does NOT rebuild the inspector, and
// it does not rebuild the stand on every pointer event either - it hands the
// job to main.js's scheduler, which follows the drag when it can keep up and
// waits for a pause when it cannot. See schedulePreview() there.

import {
  state, update, setParam, getResult, canUndo, canRedo, reset,
  MATERIALS, material, setMaterial, BOOKS, setBook, applyDesign,
  setDepthAuto, setDepth, setPreset,
  beginGesture, endGesture,
} from './store.js';
import { layout, faceLoaded, faceFailed, loadFace, isOutline } from './geom/text.js';
import {
  PRESETS, presetOf, pitchRange, presetSegments, TILINGS, starCell,
  CARTOUCHES, cartoucheRing, holeFloor, strapFloor,
} from './geom/pattern/index.js';
import {
  FACE_GROUPS, ANGLE_MIN, ANGLE_MAX, LIP_MIN, LIP_MAX,
} from './geom/rehal/index.js';
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

function numberRow(label, value, {
  min, max, step = 1, unit, ctx, set, slider = true, disabled = false,
}) {
  const numInput = h('input', {
    type: 'number',
    value: rnd(value, 3),
    min,
    max,
    step,
    ...(disabled ? { disabled: true } : {}),
    onchange: (e) => {
      sliderDragging = false;
      set(clamp(parseFloat(e.target.value), min, max));
      ctx.refresh();
    },
  });
  const range = slider
    ? h('input', {
      type: 'range',
      min,
      max,
      step,
      value,
      ...(disabled ? { disabled: true } : {}),
      onpointerdown: () => beginGesture(),
      // Live, but only the number box and the picture - not the inspector.
      oninput: (e) => {
        sliderDragging = true;
        const v = parseFloat(e.target.value);
        numInput.value = rnd(v, 3);
        set(v);
        ctx.refreshPreviewOnly();
      },
      onchange: (e) => {
        sliderDragging = false;
        endGesture();
        set(parseFloat(e.target.value));
        ctx.refresh();
      },
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
    label: 'Latar cerah',
    swatch: 'radial-gradient(120% 110% at 28% 18%, #ffffff 0%, #dde1e8 78%)',
  },
  {
    id: 'dark',
    label: 'Latar gelap',
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

// ---- pattern thumbnails ---------------------------------------------------
/**
 * Every preset's card is drawn from the engine's own geometry, at the
 * proportion it will have on the panel.
 *
 * Hand-drawn icons were the alternative and they are a trap: a picture of the
 * pattern that disagrees with the pattern goes on lying every time the engine
 * is touched. This asks the engine for the same lines buildPattern() works
 * from, so a card can only ever be wrong in the same way the panel is.
 *
 * TWO KINDS OF PRESET, TWO KINDS OF CARD, and it took shipping the wrong thing
 * to notice. Drawing the strap network for everything gave Khatam 8 and
 * Bintang Ringkas byte-identical cards - same tiling, same contact angle, so
 * the network really is the same drawing - while the panels they cut are
 * opposite products: an interlaced lattice with forty open cells against a
 * solid field with twenty star holes punched in it. A picker where two cards
 * are the same picture is worse than no picker, because the user picks one and
 * gets the other.
 *
 * So a punch preset is drawn as what it is: the star cells filled, on a solid
 * ground, which is the cut result for that mode rather than a network the
 * cutter never makes.
 *
 * For the strap presets it remains the UN-THICKENED network, not the cut
 * result - tracing ten distance fields to fill a picker would cost seconds. It
 * shows the LOOK truthfully and says nothing about web widths or connectivity;
 * the picture that is evidence is the stage, not the card.
 */
const thumbCache = new Map();

function patternThumb(preset, thetaOverride) {
  const key = `${preset.id}|${thetaOverride ?? '-'}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const W = 120;
  const H = 80;
  // The same number of cells across as the default panel would show, so a card
  // is at the scale it will actually be cut at.
  const pitch = pitchRange(preset).def * (W / 302);
  const rect = { x0: 0, y0: 0, x1: W, y1: H };
  let out;
  if (preset.gen === 'punch') {
    // The same two calls candidateCells() makes in punch mode, so the card and
    // the panel cannot drift apart.
    const til = TILINGS[preset.tiling];
    const theta = Math.max(til.thetaMin,
      Math.min(til.thetaMax, thetaOverride ?? preset.theta));
    let d = '';
    try {
      for (const f of til.faces(rect, pitch)) {
        const s = starCell(f, theta);
        if (!s || s.length < 3) continue;
        d += `${s.map(([x, y], i) => `${i ? 'L' : 'M'}${rnd(x, 1)} ${rnd(H - y, 1)}`).join('')}Z`;
      }
    } catch {
      d = '';
    }
    out = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true" class="pat-thumb pat-thumb-punch">`
      + `<path d="${d}" fill="currentColor" fill-rule="evenodd" stroke="none"/></svg>`;
  } else {
    let segs = [];
    try {
      segs = presetSegments(preset, rect, pitch, thetaOverride);
    } catch {
      segs = [];
    }
    const d = segs.map((s) => `M${rnd(s[0], 1)} ${rnd(H - s[1], 1)}L${rnd(s[2], 1)} ${rnd(H - s[3], 1)}`)
      .join('');
    const sw = Math.max(1.1, pitch * 0.1);
    out = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true" class="pat-thumb">`
      + `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${rnd(sw, 2)}" `
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  thumbCache.set(key, out);
  return out;
}

function cartoucheThumb(id) {
  const ring = cartoucheRing(id, 30, 22, 22, 16);
  if (!ring) {
    return '<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M12 22h36" '
      + 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  }
  const d = `${ring.map(([x, y], i) => `${i ? 'L' : 'M'}${rnd(x, 1)} ${rnd(44 - y, 1)}`).join('')}Z`;
  return `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="${d}" fill="none" `
    + 'stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>';
}

// ---- typeface picker ------------------------------------------------------
let activeGroup = null;

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
  const meta = (id) => ctx.faces.find((f) => f.id === id) || { id, name: id };
  const owning = FACE_GROUPS.find((g) => g.faces.includes(p.faceId)) || FACE_GROUPS[0];
  if (!activeGroup) activeGroup = owning.id;
  const group = FACE_GROUPS.find((g) => g.id === activeGroup) || FACE_GROUPS[0];

  // Only the group on screen is fetched. Thirty-three faces is well over a
  // megabyte of glyph data and nobody opens all three tabs.
  const pending = group.faces.filter((id) => !faceLoaded(id) && !faceFailed(id));
  if (pending.length) {
    Promise.all(pending.map((id) => loadFace(id).catch(() => null)))
      .then(() => ctx.refresh());
  }

  return [
    h('div', { class: 'cat-tabs' }, FACE_GROUPS.map((g) => h('button', {
      type: 'button',
      'aria-pressed': String(group.id === g.id),
      onclick: () => { activeGroup = g.id; ctx.refresh(); },
    }, g.name))),
    h('p', { class: 'hint' }, group.note),
    h('div', { class: 'faces-list' }, group.faces.map((id) => {
      const face = faceLoaded(id);
      return h('button', {
        class: 'face-opt',
        type: 'button',
        'aria-pressed': String(p.faceId === id),
        title: meta(id).name,
        onclick: () => { setParam('faceId', id); ctx.refresh(); },
      }, face
        ? h('span', { class: 'thumb', html: faceThumb(face) })
        : h('span', { class: 'muted' }, meta(id).name));
    })),
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

/**
 * What the dialogs are allowed to see of the store.
 *
 * Narrow on purpose: the gallery needs to read the design and put one back,
 * and nothing else.
 */
const galleryStore = {
  name: () => state.name,
  params: () => ({ ...state.params }),
  material: () => state.params.materialId,
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

// The three widths that sell: a small one for a child's Quran, the standard,
// and one for a large mushaf.
const WIDTHS = [280, 330, 380];

const VERDICT_WORD = { ok: 'Selamat', amber: 'Hampir terbalik', red: 'Akan terbalik' };

export function renderInspector(root, ctx) {
  if (sliderDragging) return;
  const active = document.activeElement;
  const keepText = active && active.classList.contains('text-area');
  const caret = keepText ? [active.selectionStart, active.selectionEnd] : null;

  root.replaceChildren();
  root.append(h('h2', { class: 'insp-title' }, 'Rehal'));

  const p = state.params;
  const r = getResult();
  const d = r.derived;
  const pat = d.pattern;
  const st = r.stability;
  const preset = presetOf(p.preset);
  const range = pitchRange(preset);
  const usedPitch = r.pattern.params.pitch;
  const usedTheta = r.pattern.params.theta;
  const tiling = preset.tiling ? TILINGS[preset.tiling] : null;
  const thetaAdjustable = !!tiling && tiling.thetaMax > tiling.thetaMin;
  const check = r.checks[0] || {};

  // ---- the pattern is what somebody is buying, so it goes first -----------
  root.append(group('Corak', true,
    h('div', { class: 'cards patterns' }, PRESETS.map((x) => h('button', {
      class: 'card pat',
      type: 'button',
      title: x.note,
      'aria-pressed': String(p.preset === x.id),
      onclick: () => { setPreset(x.id); ctx.refresh(); },
    }, h('span', { class: 'art', html: patternThumb(x) }), x.name))),
    h('p', { class: 'hint' }, preset.note),
    numberRow('Jarak corak (mm)', p.pitch ?? range.def, {
      min: range.min,
      max: range.max,
      step: 1,
      ctx,
      set: (v) => setParam('pitch', v),
    }),
    Math.abs(usedPitch - (p.pitch ?? range.def)) > 0.6
      ? h('p', { class: 'note' },
        `Dinaikkan ke ${rnd(usedPitch, 0)} mm: pada jarak yang diminta, sel corak `
        + `lebih kecil daripada lubang minimum ${rnd(holeFloor(p.thickness, p.kerf), 2)} mm `
        + '- lubang sebegitu tidak terbuka, hanya jadi kesan bakar.')
      : null,
    thetaAdjustable
      ? numberRow('Sudut jalinan (darjah)', p.theta ?? preset.theta, {
        min: tiling.thetaMin,
        max: tiling.thetaMax,
        step: 0.5,
        ctx,
        set: (v) => setParam('theta', v),
      })
      : null,
    thetaAdjustable
      ? h('p', { class: 'hint' },
        'Sudut jalur meninggalkan tengah setiap tepi. Kecil memberi bintang '
        + 'tumpul dan jalur sekata; besar memberi bintang tajam dan sel yang '
        + `runcing. Had ${tiling.thetaMin}-${tiling.thetaMax} darjah datang daripada `
        + 'geometri, bukan daripada rasa: di luar itu bintang tidak menjadi, '
        + 'atau hujung selnya terlalu tirus untuk terpotong.')
      : null,
    numberRow('Lebar jalur (mm)', p.strapWidth ?? r.pattern.params.strapWidth, {
      min: rnd(strapFloor(p.thickness, p.kerf), 2),
      max: 18,
      step: 0.1,
      ctx,
      set: (v) => setParam('strapWidth', v),
    }),
    h('p', { class: 'hint' },
      `Tidak boleh kurang daripada ${rnd(strapFloor(p.thickness, p.kerf), 2)} mm pada papan `
      + `${rnd(p.thickness, 1)} mm: web antara dua lubang kehilangan satu kerf penuh, `
      + 'separuh daripada setiap lubang.'),
    stat('Lubang', `${pat.holeCount}`),
    stat('Bahan dibuang', `${rnd(pat.areaRemovedPct, 0)}%`, pat.areaRemovedPct > 55),
    stat('Web tersempit (siap)',
      `${rnd((pat.minWebMm ?? 0) - p.kerf, 2)} mm (had ${rnd(d.minWidth, 2)} mm)`,
      (pat.minWebMm ?? 0) < (check.floor || 0)),
    pat.substituted
      ? h('p', { class: 'warn' },
        'Corak ini tidak boleh dipotong pada saiz dan papan ini, jadi corak '
        + 'lain digunakan. Besarkan panel atau pilih corak lain.')
      : null,
    pat.repairs || pat.rescales
      ? h('p', { class: 'note' },
        `Dibaiki: ${pat.repairs} lubang ditutup semula, ${pat.rescales} kali jarak `
        + 'dinaikkan. Menutup lubang hanya menambah bahan, jadi ia tidak boleh '
        + 'memutuskan apa-apa.')
      : null));

  // ---- the name ----------------------------------------------------------
  const nameField = h('input', {
    // text-area for the caret-restore in renderInspector; name-line because a
    // cartouche holds ONE name, not a paragraph, so it is a single line high.
    class: 'text-area name-line',
    type: 'text',
    spellcheck: 'false',
    placeholder: 'Nama',
    oninput: (e) => {
      update((s) => { s.params.name = e.target.value; }, { history: false });
      ctx.refreshPreviewOnly();
    },
    onchange: (e) => { setParam('name', e.target.value); ctx.refresh(); },
  });
  nameField.value = p.name;

  root.append(group('Nama', true,
    nameField,
    h('div', { class: 'field' },
      h('label', {}, 'Bentuk kartus'),
      h('div', { class: 'cards' }, ['kubah', 'bulat', 'bulan', 'bintang', 'none']
        .map((id) => h('button', {
          class: 'card',
          type: 'button',
          'aria-pressed': String(p.cartouche === id),
          onclick: () => { setParam('cartouche', id); ctx.refresh(); },
        }, h('span', { class: 'art', html: cartoucheThumb(id) }), CARTOUCHES[id].name)))),
    ...facePicker(ctx),
    numberRow('Tinggi huruf (mm)', p.capHeight, {
      min: 6, max: 40, step: 0.5, ctx, set: (v) => setParam('capHeight', v),
    }),
    d.nameCapHeight && Math.abs(d.nameCapHeight - p.capHeight) > 0.2
      ? h('p', { class: 'note' },
        `Dikecilkan ke ${rnd(d.nameCapHeight, 1)} mm supaya muat dalam kartus.`)
      : null,
    numberRow('Lebar bingkai kartus (mm)', p.band ?? rnd(Math.max(6, 2.5 * d.minWidth), 1), {
      min: 5, max: 15, step: 0.5, ctx, set: (v) => setParam('band', v),
    }),
    h('p', { class: 'hint' },
      'Nama diukir, bukan dipotong tembus, dan bahagian dalam kartus kekal '
      + 'pejal. Itu yang menjadikan setiap huruf mustahil untuk gugur. Corak '
      + 'dipotong pada BINGKAI kartus, bukan pada garisannya - jadi setiap '
      + 'jalur yang terputus di situ tersambung semula pada bingkai.')));

  // ---- size and angle ----------------------------------------------------
  const depth = r.params.depth;
  root.append(group('Saiz & sudut', true,
    h('div', { class: 'seg' }, WIDTHS.map((mm) => h('button', {
      type: 'button',
      'aria-pressed': String(Math.abs(p.width - mm) < 0.01),
      onclick: () => { setParam('width', mm); ctx.refresh(); },
    }, `${mm} mm`))),
    numberRow('Lebar keseluruhan (mm)', p.width, {
      min: 180, max: 700, step: 1, ctx, set: (v) => setParam('width', v),
    }),
    numberRow('Tinggi panel (mm)', p.height, {
      min: 120, max: 600, step: 1, ctx, set: (v) => setParam('height', v),
    }),
    stat('Panel corak', `${rnd(d.panelSize[0], 0)} x ${rnd(d.panelSize[1], 0)} mm`),
    numberRow('Sudut baca (darjah)', p.angle, {
      min: ANGLE_MIN, max: ANGLE_MAX, step: 1, ctx, set: (v) => setParam('angle', v),
    }),
    h('p', { class: 'hint' }, d.angleNote),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        ...(p.depthAuto ? { checked: true } : {}),
        onchange: (e) => { setDepthAuto(e.target.checked, depth); ctx.refresh(); },
      }),
      ' Kedalaman tapak automatik'),
    numberRow('Kedalaman tapak (mm)', depth, {
      min: 120,
      max: 460,
      step: 1,
      ctx,
      disabled: p.depthAuto,
      set: (v) => setDepth(v),
    }),
    h('p', { class: 'hint' },
      p.depthAuto
        ? 'Dikira daripada berat dan sudut, bukan diagak: tapak didalamkan '
          + 'sehingga margin condong mencapai 25 darjah dan tekanan tangan di '
          + 'hujung atas panel tidak lagi mengangkatnya.'
        : `Automatik akan memilih ${d.autoDepth ?? '-'} mm. `
          + `${rnd(d.flushDepth, 0)} mm menjadikan tiada apa-apa terjuih ke belakang.`),
    numberRow('Tinggi bibir (mm)', p.lipHeight, {
      min: LIP_MIN, max: LIP_MAX, step: 1, ctx, set: (v) => setParam('lipHeight', v),
    }),
    h('p', { class: 'hint' },
      `Palung ${rnd(d.troughGap, 1)} mm - dikira daripada sudut, bukan ditetapkan. `
      + 'Bibir mesti menahan blok teks Quran yang terbuka, bukan hanya kulitnya.'),
    h('div', { class: 'field' },
      h('label', {}, 'Saiz Quran'),
      seg(BOOKS.map((b) => [b.id, b.name]), p.bookId,
        (id) => { setBook(id); ctx.refresh(); })),
    h('p', { class: 'hint' },
      'Bukan hiasan: berat dan panjangnya yang menentukan kedalaman tapak dan '
      + 'kedudukan bibir.'),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        ...(state.showBook ? { checked: true } : {}),
        onchange: (e) => {
          update((s) => { s.showBook = e.target.checked; }, { history: false });
          ctx.refresh();
        },
      }),
      ' Tunjuk Quran dalam paparan 3D'),
    h('p', { class: 'hint' },
      'Quran itu bukan sebahagian daripada fail potong dan tidak pernah masuk '
      + 'ke dalamnya. Ia dilukis kerana ia satu-satunya benda pada skrin yang '
      + 'menunjukkan sama ada bibir menangkap buku atau melanggarnya.')));

  // ---- stability ---------------------------------------------------------
  root.append(group('Kestabilan', true,
    h('div', { class: `verdict verdict-${st.verdict}` },
      h('b', {}, VERDICT_WORD[st.verdict] || st.verdict),
      h('span', {}, `margin condong ${rnd(st.phiBack, 1)} darjah`)),
    stat('Berat siap (dengan Quran)', `${rnd(st.mass, 2)} kg`),
    stat('Berat rehal sahaja', `${rnd(st.standMass, 2)} kg`),
    stat('Margin condong ke belakang', `${rnd(st.phiBack, 1)}°`, st.phiBack < st.green),
    stat('Margin condong ke hadapan', `${rnd(st.phiFwd, 1)}°`),
    stat('Tekanan tangan yang mengangkat', `${rnd(st.handLoadN, 1)} N`, st.handLoadN < 10),
    st.fixDepth
      ? h('button', {
        class: 'soft',
        type: 'button',
        onclick: () => { setDepth(st.fixDepth); ctx.refresh(); },
      }, `Betulkan - dalamkan tapak ke ${st.fixDepth} mm`)
      : null,
    h('p', { class: 'hint' },
      'Margin condong ialah kecondongan meja yang baru akan menjatuhkannya. '
      + `Hijau ${st.green} darjah, merah ${st.red}. Tekanan tangan ialah ujian `
      + 'yang sebenarnya mengikat di sini: bukan meja senget, tetapi seseorang '
      + 'menekan hujung atas panel semasa meletakkan Quran - dan hujung itulah '
      + 'yang terjuih di belakang tapak.'),
    // The reported margin is measured to the base's rear edge, and the stand
    // does not actually fall at that point - the cheeks hang behind the base
    // with their bottom edge a board above the table, so they catch it. That
    // makes the printed number conservative, which is the right direction, but
    // it was nowhere on screen and a conservatism nobody is told about is just
    // a number that does not mean what it says. It is NOT folded into phiBack:
    // the arrest is two cheek toes on a 9 mm arris, not a footprint.
    st.arrestDeg
      ? h('p', { class: 'hint' },
        `Margin itu diukur ke tepi belakang tapak. Pipi terjuih ${rnd(st.overhang, 0)} mm `
        + `di belakangnya, jadi hujung pipi mencecah meja ${rnd(st.arrestDeg, 1)} darjah `
        + 'selepas itu dan menahannya - angka yang dilaporkan berhati-hati, bukan '
        + 'optimistik. Jangan bergantung padanya: yang menahan hanyalah dua bucu pipi.')
      : null));

  // ---- material ----------------------------------------------------------
  const mat = material();
  root.append(group('Bahan', false,
    h('div', { class: 'field' },
      h('label', {}, 'Papan'),
      h('select', {
        'aria-label': 'Papan',
        onchange: (e) => { setMaterial(e.target.value); ctx.refresh(); },
      }, MATERIALS.map((m) => h('option', {
        value: m.id, ...(m.id === p.materialId ? { selected: true } : {}),
      }, m.name)))),
    h('div', { class: 'row' },
      h('span', { class: 'swatch', style: `background:${mat.colour}` }),
      h('span', { class: 'muted' },
        `${rnd(p.thickness, 1)} mm · kerf ${rnd(p.kerf, 2)} mm · ${p.density} kg/m³`)),
    numberRow('Tebal diukur (mm)', p.measuredThickness, {
      min: 2, max: 20, step: 0.1, ctx, set: (v) => setParam('measuredThickness', v),
    }),
    h('p', { class: 'hint' },
      'Ukur papan dengan angkup sebelum potong. Papan lapis 9 mm sebenarnya '
      + '8.5 hingga 9.5 mm, dan julat itu lebih lebar daripada keseluruhan '
      + `kelegaan tanggam (${rnd(d.mortiseAllowance, 2)} mm) - jadi papan yang `
      + 'menentukan kesesuaian, bukan formula.'),
    numberRow('Kerf (mm)', p.kerf, {
      min: 0, max: 1, step: 0.02, ctx, set: (v) => setParam('kerf', v),
    }),
    stat('Lebar tanggam', `${rnd(d.mortiseWidth, 2)} mm`),
    stat('Modul tab', `${rnd(d.tabModule, 1)} mm`),
    stat('Web minimum', `${rnd(d.minWidth, 2)} mm`),
    h('p', { class: 'hint' },
      `Web minimum dikira daripada tebal papan: 0.22 x ${rnd(p.thickness, 1)} mm + kerf. `
      + 'Potongan 9 mm bukan potongan 3 mm yang dibuat perlahan - beam berhenti '
      + 'lebih lama, jadi jalur arang lebih lebar, dan kerfnya tirus. Angka ini '
      + 'ialah petua yang dikalibrasi untuk kelakuan arang, bukan pengukuran '
      + 'mesin anda.'),
    // The app never said this anywhere. At 9 mm the joints are a deliberate
    // slip fit - fitAllowance crosses zero at about 4.6 mm, so above that the
    // hole is bigger than the tenon on purpose, because nine millimetres of
    // interference in ply with hard glue lines is not a fit, it is splitting.
    // Nothing then resists withdrawal: pick the finished stand up by the panel
    // and the panel takes both cheeks with it and leaves the base on the
    // table. That is a sound design decision and the README explains it, but
    // the README is not what the customer reads before assembling.
    d.mortiseAllowance > 0
      ? h('p', { class: 'hint hint-strong' },
        `Pada papan ${rnd(p.thickness, 1)} mm tanggam ini SENGAJA longgar `
        + `(${rnd(d.mortiseAllowance, 2)} mm kelegaan) - ketat pada ketebalan ini `
        + 'bukan lagi kesesuaian, ia membelah papan. Jadi GAM ialah sebahagian '
        + 'daripada struktur, bukan pilihan. Tanpa gam, rehal ini akan tercabut '
        + 'apabila diangkat pada panelnya.')
      : null));

  // ---- what was actually checked -----------------------------------------
  const islands = (check.islands || []).length;
  const hairs = (check.hairlines || []).length;
  root.append(group('Semakan', false,
    stat('Kepingan', `${d.pieces}`),
    stat('Pulau terapung', `${islands}`, islands > 0),
    stat('Web rambut', `${hairs}`, hairs > 0),
    // FINISHED, and with the floor beside it. It used to print the DRAWN gap
    // with no floor and no unit label - 5.76 mm where the cutter leaves 5.46 -
    // which is the one number the user actually reads coming out a kerf safer
    // than it is. floors.js goes to real length about getting drawn-versus-
    // finished the right way round, and then this line quietly undid it.
    stat('Web tersempit (siap)',
      `${rnd(check.minWebFinishedMm ?? 0, 2)} mm (had ${rnd(check.floorFinished ?? 0, 2)} mm)`,
      (check.minWebFinishedMm ?? 0) < (check.floorFinished ?? 0)),
    stat('Lubang terkecil', `${rnd(pat.minHoleRadiusMm * 2, 1)} mm`),
    stat('Panjang potong', `${rnd(d.cutLengthMm / 1000, 1)} m`),
    stat('Anggaran masa', formatTime(d.cutLengthMm / Math.max(0.5, state.speed))),
    numberRow('Laju potong (mm/s)', state.speed, {
      min: 1,
      max: 40,
      step: 0.5,
      ctx,
      set: (v) => update((s) => { s.speed = v; }, { history: false }),
    }),
    h('p', { class: 'hint' },
      'Dua ujian dijalankan pada geometri akhir yang sudah dikerf: kiraan '
      + 'sarang gelang, dan raster yang dihakis kemudian dibanjiri dari '
      + 'bingkai. Yang ia sahkan ialah geometri yang dieksport lulus kedua-dua '
      + 'ujian pada grid itu - bukan bahawa tiada apa-apa akan gugur pada mesin '
      + 'anda. Kerf yang berubah masih boleh memakan web 2.3 mm.'),
    h('p', { class: 'hint' },
      'Anggaran masa itu darab mudah: panjang potong bahagi laju yang anda '
      + 'taip. Ia belum pernah disemak pada satu kerja sebenar.')));

  root.append(h('button', {
    class: 'link',
    type: 'button',
    onclick: () => {
      if (!confirm('Mula semula? Ini mengosongkan nama dan setiap tetapan.')) return;
      reset();
      ctx.refresh();
    },
  }, 'Mula semula'));

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
  const warnings = [...r.warnings];
  // A typeface that did not arrive leaves the builder with nothing to engrave
  // and no warning to give - it cannot tell a face that failed from one still
  // on its way, and the second is what every face is at start-up. So the one
  // place that does know says it.
  if (faceFailed(state.params.faceId) && String(state.params.name || '').trim()) {
    warnings.unshift(`Fon "${state.params.faceId}" gagal dimuatkan, jadi nama tidak `
      + 'dapat diukir. Semak sambungan atau pilih fon lain.');
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
/**
 * Export runs the FULL prover, over every piece and not only the decorated
 * panel. It costs a few hundred milliseconds more, which is why it is not what
 * the stage builds on every keystroke - and it is the last moment where saying
 * "do not cut this" is still cheap.
 */
export function fillExportDialog(dlg, ctx) {
  const r = getResult({ verify: 'all' });
  const d = r.derived;
  const st = r.stability;
  const failed = r.checks.filter((c) => c.pass === false);
  const time = formatTime(d.cutLengthMm / Math.max(0.5, state.speed));
  const rows = [[LAYERS.cut, true]];
  if ((r.panels.some((x) => (x.engraveFill || []).length))) rows.push([LAYERS.engraveFill, true]);
  if ((r.panels.some((x) => (x.engrave || []).length))) rows.push([LAYERS.engrave, true]);

  let tipAck = st.verdict !== 'red';
  const dl = () => dlg.querySelectorAll('#dlSvg, #dlPdf, #dlWa');
  const sync = () => { for (const b of dl()) b.disabled = !r.ok || !tipAck; };

  dlg.replaceChildren(h('form', { method: 'dialog', class: 'dlg-body' },
    h('h2', {}, 'Export'),
    h('p', { class: 'muted' },
      `${d.pieces} kepingan dalam ${material().name} `
      + `(diukur ${rnd(r.params.measuredThickness, 2)} mm). Rehal siap `
      + `${rnd(d.overall[0], 0)} x ${rnd(d.overall[1], 0)} x ${rnd(d.overall[2], 0)} mm. `
      + `${rnd(d.cutLengthMm / 1000, 1)} m potongan, lebih kurang ${time}.`),
    h('div', { class: 'layer-key' }, rows.map(([l]) => h('span', {},
      h('i', { style: `background:${l.color};border:1px solid var(--line-strong)` }),
      l.label))),
    h('p', { class: 'note' },
      rows.length > 1
        ? 'Ukir dahulu, potong kemudian - kalau tidak anda mengukir kepingan '
          + 'yang sudah jatuh melalui bed. Kedua-dua fail membawa milimeter '
          + 'sebenar, jadi ia masuk pada saiz.'
        : 'Semuanya potongan; tiada apa-apa untuk diukir. Kedua-dua fail '
          + 'membawa milimeter sebenar.'),
    failed.length
      ? h('p', { class: 'warn' },
        `Semakan sambungan GAGAL pada: ${failed.map((c) => c.id).join(', ')}. `
        + 'Jangan potong fail ini.')
      : h('p', { class: 'hint' },
        `Kelima-lima kepingan disemak: ${r.checks.length} panel, `
        + `${r.checks.filter((c) => c.pass).length} lulus, setiap satu satu kepingan.`),
    st.verdict === 'red'
      ? h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          onchange: (e) => { tipAck = e.target.checked; sync(); },
        }),
        ' Saya faham rehal ini akan terbalik dan saya tetap mahu failnya.')
      : null,
    h('div', { class: 'dlg-actions' },
      h('button', { value: 'cancel', class: 'ghost', type: 'submit' }, 'Batal'),
      h('button', { value: 'whatsapp', class: 'ghost wide', id: 'dlWa', type: 'submit' },
        'Hantar WhatsApp'),
      h('button', { value: 'pdf', class: 'ghost wide', id: 'dlPdf', type: 'submit' },
        'Muat turun PDF'),
      h('button', { value: 'svg', class: 'primary', id: 'dlSvg', type: 'submit' },
        'Muat turun SVG'))));
  sync();
  void ctx;
}

export function fillHelpDialog(dlg) {
  dlg.replaceChildren(h('form', { method: 'dialog', class: 'dlg-body' },
    h('h2', {}, 'Kenapa rehal ini tidak terbalik'),
    h('p', {},
      'Rehal ialah lima kepingan, bukan tiga. Panel yang hanya diselitkan ke '
      + 'dalam tapak yang rata ialah huruf T, dan 9 mm galas slot tidak menahan '
      + 'momen sebuah Quran 2 kg. Jadi dua pipi sisi membawa cerunnya, panel '
      + 'belakang tab menembusi pipi dan menjadi web ricih yang menghalangnya '
      + 'daripada terhuyung, tapak mengikat kaki pipi, dan bibir mengikat '
      + 'hidungnya. Sudutnya menjadi geometri, bukan harapan pada kesesuaian.'),
    h('h3', {}, 'Bibir itu struktur'),
    h('p', {},
      'Pada 35 darjah, tan sudut ialah 0.70 - lebih besar daripada geseran '
      + 'kertas atau kulit di atas papan lapis. Quran itu menggelongsor. Bibir '
      + 'ialah satu-satunya benda yang menahannya, dan kedudukannya dikira: '
      + 'muka bawah buku naik daripada sudut rehatnya mengikut tan sudut, jadi '
      + 'palung melebar dengan sendirinya apabila rehal dibuat lebih curam.'),
    h('h3', {}, 'Kestabilan dikira, bukan diagak'),
    h('p', {},
      'Jisim setiap kepingan diambil daripada gelang potong yang sebenar - '
      + 'panel yang dibuang 40% bahannya memang lebih ringan dan pusat '
      + 'jisimnya memang beralih. Dua ujian dijalankan: kecondongan meja yang '
      + 'menjatuhkannya, dan tekanan tangan di hujung atas panel yang '
      + 'mengangkat tapak. Ujian kedua itulah yang biasanya mengikat.'),
    h('h3', {}, 'Corak yang tidak gugur'),
    h('p', {},
      'Corak dibina sebagai satu rangkaian garis yang bersambung, kemudian '
      + 'ditebalkan - bukan sebagai garisan luar. Lubang ialah muka-muka yang '
      + 'dikurung oleh rangkaian itu. Setiap kali, geometri akhir yang sudah '
      + 'dikerf diuji dua kali: kiraan sarang gelang, dan raster terhakis yang '
      + 'dibanjiri dari bingkai. Kalau ada yang gugur, ia dibaiki dengan '
      + 'MENUTUP lubang - menambah bahan tidak pernah boleh memutuskan '
      + 'apa-apa - dan kalau masih gagal, jarak corak dinaikkan.'),
    h('h3', {}, 'Papan 9 mm'),
    h('p', {},
      'Semua alat lain di sini berhenti pada 5.2 mm. Pada 9 mm beam berhenti '
      + 'lebih lama, arang memakan lebih dalam dari kedua-dua belah, dan kerf '
      + 'menjadi tirus - jadi lebar ciri minimum dikira daripada tebal papan, '
      + 'dan tanggam bertukar daripada ketat kepada longgar sekitar 4.6 mm. '
      + 'Angka-angka itu petua yang dikalibrasi, bukan ukuran mesin anda: '
      + 'potong satu kupon dan ukur sebelum memotong satu set penuh.'),
    h('h3', {}, 'Kredit'),
    h('p', { class: 'hint' },
      'Corak geometri Islam ialah motif tradisi berabad lamanya, dijana di '
      + 'sini daripada geometri (kaedah Hankin) dan bukan disalin daripada '
      + 'karya sesiapa. Enjin jarak yang menebalkannya sama seperti dalam '
      + 'Cake Topper dan Stand Nama. Setiap fon adalah domain awam, SIL Open '
      + 'Font License atau Apache 2.0, disenaraikan dengan lesennya dalam '
      + 'src/font/LICENCES.txt dan src/font/CREDITS.txt.'),
    h('div', { class: 'dlg-actions' },
      h('button', { value: 'ok', class: 'primary', type: 'submit' }, 'Faham'))));
}

export function renderActions({ undoBtn, redoBtn }) {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
}

export { rnd, formatTime };
