// Preview pane. The puzzle is already SVG path data in millimetres, so the
// preview is the export scaled to fit - there is no second renderer to keep in
// sync, and what you see is literally what gets cut.

import { CORNER_MM } from './geom/poster.js';
import { borderPath } from './geom/puzzle.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_ZOOM = 16;
const CUT_RED = '#e3202a';
const MM_PER_PT = 25.4 / 72;

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const outline = (x, y, w, h) => `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;

/** A line that stays one pixel wide at every zoom. */
const hairline = (d, stroke) => el('path', {
  d,
  fill: 'none',
  stroke,
  'stroke-width': 1,
  'vector-effect': 'non-scaling-stroke',
});

function shadowDefs(size) {
  const defs = el('defs');
  const filter = el('filter', {
    id: 'boardShadow', x: '-20%', y: '-20%', width: '140%', height: '140%',
  });
  filter.append(el('feDropShadow', {
    dx: 0, dy: Math.max(0.6, size * 0.006),
    stdDeviation: Math.max(0.8, size * 0.008),
    'flood-color': '#000', 'flood-opacity': 0.28,
  }));
  defs.append(filter);
  return defs;
}

export class View {
  constructor(root) {
    this.root = root;
    this.svg = el('svg', { class: 'preview', xmlns: SVG_NS });
    this.root.append(this.svg);
    this.zoomOn = false;
    this.base = null;
    this.box = null;
    this.fitKey = null;
    this.bindZoom();
  }

  /**
   * @param puzzle result of buildPuzzle
   * @param opts { boardColor, showBoard }
   */
  render(puzzle, opts = {}) {
    this.zoomOn = false;
    this.fitKey = null;
    this.svg.classList.remove('zoomable');
    const { width, height } = puzzle.params;
    // A margin in board units keeps the stroke and the drop shadow off the edge
    // of the viewport at every aspect ratio.
    const m = Math.max(width, height) * 0.06;
    this.svg.setAttribute('viewBox', `${-m} ${-m} ${width + m * 2} ${height + m * 2}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.replaceChildren();

    this.svg.append(shadowDefs(height));

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

  /**
   * The panel: poster, bleed, cut lines and frame, in true proportion.
   * @param turn 90 when the poster lies turned clockwise on the panel (a portrait
   *             poster in a landscape job, Boss's option A)
   */
  renderPoster({ plan, puzzle, imageUrl, turn = 0, fitKey }) {
    const { panel, art } = plan;
    const m = Math.max(panel.width, panel.height) * 0.04;
    this.showBox({ x: -m, y: -m, w: panel.width + m * 2, h: panel.height + m * 2 }, fitKey);
    this.svg.replaceChildren(shadowDefs(panel.height));

    // White acrylic (Boss, 11 Nov 2026; it was clear before), its outer corners
    // rounded like the backing it stacks on.
    this.svg.append(el('rect', {
      x: 0, y: 0, width: panel.width, height: panel.height, rx: CORNER_MM, ry: CORNER_MM,
      fill: '#fbfbf8', filter: 'url(#boardShadow)',
    }));

    if (imageUrl && turn === 90) {
      // Drawn upright at the turned size, then turned onto the artwork's box.
      this.svg.append(el('image', {
        href: imageUrl,
        x: 0, y: 0, width: art.height, height: art.width,
        preserveAspectRatio: 'none',
        transform: `translate(${art.x + art.width} ${art.y}) rotate(90)`,
      }));
    } else if (imageUrl) {
      this.svg.append(el('image', {
        href: imageUrl,
        x: art.x, y: art.y, width: art.width, height: art.height,
        preserveAspectRatio: 'none',
      }));
    } else {
      this.svg.append(el('rect', {
        x: art.x, y: art.y, width: art.width, height: art.height, fill: '#f4f6f8',
      }));
    }

    const rect = (x, y, w, h) => `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    if (puzzle) {
      // Everything between the puzzle's edge and the artwork's edge lands on the
      // frame. Fading it shows at a glance what will not be on the finished puzzle.
      const fx = (panel.width - plan.width) / 2;
      const fy = (panel.height - plan.height) / 2;
      this.svg.append(el('path', {
        d: `${rect(art.x, art.y, art.width, art.height)} ${rect(fx, fy, plan.width, plan.height)}`,
        fill: '#ffffff', 'fill-opacity': 0.6, 'fill-rule': 'evenodd',
      }));
      this.svg.append(hairline(rect(art.x, art.y, art.width, art.height), '#1259d8'));
      const lines = el('g', { transform: `translate(${fx} ${fy})` });
      lines.append(hairline(`${puzzle.h}${puzzle.v}${puzzle.border}`, CUT_RED));
      this.svg.append(lines);
    } else {
      // A UV File panel (Boss, 11 Nov 2026) is not cut at the poster's edge, so its
      // bleed is printed and stays in sight. Nothing is faded: the picture is drawn as
      // it will print, the blue line is where the print ends, and between it and the
      // red cut is bare acrylic.
      this.svg.append(hairline(rect(art.x, art.y, art.width, art.height), '#1259d8'));
    }
    this.svg.append(hairline(`${borderPath(panel.width, panel.height, CORNER_MM)} Z`, CUT_RED));
  }

  /** The job sheet, drawn from the same description the PDF is written from. */
  renderSheet(sheet, fitKey) {
    const { width, height } = sheet;
    const m = Math.max(width, height) * 0.02;
    this.showBox({ x: -m, y: -m, w: width + m * 2, h: height + m * 2 }, fitKey);
    this.svg.replaceChildren(shadowDefs(height));
    this.svg.append(el('rect', {
      x: 0, y: 0, width, height, fill: '#ffffff', filter: 'url(#boardShadow)',
    }));
    for (const p of sheet.paths) this.svg.append(hairline(p.d, CUT_RED));
    for (const t of sheet.texts) {
      const node = el('text', {
        x: t.x,
        y: t.y,
        'font-size': t.size * MM_PER_PT,
        'font-family': 'Arial, Helvetica, sans-serif',
        'text-anchor': t.anchor,
        fill: '#231f20',
      });
      node.textContent = t.text;
      this.svg.append(node);
    }
  }

  /**
   * The print file, one picture per layer as read back from the PDF (printCheck.js),
   * stacked as in the file and each shown or hidden by its eye. Where no ink goes is a
   * checkerboard, so that nothing on it can be mistaken for white.
   *
   * @param size   { width, height } of the file's page, mm
   * @param layers { [name]: { url } }, or null while the file is being read
   * @param order  layer names top to bottom
   * @param on     { [name]: boolean }
   * @param cuts   optional path data in page mm, drawn on top as cut lines
   */
  renderPrint({ size: panel, layers, order, on, cuts = [], fitKey }) {
    const m = Math.max(panel.width, panel.height) * 0.04;
    this.showBox({ x: -m, y: -m, w: panel.width + m * 2, h: panel.height + m * 2 }, fitKey);

    const defs = shadowDefs(panel.height);
    const cell = Math.max(panel.width, panel.height) / 90;
    const checker = el('pattern', {
      id: 'clearChecker', width: cell * 2, height: cell * 2, patternUnits: 'userSpaceOnUse',
    });
    checker.append(
      el('rect', { width: cell * 2, height: cell * 2, fill: '#ffffff' }),
      el('rect', { width: cell, height: cell, fill: '#d9dde2' }),
      el('rect', { x: cell, y: cell, width: cell, height: cell, fill: '#d9dde2' }),
    );
    defs.append(checker);
    this.svg.replaceChildren(defs);
    this.svg.append(el('rect', {
      x: 0, y: 0, width: panel.width, height: panel.height,
      fill: 'url(#clearChecker)', filter: 'url(#boardShadow)',
    }));

    // Bottom up, the way the file paints them. The Spot pictures are see-through, so
    // with both on the two colours mix, and it shows at once that both are there.
    for (const name of [...order].reverse()) {
      const layer = layers?.[name];
      if (layer && on[name]) {
        this.svg.append(el('image', {
          href: layer.url,
          x: 0, y: 0, width: panel.width, height: panel.height,
          preserveAspectRatio: 'none',
          opacity: name === order[0] ? 1 : 0.6,
          'data-layer': name,
        }));
      }
    }
    for (const d of cuts) this.svg.append(hairline(d, CUT_RED));
    this.svg.append(hairline(outline(0, 0, panel.width, panel.height), cuts.length ? CUT_RED : '#8a94a3'));
  }

  // ---- zoom --------------------------------------------------------------
  // Only for the poster views, where the point is to look closely at text near
  // a cut line. The ordinary puzzle preview always fits the board.

  showBox(base, fitKey) {
    this.zoomOn = true;
    this.svg.classList.add('zoomable');
    this.base = base;
    if (fitKey !== this.fitKey || !this.box) {
      this.fitKey = fitKey;
      this.box = { ...base };
    }
    this.applyBox();
  }

  applyBox() {
    const b = this.box;
    this.svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  zoomAt(x, y, factor) {
    const { base, box } = this;
    const w = clamp(box.w / factor, base.w / MAX_ZOOM, base.w);
    const k = w / box.w;
    box.x = x - (x - box.x) * k;
    box.y = y - (y - box.y) * k;
    box.w = w;
    box.h *= k;
    this.keepInside();
    this.applyBox();
  }

  keepInside() {
    const { base, box } = this;
    box.x = clamp(box.x, base.x, base.x + base.w - box.w);
    box.y = clamp(box.y, base.y, base.y + base.h - box.h);
  }

  /** For the + and - buttons: zoom around the middle of what is showing. */
  zoomBy(factor) {
    if (!this.zoomOn) return;
    this.zoomAt(this.box.x + this.box.w / 2, this.box.y + this.box.h / 2, factor);
  }

  zoomFit() {
    if (!this.zoomOn) return;
    this.box = { ...this.base };
    this.applyBox();
  }

  bindZoom() {
    const { svg } = this;
    const toBox = (e) => {
      const m = svg.getScreenCTM();
      return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : null;
    };
    svg.addEventListener('wheel', (e) => {
      if (!this.zoomOn) return;
      e.preventDefault();
      const p = toBox(e);
      if (p) this.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    }, { passive: false });

    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (!this.zoomOn) return;
      const m = svg.getScreenCTM();
      if (!m) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, bx: this.box.x, by: this.box.y, k: m.a };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.box.x = drag.bx - (e.clientX - drag.x) / drag.k;
      this.box.y = drag.by - (e.clientY - drag.y) / drag.k;
      this.keepInside();
      this.applyBox();
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('dblclick', () => this.zoomFit());
  }
}
