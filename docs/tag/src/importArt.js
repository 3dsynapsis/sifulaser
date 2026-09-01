// Bringing artwork in. SVG only, and it becomes real rings.
//
// PNG and JPEG are not accepted, and that is a scope decision rather than an
// omission. A laser cuts along a path; a photograph has no paths in it. Getting
// one into a cut file means tracing it - thresholding, contour following,
// corner detection, curve fitting - which is an engine in its own right, and a
// bad one produces a thousand-node outline that takes longer to cut than it took
// to draw. The Box Maker offers raster because a box wall can carry a raster
// ENGRAVE, where the head sweeps the image and nothing has to be a path. A tag
// could too, but then the PDF export could no longer hold what the SVG holds -
// a PNG cannot be carried into a hand-written PDF as it stands - and the export
// dialog would have to start apologising for the difference. Refusing raster
// keeps the two files identical, which is worth more here than the feature.
//
// So this module is the SVG half of the Box Maker's importArt.js, with the
// raster half removed. The security work below is carried across unchanged; it
// is the part that matters most.

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
 * Sample every shape element into a polygon. Uses the browser's own path maths via
 * getPointAtLength, so arcs and beziers come out right without a path parser.
 */
export function svgTextToRings(text, { tolerance = 0.35 } = {}) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px;height:1000px';
  const parsed = parseSvgSafely(text);
  if (!parsed) return [];
  const svg = document.importNode(parsed, true);
  host.appendChild(svg);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  document.body.appendChild(host);

  const rings = [];
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
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const p = node.getPointAtLength((i / steps) * total);
        const q = m ? p.matrixTransform(m) : p;
        pts.push([q.x, -q.y]); // svg is y-down, we work y-up
      }
      if (pts.length > 2) rings.push(pts);
    }
  } finally {
    host.remove();
  }
  return rings;
}
