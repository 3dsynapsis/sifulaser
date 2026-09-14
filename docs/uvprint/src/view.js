// The preview pane: the family's Pane (head, SVG on a grid, note), drawing the
// data preview.js built. Artwork grey, cut lines red, each piece labelled.
//
// Line widths use vector-effect: non-scaling-stroke so a cut line is equally
// visible on a 5 x 3 cm keychain and a 90 x 60 cm sign. Label text is sized
// from the view span, so it is readable at both sizes too.
//
// This module knows nothing about the store.

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const n3 = (v) => Math.round(v * 1000) / 1000;

export class PreviewPane {
  constructor(root) {
    this.root = root;
    this.head = document.createElement('div');
    this.head.className = 'pane-head';
    this.title = document.createElement('span');
    this.title.className = 'pane-title';
    this.title.textContent = 'Pratonton';
    this.size = document.createElement('span');
    this.size.className = 'pane-size';
    this.head.append(this.title, this.size);
    this.svg = el('svg', { class: 'preview', role: 'img', 'aria-label': 'Pratonton garisan potong' });
    this.legend = document.createElement('p');
    this.legend.className = 'pane-note legend';
    const cut = document.createElement('span');
    cut.className = 'key key-cut';
    cut.textContent = 'Garisan potong';
    const art = document.createElement('span');
    art.className = 'key key-art';
    art.textContent = 'Artwork';
    this.legend.append(cut, art);
    this.root.append(this.head, this.svg, this.legend);
  }

  aspect() {
    const r = this.svg.getBoundingClientRect();
    const raw = r.width > 0 && r.height > 0 ? r.width / r.height : 1.4;
    return raw >= 0.2 && raw <= 6 ? raw : 1.4;
  }

  empty(message) {
    this.svg.replaceChildren();
    this.svg.setAttribute('viewBox', '0 0 10 10');
    this.size.textContent = '';
    const t = el('text', { x: 5, y: 5, class: 'pane-empty-text', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 0.6 });
    t.textContent = message || '';
    this.svg.append(t);
  }

  /**
   * @param preview  buildPreview() output
   * @param lines    quote().lines in the same order - size text and bed fit
   */
  draw(preview, lines) {
    this.svg.replaceChildren();
    const b = preview?.bounds;
    if (!b) { this.empty('Tiada pratonton'); return; }
    const count = preview.pieces.length;
    this.size.textContent = count === 1 ? '1 kepingan' : `${count} kepingan`;

    const aspect = this.aspect();
    const w = Math.max(b.x1 - b.x0, 1), hgt = Math.max(b.y1 - b.y0, 1);
    const single = count === 1;
    // Room for the labels: above and left for a single piece's dimensions,
    // below each piece otherwise.
    const fsBase = Math.max(w, hgt * aspect) * 0.035;
    const padTop = single ? fsBase * 2 : fsBase;
    const padLeft = single ? fsBase * 2 : fsBase;
    const padBottom = single ? fsBase : fsBase * 2.2;
    const x0 = b.x0 - padLeft, y0 = b.y0 - padTop;
    const needW = w + padLeft + fsBase, needH = hgt + padTop + padBottom;
    const span = Math.max(needW, needH * aspect) * 1.04;
    const vh = span / aspect;
    const cx = x0 + needW / 2, cy = y0 + needH / 2;
    this.svg.setAttribute('viewBox', `${n3(cx - span / 2)} ${n3(cy - vh / 2)} ${n3(span)} ${n3(vh)}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const fs = span * 0.034;

    if (preview.art) {
      this.svg.append(el('path', { d: preview.art, class: 'art', 'vector-effect': 'non-scaling-stroke' }));
    }
    preview.pieces.forEach((pc, i) => {
      const bad = pc.highlight || (lines[i] && !lines[i].fits);
      const g = el('g', { class: bad ? 'piece piece-bad' : 'piece' });
      g.append(el('path', { d: pc.d + pc.holesD, class: 'cut', 'fill-rule': 'evenodd', 'vector-effect': 'non-scaling-stroke' }));
      this.svg.append(g);
    });

    // Labels last, so they sit above every line.
    const text = (x, y, s, extra = {}) => {
      const t = el('text', { x: n3(x), y: n3(y), 'font-size': n3(fs), class: 'label', 'text-anchor': 'middle', ...extra });
      t.textContent = s;
      this.svg.append(t);
      return t;
    };
    if (single && lines[0]) {
      const bx = preview.pieces[0].box;
      const [wt, ht] = lines[0].sizeText.replace(' cm', '').split(' x ');
      text(bx.x + bx.w / 2, bx.y - fs * 0.6, `${wt} cm`);
      const tx = bx.x - fs * 0.6, ty = bx.y + bx.h / 2;
      text(tx, ty, `${ht} cm`, { transform: `rotate(-90 ${n3(tx)} ${n3(ty)})` });
    } else if (count <= 24) {
      preview.pieces.forEach((pc, i) => {
        if (!lines[i]) return;
        const bx = pc.box;
        text(bx.x + bx.w / 2, bx.y + bx.h + fs * 1.1, `${i + 1}: ${lines[i].sizeText}`, { 'font-size': n3(fs * 0.8) });
      });
    } else {
      preview.pieces.forEach((pc, i) => {
        const bx = pc.box;
        text(bx.x + bx.w / 2, bx.y + bx.h / 2 + fs * 0.3, String(i + 1), { 'font-size': n3(Math.min(fs * 0.8, bx.h * 0.8)) });
      });
    }
  }
}
