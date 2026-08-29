// The two output formats, and the one decision that sits in front of them:
// which layer each ring belongs on.
//
// Cut and engrave go on separate layers in separate colours, because every
// laser front-end asks you to assign different power to them and the usual way
// to tell it which is which is by colour:
//
//   cut           #ff0000  red
//   engrave-fill  #000000  black - closed shapes, the machine scans them solid
//   engrave-line  #0000ff  blue  - open strokes, the machine follows the line
//
// Only the layers a job actually contains are written.
//
// Everything defaults to cut, and that is a deliberate refusal to be clever.
// An SVG path with no fill attribute is black-filled by the spec, so reading
// "black fill" as "engrave this solid" would put most downloaded box templates
// on the wrong layer and burn a panel that was meant to be cut out. The file's
// own colours are only honoured when the user ticks the box, having looked at
// the file and decided it really is layered.

import { boundsOf, ringArea } from './geom/refit.js';

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

/** rgb(255, 0, 0) or #ff0000 or a keyword, as three 0-255 numbers. */
function parseColour(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent') return null;
  let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  const named = { red: [255, 0, 0], blue: [0, 0, 255], black: [0, 0, 0] };
  return named[s] || null;
}

const isRed = (c) => c && c[0] > 140 && c[1] < 100 && c[2] < 100;
const isBlue = (c) => c && c[2] > 140 && c[0] < 100 && c[1] < 100;

/**
 * Sort rings into layers.
 *
 * `meta[i]` is the stroke and fill the ring arrived with, from the importer.
 * With keepLayers off - the default - everything cuts except rings with no
 * area, which cannot be cut and can only ever have been an engraved line.
 */
export function splitLayers(rings, meta = [], { keepLayers = false } = {}) {
  const cut = [];
  const engrave = [];
  const engraveFill = [];
  rings.forEach((ring, i) => {
    if (ring.length < 2) return;
    // A ring with no area is an open stroke that the importer closed on itself.
    // Cutting it would be a zero-width slit; it is a score line.
    if (Math.abs(ringArea(ring)) < 0.01) {
      engrave.push(ring);
      return;
    }
    if (!keepLayers) {
      cut.push(ring);
      return;
    }
    const m = meta[i] || {};
    const stroke = parseColour(m.stroke);
    const fill = parseColour(m.fill);
    if (isBlue(stroke)) engrave.push(ring);
    else if (isRed(stroke)) cut.push(ring);
    else if (!stroke && fill) engraveFill.push(ring);
    else cut.push(ring);
  });
  return { cut, engrave, engraveFill };
}

/** Slide everything so the artwork starts at the origin, and report the size. */
export function layoutDoc(layers, { margin = 0 } = {}) {
  const all = [...layers.cut, ...layers.engrave, ...layers.engraveFill];
  const b = boundsOf(all);
  const dx = margin - b.x0;
  const dy = margin - b.y0;
  const move = (list) => list.map((r) => r.map(([x, y]) => [x + dx, y + dy]));
  return {
    cut: move(layers.cut),
    engrave: move(layers.engrave),
    engraveFill: move(layers.engraveFill),
    width: b.w + margin * 2,
    height: b.h + margin * 2,
  };
}

const ringPath = (pts, height, close = true) => {
  if (pts.length < 2) return '';
  const d = [`M ${fmt(pts[0][0])} ${fmt(height - pts[0][1])}`];
  for (let i = 1; i < pts.length; i++) {
    d.push(`L ${fmt(pts[i][0])} ${fmt(height - pts[i][1])}`);
  }
  if (close) d.push('Z');
  return d.join(' ');
};

export function toSvg(layers, opts = {}) {
  const o = { title: 'Refitted template', strokeWidth: 0.1, margin: 0, ...opts };
  const doc = layoutDoc(layers, o);
  const { width, height } = doc;
  const cd = doc.cut.map((r) => ringPath(r, height)).filter(Boolean).join(' ');
  const ld = doc.engrave.map((r) => ringPath(r, height, false)).filter(Boolean).join(' ');
  const fd = doc.engraveFill.map((r) => ringPath(r, height)).filter(Boolean).join(' ');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
    + `width="${fmt(width)}mm" height="${fmt(height)}mm" `
    + `viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    `<title>${esc(o.title)}</title>`,
    fd ? `<g id="${LAYERS.engraveFill.id}" data-layer="${LAYERS.engraveFill.label}" `
      + `fill="${LAYERS.engraveFill.color}" fill-rule="evenodd" stroke="none">`
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
 * Minimal single-page PDF, written by hand rather than pulled from a library:
 * a page of polygons needs five objects and a content stream, and the byte
 * offsets in the cross-reference table have to be exact or readers reject it.
 */
export function toPdf(layers, opts = {}) {
  const o = { title: 'Refitted template', strokeWidth: 0.1, margin: 0, ...opts };
  const doc = layoutDoc(layers, o);
  const { width, height } = doc;
  const P = (v) => fmt(v * MM_TO_PT);

  const ops = [`${fmt(o.strokeWidth * MM_TO_PT)} w`, '1 J', '1 j'];
  const pen = (ring) => {
    ops.push(`${P(ring[0][0])} ${P(ring[0][1])} m`);
    for (let i = 1; i < ring.length; i++) ops.push(`${P(ring[i][0])} ${P(ring[i][1])} l`);
  };
  if (doc.engraveFill.length) {
    ops.push('0 0 0 rg');
    for (const ring of doc.engraveFill) {
      if (ring.length < 3) continue;
      pen(ring);
      // Even-odd, because these rings came out of somebody else's file and
      // their windings are whatever that program felt like. Even-odd makes a
      // ring inside a ring a hole regardless of direction.
      ops.push('h f*');
    }
  }
  if (doc.engrave.length) {
    ops.push('0 0 1 RG');
    for (const ring of doc.engrave) {
      if (ring.length < 2) continue;
      pen(ring);
      ops.push('S');
    }
  }
  if (doc.cut.length) {
    ops.push('1 0 0 RG');
    for (const ring of doc.cut) {
      if (ring.length < 2) continue;
      pen(ring);
      ops.push('h S');
    }
  }
  const stream = ops.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(width * MM_TO_PT)} `
    + `${fmt(height * MM_TO_PT)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< /Title (${pdfString(o.title)}) /Creator (SifuLaser Template Adjuster) >>`,
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
export function byteLength(s) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export { MM_TO_PT, fmt, parseColour };
