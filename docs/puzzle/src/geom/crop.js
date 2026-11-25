// Trimming the white round a poster (Boss, 25 Nov 2026). A client's logo often comes as a
// whole A4 page with the logo small in the middle: 79% of the page white in the sample
// (Masjid Asy Syakirin). The UV File tab sized the PAGE, so at 100 mm high the logo came
// out 31 x 49 mm in a field of printed white, and the panel was cut round all of it.
//
// A page now has a crop: the part of it that is the poster. The tab finds it by itself
// (findContent: where the page is not white, plus a small margin) and the person can
// move it on screen or type it. Everything after - the size, the panel, the cut file,
// the print file - works on the crop as it worked on the whole page before.
//
// A crop is { x, y, w, h } in mm on the page as it shows (its own /Rotate applied), from
// the top-left. null is the whole page. Pure arithmetic, no DOM.

/** Brighter than this on every channel counts as white paper. JPEG noise sits near 250. */
export const WHITE_LEVEL = 240;
/**
 * White left round the artwork when trimmed: 3% of its long side, and never under 3 mm
 * on the page. Proportional, because it grows and shrinks with the poster: the gap
 * between the artwork and the cut on the finished panel stays the same share of it.
 * The crop is the poster's edge; the bleed comes from the page beyond it (bleedCrop).
 */
export const TRIM_MARGIN_MM = 3;
export const TRIM_MARGIN_SHARE = 0.03;
/** Trim only when it takes away at least this share of the page: below that, leave it be. */
export const TRIM_MIN_GAIN = 0.05;
/** The smallest crop the hands or the boxes can make, mm. */
export const CROP_MIN_MM = 10;

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * The rows and columns where the page has ink: not white, and not see-through (a PNG's
 * empty corners are transparent, not white). A row counts once it has a few such pixels,
 * so a speck of dust in a scan does not hold the crop open.
 *
 * @param rgba   Uint8ClampedArray, width x height x 4
 * @returns { x0, y0, x1, y1 } pixel bounds, inclusive, or null for a blank page
 */
export function findContent(rgba, width, height, { white = WHITE_LEVEL, minInk = null } = {}) {
  const need = minInk ?? Math.max(2, Math.round(Math.min(width, height) * 0.002));
  const rows = new Uint32Array(height);
  const cols = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      if (rgba[i + 3] > 24 && (rgba[i] < white || rgba[i + 1] < white || rgba[i + 2] < white)) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const first = (a) => a.findIndex((n) => n >= need);
  const last = (a) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] >= need) return i;
    return -1;
  };
  const y0 = first(rows);
  const x0 = first(cols);
  if (y0 < 0 || x0 < 0) return null;
  return { x0, y0, x1: last(cols), y1: last(rows) };
}

/** Keep a crop on the page and no smaller than CROP_MIN_MM; rounded to 0.1 mm. */
export function cleanCrop(c, pageW, pageH) {
  if (!c || ![c.x, c.y, c.w, c.h].every(Number.isFinite)) return null;
  const minW = Math.min(CROP_MIN_MM, pageW);
  const minH = Math.min(CROP_MIN_MM, pageH);
  const x = Math.min(Math.max(0, c.x), pageW - minW);
  const y = Math.min(Math.max(0, c.y), pageH - minH);
  const w = Math.min(Math.max(minW, c.w), pageW - x);
  const h = Math.min(Math.max(minH, c.h), pageH - y);
  return { x: r1(x), y: r1(y), w: r1(w), h: r1(h) };
}

/** Whether a crop is the whole page, near enough that it changes nothing. */
export const isWholePage = (c, pageW, pageH) => !c
  || (c.x <= 0.05 && c.y <= 0.05 && c.w >= pageW - 0.1 && c.h >= pageH - 0.1);

/**
 * The crop the tab chooses by itself: the artwork plus TRIM_MARGIN_MM, or null when
 * there is nothing worth trimming (a full-bleed poster, a blank page).
 *
 * @param box     findContent's answer, in pixels of a raster of the whole page
 * @param mmPerPx the raster's scale
 * @param margin  mm round the artwork; by default TRIM_MARGIN_SHARE of its long side
 */
export function trimCrop(box, mmPerPx, pageW, pageH, margin = null) {
  if (!box) return null;
  const long = Math.max(box.x1 - box.x0 + 1, box.y1 - box.y0 + 1) * mmPerPx;
  const m = margin ?? Math.max(TRIM_MARGIN_MM, TRIM_MARGIN_SHARE * long);
  const c = cleanCrop({
    x: box.x0 * mmPerPx - m,
    y: box.y0 * mmPerPx - m,
    w: (box.x1 - box.x0 + 1) * mmPerPx + 2 * m,
    h: (box.y1 - box.y0 + 1) * mmPerPx + 2 * m,
  }, pageW, pageH);
  if (!c || c.w * c.h > (1 - TRIM_MIN_GAIN) * pageW * pageH) return null;
  return c;
}

/**
 * A rect on a page of pageW x pageH, after the page turns `turn` degrees clockwise
 * (0, 90, 180, 270): where the same part of the page then lies.
 */
export function turnRect(c, pageW, pageH, turn) {
  switch (((turn % 360) + 360) % 360) {
    case 90: return { x: pageH - c.y - c.h, y: c.x, w: c.h, h: c.w };
    case 180: return { x: pageW - c.x - c.w, y: pageH - c.y - c.h, w: c.w, h: c.h };
    case 270: return { x: c.y, y: pageW - c.x - c.w, w: c.h, h: c.w };
    default: return { ...c };
  }
}

/**
 * Where the whole page has to go for its crop to fill `target` exactly: what the print
 * file's picture is drawn from (pagePicture's `art`). Both in mm, on the page as it lies
 * after `turn`. With no crop it is `target` itself, as before there were crops.
 */
export function pageBoxFor(crop, pageW, pageH, target, turn = 0) {
  if (!crop) return { x: target.x, y: target.y, width: target.width, height: target.height };
  const c = turnRect(crop, pageW, pageH, turn);
  const sideways = ((turn % 180) + 180) % 180 === 90;
  const [fw, fh] = sideways ? [pageH, pageW] : [pageW, pageH];
  const kx = target.width / c.w;
  const ky = target.height / c.h;
  return {
    x: target.x - c.x * kx,
    y: target.y - c.y * ky,
    width: fw * kx,
    height: fh * ky,
  };
}

/**
 * The part of the page that lands on the artwork's box (the poster and its bleed) when
 * the crop is the poster: the crop grown on each side by the bleed, in page mm. It may
 * run past the page's edge, where the page is white. The bleed is the plan's, on the
 * panel (mm, the way the poster lies); `turned` when the page lies turned 90°.
 */
export function bleedCrop(crop, poster, bleed, turned = false) {
  const [cw, ch] = turned ? [crop.h, crop.w] : [crop.w, crop.h];
  const ex = (bleed.x * cw) / poster.width;
  const ey = (bleed.y * ch) / poster.height;
  const [ux, uy] = turned ? [ey, ex] : [ex, ey];
  return { x: crop.x - ux, y: crop.y - uy, w: crop.w + 2 * ux, h: crop.h + 2 * uy };
}

/** The share of the page a crop leaves out, 0..1. */
export const trimmedShare = (c, pageW, pageH) => (c ? 1 - (c.w * c.h) / (pageW * pageH) : 0);
