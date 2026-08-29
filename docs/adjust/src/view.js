// The preview: the file as it arrived, and the file as it will leave, side by
// side and both live.
//
// The one thing that matters here is that the two panes share a scale. Framing
// each pane to its own artwork would make a 150 mm part and a 100 mm part look
// identical, which is exactly the change the left-hand knob is making. So the
// span is worked out once from both drawings and both viewBoxes get it; the
// panes are the same width on screen, so the same span means the same
// millimetres per pixel.
//
// The result pane also picks out what was touched. "23 features changed" is a
// number you have to trust; an orange tab you can see got deeper is a number
// you can check.

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const n3 = (v) => Math.round(v * 1000) / 1000;

// y is flipped on the way out: the geometry is y-up, SVG is y-down.
const pathOf = (pts, close = true) => {
  if (pts.length < 2) return '';
  let d = `M${n3(pts[0][0])} ${n3(-pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${n3(pts[i][0])} ${n3(-pts[i][1])}`;
  return close ? `${d}Z` : d;
};

class Pane {
  constructor(root, label) {
    this.root = root;
    this.head = document.createElement('div');
    this.head.className = 'pane-head';
    this.title = document.createElement('span');
    this.title.className = 'pane-title';
    this.title.textContent = label;
    this.size = document.createElement('span');
    this.size.className = 'pane-size';
    this.head.append(this.title, this.size);
    this.svg = el('svg', { class: 'preview', xmlns: SVG_NS });
    this.root.append(this.head, this.svg);
  }

  frame(bounds, span) {
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cy = (bounds.y0 + bounds.y1) / 2;
    // -cy - span/2 because the drawing is flipped into SVG's y-down frame.
    this.svg.setAttribute('viewBox',
      `${n3(cx - span / 2)} ${n3(-cy - span / 2)} ${n3(span)} ${n3(span)}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  draw(rings, bounds, span, { marks = [], stroke = 1 } = {}) {
    this.svg.replaceChildren();
    this.frame(bounds, span);
    this.size.textContent = rings.length
      ? `${n3(Math.round(bounds.w * 100) / 100)} x ${n3(Math.round(bounds.h * 100) / 100)} mm`
      : '';

    const box = el('rect', {
      x: n3(bounds.x0), y: n3(-bounds.y1),
      width: n3(bounds.w), height: n3(bounds.h),
      class: 'art-box', 'stroke-width': stroke * 0.7,
    });
    this.svg.append(box);

    const d = rings.map((r) => pathOf(r)).filter(Boolean).join(' ');
    if (d) {
      this.svg.append(el('path', { d, class: 'art', 'stroke-width': stroke }));
    }

    // Changed features go on top, thicker, so they read as an annotation over
    // the drawing rather than as part of it.
    for (const m of marks) {
      const md = pathOf(m.pts, !m.open);
      if (!md) continue;
      const p = el('path', {
        d: md,
        class: m.kind === 'unknown' ? 'art-unknown' : 'art-changed',
        'stroke-width': stroke * 2.4,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        ...(m.kind === 'unknown' ? { 'stroke-dasharray': `${n3(stroke * 5)} ${n3(stroke * 4)}` } : {}),
      });
      const tip = el('title', {});
      tip.textContent = m.why || '';
      p.append(tip);
      this.svg.append(p);
    }
  }

  empty(message) {
    this.svg.replaceChildren();
    this.svg.setAttribute('viewBox', '0 0 10 10');
    this.size.textContent = message || '';
  }
}

export class View {
  constructor(root) {
    this.root = root;
    this.root.classList.add('compare');
    const mk = (cls, label) => {
      const d = document.createElement('div');
      d.className = `pane ${cls}`;
      this.root.append(d);
      return new Pane(d, label);
    };
    this.before = mk('pane-before', 'Original');
    this.after = mk('pane-after', 'Result');
  }

  render(result, { showMarks = true } = {}) {
    if (!result) {
      this.before.empty('no file');
      this.after.empty('');
      return;
    }
    const a = result.originalBounds;
    const b = result.bounds;
    // 1.1 leaves a little air; the max over both boxes is what keeps the two
    // panes on one scale.
    const span = Math.max(a.w, a.h, b.w, b.h, 1) * 1.1;
    const stroke = span / 480;
    this.before.draw(result.original, a, span, { stroke });
    this.after.draw(result.rings, b, span, {
      stroke,
      marks: showMarks ? result.marks : [],
    });
  }
}
