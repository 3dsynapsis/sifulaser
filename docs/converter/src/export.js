// The three writers.
//
// Lifted in shape from 17_Template Adjuster/src/export.js - the hand-built PDF,
// the xref arithmetic and byteLength() are that file's, and the comments that
// explain them came across with the code. Three things are deliberately
// different, and each of them is the difference between "resize this drawing"
// and "change this drawing's container":
//
//  1. CURVES SURVIVE. The Adjuster's PDF writer emits only 'm' and 'l' - there
//     is no 'c' anywhere in it - because everything reaching it had already
//     been sampled into points. Here a cubic goes out as a cubic, in all three
//     formats. PDF's 'c' operator takes the same six numbers in the same order
//     as an SVG 'C' and as a DXF spline span, so nothing is converted at all.
//
//  2. NOTHING MOVES. The Adjuster calls layoutDoc() from both writers, which
//     slides the artwork until its corner sits at the margin. Shape survives,
//     absolute position does not - and somebody converting one part of a
//     multi-file job finds the pieces no longer line up on reassembly. Here the
//     original coordinates go out unchanged, and PDF gets a MediaBox with a
//     non-zero origin, which PDF has always allowed.
//
//  3. THE FILE'S OWN LAYERS AND COLOURS GO OUT. The Adjuster's splitLayers()
//     puts every ring with area on one red cut layer by default. That is a
//     deliberate refusal to be clever about somebody else's file, and it is
//     right for a tool that emits cut templates. Here it would throw away the
//     structure the user built, which for a DXF is also the structure LightBurn
//     reads to decide cut settings.

import { bounds } from './doc.js';
import { toDxf } from './dxf/write.js';

export { toDxf };

const MM_TO_PT = 72 / 25.4;

/** Three decimals is a micrometre - invisible, and about a quarter smaller. */
const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** UTF-8 byte length: the xref table indexes bytes, not characters. */
export function byteLength(s) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

const usableColour = (c) => {
  const s = String(c || '').trim().toLowerCase();
  return s && s !== 'none' && s !== 'transparent' ? s : null;
};

// ---------------------------------------------------------------------------
// SVG

/**
 * One user unit is one millimetre, and y is flipped exactly here.
 *
 * Internally the drawing is y-up, which is what DXF uses and what makes the
 * DXF writer a straight copy. SVG is y-down. The flip is a plain negation in
 * this one function and its mirror in the reader, which is why an SVG that goes
 * in comes back out with the same numbers rather than the same numbers
 * upside down. A drawing mirrored vertically looks completely fine on anything
 * symmetric, and is found by the customer whose name came out backwards.
 */
export function toSvg(doc, opts = {}) {
  const o = {
    title: 'Converted drawing', strokeWidth: 0.1, translate: false, unitNote: null, ...opts,
  };
  const b = bounds(doc);
  const dx = o.translate ? -b.x0 : 0;
  const dy = o.translate ? -b.y0 : 0;
  const x0 = b.x0 + dx;
  const y1 = b.y1 + dy;
  const w = b.w;
  const h = b.h;

  // Grouped by layer AND by the shape's own stroke and fill, not by layer
  // alone.
  //
  // Layer alone was cheaper and it silently repainted the drawing. In the
  // owner's modern-spline-mm.dxf all 654 splines sit on one layer while
  // carrying two entity colours - 618 at ACI 240 and 36 at ACI 140 - so one
  // group per layer took the first colour it found and wrote the other 36
  // shapes in it. For a tool whose whole claim is that it changes the format
  // and nothing else, and on files where colour is what tells a laser to cut
  // rather than to engrave, that is not an optimisation.
  //
  // The payload argument survives intact: entities on one layer normally share
  // one colour, so the R12 drawing still collapses to one path per layer. A
  // file that really does hold two colours gets two paths, which is the number
  // of colours it has.
  const byLayer = new Map();
  for (const p of doc.paths) {
    if (!p.segs.length) continue;
    const li = p.layer ?? 0;
    const key = `${li}|${usableColour(p.stroke) || ''}|${usableColour(p.fill) || ''}`;
    if (!byLayer.has(key)) byLayer.set(key, { li, paths: [] });
    byLayer.get(key).paths.push(p);
  }

  // A command letter is only written when it changes. That is ordinary SVG - a
  // run of numbers after an L is a run of linetos - and on the owner's R12
  // drawing it is about 80 KB off a 750 KB payload, which lands in the DOM
  // twice because there are two previews.
  const d = (p) => {
    const parts = [`M${fmt(p.start[0] + dx)} ${fmt(-(p.start[1] + dy))}`];
    let last = 'M';
    for (const s of p.segs) {
      const cmd = s[0];
      const lead = cmd === last ? ' ' : cmd;
      last = cmd;
      if (cmd === 'C') {
        parts.push(`${lead}${fmt(s[1] + dx)} ${fmt(-(s[2] + dy))} `
          + `${fmt(s[3] + dx)} ${fmt(-(s[4] + dy))} `
          + `${fmt(s[5] + dx)} ${fmt(-(s[6] + dy))}`);
      } else {
        parts.push(`${lead}${fmt(s[1] + dx)} ${fmt(-(s[2] + dy))}`);
      }
    }
    if (p.closed) parts.push('Z');
    return parts.join('');
  };

  const out = [
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
    + `width="${fmt(w)}mm" height="${fmt(h)}mm" `
    + `viewBox="${fmt(x0)} ${fmt(-y1)} ${fmt(w)} ${fmt(h)}">`,
  ];
  // The provenance line goes INSIDE the file, not only on the screen. In six
  // months this file will have been emailed to somebody who was not here when
  // the unit was chosen.
  if (o.unitNote) out.push(`<!-- ${String(o.unitNote).replace(/--+/g, '-')} -->`);
  out.push(`<title>${esc(o.title)}</title>`);

  // A layer that holds two colours writes two groups, and two elements may not
  // share an id. The name a reader cares about is on data-layer either way.
  const seenSlug = new Map();
  for (const { li, paths: group } of byLayer.values()) {
    const layer = (doc.layers && doc.layers[li]) || { name: String(li), colour: '#000000' };
    // A shape that arrived FILLED AND UNSTROKED must not gain an outline. On a
    // laser that outline is not decoration, it is a cut line nobody drew: the
    // shape gets cut out of the sheet instead of engraved into it, and the part
    // falls on the floor. So the layer colour is a fallback only for a path that
    // has no fill either - a line whose own colour we simply do not know.
    const inkStroke = usableColour(group[0].stroke);
    const inkFill = usableColour(group[0].fill);
    const stroke = inkStroke || (inkFill ? null : (layer.colour || '#000000'));
    const base = String(layer.name).replace(/[^A-Za-z0-9_-]+/g, '-') || 'layer';
    const n = (seenSlug.get(base) || 0) + 1;
    seenSlug.set(base, n);
    const slug = n === 1 ? base : `${base}-${n}`;
    // One <path> per colour per layer rather than per entity. The owner's R12
    // drawing is 557 entities and 0.6 MB of path data, and both previews put it
    // in the DOM at once.
    const dd = group.map(d).join(' ');
    // stroke-width is only meaningful when there IS a stroke; writing one
    // alongside stroke="none" is noise that some readers act on anyway.
    const strokeAttrs = stroke
      ? `stroke="${stroke}" stroke-width="${fmt(o.strokeWidth)}" `
        + 'stroke-linecap="round" stroke-linejoin="round"'
      : 'stroke="none"';
    out.push(`<g id="layer-${slug}" data-layer="${esc(layer.name)}" `
      + `fill="${inkFill || 'none'}" ${strokeAttrs}><path d="${dd}"/></g>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// PDF

/**
 * Minimal single-page PDF, written by hand rather than pulled from a library:
 * a page of paths needs five objects and a content stream, and the byte offsets
 * in the cross-reference table have to be exact or readers reject it.
 *
 * PDF is y-up like our internal drawing, so nothing flips here.
 */
export function toPdf(doc, opts = {}) {
  const o = {
    title: 'Converted drawing', strokeWidth: 0.1, translate: false, unitNote: null, ...opts,
  };
  const b = bounds(doc);
  const dx = o.translate ? -b.x0 : 0;
  const dy = o.translate ? -b.y0 : 0;
  const P = (v) => fmt(v * MM_TO_PT);

  const ops = [`${fmt(o.strokeWidth * MM_TO_PT)} w`, '1 J', '1 j'];
  let curStroke = null;
  let curFill = null;
  for (const p of doc.paths) {
    if (!p.segs.length) continue;
    const layer = (doc.layers && doc.layers[p.layer]) || null;
    // Same rule as the SVG writer above: a filled, unstroked shape keeps no
    // outline, because an invented outline is an invented cut.
    const fill = usableColour(p.fill);
    const inkStroke = usableColour(p.stroke);
    const stroke = inkStroke || (fill ? null : ((layer && layer.colour) || '#000000'));
    if (stroke && stroke !== curStroke) {
      ops.push(`${rgbOps(stroke)} RG`);
      curStroke = stroke;
    }
    if (fill && fill !== curFill) {
      ops.push(`${rgbOps(fill)} rg`);
      curFill = fill;
    }
    ops.push(`${P(p.start[0] + dx)} ${P(p.start[1] + dy)} m`);
    for (const s of p.segs) {
      if (s[0] === 'C') {
        ops.push(`${P(s[1] + dx)} ${P(s[2] + dy)} ${P(s[3] + dx)} ${P(s[4] + dy)} `
          + `${P(s[5] + dx)} ${P(s[6] + dy)} c`);
      } else {
        ops.push(`${P(s[1] + dx)} ${P(s[2] + dy)} l`);
      }
    }
    if (p.closed) ops.push('h');
    // B fills AND strokes, S strokes only, f fills only. A filled shape that
    // carried no stroke of its own has to take f - B would paint the same
    // phantom outline the SVG writer used to.
    ops.push(stroke ? (fill ? 'B' : 'S') : 'f');
  }
  const stream = ops.join('\n');

  const x0 = (b.x0 + dx) * MM_TO_PT;
  const y0 = (b.y0 + dy) * MM_TO_PT;
  const x1 = (b.x1 + dx) * MM_TO_PT;
  const y1 = (b.y1 + dy) * MM_TO_PT;

  const subject = o.unitNote ? ` /Subject (${pdfString(o.unitNote)})` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [${fmt(x0)} ${fmt(y0)} ${fmt(x1)} `
    + `${fmt(y1)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< /Title (${pdfString(o.title)}) /Creator (SifuLaser Converter File)${subject} >>`,
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

/** "#ff0000" as PDF's three 0-1 components. */
function rgbOps(css) {
  const s = String(css).trim();
  let r = 0; let g = 0; let bl = 0;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    [r, g, bl] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  } else {
    const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (m) [r, g, bl] = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  }
  return `${fmt(r)} ${fmt(g)} ${fmt(bl)}`;
}

/**
 * Non-ASCII is stripped, not escaped.
 *
 * The whole PDF is returned as a JavaScript string and the caller wraps it in a
 * Blob, which encodes it as UTF-8. A single non-ASCII character in the title
 * would then be two or three bytes where byteLength() counted one - every xref
 * offset after it would be short, and readers reject the file. A Malay filename
 * with an em dash in it is not a hypothetical.
 */
function pdfString(s) {
  return String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^ -~]/g, '');
}

export { MM_TO_PT, fmt };
