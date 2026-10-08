// Inspector: setiap kawalan di panel kanan, dan editor grid di tengahnya.
//
// Dibina SEKALI dan dikemas kini di tempat, bukan dilukis semula daripada
// rentetan setiap kali keadaan berubah. Lukis semula akan merampas fokus
// daripada medan yang sedang ditaip - menaip "15" akan jadi "1", fokus hilang,
// "5" jatuh ke tempat lain. Senarai saiz lajur/baris sahaja dibina semula,
// dan hanya bila bilangannya berubah.
//
// Dua mod, satu inspector. Suis "Laser cut | Cetak 3D" di atas sekali; Saiz
// luar dan Petak dikongsi, selebihnya ialah dua set kumpulan yang disorok
// bersilih ganti. Set laser: Bahan (papan + kerf), jenis pembahagi, takuk
// jari. Set cetak: dinding & lantai & fillet, boleh susun, printer & filamen.

import {
  state, getTray, setParam, setMaterial, material, MATERIALS,
  beginGesture, endGesture, splitCell, canSplit, removeDivider, moveDivider,
  setCellMm, selectCell, MAX_PER_AXIS,
  isPrint, setMode, FILAMENTS, filament, setFilament,
  selectPrintCell, canSplitPrint, splitPrint, removePrintSeg, movePrintSeg,
  setPrintCellMm, useLaserGrid, hasCustomLayout, MAX_PRINT_CELLS,
} from './store.js';
import { PRINTERS } from './geom/tray3d.js';
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

function seg(options, get, set, cls = '') {
  const wrap = h('div', { class: `seg ${cls}`.trim(), role: 'group' });
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

  // ---- mod -------------------------------------------------------------------
  const modeSeg = seg([['laser', 'Laser cut'], ['cetak', 'Cetak 3D']],
    () => state.params.mode, (v) => setMode(v), 'mode');
  const modeHint = h('p', { class: 'hint' });
  const modeBox = h('div', { class: 'mode-box' }, reg(modeSeg), modeHint);

  // ---- saiz ----------------------------------------------------------------
  const sizeStat = h('p', { class: 'hint' });
  const sizeGroup = group('Saiz luar', true,
    reg(numField('Panjang (X)', { get: () => state.params.length, set: (v) => setParam('length', v), min: 30, max: 1200 })),
    reg(numField('Lebar (Y)', { get: () => state.params.width, set: (v) => setParam('width', v), min: 30, max: 1200 })),
    reg(numField('Tinggi (Z)', { get: () => state.params.height, set: (v) => setParam('height', v), min: 12, max: 300 })),
    sizeStat);

  // ---- bahan (laser) -------------------------------------------------------
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

  // ---- dinding & lantai (cetak) --------------------------------------------
  const wallGroup = group('Dinding & lantai', true,
    reg(numField('Tebal dinding & pembahagi', {
      get: () => state.params.wallT, set: (v) => setParam('wallT', v), min: 0.8, max: 6, step: 0.2,
      hint: 'Gandaan lebar garisan nozzle: 1.2 / 1.6 / 2.0 mm untuk nozzle 0.4 mm. 1.6 = 4 perimeter, tegar.',
    })),
    reg(numField('Tebal lantai', {
      get: () => state.params.floorT, set: (v) => setParam('floorT', v), min: 0.6, max: 6, step: 0.2,
    })),
    reg(numField('Fillet bucu dalam', {
      get: () => state.params.fillet, set: (v) => setParam('fillet', v), min: 0, max: 20, step: 0.5,
      hint: 'Bucu petak dibulatkan - lebih kuat dan senang dibersihkan. Bucu luar ikut, supaya dinding sama tebal di selekoh. 0 = tajam.',
    })));

  // ---- boleh susun (cetak) -------------------------------------------------
  const stackChk = h('input', { type: 'checkbox', onchange: () => setParam('stack', stackChk.checked) });
  const stackField = reg(numField('Kelonggaran kaki', {
    get: () => state.params.stackClear, set: (v) => setParam('stackClear', v), min: 0, max: 2, step: 0.05,
    hint: 'Kaki di bawah dulang masuk ke bukaan dulang di bawahnya. 0.3 mm gelongsor selesa pada kebanyakan printer; 0.15 ketat.',
  }));
  const stackHint = h('p', { class: 'hint', text: 'Pembahagi dihadkan di bawah paras kaki supaya dulang atas duduk atas rim, bukan atas pembahagi.' });
  const stackGroup = group('Boleh susun', false,
    h('label', { class: 'check' }, stackChk, ' Tambah kaki terbenam supaya dulang boleh disusun'),
    stackField, stackHint);

  // ---- printer & filamen (cetak) -------------------------------------------
  const printerSel = h('select', { onchange: () => setParam('printer', printerSel.value) });
  for (const q of PRINTERS) printerSel.append(h('option', { value: q.id, text: `${q.name} (${q.x} x ${q.y} x ${q.z})` }));
  const bedBox = h('div', { class: 'custom-mat' },
    h('div', { class: 'row' },
      reg(numField('Katil X', { get: () => state.params.bedX ?? 220, set: (v) => setParam('bedX', v), min: 50, max: 1000 })),
      reg(numField('Katil Y', { get: () => state.params.bedY ?? 220, set: (v) => setParam('bedY', v), min: 50, max: 1000 })),
      reg(numField('Tinggi Z', { get: () => state.params.bedZ ?? 220, set: (v) => setParam('bedZ', v), min: 20, max: 1000 }))));
  const bedStat = h('p', { class: 'hint' });
  const filSel = h('select', { onchange: () => setFilament(filSel.value) });
  for (const f of FILAMENTS) filSel.append(h('option', { value: f.id, text: f.name }));
  const filSwatch = h('span', { class: 'swatch' });
  const printerGroup = group('Printer & filamen', true,
    h('div', { class: 'field' }, h('label', { text: 'Printer' }), h('div', { class: 'row' }, printerSel), bedBox, bedStat),
    h('div', { class: 'field' }, h('label', { text: 'Filamen (warna pratonton sahaja)' }), h('div', { class: 'row' }, filSwatch, filSel)));

  // ---- petak ---------------------------------------------------------------
  // Mod laser: grid - "+ Lajur" menambah satu lajur merentang seluruh dulang.
  // Mod cetak: pokok - "+ Lajur" membelah petak terpilih SAHAJA, jadi satu
  // petak panjang boleh duduk di sebelah petak-petak kecil.
  const gridMount = h('div', { class: 'grid-editor' });
  const splitX = h('button', { type: 'button', class: 'ghost', text: '+ Lajur', title: 'Belah petak terpilih kiri-kanan',
    onclick: () => (isPrint() ? splitPrint('x') : splitCell('x', state.selected.i)) });
  const splitY = h('button', { type: 'button', class: 'ghost', text: '+ Baris', title: 'Belah petak terpilih depan-belakang',
    onclick: () => (isPrint() ? splitPrint('y') : splitCell('y', state.selected.j)) });
  const gridHint = h('p', { class: 'hint', text: 'Klik petak, tekan + untuk belah. Seret pembahagi untuk ubah saiz. Tekan x untuk buang.' });
  const colList = h('div', { class: 'mm-list' });
  const rowList = h('div', { class: 'mm-list' });
  const colField = h('div', { class: 'field' }, h('label', { text: 'Lebar lajur (kiri ke kanan)' }), colList);
  const rowField = h('div', { class: 'field' }, h('label', { text: 'Dalam baris (depan ke belakang)' }), rowList);

  // Mod cetak: saiz petak terpilih, boleh ditaip. Jiran di sebelahnya yang
  // menyerap beza; petak yang merentang seluruh dulang mengubah saiz luar.
  const cellInput = (axis) => {
    const input = h('input', { type: 'number', min: 3, step: 0.5, inputmode: 'decimal', 'aria-label': axis === 'x' ? 'Lebar petak terpilih' : 'Dalam petak terpilih' });
    input.addEventListener('focus', beginGesture);
    input.addEventListener('blur', endGesture);
    input.addEventListener('change', () => {
      const mm = parseFloat(input.value);
      if (Number.isFinite(mm)) setPrintCellMm(axis, mm);
    });
    return input;
  };
  const selW = cellInput('x');
  const selH = cellInput('y');
  const resetLayout = h('button', { type: 'button', class: 'link', text: 'Guna semula grid mod laser', onclick: () => useLaserGrid() });
  const selField = h('div', { class: 'field sel-cell' },
    h('label', { text: 'Petak terpilih (lebar x dalam)' }),
    h('div', { class: 'row' },
      h('div', { class: 'num' }, selW, h('span', { class: 'unit', text: 'x' })),
      h('div', { class: 'num' }, selH, h('span', { class: 'unit', text: 'mm' }))),
    resetLayout);

  const gridGroup = group('Petak', true,
    gridMount,
    h('div', { class: 'grid-toolbar' }, splitX, splitY),
    gridHint,
    colField, rowField, selField);

  const grid = new GridEditor(gridMount, {
    onSelect: (cell) => (isPrint() ? selectPrintCell(cell.path) : selectCell(cell.i, cell.j)),
    onDragStart: () => beginGesture(),
    // Laser mengukur kedudukan dari muka dalam dinding pertama; pokok cetak
    // menerima koordinat mutlak dulang.
    onDrag: (seg, pos) => (isPrint()
      ? movePrintSeg(seg.path, seg.k, pos, { history: false })
      : moveDivider(seg.axis, seg.k, pos - state.params.thickness, { history: false })),
    onDragEnd: () => endGesture(),
    onRemove: (seg) => (isPrint() ? removePrintSeg(seg.path, seg.k) : removeDivider(seg.axis, seg.k)),
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
  const styleField = h('div', { class: 'field' }, h('label', { text: 'Jenis' }), reg(styleSeg), styleHint);
  const heightRange = h('input', { type: 'range', min: 20, max: 100, step: 5 });
  heightRange.addEventListener('pointerdown', beginGesture);
  heightRange.addEventListener('pointerup', endGesture);
  heightRange.addEventListener('input', () => setParam('dividerHeight', parseFloat(heightRange.value), { history: false }));
  const heightOut = h('span', { class: 'unit' });
  const heightHint = h('p', { class: 'hint' });
  const slackField = reg(numField('Kelonggaran slot', {
    get: () => state.params.slotSlack, set: (v) => setParam('slotSlack', v), min: 0, max: 1, step: 0.05,
    hint: 'Slot dinding = tebal papan + nilai ini. 0.2 mm gelongsor selesa; 0 ketat.',
  }));
  const divGroup = group('Pembahagi', true,
    styleField,
    h('div', { class: 'field' },
      h('label', { text: 'Tinggi pembahagi' }),
      h('div', { class: 'row' }, heightRange, heightOut),
      h('div', { class: 'tick-labels' }, h('span', { text: 'Rendah' }), h('span', { text: 'Separas rim' })),
      heightHint),
    slackField);

  // ---- takuk jari (laser) --------------------------------------------------
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
    modeBox,
    sizeGroup, gridGroup, divGroup,
    wallGroup, stackGroup, printerGroup,
    pullGroup, matGroup,
    sumGroup,
  );

  const stat = (k, v) => h('div', { class: 'stat' }, h('span', { text: k }), h('b', { text: v }));

  return {
    render() {
      const tray = getTray();
      const { params: p, derived: d } = tray;
      const print = isPrint();
      for (const f of syncs) f.sync();

      modeHint.textContent = print
        ? 'Satu jasad pepejal untuk 3D printer - output STL. Setiap petak boleh dibelah sendiri, jadi satu petak panjang boleh duduk di sebelah petak kecil.'
        : 'Panel finger joint untuk laser - output SVG, petak dalam grid. Tukar ke Cetak 3D untuk STL dan petak yang boleh dibelah sendiri.';

      // Kumpulan mengikut mod.
      matGroup.hidden = print;
      pullGroup.hidden = print;
      styleField.hidden = print;
      slackField.hidden = print || !d.alih;
      wallGroup.hidden = !print;
      stackGroup.hidden = !print;
      printerGroup.hidden = !print;

      sizeStat.textContent = `Ruang dalam ${r1(d.innerL)} x ${r1(d.innerW)} mm, dalam ${r1(d.intH)} mm.`;

      matSel.value = state.material;
      customBox.hidden = state.material !== 'custom';

      colField.hidden = print;
      rowField.hidden = print;
      selField.hidden = !print;
      if (print) {
        grid.render(tray, state.selectedPath);
        splitX.disabled = !canSplitPrint('x');
        splitY.disabled = !canSplitPrint('y');
        const full = d.cellCount >= MAX_PRINT_CELLS;
        const why = full ? `Had ${MAX_PRINT_CELLS} petak` : 'Petak terpilih terlalu kecil untuk dibelah';
        splitX.title = splitX.disabled ? why : 'Belah petak terpilih SAHAJA kiri-kanan';
        splitY.title = splitY.disabled ? why : 'Belah petak terpilih SAHAJA depan-belakang';
        const cell = d.cells.find((c) => c.path.length === state.selectedPath.length && c.path.every((v, i) => v === state.selectedPath[i]));
        if (cell) {
          if (document.activeElement !== selW) selW.value = String(r1(cell.w));
          if (document.activeElement !== selH) selH.value = String(r1(cell.h));
        }
        selW.disabled = selH.disabled = !d.gridOK;
        resetLayout.hidden = !hasCustomLayout();
        gridHint.textContent = 'Klik satu petak, tekan + untuk belah petak ITU sahaja - contohnya satu petak panjang untuk sudu, '
          + `kemudian belah petak sebelahnya jadi 2x2. Seret pembahagi untuk ubah saiz; x untuk buang. Pembahagi setebal dinding (${r1(p.wallT)} mm).`;
      } else {
        grid.render(tray, state.selected);
        syncList('x', d.colW);
        syncList('y', d.rowD);
        splitX.disabled = !canSplit('x', state.selected.i);
        splitY.disabled = !canSplit('y', state.selected.j);
        splitX.title = splitX.disabled
          ? (d.colW.length >= MAX_PER_AXIS ? 'Had 12 pembahagi setiap arah' : 'Petak terpilih terlalu kecil untuk dibelah')
          : 'Belah petak terpilih kiri-kanan';
        splitY.title = splitY.disabled
          ? (d.rowD.length >= MAX_PER_AXIS ? 'Had 12 pembahagi setiap arah' : 'Petak terpilih terlalu kecil untuk dibelah')
          : 'Belah petak terpilih depan-belakang';
        gridHint.textContent = 'Klik petak, tekan + untuk belah. Seret pembahagi untuk ubah saiz. Tekan x untuk buang.';
      }

      heightRange.value = String(p.dividerHeight);
      heightOut.textContent = `${Math.round(p.dividerHeight)}% (${r1(d.divH)} mm)`;
      heightHint.textContent = print && d.dividerClamped
        ? `Dihadkan pada ${r1(d.divH)} mm kerana kaki boleh susun perlukan ruang di atasnya.`
        : '';
      styleHint.textContent = d.alih
        ? 'Pembahagi gelongsor masuk slot dari atas; boleh tanggal dan susun semula. Slot kekal nampak pada rim.'
        : 'Hujung pembahagi bertenon tembus dinding dan dilekat. Paling kukuh; tidak boleh tanggal.';

      if (print) {
        stackChk.checked = Boolean(p.stack);
        stackField.hidden = !p.stack;
        stackHint.hidden = !p.stack;
        printerSel.value = p.printer;
        bedBox.hidden = p.printer !== 'custom';
        bedStat.textContent = d.fitsBed && d.fitsZ
          ? `Muat atas katil ${d.bed.x} x ${d.bed.y} mm.`
          : `TIDAK muat: katil ${d.bed.x} x ${d.bed.y} x ${d.bed.z} mm. Kecilkan dulang, atau cetak dalam dua bahagian.`;
        bedStat.classList.toggle('warn', !(d.fitsBed && d.fitsZ));
        filSel.value = state.filament;
        filSwatch.style.background = filament().color;
      }

      summary.replaceChildren();
      if (print) {
        summary.append(
          stat('Isi padu', `${d.volumeCm3.toFixed(1)} cm³`),
          stat('Anggaran filamen', `~${Math.round(d.gramsPLA)} g PLA`),
          stat('Petak', `${d.cellCount}`),
          stat('Dinding / lantai', `${r1(p.wallT)} / ${r1(p.floorT)} mm`),
          stat('Fillet dalam', `${r1(d.r)} mm`),
          stat('Segitiga STL', `${d.triangles.toLocaleString('ms-MY')}`),
        );
      } else {
        summary.append(
          stat('Panel', `${d.panelCount}`),
          stat('Petak', `${d.cellCount}`),
          stat('Pembahagi', `${d.dividers.x.length + d.dividers.y.length}`),
          stat('Papan', `${material().name} ${r1(p.thickness)} mm`),
          stat('Kerf', `${p.kerf} mm`),
        );
      }
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
  if (d.warnings.includes('katil')) out.push('Dulang lebih besar daripada katil printer yang dipilih.');
  if (d.warnings.includes('petak')) out.push('Ada petak lebih kecil daripada had minimum pada saiz dulang ini - pembahagi tidak dijana. Besarkan dulang semula dan susun atur anda kembali.');
  return out.join(' ');
}
