// Preview pane, two ways of looking at the same topper.
//
//   cake   the topper standing in a cake, with the stakes buried where they
//          will really be. This is the only view that answers the question
//          people actually have - does it look right on the cake, and is it
//          going to lean - so it is the one you get first.
//   flat   the piece exactly as the export writes it.
//
// The flat view calls the same nest() the export does, so what is on screen is
// what lands in the file.

import { nest, collect } from './export.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const n3 = (v) => Math.round(v * 1000) / 1000;

const ringD = (pts, h) => {
  if (pts.length < 2) return '';
  let d = `M${n3(pts[0][0])} ${n3(h - pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${n3(pts[i][0])} ${n3(h - pts[i][1])}`;
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
    if (opts.mode === 'flat') this.flat(result);
    else this.onCake(result);
  }

  frame(x, y, w, h) {
    this.svg.setAttribute('viewBox', `${n3(x)} ${n3(y)} ${n3(w)} ${n3(h)}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  // ---- flat ---------------------------------------------------------------
  flat(result) {
    const { placed, width, height } = nest(result.panels, { sheetWidth: 900 });
    const { cut } = collect(placed);
    const pad = Math.max(width, height) * 0.06;
    this.frame(-pad, -pad, width + pad * 2, height + pad * 2);
    const sw = Math.max(0.2, Math.max(width, height) / 600);
    const d = cut.map((r) => ringD(r, height)).filter(Boolean).join(' ');
    if (d) {
      this.svg.append(el('path', {
        d, class: 'cut', fill: 'none', 'stroke-width': sw * 1.2,
      }));
    }
  }

  // ---- on the cake --------------------------------------------------------
  onCake(result) {
    const d = result.derived;
    const panel = result.panels[0];
    const topper = [
      ringD(panel.outline, 0),
      ...panel.holes.map((h) => ringD(h, 0)),
      ...(panel.loose || []).map((h) => ringD(h, 0)),
    ].filter(Boolean).join(' ');

    // The stakes are buried, so the icing line sits a little above the tips
    // rather than at the bottom of the piece. What shows is what shows.
    const buried = Math.min(d.height * 0.5, Math.max(8, result.params.stakeLength * 0.72));
    const cakeW = Math.max(d.width * 1.5, 140);
    const cakeH = Math.max(d.height * 0.42, 60);
    const cx = d.width / 2;

    const W = Math.max(cakeW, d.width) * 1.12;
    const H = d.height + cakeH + d.height * 0.16;
    // y is measured down from the top of the frame; the icing sits where the
    // stakes disappear into it.
    const icing = d.height - buried;
    this.frame(cx - W / 2, -d.height * 0.08, W, H);

    const sw = Math.max(0.25, W / 520);
    const g = el('g', {});

    // Cake first, then the topper over it, then the icing again in front - so
    // the stakes really do vanish into the cake instead of floating on it.
    g.append(el('rect', {
      x: cx - cakeW / 2, y: icing, width: cakeW, height: cakeH,
      rx: Math.min(6, cakeH * 0.12), class: 'cake', 'stroke-width': sw,
    }));
    g.append(el('path', {
      d: topper, class: 'topper', 'fill-rule': 'evenodd', 'stroke-width': sw,
    }));
    g.append(el('rect', {
      x: cx - cakeW / 2, y: icing, width: cakeW, height: cakeH * 0.26,
      rx: Math.min(6, cakeH * 0.12), class: 'icing', 'stroke-width': sw,
    }));

    // Where the weight sits, and where it is held. When these drift apart the
    // topper leans, and the numbers in the inspector say so - this is the same
    // fact drawn, so it can be seen rather than read.
    if (d.stakeAt.length) {
      const lo = Math.min(...d.stakeAt);
      const hi = Math.max(...d.stakeAt);
      g.append(el('line', {
        x1: lo, x2: hi, y1: icing + cakeH * 0.5, y2: icing + cakeH * 0.5,
        class: 'support', 'stroke-width': sw * 1.4,
      }));
      const cxWeight = (lo + hi) / 2 + (d.balance * Math.max(hi - lo, 1)) / 2;
      g.append(el('line', {
        x1: cxWeight, x2: cxWeight, y1: icing + cakeH * 0.5, y2: icing - d.height * 0.1,
        class: Math.abs(d.balance) > 1 ? 'weight bad' : 'weight',
        'stroke-width': sw * 1.1,
      }));
      g.append(el('circle', {
        cx: cxWeight, cy: icing - d.height * 0.1, r: sw * 3,
        class: Math.abs(d.balance) > 1 ? 'weight bad' : 'weight',
      }));
    }
    this.svg.append(g);
  }
}
