// Is every piece of material left on the panel still attached to the frame?
//
// This is the question the whole tool stands or falls on. A star tessellation
// that looks right on a screen very often leaves pieces floating in the middle
// of a hole; on the bed those drop out and the customer gets a panel with gaps
// in it. So it is answered twice, by two methods that fail differently, and
// they are required to agree.
//
// TEST ZERO - are these rings even a shape? Both tests below ask "what is
// inside what", and that question only has an answer while the rings are
// simple and do not cross one another. Once two of them cross, each test
// returns a NUMBER rather than a failure, and the numbers are reassuring: Test
// A counts even-depth rings and reports one piece for a plate that has been
// severed in two, and Test B floods outward from the frame band, so a severed
// sliver that still touches that band is a flood SEED and can never be
// reported as an island. Neither is wrong about what it measures. They are
// being asked about a shape that does not exist. So the precondition they both
// assume is checked first, on its own, and a crossing fails the panel.
//
// TEST A - ring parity. Count how many other rings contain each ring. Even
// depth is the outer boundary of a piece of material, odd depth is a hole, and
// depth two is an island sitting inside a hole. Exactly one even-depth ring
// means exactly one piece. This is exact and topological and it runs on the
// rings the SVG writer is about to emit, so it tests the shipped artefact.
//
//   What Test A cannot see: a pinch. Two holes that touch at exactly one point
//   leave material that is topologically one piece and physically two. Test A
//   says PASS. That is not a bug in Test A, it is the reason for Test B.
//
// TEST B - erode, then flood. Rasterise the material, take the exact Euclidean
// distance transform, keep only what is at least half the minimum width from
// any edge, and flood-fill that from the frame band, four-connected. Anything
// the fill does not reach is either an island (drops out of the sheet) or a
// hairline (attached only by a web thinner than the minimum, so it survives on
// screen and chars off on the bed). Those are different problems with different
// fixes and they are reported separately.
//
// A note on what a PASS here means, stated once and not overstated anywhere
// else: it means the geometry that was handed in passed both tests at grid
// pitch `cell` against the minimum width that was asked for. It is not a
// statement about any machine. Kerf varies through the depth of a 9 mm cut and
// can still eat a 2.3 mm web.
//
// Millimetres.

import { edt, label4 } from './raster.js';
import { ringArea, ringBBox, inRing } from './arrangement.js';

/**
 * Test Zero. Do any two ring edges cross, or does a ring cross itself?
 *
 * PROPER crossings only - two segment interiors meeting transversally, with
 * both endpoints of each strictly to one side of the other. A vertex landing
 * exactly ON another edge would break even-odd containment just as thoroughly,
 * but these rings come off a raster trace and a vertex sitting on a line is a
 * floating-point coin toss; a test that fires at random on good geometry would
 * be turned off within a week. So the blind spot is stated rather than papered
 * over: this catches transversal crossings, which is the way real geometry in
 * this tool has actually gone wrong.
 *
 * Segments are bucketed the way minWebBetweenRings buckets them, and the grid
 * is sized from the MEAN segment length rather than from a caller's hint, so a
 * bucket holds a handful of segments whether the rings are a five-point base
 * outline or twenty thousand traced pattern edges. Sizing it any other way
 * turns this into the all-pairs sweep it exists to avoid.
 *
 * Neighbouring segments within one ring share a vertex by construction, so
 * they are skipped - including the wrap-around pair, which is the one an index
 * comparison forgets.
 */
export function ringsCross(rings) {
  const segs = [];
  let total = 0;
  rings.forEach((ring, ri) => {
    if (!ring || ring.length < 3) return;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      segs.push([ring[j][0], ring[j][1], ring[i][0], ring[i][1], ri, i, ring.length]);
      total += Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
    }
  });
  if (segs.length < 2) return { count: 0, at: null };
  const g = Math.max(0.5, (2 * total) / segs.length);

  const buckets = new Map();
  segs.forEach((s, k) => {
    const i0 = Math.floor(Math.min(s[0], s[2]) / g);
    const i1 = Math.floor(Math.max(s[0], s[2]) / g);
    const j0 = Math.floor(Math.min(s[1], s[3]) / g);
    const j1 = Math.floor(Math.max(s[1], s[3]) / g);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const key = `${i},${j}`;
        let a = buckets.get(key);
        if (!a) { a = []; buckets.set(key, a); }
        a.push(k);
      }
    }
  });

  // Which side of ab does c fall? Zero means collinear to within the tolerance,
  // and collinear is deliberately NOT a crossing here - see the note above.
  const side = (ax, ay, bx, by, cx, cy) => {
    const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    return Math.abs(v) < 1e-9 ? 0 : (v > 0 ? 1 : -1);
  };

  let count = 0;
  let at = null;
  // A segment spanning several buckets meets the same partner more than once.
  const seen = new Set();
  for (const list of buckets.values()) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const ka = list[x];
        const kb = list[y];
        const p = segs[ka];
        const q = segs[kb];
        if (p[4] === q[4]) {
          const n = p[6];
          const da = (p[5] - q[5] + n) % n;
          if (da <= 1 || da >= n - 1) continue;
        }
        const key = ka < kb ? `${ka}:${kb}` : `${kb}:${ka}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const d1 = side(q[0], q[1], q[2], q[3], p[0], p[1]);
        const d2 = side(q[0], q[1], q[2], q[3], p[2], p[3]);
        const d3 = side(p[0], p[1], p[2], p[3], q[0], q[1]);
        const d4 = side(p[0], p[1], p[2], p[3], q[2], q[3]);
        if (d1 && d2 && d3 && d4 && d1 !== d2 && d3 !== d4) {
          count++;
          if (!at) at = [(p[0] + p[2]) / 2, (p[1] + p[3]) / 2];
        }
      }
    }
  }
  return { count, at };
}

/**
 * Nesting depth of every ring, by containment.
 *
 * Same rule as nestRings in path.js - a ring can only be contained by one of
 * larger absolute area, and depth parity decides solid from hole - but with the
 * bounding boxes sorted and prefiltered, because a patterned panel carries four
 * hundred to fifteen hundred rings and the all-pairs version is quadratic in
 * that with a polygon test inside it.
 */
export function ringDepths(rings) {
  const valid = rings.filter((r) => r && r.length > 2);
  const info = valid.map((r) => ({ r, a: Math.abs(ringArea(r)), b: ringBBox(r) }));
  const order = info.map((_, i) => i).sort((i, j) => info[j].a - info[i].a);
  const depth = new Array(valid.length).fill(0);
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    const p = info[i].r[0];
    for (let oj = 0; oj < oi; oj++) {
      const j = order[oj];
      const b = info[j].b;
      if (p[0] < b.x0 || p[0] > b.x1 || p[1] < b.y0 || p[1] > b.y1) continue;
      if (inRing(p[0], p[1], info[j].r)) depth[i]++;
    }
  }
  return { rings: valid, depth };
}

/** Test A. Returns the even-depth (solid) rings and the island count. */
export function testA(rings) {
  const { rings: valid, depth } = ringDepths(rings);
  const solids = [];
  for (let i = 0; i < valid.length; i++) if (depth[i] % 2 === 0) solids.push(valid[i]);
  return {
    solidCount: solids.length,
    islands: Math.max(0, solids.length - 1),
    pass: solids.length === 1,
    solids,
  };
}

/**
 * Test B.
 *
 * @param field     the output of rasterPanel
 * @param minWidth  the narrowest material the panel is allowed to contain
 * @param frame     how far in from the panel outline the seed band reaches
 * @param which     'kerfed' (the default, and the only honest one to ship on)
 */
export function testB(field, { minWidth, frame, which = 'kerfed' }) {
  const { nx, ny, cell } = field;
  const v = field[which] || field.v;
  const panelSD = field.panelSD;
  if (!(cell <= minWidth / 4 + 1e-9)) {
    // Not a warning. At a pitch comparable to the feature size the raster will
    // bridge a real gap or snap a real web depending on where the grid happens
    // to fall, so the answer becomes a function of sub-cell alignment and the
    // bug looks intermittent. Refusing is the only useful response.
    throw new Error(
      `grid pitch ${cell.toFixed(3)} mm is too coarse for a ${minWidth.toFixed(2)} mm `
      + 'minimum width; connect.js needs cell <= minWidth/4',
    );
  }

  const n = nx * ny;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = v[i] < 0 ? 1 : 0;

  const d2 = edt(mask, nx, ny);
  // Half a cell of slop, in the strict direction. The transform measures to the
  // nearest background CELL CENTRE, which sits about half a pitch past the real
  // boundary, so a web of exactly minWidth would otherwise clear the threshold
  // on rounding alone.
  const coreCells = minWidth / (2 * cell) + 0.5;
  const coreT = coreCells * coreCells;
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) core[i] = mask[i] && d2[i] >= coreT ? 1 : 0;

  const seed = new Uint8Array(n);
  const coreSeed = new Uint8Array(n);
  let seeds = 0;
  let coreSeeds = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    // The frame band is the member the pattern hangs off, so it is where the
    // fill starts. Using the panel's own signed distance rather than a second
    // polygon keeps the seed and the material from disagreeing about where the
    // edge of the board is.
    if (!(panelSD && panelSD[i] >= -frame)) continue;
    seed[i] = 1;
    seeds++;
    if (core[i]) { coreSeed[i] = 1; coreSeeds++; }
  }

  const mat = label4(mask, nx, ny);
  const seededMat = new Set();
  for (let i = 0; i < n; i++) if (seed[i] && mat.lab[i] >= 0) seededMat.add(mat.lab[i]);

  /**
   * How many hairline pieces there would be if the minimum width were 2*r.
   *
   * Eroding by r and flooding what is left from the frame band. Used both for
   * the verdict, at the width the caller asked for, and by the search below
   * that reports how wide the panel's narrowest web actually is.
   */
  const hairAt = (rCells) => {
    const t2 = rCells * rCells;
    const c = new Uint8Array(n);
    let seeds2 = 0;
    for (let i = 0; i < n; i++) {
      if (mask[i] && d2[i] >= t2) { c[i] = 1; if (seed[i]) seeds2++; }
    }
    if (!seeds2) return { count: Infinity, seeds: 0 };
    const lab = label4(c, nx, ny);
    const ok = new Set();
    for (let i = 0; i < n; i++) if (c[i] && seed[i]) ok.add(lab.lab[i]);
    const on = new Uint8Array(lab.comps.length);
    for (let i = 0; i < n; i++) {
      const k = lab.lab[i];
      if (k >= 0 && seededMat.has(mat.lab[i])) on[k] = 1;
    }
    let bad = 0;
    for (const comp of lab.comps) if (!ok.has(comp.id) && on[comp.id]) bad++;
    return { count: bad, seeds: seeds2 };
  };

  const cor = label4(core, nx, ny);
  const matSeeded = new Set();
  const corSeeded = new Set();
  for (let i = 0; i < n; i++) {
    if (seed[i] && mat.lab[i] >= 0) matSeeded.add(mat.lab[i]);
    if (coreSeed[i] && cor.lab[i] >= 0) corSeeded.add(cor.lab[i]);
  }

  const mm2 = cell * cell;
  const place = (c) => [field.ox + c.ci * cell, field.oy + c.cj * cell];
  const islands = [];
  for (const c of mat.comps) {
    if (matSeeded.has(c.id)) continue;
    islands.push({ areaMm2: c.count * mm2, at: place(c) });
  }
  // A core component is a hairline only if it is on the panel at all - a core
  // component sitting inside an island is part of that island, not a separate
  // complaint.
  const onPanel = new Uint8Array(cor.comps.length);
  for (let i = 0; i < n; i++) {
    const c = cor.lab[i];
    if (c >= 0 && matSeeded.has(mat.lab[i])) onPanel[c] = 1;
  }
  const hairlines = [];
  for (const c of cor.comps) {
    if (corSeeded.has(c.id) || !onPanel[c.id]) continue;
    hairlines.push({ areaMm2: c.count * mm2, at: place(c) });
  }

  // Spurs: material that is nowhere near anything thick enough. Cosmetic - a
  // whisker burns off and nobody notices - so this warns and never fails.
  const cd2 = edt(core, nx, ny);
  const spurT = (minWidth / (2 * cell)) ** 2;
  let spurCells = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i] && !core[i] && cd2[i] >= spurT && matSeeded.has(mat.lab[i])) spurCells++;
  }

  let widest = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i] || !matSeeded.has(mat.lab[i])) continue;
    if (d2[i] > widest) widest = d2[i];
  }

  return {
    pass: islands.length === 0 && hairlines.length === 0 && seeds > 0,
    seeds,
    coreSeeds,
    islands,
    hairlines,
    spurCells,
    spurAreaMm2: spurCells * mm2,
    hairAt,
    thickestMm: 2 * Math.sqrt(widest) * cell,
    cell,
  };
}

/**
 * The narrowest web on the panel, measured between rings.
 *
 * A web is material with a different boundary on each side, so it is the
 * shortest distance between two DIFFERENT rings - a hole and its neighbour, or
 * a hole and the panel edge. Pairs on different rings need none of the
 * neck-versus-gap reasoning measure.js has to do on a single contour: the
 * material between two boundaries is exactly the wall that breaks, however
 * short the way round either of them happens to be.
 *
 * Distances are point to SEGMENT, never point to vertex. Measuring to vertices
 * once reported a 9 mm gap across lettering that was welded solid, because a
 * polygonal circle's vertices are further apart than its edges are.
 *
 * Segments are bucketed on a uniform grid and the search widens a ring of
 * buckets at a time until the buckets already searched are further away than
 * the best answer so far. That is what makes it usable on a panel: the
 * all-pairs sweep in measure.js samples seven hundred points, and a patterned
 * panel has twenty thousand, so thinning to seven hundred steps straight over a
 * two-millimetre crescent.
 */
export function minWebBetweenRings(rings, hint = 5) {
  const segs = [];
  rings.forEach((ring, ri) => {
    if (!ring || ring.length < 2) return;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      segs.push([ring[j][0], ring[j][1], ring[i][0], ring[i][1], ri]);
    }
  });
  if (segs.length < 2) return { mm: Infinity, at: null };
  const g = Math.max(hint, 0.5);
  const buckets = new Map();
  const bk = (i, j) => `${i},${j}`;
  segs.forEach((s, k) => {
    const i0 = Math.floor(Math.min(s[0], s[2]) / g);
    const i1 = Math.floor(Math.max(s[0], s[2]) / g);
    const j0 = Math.floor(Math.min(s[1], s[3]) / g);
    const j1 = Math.floor(Math.max(s[1], s[3]) / g);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const key = bk(i, j);
        let a = buckets.get(key);
        if (!a) { a = []; buckets.set(key, a); }
        a.push(k);
      }
    }
  });

  const d2seg = (px, py, s) => {
    const vx = s[2] - s[0];
    const vy = s[3] - s[1];
    const wx = px - s[0];
    const wy = py - s[1];
    const vv = vx * vx + vy * vy;
    let t = vv > 1e-12 ? (wx * vx + wy * vy) / vv : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = wx - t * vx;
    const dy = wy - t * vy;
    return dx * dx + dy * dy;
  };

  let best = Infinity;
  let at = null;
  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    if (!ring) continue;
    for (const [px, py] of ring) {
      const ci = Math.floor(px / g);
      const cj = Math.floor(py / g);
      let local = Infinity;
      for (let r = 0; r <= 6; r++) {
        for (let j = cj - r; j <= cj + r; j++) {
          for (let i = ci - r; i <= ci + r; i++) {
            if (r > 0 && Math.abs(i - ci) < r && Math.abs(j - cj) < r) continue;
            const a = buckets.get(bk(i, j));
            if (!a) continue;
            for (const k of a) {
              if (segs[k][4] === ri) continue;
              const d = d2seg(px, py, segs[k]);
              if (d < local) local = d;
            }
          }
        }
        // Anything in a bucket further out than this is further away than what
        // has already been found, so there is nothing left to gain.
        if (local < (r * g) * (r * g)) break;
      }
      if (local < best) { best = local; at = [px, py]; }
    }
  }
  return { mm: Number.isFinite(best) ? Math.sqrt(best) : Infinity, at };
}

/**
 * Test Zero, both tests, and the cross-check.
 *
 * Test Zero runs FIRST and its result is reported on its own, because when it
 * fails the other two numbers are not wrong so much as meaningless - see the
 * note at the top of this file. They are still computed and still returned, so
 * that a reader can see what they claimed, but `pass` is false regardless.
 *
 * If A and B disagree about how many islands there are, that disagreement is
 * itself the failure. It means the geometry is degenerate somewhere - a ring
 * that touches itself, a duplicate, a zero-area sliver - and silently
 * preferring whichever answer is nicer would hide exactly the thing worth
 * knowing.
 *
 * THAT TERM IS NOT A GUARD THAT HAS BEEN SHOWN TO WORK, and this paragraph
 * used to read as though it were. Setting `disagree` to a constant false
 * changes no assertion in either suite. That was established by trying rather
 * than assumed: the pinch is the obvious fixture and both tests land on the
 * same count there, and geometry that does separate them is degenerate enough
 * that the answer depends as much on the grid pitch as on the shape - a
 * fixture contrived to reach the branch would be testing the contrivance. It
 * is kept because it costs nothing and because it could be reached by geometry
 * this project has not produced yet, NOT because anything here proves it
 * fires. test-rehal.js prints the same admission as a note beside its count.
 */
export function checkPanel({ rings, field, minWidth, kerf = 0, frame, which = 'kerfed' }) {
  // The floor is stated for FINISHED material. The kerf-compensated drawing
  // shows every web a kerf wider than it will finish, because both cut lines
  // have already moved half a kerf into the waste, so the floor to apply to
  // that drawing is a kerf higher. Getting this backwards passes a panel whose
  // webs are a kerf thinner than the floor - which on 9 mm ply is most of the
  // margin.
  const floor = which === 'kerfed' ? minWidth + kerf : minWidth;
  const cross = ringsCross(rings);
  const a = testA(rings);
  const b = testB(field, { minWidth: floor, frame, which });
  const disagree = a.islands !== b.islands.length;
  // Two independent methods for the same number: the raster says whether the
  // panel survives being eroded by half the minimum width, and the rings say
  // how far apart the nearest two boundaries actually are. They are computed
  // from the same field but by completely different arithmetic, and the test
  // suite asserts they agree to within a grid cell.
  const web = minWebBetweenRings(rings, Math.max(4 * floor, 5));
  // The erosion answers "does anything come adrift", which is not the same
  // question as "is anything too thin". A panel whose every strap is a
  // millimetre wide has no core in the pattern at all, so nothing gets
  // disconnected from the core and Test B passes it - the thin network is
  // simply attached to the frame and reported as spur. The ring measurement is
  // what catches that, so it is part of the verdict rather than a readout.
  //
  // THE FLOOR IS ENFORCED AT ITS STATED VALUE. This test used to allow itself
  // one grid cell of slack - `web.mm < floor - b.cell` - and the justification
  // was true as far as it went: these rings came off a raster of pitch `cell`
  // and cannot be more precise than it. But the slack was spent entirely in
  // the passing direction, so at 9 mm the number actually enforced was 2.01 mm
  // of finished material while every comment in the project said 2.28. A
  // measurement uncertainty is not a licence to round in your own favour.
  //
  // The uncertainty is real, so it is REPORTED instead: minWebLoMm is the low
  // end of the interval the trace can support. Comparing THAT against the
  // floor would be the fully conservative reading and would refuse panels over
  // two tenths of a millimetre of grid noise, so the verdict is taken on the
  // measurement and the interval is published beside it.
  const thin = web.mm < floor;
  return {
    pass: !cross.count && a.pass && b.pass && !disagree && !thin,
    thin,
    disagree,
    // Test Zero. Non-zero means the two tests below were answering a question
    // about a shape that is not a shape, and their numbers say nothing.
    crossings: cross.count,
    crossAt: cross.at,
    solidCount: a.solidCount,
    islandsA: a.islands,
    islandsB: b.islands.length,
    islands: b.islands,
    hairlines: b.hairlines,
    spurAreaMm2: b.spurAreaMm2,
    minWebMm: web.mm,
    // The same web as the cutter will leave it, and the floor in the same
    // units, so that a readout does not have to redo the kerf arithmetic and
    // get it backwards. `minWebMm` and `floor` are both DRAWN; these two are
    // both FINISHED. Anything printed for a user should come from this pair.
    minWebFinishedMm: which === 'kerfed' ? web.mm - kerf : web.mm,
    minWebLoMm: web.mm - b.cell,
    floorFinished: minWidth,
    minWebAt: web.at,
    floor,
    thickestMm: b.thickestMm,
    erodesTo: b.hairAt,
    seeds: b.seeds,
    cell: b.cell,
  };
}
