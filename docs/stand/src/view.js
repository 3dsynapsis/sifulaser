// Preview pane, two ways of looking at the same stand.
//
//   assembled  the object as it will sit on a desk - front elevation, with a
//              side elevation beside it showing the face standing in its socket
//   flat       the pieces nested exactly as the export writes them
//
// The flat view calls the same nest() the export does, so the layout on screen
// is the layout in the file rather than a second renderer that can drift.

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

const lineD = (flat, h) => {
  if (flat.length < 4) return '';
  let d = `M${n3(flat[0])} ${n3(h - flat[1])}`;
  for (let k = 2; k < flat.length; k += 2) d += `L${n3(flat[k])} ${n3(h - flat[k + 1])}`;
  return d;
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
    if (opts.mode === 'flat') this.flat(result, opts);
    else this.assembled(result, opts);
  }

  frame(w, h, padFrac = 0.06) {
    const pad = Math.max(w, h) * padFrac;
    this.svg.setAttribute('viewBox',
      `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return Math.max(w, h);
  }

  // ---- flat ---------------------------------------------------------------
  flat(result, opts) {
    const { placed, width, height } = nest(result.panels, {
      sheetWidth: opts.sheetWidth || 600,
    });
    const span = this.frame(width, height);
    const { cut, engrave } = collect(placed);
    const sw = Math.max(0.15, span / 700);

    const ed = engrave.map((l) => lineD(l, height)).filter(Boolean).join(' ');
    if (ed) {
      this.svg.append(el('path', {
        d: ed, class: 'engrave', fill: 'none', 'stroke-width': sw,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }));
    }
    const cd = cut.map((r) => ringD(r, height)).filter(Boolean).join(' ');
    if (cd) {
      this.svg.append(el('path', {
        d: cd, class: 'cut', fill: 'none', 'stroke-width': sw * 1.2,
      }));
    }
    for (const { panel, bb, dx, dy } of placed) {
      this.svg.append(el('text', {
        x: dx + bb.x0 + bb.w / 2,
        y: height - (dy + bb.y0) + span * 0.028,
        class: 'panel-tag',
        'font-size': span * 0.022,
        'text-anchor': 'middle',
      })).textContent = panel.label;
    }
  }

  // ---- assembled ----------------------------------------------------------
  assembled(result, opts) {
    const d = result.derived;
    const t = result.params.thickness;
    const baseTall = d.layers * t;
    const gap = Math.max(12, d.baseW * 0.06);
    const totalW = d.baseW + gap + d.baseD;
    const totalH = d.standHeight;
    const span = this.frame(totalW, totalH, 0.08);
    const sw = Math.max(0.2, span / 520);
    const flip = (y) => totalH - y;

    const g = el('g', {});

    // ---- front elevation: face standing on the base ----
    const face = result.panels[0];
    const faceX = (d.baseW - d.faceW) / 2;
    const faceD = [
      ringD(face.outline, 0),
      ...face.holes.map((h) => ringD(h, 0)),
      ...(face.loose || []).map((h) => ringD(h, 0)),
    ].filter(Boolean).join(' ');
    // The face sits with its shoulder on the top of the base, which puts the
    // panel's own origin - the bottom of its tenons - one board up from the
    // table. Drawn before the base so the tenons read as hidden detail.
    const faceG = el('g', {
      transform: `translate(${faceX} ${flip(t)}) scale(1 1)`,
    });
    faceG.append(el('path', { d: faceD, class: 'solid', 'stroke-width': sw }));
    if (face.engrave?.length) {
      const ed = face.engrave.map((l) => lineD(l, 0)).filter(Boolean).join(' ');
      if (ed) {
        faceG.append(el('path', {
          d: ed, class: 'engrave', fill: 'none', 'stroke-width': sw * 0.8,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }));
      }
    }
    g.append(faceG);

    // ---- the base, drawn over the tenons ----
    g.append(el('rect', {
      x: 0, y: flip(baseTall), width: d.baseW, height: baseTall,
      rx: Math.min(2, t / 2), class: 'solid base', 'stroke-width': sw,
    }));
    for (let i = 1; i < d.layers; i++) {
      g.append(el('line', {
        x1: 0, x2: d.baseW, y1: flip(i * t), y2: flip(i * t), class: 'seam',
        'stroke-width': sw * 0.7,
      }));
    }

    // ---- side elevation ----
    const sx = d.baseW + gap;
    const s = el('g', { transform: `translate(${sx} 0)` });
    s.append(el('rect', {
      x: 0, y: flip(baseTall), width: d.baseD, height: baseTall,
      rx: Math.min(2, t / 2), class: 'solid base', 'stroke-width': sw,
    }));
    for (let i = 1; i < d.layers; i++) {
      s.append(el('line', {
        x1: 0, x2: d.baseD, y1: flip(i * t), y2: flip(i * t), class: 'seam',
        'stroke-width': sw * 0.7,
      }));
    }
    // The face on edge: its full height, sunk to the floor of the socket.
    const slotY = d.baseD * 0.58;
    s.append(el('rect', {
      x: slotY - t / 2, y: flip(d.standHeight), width: t, height: d.bodyH + d.tenonDepth,
      class: 'solid', 'stroke-width': sw,
    }));
    s.append(el('line', {
      x1: slotY - t / 2 - 1.5, x2: slotY + t / 2 + 1.5,
      y1: flip(baseTall), y2: flip(baseTall), class: 'seam', 'stroke-width': sw * 0.7,
    }));
    g.append(s);

    this.svg.append(g);
    void opts;
  }
}
