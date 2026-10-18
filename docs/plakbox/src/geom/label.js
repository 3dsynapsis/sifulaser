// Panel labels, set in a single-line face.
//
// The labels that say Bottom, Left, Front are there for one job: telling the
// pieces apart as you lift them off the bed. They used to be written as an SVG
// <text> element in "sans-serif", and that is wrong twice over.
//
// It renders in whatever font the machine that opens the file happens to have,
// so the same export is a different shape on every computer - and some laser
// front-ends drop <text> outright, leaving unlabelled panels. More to the point
// a filled letterform is the wrong shape for a marking: the head has to trace
// the outline of every letter and then fill it in, which is slow and comes out
// as a heavy block on a face that is meant to carry a light note.
//
// A single-line face is the skeleton instead - one pass down the middle of each
// stroke, exactly the line a pen would draw. It is real geometry, it looks the
// same everywhere, and there is nothing to fill.
//
// Millimetres, y-up, to match everything else in the exporter.

import { SANS } from './hershey-sans.js';

/** Unknown characters fall back to '?' rather than leaving a silent gap. */
const glyphFor = (code) => SANS.glyphs[code] || SANS.glyphs[63] || null;

/** How wide a string sets at this cap height, in millimetres. */
export function labelWidth(text, capHeight = 3) {
  const scale = capHeight / (SANS.cap || 21);
  let w = 0;
  for (const ch of String(text ?? '')) {
    const g = glyphFor(ch.codePointAt(0));
    if (g) w += g.w * scale;
  }
  return w;
}

/**
 * One string as polylines, centred on (cx, cy).
 *
 * Centred on the cap band rather than on the ink: a label reading "Bottom" and
 * one reading "Left" should sit at the same height on their panels, and they
 * would not if the descender of a 'p' were allowed to shift the whole line.
 */
export function labelPaths(text, cx, cy, capHeight = 3) {
  const s = String(text ?? '');
  if (!s) return [];
  const scale = capHeight / (SANS.cap || 21);
  let x = cx - labelWidth(s, capHeight) / 2;
  const baseline = cy - capHeight / 2;
  const out = [];
  for (const ch of s) {
    const g = glyphFor(ch.codePointAt(0));
    if (!g) continue;
    for (const st of g.s) {
      const p = new Array(st.length);
      for (let k = 0; k < st.length; k += 2) {
        p[k] = x + st[k] * scale;
        p[k + 1] = baseline + st[k + 1] * scale;
      }
      out.push(p);
    }
    x += g.w * scale;
  }
  return out;
}

const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** The same thing as SVG path data, ready to drop into a <path d="...">. */
export function labelPathData(text, cx, cy, capHeight = 3) {
  const out = [];
  for (const p of labelPaths(text, cx, cy, capHeight)) {
    if (p.length < 4) continue;
    const d = [`M${fmt(p[0])} ${fmt(p[1])}`];
    for (let k = 2; k < p.length; k += 2) d.push(`L${fmt(p[k])} ${fmt(p[k + 1])}`);
    out.push(d.join(''));
  }
  return out.join(' ');
}

export { SANS };
