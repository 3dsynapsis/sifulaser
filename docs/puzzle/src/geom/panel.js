// The UV File tab's product (Boss, 11 Nov 2026): the customer's poster printed on a
// panel with a 16 mm border, and nothing cut inside it. Pure arithmetic, no DOM.
//
// The sizes follow the Puzzle tab's rules (geom/poster.js), so the two tabs make the
// same panel for the same poster:
//
//   * a paper's long side, or a typed height, and the poster's own ratio for the other
//     side; or, here only, the PDF's own size, for a file that is already to size;
//   * the border is the puzzle's frame, 16 mm on every side, with R5 outer corners;
//   * the artwork runs at least 2 mm past the poster's edge onto the border, so a
//     print that lands a little off leaves no bare edge. The ratio stays locked, so
//     one side gets a little more;
//   * the panel has to fit the UV printer bed, 900 x 600 mm.

import {
  FRAME_MM, fitPoster, fitsBed, largestHeightForBed, artFor,
} from './poster.js';

export const PANEL_BLEED_MM = 2;
export const PANEL_MIN_MM = 20;    // below this there is no picture worth a panel

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Everything about one poster at one size, in the shape planPoster gives, so the rest
 * of the poster flow works on either. There is no puzzle: no grid, no pieces.
 *
 * @param choice { paper: 'A3' }, { height: 420 } or { actual: true } for the PDF's size
 */
export function planPanel(posterW, posterH, choice = {}) {
  const ratio = posterW / posterH;
  const { width, height } = choice.actual
    ? { width: r1(posterW), height: r1(posterH) }
    : fitPoster(posterW, posterH, choice);
  const panel = { width: r2(width + 2 * FRAME_MM), height: r2(height + 2 * FRAME_MM) };
  return {
    ratio,
    width,
    height,
    cols: 0,
    rows: 0,
    pieces: 0,
    art: artFor(width, height, ratio, { long: PANEL_BLEED_MM, short: PANEL_BLEED_MM }),
    panel,
    fitsBed: fitsBed(panel.width, panel.height),
    maxHeight: largestHeightForBed(ratio),
    tooSmall: Math.min(width, height) < PANEL_MIN_MM,
  };
}
