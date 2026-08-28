// Preview pane. The puzzle is already SVG path data in millimetres, so the
// preview is the export scaled to fit - there is no second renderer to keep in
// sync, and what you see is literally what gets cut.

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

export class View {
  constructor(root) {
    this.root = root;
    this.svg = el('svg', { class: 'preview', xmlns: SVG_NS });
    this.root.append(this.svg);
  }

  /**
   * @param puzzle result of buildPuzzle
   * @param opts { boardColor, showBoard }
   */
  render(puzzle, opts = {}) {
    const { width, height } = puzzle.params;
    // A margin in board units keeps the stroke and the drop shadow off the edge
    // of the viewport at every aspect ratio.
    const m = Math.max(width, height) * 0.06;
    this.svg.setAttribute('viewBox', `${-m} ${-m} ${width + m * 2} ${height + m * 2}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.replaceChildren();

    const defs = el('defs');
    const filter = el('filter', {
      id: 'boardShadow', x: '-20%', y: '-20%', width: '140%', height: '140%',
    });
    filter.append(el('feDropShadow', {
      dx: 0, dy: Math.max(0.6, height * 0.006),
      stdDeviation: Math.max(0.8, height * 0.008),
      'flood-color': '#000', 'flood-opacity': 0.28,
    }));
    defs.append(filter);
    this.svg.append(defs);

    if (opts.showBoard !== false) {
      const r = Math.max(0, Math.min(puzzle.params.cornerRadius, width / 2, height / 2));
      this.svg.append(el('rect', {
        x: 0, y: 0, width, height, rx: r, ry: r,
        fill: opts.boardColor || '#efe3c6',
        filter: 'url(#boardShadow)',
      }));
    }

    // Line weight has to read the same whatever the board size, so scale it.
    const sw = Math.max(width, height) / 1400;
    const line = (d, cls) => {
      if (!d || !d.trim()) return;
      this.svg.append(el('path', {
        d: d.trim(), class: cls, fill: 'none',
        'stroke-width': sw, 'stroke-linecap': 'round',
      }));
    };
    line(puzzle.h, 'cut-h');
    line(puzzle.v, 'cut-v');
    line(puzzle.border, 'cut-b');
  }
}
