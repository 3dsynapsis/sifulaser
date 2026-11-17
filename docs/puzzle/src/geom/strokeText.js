// Single-line lettering for laser marking (Boss, 17 Nov 2026: "pakai single layer
// font"): each letter is one stroke deep, so the laser scores it once instead of
// tracing round an outline. Pure: no DOM.
//
// The letterforms are the Hershey "futural" face (Futura Light, simplex sans), as
// converted for the Text Engraver (14_Text Engraver/src/font/sans.json): only the
// capitals this tool writes. Font units, baseline 0, y up, cap height 21; each glyph
// has its advance `w` and its strokes `s`, polylines as flat [x0, y0, x1, y1, ...].
//
// The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the
// U. S. National Bureau of Standards. The format of the font data in the distribution
// these were converted from was originally created by James Hurt, Cognition, Inc.,
// 900 Technology Park Drive, Billerica, MA 01821. The distribution permits use by
// anyone for any purpose, commercial or otherwise, provided these acknowledgements are
// distributed with the font data, and provided the data is not redistributed in the
// format published by the U.S. NTIS, which this is not. Keep this paragraph with the
// glyphs below: it is the licence condition.

const CAP = 21;
const GLYPHS = {
  ' ': { w: 16, s: [] },
  A: { w: 18, s: [[9, 21, 1, 0], [9, 21, 17, 0], [4, 7, 14, 7]] },
  B: { w: 21, s: [[4, 21, 4, 0], [4, 21, 13, 21, 16, 20, 17, 19, 18, 17, 18, 15, 17, 13, 16, 12, 13, 11], [4, 11, 13, 11, 16, 10, 17, 9, 18, 7, 18, 4, 17, 2, 16, 1, 13, 0, 4, 0]] },
  C: { w: 21, s: [[18, 16, 17, 18, 15, 20, 13, 21, 9, 21, 7, 20, 5, 18, 4, 16, 3, 13, 3, 8, 4, 5, 5, 3, 7, 1, 9, 0, 13, 0, 15, 1, 17, 3, 18, 5]] },
  F: { w: 18, s: [[4, 21, 4, 0], [4, 21, 17, 21], [4, 11, 12, 11]] },
  K: { w: 21, s: [[4, 21, 4, 0], [18, 21, 4, 7], [9, 12, 18, 0]] },
  N: { w: 22, s: [[4, 21, 4, 0], [4, 21, 18, 0], [18, 21, 18, 0]] },
  O: { w: 22, s: [[9, 21, 7, 20, 5, 18, 4, 16, 3, 13, 3, 8, 4, 5, 5, 3, 7, 1, 9, 0, 13, 0, 15, 1, 17, 3, 18, 5, 19, 8, 19, 13, 18, 16, 17, 18, 15, 20, 13, 21, 9, 21]] },
  R: { w: 21, s: [[4, 21, 4, 0], [4, 21, 13, 21, 16, 20, 17, 19, 18, 17, 18, 15, 17, 13, 16, 12, 13, 11, 4, 11], [11, 11, 18, 0]] },
  T: { w: 16, s: [[8, 21, 8, 0], [1, 21, 15, 21]] },
};

const r3 = (v) => Math.round(v * 1000) / 1000;

/** The letters this file can write. */
export const STROKE_LETTERS = Object.keys(GLYPHS).join('');

/**
 * Text as single strokes: SVG path data in mm, y down, each stroke its own open
 * subpath. A letter it does not have is left as a space.
 *
 * @param o { x, y, capMm, anchor }: (x, y) the baseline at the start, or at the middle
 *          when anchor is 'middle'; capMm the height of a capital
 * @returns { d, width } width in mm, side bearings included
 */
export function strokeText(text, o) {
  const k = o.capMm / CAP;
  const glyphs = [...String(text).toUpperCase()].map((ch) => GLYPHS[ch] || GLYPHS[' ']);
  const width = glyphs.reduce((sum, g) => sum + g.w, 0) * k;
  let pen = o.anchor === 'middle' ? o.x - width / 2 : o.x;
  const parts = [];
  for (const g of glyphs) {
    for (const stroke of g.s) {
      const pts = [];
      for (let i = 0; i < stroke.length; i += 2) pts.push(`${r3(pen + stroke[i] * k)} ${r3(o.y - stroke[i + 1] * k)}`);
      parts.push(`M ${pts[0]} ${pts.slice(1).map((p) => `L ${p}`).join(' ')}`);
    }
    pen += g.w * k;
  }
  return { d: parts.join(' '), width };
}
