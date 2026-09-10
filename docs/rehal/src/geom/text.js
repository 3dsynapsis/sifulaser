// Single-stroke text layout.
//
// A normal font is an outline: the laser traces the edge of every letter and
// then has to fill it, so a word is dozens of closed loops. A stroke font is the
// skeleton instead - one pass down the middle of each stem - which is what a
// plotter, a drag knife or an engraving head actually wants. Hershey's glyphs
// are polylines, so what comes out here is polylines: no fill, no outline, just
// the path the head follows.
//
// Everything is millimetres, y-up, baseline of the first line at y = 0.

const FACE_CACHE = new Map();
let basePath = new URL('../font/', import.meta.url).href;

/** Point the loader somewhere else (used by the test runner in Node). */
export function setFontBase(href) {
  basePath = href;
  FACE_CACHE.clear();
  FAILED.clear();
}

// Faces that were asked for and did not arrive. "Not in the cache" cannot tell
// those from the ones nobody has opened yet, and the two want opposite handling:
// the second is the ordinary state of thirty-two faces at start-up and deserves
// silence, while the first leaves the tool with nothing to draw and has to say
// so - otherwise the canvas simply goes blank with no account of why.
const FAILED = new Set();

export async function loadFace(id) {
  if (FACE_CACHE.has(id)) return FACE_CACHE.get(id);
  try {
    const res = await fetch(`${basePath}${id}.json`);
    if (!res.ok) throw new Error(`font ${id} failed to load (${res.status})`);
    const face = await res.json();
    FACE_CACHE.set(id, face);
    FAILED.delete(id);
    return face;
  } catch (err) {
    FAILED.add(id);
    throw err;
  }
}

export function faceLoaded(id) {
  return FACE_CACHE.get(id) || null;
}

/** Asked for, and not delivered. See FAILED above. */
export function faceFailed(id) {
  return FAILED.has(id);
}

/** Put a face in the cache directly, for Node and for preloaded data. */
export function putFace(face) {
  FACE_CACHE.set(face.id, face);
  FAILED.delete(face.id);
  return face;
}

export const DEFAULTS = {
  text: 'SifuLaser',
  face: 'sans',
  capHeight: 20,       // mm, height of a capital H
  letterSpacing: 0,    // mm, added between glyphs
  wordSpacing: 0,      // mm, added on top of the space glyph
  lineSpacing: 1.6,    // multiples of cap height, baseline to baseline
  align: 'left',       // left | center | right
  slant: 0,            // degrees; shears each line about its own baseline
  width: 100,          // % horizontal scale
};

const EMPTY = {
  paths: [], shapes: [], lines: 0, width: 0, height: 0,
  bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, advance: 0, lineStep: 0,
};

/**
 * A stroke face stores skeletons in `s`; an outline face stores closed contours
 * in `c`. Both lay out identically - same widths, same baseline - but only one
 * of them has an inside, so only one can be cut out.
 */
export const isOutline = (face) => face?.kind === 'outline';

const GLYPH = (face, code) => face.glyphs[code] || face.glyphs[63] || null;

/** Width of one line in glyph units plus the millimetre spacing already applied. */
function measureLine(line, face, scale, p) {
  let w = 0;
  for (let i = 0; i < line.length; i++) {
    const code = line.charCodeAt(i);
    const g = GLYPH(face, code);
    if (!g) continue;
    w += g.w * scale;
    if (code === 32) w += p.wordSpacing;
    if (i < line.length - 1) w += p.letterSpacing;
  }
  return w;
}

/**
 * Lay the text out.
 * Returns { paths, width, height, lines, baselines } - paths are flat [x,y,...]
 * polylines in millimetres.
 */
export function layout(input = {}) {
  const p = { ...DEFAULTS, ...input };
  const face = p.faceData;
  // No face yet (still loading, or an id that no longer exists). Return the
  // same shape as a real result so every caller downstream keeps working.
  if (!face) return EMPTY;

  const scale = p.capHeight / (face.cap || 12);
  // Hershey gives us two letterforms and no more, so the italic and the
  // condensed cuts a normal family would provide are made here instead. Both are
  // honest transforms of the real skeleton, not a second-guess at a face that
  // does not exist. The shear is taken about each line's own baseline, or the
  // lower lines would slide sideways.
  const wide = Math.max(0.2, (p.width ?? 100) / 100);
  const shear = Math.tan((Math.max(-45, Math.min(45, p.slant || 0)) * Math.PI) / 180);
  const lineStep = p.capHeight * p.lineSpacing;
  const lines = String(p.text ?? '').split(/\r?\n/);
  const widths = lines.map((l) => measureLine(l, face, scale, p) * wide);
  const width = Math.max(0, ...widths);

  const outline = isOutline(face);
  const paths = [];
  // One entry per placed letter, holding that letter's own contours. The
  // grouping matters downstream: a counter is a hole in the letter it belongs
  // to, not in whatever else happens to be sitting on top of it, so the inside
  // test has to be run per letter and the results merged - not run over every
  // contour on the page at once.
  const shapes = [];
  lines.forEach((line, li) => {
    const yBase = -li * lineStep;
    let x = p.align === 'center' ? (width - widths[li]) / 2
      : p.align === 'right' ? width - widths[li]
        : 0;
    for (let i = 0; i < line.length; i++) {
      const code = line.charCodeAt(i);
      const g = GLYPH(face, code);
      if (!g) continue;
      const rings = [];
      for (const st of (outline ? g.c : g.s) || []) {
        const out = new Array(st.length);
        for (let k = 0; k < st.length; k += 2) {
          const gy = st[k + 1] * scale;
          out[k] = x + st[k] * scale * wide + gy * shear;
          out[k + 1] = yBase + gy;
        }
        if (outline) {
          rings.push(out);
          // Closed on the way out, so the same array can be drawn as a polyline.
          paths.push([...out, out[0], out[1]]);
        } else paths.push(out);
      }
      if (rings.length) shapes.push(rings);
      x += g.w * scale * wide;
      if (code === 32) x += p.wordSpacing;
      if (i < line.length - 1) x += p.letterSpacing;
    }
  });

  // Real ink extent, so the exported file is not padded with the font's own
  // ascender and descender room that this particular text never uses.
  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  for (const st of paths) {
    for (let k = 0; k < st.length; k += 2) {
      if (st[k] < minX) minX = st[k];
      if (st[k] > maxX) maxX = st[k];
      if (st[k + 1] < minY) minY = st[k + 1];
      if (st[k + 1] > maxY) maxY = st[k + 1];
    }
  }
  const empty = !paths.length;
  return {
    paths,
    shapes,
    outline,
    lines: lines.length,
    width: empty ? 0 : maxX - minX,
    height: empty ? 0 : maxY - minY,
    bbox: empty ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0: minX, y0: minY, x1: maxX, y1: maxY },
    advance: width,
    lineStep,
  };
}

/** Shift every path so the ink starts at (margin, margin), y-up. */
export function normalise(result, margin = 0) {
  const bbox = result?.bbox;
  if (!bbox || !result.paths?.length) return [];
  const dx = margin - bbox.x0;
  const dy = margin - bbox.y0;
  return result.paths.map((st) => {
    const out = new Array(st.length);
    for (let k = 0; k < st.length; k += 2) {
      out[k] = st[k] + dx;
      out[k + 1] = st[k + 1] + dy;
    }
    return out;
  });
}

/** How far the head travels drawing this, in millimetres. */
export function strokeLength(paths) {
  let d = 0;
  for (const st of paths) {
    for (let k = 2; k < st.length; k += 2) {
      d += Math.hypot(st[k] - st[k - 2], st[k + 1] - st[k - 1]);
    }
  }
  return d;
}
