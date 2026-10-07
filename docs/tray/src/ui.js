// Inspector: setiap kawalan di panel kanan, dan editor grid di tengahnya.
//
// Dibina SEKALI dan dikemas kini di tempat, bukan dilukis semula daripada
// rentetan setiap kali keadaan berubah. Lukis semula akan merampas fokus
// daripada medan yang sedang ditaip - menaip "15" akan jadi "1", fokus hilang,
// "5" jatuh ke tempat lain. Senarai saiz lajur/baris sahaja dibina semula,
// dan hanya bila bilangannya berubah.

import {
  state, getTray, setParam, setMaterial, material, MATERIALS,
  beginGesture, endGesture, splitCell, canSplit, removeDivider, moveDivider,
  setCellMm, selectCell, MAX_PER_AXIS,
} from './store.js';
import { GridEditor } from './grid.js';

const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, String(v));
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
};

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Medan nombor yang menulis ke store semasa menaip dan mengelompokkan satu
 * sesi fokus menjadi satu undo. `get` membaca nilai semasa; `set` menulisnya.
 */
function numField(label, { get, set, min, max, step = 1, unit = 'mm', hint } = {}) {
  const input = h('input', { type: 'number', min, max, step, inputmode: 'decimal' });
  input.addEventListener('focus', beginGesture);
  input.addEventListener('blur', endGesture);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v)) return;
    if (min != null && v < min) return; // tunggu pengguna selesai menaip
    set(v);
  });
  input.addEventListener('change', () => {
    let v = parseFloat(input.value);
    if (!Number.isFinite(v)) v = get();
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    set(v);
    input.value = String(r1(v));
  });
  const wrap = h('div', { class: 'field' },
    h('label', { text: label }),
    h('div', { class: 'num' }, input, h('span', { class: 'unit', text: unit })),
    hint ? h('p', { class: 'hint', text: hint }) : null);
  return {
    el: wrap,
    sync() { if (document.activeElement !== input) input.value = String(r1(get())); },
  };
}

function seg(options, get, set) {
  const wrap = h('div', { class: 'seg', role: 'group' });
  const btns = options.map(([value, label]) => {
    const b = h('button', { type: 'button', text: label, onclick: () => set(value) });
    wrap.append(b);
    return { b, value };
  });
  return {
    el: wrap,
    sync() { const v = get(); for (const { b, value } of btns) b.setAttribute('aria-pressed', String(v === value)); },
  };
}

function group(title, open, ...body) {
  const d = h('details', { class: 'group', open });
  d.append(h('summary', { text: title }));
  d.append(h('div', { class: 'group-body' }, ...body));
  return d;
}

export function createInspector(root) {
  const syncs = [];
  const reg = (f) => { syncs.push(f); return f.el; };

  // ---- saiz ----------------------------------------------------------------
  const sizeStat = h('p', { class: 'hint' });
  const sizeGroup = group('Saiz luar', true,
    reg(numField('Panjang (X)', { get: () => state.params.length, set: (v) => setParam('length', v), min: 30, max: 1200 })),
    reg(numField('Lebar (Y)', { get: () => state.params.width, set: (v) => setParam('width', v), min: 30, max: 1200 })),
    reg(numField('Tinggi (Z)', { get: () => state.params.height, set: (v) => setParam('height', v), min: 12, max: 300 })),
    sizeStat);

  // ---- bahan ---------------------------------------------------------------
  const matSel = h('select', { onchange: () => setMaterial(matSel.value) });
  for (const m of MATERIALS) {
    matSel.append(h('option', { value: m.id, text: m.id === 'custom' ? m.name : `${m.name} ${m.t} mm` }));
  }
  const customBox = h('div', { class: 'custom-mat' },
    reg(numField('Ketebalan papan', { get: () => state.params.thickness, set: (v) => setParam('thickness', v), min: 1, max: 12, step: 0.1 })),
    reg(numField('Kerf (lebar alur laser)', {
      get: () => state.params.kerf, set: (v) => setParam('kerf', v), min: 0, max: 1, step: 0.01,
      hint: 'Ukur dengan potongan ujian pada mesin anda. 0.15-0.25 mm biasa untuk CO2.',
    })));
  const matGroup = group('Bahan', true,
    h('div', { class: 'field' }, h('label', { text: 'Papan' }), h('div', { class: 'row' }, matSel)),
    customBox);

  // ---- petak ---------------------------------------------------------------
  const gridMount = h('div', { class: 'grid-editor' });
  const splitX = h('button', { type: 'button', class: 'ghost', text: '+ Lajur', title: 'Belah petak terpilih kiri-kanan',
    onclick: () => splitCell('x', state.selected.i) });
  const splitY = h('button', { type: 'button', class: 'ghost', text: '+ Baris', title: 'Belah petak terpilih depan-belakang',
    onclick: () => splitCell('y', state.selected.j) });
  const gridHint = h('p', { class: 'hint', text: 'Klik petak, tekan + untuk belah. Seret pembahagi untuk ubah saiz. Tekan x untuk buang.' });
  const colList = h('div', { class: 'mm-list' });
  const rowList = h('div', { class: 'mm-list' });
  const gridGroup = group('Petak', true,
    gridMount,
    h('div', { class: 'grid-toolbar' }, splitX, splitY),
    gridHint,
    h('div', { class: 'field' }, h('label', { text: 'Lebar lajur (kiri ke kanan)' }), colList),
    h('div', { class: 'field' }, h('label', { text: 'Dalam baris (depan ke belakang)' }), rowList));

  const grid = new GridEditor(gridMount, {
    onSelect: (i, j) => selectCell(i, j),
    onDragStart: () => beginGesture(),
    onDrag: (axis, k, pos) => moveDivider(axis, k, pos, { history: false }),
    onDragEnd: () => endGesture(),
    onRemove: (axis, k) => removeDivider(axis, k),
  });

  // Senarai saiz mm: dibina semula hanya bila bilangan berubah.
  const lists = { x: { el: colList, inputs: [] }, y: { el: rowList, inputs: [] } };
  function rebuildList(axis, sizes) {
    const L = lists[axis];
    L.el.replaceChildren();
    L.inputs = sizes.map((v, idx) => {
      const input = h('input', { type: 'number', min: 3, step: 0.5, inputmode: 'decimal', 'aria-label': `${axis === 'x' ? 'Lajur' : 'Baris'} ${idx + 1}` });
      input.addEventListener('focus', beginGesture);
      input.addEventListener('blur', endGesture);
      input.addEventListener('change', () => {
        const mm = parseFloat(input.value);
        if (Number.isFinite(mm)) setCellMm(axis, idx, mm);
        input.value = String(r1((axis === 'x' ? getTray().derived.colW : getTray().derived.rowD)[idx]));
      });
      L.el.append(input);
      return input;
    });
  }
  function syncList(axis, sizes) {
    const L = lists[axis];
    if (L.inputs.length !== sizes.length) rebuildList(axis, sizes);
    L.inputs.forEach((input, idx) => {
      if (document.activeElement !== input) input.value = String(r1(sizes[idx]));
    });
  }

  // ---- pembahagi -----------------------------------------------------------
  const styleSeg = seg([['tetap', 'Tetap (tenon)'], ['alih', 'Boleh alih (slot)']],
    () => state.params.dividerStyle, (v) => setParam('dividerStyle', v));
  const styleHint = h('p', { class: 'hint' });
  const heightRange = h('input', { type: 'range', min: 20, max: 100, step: 5 });
  heightRange.addEventListener('pointerdown', beginGesture);
  heightRange.addEventListener('pointerup', endGesture);
  heightRange.addEventListener('input', () => setParam('dividerHeight', parseFloat(heightRange.value), { history: false }));
  const heightOut = h('span', { class: 'unit' });
  const slackField = reg(numField('Kelonggaran slot', {
    get: () => state.params.slotSlack, set: (v) => setParam('slotSlack', v), min: 0, max: 1, step: 0.05,
    hint: 'Slot dinding = tebal papan + nilai ini. 0.2 mm gelongsor selesa; 0 ketat.',
  }));
  const divGroup = group('Pembahagi', true,
    h('div', { class: 'field' }, h('label', { text: 'Jenis' }), reg(styleSeg), styleHint),
    h('div', { class: 'field' },
      h('label', { text: 'Tinggi pembahagi' }),
      h('div', { class: 'row' }, heightRange, heightOut),
      h('div', { class: 'tick-labels' }, h('span', { text: 'Rendah' }), h('span', { text: 'Separas rim' }))),
    slackField);

  // ---- takuk jari ----------------------------------------------------------
  const pullSeg = seg([['none', 'Tiada'], ['depan', 'Depan'], ['depanBelakang', 'Depan & belakang']],
    () => state.params.fingerPull, (v) => setParam('fingerPull', v));
  const pullHint = h('p', { class: 'hint', text: 'Lekuk di tengah tepi atas dinding untuk mengangkat dulang dari laci.' });
  const pullGroup = group('Takuk jari', false,
    h('div', { class: 'field' }, reg(pullSeg), pullHint));

  // ---- ringkasan -----------------------------------------------------------
  const summary = h('div', { class: 'summary' });
  const sumGroup = group('Ringkasan', true, summary);

  root.append(
    h('h2', { class: 'insp-title', text: 'TETAPAN DULANG' }),
    sizeGroup, gridGroup, divGroup, pullGroup, matGroup, sumGroup,
  );

  const stat = (k, v) => h('div', { class: 'stat' }, h('span', { text: k }), h('b', { text: v }));

  return {
    render() {
      const tray = getTray();
      const { params: p, derived: d } = tray;
      for (const f of syncs) f.sync();

      sizeStat.textContent = `Ruang dalam ${r1(d.innerL)} x ${r1(d.innerW)} mm, dalam ${r1(d.intH)} mm.`;

      matSel.value = state.material;
      customBox.hidden = state.material !== 'custom';

      grid.render(tray, state.selected);
      syncList('x', d.colW);
      syncList('y', d.rowD);
      splitX.disabled = !canSplit('x', state.selected.i);
      splitY.disabled = !canSplit('y', state.selected.j);
      const maxed = d.colW.length >= MAX_PER_AXIS || d.rowD.length >= MAX_PER_AXIS;
      splitX.title = splitX.disabled
        ? (d.colW.length >= MAX_PER_AXIS ? 'Had 12 pembahagi setiap arah' : 'Petak terpilih terlalu kecil untuk dibelah')
        : 'Belah petak terpilih kiri-kanan';
      splitY.title = splitY.disabled
        ? (d.rowD.length >= MAX_PER_AXIS ? 'Had 12 pembahagi setiap arah' : 'Petak terpilih terlalu kecil untuk dibelah')
        : 'Belah petak terpilih depan-belakang';
      void maxed;

      heightRange.value = String(p.dividerHeight);
      heightOut.textContent = `${Math.round(p.dividerHeight)}% (${r1(d.divH)} mm)`;
      slackField.hidden = !d.alih;
      styleHint.textContent = d.alih
        ? 'Pembahagi gelongsor masuk slot dari atas; boleh tanggal dan susun semula. Slot kekal nampak pada rim.'
        : 'Hujung pembahagi bertenon tembus dinding dan dilekat. Paling kukuh; tidak boleh tanggal.';

      summary.replaceChildren(
        stat('Panel', `${d.panelCount}`),
        stat('Petak', `${d.cellCount}`),
        stat('Pembahagi', `${d.dividers.x.length + d.dividers.y.length}`),
        stat('Papan', `${material().name} ${r1(p.thickness)} mm`),
        stat('Kerf', `${p.kerf} mm`),
      );
      const warnText = warningsText(d);
      if (warnText) summary.append(h('p', { class: 'warn', text: warnText }));
    },
    dispose() { grid.dispose(); },
  };
}

/** Amaran geometri, dalam ayat yang memberitahu apa yang perlu dibuat. */
export function warningsText(d) {
  const out = [];
  if (d.warnings.includes('lajur')) out.push('Ada lajur lebih kecil daripada had minimum - pembahagi tidak dijana. Besarkan dulang atau buang satu lajur.');
  if (d.warnings.includes('baris')) out.push('Ada baris lebih kecil daripada had minimum - pembahagi tidak dijana. Besarkan dulang atau buang satu baris.');
  if (d.warnings.includes('tinggi')) out.push('Pembahagi terlalu rendah untuk bertenon - naikkan tinggi pembahagi atau dulang.');
  if (d.warnings.includes('takuk')) out.push('Takuk jari digugurkan pada dinding yang pembahaginya jatuh tepat di tengah. Alihkan pembahagi, rendahkannya, atau matikan takuk.');
  return out.join(' ');
}
