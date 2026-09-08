// Writing a DXF.
//
// TARGET VERSION: AC1015, which is R2000. That is a real trade-off and it is
// worth stating rather than burying.
//
// R12 (AC1009) is read by more programs than any other DXF version, and it is
// what the owner's own second fixture is. But R12 has no $INSUNITS - the
// variable did not exist yet - and no LWPOLYLINE. Writing R12 would mean
// handing the receiving program a file it has to guess the size of, which is
// exactly the failure that fixture demonstrates and exactly the thing this tool
// exists to refuse. Reproducing it in our own output would be indefensible.
//
// R2000 has $INSUNITS and LWPOLYLINE and is read by LightBurn, AutoCAD, Fusion,
// Inkscape, QCAD and every current laser front-end.
//
// UNITS ARE DECLARED TWICE, ON PURPOSE. Coordinates go out in millimetres AND
// $INSUNITS is set to 4. Both, not either. A program that honours $INSUNITS
// scales correctly; a program that ignores it and assumes millimetres - which
// is LightBurn's common default - also lands correctly, because the numbers
// already are millimetres. Any other unit choice makes those two populations
// disagree about the size of the same file.
//
// NOT YET VERIFIED: nobody has opened a file this writer produced in LightBurn
// or in AutoCAD, because there is no copy of either in this environment.
// Everything here follows the format specification and the structure of the two
// real files we can read. Until somebody imports one of these and confirms its
// size and orientation, no comment, README line or UI string in this project may
// claim compatibility with either program.

import { bounds } from '../doc.js';
import { cssToAci } from './aci.js';

const NL = String.fromCharCode(13, 10);

const f3 = (v) => {
  // Three decimal places is one micrometre. It is invisible on any machine and
  // it takes about a quarter off the file size, which matters when a drawing
  // carries forty thousand points.
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0.0' : (Number.isInteger(r) ? `${r}.0` : String(r));
};

const ffloat = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** A group code and its value, as the two lines DXF wants. */
const rec = (code, value) => `${String(code).padStart(3, ' ')}${NL}${value}${NL}`;

class Handles {
  constructor() { this.next = 0x100; }

  take() { return (this.next++).toString(16).toUpperCase(); }

  seed() { return this.next.toString(16).toUpperCase(); }
}

/** Every point a path passes through, when the path is all straight lines. */
function pathPoints(path) {
  const pts = [path.start];
  for (const s of path.segs) pts.push([s[1], s[2]]);
  if (path.closed && pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) pts.pop();
  }
  return pts;
}

/**
 * A path's control points as one clamped cubic B-spline.
 *
 * Straight segments are promoted to degenerate cubics - both handles sitting on
 * their own endpoints - so that a path which mixes lines and curves comes out
 * as a single entity rather than a broken run of them. That is not a trick: it
 * is exactly what the owner's modern-spline-mm.dxf already contains, where
 * 3,363 of its 3,966 bezier spans are straight lines encoded this way by
 * whatever CAD tool wrote it.
 */
function splineControls(path) {
  const cp = [path.start];
  let cur = path.start;
  for (const s of path.segs) {
    if (s[0] === 'C') {
      cp.push([s[1], s[2]], [s[3], s[4]], [s[5], s[6]]);
      cur = [s[5], s[6]];
    } else {
      const end = [s[1], s[2]];
      cp.push(cur, end, end);
      cur = end;
    }
  }
  if (path.closed) {
    const a = cp[0];
    const b = cp[cp.length - 1];
    if (Math.abs(a[0] - b[0]) > 1e-9 || Math.abs(a[1] - b[1]) > 1e-9) {
      cp.push(b, a, a);
    }
  }
  return cp;
}

/**
 * The knot vector for a bezier chain: clamped at both ends, every interior knot
 * repeated exactly three times.
 *
 * Interior multiplicity 3 in a cubic is what makes the curve pass through every
 * fourth control point, which is what makes this spline the same object as the
 * chain of cubics it came from. Write a plain uniform clamped knot vector
 * instead - multiplicity 1 - and the file is still a legal spline, still opens,
 * and no longer goes anywhere near the points it was built from.
 */
function bezierKnots(nCtrl) {
  const spans = (nCtrl - 1) / 3;
  const k = [0, 0, 0, 0];
  for (let i = 1; i < spans; i++) {
    const v = i / spans;
    k.push(v, v, v);
  }
  k.push(1, 1, 1, 1);
  return k;
}

export function toDxf(doc, opts = {}) {
  const o = {
    creator: 'SifuLaser Converter File',
    unitNote: null, // one English sentence when the unit was the user's answer
    ...opts,
  };
  const b = bounds(doc);
  const h = new Handles();
  let out = '';

  // 999 is the comment code. Every reader skips it, and it is the only place in
  // the file where a sentence about provenance can survive being emailed on.
  out += rec(999, `${o.creator} - coordinates are millimetres, $INSUNITS = 4.`);
  if (o.unitNote) out += rec(999, o.unitNote);
  out += rec(999, 'Not yet verified in LightBurn or AutoCAD - check the size after import.');

  // ---- HEADER ------------------------------------------------------------
  out += rec(0, 'SECTION') + rec(2, 'HEADER');
  out += rec(9, '$ACADVER') + rec(1, 'AC1015');
  out += rec(9, '$INSUNITS') + rec(70, '     4');
  out += rec(9, '$LUNITS') + rec(70, '     2');
  // $MEASUREMENT chooses the linetype and hatch pattern file, NOT the drawing
  // unit. It is written for consistency and it is $INSUNITS above that says how
  // big this drawing is.
  out += rec(9, '$MEASUREMENT') + rec(70, '     1');
  out += rec(9, '$EXTMIN') + rec(10, f3(b.x0)) + rec(20, f3(b.y0)) + rec(30, '0.0');
  out += rec(9, '$EXTMAX') + rec(10, f3(b.x1)) + rec(20, f3(b.y1)) + rec(30, '0.0');
  const handseedAt = out.length;
  out += rec(9, '$HANDSEED') + rec(5, 'FFFF'); // patched at the end
  out += rec(0, 'ENDSEC');

  // ---- TABLES ------------------------------------------------------------
  // AutoCAD's DXFIN is stricter than most third-party readers, and both of the
  // owner's files carry all of these, so we do too. An empty table is still a
  // table; leaving one out is the classic reason a hand-written file is read
  // happily by a laser front-end and rejected by AutoCAD.
  out += rec(0, 'SECTION') + rec(2, 'TABLES');

  const emptyTable = (name) => rec(0, 'TABLE') + rec(2, name) + rec(5, h.take())
    + rec(100, 'AcDbSymbolTable') + rec(70, '     0') + rec(0, 'ENDTAB');

  out += emptyTable('VPORT');

  const ltypeH = h.take();
  out += rec(0, 'TABLE') + rec(2, 'LTYPE') + rec(5, ltypeH)
    + rec(100, 'AcDbSymbolTable') + rec(70, '     1');
  out += rec(0, 'LTYPE') + rec(5, h.take()) + rec(330, ltypeH)
    + rec(100, 'AcDbSymbolTableRecord') + rec(100, 'AcDbLinetypeTableRecord')
    + rec(2, 'CONTINUOUS') + rec(70, '     0') + rec(3, 'Solid line')
    + rec(72, '    65') + rec(73, '     0') + rec(40, '0.0');
  out += rec(0, 'ENDTAB');

  // Layer 0 always exists, and then the drawing's own. Losing layer names is
  // not cosmetic: LightBurn maps a DXF layer to a cut setting, so a drawing that
  // arrives as one layer is a drawing whose every setting must be reassigned by
  // hand.
  const docLayers = (doc.layers && doc.layers.length ? doc.layers : [{ name: '0', colour: '#000000' }])
    .filter((l) => l && l.name);
  const named = new Map();
  for (const l of docLayers) if (!named.has(l.name)) named.set(l.name, l);
  if (!named.has('0')) named.set('0', { name: '0', colour: '#000000' });
  const layerList = [...named.values()];

  const layerH = h.take();
  out += rec(0, 'TABLE') + rec(2, 'LAYER') + rec(5, layerH)
    + rec(100, 'AcDbSymbolTable') + rec(70, String(layerList.length).padStart(6, ' '));
  for (const l of layerList) {
    const aci = l.name === '0' ? 7 : (l.aci || cssToAci(l.colour));
    out += rec(0, 'LAYER') + rec(5, h.take()) + rec(330, layerH)
      + rec(100, 'AcDbSymbolTableRecord') + rec(100, 'AcDbLayerTableRecord')
      + rec(2, l.name) + rec(70, '     0')
      + rec(62, String(aci).padStart(6, ' ')) + rec(6, 'CONTINUOUS');
  }
  out += rec(0, 'ENDTAB');

  const styleH = h.take();
  out += rec(0, 'TABLE') + rec(2, 'STYLE') + rec(5, styleH)
    + rec(100, 'AcDbSymbolTable') + rec(70, '     1');
  out += rec(0, 'STYLE') + rec(5, h.take()) + rec(330, styleH)
    + rec(100, 'AcDbSymbolTableRecord') + rec(100, 'AcDbTextStyleTableRecord')
    + rec(2, 'STANDARD') + rec(70, '     0') + rec(40, '0.0') + rec(41, '1.0')
    + rec(50, '0.0') + rec(71, '     0') + rec(42, '2.5') + rec(3, 'txt') + rec(4, '');
  out += rec(0, 'ENDTAB');

  out += emptyTable('VIEW');
  out += emptyTable('UCS');

  const appidH = h.take();
  out += rec(0, 'TABLE') + rec(2, 'APPID') + rec(5, appidH)
    + rec(100, 'AcDbSymbolTable') + rec(70, '     1');
  out += rec(0, 'APPID') + rec(5, h.take()) + rec(330, appidH)
    + rec(100, 'AcDbSymbolTableRecord') + rec(100, 'AcDbRegAppTableRecord')
    + rec(2, 'ACAD') + rec(70, '     0');
  out += rec(0, 'ENDTAB');

  out += emptyTable('DIMSTYLE');

  const brH = h.take();
  const modelRecH = h.take();
  const paperRecH = h.take();
  out += rec(0, 'TABLE') + rec(2, 'BLOCK_RECORD') + rec(5, brH)
    + rec(100, 'AcDbSymbolTable') + rec(70, '     2');
  for (const [name, hh] of [['*Model_Space', modelRecH], ['*Paper_Space', paperRecH]]) {
    out += rec(0, 'BLOCK_RECORD') + rec(5, hh) + rec(330, brH)
      + rec(100, 'AcDbSymbolTableRecord') + rec(100, 'AcDbBlockTableRecord')
      + rec(2, name) + rec(70, '     0');
  }
  out += rec(0, 'ENDTAB');
  out += rec(0, 'ENDSEC');

  // ---- BLOCKS ------------------------------------------------------------
  // Both placeholders, holding nothing. Both fixtures do exactly this, and a
  // file without them is rejected by readers that go looking for model space.
  out += rec(0, 'SECTION') + rec(2, 'BLOCKS');
  for (const [name, ownerH] of [['*Model_Space', modelRecH], ['*Paper_Space', paperRecH]]) {
    out += rec(0, 'BLOCK') + rec(5, h.take()) + rec(330, ownerH)
      + rec(100, 'AcDbEntity') + rec(8, '0') + rec(100, 'AcDbBlockBegin')
      + rec(2, name) + rec(70, '     0')
      + rec(10, '0.0') + rec(20, '0.0') + rec(30, '0.0')
      + rec(3, name) + rec(1, '');
    out += rec(0, 'ENDBLK') + rec(5, h.take()) + rec(330, ownerH)
      + rec(100, 'AcDbEntity') + rec(8, '0') + rec(100, 'AcDbBlockEnd');
  }
  out += rec(0, 'ENDSEC');

  // ---- ENTITIES ----------------------------------------------------------
  out += rec(0, 'SECTION') + rec(2, 'ENTITIES');
  const layerName = (i) => {
    const l = doc.layers && doc.layers[i];
    return l && l.name ? l.name : '0';
  };
  for (const path of doc.paths) {
    if (!path.segs.length) continue;
    const lname = layerName(path.layer);
    const aci = path.stroke ? cssToAci(path.stroke) : 256;
    const head = rec(5, h.take()) + rec(330, modelRecH) + rec(100, 'AcDbEntity')
      + rec(8, lname) + rec(62, String(aci).padStart(6, ' '));
    const curved = path.segs.some((s) => s[0] === 'C');
    if (!curved) {
      // One LWPOLYLINE per path instead of a POLYLINE plus a VERTEX per point
      // plus a SEQEND: the owner's R12 file spends 39,601 entities on what this
      // says in 557. LightBurn also treats a closed LWPOLYLINE as one closed
      // shape, which is what decides whether it fills or cuts.
      const pts = pathPoints(path);
      out += rec(0, 'LWPOLYLINE') + head + rec(100, 'AcDbPolyline')
        + rec(90, String(pts.length).padStart(9, ' '))
        + rec(70, path.closed ? '     1' : '     0');
      for (const p of pts) out += rec(10, f3(p[0])) + rec(20, f3(p[1]));
    } else {
      const cp = splineControls(path);
      const knots = bezierKnots(cp.length);
      out += rec(0, 'SPLINE') + head + rec(100, 'AcDbSpline')
        + rec(70, String(8 | (path.closed ? 1 : 0)).padStart(6, ' '))
        + rec(71, '     3')
        + rec(72, String(knots.length).padStart(6, ' '))
        + rec(73, String(cp.length).padStart(6, ' '))
        + rec(74, '     0');
      for (const k of knots) out += rec(40, ffloat(k));
      for (const p of cp) out += rec(10, f3(p[0])) + rec(20, f3(p[1])) + rec(30, '0.0');
    }
  }
  out += rec(0, 'ENDSEC');
  out += rec(0, 'EOF');

  // $HANDSEED has to sit above every handle written, and the handles are only
  // all known once the entities are out.
  const seed = h.seed();
  return out.slice(0, handseedAt)
    + rec(9, '$HANDSEED') + rec(5, seed)
    + out.slice(handseedAt + (rec(9, '$HANDSEED') + rec(5, 'FFFF')).length);
}
