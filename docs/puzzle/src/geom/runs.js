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

/**
 * Panels of any sizes on the bed together (UV File tab, Boss, 25 Nov 2026). Until then
 * only panels of one exact size shared a run, and a trimmed logo is rarely the size of
 * the next: three logos at 100 mm high made three cut files and three print runs. Now
 * one bed load is one cut file and one print file, laid out alike, so the cut panels go
 * onto the bed as they came off the laser.
 *
 * Shelves, tallest first (first fit decreasing height): each shelf runs along the bed's
 * 900, the shelves stack along its 600, panels edge to edge with no gap, as planRuns
 * lays them. Each layout is tried with every panel as it lies, every panel turned, and
 * every panel with its long side along the 900, and the one with the fewest beds wins,
 * then the one that covers the least of them. Panels of one size come out as
 * planRuns lays them.
 *
 * @param panels [{ width, height }] mm, in the job's order
 * @returns null when a panel does not fit the bed either way round, else one entry per
 *          bed load: { width, height, slots: [{ index, x, y, turned }] }, `index` into
 *          `panels`, x along the 900, slots in the order they were placed
 */
export function packPanels(panels, bed = UV_BED_MM) {
  const fits = (w, h) => w <= bed.long + 1e-9 && h <= bed.short + 1e-9;
  if (panels.some((p) => !fits(p.width, p.height) && !fits(p.height, p.width))) return null;
  const ways = [
    () => false,                                  // as they lie
    () => true,                                   // all turned
    (p) => p.height > p.width,                    // long side along the 900
  ];
  let best = null;
  for (const way of ways) {
    const items = panels.map((p, index) => {
      let turned = way(p);
      if (!fits(turned ? p.height : p.width, turned ? p.width : p.height)) turned = !turned;
      return { index, turned, w: turned ? p.height : p.width, h: turned ? p.width : p.height };
    });
    // Tallest first; a tie keeps the job's order.
    items.sort((a, b) => b.h - a.h || a.index - b.index);
    const beds = [];
    for (const it of items) {
      let placed = false;
      for (const b of beds) {
        const shelf = b.shelves.find((s) => it.h <= s.h + 1e-9 && s.used + it.w <= bed.long + 1e-9);
        if (shelf) {
          b.slots.push({ index: it.index, x: r2(shelf.used), y: r2(shelf.y), turned: it.turned });
          shelf.used += it.w;
          placed = true;
          break;
        }
        if (b.height + it.h <= bed.short + 1e-9) {
          b.shelves.push({ y: b.height, h: it.h, used: it.w });
          b.slots.push({ index: it.index, x: 0, y: r2(b.height), turned: it.turned });
          b.height += it.h;
          placed = true;
          break;
        }
      }
      if (!placed) {
        beds.push({ shelves: [{ y: 0, h: it.h, used: it.w }], height: it.h, slots: [{ index: it.index, x: 0, y: 0, turned: it.turned }] });
      }
    }
    const out = beds.map((b) => ({
      width: r2(Math.max(...b.shelves.map((s) => s.used))),
      height: r2(b.height),
      slots: b.slots,
    }));
    const area = out.reduce((s, b) => s + b.width * b.height, 0);
    if (!best || out.length < best.out.length || (out.length === best.out.length && area < best.area - 1e-6)) {
      best = { out, area };
    }
  }
  return best.out;
}
