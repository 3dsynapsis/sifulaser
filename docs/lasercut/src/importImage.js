// A PNG / JPG / WEBP as a drawing: traced into flat-colour shapes by the Sifu
// Vector engine (src/raster/vectorize.js), one fill layer per colour. Traced
// at 'medium' detail: 'low' (6 colours) merged black lettering and a red logo
// into one dark red on a plain test logo.
//
// A picture has no real size - its DPI field is whatever the phone or the
// screenshot tool wrote - so it starts at DEFAULT_LONG_MM on its longest side
// and the customer is told to set the size they want.
//
// Two layers are added that a picture does not have on its own:
//   * the BACKGROUND colour (the traced colour that fills the frame) is marked
//     as backdrop, so it starts as Abaikan rather than as a full-surface
//     engraving;
//   * a FRAME: the rectangle of the picture, starting as Potong. The usual ask
//     for a picture is "engrave this on a plaque this size". Someone who wants
//     the shape itself cut out switches the frame off and the shape to Potong.

import { reconstructImage } from './raster/vectorize.js';
import { MM_PER_PT } from './cut.js';

export const DEFAULT_LONG_MM = 200;

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/** "M1 2L3 4Z M..." (absolute M/L/Z only, as loopsToPath writes) -> loops. */
function loopsOf(d) {
  const loops = [];
  let cur = null;
  const re = /([MLZ])\s*(-?[\d.]+(?:e-?\d+)?)?[\s,]*(-?[\d.]+(?:e-?\d+)?)?/gi;
  let m;
  while ((m = re.exec(d))) {
    const op = m[1].toUpperCase();
    if (op === 'M') { cur = [+m[2], +m[3]]; loops.push(cur); }
    else if (op === 'L' && cur) cur.push(+m[2], +m[3]);
    else if (op === 'Z' && cur) { cur.push(cur[0], cur[1]); cur = null; }
  }
  return loops.filter((l) => l.length >= 6);
}

export async function readImage(bytes, { detail = 'medium' } = {}) {
  let bmp;
  try {
    bmp = await createImageBitmap(new Blob([bytes]));
  } catch {
    return { ok: false, error: 'image-unreadable' };
  }
  let res;
  try {
    res = await reconstructImage(bmp, { detail });
  } catch {
    return { ok: false, error: 'image-empty' };
  } finally {
    bmp.close?.();
  }
  const W = res.artboard.width, H = res.artboard.height;
  const mmPerPx = DEFAULT_LONG_MM / Math.max(W, H);
  const k = mmPerPx / MM_PER_PT;
  const toPage = (x, y) => [x * k, (H - y) * k];

  const paths = [];
  const rasters = [];
  for (const el of res.elements) {
    if (el.type === 'RASTER_IMAGE' && el.pxBox) {
      const [a, b] = [toPage(el.pxBox[0], el.pxBox[3]), toPage(el.pxBox[2], el.pxBox[1])];
      rasters.push({ bb: [a[0], a[1], b[0], b[1]], oc: [] });
      continue;
    }
    const d = el.properties?.path;
    if (!d) continue;
    const subs = loopsOf(d).map((loop) => {
      const pts = [];
      const bb = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < loop.length; i += 2) {
        const [X, Y] = toPage(loop[i], loop[i + 1]);
        pts.push(X, Y);
        if (X < bb[0]) bb[0] = X;
        if (Y < bb[1]) bb[1] = Y;
        if (X > bb[2]) bb[2] = X;
        if (Y > bb[3]) bb[3] = Y;
      }
      return { pts, bb, closed: true };
    });
    if (!subs.length) continue;
    paths.push({
      subs, stroke: false, fill: true, strokeSep: null, fillSep: null,
      strokeRGB: null, fillRGB: hexToRgb(el.properties.fill), lw: 0, oc: [], clip: null,
      backdrop: el.classification === 'background',
    });
  }
  const w = W * k, h = H * k;
  paths.unshift({
    subs: [{ pts: [0, 0, w, 0, w, h, 0, h, 0, 0], bb: [0, 0, w, h], closed: true }],
    stroke: true, fill: false, strokeSep: null, fillSep: null,
    strokeRGB: [0, 0, 0], fillRGB: null, lw: 0, oc: [], clip: null, frame: true,
  });
  return {
    ok: true,
    read: {
      ok: true, pageCount: 1, page: { mediaBox: null, userUnit: 1, rotate: 0, annots: 0 },
      paths, rasters, texts: [], textSample: '', images: 1, repaired: false, encrypted: false,
    },
    warnings: [{ code: 'image-size', mm: DEFAULT_LONG_MM }, { code: 'image-traced' }],
  };
}
