// Fail potong, dilukis.
//
// Satu pandangan dan satu perbendaharaan kata: panel disusun TEPAT seperti
// export.js menulisnya, dalam warna lapisan yang laser akan terima. Tiada apa
// di sini dicat supaya nampak seperti kayu - tab 3D ialah tempat objek itu,
// dan tab ini ialah failnya. Dua pelukis bagi benda yang sama akan hanyut,
// jadi yang ini memanggil nest() dan sheetGeometry() pengeksport sendiri.

import { nest, sheetGeometry, sheetDef, LAYERS } from './export.js';
import { labelPathData } from './geom/label.js';
import { ringsToPath } from './geom/path.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

export class View2D {
  constructor(root) {
    this.root = root;
    this.wrap = document.createElement('div');
    this.wrap.className = 'sheets';
    this.root.append(this.wrap);
  }

  render(tray, { sheet = '600x400', labels = true } = {}) {
    this.wrap.replaceChildren();
    if (!tray || !tray.panels.length) return;

    const def = sheetDef(sheet);
    const sheets = nest(tray.panels, { sheetW: def.w, sheetH: def.h });

    sheets.forEach((s, idx) => {
      const geo = sheetGeometry(s, { labels, labelSize: 4 });
      const pad = Math.max(s.w, s.h) * 0.02;
      const svg = el('svg', {
        class: 'sheet',
        viewBox: `${-pad} ${-pad} ${s.w + pad * 2} ${s.h + pad * 2}`,
        preserveAspectRatio: 'xMidYMid meet',
      });
      const sw = Math.max(0.25, Math.max(s.w, s.h) / 1100);

      // Pinggir kepingan: garis putus-putus, bukan potongan.
      svg.append(el('rect', {
        x: 0, y: 0, width: s.w, height: s.h, class: 'sheet-edge',
        fill: 'none', 'stroke-width': sw, 'stroke-dasharray': `${sw * 8} ${sw * 5}`,
      }));

      // Koordinat kepingan y-ke-atas; SVG y-ke-bawah. Satu kumpulan terbalik,
      // sama seperti fail eksport.
      const g = el('g', { transform: `translate(0 ${s.h}) scale(1 -1)` });
      for (const group of geo.cut) {
        g.append(el('path', {
          d: ringsToPath(group), class: 'cut', fill: 'var(--panel-fill)',
          'fill-rule': 'evenodd', stroke: LAYERS.cut.color, 'stroke-width': sw,
        }));
      }
      for (const l of geo.labels) {
        const d = labelPathData(l.text, l.x, l.y, l.size);
        if (d) {
          g.append(el('path', {
            d, class: 'label', fill: 'none', stroke: LAYERS.labels.color,
            'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          }));
        }
      }
      svg.append(g);

      const cap = document.createElement('div');
      cap.className = 'sheet-cap';
      const dims = `${Math.round(s.w)} x ${Math.round(s.h)} mm`;
      cap.textContent = sheets.length > 1
        ? `Kepingan ${idx + 1} daripada ${sheets.length} - ${dims}`
        : `${s.placements.length} panel - ${dims}`;
      if (s.overflow) {
        cap.textContent += ' - ADA PANEL LEBIH BESAR DARIPADA KEPINGAN';
        cap.classList.add('warn');
      }

      const card = document.createElement('div');
      card.className = 'sheet-card';
      card.append(svg, cap);
      this.wrap.append(card);
    });
  }
}
