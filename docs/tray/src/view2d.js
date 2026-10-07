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

  /**
   * Mod cetak: tiada fail rata untuk dilukis, jadi tab ini menjadi PELAN -
   * pandangan atas jasad daripada gelang yang sama yang mesh dibina
   * daripadanya (dinding luar berfillet, setiap petak berfillet, kaki boleh
   * susun sebagai garis putus-putus), dengan saiz setiap petak.
   */
  renderPlan(tray) {
    this.wrap.replaceChildren();
    if (!tray || !tray.rings) return;
    const { params: p, derived: d, rings } = tray;
    const { length: L, width: W } = p;
    const pad = Math.max(L, W) * 0.04;
    const svg = el('svg', {
      class: 'sheet plan',
      viewBox: `${-pad} ${-pad} ${L + pad * 2} ${W + pad * 2}`,
      preserveAspectRatio: 'xMidYMid meet',
    });
    const Y = (y) => W - y;
    const ringD = (pts) => {
      let s = `M${n3(pts[0][0])} ${n3(Y(pts[0][1]))}`;
      for (let i = 1; i < pts.length; i++) s += `L${n3(pts[i][0])} ${n3(Y(pts[i][1]))}`;
      return `${s}Z`;
    };
    // Dinding = luar tolak semua petak, satu laluan evenodd.
    svg.append(el('path', {
      class: 'plan-wall', 'fill-rule': 'evenodd',
      d: [rings.O, ...rings.cells].map(ringD).join(' '),
    }));
    for (const c of rings.cells) svg.append(el('path', { class: 'plan-cell', d: ringD(c) }));
    if (rings.F) {
      const sw = Math.max(L, W) / 600;
      svg.append(el('path', { class: 'plan-foot', d: ringD(rings.F), fill: 'none', 'stroke-width': sw, 'stroke-dasharray': `${sw * 6} ${sw * 4}` }));
    }
    for (const c of d.cells) {
      const label = `${n3(Math.round(c.w * 10) / 10)} x ${n3(Math.round(c.h * 10) / 10)}`;
      const fs = Math.min(Math.min(c.w, c.h) * 0.22, (c.w * 0.88) / (label.length * 0.58));
      if (fs < Math.max(L, W) / 90) continue;
      const t = el('text', {
        class: 'plan-size', x: c.x + c.w / 2, y: Y(c.y + c.h / 2), 'font-size': fs,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      });
      t.textContent = label;
      svg.append(t);
    }

    const cap = document.createElement('div');
    cap.className = 'sheet-cap';
    cap.textContent = `Pelan ${L} x ${W} x ${p.height} mm - dinding ${p.wallT} mm, lantai ${p.floorT} mm, fillet ${n3(Math.round(d.r * 10) / 10)} mm`
      + (d.stack ? ` - kaki boleh susun ${d.footH} mm (garis putus)` : '')
      + (d.flatTop ? '' : ` - pembahagi ${n3(Math.round(d.divH * 10) / 10)} mm`);

    const card = document.createElement('div');
    card.className = 'sheet-card';
    card.append(svg, cap);
    this.wrap.append(card);
  }
}

const n3 = (v) => Math.round(v * 1000) / 1000;
