// The preview pane: the family's Pane (head, SVG on a grid, note), drawing the
// data preview.js built: the board, engraving dark, score blue, cut red,
// each piece labelled with its size.
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

// How each material looks in the preview: the board, and what engraving looks
// like on it. Wood and MDF darken; black acrylic turns dark grey; clear acrylic
// and both mirrors turn a whitish grey (Boss, 9 Okt 2026). A whitish engraving
// gets a thin grey edge so it still reads on a pale board.
const GRADIENTS = {
  'g-clear': [[0, '#cfe8f5', 0.75], [0.5, '#ffffff', 0.35], [1, '#b9dcef', 0.7]],
  'g-black': [[0, '#2b2d31'], [0.45, '#4a4d53'], [0.55, '#1b1c1f'], [1, '#101113']],
  'g-gold': [[0, '#9c7a26'], [0.3, '#f6dc87'], [0.55, '#b8902f'], [0.72, '#fff0b3'], [1, '#a7832b']],
  'g-silver': [[0, '#8c9198'], [0.3, '#f2f4f6'], [0.55, '#a5abb2'], [0.72, '#ffffff'], [1, '#8a9097']],
};
const LOOK = {
  ply: { board: '#e8cfa0', engrave: '#5a3a1c', swatch: '#e8cfa0' },
  mdf: { board: '#b98a5e', engrave: '#3a2414', swatch: '#b98a5e' },
  clear: { board: 'url(#g-clear)', engrave: '#eef0f2', edge: '#8a949c', swatch: '#cfe8f5' },
  black: { board: 'url(#g-black)', engrave: '#5f6268', swatch: '#2b2d31' },
  gold: { board: 'url(#g-gold)', engrave: '#e8e8e6', edge: '#7a6a3a', swatch: '#e2c25e' },
  silver: { board: 'url(#g-silver)', engrave: '#eceeef', edge: '#6f757c', swatch: '#c9cdd2' },
};

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
    this.svg = el('svg', { class: 'preview', role: 'img', 'aria-label': 'Pratonton potong dan ukir' });
    this.legend = document.createElement('p');
    this.legend.className = 'pane-note legend';
    const key = (cls, text) => {
      const k = document.createElement('span');
      k.className = `key ${cls}`;
      k.textContent = text;
      return k;
    };
    this.keys = { cut: key('key-cut', 'Potong'), engrave: key('key-engrave', 'Ukir'), score: key('key-score', 'Garisan halus') };
    this.legend.append(this.keys.cut, this.keys.engrave, this.keys.score);
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
   * @param group    material group id, for the board's colour
   */
  draw(preview, lines, group = 'ply') {
    this.svg.replaceChildren();
    const b = preview?.bounds;
    if (!b) { this.empty('Tiada pratonton'); return; }
    const look = LOOK[group] || LOOK.ply;
    this.root.style.setProperty('--engrave', look.engrave);
    this.root.style.setProperty('--board', look.swatch);
    const count = preview.pieces.length;
    this.size.textContent = count === 1 ? '1 kepingan' : `${count} kepingan (ukuran cm)`;

    const aspect = this.aspect();
    const w = Math.max(b.x1 - b.x0, 1), hgt = Math.max(b.y1 - b.y0, 1);
    const single = count === 1;
    // Room for the labels: above and left for a single piece's dimensions,
    // below each piece otherwise.
    const fsBase = Math.max(w, hgt * aspect) * 0.035;
    const padTop = single ? fsBase * 2 : fsBase;
    const padLeft = single ? fsBase * 2 : fsBase;
    const padBottom = single ? fsBase : fsBase * 1.6;
    const x0 = b.x0 - padLeft, y0 = b.y0 - padTop;
    const needW = w + padLeft + fsBase, needH = hgt + padTop + padBottom;
    const span = Math.max(needW, needH * aspect) * 1.04;
    const vh = span / aspect;
    const cx = x0 + needW / 2, cy = y0 + needH / 2;
    this.svg.setAttribute('viewBox', `${n3(cx - span / 2)} ${n3(cy - vh / 2)} ${n3(span)} ${n3(vh)}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const fs = span * 0.034;

    // Mirror and acrylic boards are gradients, defined per draw.
    const defs = el('defs');
    for (const [id, stops] of Object.entries(GRADIENTS)) {
      const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 });
      for (const [off, colour, op = 1] of stops) g.append(el('stop', { offset: off, 'stop-color': colour, 'stop-opacity': op }));
      defs.append(g);
    }
    this.svg.append(defs);

    // Board first, then what the laser does to it: engraving, score, cut.
    preview.pieces.forEach((pc) => {
      const board = pc.d
        ? el('path', { d: pc.d + pc.holesD, class: 'board', 'fill-rule': 'evenodd' })
        : el('rect', { x: n3(pc.box.x), y: n3(pc.box.y), width: n3(pc.box.w), height: n3(pc.box.h), class: 'board board-box', 'vector-effect': 'non-scaling-stroke' });
      board.style.fill = look.board;
      this.svg.append(board);
    });
    if (preview.art) {
      this.svg.append(el('path', { d: preview.art, class: 'art', 'vector-effect': 'non-scaling-stroke' }));
    }
    const engraved = (node) => {
      node.style.fill = look.engrave;
      if (look.edge) {
        node.style.stroke = look.edge;
        node.style.strokeWidth = '0.6px';
        node.setAttribute('vector-effect', 'non-scaling-stroke');
      }
      return node;
    };
    if (preview.fillD) this.svg.append(engraved(el('path', { d: preview.fillD, class: 'engrave', 'fill-rule': 'evenodd' })));
    if (preview.rasterD) this.svg.append(engraved(el('path', { d: preview.rasterD, class: 'engrave raster' })));
    for (const band of preview.bands || []) {
      const n = el('path', { d: band.d, class: 'engrave-line', 'stroke-width': Math.max(band.w, 0.01) });
      n.style.stroke = look.engrave;
      this.svg.append(n);
    }
    if (preview.scoreD) this.svg.append(el('path', { d: preview.scoreD, class: 'score', 'vector-effect': 'non-scaling-stroke' }));
    if (preview.cutD) this.svg.append(el('path', { d: preview.cutD, class: 'cut', 'vector-effect': 'non-scaling-stroke' }));
    preview.pieces.forEach((pc, i) => {
      const bad = pc.highlight || (lines[i] && !lines[i].fits);
      if (bad) {
        this.svg.append(el('rect', {
          x: n3(pc.box.x), y: n3(pc.box.y), width: n3(pc.box.w), height: n3(pc.box.h), class: 'cut piece-bad', 'vector-effect': 'non-scaling-stroke',
        }));
      }
    });
    this.keys.cut.hidden = !preview.cutD;
    this.keys.engrave.hidden = !(preview.fillD || preview.rasterD || (preview.bands || []).length);
    this.keys.score.hidden = !preview.scoreD;

    // Labels last, so they sit above every line.
    const text = (x, y, s, size, extra = {}) => {
      const t = el('text', { x: n3(x), y: n3(y), 'font-size': n3(size), class: 'label', 'text-anchor': 'middle', ...extra });
      t.textContent = s;
      this.svg.append(t);
      return t;
    };
    if (single && lines[0]) {
      const bx = preview.pieces[0].box;
      const [wt, ht] = lines[0].sizeText.replace(' cm', '').split(' x ');
      text(bx.x + bx.w / 2, bx.y - fs * 0.6, `${wt} cm`, fs);
      const tx = bx.x - fs * 0.6, ty = bx.y + bx.h / 2;
      text(tx, ty, `${ht} cm`, fs, { transform: `rotate(-90 ${n3(tx)} ${n3(ty)})` });
      return;
    }
    // Several pieces: "3: 5.0 x 3.0" under each, sized to its own piece's width
    // and to the gap above the next piece down, so labels never run into their
    // neighbours. Where there is no room, just the number, inside the piece.
    const boxes = preview.pieces.map((pc) => pc.box);
    boxes.forEach((bx, i) => {
      if (!lines[i]) return;
      const label = count <= 40 ? `${i + 1}: ${lines[i].sizeText.replace(' cm', '')}` : String(i + 1);
      let room = padBottom;
      for (const o of boxes) {
        if (o === bx || o.x >= bx.x + bx.w || o.x + o.w <= bx.x) continue;
        const gap = o.y - (bx.y + bx.h);
        if (gap >= -1e-6 && gap < room) room = gap;
      }
      const size = Math.min(fs * 0.6, bx.w / (label.length * 0.58), room * 0.68);
      if (count <= 40 && size >= fs * 0.3) {
        text(bx.x + bx.w / 2, bx.y + bx.h + size * 1.0, label, size);
      } else {
        const inner = Math.min(fs * 0.55, bx.h * 0.45, bx.w * 0.45);
        text(bx.x + bx.w / 2, bx.y + bx.h / 2 + inner * 0.35, String(i + 1), inner);
      }
    });
  }
}
