// Preview pane. Draws exactly what the export writes, scaled to fit, so there
// is no second renderer that can drift away from the file you download.

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

  /** @param result output of getResult(); paths are y-up, page-relative. */
  render(result, opts = {}) {
    const { width, height } = result.size;
    this.svg.replaceChildren();
    if (!(width > 0) || !(height > 0)) {
      this.svg.setAttribute('viewBox', '0 0 10 10');
      return;
    }

    const pad = Math.max(width, height) * 0.05;
    this.svg.setAttribute('viewBox',
      `${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Flip to y-down for the screen, once, around the whole drawing.
    const g = el('g', { transform: `translate(0 ${height}) scale(1 -1)` });

    if (opts.showBox !== false) {
      g.append(el('rect', {
        x: 0, y: 0, width, height, class: 'box',
        'stroke-width': Math.max(width, height) / 900,
      }));
    }

    const d = [];
    for (const st of result.paths) {
      if (st.length < 4) continue;
      const seg = [`M ${st[0].toFixed(3)} ${st[1].toFixed(3)}`];
      for (let k = 2; k < st.length; k += 2) {
        seg.push(`L ${st[k].toFixed(3)} ${st[k + 1].toFixed(3)}`);
      }
      d.push(seg.join(' '));
    }
    if (d.length) {
      g.append(el('path', {
        d: d.join(' '), class: 'ink', fill: 'none',
        'stroke-width': Math.max(0.25, Math.max(width, height) / 260),
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }));
    }
    this.svg.append(g);
  }
}
