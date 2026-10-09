// Reading a DXF.
//
// Pure: text in, geometry out, no DOM, no units. It returns coordinates in
// whatever unit the file was drawn in and tells the caller what the header said
// that unit was; turning those into millimetres is somebody else's single
// multiply, in doc.js. Keeping the two apart is what lets this whole file be
// tested in node against the owner's real drawings.
//
// A DXF is a flat stream of (code, value) records with three levels of meaning
// laid on top of it - sections, tables, entities - and none of them are
// delimited by anything except the next code 0. Every rule below that looks
// fussy is there because a real file broke the obvious version of it:
//
//   * Nothing terminates an entity. Flush on the next (0, ...) AND on
//     (0, ENDSEC), or the last entity of every section vanishes in silence.
//   * A group code only means something relative to the entity that owns it.
//     Code 42 is a bulge on a VERTEX, a knot tolerance on a SPLINE and a lens
//     length in a VPORT record. Handling it in one shared branch - the natural
//     shape if you write the parser as one switch on the code - reads a
//     spline's 1e-10 knot tolerance as an arc.
//   * An absent code is a documented default, not an error. 39 of the 557
//     polylines in the owner's R12 file carry no code 70 at all, which means
//     open. Defaulting it to closed asks the laser for 39 cuts nobody wanted.
//   * R12 has no CLASSES section and no OBJECTS section. A reader that expects
//     them rejects every R12 file, and R12 is most of what old laser shops
//     still exchange.

import { tokenize, num, int, str } from './tokenize.js';
import { aciToHex } from './aci.js';
import { warnBag, makePath } from '../doc.js';
import {
  arcToCubics, bulgeToCubics, isBezierChain, flattenSpline,
} from '../geom/bezier.js';

const DEG = Math.PI / 180;

// Entities we read. Everything else is counted and reported rather than
// skipped in silence - a customer whose drawing is mostly block references
// deserves to be told why the result is nearly empty.
const UNHANDLED = {
  INSERT: 'dxfInsert',
  HATCH: 'dxfHatch',
  TEXT: 'dxfText', MTEXT: 'dxfText', ATTDEF: 'dxfText', ATTRIB: 'dxfText',
  DIMENSION: 'dxfDim', LEADER: 'dxfDim', TOLERANCE: 'dxfDim', MLEADER: 'dxfDim',
  '3DFACE': 'dxf3d', SOLID: 'dxf3d', MESH: 'dxf3d', BODY: 'dxf3d',
  '3DSOLID': 'dxf3d', REGION: 'dxf3d', SURFACE: 'dxf3d', POLYFACE: 'dxf3d',
};

const firstOf = (pairs, code) => {
  for (const p of pairs) if (p[0] === code) return p[1];
  return undefined;
};
const allOf = (pairs, code) => {
  const out = [];
  for (const p of pairs) if (p[0] === code) out.push(p[1]);
  return out;
};

/**
 * Object Coordinate System.
 *
 * A 2D entity's coordinates are NOT world coordinates - they are in a system
 * whose Z axis is the entity's extrusion vector, codes 210/220/230, defaulting
 * to (0, 0, 1). Both of the owner's fixtures are (0, 0, 1), so neither of them
 * can catch a mistake here; the case that bites is (0, 0, -1), which any
 * mirrored drawing or negatively scaled block produces and which means
 * x_world = -x_ocs. Ignore it and the output is a horizontal mirror of the
 * truth that renders as perfectly valid geometry with no error anywhere.
 *
 * An arbitrary normal needs the Arbitrary Axis Algorithm. There is no file here
 * to test that against, so it is refused out loud rather than half-implemented.
 */
function extrusionOf(pairs) {
  const ez = firstOf(pairs, 230);
  if (ez === undefined && firstOf(pairs, 210) === undefined
      && firstOf(pairs, 220) === undefined) return 1;
  const x = num(firstOf(pairs, 210) ?? 0);
  const y = num(firstOf(pairs, 220) ?? 0);
  const z = num(ez ?? 1);
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) {
    if (z > 0) return 1;
    if (z < 0) return -1;
  }
  return { bad: [x, y, z] };
}

export function dxfParse(text, opts = {}) {
  const records = tokenize(text);
  const warn = opts.warn || warnBag();

  const header = {
    insunits: null, acadver: null, codepage: null, extmin: null, extmax: null,
  };
  const layers = [];
  const layerIndex = new Map();
  const paths = [];
  const stats = {
    entities: Object.create(null), vertices: 0, bulges: 0, splines: 0,
    splinesFlattened: 0, extrusionRefused: 0,
  };
  let sawZ = false;

  const layerFor = (name) => {
    const key = name || '0';
    if (layerIndex.has(key)) return layerIndex.get(key);
    const i = layers.length;
    layers.push({ name: key, colour: '#000000', aci: 7 });
    layerIndex.set(key, i);
    return i;
  };

  let section = null;
  let tableName = null;
  let tableRec = null;
  let headerVar = null;
  let ent = null;
  let openPoly = null;

  // ---- entity emitters ---------------------------------------------------

  const styleOf = (pairs, li) => {
    const raw = firstOf(pairs, 62);
    const layer = layers[li];
    let aci = layer ? layer.aci : 7;
    if (raw !== undefined) {
      const v = int(raw);
      // 256 is BYLAYER and 0 is BYBLOCK; a negative index means the layer is
      // switched off but keeps its colour. None of the three is a colour of its
      // own, so all three fall back to the layer's.
      if (v > 0 && v <= 255) aci = v;
    }
    return { stroke: aciToHex(aci), fill: null };
  };

  const push = (pairs, li, start, segs, closed) => {
    if (!segs.length && !closed) return;
    const st = styleOf(pairs, li);
    paths.push(makePath({
      start, segs, closed, layer: li, stroke: st.stroke, fill: st.fill,
    }));
  };

  /** Vertices with bulges into segments; the closing edge can be an arc too. */
  const runToSegs = (verts, closed) => {
    const segs = [];
    const arcOrLine = (a, b, bulge) => {
      if (bulge) {
        const cs = bulgeToCubics(a, b, bulge);
        if (cs) {
          for (const c of cs) segs.push(['C', c[0], c[1], c[2], c[3], c[4], c[5]]);
          return;
        }
      }
      segs.push(['L', b[0], b[1]]);
    };
    for (let i = 1; i < verts.length; i++) {
      arcOrLine(verts[i - 1].p, verts[i].p, verts[i - 1].bulge);
    }
    // On a closed polyline the LAST vertex's bulge belongs to the edge that
    // runs back to vertex 0. Dropping it turns a rounded corner into a straight
    // chord - up to 1.6 mm out of place in the owner's own R12 file.
    if (closed && verts.length > 1) {
      const last = verts[verts.length - 1];
      if (last.bulge) arcOrLine(last.p, verts[0].p, last.bulge);
    }
    return segs;
  };

  const emitLine = (pairs, li) => {
    const m = extrusionOf(pairs);
    if (typeof m !== 'number') return refuse(m);
    const x1 = num(firstOf(pairs, 10) ?? 0) * m;
    const y1 = num(firstOf(pairs, 20) ?? 0);
    const x2 = num(firstOf(pairs, 11) ?? 0) * m;
    const y2 = num(firstOf(pairs, 21) ?? 0);
    if (num(firstOf(pairs, 30) ?? 0) || num(firstOf(pairs, 31) ?? 0)) sawZ = true;
    push(pairs, li, [x1, y1], [['L', x2, y2]], false);
    return true;
  };

  /** One circular arc, given a start angle and a signed sweep already in WCS. */
  const pushArc = (pairs, li, cx, cy, r, a0, sweep, closed) => {
    const cs = arcToCubics(cx, cy, r, r, 0, a0, sweep);
    push(pairs, li, [cx + r * Math.cos(a0), cy + r * Math.sin(a0)],
      cs.map((c) => ['C', c[0], c[1], c[2], c[3], c[4], c[5]]), closed);
  };

  const emitCircle = (pairs, li) => {
    const m = extrusionOf(pairs);
    if (typeof m !== 'number') return refuse(m);
    const cx = num(firstOf(pairs, 10) ?? 0) * m;
    const cy = num(firstOf(pairs, 20) ?? 0);
    const r = Math.abs(num(firstOf(pairs, 40) ?? 0));
    if (!(r > 0)) return true;
    pushArc(pairs, li, cx, cy, r, 0, Math.PI * 2, true);
    return true;
  };

  const emitArc = (pairs, li) => {
    const m = extrusionOf(pairs);
    if (typeof m !== 'number') return refuse(m);
    const cx = num(firstOf(pairs, 10) ?? 0) * m;
    const cy = num(firstOf(pairs, 20) ?? 0);
    const r = Math.abs(num(firstOf(pairs, 40) ?? 0));
    if (!(r > 0)) return true;
    // An ARC always sweeps counter-clockwise from code 50 to code 51, whatever
    // order the two numbers are in.
    const s0 = num(firstOf(pairs, 50) ?? 0) * DEG;
    const s1 = num(firstOf(pairs, 51) ?? 0) * DEG;
    let sweep = ((s1 - s0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (sweep < 1e-12) sweep = Math.PI * 2; // equal angles mean the whole circle
    let a0 = s0;
    // A mirrored OCS reflects the arc in x, which turns every angle into its
    // supplement and turns counter-clockwise into clockwise.
    if (m < 0) { a0 = Math.PI - s0; sweep = -sweep; }
    pushArc(pairs, li, cx, cy, r, a0, sweep, false);
    return true;
  };

  const emitEllipse = (pairs, li) => {
    const m = extrusionOf(pairs);
    if (typeof m !== 'number') return refuse(m);
    const cx = num(firstOf(pairs, 10) ?? 0) * m;
    const cy = num(firstOf(pairs, 20) ?? 0);
    // 11/21 is the major axis ENDPOINT relative to the centre, not a point.
    const mx = num(firstOf(pairs, 11) ?? 0) * m;
    const my = num(firstOf(pairs, 21) ?? 0);
    const rx = Math.hypot(mx, my);
    if (!(rx > 0)) return true;
    const ry = rx * Math.abs(num(firstOf(pairs, 40) ?? 1));
    const rot = Math.atan2(my, mx);
    // On an ELLIPSE, 41 and 42 are the start and end PARAMETER in radians -
    // 42 here is nothing to do with a bulge.
    let p0 = num(firstOf(pairs, 41) ?? 0);
    const p1 = num(firstOf(pairs, 42) ?? Math.PI * 2);
    let sweep = p1 - p0;
    if (Math.abs(sweep) < 1e-12) sweep = Math.PI * 2;
    // The mirror is already in `rot` (the major axis endpoint was flipped), so
    // all that is left is to run the parameter the other way.
    if (m < 0) { p0 = -p0; sweep = -sweep; }
    const closed = Math.abs(Math.abs(sweep) - Math.PI * 2) < 1e-9;
    const cs = arcToCubics(cx, cy, rx, ry, rot, p0, sweep);
    const s0 = [
      cx + rx * Math.cos(p0) * Math.cos(rot) - ry * Math.sin(p0) * Math.sin(rot),
      cy + rx * Math.cos(p0) * Math.sin(rot) + ry * Math.sin(p0) * Math.cos(rot),
    ];
    push(pairs, li, s0,
      cs.map((c) => ['C', c[0], c[1], c[2], c[3], c[4], c[5]]), closed);
    return true;
  };

  const emitLwPolyline = (pairs, li) => {
    const m = extrusionOf(pairs);
    if (typeof m !== 'number') return refuse(m);
    const flags = int(firstOf(pairs, 70) ?? 0);
    const verts = [];
    let cur = null;
    for (const [code, raw] of pairs) {
      if (code === 10) {
        cur = { p: [num(raw) * m, 0], bulge: 0 };
        verts.push(cur);
      } else if (code === 20 && cur) {
        cur.p[1] = num(raw);
      } else if (code === 42 && cur) {
        cur.bulge = num(raw);
        if (cur.bulge) stats.bulges++;
      }
    }
    if (verts.length < 2) return true;
    const closed = (flags & 1) === 1;
    stats.vertices += verts.length;
    push(pairs, li, verts[0].p, runToSegs(verts, closed), closed);
    return true;
  };

  const emitPolyline = (head, vertexEnts) => {
    const pairs = head.pairs;
    const li = layerFor(str(firstOf(pairs, 8) ?? '0'));
    const m = extrusionOf(pairs);
    if (typeof m !== 'number') return refuse(m);
    const flags = int(firstOf(pairs, 70) ?? 0);
    // Bits 8, 16 and 64 say the vertex run is a 3D polyline or a mesh, not a
    // 2D path. All 518 flagged polylines in the owner's file are plain 1, so
    // the fixtures never exercise this - and a mesh drawn as a path is garbage.
    if (flags & (8 | 16 | 64)) {
      warn.add('dxf3d');
      return true;
    }
    const verts = [];
    for (const v of vertexEnts) {
      const vf = int(firstOf(v.pairs, 70) ?? 0);
      // Bit 16 is a spline FRAME control point: it is not on the curve and must
      // not be drawn as one. Neither fixture has any, but AutoCAD writes them.
      if (vf & 16) continue;
      const x = num(firstOf(v.pairs, 10) ?? 0) * m;
      const y = num(firstOf(v.pairs, 20) ?? 0);
      if (num(firstOf(v.pairs, 30) ?? 0)) sawZ = true;
      const b = num(firstOf(v.pairs, 42) ?? 0);
      if (b) stats.bulges++;
      verts.push({ p: [x, y], bulge: b });
    }
    stats.vertices += verts.length;
    if (verts.length < 2) return true;
    const closed = (flags & 1) === 1;
    // NOTE: the POLYLINE header's own 10/20 are dummy zeros in every file that
    // writes them - verified zero across all 557 in the owner's R12 drawing -
    // and only code 30 (elevation) carries anything. Seeding the path with them
    // would put a spurious vertex at the origin in front of every single path:
    // 557 long straight lines radiating out of (0, 0) that draw fine and cut
    // catastrophically.
    push(pairs, li, verts[0].p, runToSegs(verts, closed), closed);
    return true;
  };

  const emitSpline = (pairs, li) => {
    const m = extrusionOf(pairs);
    if (typeof m !== 'number') return refuse(m);
    stats.splines++;
    const flags = int(firstOf(pairs, 70) ?? 0);
    const degree = int(firstOf(pairs, 71) ?? 3);
    const closed = (flags & 1) === 1;
    const ctrl = [];
    const fit = [];
    let cur = null;
    let curFit = null;
    for (const [code, raw] of pairs) {
      if (code === 10) {
        cur = [num(raw) * m, 0];
        ctrl.push(cur);
      } else if (code === 20 && cur) {
        cur[1] = num(raw);
      } else if (code === 30 && cur) {
        if (num(raw)) sawZ = true;
      } else if (code === 11) {
        curFit = [num(raw) * m, 0];
        fit.push(curFit);
      } else if (code === 21 && curFit) {
        curFit[1] = num(raw);
      }
    }
    const knots = allOf(pairs, 40).map(num);
    const weights = allOf(pairs, 41).map(num);
    if (ctrl.length === 0) {
      // Fit points only. They are on the curve, so joining them is honest, but
      // it is a polyline where a curve was meant and it gets counted as such.
      if (fit.length < 2) return true;
      stats.splinesFlattened++;
      warn.add('dxfSplineFlat');
      push(pairs, li, fit[0], fit.slice(1).map((p) => ['L', p[0], p[1]]), closed);
      return true;
    }
    if (isBezierChain(degree, knots, ctrl.length)) {
      // The control points ARE the bezier control points. Nothing is evaluated,
      // nothing is sampled, and the numbers written back out are the numbers
      // that were read in.
      const segs = [];
      for (let i = 0; i + 3 < ctrl.length; i += 3) {
        segs.push(['C', ctrl[i + 1][0], ctrl[i + 1][1],
          ctrl[i + 2][0], ctrl[i + 2][1], ctrl[i + 3][0], ctrl[i + 3][1]]);
      }
      push(pairs, li, ctrl[0], segs, closed);
      return true;
    }
    // A genuinely smooth NURBS from some other program. This is the one place
    // in the tool where the output really does differ from the input, so the
    // tolerance is stated and the user is told.
    stats.splinesFlattened++;
    warn.add('dxfSplineFlat');
    const tol = opts.splineTolerance ?? 0.02;
    const pts = flattenSpline(degree, knots, ctrl, weights, tol);
    if (pts.length < 2) return true;
    push(pairs, li, pts[0], pts.slice(1).map((p) => ['L', p[0], p[1]]), closed);
    return true;
  };

  function refuse(bad) {
    stats.extrusionRefused++;
    warn.add('dxfExtrusion');
    if (opts.onRefuse) opts.onRefuse(bad.bad);
    return true;
  }

  // ---- the walk ----------------------------------------------------------

  const closePoly = () => {
    if (!openPoly) return;
    const p = openPoly;
    openPoly = null;
    emitPolyline(p.head, p.vertices);
  };

  const emit = (e) => {
    const pairs = e.pairs;
    const li = layerFor(str(firstOf(pairs, 8) ?? '0'));
    switch (e.type) {
      case 'LINE': emitLine(pairs, li); break;
      case 'CIRCLE': emitCircle(pairs, li); break;
      case 'ARC': emitArc(pairs, li); break;
      case 'ELLIPSE': emitEllipse(pairs, li); break;
      case 'LWPOLYLINE': emitLwPolyline(pairs, li); break;
      case 'SPLINE': emitSpline(pairs, li); break;
      case 'POINT': warn.add('dxfPoint'); break;
      default: {
        const kind = UNHANDLED[e.type] || 'dxfOther';
        warn.add(kind);
        break;
      }
    }
  };

  const flushEntity = () => {
    if (!ent) return;
    const e = ent;
    ent = null;
    stats.entities[e.type] = (stats.entities[e.type] || 0) + 1;
    if (e.type === 'VERTEX') {
      if (openPoly) openPoly.vertices.push(e);
      return;
    }
    if (e.type === 'SEQEND') { closePoly(); return; }
    if (e.type === 'POLYLINE') {
      // A third-party or truncated file may omit SEQEND. All 557 runs in the
      // owner's file have theirs, which is exactly why assuming it is present
      // passes the fixture and fails in the field.
      closePoly();
      openPoly = { head: e, vertices: [] };
      return;
    }
    closePoly();
    emit(e);
  };

  for (let i = 0; i < records.length; i++) {
    const [code, raw] = records[i];

    if (code === 0) {
      const v = str(raw);
      if (section === 'ENTITIES') {
        if (v === 'ENDSEC') {
          flushEntity();
          closePoly();
          section = null;
          continue;
        }
        flushEntity();
        ent = { type: v, pairs: [] };
        continue;
      }
      if (v === 'SECTION') { section = 'PENDING'; continue; }
      if (v === 'ENDSEC') { section = null; tableName = null; tableRec = null; continue; }
      if (section === 'TABLES') {
        if (v === 'TABLE') { tableName = null; tableRec = null; continue; }
        if (v === 'ENDTAB') { flushTableRec(); tableName = null; continue; }
        flushTableRec();
        tableRec = tableName === 'LAYER' && v === 'LAYER' ? { pairs: [] } : null;
        continue;
      }
      continue;
    }

    if (section === 'PENDING') {
      if (code === 2) section = str(raw);
      continue;
    }

    if (section === 'HEADER') {
      if (code === 9) { headerVar = str(raw); continue; }
      if (!headerVar) continue;
      if (headerVar === '$INSUNITS' && code === 70) header.insunits = int(raw);
      else if (headerVar === '$ACADVER' && code === 1) header.acadver = str(raw);
      else if (headerVar === '$DWGCODEPAGE' && code === 3) header.codepage = str(raw);
      else if (headerVar === '$EXTMIN' || headerVar === '$EXTMAX') {
        const key = headerVar === '$EXTMIN' ? 'extmin' : 'extmax';
        if (code === 10) header[key] = [num(raw), 0];
        else if (code === 20 && header[key]) header[key][1] = num(raw);
      }
      // $MEASUREMENT is deliberately not read. The owner's own
      // modern-spline-mm.dxf sets it to 0 (English) three lines above
      // $INSUNITS = 4 (millimetres), in a file that really is in millimetres.
      // It selects a linetype and hatch pattern file; it is not a unit.
      continue;
    }

    if (section === 'TABLES') {
      if (tableName === null && code === 2 && !tableRec) { tableName = str(raw); continue; }
      if (tableRec) tableRec.pairs.push([code, raw]);
      continue;
    }

    if (section === 'ENTITIES' && ent) ent.pairs.push([code, raw]);
  }
  flushEntity();
  closePoly();

  function flushTableRec() {
    if (!tableRec) return;
    const p = tableRec.pairs;
    tableRec = null;
    const name = str(firstOf(p, 2) ?? '');
    if (!name) return;
    const aci = Math.abs(int(firstOf(p, 62) ?? 7)) || 7;
    const i = layerFor(name);
    layers[i].aci = aci;
    layers[i].colour = aciToHex(aci);
  }

  if (sawZ) warn.add('dxfZ');

  return {
    paths, layers, header, stats, warnings: warn.list(), warn,
  };
}
