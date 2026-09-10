// The one shape every reader produces and every writer consumes.
//
//   Doc   = { paths, layers, unit, warnings, source }
//   Layer = { name, colour }                       colour is '#rrggbb'
//   Path  = { start, segs, closed, layer, stroke, fill }
//   Seg   = ['L', x, y]
//         | ['C', x1, y1, x2, y2, x, y]
//
// Two kinds of segment and no more. Arcs, ellipses, quadratics, DXF bulges and
// B-spline spans are all converted to 'C' on the way in by geom/bezier.js, so
// nothing below this line has to know they existed.
//
// Coordinates are MILLIMETRES, Y UP, ABSOLUTE. That is decided once, by the
// importer, and never revisited: no function in this file or below it takes a
// unit argument or multiplies by a scale. DXF is natively y-up so it needs no
// flip; SVG is y-down and flips in exactly two places, the SVG reader and the
// SVG writer, which is what makes SVG -> Doc -> SVG give back the same numbers.
//
// `closed` is a field and not a guess. The Adjuster infers it - anything with
// area gets a Z - and that is fine for a tool that only ever emits cut
// templates. It is not fine here: 39 of the 557 polylines in the owner's own
// R12 file carry no closed flag and are therefore open, 30 of them dimension
// leaders. Closing them would ask the laser for 39 cuts nobody wanted, and the
// preview would look perfect. Closure is never inferred from "the last point
// equals the first" either - a closed square and an open path that happens to
// return to its start are different instructions to a machine.

import { boundsOf } from './geom/rings.js';
import { cubicExtrema, flattenCubic } from './geom/bezier.js';

export function makeDoc({
  paths = [], layers = [], unit = null, warnings = [], source = {},
} = {}) {
  return { paths, layers, unit, warnings, source };
}

export const makePath = ({
  start, segs = [], closed = false, layer = 0, stroke = null, fill = null,
}) => ({ start, segs, closed, layer, stroke, fill });

/** The last point a segment lands on. */
export const segEnd = (seg) => (seg[0] === 'C' ? [seg[5], seg[6]] : [seg[1], seg[2]]);

/** How many points a path would have if you flattened it - the "Objek" count's cousin. */
export function pathPointCount(path) {
  return 1 + path.segs.length;
}

/**
 * The drawing's true extents.
 *
 * Analytic, because both cheap answers are wrong and they are wrong in opposite
 * directions. The box around a spline's control points contains the curve, so
 * it overstates; the box around a bulged polyline's vertices misses the arc
 * bulging outside the chord, so it understates. Solving for where each cubic
 * turns around costs nothing and is exact.
 *
 * This is also why the DXF reader ignores $EXTMIN/$EXTMAX. In the owner's
 * modern-spline-mm.dxf those are inflated by exactly 0.1 in all four
 * directions - half the 0.20 mm lineweight on thirty of the splines - so
 * reporting the header would overstate that drawing by 0.2 mm on each axis.
 */
export function bounds(doc) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const eat = (p) => {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  };
  for (const path of doc.paths) {
    let cur = path.start;
    eat(cur);
    for (const seg of path.segs) {
      if (seg[0] === 'C') {
        const c = [seg[1], seg[2], seg[3], seg[4], seg[5], seg[6]];
        for (const e of cubicExtrema(cur, c)) eat(e);
        cur = [seg[5], seg[6]];
      } else {
        cur = [seg[1], seg[2]];
      }
      eat(cur);
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * Every path as a point list, in the ring shape the previews and the older
 * export helpers speak: Array<Array<[x, y]>>.
 *
 * Nothing on the output path calls this. All three writers carry the cubics
 * themselves; flatten() is for drawing the previews and for tests that want to
 * measure a curve rather than describe it.
 */
export function flatten(doc, tol = 0.05) {
  const rings = [];
  const meta = [];
  const closed = [];
  for (const path of doc.paths) {
    const pts = [path.start];
    let cur = path.start;
    for (const seg of path.segs) {
      if (seg[0] === 'C') {
        const c = [seg[1], seg[2], seg[3], seg[4], seg[5], seg[6]];
        for (const p of flattenCubic(cur, c, tol)) pts.push(p);
        cur = [seg[5], seg[6]];
      } else {
        cur = [seg[1], seg[2]];
        pts.push(cur);
      }
    }
    rings.push(pts);
    meta.push({ stroke: path.stroke, fill: path.fill, layer: path.layer });
    closed.push(path.closed);
  }
  return { rings, meta, closed };
}

/** Bounds of the flattened drawing - used only to cross-check bounds(). */
export function flatBounds(doc, tol = 0.01) {
  return boundsOf(flatten(doc, tol).rings);
}

/**
 * Multiply every coordinate once, at the seam between "file units" and
 * "millimetres".
 *
 * This is the only place a scale factor is applied in the whole tool. The
 * readers hand back raw file coordinates and say what unit they are in; this
 * turns them into the internal unit; nothing downstream scales anything. The
 * Adjuster keeps the same seam in its store (store.js:96) for the same reason -
 * a second multiply somewhere else is invisible and doubles the drawing.
 */
export function scaleDoc(doc, mmPerUnit) {
  if (!(Number.isFinite(mmPerUnit)) || mmPerUnit === 1) return doc;
  const k = mmPerUnit;
  const paths = doc.paths.map((p) => ({
    ...p,
    start: [p.start[0] * k, p.start[1] * k],
    segs: p.segs.map((s) => (s[0] === 'C'
      ? ['C', s[1] * k, s[2] * k, s[3] * k, s[4] * k, s[5] * k, s[6] * k]
      : ['L', s[1] * k, s[2] * k])),
  }));
  return { ...doc, paths };
}

// ---------------------------------------------------------------------------
// What was lost, counted

/**
 * Two tiers, and the severity is a decision rather than a mood: tier 1 is
 * anything that changes what the user will see or cut, and it is shown loudly,
 * counted, above the download button. Tier 2 is real but cosmetic, and lives in
 * a list the user can open if they care.
 *
 * The counting matters as much as the wording. "Some shapes were dropped" tells
 * nobody anything; "18 rujukan blok (INSERT) tidak dibuka" tells somebody whose
 * drawing is mostly blocks that the nearly-empty result is our fault and not
 * theirs.
 */
export const WARN = {
  svgText: { tier: 1, text: (n) => `${n} teks tidak ditukar - Converter File tidak ada fon. Tukar teks jadi lakaran (outline) di program asal dulu.` },
  svgImage: { tier: 1, text: (n) => `${n} gambar raster digugurkan. Fail vektor tidak boleh bawa gambar.` },
  svgUse: { tier: 1, text: (n) => `${n} bentuk dalam <defs>/<symbol> atau rujukan <use> tidak dibuka - bentuknya tiada dalam hasil.` },
  svgClip: { tier: 1, text: () => 'Fail ini guna clip-path atau mask. Hasil akan tunjuk bentuk penuh yang asalnya tersembunyi.' },
  fillLost: { tier: 1, text: (n) => `Isian (fill) tidak wujud dalam DXF. ${n} bentuk berisi jadi garisan luar sahaja.` },
  dxfInsert: { tier: 1, text: (n) => `${n} rujukan blok (INSERT) tidak dibuka. Kalau lukisan anda kebanyakannya blok, hasil akan hampir kosong.` },
  dxfHatch: { tier: 1, text: (n) => `${n} HATCH digugurkan.` },
  dxfText: { tier: 1, text: (n) => `${n} entiti teks (TEXT/MTEXT) digugurkan.` },
  dxfDim: { tier: 1, text: (n) => `${n} entiti dimensi digugurkan.` },
  dxf3d: { tier: 1, text: (n) => `${n} entiti 3D digugurkan.` },
  dxfOther: { tier: 1, text: (n) => `${n} entiti jenis lain digugurkan.` },
  dxfExtrusion: { tier: 1, text: (n) => `${n} entiti guna paksi extrusion yang kami tak sokong dan dilangkau - bukan diteka.` },
  dxfSplineFlat: { tier: 1, text: (n) => `${n} spline bukan rantai Bezier - dijadikan garisan dalam had 0.02 mm.` },
  dxfZ: { tier: 1, text: () => 'Lukisan ini ada koordinat Z. Semua diratakan ke Z = 0.' },
  dxfPoint: { tier: 1, text: (n) => `${n} entiti POINT diabaikan.` },
  strokeWidth: { tier: 2, text: () => 'Tebal garisan tidak dibawa - DXF keluar tanpa lineweight.' },
  // The SVG and PDF writers put every line out at one hairline width. That is
  // what a laser wants, but it is NOT 'format only' - it is a real change to
  // the file, and the tool says so rather than letting the user find out on
  // the bed.
  strokeHairline: { tier: 2, text: () => 'Semua garisan keluar 0.1 mm (hairline). Tebal garisan asal tidak dibawa.' },
  dashes: { tier: 2, text: () => 'Garisan putus-putus jadi garisan penuh.' },
  gradient: { tier: 2, text: () => 'Gradien jadi warna pertamanya.' },
  opacity: { tier: 2, text: () => 'Kelegapan (opacity) tidak dibawa.' },
  pdfNoLayers: { tier: 2, text: () => 'PDF tidak membawa lapisan - ia untuk tengok dan untuk Illustrator, bukan untuk mesin.' },
};

export function warnBag() {
  const counts = new Map();
  return {
    add(kind, n = 1) {
      if (!WARN[kind]) throw new Error(`unknown warning kind: ${kind}`);
      counts.set(kind, (counts.get(kind) || 0) + n);
    },
    has(kind) { return counts.has(kind); },
    count(kind) { return counts.get(kind) || 0; },
    list() {
      const out = [];
      for (const [kind, n] of counts) {
        if (n <= 0) continue;
        out.push({ kind, tier: WARN[kind].tier, count: n, text: WARN[kind].text(n) });
      }
      return out.sort((a, b) => a.tier - b.tier);
    },
  };
}
