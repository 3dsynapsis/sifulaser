// PDF writer. Same sheets, same nesting, same geometry as the SVG - only the
// file format differs.
//
// Written by hand rather than pulled from a library: a page of polygons needs
// five objects and a content stream, and the only fiddly part is that every
// offset in the cross-reference table is counted in BYTES from the start of the
// file. Get one wrong and a reader rejects the whole document, silently, on
// somebody else's computer.
//
// PDF is y-up, which is how the nester lays a sheet out already, so there is no
// flip here - unlike the SVG, which wraps everything in one.
//
// Unlike the Box Maker's PDF, this one is complete. There is no raster artwork
// in a tag - PNG import was left out of the tool - so the PDF and the SVG carry
// the same drawing and neither has to be described as the lesser of the two.

import { fmt } from './geom/path.js';
import { labelPaths } from './geom/label.js';
import { sheetGeometry, layout } from './exportSvg.js';

const MM_TO_PT = 72 / 25.4;

/** UTF-8 bytes, not characters - /Length and the xref offsets are byte counts. */
export function byteLength(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i);
    if (c > 0xffff) { n += 4; i++; } else if (c > 0x7ff) n += 3;
    else if (c > 0x7f) n += 2;
    else n += 1;
  }
  return n;
}

const pdfString = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`);

/**
 * One sheet as a PDF.
 *
 * `opts.geo` lets a caller that has already collected the geometry hand it in
 * rather than have it built twice.
 */
export function sheetToPdf(sheet, decorFor, opts = {}) {
  const o = {
    title: 'Luggage tag', strokeWidth: 0.1, labels: true, labelSize: 3.4, ...opts,
  };
  const geo = o.geo || sheetGeometry(sheet, decorFor, o);
  const P = (v) => fmt(v * MM_TO_PT);

  const ops = [`${fmt(o.strokeWidth * MM_TO_PT)} w`, '1 J', '1 j'];
  const trace = (ring) => {
    ops.push(`${P(ring[0][0])} ${P(ring[0][1])} m`);
    for (let i = 1; i < ring.length; i++) {
      ops.push(`${P(ring[i][0])} ${P(ring[i][1])} l`);
    }
  };
  const traceFlat = (flat) => {
    ops.push(`${P(flat[0])} ${P(flat[1])} m`);
    for (let k = 2; k < flat.length; k += 2) {
      ops.push(`${P(flat[k])} ${P(flat[k + 1])} l`);
    }
  };
  const flatten = (groups) => groups.flatMap((g) => g).filter((r) => r && r.length > 1);

  // Filled engraving first, so the strokes sit on top of it.
  //
  // Every ring is closed into ONE path and that path is painted ONCE, at the
  // end. `f*` paints and then ENDS the path, so filling ring by ring would leave
  // a counter - the hole in an A, the middle of an O - with nothing to cancel
  // against, and it would come out solid black. That was a real bug in four
  // tools here. Do not move the paint operator inside the loop.
  //
  // Even-odd rather than non-zero, matching the SVG: decor rings are whatever
  // the artwork brought with it, and even-odd makes a ring inside a ring a hole
  // regardless of which way either one is wound.
  const fills = flatten(geo['engrave-fill']).filter((r) => r.length > 2);
  if (fills.length) {
    // Colour before the path is started: a graphics-state operator in the middle
    // of path construction is not legal.
    ops.push('0 0 0 rg');
    for (const ring of fills) { trace(ring); ops.push('h'); }
    ops.push('f*');
  }

  const closed = (rings, colour) => {
    if (!rings.length) return;
    ops.push(colour);
    for (const ring of rings) { trace(ring); ops.push('h S'); }
  };

  // Engraved lines: the border rings are closed, the lettering is not.
  //
  // `h S` closes the path before stroking it. On an open polyline that draws a
  // stroke from the end of the last letter straight back through the whole line,
  // so the two kinds cannot share a loop, and the open ones end with a bare `S`.
  const lines = flatten(geo['engrave-line']);
  if (lines.length || geo.strokes.length) {
    ops.push('0 0 1 RG');
    for (const ring of lines) { trace(ring); ops.push('h S'); }
    for (const flat of geo.strokes) {
      if (!flat || flat.length < 4) continue;
      traceFlat(flat);
      ops.push('S');
    }
  }

  closed(flatten(geo.cut), '1 0 0 RG');

  // The FRONT / BACK marks are open polylines too, for the same reason.
  if (o.labels && geo.labels.length) {
    ops.push('0.604 0.627 0.651 RG');
    for (const l of geo.labels) {
      for (const flat of labelPaths(l.text, l.x, l.y, o.labelSize)) {
        if (flat.length < 4) continue;
        traceFlat(flat);
        ops.push('S');
      }
    }
  }

  const stream = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(geo.w * MM_TO_PT)} `
    + `${fmt(geo.h * MM_TO_PT)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< /Title (${pdfString(o.title)}) /Creator (SifuLaser Tag Generator) >>`,
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
  return `${body}${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R `
    + `/Info ${objects.length} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
}

const slug = (s) => String(s || 'tag').trim().replace(/[^\w-]+/g, '-')
  .replace(/^-+|-+$/g, '').toLowerCase() || 'tag';

/** Full export: one entry per sheet. */
export function exportPdf(tag, decorFor, opts = {}) {
  const sheets = layout(tag, opts);
  const base = slug(opts.name || 'luggage-tag');
  const stamp = `${Math.round(tag.derived.pieceW)}x${Math.round(tag.derived.pieceH)}`;
  return sheets.map((s, i) => {
    const geo = sheetGeometry(s, decorFor, { ...opts, kerf: tag.params.kerf });
    return {
      name: sheets.length > 1
        ? `${base}-${stamp}-sheet${i + 1}.pdf`
        : `${base}-${stamp}.pdf`,
      pdf: sheetToPdf(s, decorFor, {
        ...opts,
        geo,
        title: `Luggage tag ${stamp} mm, front and back, `
          + `${tag.params.thickness} mm board`,
      }),
      sheet: s,
    };
  });
}

