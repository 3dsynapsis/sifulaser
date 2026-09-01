// The preview, two ways of looking at the same keychain.
//
//   piece  the finished thing: the board painted in the colour of the sheet
//          chosen, holes punched through it, engraving burnt on, and a split
//          ring drawn through the hole so the size of the hole means something.
//   flat   the cut lines exactly as the export writes them, in the layer
//          colours the laser will be given.
//
// The flat view calls the same nest() the export does, so what is on screen is
// what lands in the file.
//
// Framing is worked out in frameFor() rather than inline in the drawing,
// because framing is the one thing here that fails silently: content outside a
// viewBox raises nothing, it simply does not appear, and the tool looks like it
// drew an empty stage. Pulled out as a pure function it can be asserted in a
// plain node test with no DOM anywhere near it.

import { nest, collect } from './export.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const n3 = (v) => Math.round(v * 1000) / 1000;

const ringD = (pts, flipY) => {
  if (pts.length < 2) return '';
  let d = `M${n3(pts[0][0])} ${n3(flipY - pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${n3(pts[i][0])} ${n3(flipY - pts[i][1])}`;
  return `${d}Z`;
};

const flatD = (arr, flipY, close) => {
  if (arr.length < 4) return '';
  let d = `M${n3(arr[0])} ${n3(flipY - arr[1])}`;
  for (let k = 2; k < arr.length; k += 2) d += `L${n3(arr[k])} ${n3(flipY - arr[k + 1])}`;
  return close ? `${d}Z` : d;
};

/**
 * What an engraved mark looks like on a given board.
 *
 * Not a theme colour, and this is worth being firm about because it was one at
 * first and it was wrong in a way that looked deliberate. The preview backdrop
 * is the viewer's choice; what the laser does to the sheet is not. On a light
 * board the beam chars the surface and the mark is dark; on a dark one it
 * frosts it and the mark is pale. Tying the mark to the backdrop instead
 * painted a white name on cream falcata the moment somebody switched to the
 * dark backdrop, and the engraving simply vanished.
 *
 * The threshold is on perceived luminance rather than on plain average, since
 * green carries most of what the eye reads as brightness.
 */
export function burnFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 'rgba(42, 33, 24, .74)';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.42 ? 'rgba(42, 33, 24, .74)' : 'rgba(238, 240, 244, .72)';
}

/**
 * The viewBox for a piece w x h, with room for the split ring and a margin.
 *
 * The ring is drawn hanging off the hole, and it reaches outside the piece by
 * its own diameter. Framing on the piece alone therefore clips it - which is
 * not a crash, it is a ring with a bite taken out of it, and the kind of thing
 * that survives review because it looks deliberate.
 */
export function frameFor(w, h, ring) {
  const pad = Math.max(w, h) * 0.09 + 2;
  let x0 = -pad;
  let y0 = -pad;
  let x1 = w + pad;
  let y1 = h + pad;
  if (ring) {
    x0 = Math.min(x0, ring.cx - ring.r - pad);
    x1 = Math.max(x1, ring.cx + ring.r + pad);
    y0 = Math.min(y0, ring.cy - ring.r - pad);
    y1 = Math.max(y1, ring.cy + ring.r + pad);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Where the split ring hangs, given the hole and which end of the piece it is
 * on: outwards, along the axis it was placed on, touching the inside of the
 * hole. Screen coordinates, y already flipped.
 */
export function ringFor(d, params) {
  if (!d.holeAt) return null;
  const r = Math.max(3.5, d.holeR * 2.2);
  const [hx, hy] = d.holeAt;
  const sy = d.height - hy;
  switch (params.holeEnd) {
    case 'right': return { cx: hx + r - d.holeR, cy: sy, r, hx, hy: sy };
    case 'top': return { cx: hx, cy: sy - r + d.holeR, r, hx, hy: sy };
    case 'bottom': return { cx: hx, cy: sy + r - d.holeR, r, hx, hy: sy };
    default: return { cx: hx - r + d.holeR, cy: sy, r, hx, hy: sy };
  }
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
    else this.piece(result, opts);
  }

  frame(box) {
    this.svg.setAttribute('viewBox', `${n3(box.x)} ${n3(box.y)} ${n3(box.w)} ${n3(box.h)}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  // ---- the cut file, drawn ------------------------------------------------
  flat(result) {
    const { placed, width, height } = nest(result.panels, { sheetWidth: 900 });
    const { cut, engrave, engraveFill } = collect(placed);
    this.frame(frameFor(width, height, null));
    const sw = Math.max(0.15, Math.max(width, height) / 500);

    const fd = engraveFill.map((a) => flatD(a, height, true)).filter(Boolean).join(' ');
    if (fd) this.svg.append(el('path', { d: fd, class: 'engrave-fill', 'fill-rule': 'nonzero' }));
    const ld = engrave.map((a) => flatD(a, height, false)).filter(Boolean).join(' ');
    if (ld) {
      this.svg.append(el('path', {
        d: ld, class: 'engrave', fill: 'none', 'stroke-width': sw,
      }));
    }
    const cd = cut.map((r) => ringD(r, height)).filter(Boolean).join(' ');
    if (cd) {
      this.svg.append(el('path', {
        d: cd, class: 'cut', fill: 'none', 'stroke-width': sw * 1.2,
      }));
    }
  }

  // ---- the finished thing -------------------------------------------------
  piece(result, opts = {}) {
    const d = result.derived;
    const panel = result.panels[0];
    const ring = ringFor(d, result.params);
    this.frame(frameFor(d.width, d.height, ring));
    const sw = Math.max(0.12, Math.max(d.width, d.height) / 500);

    const style = [
      opts.color ? `--board:${opts.color}` : '',
      opts.burn ? `--burn:${opts.burn}` : '',
    ].filter(Boolean).join(';');
    const g = el('g', style ? { style } : {});

    // The split ring goes behind the board, so the board hides the half of it
    // that is threaded through. That is the whole reason it is drawn at all:
    // it puts the hole at the scale of the thing that goes in it, which no
    // number in the inspector does.
    if (ring) {
      g.append(el('circle', {
        cx: ring.cx, cy: ring.cy, r: ring.r, class: 'splitring',
        'stroke-width': Math.max(0.5, d.holeR * 0.55), fill: 'none',
      }));
    }

    // The board: outline plus every hole, as one even-odd path so the holes are
    // actually holes rather than circles painted on top in the stage colour -
    // which would look identical until somebody put a dark backdrop behind it.
    const board = [
      ringD(panel.outline, d.height),
      ...panel.holes.map((r) => ringD(r, d.height)),
    ].filter(Boolean).join(' ');
    g.append(el('path', {
      d: board, class: 'board', 'fill-rule': 'evenodd', 'stroke-width': sw,
    }));

    // Pieces that drop out of the sheet, drawn as ghosts. They are part of the
    // cut file and not part of the keychain, and this is the only place that
    // difference can be seen.
    for (const l of panel.loose || []) {
      g.append(el('path', {
        d: ringD(l, d.height), class: 'dropout', 'stroke-width': sw,
      }));
    }

    const fd = (panel.engraveFill || []).map((a) => flatD(a, d.height, true))
      .filter(Boolean).join(' ');
    if (fd) g.append(el('path', { d: fd, class: 'burn-fill', 'fill-rule': 'nonzero' }));
    const ld = (panel.engrave || []).map((a) => flatD(a, d.height, false))
      .filter(Boolean).join(' ');
    if (ld) {
      g.append(el('path', {
        d: ld, class: 'burn', fill: 'none', 'stroke-width': Math.max(0.35, sw * 2.5),
      }));
    }

    // Where it will break, marked on the drawing. The inspector says "2.4 mm"
    // and that is a number; this says where, which is the part that tells you
    // which control to reach for.
    if (opts.showWeak && d.neckAt && d.neck < (opts.minNeck ?? 2)) {
      g.append(el('circle', {
        cx: d.neckAt[0], cy: d.height - d.neckAt[1],
        r: Math.max(1.4, d.width / 45), class: 'weak',
        'stroke-width': Math.max(0.3, sw * 2),
      }));
    }
    this.svg.append(g);
  }
}
