// PDF writer. Same sheets, same nesting, same geometry as the SVG - only the
// file format differs.
//
// Written by hand rather than pulled from a library: a page of polygons needs
// five objects and a content stream, and the only fiddly part is that every
// offset in the cross-reference table is counted in bytes from the start of the
// file. Get one wrong and a reader rejects the whole document, silently, on
// somebody else's computer.
//
// Two things this format does not do, which the SVG does:
//
//   - Raster artwork. A PDF image is an XObject with its own encoding, and a PNG
//     cannot be passed through as-is because its per-scanline filters have no
//     equivalent in PDF. Rather than half-embed it, the count is reported so the
//     tool can say so out loud. The laser cuts the vectors either way.
//   - y-down coordinates. PDF is y-up, which is how the nester lays a sheet out
//     already, so there is no flip here - unlike the SVG, which wraps everything
//     in one.

import { fmt } from './geom/path.js';
import { labelPaths } from './geom/label.js';
import { sheetGeometry, nest, SHEETS, DEFAULT_SHEET } from './exportSvg.js';

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
    title: 'Box Maker', strokeWidth: 0.1, labels: false, labelSize: 4, ...opts,
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
  const flatten = (groups) => groups.flatMap((g) => g).filter((r) => r && r.length > 1);

  // Filled engraving first, so the strokes sit on top of it.
  //
  // Every ring is closed into ONE path and that path is painted once at the end.
  // `f*` paints and then ends the path, so filling ring by ring would leave a
  // counter - the hole in an A or an O - with nothing to cancel against, and it
  // would come out solid. Even-odd rather than non-zero, matching the SVG:
  // decor rings are whatever the artwork brought with it, and even-odd makes a
  // ring inside a ring a hole regardless of which way either is wound.
  const fills = flatten(geo['engrave-fill']).filter((r) => r.length > 2);
  if (fills.length) {
    // Colour before the path is started: a graphics-state operator in the middle
    // of path construction is not legal.
    ops.push('0 0 0 rg');
    for (const ring of fills) { trace(ring); ops.push('h'); }
    ops.push('f*');
  }

  const stroked = (rings, colour) => {
    if (!rings.length) return;
    ops.push(colour);
    for (const ring of rings) { trace(ring); ops.push('h S'); }
  };
  stroked(flatten(geo['engrave-line']), '0 0 1 RG');
  stroked(flatten(geo.cut), '1 0 0 RG');

  // Panel labels are open polylines, not closed rings, so they are stroked
  // without being closed - joining the last point back to the first would draw a
  // line straight through every letter.
  if (o.labels && geo.labels.length) {
    ops.push('0.604 0.627 0.651 RG');
    for (const l of geo.labels) {
      for (const flat of labelPaths(l.text, l.x, l.y, o.labelSize)) {
        if (flat.length < 4) continue;
        ops.push(`${P(flat[0])} ${P(flat[1])} m`);
        for (let k = 2; k < flat.length; k += 2) {
          ops.push(`${P(flat[k])} ${P(flat[k + 1])} l`);
        }
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
    `<< /Title (${pdfString(o.title)}) /Creator (SifuLaser Box Maker) >>`,
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

/**
 * Full export: one entry per sheet.
 *
 * `art` is how many pieces of raster artwork this sheet carries that the PDF
 * cannot hold, so the caller can say so rather than let it go missing quietly.
 */
export function exportPdf(box, decorFor, opts = {}) {
  const sheetDef = SHEETS.find((s) => s.id === (opts.sheet || DEFAULT_SHEET)) || SHEETS[0];
  const sheets = nest(box.panels, {
    sheetW: sheetDef.w,
    sheetH: sheetDef.h,
    margin: opts.margin ?? 5,
    gap: opts.gap ?? 4,
  });
  const stamp = `${box.params.length}x${box.params.width}x${box.params.height}`;
  return sheets.map((s, i) => {
    const geo = sheetGeometry(s, decorFor, opts);
    return {
      name: sheets.length > 1 ? `box-${stamp}-sheet${i + 1}.pdf` : `box-${stamp}.pdf`,
      pdf: sheetToPdf(s, decorFor, {
        ...opts, geo, title: `Box ${stamp} t${box.params.thickness}`,
      }),
      sheet: s,
      art: geo.images.length,
    };
  });
}

/** One panel on its own, tight bounds - the PDF twin of exportPanel. */
export function panelToPdf(panel, decor, opts = {}) {
  const m = opts.margin ?? 2;
  const sheet = {
    w: panel.size.w + m * 2,
    h: panel.size.h + m * 2,
    placements: [{ panel, x: m, y: m }],
  };
  return sheetToPdf(sheet, () => decor, opts);
}
