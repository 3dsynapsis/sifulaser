// The cut file, drawn.
//
// One view and one vocabulary: the five pieces nested exactly as export.js
// writes them, in the layer colours the laser will be handed. Nothing here is
// painted to look like wood - the 3D tab is where the object is, and this tab
// is the file. Two renderers of the same thing would drift, so this one calls
// the exporter's own nest() and collect() rather than laying anything out
// itself.
//
// Rings arrive as PAIRS and engrave paths as FLAT numbers, which is why there
// are two path builders that look almost the same. Handing one the other's
// data raises nothing at all - it just draws a smear - so they are kept apart
// by name.

import { nest, collect } from './export.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const n3 = (v) => Math.round(v * 1000) / 1000;

/** A ring of [x,y] pairs, y flipped into SVG's downward axis. */
const ringD = (pts, h) => {
  if (pts.length < 2) return '';
  let d = `M${n3(pts[0][0])} ${n3(h - pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${n3(pts[i][0])} ${n3(h - pts[i][1])}`;
  return `${d}Z`;
};

/** A flat [x0,y0,x1,y1,...] engrave path, same flip. */
const lineD = (flat, h) => {
  if (flat.length < 4) return '';
  let d = `M${n3(flat[0])} ${n3(h - flat[1])}`;
  for (let k = 2; k < flat.length; k += 2) d += `L${n3(flat[k])} ${n3(h - flat[k + 1])}`;
  return d;
};

export class View2D {
  constructor(root) {
    this.root = root;
    this.svg = el('svg', { class: 'preview', xmlns: SVG_NS });
    this.root.append(this.svg);
  }

  render(result, opts = {}) {
    this.svg.replaceChildren();
    if (!result || !result.panels || !result.panels.length) {
      this.svg.setAttribute('viewBox', '0 0 10 10');
      return;
    }

    const { placed, width, height } = nest(result.panels, {
      sheetWidth: opts.sheetWidth || 900,
    });
    const pad = Math.max(width, height) * 0.05;
    // The part names are written BELOW each piece, outside the nest's own box,
    // so the bottom row needs room of its own or the labels are clipped off.
    const foot = Math.max(width, height) * 0.05;
    this.svg.setAttribute('viewBox',
      `${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2 + foot}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const span = Math.max(width, height);
    const sw = Math.max(0.2, span / 900);

    const { cut, engrave, engraveFill } = collect(placed);

    // Engraving underneath, cutting on top - the order the machine runs them
    // in, and the order that keeps a cut line visible where it crosses a filled
    // medallion.
    const fd = engraveFill.map((l) => `${lineD(l, height)}Z`).filter(Boolean).join(' ');
    if (fd) {
      this.svg.append(el('path', {
        d: fd, class: 'engrave-fill', 'fill-rule': 'nonzero', stroke: 'none',
      }));
    }
    const ed = engrave.map((l) => lineD(l, height)).filter(Boolean).join(' ');
    if (ed) {
      this.svg.append(el('path', {
        d: ed,
        class: 'engrave',
        fill: 'none',
        'stroke-width': sw,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }));
    }
    const cd = cut.map((r) => ringD(r, height)).filter(Boolean).join(' ');
    if (cd) {
      this.svg.append(el('path', {
        d: cd, class: 'cut', fill: 'none', 'stroke-width': sw * 1.3,
      }));
    }

    // Five pieces off one bed, two of them the same shape. Naming them on the
    // drawing is the difference between an assembly and a pile of plywood.
    for (const { panel, bb, dx, dy } of placed) {
      const tag = el('text', {
        x: dx + bb.x0 + bb.w / 2,
        y: height - (dy + bb.y0) + span * 0.026,
        class: 'panel-tag',
        'font-size': span * 0.02,
        'text-anchor': 'middle',
      });
      tag.textContent = panel.name || panel.id;
      this.svg.append(tag);
    }
  }
}
