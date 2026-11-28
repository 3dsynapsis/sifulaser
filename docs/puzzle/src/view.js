// Preview pane. The puzzle is already SVG path data in millimetres, so the
// preview is the export scaled to fit - there is no second renderer to keep in
// sync, and what you see is literally what gets cut.

import { CORNER_MM } from './geom/poster.js';
import { borderPath } from './geom/puzzle.js';
import { circlePath, unionPath } from './geom/keychain.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_ZOOM = 16;
const CUT_RED = '#e3202a';
const MARK_BLUE = '#2336d8';   // a laser marking, as FRONT on a keychain sheet
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
  /**
   * @param clear the panel is clear acrylic (UV File tab), not white
   * @param crop  { x, y, w, h, pageW, pageH } mm: the part of the page that is the
   *              poster (UV File tab, Boss, 25 Nov 2026); null for the whole page
   */
  renderPoster({ plan, puzzle, imageUrl, turn = 0, fitKey, clear = false, crop = null }) {
    const { panel, art } = plan;
    const m = Math.max(panel.width, panel.height) * 0.04;
    this.showBox({ x: -m, y: -m, w: panel.width + m * 2, h: panel.height + m * 2 }, fitKey);
    this.svg.replaceChildren(shadowDefs(panel.height));

    // White acrylic (Boss, 11 Nov 2026; it was clear before), its outer corners
    // rounded like the backing it stacks on. A UV File panel may be clear acrylic:
    // tinted, so the border shows what it is.
    this.svg.append(el('rect', {
      x: 0, y: 0, width: panel.width, height: panel.height, rx: CORNER_MM, ry: CORNER_MM,
      fill: clear ? '#cfe3e8' : '#fbfbf8', filter: 'url(#boardShadow)',
    }));

    // The page, or its crop, stretched over a w x h box. A crop is a nested svg whose
    // viewBox is the crop: the rest of the page is clipped away, as in the print file.
    const pageImage = (w, hh) => {
      if (!crop) {
        return el('image', {
          href: imageUrl, x: 0, y: 0, width: w, height: hh, preserveAspectRatio: 'none',
        });
      }
      const inner = el('svg', {
        x: 0, y: 0, width: w, height: hh,
        viewBox: `${crop.x} ${crop.y} ${crop.w} ${crop.h}`, preserveAspectRatio: 'none',
      });
      // The bleed may reach past the page's edge, where the print file is white.
      inner.append(el('rect', {
        x: crop.x, y: crop.y, width: crop.w, height: crop.h, fill: '#ffffff',
      }));
      inner.append(el('image', {
        href: imageUrl, x: 0, y: 0, width: crop.pageW, height: crop.pageH, preserveAspectRatio: 'none',
      }));
      return inner;
    };
    if (imageUrl && turn === 90) {
      // Drawn upright at the turned size, then turned onto the artwork's box.
      const g = el('g', { transform: `translate(${art.x + art.width} ${art.y}) rotate(90)` });
      g.append(pageImage(art.height, art.width));
      this.svg.append(g);
    } else if (imageUrl) {
      const g = el('g', { transform: `translate(${art.x} ${art.y})` });
      g.append(pageImage(art.width, art.height));
      this.svg.append(g);
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
      // A UV File panel (Boss, 12 Nov 2026): a puzzle with no pieces. The poster is cut
      // out at its own edge, the inner red line, its corners as the cut file has them;
      // the blue line is the bleed's edge, where the print stops, on the frame. The
      // outer red line is the frame's.
      const fx = (panel.width - plan.width) / 2;
      const fy = (panel.height - plan.height) / 2;
      this.svg.append(hairline(rect(art.x, art.y, art.width, art.height), '#1259d8'));
      const cut = el('g', { transform: `translate(${fx} ${fy})` });
      cut.append(hairline(`${borderPath(plan.width, plan.height, plan.cutCorner ?? 0)} Z`, CUT_RED));
      this.svg.append(cut);
    }
    this.svg.append(hairline(`${borderPath(panel.width, panel.height, CORNER_MM)} Z`, CUT_RED));
  }

  /**
   * The whole page with its crop on it, to move by hand (UV File tab, Boss, 25 Nov 2026):
   * the page as it shows, dimmed outside the crop, a blue box with a handle at each
   * corner and side. Dragging a handle moves that edge; dragging inside moves the box.
   * The box follows the pointer here; `onDone(rect)` gets it, mm, when the drag ends.
   */
  renderCrop({ imageUrl, pageW, pageH, crop, min = 10, fitKey, onDone }) {
    const m = Math.max(pageW, pageH) * 0.05;
    this.showBox({ x: -m, y: -m, w: pageW + m * 2, h: pageH + m * 2 }, fitKey);
    this.svg.replaceChildren(shadowDefs(pageH));
    this.svg.append(el('rect', {
      x: 0, y: 0, width: pageW, height: pageH, fill: '#ffffff', filter: 'url(#boardShadow)',
    }));
    if (imageUrl) {
      this.svg.append(el('image', {
        href: imageUrl, x: 0, y: 0, width: pageW, height: pageH, preserveAspectRatio: 'none',
      }));
    }
    let rect = { ...crop };
    const dim = el('path', { fill: '#0b1220', 'fill-opacity': 0.45, 'fill-rule': 'evenodd' });
    const body = el('rect', { class: 'crop-move', fill: 'transparent' });
    const edge = el('rect', {
      fill: 'none', stroke: '#1259d8', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke',
    });
    this.svg.append(dim, body, edge);
    const R = Math.max(pageW, pageH) * 0.014;
    const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const handles = HANDLES.map((k) => {
      const c = el('circle', {
        class: `crop-handle crop-${k}`, r: R, fill: '#ffffff', stroke: '#1259d8',
        'stroke-width': 2, 'vector-effect': 'non-scaling-stroke',
      });
      this.svg.append(c);
      return [k, c];
    });
    const paint = () => {
      const { x, y, w, h } = rect;
      dim.setAttribute('d', `${outline(0, 0, pageW, pageH)} ${outline(x, y, w, h)}`);
      for (const n of [body, edge]) {
        n.setAttribute('x', x); n.setAttribute('y', y); n.setAttribute('width', w); n.setAttribute('height', h);
      }
      for (const [k, c] of handles) {
        c.setAttribute('cx', k.includes('w') ? x : k.includes('e') ? x + w : x + w / 2);
        c.setAttribute('cy', k.includes('n') ? y : k.includes('s') ? y + h : y + h / 2);
      }
    };
    paint();

    const toPage = (e) => {
      const mtx = this.svg.getScreenCTM();
      return mtx ? new DOMPoint(e.clientX, e.clientY).matrixTransform(mtx.inverse()) : null;
    };
    /** The box after a drag of (dx, dy) from `r0` by handle `k`, kept on the page. */
    const dragged = (r0, k, dx, dy) => {
      if (k === 'move') {
        return {
          ...r0,
          x: clamp(r0.x + dx, 0, pageW - r0.w),
          y: clamp(r0.y + dy, 0, pageH - r0.h),
        };
      }
      let x0 = r0.x; let y0 = r0.y; let x1 = r0.x + r0.w; let y1 = r0.y + r0.h;
      if (k.includes('w')) x0 = clamp(x0 + dx, 0, x1 - min);
      if (k.includes('e')) x1 = clamp(x1 + dx, x0 + min, pageW);
      if (k.includes('n')) y0 = clamp(y0 + dy, 0, y1 - min);
      if (k.includes('s')) y1 = clamp(y1 + dy, y0 + min, pageH);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const grab = (node, k) => {
      node.addEventListener('pointerdown', (e) => {
        // Not the pan of the zoom: the box moves, the page stays put.
        e.stopPropagation();
        e.preventDefault();
        const p0 = toPage(e);
        if (!p0) return;
        const r0 = { ...rect };
        node.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const p = toPage(ev);
          if (!p) return;
          rect = dragged(r0, k, p.x - p0.x, p.y - p0.y);
          paint();
        };
        const end = () => {
          node.removeEventListener('pointermove', move);
          node.removeEventListener('pointerup', end);
          node.removeEventListener('pointercancel', end);
          if (onDone && (rect.x !== r0.x || rect.y !== r0.y || rect.w !== r0.w || rect.h !== r0.h)) onDone({ ...rect });
        };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', end);
        node.addEventListener('pointercancel', end);
      });
    };
    grab(body, 'move');
    for (const [k, c] of handles) grab(c, k);
  }

  /**
   * One keychain, close up (the Keychain UV tab, Boss, 17 Nov 2026): its picture with the
   * bleed, the blue line where the print stops, the red cut, and the hole, which can be
   * dragged. Millimetres from the keychain's centre.
   *
   * A hook (`hookR`, Boss, 17 Nov 2026) is a small disc round the hole standing out over
   * the edge: the cut and the bleed go round it, and dragging it turns it round the edge.
   *
   * @param o { sizeMm, bleedMm, holeR, hookR, hole: { dx, dy }, imageUrl, clear, fitKey,
   *          onHoleMove(x, y) -> { dx, dy } where the hole may go, onHoleDone() }
   */
  renderKeychain(o) {
    const R = o.sizeMm / 2;
    const RB = R + o.bleedMm;
    const reach = RB + (o.hookR || 0);
    const outline = (r, hole, extra) => (o.hookR
      ? unionPath({ cx: 0, cy: 0, r }, { cx: hole.dx, cy: hole.dy, r: o.hookR + extra })
      : circlePath(0, 0, r));
    const m = reach * 0.2;
    this.showBox({ x: -reach - m, y: -reach - m, w: 2 * (reach + m), h: 2 * (reach + m) }, o.fitKey);
    const defs = shadowDefs(2 * reach);
    const clip = el('clipPath', { id: 'keychainBleed' });
    const clipShape = el('path', { d: outline(RB, o.hole, o.bleedMm) });
    clip.append(clipShape);
    defs.append(clip);
    this.svg.replaceChildren(defs);

    // The sheet it is cut from, white or clear.
    const s = reach + m * 0.55;
    this.svg.append(el('rect', {
      x: -s, y: -s, width: 2 * s, height: 2 * s, rx: 1.5, ry: 1.5,
      fill: o.clear ? '#cfe3e8' : '#fbfbf8', filter: 'url(#boardShadow)',
    }));
    if (o.imageUrl) {
      const g = el('g', { 'clip-path': 'url(#keychainBleed)' });
      g.append(el('image', {
        href: o.imageUrl, x: -reach, y: -reach, width: 2 * reach, height: 2 * reach, preserveAspectRatio: 'none',
      }));
      this.svg.append(g);
    } else {
      this.svg.append(el('path', { d: outline(RB, o.hole, o.bleedMm), fill: '#eef1f4' }));
    }
    const bleedLine = hairline(outline(RB, o.hole, o.bleedMm), '#1259d8');
    const cutLine = hairline(outline(R, o.hole, 0), CUT_RED);
    this.svg.append(bleedLine, cutLine);

    // The hole: cut through, no ink, so it is drawn dark. The grip round it is bigger
    // than the hole, for a finger.
    const hole = el('g', { class: 'keychain-hole' });
    const disc = el('circle', {
      cx: o.hole.dx, cy: o.hole.dy, r: o.holeR, fill: '#3b3f45',
      stroke: CUT_RED, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke',
    });
    const grip = el('circle', {
      cx: o.hole.dx, cy: o.hole.dy, r: Math.max(o.holeR * 2.4, R * 0.1), fill: 'transparent', class: 'hole-grip',
    });
    hole.append(disc, grip);
    this.svg.append(hole);
    if (!o.onHoleMove) return;
    grip.addEventListener('pointerdown', (e) => {
      // Its own drag: the stage must not pan underneath it.
      e.stopPropagation();
      e.preventDefault();
      const ctm = this.svg.getScreenCTM();
      if (!ctm) return;
      const inv = ctm.inverse();
      grip.setPointerCapture(e.pointerId);
      hole.classList.add('dragging');
      const move = (ev) => {
        const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(inv);
        const at = o.onHoleMove(p.x, p.y);
        for (const c of [disc, grip]) {
          c.setAttribute('cx', at.dx);
          c.setAttribute('cy', at.dy);
        }
        if (o.hookR) {
          clipShape.setAttribute('d', outline(RB, at, o.bleedMm));
          bleedLine.setAttribute('d', outline(RB, at, o.bleedMm));
          cutLine.setAttribute('d', outline(R, at, 0));
        }
      };
      const end = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        hole.classList.remove('dragging');
        o.onHoleDone?.();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    });
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
    for (const p of sheet.paths) this.svg.append(hairline(p.d, p.colour === 'blue' ? MARK_BLUE : CUT_RED));
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

  /**
   * The plaque as it will stand (UV Plak tab, Boss, 28 Nov 2026), seen from the front:
   * the plate in its plywood, the print over the part of it that gets ink, the raised
   * letters, the border's four strips with their mitred joints, and the base under it.
   * mm from the plate's top-left.
   *
   * @param o { width, height, printBox: { x, y, width, height } on the plate,
   *          imageUrl, front, border, letters: colours; strips: [{ points }];
   *          raised: [{ id, d, on }]: the letters that may be raised, `on` those that
   *          are; base: { length, height } or null; fitKey; onLetter(id) }
   */
  renderPlak(o) {
    const { width: W, height: H } = o;
    const below = o.base ? o.base.height : 0;
    const reach = Math.max(W, o.base ? o.base.length : 0);
    const m = Math.max(reach, H) * 0.05;
    const left = Math.min(0, (W - reach) / 2);
    this.showBox({ x: left - m, y: -m, w: reach + 2 * m, h: H + below + 2 * m }, o.fitKey);
    const defs = shadowDefs(H);
    const lift = el('filter', {
      id: 'letterLift', x: '-10%', y: '-10%', width: '120%', height: '120%',
    });
    lift.append(el('feDropShadow', {
      dx: Math.max(0.3, H * 0.002), dy: Math.max(0.4, H * 0.003), stdDeviation: Math.max(0.3, H * 0.002),
      'flood-color': '#000', 'flood-opacity': 0.45,
    }));
    const clip = el('clipPath', { id: 'plakPrint' });
    const px0 = Math.max(0, o.printBox.x);
    const py0 = Math.max(0, o.printBox.y);
    const px1 = Math.min(W, o.printBox.x + o.printBox.width);
    const py1 = Math.min(H, o.printBox.y + o.printBox.height);
    clip.append(el('rect', { x: px0, y: py0, width: px1 - px0, height: py1 - py0 }));
    defs.append(lift, clip);
    this.svg.replaceChildren(defs);

    if (o.base) {
      // Behind the plate: the base's top, as a band a little deeper than its edge.
      const bx = (W - o.base.length) / 2;
      this.svg.append(el('rect', {
        x: bx, y: H - o.base.height * 0.6, width: o.base.length, height: o.base.height * 1.6, rx: 1.2, ry: 1.2,
        fill: o.baseColour || '#cfe3ea', 'fill-opacity': 0.75, stroke: '#8fb3bf', 'stroke-width': 1,
        'vector-effect': 'non-scaling-stroke', filter: 'url(#boardShadow)',
      }));
    }
    this.svg.append(el('rect', {
      x: 0, y: 0, width: W, height: H, fill: o.front, filter: 'url(#boardShadow)',
    }));
    if (o.imageUrl) {
      const g = el('g', { 'clip-path': 'url(#plakPrint)' });
      g.append(el('image', {
        href: o.imageUrl, x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none',
      }));
      this.svg.append(g);
    }
    for (const s of o.strips || []) {
      this.svg.append(el('path', {
        d: `${s.points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ')} Z`,
        fill: o.border, stroke: '#6b6b70', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke',
      }));
    }
    if (o.base) {
      // The base's front edge, in front of the plate's foot.
      const bx = (W - o.base.length) / 2;
      this.svg.append(el('rect', {
        x: bx, y: H, width: o.base.length, height: o.base.height, rx: 0.8, ry: 0.8,
        fill: o.baseColour || '#cfe3ea', 'fill-opacity': 0.9, stroke: '#8fb3bf', 'stroke-width': 1,
        'vector-effect': 'non-scaling-stroke',
      }));
    }
    for (const l of o.raised || []) {
      const node = el('path', {
        d: l.d,
        'fill-rule': 'evenodd',
        class: l.on ? 'plak-letter on' : 'plak-letter off',
        'data-letter': l.id,
        ...(l.on
          ? { fill: o.letters, filter: 'url(#letterLift)' }
          : {
            // Printed only: the print shows through faded, ringed in blue to press.
            fill: '#ffffff', 'fill-opacity': 0.6, stroke: '#2336d8', 'stroke-width': 1.2,
            'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke',
          }),
      });
      if (o.onLetter) {
        // Its own press: a tap toggles the letter, a drag still pans the stage.
        node.addEventListener('pointerdown', (e) => {
          const start = { x: e.clientX, y: e.clientY };
          const up = (ev) => {
            window.removeEventListener('pointerup', up);
            if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) o.onLetter(l.id);
          };
          window.addEventListener('pointerup', up);
        });
      }
      this.svg.append(node);
    }
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
