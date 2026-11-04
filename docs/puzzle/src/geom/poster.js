// A customer's poster -> every size the job needs. Pure arithmetic, no DOM.
//
// The rules are the shop's, agreed with the boss on 4 November 2026:
//
//   * Pick a paper and the poster's LONG side takes that paper's long side. The
//     short side follows the poster's own ratio and is never forced to the
//     paper: posters do not come in one ratio, and stretching one to fit is the
//     thing this exists to avoid. A portrait 2:3 poster on A3 is 280 x 420 mm,
//     not 297 x 420.
//   * Type a height instead and that is the height, whatever the orientation.
//   * Pieces stay about 40 mm whatever the size, so a piece is always easy to
//     pick up. A bigger board means more pieces, not bigger ones.
//   * The artwork is printed slightly larger than the puzzle so it runs off the
//     cut and onto the clear frame. If the print lands a little off, the edge of
//     the puzzle is not left bare. The ratio stays locked, so the overrun cannot
//     be equal on every side: at least 3 mm on the long side and 2 mm on the
//     short one.
//   * The panel has to fit the UV printer bed, 900 x 600 mm, or it is refused.

export const PAPERS = [
  { id: 'A4', long: 297, short: 210 },
  { id: 'A3', long: 420, short: 297 },
  { id: 'A2', long: 594, short: 420 },
];

export const FRAME_MM = 16;       // the clear frame, and each white border strip
export const CORNER_MM = 5;       // outer corners of the white border and backing
export const BLEED_LONG_MM = 3;
export const BLEED_SHORT_MM = 2;
export const PIECE_MM = 40;
export const UV_BED_MM = { long: 900, short: 600 };
export const HEIGHT_MIN_MM = 60;
export const SIDE_MIN_MM = 30;    // below this there is no puzzle left to make
export const LOW_DPI = 150;       // under this a print starts to look soft
export const GOOD_DPI = 300;

/** Generator settings for this product, the same ones the tab offers by hand. */
export const PUZZLE_SETTINGS = {
  tabSize: 20,
  jitter: 4,
  cornerRadius: 0,    // the puzzle's outer edge is square inside the frame
  kerf: 0.15,         // "Acrylic 3 mm (Clear)" in the material list
  kerfComp: true,
};

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * The finished puzzle size for a poster.
 * @param choice { paper: 'A3' } or { height: 420 }
 */
export function fitPoster(posterW, posterH, choice = {}) {
  const ratio = posterW / posterH;
  if (choice.height != null) {
    const height = r1(Math.max(HEIGHT_MIN_MM, choice.height));
    return { width: r1(height * ratio), height };
  }
  const paper = PAPERS.find((p) => p.id === choice.paper) || PAPERS[1];
  return ratio > 1
    ? { width: paper.long, height: r1(paper.long / ratio) }
    : { width: r1(paper.long * ratio), height: paper.long };
}

/**
 * The whole-number grid nearest to square pieces of about 40 mm.
 *
 * Each axis has two candidates, the counts either side of the exact fit. They
 * are judged together because the best count for each axis alone can pair badly:
 * on 297 x 420 mm the nearest counts are 7 and 11, which makes pieces 11% out of
 * square, while 7 x 10 is within 1%.
 */
export function chooseGrid(width, height, target = PIECE_MM) {
  const counts = (size) => {
    const n = size / target;
    const both = [Math.floor(n), Math.ceil(n)].map((v) => Math.max(2, Math.min(60, v)));
    return [...new Set(both)];
  };
  let best = null;
  for (const cols of counts(width)) {
    for (const rows of counts(height)) {
      const w = width / cols;
      const h = height / rows;
      const cost = Math.abs(Math.log(w / target)) + Math.abs(Math.log(h / target))
        + Math.abs(Math.log(w / h));
      if (!best || cost < best.cost - 1e-9) best = { cols, rows, cost };
    }
  }
  return { cols: best.cols, rows: best.rows };
}

/** Where the artwork sits relative to the panel's top-left corner, in mm. */
export function artFor(width, height, ratio) {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const scale = Math.max(
    (long + 2 * BLEED_LONG_MM) / long,
    (short + 2 * BLEED_SHORT_MM) / short,
  );
  const artH = r2(height * scale);
  const artW = r2(artH * ratio);
  const bleedX = r2((artW - width) / 2);
  const bleedY = r2((artH - height) / 2);
  return {
    width: artW,
    height: artH,
    bleedX,
    bleedY,
    x: r2(FRAME_MM - bleedX),
    y: r2(FRAME_MM - bleedY),
  };
}

/** A panel can lie either way round on the bed. */
export function fitsBed(w, h, bed = UV_BED_MM) {
  return Math.max(w, h) <= bed.long && Math.min(w, h) <= bed.short;
}

/** The tallest puzzle of this ratio whose panel still fits the bed, in whole mm. */
export function largestHeightForBed(ratio, bed = UV_BED_MM) {
  const q = Math.min(ratio, 1 / ratio);   // short side as a fraction of the long
  const long = Math.min(bed.long - 2 * FRAME_MM, (bed.short - 2 * FRAME_MM) / q);
  return Math.floor(ratio > 1 ? long * q : long);
}

/** Everything about one poster at one size. */
export function planPoster(posterW, posterH, choice) {
  const ratio = posterW / posterH;
  const { width, height } = fitPoster(posterW, posterH, choice);
  const { cols, rows } = chooseGrid(width, height);
  const panel = { width: r2(width + 2 * FRAME_MM), height: r2(height + 2 * FRAME_MM) };
  return {
    ratio,
    width,
    height,
    cols,
    rows,
    pieces: cols * rows,
    pieceW: width / cols,
    pieceH: height / rows,
    art: artFor(width, height, ratio),
    panel,
    fitsBed: fitsBed(panel.width, panel.height),
    maxHeight: largestHeightForBed(ratio),
    tooSmall: Math.min(width, height) < SIDE_MIN_MM,
  };
}

export const puzzleParams = (plan, seed) => ({
  width: plan.width,
  height: plan.height,
  cols: plan.cols,
  rows: plan.rows,
  seed,
  ...PUZZLE_SETTINGS,
});

/**
 * Resolution of a picture in the poster once printed at this size.
 * @param image { pxW, pxH, fracW, fracH } pixels, and the share of the page it covers
 */
export function effectiveDpi(image, plan) {
  const inchesW = (plan.art.width * image.fracW) / 25.4;
  const inchesH = (plan.art.height * image.fracH) / 25.4;
  return Math.min(image.pxW / inchesW, image.pxH / inchesH);
}

/** Pixel size to ask the customer for. */
export const pixelsFor = (plan, dpi = GOOD_DPI) => ({
  w: Math.round((plan.art.width / 25.4) * dpi),
  h: Math.round((plan.art.height / 25.4) * dpi),
});
