// SVG writer. One sheet, real millimetres, one group per laser process.
//
// Cutting order matters here in a way it does not for a box: the interior lines
// have to be cut BEFORE the border, otherwise the board is already free of the
// sheet and every piece shifts as it is released. The layer names say so, and
// they are emitted in that order.

export const LAYERS = {
  'cut-h': { id: 'cut-h', color: '#ff0000', label: 'Cut 1 - horizontal lines' },
  'cut-v': { id: 'cut-v', color: '#0000ff', label: 'Cut 2 - vertical lines' },
  cut: { id: 'cut', color: '#ff0000', label: 'Cut 1 - puzzle lines' },
  border: { id: 'border', color: '#000000', label: 'Cut last - outer border' },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Which layers a given option set produces, in cut order. */
export function layersFor(split) {
  return split
    ? [LAYERS['cut-h'], LAYERS['cut-v'], LAYERS.border]
    : [LAYERS.cut, LAYERS.border];
}

export function puzzleToSvg(puzzle, opts = {}) {
  const o = { strokeWidth: 0.1, split: false, border: true, ...opts };
  const { width, height } = puzzle.params;

  const groups = o.split
    ? [
      { L: LAYERS['cut-h'], d: puzzle.h },
      { L: LAYERS['cut-v'], d: puzzle.v },
    ]
    : [{ L: LAYERS.cut, d: `${puzzle.h}${puzzle.v}` }];

  if (o.border) groups.push({ L: LAYERS.border, d: puzzle.border });

  const parts = [];
  parts.push(
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
    + `width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<title>${esc(o.title || 'Puzzle')}</title>`);
  for (const g of groups) {
    if (!g.d || !g.d.trim()) continue;
    parts.push(
      `<g id="${g.L.id}" data-layer="${esc(g.L.label)}" fill="none" `
      + `stroke="${g.L.color}" stroke-width="${o.strokeWidth}">`);
    parts.push(`<path d="${g.d.trim()}"/>`);
    parts.push('</g>');
  }
  parts.push('</svg>');
  return parts.join('\n');
}

/** Rough path length, for the cut-time estimate in the summary. */
export function pathLength(puzzle) {
  const { width, height, cols, rows } = puzzle.params;
  // Each interior line wanders a little past its straight run; the knobs add
  // roughly 60% on top of the nominal length. Close enough to size a job.
  const straight = (rows - 1) * width + (cols - 1) * height;
  return straight * 1.6 + 2 * (width + height);
}
