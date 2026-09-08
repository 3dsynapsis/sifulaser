// The two previews: the file that arrived, and the file that will leave.
//
// Both are drawn from real geometry and the right-hand one is drawn from the
// CONVERTED data - for SVG and DXF that is the output bytes read back through
// our own readers, so the pane is a picture of the file that is about to be
// downloaded rather than a second picture of the input. Re-drawing the input on
// the right would be a lie about what was produced, and it is the specific lie
// a converter is most tempted to tell, because it always looks right.
//
// The two panes share one scale, worked out from both drawings. Framing each to
// its own artwork would hide the very failure this tool must never have: a
// conversion that came out at the wrong size would look identical to one that
// did not.
//
// Curves are drawn as curves. The docs carry cubics all the way through, so the
// preview emits C commands rather than sampled points - which is both honest
// about what the writers produce and, on the owner's 40,000-vertex R12 drawing,
// the difference between a responsive pane and a stuttering one.
//
// This module knows nothing about the store.

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const n3 = (v) => Math.round(v * 1000) / 1000;

const usable = (c) => {
  if (!c) return null;
  const s = String(c).trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent' || s === 'rgba(0, 0, 0, 0)') return null;
  return c;
};

/**
 * One path's `d`, y flipped into SVG's frame.
 *
 * The command letter is written only when it changes - ordinary SVG, and worth
 * roughly 80 KB on the R12 drawing, which lands in the DOM twice because there
 * are two panes.
 */
function pathD(p) {
  const parts = [`M${n3(p.start[0])} ${n3(-p.start[1])}`];
  let last = 'M';
  for (const s of p.segs) {
    const cmd = s[0];
    const lead = cmd === last ? ' ' : cmd;
    last = cmd;
    if (cmd === 'C') {
      parts.push(`${lead}${n3(s[1])} ${n3(-s[2])} ${n3(s[3])} ${n3(-s[4])} ${n3(s[5])} ${n3(-s[6])}`);
    } else {
      parts.push(`${lead}${n3(s[1])} ${n3(-s[2])}`);
    }
  }
  if (p.closed) parts.push('Z');
  return parts.join('');
}

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
    this.note = document.createElement('p');
    this.note.className = 'pane-note';
    this.note.hidden = true;

    this.root.append(this.head, this.svg, this.note);
  }

  setLabel(text) { this.title.textContent = text; }

  setNote(text) {
    this.note.textContent = text || '';
    this.note.hidden = !text;
  }

  empty(message) {
    this.svg.replaceChildren();
    this.svg.setAttribute('viewBox', '0 0 10 10');
    this.size.textContent = '';
    const t = el('text', {
      x: 5, y: 5, class: 'pane-empty-text', 'text-anchor': 'middle',
      'dominant-baseline': 'middle', 'font-size': 0.8,
    });
    t.textContent = message || '';
    this.svg.append(t);
  }

  /**
   * Draw a Doc.
   *
   * Paths are grouped by layer AND by their own stroke and fill, so an imported
   * SVG keeps the colours and the filled shapes it arrived with while a DXF,
   * whose entities agree per layer, still collapses to one element per layer.
   * That grouping is what keeps 557 entities from becoming 557 DOM nodes twice
   * over.
   */
  draw(doc, span, b, { sizeText = null, unitLabel = 'mm', aspect = 1 } = {}) {
    this.svg.replaceChildren();
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    // The viewBox is `span` wide and as tall as the pane's own shape, rather
    // than square. Both panes are the same width on screen and both get the
    // same span, so millimetres-per-pixel still matches between them - which is
    // the property that matters - while a drawing three times wider than it is
    // tall stops being drawn into a third of the pane.
    const vh = span / aspect;
    // -cy - vh/2 because the drawing is y-up and this frame is y-down.
    this.svg.setAttribute('viewBox',
      `${n3(cx - span / 2)} ${n3(-cy - vh / 2)} ${n3(span)} ${n3(vh)}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    this.size.textContent = sizeText != null
      ? sizeText
      : (doc.paths.length ? `${n3(Math.round(b.w * 100) / 100)} x ${n3(Math.round(b.h * 100) / 100)} ${unitLabel}` : '');

    if (!doc.paths.length) return;

    const stroke = span / 420;

    this.svg.append(el('rect', {
      x: n3(b.x0), y: n3(-b.y1), width: n3(b.w), height: n3(b.h),
      class: 'art-box', 'stroke-width': stroke * 0.7,
    }));

    const groups = new Map();
    for (const p of doc.paths) {
      if (!p.segs.length) continue;
      const layer = (doc.layers && doc.layers[p.layer ?? 0]) || null;
      const sk = usable(p.stroke) || (layer && layer.colour) || null;
      const fl = usable(p.fill);
      const key = `${sk || '-'}|${fl || '-'}`;
      if (!groups.has(key)) groups.set(key, { stroke: sk, fill: fl, d: [] });
      groups.get(key).d.push(pathD(p));
    }

    for (const g of groups.values()) {
      const node = el('path', {
        d: g.d.join(''),
        class: g.stroke ? '' : 'art',
        'stroke-width': stroke,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        fill: g.fill || 'none',
        ...(g.stroke ? { stroke: g.stroke } : {}),
      });
      this.svg.append(node);
    }
  }
}

export class View {
  constructor(leftRoot, rightRoot) {
    this.left = new Pane(leftRoot, 'Fail Asal');
    this.right = new Pane(rightRoot, 'Fail Ditukar (Pratonton)');
  }

  /**
   * `left` and `right` are each { doc, bounds } or null.
   *
   * `unitLabel` is not decoration. Before the unit question is answered the
   * geometry is still in the file's own units and calling those millimetres on
   * screen would be the guess the rest of the tool refuses to make.
   */
  render({ left, right, unitLabel = 'mm', rightEmpty = '', leftEmpty = '' } = {}) {
    // Measured off the left pane and used for both. The right one is hidden
    // while the unit question is unanswered, and a hidden element measures
    // zero, which would make the span meaningless for the pane that IS on
    // screen. The two panes are the same size by construction anyway.
    const r = this.left.svg.getBoundingClientRect();
    const raw = r.width > 0 && r.height > 0 ? r.width / r.height : 1.25;
    // A measurement taken before the layout settles can come back absurd, and
    // an absurd aspect draws the artwork as a speck with nothing on screen to
    // explain why. Outside this band the CSS's own shape is the better guess.
    const aspect = raw >= 0.2 && raw <= 6 ? raw : 1.25;

    // Both fits are required: the width has to fit in `span` and the height in
    // span/aspect, so a tall drawing needs a wider span than its own width.
    const need = [];
    if (left) need.push(left.bounds.w, left.bounds.h * aspect);
    if (right) need.push(right.bounds.w, right.bounds.h * aspect);
    const span = Math.max(...need, 1) * 1.06;

    if (left) this.left.draw(left.doc, span, left.bounds, { unitLabel, aspect });
    else this.left.empty(leftEmpty);

    if (right) this.right.draw(right.doc, span, right.bounds, { unitLabel: 'mm', aspect });
    else this.right.empty(rightEmpty);
  }
}
