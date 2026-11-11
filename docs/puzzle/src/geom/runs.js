// The print files laid out the way the cut panels go on the UV bed (Boss, 11 Nov 2026).
//
// Every panel is cut from the same one-set cut file, then laid on the bed edge to
// edge from its corner, with no gap. One print file covers a whole bed load, so a
// job of five A4 posters prints in two runs rather than five. Pure arithmetic.
//
//   * The bed is 900 x 600 mm. A page's x runs along the 900, its y along the 600.
//   * Panels of one size are all laid the same way round: whichever puts more of
//     them on the bed. A panel too long for the bed's short side is turned 90°
//     clockwise, and its print with it.
//   * A run with fewer panels than the bed holds uses the fewest rows it can, from
//     the corner, so the file is no bigger than what is on the bed.

import { UV_BED_MM } from './poster.js';

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * @param count how many panels of this size
 * @param panel { width, height } in mm
 * @returns [] when the panel cannot go on the bed either way round, else one entry per
 *          run: { first, count, cols, rows, width, height, turned, slots: [{ x, y }] }
 *          `first` is the index of the run's first panel, slots are top-left corners.
 */
export function planRuns(count, panel, bed = UV_BED_MM) {
  const across = (w, h) => ({ cols: Math.floor(bed.long / w), rows: Math.floor(bed.short / h) });
  const flat = across(panel.width, panel.height);
  const side = across(panel.height, panel.width);
  const turned = side.cols * side.rows > flat.cols * flat.rows;
  const grid = turned ? side : flat;
  const w = turned ? panel.height : panel.width;
  const h = turned ? panel.width : panel.height;
  const capacity = grid.cols * grid.rows;
  if (!capacity) return [];

  const runs = [];
  for (let first = 0; first < count; first += capacity) {
    const n = Math.min(capacity, count - first);
    const cols = Math.min(grid.cols, n);
    const rows = Math.ceil(n / cols);
    runs.push({
      first,
      count: n,
      cols,
      rows,
      width: r2(cols * w),
      height: r2(rows * h),
      turned,
      slots: Array.from({ length: n }, (_, i) => ({
        x: r2((i % cols) * w),
        y: r2(Math.floor(i / cols) * h),
      })),
    });
  }
  return runs;
}

/** Where a box inside a panel lands once the panel is turned 90° clockwise. */
export function turnBox(box, panelHeight) {
  return {
    x: r2(panelHeight - box.y - box.height),
    y: box.x,
    width: box.height,
    height: box.width,
  };
}
