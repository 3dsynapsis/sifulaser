// How thin a piece of 9 mm plywood is allowed to get.
//
// Every other tool in this project cuts 3 mm and tops out at 5.2 mm, and their
// minimum-feature numbers are written down as constants because at those
// thicknesses one constant is close enough. A rehal is cut from 9 mm, which is
// nearly double the thickest thing anything here has ever been asked to make,
// and a 9 mm cut is not a 3 mm cut done slower. Three effects push the same way:
//
//  1. Dwell. At fixed power the feed rate falls roughly as 1/t, so a point on
//     the cut line sees about three times the exposure at 9 mm that it sees at
//     3 mm. Heat spreads sideways over roughly sqrt(alpha * dwell), so the
//     charred, weakened band either side of the kerf widens by about sqrt(3).
//     A 1.5 mm bridge that keeps most of its section in 3 mm ply is powder in 9.
//  2. Taper. The beam waist is a millimetre or two long. At 3 mm the whole
//     thickness sits near the waist and the kerf is nearly parallel-sided; at
//     9 mm it does not, so the kerf is V- or hourglass-shaped and the single
//     number the user types is one width for a cut that is not one width.
//  3. Section and voids. A web of width b in thickness t bends out of plane as
//     t*b^3, so a thin web in thick stock is a knife edge that levers easily -
//     and the board it belongs to is three times heavier, so handling loads are
//     three times larger. 9 mm ply is layered: a 1.5 mm web can land entirely
//     on one face veneer with a core void beneath it and snap when the waste is
//     punched out.
//
// These are calibrated rules of thumb for char behaviour, not measured
// constants for any one machine, and nothing here has been cut yet. They are
// parameters with these defaults. They are not a promise, and no comment in
// this directory should be read as one.
//
// The house pattern for a thickness-derived limit is box.js:829 - compute it
// from t, and say in the comment why that multiple. 0.22 is the multiple that
// puts 9 mm ply at the 2 mm-ish web that survives being punched out by hand;
// the 1.2 mm floor is what a thin-stock tool already ships and dominates until
// t reaches about 5.45 mm, which is why 3 mm and 5.2 mm come out nearly the
// same and 9 mm does not.
//
// Millimetres throughout.

/**
 * The narrowest strip of FINISHED material the panel is allowed to contain.
 *
 * Finished, not drawn, and the difference matters by a whole kerf in the
 * dangerous direction if it is got backwards. Kerf compensation moves every cut
 * line half a kerf into the waste, so the two drawn hole edges either side of a
 * strap are w + kerf apart and the beam then eats half a kerf off each of them,
 * leaving w. Measure a kerf-compensated drawing and compare it to this number
 * and every web looks a kerf safer than it is; connect.js is handed the floor
 * to use, already adjusted for which geometry it was given, so that no caller
 * has to remember which way round it goes.
 *
 * The + kerf here is a different thing entirely: it is slack for the taper. A
 * 9 mm kerf is not one width, and the single number the user types cannot
 * describe a V-shaped cut, so the floor carries the difference.
 */
export const minWidth = (t, kerf) => Math.max(1.2, 0.22 * t) + kerf;

/**
 * The smallest hole worth cutting, as an inscribed radius.
 *
 * This is a cut-quality floor, not a strength one: a hole narrower than a few
 * kerfs never opens, the beam just burns a mark across it. Three kerfs is the
 * width at which the slug can actually fall through; the 0.12*t term keeps a
 * hole in thick stock from being a deep narrow chimney the smoke cannot leave.
 */
export const holeFloor = (t, kerf) => Math.max(1.0, 3 * kerf, 0.12 * t);

/**
 * The sharpest cell corner allowed, in degrees. A cell tip of angle A is
 * 2*L*tan(A/2) wide at distance L from the point, so below about 30 degrees
 * the tip is a burn streak rather than a hole. In the polygons-in-contact
 * engine the crossing angle is 180 - 2*theta, so this is the same statement as
 * theta <= 75.
 */
export const MIN_TIP_ANGLE = 30;

/** The contact-angle ceiling MIN_TIP_ANGLE implies. */
export const THETA_MAX = (180 - MIN_TIP_ANGLE) / 2;

/**
 * The nominal strap width, and the floor under it.
 *
 * A finished strap only has to clear minWidth, so the extra kerf in the floor
 * is belt and braces, not arithmetic: the taper coefficient has never been
 * measured on this plywood on this machine, and until somebody cuts a coupon
 * and puts a feeler gauge in it a whole kerf of headroom is cheap. The 1.4 on
 * top of that is so a panel is not sitting on its own limit the day the ply
 * arrives a tenth thinner than the label says.
 */
export const strapFloor = (t, kerf) => minWidth(t, kerf) + kerf;
export const strapDefault = (t, kerf, pitch, frac = 0.09) =>
  Math.max(strapFloor(t, kerf) * 1.4, pitch * frac);

/**
 * The grid pitch the raster checks must not exceed.
 *
 * At a pitch comparable to the feature size, marching squares and a flood fill
 * will bridge a real gap or snap a real web, and the answer changes with
 * sub-cell alignment so the bug looks intermittent. A quarter of the minimum
 * width is the coarsest that reliably keeps a one-web-wide channel open.
 */
export const maxCell = (t, kerf) => minWidth(t, kerf) / 4;

/** Frame band width: wide enough to be the member the pattern hangs off. */
export const frameBand = (t, kerf) =>
  Math.max(10, 2.5 * minWidth(t, kerf), 1.5 * t);

/** Solid land kept around every joint feature, and the reason for it. */
// A star cell landing on a mortise mouth splits the ply along a glue line the
// first time a book leans on it. One and a half thicknesses is the same floor
// box.js uses to decide a corner joint has room to exist.
export const jointLand = (t) => 1.5 * t;
