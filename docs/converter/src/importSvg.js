// Reading a stranger's SVG.
//
// This is the only reader that needs a browser, and it needs it for exactly one
// thing: getCTM(). An SVG's geometry is written in whatever coordinate system
// the nearest <g transform> happened to leave the pen in, and resolving nested
// transforms, viewBox scaling and preserveAspectRatio by hand is a second SVG
// engine nobody should write. So the file is put in an inert document, the
// browser is asked for each element's matrix, and geom is transformed by us.
//
// Because it needs a DOM, tools/test-converter.js does NOT import this file.
// Everything it hands to the rest of the tool is exercised there through
// svgPath.js instead, which does the actual path reading and is pure.
//
// Coordinates go out in the file's own user units, Y UP. The y flip lives here
// and in the SVG writer, and nowhere else. Turning user units into millimetres
// is one multiply at one seam, in convert.js.

import { parseSvgSafely } from './importArt.js';
import { parsePathData } from './svgPath.js';
import { warnBag, makeDoc, makePath } from './doc.js';

const SHAPE_SEL = 'path, rect, circle, ellipse, line, polyline, polygon';

// Containers whose children are definitions or stencils rather than drawing:
// a <clipPath>'s circle shapes the clip, it is not a circle in the artwork.
const HIDDEN_SEL = 'defs, symbol, clipPath, mask, marker, pattern';

/** Every shape as a "d" string, so one code path reads all seven of them. */
function shapeToD(el) {
  const n = (name, dflt = 0) => {
    const v = parseFloat(el.getAttribute(name));
    return Number.isFinite(v) ? v : dflt;
  };
  const tag = el.nodeName.toLowerCase();
  if (tag === 'path') return el.getAttribute('d') || '';
  if (tag === 'line') return `M ${n('x1')} ${n('y1')} L ${n('x2')} ${n('y2')}`;
  if (tag === 'polyline' || tag === 'polygon') {
    const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    if (pts.length < 4) return '';
    let d = `M ${pts[0]} ${pts[1]}`;
    for (let i = 2; i + 1 < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
    return tag === 'polygon' ? `${d} Z` : d;
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = n('cx');
    const cy = n('cy');
    const rx = tag === 'circle' ? n('r') : n('rx');
    const ry = tag === 'circle' ? n('r') : n('ry');
    if (!(rx > 0) || !(ry > 0)) return '';
    // Two half-turn arcs, which parsePathData turns into four exact cubics.
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} `
      + `A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  }
  if (tag === 'rect') {
    const x = n('x');
    const y = n('y');
    const w = n('width');
    const h = n('height');
    if (!(w > 0) || !(h > 0)) return '';
    let rx = el.hasAttribute('rx') ? n('rx') : (el.hasAttribute('ry') ? n('ry') : 0);
    let ry = el.hasAttribute('ry') ? n('ry') : rx;
    rx = Math.min(Math.max(rx, 0), w / 2);
    ry = Math.min(Math.max(ry, 0), h / 2);
    if (!rx || !ry) return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    return `M ${x + rx} ${y} L ${x + w - rx} ${y} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} `
      + `L ${x + w} ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} `
      + `L ${x + rx} ${y + h} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} `
      + `L ${x} ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
  }
  return '';
}

/** The layer an element belongs to: its nearest named group, or none. */
function layerNameOf(el, root) {
  let n = el.parentNode;
  while (n && n !== root && n.getAttribute) {
    const label = n.getAttribute('inkscape:label') || n.getAttribute('data-layer');
    const id = n.getAttribute('id');
    if (label) return label;
    if (id) return id;
    n = n.parentNode;
  }
  return null;
}

/**
 * SVG text -> Doc, in the file's own USER UNITS, y-up.
 *
 * Not millimetres, and that is deliberate. dxf/parse.js does not scale either.
 * The multiply belongs at one seam - scaleDoc(), called from convert.js - where
 * it can be refused outright when the unit is not known. A reader that scales
 * as well is a second place a factor can be applied, and applying it twice
 * gives a drawing at the wrong size with nothing anywhere to show for it.
 */
export function importSvg(text, { name = '', bytes = 0 } = {}) {
  const warn = warnBag();
  const parsed = parseSvgSafely(text);
  if (!parsed) {
    return makeDoc({
      layers: [{ name: '0', colour: '#000000' }],
      source: { format: 'svg', name, bytes },
      warnings: warn.list(),
    });
  }
  const svg = document.importNode(parsed, true);
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px;height:1000px';
  // Stripping the declared size makes the CTM report viewBox units, which is
  // the one frame the whole file agrees on. The physical size is read from the
  // text separately, by units.js, and applied later.
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  host.appendChild(svg);
  document.body.appendChild(host);

  const paths = [];
  const layers = [];
  const layerIndex = new Map();
  const layerFor = (nm) => {
    const key = nm || '0';
    if (layerIndex.has(key)) return layerIndex.get(key);
    const i = layers.length;
    layers.push({ name: key, colour: '#000000' });
    layerIndex.set(key, i);
    return i;
  };
  layerFor('0');

  try {
    // Counted before the walk, because a shape inside <defs> is matched by the
    // selector below and then skipped, and the user needs to know it went.
    warn.add('svgText', svg.querySelectorAll('text').length);
    warn.add('svgImage', svg.querySelectorAll('image').length);
    warn.add('svgUse', svg.querySelectorAll('use').length);
    if (svg.querySelector('[clip-path], [mask], clipPath, mask')) warn.add('svgClip');

    const rootCtm = svg.getScreenCTM();
    for (const el of svg.querySelectorAll(SHAPE_SEL)) {
      // Asked structurally, not by measurement.
      //
      // The plan was to let getScreenCTM() answer this: it is documented to
      // return null for an element that is not rendered, which is exactly the
      // <defs>/<symbol> case. Chrome hands back a real matrix instead, so a
      // <rect> sitting in <defs> and a <circle> inside a <clipPath> both walked
      // straight into the output at their definition coordinates - two shapes
      // in the converted file that are nowhere in the drawing. Caught by
      // loading an SVG with both and looking at the preview.
      //
      // A <clipPath>'s circle is not artwork, it is a stencil; a <defs> shape
      // is a template waiting for a <use>. Neither is drawn, and asking the
      // document what an element IS beats asking the renderer where it landed.
      if (el.closest && el.closest(HIDDEN_SEL)) {
        warn.add('svgUse');
        continue;
      }
      const ctm = el.getScreenCTM ? el.getScreenCTM() : null;
      // Still kept as a second net: a browser that does return null here, or a
      // shape hidden some other way, is skipped and counted rather than placed
      // untransformed - which is what the Adjuster does, and it puts the shape
      // at its definition position without a word.
      if (!ctm || !rootCtm) {
        warn.add('svgUse');
        continue;
      }
      const m = rootCtm.inverse().multiply(ctm);
      const d = shapeToD(el);
      if (!d) continue;
      const cs = getComputedStyle(el);
      const stroke = cs.stroke && cs.stroke !== 'none' ? cs.stroke : null;
      const fill = cs.fill && cs.fill !== 'none' ? cs.fill : null;
      const li = layerFor(layerNameOf(el, svg));
      // The matrix is applied to the control points by us, so a rotated group
      // and a scaled viewBox both land correctly. Only y is flipped here -
      // SVG counts downwards and everything inside this tool counts up.
      for (const sub of parsePathData(d, [m.a, m.b, m.c, m.d, m.e, m.f])) {
        paths.push(makePath({
          start: [sub.start[0], -sub.start[1]],
          segs: sub.segs.map((s) => (s[0] === 'C'
            ? ['C', s[1], -s[2], s[3], -s[4], s[5], -s[6]]
            : ['L', s[1], -s[2]])),
          closed: sub.closed,
          layer: li,
          stroke,
          fill,
        }));
      }
    }
  } finally {
    host.remove();
  }

  return makeDoc({
    paths,
    layers,
    warnings: warn.list(),
    source: { format: 'svg', name, bytes },
  });
}
