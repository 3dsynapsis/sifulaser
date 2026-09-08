// Copied, not rewritten, from 17_Template Adjuster/src/importArt.js.
//
// Only three things came across, because only three of them are about reading
// an SVG rather than about refitting one:
//
//   parseSvgSafely   the sanitiser. Mandatory here, not optional - see below.
//   svgDocScale      how many millimetres one viewBox unit is worth, and
//                    - the part this tool is built on - whether it knows.
//   unitFactor       the unit name -> millimetres table.
//
// svgTextToShapes() and svgTextToRings() were deliberately left behind. They
// sample every curve into points at a tolerance measured in viewBox units, so
// a file with a large viewBox is sampled a hundred times more coarsely than a
// small one; they lose the open/closed distinction; and they turn beziers into
// thousands of straight segments. All three are fine for a tool that resizes a
// drawing and unacceptable for one whose whole claim is that it changes the
// container and nothing else. src/svgPath.js reads the path data instead.
//
// If a bug is found in anything below, fix it in BOTH copies. The alternative
// was importing across project folders, which neither the vendoring step nor
// the dev server can follow.

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
 * short path to somebody else`s account - and this tool exists precisely to be
 * handed files from strangers.
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
 * reported as an assumption so the UI can say so and let it be overridden.
 *
 * READ THIS BEFORE USING THE RETURN VALUE. This function never returns null and
 * never throws. When the file declares nothing it still hands back a real,
 * usable, WRONG mmPerUnit of 25.4/96, and the only thing that says so is
 * source === 'assumed'. src/units.js is the one place allowed to read it, and
 * it throws the number away in that case. Everywhere else in this tool asks
 * units.js, not this.
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

export const unitFactor = (id) => UNIT_MM[id] ?? null;
