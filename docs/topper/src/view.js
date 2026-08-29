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
//
// The cake view's arithmetic is cakeLayout() below rather than inline in the
// drawing, because framing is the one thing here that fails silently: content
// outside its viewBox raises nothing, it just does not appear, and the tool
// looks like it drew a bare cake. Pulled out as a pure function the containment
// can be asserted in a plain node test, with no DOM anywhere near it.

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

/**
 * Where everything in the cake view goes, in SVG user units.
 *
 * SVG y runs downwards and the geometry is y-up, so every ring is drawn as
 * (flipY - y). flipY is the topper's own height, which puts the top of the
 * piece on screen y = 0 and the tips of the stakes on screen y = d.height -
 * that is, the whole piece occupies positive y, inside a viewBox that starts a
 * little above zero. Passing 0 instead maps the piece to negative y, entirely
 * above the frame, and nothing but the cake is drawn.
 *
 * `buried` is how much of the piece is under the icing. With no stakes there is
 * nothing to bury: the piece sits on the icing rather than sunk into it, which
 * is both what happens and what makes the missing stakes obvious.
 *
 * `content` is the bounding box of everything drawn, as a nominal box: the
 * outline is normalised to start at (0, 0) and measures d.width x d.height.
 * Kerf compensation moves the cut path half a beam outside that, which is well
 * inside the padding, but it is why the box is nominal rather than exact. The
 * viewBox is then stretched to hold it, so the two can never disagree.
 */
export function cakeLayout(d, params = {}) {
  const stakeLength = Math.max(0, params.stakeLength ?? 0);
  const stakes = Math.max(0, Math.round(params.stakes ?? 0));
  const buried = stakes > 0
    ? Math.min(d.height * 0.5, Math.max(8, stakeLength * 0.72))
    : 0;
  const cakeW = Math.max(d.width * 1.5, 140);
  const cakeH = Math.max(d.height * 0.42, 60);
  const cx = d.width / 2;
  const icing = d.height - buried;

  // The cake and the piece decide how the drawing is framed and how heavy the
  // lines are. The weight marker does not get a vote on either - a badly leaning
  // topper would otherwise blow the frame out sideways and shrink the thing
  // being judged to a speck - but it does get included afterwards, below.
  const pad = d.height * 0.08;
  const W = Math.max(cakeW, d.width) * 1.12;
  const H = d.height + cakeH + pad * 2;
  const sw = Math.max(0.25, W / 520);

  // The weight marker is the only thing that reaches above the piece, and it is
  // the reason the frame carries head-room at all.
  const marker = d.stakeAt.length
    ? (() => {
      const lo = Math.min(...d.stakeAt);
      const hi = Math.max(...d.stakeAt);
      return {
        lo,
        hi,
        support: icing + cakeH * 0.5,
        x: (lo + hi) / 2 + (d.balance * Math.max(hi - lo, 1)) / 2,
        top: icing - d.height * 0.1,
        r: sw * 3,
        bad: Math.abs(d.balance) > 1,
      };
    })()
    : null;

  const content = {
    x0: Math.min(0, cx - cakeW / 2, marker ? marker.x - marker.r : Infinity),
    y0: Math.min(0, icing, marker ? marker.top - marker.r : Infinity),
    x1: Math.max(d.width, cx + cakeW / 2, marker ? marker.x + marker.r : -Infinity),
    y1: Math.max(d.height, icing + cakeH, marker ? marker.support : -Infinity),
  };

  // The frame is the content box or larger, never the other way round. Working
  // out a viewBox from the cake alone and hoping everything else lands in it is
  // the failure this function exists to rule out: a topper whose weight sits
  // well outside its stakes puts the marker metres away, and a frame that did
  // not stretch to reach it would draw the warning banner over a canvas with no
  // marker on it. The base frame is still the floor, so the ordinary case is
  // framed exactly as before and only a runaway pulls the walls out.
  const viewBox = (() => {
    const x0 = Math.min(cx - W / 2, content.x0 - pad);
    const y0 = Math.min(-pad, content.y0 - pad);
    const x1 = Math.max(cx + W / 2, content.x1 + pad);
    const y1 = Math.max(-pad + H, content.y1 + pad);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  })();

  return { flipY: d.height, buried, cakeW, cakeH, cx, icing, sw, viewBox, content, marker };
}

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
    else this.onCake(result, opts);
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
  onCake(result, opts = {}) {
    const d = result.derived;
    const panel = result.panels[0];
    const L = cakeLayout(d, result.params);
    const {
      cakeW, cakeH, cx, icing, sw, viewBox: vb,
    } = L;
    const topper = [
      ringD(panel.outline, L.flipY),
      ...panel.holes.map((h) => ringD(h, L.flipY)),
      ...(panel.loose || []).map((h) => ringD(h, L.flipY)),
    ].filter(Boolean).join(' ');

    this.frame(vb.x, vb.y, vb.w, vb.h);

    // The sheet is chosen once and means the same thing in every view, so the
    // colour the 3D preview paints is the colour on the cake too. It is set as
    // the stylesheet's own --board rather than as a fill attribute, because a
    // class rule beats a presentation attribute and .topper would win. Clear
    // acrylic passes nothing: it has no colour of its own to paint.
    const g = el('g', opts.color ? { style: `--board:${opts.color}` } : {});

    // The topper first, then the cake over it - so the buried part of the stakes
    // is hidden by the cake instead of being drawn across it. What is left
    // showing is exactly what will show on the table, which is the one question
    // this view exists to answer.
    g.append(el('path', {
      d: topper, class: 'topper', 'fill-rule': 'evenodd', 'stroke-width': sw,
    }));
    g.append(el('rect', {
      x: cx - cakeW / 2, y: icing, width: cakeW, height: cakeH,
      rx: Math.min(6, cakeH * 0.12), class: 'cake', 'stroke-width': sw,
    }));
    g.append(el('rect', {
      x: cx - cakeW / 2, y: icing, width: cakeW, height: cakeH * 0.26,
      rx: Math.min(6, cakeH * 0.12), class: 'icing', 'stroke-width': sw,
    }));

    // Where the weight sits, and where it is held. When these drift apart the
    // topper leans, and the numbers in the inspector say so - this is the same
    // fact drawn, so it can be seen rather than read.
    if (L.marker) {
      const m = L.marker;
      const cls = m.bad ? 'weight bad' : 'weight';
      g.append(el('line', {
        x1: m.lo, x2: m.hi, y1: m.support, y2: m.support,
        class: 'support', 'stroke-width': sw * 1.4,
      }));
      g.append(el('line', {
        x1: m.x, x2: m.x, y1: m.support, y2: m.top,
        class: cls, 'stroke-width': sw * 1.1,
      }));
      g.append(el('circle', { cx: m.x, cy: m.top, r: m.r, class: cls }));
    }
    this.svg.append(g);
  }
}
