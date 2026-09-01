// The piece editor. Draws the live tag outline - the shape, the strap slot, the
// border and the engraved lettering - plus whatever artwork has been placed on
// it, and lets you drag / scale / rotate that artwork.
//
// Piece space is millimetres, y-up; the SVG is y-down, so every point goes
// through toView(). Lifted from the Box Maker's 2D face editor, which does the
// same job for a box wall: the drag, scale and rotate maths is unchanged, and
// what was added is the tag's own geometry - the border rings and the
// single-line lettering, which are drawn but are not selectable, because they
// are settings rather than objects.

import { objectRings } from './geom/decor.js';
import { bbox } from './geom/path.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  }
  return n;
};

const HANDLES = [
  ['nw', 0, 1], ['n', 0.5, 1], ['ne', 1, 1],
  ['w', 0, 0.5], ['e', 1, 0.5],
  ['sw', 0, 0], ['s', 0.5, 0], ['se', 1, 0],
];

const COLORS = {
  cut: '#e5484d',
  'engrave-line': '#3b82f6',
  'engrave-fill': '#1f2328',
};

export class View2D {
  constructor(container, handlers = {}) {
    this.container = container;
    this.on = handlers;
    this.svg = el('svg', { class: 'editor-svg' });
    container.appendChild(this.svg);
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.fitPending = true;
    this.drag = null;

    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    this.svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.ro = new ResizeObserver(() => this.applyViewBox());
    this.ro.observe(container);
  }

  dispose() {
    this.ro.disconnect();
    this.svg.remove();
  }

  toView([x, y]) { return [x, this.panel.size.h - y]; }
  fromView([x, y]) { return [x, this.panel.size.h - y]; }

  /** Client pixels -> panel millimetres. */
  clientToPanel(e) {
    const r = this.svg.getBoundingClientRect();
    const vb = this.viewBox;
    const x = vb.x + ((e.clientX - r.left) / r.width) * vb.w;
    const y = vb.y + ((e.clientY - r.top) / r.height) * vb.h;
    return this.fromView([x, y]);
  }

  applyViewBox() {
    if (!this.panel) return;
    const cw = this.container.clientWidth || 1;
    const ch = this.container.clientHeight || 1;
    const pad = 40;
    // The first render happens before the flex layout has given the stage a
    // width, so cw is 0 or a few pixels. Fitting to that produces a NEGATIVE
    // zoom - (cw - 80) is negative - and the browser rejects the viewBox
    // outright, leaving the tag drawn at whatever scale was there before, in
    // the corner. Wait for a real box; the ResizeObserver calls back the moment
    // there is one, and fitPending is still set, so the fit happens then.
    if (cw < pad * 2 + 8 || ch < pad * 2 + 8) {
      if (this.fitPending) return;
    }
    if (this.fitPending) {
      const sx = (cw - pad * 2) / this.panel.size.w;
      const sy = (ch - pad * 2) / this.panel.size.h;
      this.zoom = Math.max(0.05, Math.min(sx, sy));
      this.pan = { x: this.panel.size.w / 2, y: this.panel.size.h / 2 };
      this.fitPending = false;
    }
    const w = cw / this.zoom;
    const h = ch / this.zoom;
    this.viewBox = { x: this.pan.x - w / 2, y: this.pan.y - h / 2, w, h };
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${w} ${h}`);
    this.svg.setAttribute('width', cw);
    this.svg.setAttribute('height', ch);
    // Everything sized in screen pixels is drawn at 1/zoom user units, so it all
    // has to be redrawn whenever the zoom changes - not just the grid. The
    // dimension labels used to be left behind, and because the first render
    // happens before the stage has a width, they were left behind at zoom 1:
    // the "90 mm" came out five times its intended size and stayed that way.
    if (this.gridLayer) this.drawGrid();
    if (this.panel && this.objects) {
      this.drawDims();
      if (this.overlay) this.drawSelection();
    }
  }

  fit() { this.fitPending = true; this.applyViewBox(); }

  onWheel(e) {
    e.preventDefault();
    const before = this.clientToPanel(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.zoom = Math.min(40, Math.max(0.4, this.zoom * factor));
    this.applyViewBox();
    const after = this.clientToPanel(e);
    this.pan.x += this.toView(before)[0] - this.toView(after)[0];
    this.pan.y += this.toView(before)[1] - this.toView(after)[1];
    this.applyViewBox();
  }

  render(panel, objects, selection, opts = {}) {
    // Size, not identity. Flipping between the front and the back is the most
    // common thing anybody does in this tool, and the two pieces are the same
    // outline - refitting the view every time would throw away the zoom the
    // user had just set, for no change on screen.
    const samePanel = this.panel
      && this.panel.size.w === panel.size.w && this.panel.size.h === panel.size.h;
    this.panel = panel;
    this.objects = objects;
    this.selection = selection;
    this.opts = opts;
    if (!samePanel) this.fitPending = true;

    this.svg.replaceChildren();
    // Everything below is about to be rebuilt, so drop the handles on the old
    // nodes first - applyViewBox redraws whatever it is holding, and a detached
    // overlay is work done into a node nobody will ever see.
    this.overlay = null;
    this.gridLayer = el('g', { class: 'grid-layer' });
    this.svg.appendChild(this.gridLayer);
    this.applyViewBox();
    this.drawGrid();

    const shape = el('g', { class: 'panel-layer' });
    const d = [panel.outline, ...panel.holes]
      .map((r) => this.ringPath(r)).join(' ');
    shape.appendChild(el('path', {
      d, fill: 'var(--panel-fill)', 'fill-rule': 'evenodd',
      stroke: COLORS.cut, 'stroke-width': 0.25, 'vector-effect': 'non-scaling-stroke',
    }));
    this.svg.appendChild(shape);

    // The tag's own engraving: the border rings are closed, the lettering is
    // not. Drawn before the artwork so a placed object sits on top of it, and
    // outside the art layer so hit testing never picks it up.
    const built = el('g', { class: 'built-layer' });
    for (const ring of panel.borderRings || []) {
      built.appendChild(el('path', {
        d: this.ringPath(ring), fill: 'none', stroke: COLORS['engrave-line'],
        'stroke-width': 0.3, 'vector-effect': 'non-scaling-stroke', opacity: 0.9,
      }));
    }
    for (const flat of panel.strokes || []) {
      const d = this.flatPath(flat);
      if (!d) continue;
      built.appendChild(el('path', {
        d, fill: 'none', stroke: COLORS['engrave-line'], 'stroke-width': 0.8,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke', opacity: 0.9,
      }));
    }
    this.svg.appendChild(built);

    const art = el('g', { class: 'art-layer' });
    for (const o of objects) {
      const node = this.objectNode(o);
      if (node) art.appendChild(node);
    }
    this.svg.appendChild(art);

    this.overlay = el('g', { class: 'overlay-layer' });
    this.svg.appendChild(this.overlay);
    this.drawSelection();
    this.drawDims();
  }

  ringPath(ring) {
    if (!ring || ring.length < 2) return '';
    const p = ring.map((pt) => this.toView(pt));
    return `M${p[0][0].toFixed(3)} ${p[0][1].toFixed(3)}` +
      p.slice(1).map(([x, y]) => `L${x.toFixed(3)} ${y.toFixed(3)}`).join('') + 'Z';
  }

  /** A flat [x,y,x,y,...] polyline, in view coordinates. Never closed. */
  flatPath(flat) {
    if (!flat || flat.length < 4) return '';
    const [x0, y0] = this.toView([flat[0], flat[1]]);
    let d = `M${x0.toFixed(3)} ${y0.toFixed(3)}`;
    for (let i = 2; i < flat.length; i += 2) {
      const [x, y] = this.toView([flat[i], flat[i + 1]]);
      d += `L${x.toFixed(3)} ${y.toFixed(3)}`;
    }
    return d;
  }

  objectNode(o) {
    if (o.type === 'image' && o.src) {
      const g = el('g', { 'data-id': o.id, class: 'obj' });
      const [vx, vy] = this.toView([o.x, o.y + o.h]);
      const im = el('image', {
        x: vx, y: vy, width: o.w, height: o.h,
        href: o.src, preserveAspectRatio: 'none', opacity: 0.92,
      });
      if (o.rot) im.setAttribute('transform', `rotate(${o.rot} ${vx + o.w / 2} ${vy + o.h / 2})`);
      g.appendChild(im);
      return g;
    }
    const rings = objectRings(o);
    if (!rings.length) return null;
    const d = rings.map((r) => this.ringPath(r)).join(' ');
    const g = el('g', { 'data-id': o.id, class: 'obj' });
    const isFill = o.process === 'engrave-fill';
    g.appendChild(el('path', {
      d,
      fill: isFill ? COLORS['engrave-fill'] : 'none',
      'fill-rule': 'evenodd',
      stroke: isFill ? 'none' : COLORS[o.process],
      'stroke-width': isFill ? 0 : 0.3,
      'vector-effect': isFill ? null : 'non-scaling-stroke',
      opacity: 0.92,
    }));
    return g;
  }

  /** Corners of an object's box in panel space, honouring rotation. */
  corners(o) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const a = (o.rot || 0) * Math.PI / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([fx, fy]) => {
      const dx = (fx - 0.5) * o.w;
      const dy = (fy - 0.5) * o.h;
      return [cx + dx * c - dy * s, cy + dx * s + dy * c];
    });
  }

  drawSelection() {
    this.overlay.replaceChildren();
    const o = this.objects.find((x) => x.id === this.selection);
    if (!o) return;
    const pts = this.corners(o).map((p) => this.toView(p));
    this.overlay.appendChild(el('polygon', {
      points: pts.map((p) => p.join(',')).join(' '),
      fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.2,
      'vector-effect': 'non-scaling-stroke',
    }));
    const px = 1 / this.zoom;
    for (const [name, fx, fy] of HANDLES) {
      const [hx, hy] = this.handlePoint(o, fx, fy);
      const [vx, vy] = this.toView([hx, hy]);
      this.overlay.appendChild(el('rect', {
        x: vx - 4 * px, y: vy - 4 * px, width: 8 * px, height: 8 * px,
        fill: '#fff', stroke: 'var(--accent)', 'stroke-width': 1.2,
        'vector-effect': 'non-scaling-stroke',
        'data-handle': name, class: 'handle',
      }));
    }
    const [rx, ry] = this.handlePoint(o, 0.5, 1);
    const [vrx, vry] = this.toView([rx, ry]);
    const dir = ((o.rot || 0) - 90) * Math.PI / 180;
    const ox = Math.cos(dir) * 0;
    this.overlay.appendChild(el('line', {
      x1: vrx, y1: vry, x2: vrx + ox, y2: vry - 22 * px,
      stroke: 'var(--accent)', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke',
    }));
    this.overlay.appendChild(el('circle', {
      cx: vrx, cy: vry - 22 * px, r: 5 * px,
      fill: '#fff', stroke: 'var(--accent)', 'stroke-width': 1.2,
      'vector-effect': 'non-scaling-stroke',
      'data-handle': 'rotate', class: 'handle',
    }));
  }

  handlePoint(o, fx, fy) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const a = (o.rot || 0) * Math.PI / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dx = (fx - 0.5) * o.w;
    const dy = (fy - 0.5) * o.h;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  }

  drawGrid() {
    if (!this.gridLayer || !this.viewBox) return;
    this.gridLayer.replaceChildren();
    const step = this.zoom > 8 ? 1 : this.zoom > 3 ? 5 : this.zoom > 1 ? 10 : 25;
    const vb = this.viewBox;
    const x0 = Math.floor(vb.x / step) * step;
    const y0 = Math.floor(vb.y / step) * step;
    const lines = [];
    for (let x = x0; x <= vb.x + vb.w; x += step) {
      lines.push(el('line', {
        x1: x, y1: vb.y, x2: x, y2: vb.y + vb.h,
        stroke: 'var(--grid)', 'stroke-width': 0.5, 'vector-effect': 'non-scaling-stroke',
      }));
    }
    for (let y = y0; y <= vb.y + vb.h; y += step) {
      lines.push(el('line', {
        x1: vb.x, y1: y, x2: vb.x + vb.w, y2: y,
        stroke: 'var(--grid)', 'stroke-width': 0.5, 'vector-effect': 'non-scaling-stroke',
      }));
    }
    this.gridLayer.append(...lines);
  }

  drawDims() {
    const { w, h } = this.panel.size;
    const px = 1 / this.zoom;
    // One layer, reused. Appending a fresh group on every zoom step would stack
    // a hundred of them inside a single pinch.
    if (!this.dimLayer) {
      this.dimLayer = el('g', { class: 'dim-layer' });
    }
    this.dimLayer.replaceChildren();
    const g = this.dimLayer;
    g.setAttribute('fill', 'var(--dim)');
    g.setAttribute('stroke', 'var(--dim)');
    const off = 10 * px;
    const top = this.toView([0, h])[1];
    g.appendChild(el('line', {
      x1: 0, y1: top - off, x2: w, y2: top - off,
      'stroke-width': 1, 'vector-effect': 'non-scaling-stroke',
    }));
    const label = (x, y, text, rot) => {
      const t = el('text', {
        x, y, 'font-size': 11 * px, 'text-anchor': 'middle', stroke: 'none',
        transform: rot ? `rotate(${rot} ${x} ${y})` : null,
      });
      t.textContent = text;
      return t;
    };
    g.appendChild(label(w / 2, top - off - 4 * px, `${round(w)} mm`));
    g.appendChild(el('line', {
      x1: -off, y1: top, x2: -off, y2: top + h,
      'stroke-width': 1, 'vector-effect': 'non-scaling-stroke',
    }));
    g.appendChild(label(-off - 5 * px, top + h / 2, `${round(h)} mm`, -90));
    this.svg.appendChild(g);
  }

  hitTest(pt) {
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (pointInPoly(pt, this.corners(o))) return o;
    }
    return null;
  }

  onDown(e) {
    if (e.button === 1 || e.shiftKey) {
      this.drag = { mode: 'pan', start: [e.clientX, e.clientY], pan: { ...this.pan } };
      e.preventDefault();
      return;
    }
    const handle = e.target.getAttribute && e.target.getAttribute('data-handle');
    const pt = this.clientToPanel(e);
    const sel = this.objects.find((o) => o.id === this.selection);
    if (handle && sel) {
      this.drag = {
        mode: handle === 'rotate' ? 'rotate' : 'scale',
        handle,
        obj: sel,
        start: pt,
        orig: { ...sel },
      };
      this.on.gestureStart?.();
      return;
    }
    const hit = this.hitTest(pt);
    if (hit) {
      if (hit.id !== this.selection) this.on.select?.(hit.id);
      this.drag = { mode: 'move', obj: hit, start: pt, orig: { ...hit } };
      this.on.gestureStart?.();
    } else {
      this.on.select?.(null);
      this.drag = { mode: 'pan', start: [e.clientX, e.clientY], pan: { ...this.pan } };
    }
  }

  onMove(e) {
    if (!this.drag) return;
    if (this.drag.mode === 'pan') {
      const r = this.svg.getBoundingClientRect();
      const sx = this.viewBox.w / r.width;
      const sy = this.viewBox.h / r.height;
      this.pan.x = this.drag.pan.x - (e.clientX - this.drag.start[0]) * sx;
      this.pan.y = this.drag.pan.y - (e.clientY - this.drag.start[1]) * sy;
      this.applyViewBox();
      return;
    }
    const pt = this.clientToPanel(e);
    const { obj, orig, start } = this.drag;
    if (this.drag.mode === 'move') {
      let nx = orig.x + (pt[0] - start[0]);
      let ny = orig.y + (pt[1] - start[1]);
      if (!e.altKey) {
        const snap = 0.5;
        nx = Math.round(nx / snap) * snap;
        ny = Math.round(ny / snap) * snap;
      }
      obj.x = nx;
      obj.y = ny;
    } else if (this.drag.mode === 'rotate') {
      const cx = orig.x + orig.w / 2;
      const cy = orig.y + orig.h / 2;
      let deg = Math.atan2(pt[1] - cy, pt[0] - cx) * 180 / Math.PI - 90;
      if (!e.altKey) deg = Math.round(deg / 15) * 15;
      obj.rot = ((deg % 360) + 360) % 360;
    } else {
      this.applyScale(obj, orig, start, pt, e);
    }
    this.on.change?.(obj);
  }

  applyScale(obj, orig, start, pt, e) {
    const a = -(orig.rot || 0) * Math.PI / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const cx = orig.x + orig.w / 2;
    const cy = orig.y + orig.h / 2;
    const local = (p) => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      return [dx * c - dy * s, dx * s + dy * c];
    };
    const l0 = local(start);
    const l1 = local(pt);
    const dx = l1[0] - l0[0];
    const dy = l1[1] - l0[1];
    const h = this.drag.handle;
    let w = orig.w;
    let ht = orig.h;
    let ox = 0;
    let oy = 0;
    if (h.includes('e')) { w = orig.w + dx; ox = dx / 2; }
    if (h.includes('w')) { w = orig.w - dx; ox = dx / 2; }
    if (h.includes('n')) { ht = orig.h + dy; oy = dy / 2; }
    if (h.includes('s')) { ht = orig.h - dy; oy = dy / 2; }
    const keepRatio = e.shiftKey || obj.type === 'text';
    if (keepRatio && orig.w > 0 && orig.h > 0 && h.length === 2) {
      const k = Math.max(w / orig.w, ht / orig.h);
      w = orig.w * k;
      ht = orig.h * k;
    }
    w = Math.max(1, w);
    ht = Math.max(1, ht);
    if (obj.type === 'text' && orig.h > 0) {
      obj.size = Math.max(1, (orig.size || 10) * (ht / orig.h));
    }
    const rot = (orig.rot || 0) * Math.PI / 180;
    const rc = Math.cos(rot);
    const rs = Math.sin(rot);
    const wx = ox * rc - oy * rs;
    const wy = ox * rs + oy * rc;
    obj.w = w;
    obj.h = ht;
    obj.x = cx + wx - w / 2;
    obj.y = cy + wy - ht / 2;
  }

  onUp() {
    if (this.drag && this.drag.mode !== 'pan') this.on.gestureEnd?.();
    this.drag = null;
  }
}

function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const round = (v) => (Math.round(v * 10) / 10).toString();

export { bbox };
