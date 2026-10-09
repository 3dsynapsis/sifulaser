// A DXF as the same drawing shape the PDF reader produces, so layers, pricing
// and the preview do not know which one they got.
//
// The reading itself is the Converter File's reader (src/conv/, copied with its
// tests' blessing - fix a bug in both). It returns file units and says what the
// header claims they are; this file turns them into page points.
//
// Units: $INSUNITS when the file says. R12 and many laser-shop exports say
// nothing, and then millimetres are assumed and the customer is told, because
// the size box lets them correct it in one go.

import { readDxfBytes } from './conv/dxf/tokenize.js';
import { dxfParse } from './conv/dxf/parse.js';
import { flatten } from './conv/doc.js';
import { MM_PER_PT } from './cut.js';

// $INSUNITS code -> millimetres (Converter File units.js).
const INSUNITS_MM = {
  1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 2.54e-5, 9: 0.0254, 10: 914.4,
  13: 0.001, 14: 100, 21: 304.8006096, 22: 25.40005080, 23: 914.4018288,
};
const UNIT_NAME = { 1: 'inci', 2: 'kaki', 4: 'mm', 5: 'cm', 6: 'meter' };

const hexToRgb = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) : [0, 0, 0]);

export function readDxf(bytes) {
  const dec = readDxfBytes(bytes);
  if (dec.error) return { ok: false, error: dec.error };
  let parsed;
  try {
    parsed = dxfParse(dec.text);
  } catch {
    return { ok: false, error: 'corrupt' };
  }
  const code = parsed.header.insunits == null ? null : Number(parsed.header.insunits);
  const mmPerUnit = INSUNITS_MM[code] || 1;
  const warnings = [];
  if (!INSUNITS_MM[code]) warnings.push({ code: 'dxf-units' });
  else if (code !== 4) warnings.push({ code: 'dxf-units-known', unit: UNIT_NAME[code] || `kod ${code}` });
  for (const w of parsed.warnings || []) if (w.tier === 1) warnings.push({ code: 'dxf', text: w.text });

  const k = mmPerUnit / MM_PER_PT;
  const flat = flatten({ paths: parsed.paths }, 0.05 / mmPerUnit);
  const paths = [];
  flat.rings.forEach((ring, i) => {
    if (ring.length < 2) return;
    const pts = [];
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of ring) {
      const X = x * k, Y = y * k;
      pts.push(X, Y);
      if (X < bb[0]) bb[0] = X;
      if (Y < bb[1]) bb[1] = Y;
      if (X > bb[2]) bb[2] = X;
      if (Y > bb[3]) bb[3] = Y;
    }
    const closed = flat.closed[i];
    if (closed && (pts[0] !== pts[pts.length - 2] || pts[1] !== pts[pts.length - 1])) pts.push(pts[0], pts[1]);
    paths.push({
      subs: [{ pts, bb, closed }],
      stroke: true, fill: false, strokeSep: null, fillSep: null,
      strokeRGB: hexToRgb(flat.meta[i].stroke), fillRGB: null, lw: 0,
      dxfLayer: parsed.layers[flat.meta[i].layer]?.name || null,
      oc: [], clip: null,
    });
  });
  return {
    ok: true,
    read: {
      ok: true, pageCount: 1, page: { mediaBox: null, userUnit: 1, rotate: 0, annots: 0 },
      paths, rasters: [], texts: [], textSample: '', images: 0, repaired: false, encrypted: false,
    },
    warnings,
  };
}
