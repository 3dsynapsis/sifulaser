// Writers for the two output formats.
//
// SVG is what a laser workflow wants. PDF is here because a lot of vinyl
// cutters, pen plotters and print shops take PDF and nothing else, and because
// a PDF opens the same size on every machine - the millimetres survive.
//
// The PDF is written by hand rather than pulled from a library: a page of
// polylines needs four objects and a content stream, and shipping a PDF library
// to draw straight lines would be silly.

const MM_TO_PT = 72 / 25.4;

export const LAYERS = {
  engrave: { id: 'engrave-line', color: '#0000ff', label: 'Engrave (Line)' },
  cut: { id: 'cut', color: '#ff0000', label: 'Cut' },
};

const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Flat [x,y,...] polylines -> one SVG path data string, y flipped to y-down. */
function toPathData(paths, height) {
  const out = [];
  for (const st of paths) {
    if (st.length < 4) continue;
    const seg = [`M ${fmt(st[0])} ${fmt(height - st[1])}`];
    for (let k = 2; k < st.length; k += 2) {
      seg.push(`L ${fmt(st[k])} ${fmt(height - st[k + 1])}`);
    }
    out.push(seg.join(' '));
  }
  return out.join(' ');
}

/**
 * @param paths  polylines already normalised so the ink starts at (margin, margin)
 * @param size   { width, height } of the page in millimetres
 */
export function toSvg(paths, size, opts = {}) {
  const o = { strokeWidth: 0.1, layer: 'engrave', title: 'Text', ...opts };
  const L = LAYERS[o.layer] || LAYERS.engrave;
  const d = toPathData(paths, size.height);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
    + `width="${fmt(size.width)}mm" height="${fmt(size.height)}mm" `
    + `viewBox="0 0 ${fmt(size.width)} ${fmt(size.height)}">`,
    `<title>${esc(o.title)}</title>`,
    `<g id="${L.id}" data-layer="${esc(L.label)}" fill="none" stroke="${L.color}" `
    + `stroke-width="${fmt(o.strokeWidth)}" stroke-linecap="round" `
    + 'stroke-linejoin="round">',
    d ? `<path d="${d}"/>` : '',
    '</g>',
    '</svg>',
  ].filter(Boolean).join('\n');
}

/** Minimal single-page PDF. Coordinates are y-up already, which is PDF's own. */
export function toPdf(paths, size, opts = {}) {
  const o = { strokeWidth: 0.1, title: 'Text', ...opts };
  const w = size.width * MM_TO_PT;
  const h = size.height * MM_TO_PT;

  const ops = [`${fmt(o.strokeWidth * MM_TO_PT)} w`, '0 0 0 RG', '1 J', '1 j'];
  for (const st of paths) {
    if (st.length < 4) continue;
    ops.push(`${fmt(st[0] * MM_TO_PT)} ${fmt(st[1] * MM_TO_PT)} m`);
    for (let k = 2; k < st.length; k += 2) {
      ops.push(`${fmt(st[k] * MM_TO_PT)} ${fmt(st[k + 1] * MM_TO_PT)} l`);
    }
    ops.push('S');
  }
  const stream = ops.join('\n');

  // Build the body object by object, recording where each one starts so the
  // xref table can point at it. Byte offsets have to be exact or readers reject
  // the file, so the objects are assembled as latin1 text and measured as bytes.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(w)} ${fmt(h)}] `
    + '/Contents 4 0 R /Resources << >> >>',
    `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< /Title (${pdfString(o.title)}) /Creator (SifuLaser Text Engraver) >>`,
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

/** PDF text strings escape these three, and we keep to ASCII. */
function pdfString(s) {
  return String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '');
}

/**
 * UTF-8 byte length. The xref table indexes bytes, not characters, so a stray
 * non-ASCII character in a title would shift every offset and break the file.
 * pdfString already strips those; this stays correct if it ever stops.
 */
function byteLength(s) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export { MM_TO_PT, byteLength };
