// Does it fall over backwards.
//
// A large Quran is one to two kilograms, leaning backwards, on a stand a third
// of a metre wide, and the panel it leans on reaches further back than the
// base does. So this is not a comment and it is not a rule of thumb: it is the
// centre of mass of the actual cut geometry, in the actual assembled frame,
// against the actual footprint.
//
// THE INEQUALITY. With the world origin at the base's rear-bottom edge and x
// pointing forward, the assembly resists tipping backwards while the loaded
// centre of mass is still forward of that edge:
//
//        x_cg > 0
//
// which is a yes-or-no answer and therefore useless on its own. The number
// worth reporting is how much tilt it would take to run out:
//
//        phi_back = atan( x_cg / z_cg )
//
// the angle the table would have to be tipped, nose up, before the assembly
// went over - and equivalently the tilt at which a horizontal push of
// W*tan(phi_back) at centre-of-mass height does the same thing. Forward is the
// mirror of it against the front edge, phi_fwd = atan( (D - x_cg) / z_cg ),
// and it is almost never the binding one.
//
// Masses come from the cut rings, not from a bounding box, so a panel with a
// third of its area cut away as pattern is correctly lighter - and lighter in
// the right place, because a hole moves the centroid as well as the mass. That
// costs nothing: the rings are already in hand.
//
// THE THRESHOLDS - 12 degrees green, 8 degrees red - are chosen by analogy
// with furniture stability practice, where a ten degree tilt or an equivalent
// horizontal force is the usual bar. There is no standard covering a desktop
// book stand. They are defensible; they are not authoritative, and if the
// owner has a number of their own it should replace these.
//
// Millimetres, kilograms, degrees.

import { massOf } from './stock.js';
import { derive, depthFloor } from './dims.js';
import { buildParts } from './parts.js';

const DEG = 180 / Math.PI;

export const PHI_GREEN = 12;
export const PHI_RED = 8;
/** What the automatic base depth aims at: comfortably clear of the amber band. */
export const PHI_TARGET = 25;

/**
 * The second criterion the automatic depth has to satisfy, and the one that
 * actually decides the number.
 *
 * Tilting the table is not how this stand gets knocked over. What happens is
 * that somebody leans on the top of the panel while settling the book onto it,
 * and the top of the panel is the part that hangs out behind the base. So:
 * with the stand loaded, how much downward force on the panel's rear top
 * corner does it take to lift the front of the base off the table?
 *
 *      F = M * g * x_cg / overhang
 *
 * Ten newtons is a kilogram of hand. Below that the stand is a trick rather
 * than a product. This is a handling criterion picked to be plausible, not a
 * measured one, and it has never been tried on a bench.
 */
export const HAND_LOAD_N = 10;

/**
 * The most of the back panel the pattern engine will ever take out. It warns
 * above this on stiffness grounds; here it is the far end of the bracket the
 * automatic depth has to be safe across.
 */
export const PATTERN_MAX_REMOVED = 0.55;

/**
 * Net area and area-weighted centroid of a ring set.
 *
 * Holes are wound the other way, so their signed area is negative and they
 * subtract from both the area and the first moment without any special case.
 * That is the whole reason winding is a convention here rather than a detail.
 */
export function ringsCentroid(rings) {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const cross = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a2 += cross;
      cx += (r[j][0] + r[i][0]) * cross;
      cy += (r[j][1] + r[i][1]) * cross;
    }
  }
  const area = a2 / 2;
  if (Math.abs(area) < 1e-9) return { area: 0, c: [0, 0] };
  return { area, c: [cx / (3 * a2), cy / (3 * a2)] };
}

/** Where a part's own centroid ends up in the world, and what it weighs. */
export function partMass(part, thickness, density) {
  const rings = [part.outlineNominal || part.outline,
    ...(part.holesNominal || part.holes)];
  const { area, c } = ringsCentroid(rings);
  const t = part.thickness ?? thickness;
  const u = c[0] + part.originShift[0];
  const v = c[1] + part.originShift[1];
  const { origin: o, U, V, N } = part.frame;
  // Half a board back along the outward normal: the frame plane is the visible
  // face and the material hangs behind it.
  const at = [0, 1, 2].map((i) => o[i] + U[i] * u + V[i] * v - N[i] * (t / 2));
  return { mass: massOf(Math.abs(area) * t, density), at, area: Math.abs(area) };
}

/**
 * The book, as a slab lying on the reading face.
 *
 * Its lower face is the panel's front plane and its bottom face is square to
 * that, so it comes to rest on the corner where those two meet - which is the
 * point the trough was measured from. The centroid then sits half its slant
 * length up the panel and half its thickness out along the panel's normal.
 *
 * That thickness term is the least reliable number the user gives us, and it
 * does not err in a fixed direction: it moves the centroid forwards AND
 * upwards, so it helps whenever the book's own centroid line is shallower than
 * the panel and hurts when it is steeper. Rather than argue about which case
 * we are in, both are computed and the worse margin is the one reported.
 */
export function bookLoad(d, book) {
  const { sinA, cosA, t, xBook } = d;
  const half = book.slant / 2;
  const thin = [xBook - half * cosA, t + half * sinA];
  const full = [thin[0] + (book.thickness / 2) * sinA,
    thin[1] + (book.thickness / 2) * cosA];
  return { mass: book.mass, thin, full };
}

/**
 * Everything above, combined.
 *
 * `panelFactor` scales the back panel's mass without changing where it acts.
 * It exists because the automatic depth has to be chosen BEFORE the pattern is
 * generated, and the two stability criteria want opposite assumptions about
 * it: cutting a third of the panel away raises the tilt margin (it removes
 * mass that leans backwards, high up) and lowers the hand load (it removes
 * moment from the whole assembly). So neither "solid" nor "fully perforated"
 * is the safe guess, and the search below checks both ends instead. Keeping
 * the centroid put is an approximation - the real pattern is clipped away from
 * the frame band, so it takes slightly more from the middle than from the
 * edges - and it is a small one on a panel this shape.
 */
export function stability({ parts, d, density, book, panelFactor = 1 }) {
  let m = 0;
  let mx = 0;
  let mz = 0;
  const items = [];
  for (const p of parts) {
    const pm = partMass(p, d.t, p.density ?? density);
    if (p.id === 'panel' && panelFactor !== 1) pm.mass *= panelFactor;
    items.push({ id: p.id, ...pm });
    m += pm.mass;
    mx += pm.mass * pm.at[0];
    mz += pm.mass * pm.at[2];
  }
  const stand = { mass: m, x: m ? mx / m : 0, z: m ? mz / m : 0 };

  const load = book && book.mass > 0 ? bookLoad(d, book) : null;
  const withBook = (at) => {
    const mm = m + (load ? load.mass : 0);
    const x = (mx + (load ? load.mass * at[0] : 0)) / mm;
    const z = (mz + (load ? load.mass * at[1] : 0)) / mm;
    return { mass: mm, x, z, phi: Math.atan2(x, z) * DEG };
  };
  const a = load ? withBook(load.thin) : { ...stand, phi: Math.atan2(stand.x, stand.z) * DEG };
  const b = load ? withBook(load.full) : a;
  const worst = a.phi <= b.phi ? a : b;

  const phiBack = worst.phi;
  const phiFwd = Math.atan2(d.depth - worst.x, worst.z) * DEG;
  const overhang = Math.max(0, -d.uRear);
  // THE STAND HAS A SECOND CONTACT, and phiBack does not know about it.
  //
  // phiBack is measured to the base's rear edge, which is the pivot the stand
  // rocks about while the base is the only thing touching the table. It is not
  // the only thing: the cheeks cantilever `overhang` mm behind that edge with
  // their bottom edge one board thickness above the table, so once the stand
  // has rotated far enough for that corner to come down it lands, and the
  // pivot moves back to the cheek toes. At the defaults that happens 6.6
  // degrees past the reported margin, and the true topple lever is then 130 mm
  // rather than the 52 mm the margin is measured over.
  //
  // Reported SEPARATELY, and deliberately not folded into phiBack. The
  // conservatism is worth keeping as conservatism: what arrests the stand is
  // two cheek toes on a 9 mm arris, which is a thing for the user to know
  // about rather than a footprint anyone should design against.
  const arrestDeg = overhang > 0.5 ? Math.atan2(d.t, overhang) * DEG : 0;
  // The two criteria are taken at their own worst case, not both at whichever
  // book model happened to give the worse tilt. Including the book's thickness
  // moves the centre of mass forward AND up, so it can improve the tilt while
  // it is still the hand load's better case - taking the tilt's loser for both
  // would quietly report a hand load that is never the smaller of the two.
  const hand = (q) => (overhang > 0.5
    ? Math.max(0, q.mass * 9.81 * q.x) / overhang
    : Infinity);
  const handLoadN = Math.min(hand(a), hand(b));
  const verdict = phiBack < PHI_RED || handLoadN < HAND_LOAD_N / 2 ? 'red'
    : phiBack < PHI_GREEN || handLoadN < HAND_LOAD_N ? 'amber'
      : 'ok';
  return {
    mass: worst.mass,
    standMass: stand.mass,
    bookMass: load ? load.mass : 0,
    cg: [worst.x, worst.z],
    phiBack,
    phiFwd,
    overhang,
    arrestDeg,
    handLoadN,
    verdict,
    // How hard you would have to shove it sideways at centre-of-mass height
    // before it went, in newtons. Nine point eight one, because the number
    // means nothing to anybody as a mass.
    pushN: worst.mass * 9.81 * Math.tan(Math.max(0, phiBack) / DEG),
    items,
    bookAt: load ? load.thin : null,
  };
}

/**
 * A first guess at the base depth, from the book alone.
 *
 * IT IS NOT A BOUND, AND MUST NOT BE PRINTED AS ONE. The obvious argument -
 * "ignore the stand's own mass and the answer is conservative, because the
 * stand is heavy and sits over its base" - is false for this stand. The back
 * panel and the cheeks lean BACKWARDS past the base's rear edge, so their mass
 * is destabilising, and on a tall panel over a shallow base they outweigh the
 * base's contribution. The test suite contains a case where this closed form
 * is optimistic by several degrees, which is exactly the direction that would
 * let somebody build a stand that falls over.
 *
 * So it is used for one thing only: a starting bracket for the search below.
 */
export function depthGuess(p, book) {
  const a = (p.angle * Math.PI) / 180;
  const half = book.slant / 2;
  const need = half * Math.cos(a)
    + Math.tan((PHI_TARGET * Math.PI) / 180) * (p.thickness + half * Math.sin(a));
  // Turn "the book must rest this far forward of the rear edge" back into a
  // depth, by walking forward through the trough, the lip and the nose. The
  // 200 is arbitrary: everything forward of the book's resting line is a fixed
  // distance from the base's FRONT edge, so (depth - xBook) is the same number
  // whatever depth it is measured at.
  const d = derive({ ...p, depth: 200 });
  return need + (d.depth - d.xBook);
}

/**
 * The base depth the stand actually needs, found on the full mass model.
 *
 * Bisection rather than a formula, because the formula above is not safe and
 * because the thing being solved - the centre of mass of five pieces whose
 * shapes all change with the depth - has no closed form worth writing down.
 * The panel is treated as SOLID here even though the pattern will remove a
 * third of it: a lighter panel leaning backwards is a more stable stand, so
 * pretending the pattern is not there errs the safe way.
 */
export function autoDepth(p, book, density, target = PHI_TARGET, hand = HAND_LOAD_N) {
  const floor = Math.max(150, depthFloor(p));
  const ceil = Math.max(floor + 20, 1.6 * p.height + 200);
  const at = (depth, panelFactor = 1) => {
    const d = derive({ ...p, depth });
    const { parts } = buildParts(d, null);
    return stability({ parts, d, density, book, panelFactor });
  };
  // Both criteria rise with depth - a deeper base moves the centre of mass
  // forward AND shortens the overhang - so "safe" is monotone and a bisection
  // finds the shallowest depth that satisfies both at once. Both ends of the
  // pattern-removal bracket have to pass, for the reason given on stability().
  const safe = (depth) => {
    for (const f of [1, 1 - PATTERN_MAX_REMOVED]) {
      const s = at(depth, f);
      if (!(s.phiBack >= target && s.handLoadN >= hand)) return false;
    }
    return true;
  };
  if (safe(floor)) return { depth: floor, ...at(floor), clamped: 'floor' };
  if (!safe(ceil)) return { depth: ceil, ...at(ceil), clamped: 'ceil' };
  let lo = floor;
  let hi = ceil;
  for (let i = 0; i < 40 && hi - lo > 0.05; i++) {
    const mid = (lo + hi) / 2;
    if (safe(mid)) hi = mid; else lo = mid;
  }
  // Up to the next five, so the number on the card is one a person would say.
  const depth = Math.min(ceil, Math.ceil(hi / 5) * 5);
  return { depth, ...at(depth), clamped: null };
}
