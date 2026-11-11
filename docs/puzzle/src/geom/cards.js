// Reference cards: one A6 card for each poster page, all on one sheet, so they are
// laser cut once and UV printed once (Boss, 11 Nov 2026). When the pieces of a job's
// puzzles get mixed up, the card shows each picture whole. Pure arithmetic, no DOM.
//
//   * A card is A6 the way a puzzle is A3: the poster's long side takes 148 mm and
//     the short side follows its ratio, so nothing is stretched. A 2:3 poster makes
//     a 98.67 x 148 mm card.
//   * The picture runs 2 mm past every edge of the card (Boss) and is clipped there,
//     so a print that lands a little off does not leave an edge bare. Ratio locked,
//     the picture has to grow by the larger of the two needs; the clip trims the
//     other axis back to 2 mm.
//   * Cards stand 4 mm apart, twice the bleed. Neighbouring bleeds meet without
//     overlapping, so every card keeps all of its 2 mm.
//   * A 10 mm frame goes round the cards and is cut last. It holds the cards while
//     they are printed and gives the sheet a known corner to lay on the bed.
//   * The grid is whichever row and column count makes the smallest sheet that fits
//     the UV bed.

import { fitsBed } from './poster.js';

export const CARD_LONG_MM = 148;            // A6
export const CARD_BLEED_MM = 2;
export const CARD_GAP_MM = 2 * CARD_BLEED_MM;
export const CARD_FRAME_MM = 10;
export const CARD_CORNER_MM = 3;

const r2 = (v) => Math.round(v * 100) / 100;

/** One card for a page of this size, and the picture that covers it with its bleed. */
export function cardFor(posterW, posterH) {
  const ratio = posterW / posterH;
  const width = ratio > 1 ? CARD_LONG_MM : r2(CARD_LONG_MM * ratio);
  const height = ratio > 1 ? r2(CARD_LONG_MM / ratio) : CARD_LONG_MM;
  const b = CARD_BLEED_MM;
  const scale = Math.max((width + 2 * b) / width, (height + 2 * b) / height);
  const artH = r2(height * scale);
  const artW = r2(artH * ratio);
  return {
    width,
    height,
    art: { width: artW, height: artH, dx: r2((artW - width) / 2), dy: r2((artH - height) / 2) },
  };
}

/**
 * Every page's card on one sheet, in page order, row by row.
 *
 * @param pages [{ index, widthMm, heightMm }]
 * @returns null for no pages, else { sheet: { width, height }, cols, rows, fitsBed, cards }
 *          Each card: { index, x, y, width, height, art, clip } in mm from the sheet's
 *          top-left. `art` is where the picture goes, `clip` the card plus its bleed:
 *          the picture is cut to it, and the Spot white fills it.
 */
export function layoutCards(pages) {
  if (!pages.length) return null;
  const cards = pages.map((p) => ({ index: p.index, ...cardFor(p.widthMm, p.heightMm) }));
  const cellW = Math.max(...cards.map((c) => c.width));
  const cellH = Math.max(...cards.map((c) => c.height));
  const F = CARD_FRAME_MM;
  const G = CARD_GAP_MM;
  const B = CARD_BLEED_MM;

  let best = null;
  for (let cols = 1; cols <= cards.length; cols++) {
    const rows = Math.ceil(cards.length / cols);
    const w = r2(2 * F + cols * cellW + (cols - 1) * G);
    const h = r2(2 * F + rows * cellH + (rows - 1) * G);
    const fits = fitsBed(w, h);
    const area = w * h;
    const better = !best
      || (fits && !best.fits)
      || (fits === best.fits && area < best.area - 1e-6);
    if (better) {
      best = {
        cols, rows, w, h, fits, area,
      };
    }
  }

  const placed = cards.map((c, i) => {
    const col = i % best.cols;
    const row = Math.floor(i / best.cols);
    const x = r2(F + col * (cellW + G) + (cellW - c.width) / 2);
    const y = r2(F + row * (cellH + G) + (cellH - c.height) / 2);
    return {
      index: c.index,
      x,
      y,
      width: c.width,
      height: c.height,
      art: {
        x: r2(x - c.art.dx), y: r2(y - c.art.dy), width: c.art.width, height: c.art.height,
      },
      clip: {
        x: r2(x - B), y: r2(y - B), width: r2(c.width + 2 * B), height: r2(c.height + 2 * B),
      },
    };
  });

  return {
    sheet: { width: best.w, height: best.h },
    cols: best.cols,
    rows: best.rows,
    fitsBed: best.fits,
    cards: placed,
  };
}
