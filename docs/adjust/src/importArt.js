// Bringing artwork in.
//
// Lifted from the Box Maker (12_Box Maker/src/importArt.js) and extended, rather
// than parsed a second way: svgTextToRings() already samples every shape element
// through the browser's own path maths, so arcs and beziers come out right
// without anyone writing a path parser. The raster half of the original file is
// not here - nothing in this tool engraves a photograph.
//
// Two things are added:
//
//   svgDocScale      how many millimetres one user unit is worth. The sampler
//                    works in viewBox units and a downloaded file may be drawn
//                    in inches, points or bare pixels; without this the
//                    thickness knob would be measuring in the wrong currency.
//   svgTextToShapes  keeps each shape's stroke and fill, so the export can put
//                    the file's own layers back if the user asks for it, and
//                    splits a path that holds several subpaths into one ring
//                    each - see splitSubpaths().

const SHAPE_SEL = 'path, rect, circle, ellipse, polygon, polyline, line';

export const readAsText = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsText(file);
});

/**
 * Turn SVG source into a live element that cannot do anything but be a shape.
 *
 * The obvious way to get an SVG onto the page is to assign the file text to
 * innerHTML, and that is what this used to do. It hands the file the run of the
 * site. A <script> inserted that way does not run, which is the trap - it looks
 * safe - but an event handler does: <image onerror>, <animate onbegin>, and the
 * SVG root`s own onload all fire the moment the node is put in the document.
 * Verified on the live site, not assumed.
 *
 * What that buys an attacker is not a defaced drawing. Every tool here shares an
 * origin with the account pages, so code running in one can read the signed-in
 * user`s Firebase credentials out of storage. Sharing SVG templates is the most
 * ordinary thing in the world for laser work, which makes "open this file" a
 * short path to somebody else`s account.
 *
 * So the file is parsed in a document that is not live - DOMParser runs nothing
 * and fetches nothing - stripped of everything that carries behaviour rather
 * than geometry, and only then imported. XML first, because that is what an SVG
 * is; the HTML parser second, because plenty of real files are not well-formed
 * and refusing them would be a regression dressed up as security.
 */
const UNSAFE_TAGS = [
  'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video',
  'animate', 'animatetransform', 'animatemotion', 'set', 'handler',
];

export function parseSvgSafely(text) {
  const src = String(text ?? '');
  const parser = new DOMParser();
  let svg = null;

  const xml = parser.parseFromString(src, 'image/svg+xml');
  if (!xml.querySelector('parsererror')) {
    const root = xml.documentElement;
    if (root && root.nodeName.toLowerCase() === 'svg') svg = root;
  }
  if (!svg) {
    // Lenient pass. Still inert: a document from DOMParser is not browsing
    // context connected, so nothing in it executes or loads.
    svg = parser.parseFromString(src, 'text/html').querySelector('svg');
  }
  if (!svg) return null;

  for (const node of svg.querySelectorAll(UNSAFE_TAGS.join(','))) node.remove();
  if (UNSAFE_TAGS.includes(svg.nodeName.toLowerCase())) return null;

  const scrub = (el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
      // Handlers, in any spelling.
      if (name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
      // Links out: a reference into this same file is fine, anything else is
      // either a script URL or a request that tells someone the file was opened.
      if (name === 'href' || name.endsWith(':href') || name === 'src') {
        if (!attr.value.trim().startsWith('#')) el.removeAttribute(attr.name);
        continue;
      }
      if (value.includes('javascript:')) el.removeAttribute(attr.name);
    }
    for (const child of el.children) scrub(child);
  };
  scrub(svg);
  return svg;
}
/**
 * Sample every shape element into a polygon, keeping what it was painted with.
 * Uses the browser's own path maths via getPointAtLength, so arcs and beziers
 * come out right without a path parser.
 *
 * Coordinates come back in the document's viewBox units, y-up. They are NOT
 * millimetres yet - see svgDocScale().
 */
export function svgTextToShapes(text, { tolerance = 0.35 } = {}) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px;height:1000px';
  const parsed = parseSvgSafely(text);
  if (!parsed) return [];
  const svg = document.importNode(parsed, true);
  host.appendChild(svg);
  // Stripping the declared size makes getScreenCTM report viewBox units, which
  // is the only frame the whole file agrees on. The physical size is recovered
  // separately, from the text, by svgDocScale().
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  document.body.appendChild(host);

  const shapes = [];
  try {
    const root = svg.getScreenCTM();
    for (const node of svg.querySelectorAll(SHAPE_SEL)) {
      if (typeof node.getTotalLength !== 'function') continue;
      let total = 0;
      try { total = node.getTotalLength(); } catch { continue; }
      if (!total || !Number.isFinite(total)) continue;
      const steps = Math.max(8, Math.min(3000, Math.ceil(total / tolerance)));
      const ctm = node.getScreenCTM();
      const m = root && ctm ? root.inverse().multiply(ctm) : null;
      const step = total / steps;
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const p = node.getPointAtLength((i / steps) * total);
        const q = m ? p.matrixTransform(m) : p;
        pts.push([q.x, -q.y]); // svg is y-down, we work y-up
      }
      const cs = getComputedStyle(node);
      for (const part of splitSubpaths(pts, step)) {
        if (part.length > 2) {
          shapes.push({ pts: part, stroke: cs.stroke || 'none', fill: cs.fill || 'none' });
        }
      }
    }
  } finally {
    host.remove();
  }
  return shapes;
}

/**
 * Break one path's samples where it jumps to a new subpath.
 *
 * Box generators routinely emit a whole sheet as a single <path> with a dozen
 * "M ... Z" subpaths in it, and getPointAtLength walks all of them end to end as
 * one length. Sampled naively that comes back as one ring that teleports between
 * parts, and every measurement taken from it is nonsense.
 *
 * No path data is parsed to find the breaks, which would mean writing the
 * second SVG parser this file exists to avoid. Arc length does it instead:
 * along a continuous curve two samples `step` apart can never be further apart
 * than `step`, so any gap much bigger than that is the pen lifting. The
 * threshold is generous because the only thing on the other side of it is a
 * jump between two different parts of a drawing, which is enormous by
 * comparison.
 */
export function splitSubpaths(pts, step) {
  if (pts.length < 2 || !(step > 0)) return [pts];
  const parts = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d > step * 2.5 + 1e-6) {
      parts.push(cur);
      cur = [];
    }
    cur.push(pts[i]);
  }
  parts.push(cur);
  return parts;
}

/** The original entry point, unchanged in behaviour: just the rings. */
export function svgTextToRings(text, opts = {}) {
  return svgTextToShapes(text, opts).map((s) => s.pts);
}

// ---------------------------------------------------------------------------
// Physical units

const UNIT_MM = {
  mm: 1,
  cm: 10,
  q: 0.25,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  // A bare number is a CSS pixel, and CSS fixes that at 1/96 inch. Every
  // drawing program that exports "px" means that, whatever its own canvas
  // resolution happened to be.
  px: 25.4 / 96,
};

function lengthMm(raw) {
  if (raw == null) return null;
  const m = String(raw).trim().match(/^([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([a-z%]*)$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  const unit = (m[2] || 'px').toLowerCase();
  if (unit === '%') return null; // relative to a viewport we do not have
  const f = UNIT_MM[unit];
  return f == null ? null : { mm: v * f, unit, value: v };
}

/**
 * How many millimetres one viewBox unit is worth.
 *
 * Reads the text rather than the live DOM on purpose: it can then be tested in
 * node, and a file that fails to lay out still gets an answer.
 *
 * A file with no declared size at all is the usual case for exports meant for
 * the web, and there is no honest answer for one. The assumption made - CSS
 * pixels at 96 dpi, which is what the SVG spec says a bare unit is - is
 * reported as an assumption so the UI can say so and let it be overridden. The
 * thickness knob is worthless if the file turns out to have been drawn in
 * inches.
 */
export function svgDocScale(text) {
  const tag = String(text).match(/<svg\b[^>]*>/i);
  if (!tag) return { mmPerUnit: UNIT_MM.px, source: 'assumed', declared: null, viewBox: null };
  const attr = (name) => {
    const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`, 'i');
    const m = tag[0].match(re);
    return m ? (m[1] ?? m[2]) : null;
  };
  const vbRaw = attr('viewBox');
  const vb = vbRaw ? vbRaw.trim().split(/[\s,]+/).map(Number) : null;
  const okVb = vb && vb.length === 4 && Number.isFinite(vb[2]) && vb[2] > 0;
  // A declared size has to be a size. width="0" and width="-10mm" both parse
  // cleanly and both are nonsense as a scale: zero collapses every coordinate to
  // the origin, negative mirrors the whole file. Neither would be caught
  // downstream either, because both come back with a real unit name and the "this
  // file declares no physical size" warning is keyed on the unit being unknown.
  // A size that cannot be used is a size that was not declared.
  const usable = (L) => (L && Number.isFinite(L.mm) && L.mm > 0 ? L : null);
  const w = usable(lengthMm(attr('width')));
  const h = usable(lengthMm(attr('height')));
  const decl = w || h;
  if (!decl) {
    return {
      mmPerUnit: UNIT_MM.px, source: 'assumed', declared: null, viewBox: okVb ? vb : null,
    };
  }
  if (okVb && w) {
    return {
      mmPerUnit: w.mm / vb[2],
      source: w.unit,
      declared: { w: w.mm, h: h ? h.mm : null },
      viewBox: vb,
    };
  }
  // Width unusable but height good, and the viewBox says how tall the drawing
  // is in user units: the same sum down the other axis. Rare, but the answer is
  // there and the alternative is throwing away a stated physical size.
  if (okVb && h && Number.isFinite(vb[3]) && vb[3] > 0) {
    return {
      mmPerUnit: h.mm / vb[3],
      source: h.unit,
      declared: { w: null, h: h.mm },
      viewBox: vb,
    };
  }
  // No usable viewBox: user units are the declared unit, one for one.
  return {
    mmPerUnit: UNIT_MM[decl.unit] ?? UNIT_MM.px,
    source: decl.unit,
    declared: { w: w ? w.mm : null, h: h ? h.mm : null },
    viewBox: okVb ? vb : null,
  };
}

/** The unit choices the UI offers when the file's own answer is not trusted. */
export const UNIT_CHOICES = [
  ['auto', 'From the file'],
  ['mm', 'Millimetres'],
  ['px', 'Pixels (96 dpi)'],
  ['in', 'Inches'],
  ['pt', 'Points'],
];

export const unitFactor = (id) => UNIT_MM[id] ?? null;
