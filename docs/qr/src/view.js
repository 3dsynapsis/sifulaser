// Preview pane, two ways of looking at the same tag.
//
//   artwork  what it will look like when it comes off the machine: board, a
//            burnt code, a hole you can see through
//   layers   exactly what the file contains, in the colours the file uses, so
//            the red and the black can be checked before anything is imported
//
// Both call the same nest() and collect() the export writer does, so the
// preview cannot drift away from the file.

import { nest, collect } from './export.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const n3 = (v) => (Math.round(v * 1000) / 1000);

const ringD = (pts, h) => {
  if (pts.length < 2) return '';
  let d = `M${n3(pts[0][0])} ${n3(h - pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${n3(pts[i][0])} ${n3(h - pts[i][1])}`;
  return `${d}Z`;
};

const flatD = (st, h) => {
  if (st.length < 4) return '';
  let d = `M${n3(st[0])} ${n3(h - st[1])}`;
  for (let k = 2; k < st.length; k += 2) d += `L${n3(st[k])} ${n3(h - st[k + 1])}`;
  return `${d}Z`;
};

export class View {
  constructor(root) {
    this.root = root;
    this.svg = el('svg', { class: 'preview', xmlns: SVG_NS });
    this.root.append(this.svg);
  }

  render(result, opts = {}) {
    this.svg.replaceChildren();
    if (!result || result.derived.empty || !result.panels.length) {
      this.svg.setAttribute('viewBox', '0 0 10 10');
      return;
    }
    const { placed, width, height } = nest(result.panels, {
      sheetWidth: opts.sheetWidth || 600,
    });
    const pad = Math.max(width, height) * 0.07;
    this.svg.setAttribute('viewBox',
      `${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const span = Math.max(width, height);
    const parts = collect(placed);
    if (opts.mode === 'layers') this.layers(parts, height, span);
    else this.artwork(result, placed, parts, height, span);
  }

  // ---- layers: the file, in the file's own colours ------------------------
  layers(parts, height, span) {
    const sw = Math.max(0.06, span / 900);
    const fd = parts.engraveFill.map((l) => flatD(l, height)).filter(Boolean).join(' ');
    if (fd) {
      this.svg.append(el('path', {
        d: fd, class: 'engrave-fill', 'fill-rule': 'nonzero', stroke: 'none',
      }));
    }
    const cd = parts.cut.map((r) => ringD(r, height)).filter(Boolean).join(' ');
    if (cd) {
      this.svg.append(el('path', {
        d: cd, class: 'cut', fill: 'none', 'stroke-width': sw * 1.4,
      }));
    }
  }

  // ---- artwork: the finished thing ----------------------------------------
  artwork(result, placed, parts, height, span) {
    const d = result.derived;
    const sw = Math.max(0.06, span / 900);
    const g = el('g', {});

    // The board first, opaque, so the hole cut in it reads as a hole rather than
    // as a circle drawn on top of something.
    for (const { panel, dx, dy } of placed) {
      if (!panel.outline) continue;
      const rings = [
        ringD(panel.outline.map(([x, y]) => [x + dx, y + dy]), height),
        ...panel.holes.map((hRing) => ringD(hRing.map(([x, y]) => [x + dx, y + dy]), height)),
      ].filter(Boolean).join(' ');
      g.append(el('path', {
        d: rings, class: 'solid', 'fill-rule': 'evenodd', 'stroke-width': sw,
      }));
    }

    // The quiet zone, shown only when there is no frame to imply it. Four
    // modules of nothing is a real part of the artwork and the one part that is
    // invisible, so with no cut line around it the user gets a dashed box to
    // prove it was accounted for.
    if (!d.hasCut) {
      const { panel, dx, dy } = placed[0];
      const b = panel.bounds;
      g.append(el('rect', {
        x: b.x0 + dx, y: height - (b.y1 + dy),
        width: b.x1 - b.x0, height: b.y1 - b.y0,
        class: 'box', 'stroke-width': sw * 1.5,
      }));
      const q = d.quietMm;
      g.append(el('rect', {
        x: b.x0 + dx + q, y: height - (b.y1 + dy - q),
        width: b.x1 - b.x0 - q * 2, height: b.y1 - b.y0 - q * 2,
        class: 'box', 'stroke-width': sw,
      }));
    }

    const fd = parts.engraveFill.map((l) => flatD(l, height)).filter(Boolean).join(' ');
    if (fd) {
      g.append(el('path', {
        d: fd, class: 'burn-fill', 'fill-rule': 'nonzero', stroke: 'none',
      }));
    }
    this.svg.append(g);
  }
}
