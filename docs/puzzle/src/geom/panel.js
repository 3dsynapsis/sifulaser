// The UV File tab's product (Boss, 11 Nov 2026): a puzzle with no pieces. The poster is
// cut out of a panel at its own edge and UV printed while it still sits in the panel's
// frame, then pushed out. Pure arithmetic, no DOM.
//
// The poster's size follows the Puzzle tab's rules (geom/poster.js):
//
//   * a paper's long side, or a typed height, and the poster's own ratio for the other
//     side; or, here only, the PDF's own size, for a file that is already to size;
//   * the frame (the "border") is 10 mm on every side, with R5 outer corners. It began
//     as the puzzle's 16 mm; Boss cut it to 10 mm, to save material: here it is only
//     the offcut that holds the poster in place for printing;
//   * the artwork runs 2 mm past the poster's edge onto the frame, so a print that lands
//     a little off still reaches the cut. The bleed goes with the frame. The ratio stays
//     locked, so one side gets a little more;
//   * the panel has to fit the UV printer bed, 900 x 600 mm.
//
// Boss, 12 Nov 2026: the first version had no cut at the poster's edge, which was a
// misreading. The cut file and the preview both carry it now.

import {
  fitPoster, fitsBed, largestHeightForBed, artFor, UV_BED_MM,
} from './poster.js';

export const PANEL_BORDER_MM = 10;
export const PANEL_BLEED_MM = 2;
export const PANEL_MIN_MM = 20;    // below this there is no picture worth a panel

/**
 * What a panel is cut from (Boss, 11 Nov 2026). `label` is written on the cut file as
 * it stands here, and goes into the notes and the saved design. The first is the
 * default: the white 3mm the tab began with, so a job saved before there was a choice
 * still reads as what it was. The print file is the same for all: clear acrylic needs
 * the white under the picture as much as white acrylic does.
 */
export const PANEL_MATERIALS = [
  { id: 'acrylic-white-3', label: 'Acrylic Putih 3mm', kind: 'Putih', thick: '3 mm', clear: false },
  { id: 'acrylic-clear-2', label: 'Acrylic Clear 2mm', kind: 'Clear', thick: '2 mm', clear: true },
  { id: 'acrylic-clear-3', label: 'Acrylic Clear 3mm', kind: 'Clear', thick: '3 mm', clear: true },
  { id: 'acrylic-clear-5', label: 'Acrylic Clear 5mm', kind: 'Clear', thick: '5 mm', clear: true },
];

/** The material by id. One this list does not know is the default. */
export const panelMaterial = (id) => PANEL_MATERIALS.find((m) => m.id === id) || PANEL_MATERIALS[0];

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
  const panel = { width: r2(width + 2 * PANEL_BORDER_MM), height: r2(height + 2 * PANEL_BORDER_MM) };
  return {
    ratio,
    width,
    height,
    cols: 0,
    rows: 0,
    pieces: 0,
    border: PANEL_BORDER_MM,
    art: artFor(width, height, ratio, { long: PANEL_BLEED_MM, short: PANEL_BLEED_MM }, PANEL_BORDER_MM),
    panel,
    fitsBed: fitsBed(panel.width, panel.height),
    maxHeight: largestHeightForBed(ratio, UV_BED_MM, PANEL_BORDER_MM),
    tooSmall: Math.min(width, height) < PANEL_MIN_MM,
  };
}
