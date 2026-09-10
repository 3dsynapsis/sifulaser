// The tilings, as data.
//
// Every star pattern in this tool is the same engine - Hankin's polygons in
// contact, in pic.js - fed a different edge-to-edge tiling and one angle. There
// are not five star generators here and there is no reason for there to be:
// what tells a khatam from a shamsa is which polygons the plane was cut into
// before the straps were drawn, and that is a table.
//
// A tiling is a function that fills a rectangle with faces. A face is a closed
// ring of [x, y] pairs, counter-clockwise, and adjacent faces MUST share an
// edge exactly - same two endpoints, to floating point - or the straps that
// cross that edge will not line up and the pattern comes apart at the seam.
// Every entry below is built from one lattice formula for exactly that reason;
// nothing is placed by eye.
//
// `pitch` always means the centre-to-centre spacing of the primary face along
// the first lattice direction, so that raising it always makes the pattern
// coarser whichever family is selected.
//
// theta is measured from the edge line. It has to clear gamma = pi/n for the
// largest-gamma face in the tiling, or the rays from two adjacent edges of that
// face never meet inside it and the face produces nothing at all. The margin is
// three degrees rather than nothing: at theta exactly equal to gamma the rays
// lie along the polygon joining the edge midpoints, two of them become
// collinear, and the arrangement has a degenerate intersection at every valley.
//
// Millimetres, y-up, CCW.

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

/** A regular n-gon with an EDGE MIDPOINT pointing at `midAngle` (radians). */
function regular(cx, cy, n, circumR, midAngle) {
  const half = Math.PI / n;
  const ring = [];
  for (let k = 0; k < n; k++) {
    const a = midAngle + half + (k * TAU) / n;
    ring.push([cx + circumR * Math.cos(a), cy + circumR * Math.sin(a)]);
  }
  return ring;
}

/** Signed area, used only by the self-checks below. */
function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

const ccw = (ring) => (signedArea(ring) > 0 ? ring : ring.slice().reverse());

/**
 * The integer lattice range that covers a rectangle.
 *
 * Solves `rect corner = i*e1 + j*e2` at all four corners and takes the span,
 * with `pad` extra cells all round. Doing it by inverting the basis rather than
 * by guessing a count is what lets a hexagonal or rhombic lattice be generated
 * for a landscape panel without a row missing off one end.
 */
function latticeRange(rect, e1, e2, pad = 1) {
  const det = e1[0] * e2[1] - e1[1] * e2[0];
  let i0 = Infinity; let i1 = -Infinity; let j0 = Infinity; let j1 = -Infinity;
  for (const [x, y] of [[rect.x0, rect.y0], [rect.x1, rect.y0],
    [rect.x1, rect.y1], [rect.x0, rect.y1]]) {
    const i = (x * e2[1] - y * e2[0]) / det;
    const j = (e1[0] * y - e1[1] * x) / det;
    if (i < i0) i0 = i; if (i > i1) i1 = i;
    if (j < j0) j0 = j; if (j > j1) j1 = j;
  }
  return {
    i0: Math.floor(i0) - pad, i1: Math.ceil(i1) + pad,
    j0: Math.floor(j0) - pad, j1: Math.ceil(j1) + pad,
  };
}

// ---------------------------------------------------------------------------
// 4.8.8 - octagons and squares on a square lattice. The workhorse.
//
// Octagon apothem is p/2 and the square between four of them has the same edge
// length s = p*(sqrt2 - 1); the identity p/2 + s/2 = p/sqrt2 is what says the
// square's edge really does land on the octagon's, and it is asserted below
// because getting it wrong produces a tiling that looks right and has a
// hairline gap along every diagonal.
function faces488(rect, p) {
  const s = p * (Math.SQRT2 - 1);
  const R8 = s / (2 * Math.sin(Math.PI / 8));
  const Rsq = s / Math.SQRT2;
  const out = [];
  const r = latticeRange(rect, [p, 0], [0, p], 1);
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      out.push(ccw(regular(i * p, j * p, 8, R8, 0)));
      // The square is turned 45 degrees to the lattice: its vertices point at
      // the four octagons, its edges at the four octagon corners.
      out.push(ccw(regular((i + 0.5) * p, (j + 0.5) * p, 4, Rsq, Math.PI / 4)));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6.6.6 - plain hexagons. Exact in sqrt(3), so it never has a fitting problem.
function faces666(rect, a) {
  const s = a / Math.sqrt(3); // hexagon edge; apothem is a/2
  const e1 = [a, 0];
  const e2 = [a / 2, (a * Math.sqrt(3)) / 2];
  const out = [];
  const r = latticeRange(rect, e1, e2, 1);
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      const cx = i * e1[0] + j * e2[0];
      const cy = i * e1[1] + j * e2[1];
      out.push(ccw(regular(cx, cy, 6, s, 0)));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3.6.3.6 - the kagome. Built as the medial of a triangular lattice: hexagons
// on the lattice points, and the medial triangle of every lattice triangle.
// Built that way the shared edges are literally the same midpoints, so nothing
// can drift apart.
function facesKagome(rect, a) {
  const s = a / 2; // hexagon circumradius and triangle edge alike
  const e1 = [a, 0];
  const e2 = [a / 2, (a * Math.sqrt(3)) / 2];
  const L = (i, j) => [i * e1[0] + j * e2[0], i * e1[1] + j * e2[1]];
  const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
  const out = [];
  const r = latticeRange(rect, e1, e2, 1);
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      const A = L(i, j);
      out.push(ccw(regular(A[0], A[1], 6, s, Math.PI / 6)));
      const B = L(i + 1, j);
      const C = L(i, j + 1);
      const D = L(i + 1, j + 1);
      out.push(ccw([mid(A, B), mid(B, C), mid(C, A)]));
      out.push(ccw([mid(B, D), mid(D, C), mid(C, B)]));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4.6.12 - dodecagons, hexagons and squares.
//
// Dodecagons on a triangular lattice, a square on every lattice edge and a
// hexagon at every triangle centre. The spacing follows from the parts:
// 2*apothem12 + s along an edge, and the hexagon then fits the triangle centre
// exactly because apothem12 + apothem6 = L/sqrt(3). Both identities are
// asserted below.
function faces4612(rect, L) {
  // L = 2*apothem12 + s and apothem12 = s * cot, so s falls out of the pitch.
  const cot = 1 / (2 * Math.tan(Math.PI / 12));
  const a12 = (L * cot) / (2 * cot + 1);
  const s = L - 2 * a12;
  const R12 = s / (2 * Math.sin(Math.PI / 12));
  const Rsq = s / Math.SQRT2;
  const e1 = [L, 0];
  const e2 = [L / 2, (L * Math.sqrt(3)) / 2];
  const P = (i, j) => [i * e1[0] + j * e2[0], i * e1[1] + j * e2[1]];
  const out = [];
  const r = latticeRange(rect, e1, e2, 1);
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      const A = P(i, j);
      out.push(ccw(regular(A[0], A[1], 12, R12, 0)));
      // A square on each of the three lattice edges leaving this point, so
      // every edge gets exactly one.
      for (const B of [P(i + 1, j), P(i, j + 1), P(i - 1, j + 1)]) {
        const mx = (A[0] + B[0]) / 2;
        const my = (A[1] + B[1]) / 2;
        const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
        out.push(ccw(regular(mx, my, 4, Rsq, ang)));
      }
      // Hexagons at the two triangle centres of this lattice cell.
      const B = P(i + 1, j);
      const C = P(i, j + 1);
      const D = P(i + 1, j + 1);
      for (const [u, v, w] of [[A, B, C], [B, D, C]]) {
        const gx = (u[0] + v[0] + w[0]) / 3;
        const gy = (u[1] + v[1] + w[1]) / 3;
        const ang = Math.atan2(u[1] - gy, u[0] - gx);
        out.push(ccw(regular(gx, gy, 6, s, ang)));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plain squares.
function faces4444(rect, p) {
  const out = [];
  const r = latticeRange(rect, [p, 0], [0, p], 1);
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      out.push([[i * p, j * p], [(i + 1) * p, j * p],
        [(i + 1) * p, (j + 1) * p], [i * p, (j + 1) * p]]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Girih - regular decagons with a bowtie in every gap.
//
// This is the periodic girih arrangement, not a quasiperiodic patch: decagons
// sit on a rhombic lattice whose two directions are 72 degrees apart and whose
// spacing is twice the decagon apothem, so neighbours share a whole edge. Six
// decagon edges are then left facing the middle of each rhombus, and the region
// they bound is exactly one girih bowtie - the interior angles come out
// 72/72/216/72/72/216 and the area comes out 1.31433 s^2, which is the bowtie's
// area to five figures. Both are asserted in selfCheck() below, because "the
// usual arrangement" is the kind of claim that is repeated until somebody
// checks it.
//
// The bowtie's six corners are all decagon vertices, so they are read off the
// three decagons around the rhombus rather than constructed independently. That
// is what guarantees the shared edges are shared exactly.
function facesGirih(rect, d) {
  const a10 = d / 2;
  const s = 2 * a10 * Math.tan(Math.PI / 10);
  const R10 = s / (2 * Math.sin(Math.PI / 10));
  const e1 = [d, 0];
  const e2 = [d * Math.cos(0.4 * Math.PI), d * Math.sin(0.4 * Math.PI)];
  const P = (i, j) => [i * e1[0] + j * e2[0], i * e1[1] + j * e2[1]];
  const vx = (c, deg) => [c[0] + R10 * Math.cos(deg * D2R), c[1] + R10 * Math.sin(deg * D2R)];
  const out = [];
  const r = latticeRange(rect, e1, e2, 1);
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      const O = P(i, j);
      out.push(ccw(regular(O[0], O[1], 10, R10, 0)));
      const A = P(i + 1, j);
      const B = P(i, j + 1);
      out.push([
        vx(A, 126), vx(A, 90), vx(B, -18), vx(B, -54), vx(O, 54), vx(O, 18),
      ]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

export const TILINGS = {
  sq488: {
    id: 'sq488', name: '4.8.8', faces: faces488,
    thetaMin: 48, thetaMax: 75, // squares carry gamma = 45
    pitch: { min: 26, max: 140, def: 62 },
  },
  hex666: {
    id: 'hex666', name: '6.6.6', faces: faces666,
    thetaMin: 33, thetaMax: 75,
    pitch: { min: 22, max: 130, def: 52 },
  },
  kagome: {
    id: 'kagome', name: '3.6.3.6', faces: facesKagome,
    thetaMin: 63, thetaMax: 75, // triangles carry gamma = 60
    pitch: { min: 26, max: 150, def: 62 },
  },
  dod4612: {
    id: 'dod4612', name: '4.6.12', faces: faces4612,
    thetaMin: 48, thetaMax: 75,
    pitch: { min: 44, max: 220, def: 96 },
  },
  sq4444: {
    id: 'sq4444', name: '4.4.4.4', faces: faces4444,
    thetaMin: 48, thetaMax: 75,
    pitch: { min: 16, max: 90, def: 34 },
  },
  girih: {
    id: 'girih', name: 'Girih 10', faces: facesGirih,
    thetaMin: 72, thetaMax: 72, // girih is girih at 72 and nothing else
    pitch: { min: 40, max: 190, def: 84 },
  },
};

/**
 * Arithmetic self-checks on the lattice formulae.
 *
 * These are identities, not measurements: if one of them is false the tiling is
 * not edge-to-edge and every pattern built on it has a seam. They live here so
 * a node test can run them without building anything.
 */
export function selfCheck() {
  const out = [];
  const p = 100;
  const s488 = p * (Math.SQRT2 - 1);
  out.push(['4.8.8 octagon apothem + square apothem = p/sqrt2',
    p / 2 + s488 / 2, p / Math.SQRT2]);

  const L = 100;
  const cot = 1 / (2 * Math.tan(Math.PI / 12));
  const a12 = (L * cot) / (2 * cot + 1);
  const s12 = L - 2 * a12;
  out.push(['4.6.12 dodecagon apothem = 1.86603 s', a12, 1.8660254 * s12]);
  out.push(['4.6.12 hexagon reaches the triangle centre',
    a12 + (s12 * Math.sqrt(3)) / 2, L / Math.sqrt(3)]);

  const d = 100;
  const a10 = d / 2;
  const sG = 2 * a10 * Math.tan(Math.PI / 10);
  const gap = d * d * Math.sin(0.4 * Math.PI) - 2.5 * sG * sG / Math.tan(Math.PI / 10);
  out.push(['girih rhombus minus decagon = one bowtie', gap, 1.3143278 * sG * sG]);

  // And the bowtie the code actually emits, measured.
  const tiles = facesGirih({ x0: 0, y0: 0, x1: 1, y1: 1 }, d);
  const bow = tiles.find((f) => f.length === 6);
  out.push(['emitted bowtie is CCW and the right size',
    Math.abs(signedArea(bow)), 1.3143278 * sG * sG]);
  const angs = [];
  for (let i = 0; i < 6; i++) {
    const a = bow[(i + 5) % 6]; const b = bow[i]; const c = bow[(i + 1) % 6];
    // On a CCW ring the interior is swept going from the outgoing edge round to
    // the incoming one, not the other way, and taking it backwards silently
    // reports 360 minus the answer - which still looks like a plausible set.
    let t = Math.atan2(a[1] - b[1], a[0] - b[0]) - Math.atan2(c[1] - b[1], c[0] - b[0]);
    while (t < 0) t += TAU;
    angs.push(Math.round((t / D2R) * 100) / 100);
  }
  out.push(['emitted bowtie interior angles', angs.slice().sort((x, y) => x - y),
    [72, 72, 72, 72, 216, 216]]);
  return out;
}

export { regular, signedArea, latticeRange };
