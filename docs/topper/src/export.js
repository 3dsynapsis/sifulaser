// Nesting and the two output formats.
//
// A stand is several pieces, so unlike the text tool there is a layout step
// before anything is written: the panels are shelf-packed onto one sheet at
// their real size. The preview draws from the same function, so what you see
// laid out is what lands in the file.
//
// Cut and engrave go on separate layers in separate colours, because every
// laser front-end asks you to assign different power to them and the usual way
// to tell it which is which is by colour.
//
// Engraving comes in two kinds and they are not interchangeable, so they get a
// layer each. A single-line face engraves as open polylines - the exact path the
// head follows, nothing to fill. A real typeface engraves as the closed outline
// of each letter, which has to be scanned solid: send those to a Line operation
// and the machine traces round every letter and leaves it hollow. Since the name
// and the line under it can be set in different faces, one stand can need both.
//
// The three colours are the ones laser software conventionally maps operations
// to: red cuts, black scans, blue scores.

const MM_TO_PT = 72 / 25.4;

export const LAYERS = {
  cut: { id: 'cut', color: '#ff0000', label: 'Cut' },
  engraveFill: { id: 'engrave-fill', color: '#000000', label: 'Engrave (Fill)' },
  engrave: { id: 'engrave-line', color: '#0000ff', label: 'Engrave (Line)' },
};

const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bboxOf(panel) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const eat = (pts) => {
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  };
  eat(panel.outline);
  for (const h of panel.holes) eat(h);
  for (const l of panel.loose || []) eat(l);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * Shelf-pack the panels left to right, wrapping at the sheet width.
 *
 * Deliberately not clever. A tighter pack would shuffle the pieces around and
 * the one thing that matters when you pick parts off the bed is being able to
 * tell which is which - so the face stays first and the base layers stay in
 * order, however much sheet that costs.
 */
export function nest(panels, { gap = 6, sheetWidth = 600 } = {}) {
  const placed = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;
  for (const panel of panels) {
    const bb = bboxOf(panel);
    if (x > 0 && x + bb.w > sheetWidth) {
      y += rowH + gap;
      x = 0;
      rowH = 0;
    }
    placed.push({ panel, bb, dx: x - bb.x0, dy: y - bb.y0 });
    x += bb.w + gap;
    rowH = Math.max(rowH, bb.h);
    width = Math.max(width, x - gap);
  }
  return { placed, width, height: y + rowH };
}

const moveRing = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

/** Everything to cut, everything to scan solid, everything to score as a line. */
export function collect(placed) {
  const cut = [];
  const engrave = [];
  const engraveFill = [];
  const move = (st, dx, dy) => {
    const out = new Array(st.length);
    for (let k = 0; k < st.length; k += 2) {
      out[k] = st[k] + dx;
      out[k + 1] = st[k + 1] + dy;
    }
    return out;
  };
  for (const { panel, dx, dy } of placed) {
    cut.push(moveRing(panel.outline, dx, dy));
    for (const h of panel.holes) cut.push(moveRing(h, dx, dy));
    for (const l of panel.loose || []) cut.push(moveRing(l, dx, dy));
    for (const st of panel.engrave || []) engrave.push(move(st, dx, dy));
    for (const st of panel.engraveFill || []) engraveFill.push(move(st, dx, dy));
  }
  return { cut, engrave, engraveFill };
}

const ringPath = (pts, height) => {
  if (pts.length < 2) return '';
  const d = [`M ${fmt(pts[0][0])} ${fmt(height - pts[0][1])}`];
  for (let i = 1; i < pts.length; i++) d.push(`L ${fmt(pts[i][0])} ${fmt(height - pts[i][1])}`);
  d.push('Z');
  return d.join(' ');
};

const linePath = (flat, height) => {
  if (flat.length < 4) return '';
  const d = [`M ${fmt(flat[0])} ${fmt(height - flat[1])}`];
  for (let k = 2; k < flat.length; k += 2) d.push(`L ${fmt(flat[k])} ${fmt(height - flat[k + 1])}`);
  return d.join(' ');
};

export function toSvg(panels, opts = {}) {
  const o = { title: 'Name stand', gap: 6, sheetWidth: 600, strokeWidth: 0.1, ...opts };
  const { placed, width, height } = nest(panels, o);
  const { cut, engrave, engraveFill } = collect(placed);
  const cd = cut.map((r) => ringPath(r, height)).filter(Boolean).join(' ');
  const ld = engrave.map((l) => linePath(l, height)).filter(Boolean).join(' ');
  const fd = engraveFill.map((l) => `${linePath(l, height)} Z`).filter(Boolean).join(' ');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
    + `width="${fmt(width)}mm" height="${fmt(height)}mm" `
    + `viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    `<title>${esc(o.title)}</title>`,
    fd ? `<g id="${LAYERS.engraveFill.id}" data-layer="${LAYERS.engraveFill.label}" `
      + `fill="${LAYERS.engraveFill.color}" fill-rule="nonzero" stroke="none">`
      + `<path d="${fd}"/></g>` : '',
    ld ? `<g id="${LAYERS.engrave.id}" data-layer="${LAYERS.engrave.label}" `
      + `fill="none" stroke="${LAYERS.engrave.color}" `
      + `stroke-width="${fmt(o.strokeWidth)}" stroke-linecap="round" `
      + `stroke-linejoin="round"><path d="${ld}"/></g>` : '',
    cd ? `<g id="${LAYERS.cut.id}" data-layer="${LAYERS.cut.label}" fill="none" `
      + `stroke="${LAYERS.cut.color}" stroke-width="${fmt(o.strokeWidth)}">`
      + `<path d="${cd}"/></g>` : '',
    '</svg>',
  ].filter(Boolean).join('\n');
}

/**
 * Minimal single-page PDF. Written by hand rather than pulled from a library:
 * a page of polygons needs five objects and a content stream, and the byte
 * offsets in the cross-reference table have to be exact or readers reject it.
 */
export function toPdf(panels, opts = {}) {
  const o = { title: 'Name stand', gap: 6, sheetWidth: 600, strokeWidth: 0.1, ...opts };
  const { placed, width, height } = nest(panels, o);
  const { cut, engrave, engraveFill } = collect(placed);
  const P = (v) => fmt(v * MM_TO_PT);

  const ops = [`${fmt(o.strokeWidth * MM_TO_PT)} w`, '1 J', '1 j'];
  const pen = (st) => {
    ops.push(`${P(st[0])} ${P(st[1])} m`);
    for (let k = 2; k < st.length; k += 2) ops.push(`${P(st[k])} ${P(st[k + 1])} l`);
  };
  ops.push('0 0 0 rg');
  for (const st of engraveFill) {
    if (st.length < 4) continue;
    pen(st);
    // Non-zero fill matches the winding the glyph data already carries, so a
    // counter stays a counter and an overlapping stroke does not cancel out.
    ops.push('h f');
  }
  ops.push('0 0 1 RG');
  for (const st of engrave) {
    if (st.length < 4) continue;
    pen(st);
    ops.push('S');
  }
  ops.push('1 0 0 RG');
  for (const ring of cut) {
    if (ring.length < 2) continue;
    ops.push(`${P(ring[0][0])} ${P(ring[0][1])} m`);
    for (let i = 1; i < ring.length; i++) ops.push(`${P(ring[i][0])} ${P(ring[i][1])} l`);
    ops.push('h S');
  }
  const stream = ops.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(width * MM_TO_PT)} `
    + `${fmt(height * MM_TO_PT)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< /Title (${pdfString(o.title)}) /Creator (SifuLaser Stand Maker) >>`,
  ];

  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R `
    + `/Info ${objects.length} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return body + xref + trailer;
}

function pdfString(s) {
  return String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '');
}

/** UTF-8 byte length: the xref table indexes bytes, not characters. */
function byteLength(s) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export { MM_TO_PT, byteLength, bboxOf, fmt };
