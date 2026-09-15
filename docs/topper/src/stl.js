// STL, for printing the topper instead of cutting it.
//
// The same outline the laser files carry, stood up as a solid 3 mm slab lying
// flat on the bed with the face you read on top - so it prints without support
// and the name is the right way round when you look down at the plate.
//
// Two things differ from the laser files, and both on purpose:
//
// - No kerf. The laser path sits half a beam outside the part because the beam
//   burns that half away. A printer burns nothing, so an STL drawn from the
//   compensated path would come out a whole kerf fatter than the acrylic piece.
//   The topper is rebuilt with kerf 0 instead, which is the finished part: the
//   width in the box is still the width of what comes off the plate.
// - A fixed 3 mm, not the sheet thickness. The sheet picker describes acrylic;
//   what somebody printing wants is a topper that is stiff enough to push into
//   a cake, and that was decided as 3 mm.
//
// three.js is only borrowed for its triangulator, through ExtrudeGeometry. It
// is passed in rather than imported here so the page can load it lazily (it is
// 1.3 MB, and already loaded if the 3D view is open) and so node tests can hand
// it straight in.

import { nestRings } from './geom/path.js';

export const STL_THICKNESS = 3;

// Three passes of a 0.4 mm nozzle. Thinner than that a wall is one or two
// lines of plastic and lets go of its neighbours.
export const PRINT_MIN = 1.2;

// Under this a printed stake bends or snaps going into a firm icing.
export const PRINT_MIN_STAKE = 3;

/** The parameters to build the printed topper from: the same design, no kerf. */
export function stlParams(params) {
  return { ...params, kerf: 0 };
}

/**
 * What will go wrong on the printer, as sentences. Empty when nothing will.
 *
 * `stroke` is a mean - twice the area over the perimeter - so a script face
 * with hairlines can pass here and still have a hairline thinner than the
 * number. It is the measure the tool already has, and it catches the case that
 * matters most: a whole name set too thin.
 */
export function stlWarnings(result) {
  const d = result.derived || {};
  const p = result.params || {};
  const out = [];
  if (d.loose > 0) {
    out.push(`${d.loose} ${d.loose === 1 ? 'piece is' : 'pieces are'} not attached `
      + 'to the topper and will print as separate bits.');
  }
  if (d.stroke > 0 && d.stroke < PRINT_MIN) {
    out.push(`The letters average ${d.stroke.toFixed(1)} mm across. Thinner than about `
      + `${PRINT_MIN} mm a 0.4 mm nozzle prints them too weak to hold - raise Thicken.`);
  }
  // Not the Bridge box on its own: weld() caps it at the stroke, and the
  // distance field then grows the bridges by Thicken on each side along with
  // the letters. A 0.5 mm bridge with 0.5 mm thickening is 1.5 mm of plastic.
  const bridge = Math.max(0, Math.min(p.bridge, Math.max(d.stroke || 0, 1.2)))
    + 2 * Math.max(0, p.thicken || 0);
  if (d.bridges > 0 && bridge < PRINT_MIN) {
    out.push(`Bridges come out ${bridge.toFixed(1)} mm across. Thinner than `
      + `${PRINT_MIN} mm they break off the print - widen Bridge or raise Thicken.`);
  }
  if (p.stakes > 0 && p.stakeWidth < PRINT_MIN_STAKE) {
    out.push(`The stakes are ${p.stakeWidth} mm wide. Under ${PRINT_MIN_STAKE} mm a `
      + 'printed stake snaps going into the cake.');
  }
  return out;
}

const ringToShape = (THREE, ring) => {
  const s = new THREE.Shape();
  s.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) s.lineTo(ring[i][0], ring[i][1]);
  s.closePath();
  return s;
};

/**
 * Every triangle of the printed slab as a flat Float32Array, nine numbers each.
 * z runs from 0 (the bed) to `thickness` (the face).
 */
export function stlTriangles(THREE, panels, thickness = STL_THICKNESS) {
  const parts = [];
  let count = 0;
  for (const panel of panels) {
    const rings = [panel.outline, ...(panel.holes || []), ...(panel.loose || [])];
    const shapes = nestRings(rings).map((s) => {
      const shape = ringToShape(THREE, s.ring);
      for (const hole of s.holes) shape.holes.push(ringToShape(THREE, hole));
      return shape;
    });
    if (!shapes.length) continue;
    const geom = new THREE.ExtrudeGeometry(shapes, {
      depth: thickness, bevelEnabled: false, curveSegments: 1,
    });
    const pos = (geom.index ? geom.toNonIndexed() : geom).getAttribute('position').array;
    parts.push(pos);
    count += pos.length;
    geom.dispose();
  }
  const all = new Float32Array(count);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return all;
}

/** Binary STL: 80-byte header, a triangle count, then 50 bytes a triangle. */
export function trianglesToStl(tris, header = 'SifuLaser cake topper') {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = String(header).slice(0, 80);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const b = t * 9;
    const ax = tris[b + 3] - tris[b];
    const ay = tris[b + 4] - tris[b + 1];
    const az = tris[b + 5] - tris[b + 2];
    const bx = tris[b + 6] - tris[b];
    const by = tris[b + 7] - tris[b + 1];
    const bz = tris[b + 8] - tris[b + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    dv.setFloat32(o, nx, true);
    dv.setFloat32(o + 4, ny, true);
    dv.setFloat32(o + 8, nz, true);
    o += 12;
    for (let k = 0; k < 9; k++) { dv.setFloat32(o, tris[b + k], true); o += 4; }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}

/** The whole STL file for a built topper. */
export function toStl(THREE, panels, opts = {}) {
  const t = opts.thickness ?? STL_THICKNESS;
  return trianglesToStl(stlTriangles(THREE, panels, t), opts.title
    ? `SifuLaser cake topper: ${opts.title}` : undefined);
}
