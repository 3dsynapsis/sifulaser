// Two or three families of parallel straps, and nothing else.
//
// This is the boring generator, and it is here on purpose. A union of infinite
// straight lines that cross each other is connected for the same reason a sheet
// of graph paper is, the cells are rhombi or triangles whose inscribed radius
// is a closed form of the spacing, and there is no tiling to get wrong. So when
// a star preset cannot be made legal at the size and thickness the user picked,
// pattern.js falls back to this one and there is always an answer.
//
// The cell arithmetic, for the two families shipped:
//
//   +/-45 (Anyaman): two perpendicular families at spacing q give q x q square
//     cells; the hole, after the strap width w is taken off, has inradius
//     (q - w)/2.
//   0/60/120 (Tiga Arah): three families at spacing q give equilateral
//     triangles. Their inradius is measured rather than asserted - I did not
//     want a closed form in a comment that nobody had checked.
//
// Millimetres, flat [x0,y0,x1,y1] segments out, same as pic.js.

const D2R = Math.PI / 180;

/**
 * Lines at each bearing, spaced `pitch` apart, clipped to a rectangle.
 *
 * Offsets are measured from the origin so that two runs with different bearings
 * always cross where the arithmetic says they do, and so the pattern does not
 * shift when the panel is resized.
 */
export function latticeSegments(rect, bearingsDeg, pitch) {
  const out = [];
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const half = Math.hypot(rect.x1 - rect.x0, rect.y1 - rect.y0) / 2 + pitch;
  for (const bd of bearingsDeg) {
    const b = bd * D2R;
    const ux = Math.cos(b);
    const uy = Math.sin(b);
    const nx = -uy;
    const ny = ux;
    // Offset of the rectangle centre along this family's normal, so the run is
    // centred on the panel rather than on wherever the origin happens to be.
    const c0 = cx * nx + cy * ny;
    const k0 = Math.ceil((c0 - half) / pitch);
    const k1 = Math.floor((c0 + half) / pitch);
    for (let k = k0; k <= k1; k++) {
      const d = k * pitch;
      const px = nx * d;
      const py = ny * d;
      // Walk the line far enough either side of the panel centre's projection
      // that it always crosses the whole rectangle.
      const t0 = (cx - px) * ux + (cy - py) * uy;
      out.push([
        px + ux * (t0 - half), py + uy * (t0 - half),
        px + ux * (t0 + half), py + uy * (t0 + half),
      ]);
    }
  }
  return out;
}

export const LATTICES = {
  weave45: { id: 'weave45', bearings: [45, -45], pitch: { min: 10, max: 60, def: 22 } },
  tri60: { id: 'tri60', bearings: [0, 60, 120], pitch: { min: 12, max: 70, def: 26 } },
};

/** Closed form for the +/-45 family, used as the test oracle. */
export const weaveCellInradius = (pitch, w) => (pitch - w) / 2;
