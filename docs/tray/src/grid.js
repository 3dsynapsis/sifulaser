// Editor grid: pandangan atas dulang, boleh disentuh.
//
// Inilah idea yang dipinjam daripada Bento3D dan yang tiada pada boxes.py atau
// Cuttle: anda tidak menaip tatasusunan nombor, anda MELIHAT dulang dari atas
// dan menyeret pembahaginya. Klik petak untuk memilihnya; "+ Lajur" dan
// "+ Baris" dalam inspector membelah petak yang dipilih. Seret pembahagi
// untuk mengubah saiz dua petak bersebelahan. Tekan x di hujung pembahagi
// untuk membuangnya.
//
// Dilukis dalam mm dulang (viewBox = dulang), dengan Y dibalikkan supaya
// dinding DEPAN berada di bawah skrin - macam melihat dulang di atas meja di
// hadapan anda. Kawasan sentuh seret dan butang buang dinyatakan dalam PIKSEL
// dan ditukar ke mm setiap kali dilukis, supaya ia kekal sebesar jari pada
// dulang 60 mm dan dulang 600 mm sama sahaja.

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const r1 = (v) => Math.round(v * 10) / 10;

export class GridEditor {
  /**
   * Editor yang sama untuk kedua-dua mod. Ia hanya tahu tentang PETAK dan
   * SEGMEN pembahagi:
   *   * mod laser - segmen ialah pembahagi grid yang merentang seluruh dulang
   *     (diterbitkan daripada xDiv / yDiv);
   *   * mod cetak - segmen datang daripada pokok belahan (derived.segs) dan
   *     boleh berhenti pada pembahagi lain: simpang T.
   * Pengendali menerima objek petak / segmen itu sendiri; ui.js yang memilih
   * operasi store mengikut mod.
   *
   * @param {HTMLElement} root
   * @param {{
   *   onSelect: (cell) => void,
   *   onDragStart: (seg) => void,
   *   onDrag: (seg, posMm:number) => void,   // pos = koordinat MUTLAK dulang
   *   onDragEnd: () => void,
   *   onRemove: (seg) => void,
   * }} handlers
   */
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.svg = el('svg', { class: 'grid-svg', xmlns: SVG_NS });
    this.root.append(this.svg);
    this.drag = null;

    this.svg.addEventListener('pointermove', (e) => this.onMove(e));
    this.svg.addEventListener('pointerup', (e) => this.onUp(e));
    this.svg.addEventListener('pointercancel', (e) => this.onUp(e));
    this.ro = new ResizeObserver(() => { if (this.tray) this.render(this.tray, this.selected); });
    this.ro.observe(root);
  }

  /** Piksel skrin -> mm dulang, mengikut viewBox semasa. */
  pxToMm(px) {
    const w = this.svg.clientWidth || 1;
    const vb = this.svg.viewBox.baseVal;
    return (px * vb.width) / w;
  }

  /** Titik penuding -> koordinat dulang (x ke kanan, y ke BELAKANG). */
  trayPoint(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = this.svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: this.W - p.y };
  }

  /** Segmen pembahagi untuk dilukis, dalam satu bentuk untuk kedua-dua mod. */
  static segments(tray) {
    const { params: p, derived: d } = tray;
    if (!d.divOK) return [];
    if (d.segs) return d.segs;
    const t = p.thickness;
    return [
      ...d.xDiv.map((pos, k) => ({ axis: 'x', pos, from: t, to: p.width - t, k })),
      ...d.yDiv.map((pos, k) => ({ axis: 'y', pos, from: t, to: p.length - t, k })),
    ];
  }

  render(tray, selected) {
    this.tray = tray;
    this.selected = selected;
    const { params: p, derived: d } = tray;
    const { length: L, width: W, thickness: t } = p;
    this.W = W;

    // Ruang di sekeliling untuk butang buang di hujung pembahagi.
    const padPx = 18;
    const w = this.svg.clientWidth || 300;
    const padMm = (padPx * (L + 2 * 10)) / w; // anggaran pertama
    const pad = Math.max(padMm, Math.max(L, W) * 0.06);
    this.svg.setAttribute('viewBox', `${-pad} ${-pad} ${L + pad * 2} ${W + pad * 2}`);
    this.svg.replaceChildren();

    const hitPx = this.pxToMm(22);  // lebar kawasan seret
    const btnR = this.pxToMm(9);    // jejari butang buang
    const Y = (y) => W - y;         // balikkan

    // Dinding luar: satu gelang dengan lubang dalaman.
    this.svg.append(el('path', {
      class: 'g-wall',
      'fill-rule': 'evenodd',
      d: `M0 0H${L}V${W}H0Z M${t} ${t}V${W - t}H${L - t}V${t}Z`,
    }));

    const isSel = (c) => (Array.isArray(selected)
      ? Array.isArray(c.path) && c.path.length === selected.length && c.path.every((v, i) => v === selected[i])
      : selected && c.i === selected.i && c.j === selected.j);

    // Petak.
    for (const c of d.cells) {
      const rect = el('rect', {
        class: `g-cell${isSel(c) ? ' on' : ''}`,
        x: c.x, y: Y(c.y + c.h), width: c.w, height: c.h,
      });
      rect.addEventListener('click', () => this.h.onSelect(c));
      this.svg.append(rect);
      // Saiz petak, dalam mm - hanya kalau petak cukup besar untuk membacanya.
      // Dihadkan oleh LEBAR teks juga, bukan tinggi petak sahaja: "47.2 x 75.5"
      // dalam petak 47 mm akan terpotong di kedua-dua hujung kalau saiz fon
      // hanya mengikut dimensi terkecil. 0.58 em ialah lebar purata digit.
      const label = `${r1(c.w)} x ${r1(c.h)}`;
      const fs = Math.min(
        Math.min(c.w, c.h) * 0.22,
        (c.w * 0.88) / (label.length * 0.58),
      );
      if (fs >= this.pxToMm(7)) {
        const tx = el('text', {
          class: 'g-size', x: c.x + c.w / 2, y: Y(c.y + c.h / 2),
          'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        });
        tx.textContent = label;
        this.svg.append(tx);
      }
    }

    // Pembahagi. 'x' = menegak di skrin (memisahkan kiri/kanan), 'y' =
    // melintang. Segmen boleh berhenti di tengah dulang (mod cetak), jadi
    // setiap satu dilukis antara from dan to-nya sendiri.
    const segs = GridEditor.segments(tray);
    const buttons = [];
    for (const s of segs) {
      const len = s.to - s.from;
      if (s.axis === 'x') {
        this.svg.append(el('rect', { class: 'g-div', x: s.pos - t / 2, y: Y(s.to), width: t, height: len }));
        const hit = el('rect', { class: 'g-hit g-hit-x', x: s.pos - hitPx / 2, y: Y(s.to), width: hitPx, height: len });
        hit.addEventListener('pointerdown', (e) => this.onDown(e, s));
        this.svg.append(hit);
      } else {
        this.svg.append(el('rect', { class: 'g-div', x: s.from, y: Y(s.pos + t / 2), width: len, height: t }));
        const hit = el('rect', { class: 'g-hit g-hit-y', x: s.from, y: Y(s.pos) - hitPx / 2, width: len, height: hitPx });
        hit.addEventListener('pointerdown', (e) => this.onDown(e, s));
        this.svg.append(hit);
      }
      buttons.push(s);
    }
    // Butang buang dilukis selepas SEMUA kawasan seret, supaya ia sentiasa di
    // atas. Hujung yang menyentuh dinding: di luar dinding (macam dahulu).
    // Segmen yang berhenti pada pembahagi di kedua-dua hujung: di tengahnya.
    for (const s of buttons) {
      const end = s.axis === 'x' ? W - t : L - t;
      const toWall = s.to >= end - 1e-6;
      const fromWall = s.from <= t + 1e-6;
      let cx;
      let cy;
      if (s.axis === 'x') {
        cx = s.pos;
        cy = toWall ? Y(W) - btnR * 1.6 : fromWall ? Y(0) + btnR * 1.6 : Y((s.from + s.to) / 2);
      } else {
        cy = Y(s.pos);
        cx = toWall ? L + btnR * 1.6 : fromWall ? -btnR * 1.6 : (s.from + s.to) / 2;
      }
      this.removeButton(cx, cy, btnR, s);
    }
  }

  removeButton(cx, cy, r, seg) {
    const g = el('g', { class: 'g-remove' });
    g.append(el('circle', { cx, cy, r }));
    const a = r * 0.42;
    g.append(el('path', { d: `M${cx - a} ${cy - a}L${cx + a} ${cy + a}M${cx + a} ${cy - a}L${cx - a} ${cy + a}` }));
    const title = el('title');
    title.textContent = seg.path ? 'Buang pembahagi ini (dua bahagian di sisinya jadi satu petak)' : 'Buang pembahagi ini';
    g.append(title);
    g.addEventListener('click', (e) => { e.stopPropagation(); this.h.onRemove(seg); });
    this.svg.append(g);
  }

  onDown(e, seg) {
    e.preventDefault();
    this.svg.setPointerCapture(e.pointerId);
    this.drag = { seg, id: e.pointerId };
    this.svg.classList.add('dragging');
    this.h.onDragStart(seg);
  }

  onMove(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const p = this.trayPoint(e);
    if (!p) return;
    this.h.onDrag(this.drag.seg, this.drag.seg.axis === 'x' ? p.x : p.y);
  }

  onUp(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    try { this.svg.releasePointerCapture(e.pointerId); } catch { /* sudah dilepas */ }
    this.drag = null;
    this.svg.classList.remove('dragging');
    this.h.onDragEnd();
  }

  dispose() {
    this.ro.disconnect();
    this.svg.remove();
  }
}
