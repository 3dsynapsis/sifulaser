// Bringing artwork in. SVG becomes real rings (so it can be cut); raster stays
// raster and is engraved.

const SHAPE_SEL = 'path, rect, circle, ellipse, polygon, polyline, line';

export const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

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

/** Render an emoji (or any glyph) to a transparent PNG for raster engraving. */
export function glyphToDataUrl(glyph, px = 256) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  ctx.font = `${Math.floor(px * 0.8)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, px / 2, px / 2 + px * 0.04);
  return c.toDataURL('image/png');
}

/** Natural size of a data-url image, for keeping the aspect ratio on drop. */
export const imageSize = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
  img.onerror = () => resolve({ w: 1, h: 1 });
  img.src = src;
});

/**
 * Convert a raster image to a 1-bit engrave-friendly PNG. Laser software copes with
 * greyscale, but thresholding here makes the 3D preview honest about what burns.
 */
export const thresholdImage = (src, cut = 128, invert = false) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
      const on = invert ? lum > cut : lum <= cut;
      const alpha = a[i + 3] > 8 && on ? 255 : 0;
      a[i] = a[i + 1] = a[i + 2] = 0;
      a[i + 3] = alpha;
    }
    ctx.putImageData(d, 0, 0);
    resolve(c.toDataURL('image/png'));
  };
  img.onerror = () => resolve(src);
  img.src = src;
});
