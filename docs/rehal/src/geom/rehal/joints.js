// Slot fits for 9 mm stock, which are not the 3 mm ones scaled up.
//
// Box Maker presses a 3 mm tenon into a 2.95 mm slot: `fit: 0.05` is
// interference and `slotW = Math.max(0.3, t - fit)` makes the hole smaller
// than the thing going into it on purpose. That works because 3 mm of contact
// is a couple of newtons on a mallet and the ply gives a little.
//
// It does not survive being scaled. Insertion force goes with contact area,
// i.e. with depth, so nine millimetres of the same interference is three times
// the force into a joint whose walls are charred; and 9 mm plywood has hard
// glue lines through it that do not compress the way a single 3 mm veneer
// sandwich does. Tapping that home is not a fit, it is splitting. At 9 mm the
// joint goes to a slip fit and the glue does the holding.
//
// Two separate allowances, because they are two separate physical facts:
//
//   fitAllowance   how much bigger the hole is than the tenon on purpose.
//                  Negative is interference. It crosses zero at about
//                  t = 4.6 mm, which is roughly where tapping a joint home
//                  stops being possible and starts being splitting.
//   taperAllowance slack for the fact that a thick kerf is not one width. The
//                  beam waist is a millimetre or two long, so at 9 mm the cut
//                  is V- or hourglass-shaped and the exit face is the narrow
//                  one. The single kerf number the user types cannot describe
//                  that, so the mortise carries the difference.
//
// THE TAPER COEFFICIENT IS A GUESS. Nothing in this project models taper at
// all, so there was nothing to borrow and nothing to calibrate against. 0.35
// of a kerf at 9 mm is the order of magnitude reported for CO2 cuts in thick
// ply; it has not been measured on this machine on this plywood. Cut a stepped
// coupon, put a feeler gauge in the entry and exit faces, and set the number
// from that before a customer cuts a joint. Until then this is a starting
// point for a calibration, not the result of one.
//
// And the number it is trying to control is smaller than the plywood's own
// thickness tolerance, which is why the build takes a MEASURED thickness.
//
// Millimetres.

import { jointLand } from '../pattern/floors.js';

/** Deliberate clearance, or interference when negative. */
export const fitAllowance = (t) => Math.max(-0.05, 0.035 * t - 0.16);

/** Slack for the kerf being narrower at the exit face than at the entry. */
export const taperAllowance = (t, kerf) => (0.35 * kerf * t) / 9;

/**
 * The FINISHED width of a mortise that has to accept a board.
 *
 * `tMeasured` is what the caliper says, not what the label says. Kerf
 * compensation is applied later and once, to every ring, so this is the size
 * the hole ends up rather than the size it is drawn.
 */
export function mortiseWidth(t, kerf, tMeasured = t) {
  return tMeasured + fitAllowance(t) + taperAllowance(t, kerf);
}

/**
 * How far a mortise wall has to stand OUTSIDE the board's nominal face.
 *
 * Every mortise in this stand is drawn round a board sitting at its NOMINAL
 * position - the base's cheek slots at y = inset, the cheek's lip notch
 * between xLipRear and xLipFront, all of them exactly t apart because that is
 * where dims.js put the board. What has to change with the caliper reading is
 * the WIDTH, and the only way to widen a hole about a fixed centre line is to
 * move each wall out by half the difference. So this, not `slack`, is what a
 * mortise wall is offset by.
 *
 * The distinction is not pedantry; it is the bug this function was extracted
 * to kill. `slack` - mortiseWidth minus the MEASURED board - is the right
 * clearance to add at the ENDS of a tenon run, where the shoulder needs
 * somewhere to go, and three of the four joint families were using it across
 * the run as well. Since slack comes to (fit + taper) whatever the caliper
 * says, those three holes came out t + fit + taper wide and never moved with
 * the board at all: a 9.4 mm sheet met a 9.26 mm hole and had to be driven in,
 * while an 8.5 mm sheet rattled in nearly three times its intended clearance.
 * The panel joint went through mortiseRing and was sized properly, so it
 * tracked the board correctly the whole time - which meant the stand racked in
 * exactly the joints that tie its feet together while the one joint the test
 * suite happened to watch looked perfect.
 */
export const mortiseGrow = (t, kerf, tMeasured = t) =>
  (mortiseWidth(t, kerf, tMeasured) - t) / 2;

/**
 * The module a tab is cut to.
 *
 * Box Maker's 13 mm default is 4.3 board thicknesses in 3 mm stock and only
 * 1.4 in 9 mm - a tab shorter than about two thicknesses has no grain running
 * along it to speak of and shears out of the ply. Two and a half thicknesses
 * is the same floor box.js uses to decide a corner joint has room to exist.
 */
export const tabModule = (t) => Math.max(10, Math.min(40, 2.5 * t));

/**
 * Where the tabs go along an edge of length E.
 *
 * Returns [{ s, e }] in edge coordinates, or [] when the edge is too short to
 * carry one with land at both ends. Aiming at one tab per three modules gives
 * three on a 250 mm panel edge, which is what a leaning panel wants: enough to
 * stop it rocking in the slot, few enough that the cheek is not perforated.
 *
 * `min` is there because a short edge with one tab is a hinge. Two is the
 * fewest that stops a piece pivoting about its own joint, so an edge that can
 * hold two gets two even when the spacing rule would have settled for one.
 *
 * `opts.margin` raises the land at both ends. It exists because for the panel
 * the binding land is not in the panel's frame at all: the panel's tabs become
 * MORTISES in the cheek, and the cheek's bottom edge is horizontal while the
 * mortise line leans. So a run that keeps a proper land measured along the
 * panel can still put its lowest mortise a couple of millimetres from the
 * cheek's bearing edge. dims.js works out what that costs and passes it here;
 * see tabStart there for the arithmetic. Raised at BOTH ends because keeping
 * the run centred is what every other caller here relies on, and the extra
 * land at the top of the panel costs nothing.
 */
export function featureRun(E, module, land, opts = {}) {
  const min = opts.min ?? 1;
  const max = opts.max ?? 6;
  const margin = Math.max(land, module * 0.5, opts.margin ?? 0);
  const usable = E - 2 * margin;
  if (usable < module) {
    // One tab, as long as the land at both ends allows, or nothing at all.
    const m = Math.min(module, E - 2 * land);
    if (m < module * 0.5) return [];
    return [{ s: (E - m) / 2, e: (E + m) / 2 }];
  }
  let n = Math.max(min, Math.min(max, Math.round(usable / (3 * module))));
  // ...but only as many as will still leave a gap between them worth the name.
  const gapMin = module * 0.6;
  while (n > 1 && n * module + (n - 1) * gapMin > usable) n--;
  if (n === 1) return [{ s: (E - module) / 2, e: (E + module) / 2 }];
  const step = (usable - module) / (n - 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = margin + i * step;
    out.push({ s, e: s + module });
  }
  return out;
}

/**
 * A mortise as a ring, given a line and a run along it.
 *
 * `o` is a point on the line, `d` the unit direction along it, and `n` MUST be
 * d turned +90 degrees - (-d[1], d[0]) - so that (d, n) has the same handedness
 * as the panel's own (u, v).
 *
 * WHAT GETTING THAT BACKWARDS ACTUALLY COSTS, because the answer here used to
 * be wrong in a way that would have sent the next reader to the wrong test.
 * The claim was that a reversed ring "makes it an outline rather than a hole
 * and the mortise silently becomes a second piece of board". It does not.
 * connect.js derives solid-from-hole by containment DEPTH, not by winding, so
 * both connectivity tests are blind to the flip and the piece count never
 * moves. What does move is the MASS MODEL: ringsCentroid reads signed area, so
 * a hole wound the wrong way is ADDED instead of subtracted. Flipping the four
 * cheek mortises takes the cheek from 21650 to 22915 mm^2 and the whole stand
 * from 0.828 to 0.842 kg, and that mass feeds the centre of mass, which feeds
 * the tipping verdict. The failure is a quiet sign error in the one number
 * this tool exists to compute, and the guard for it is the signed-area
 * assertion in the stand suite, not anything in connect.js.
 *
 * The rectangle is `width` across the normal, centred on the line, and runs
 * from s to e along it. `slack` is added at BOTH ends of the run for the same
 * reason it is added across: a shoulder that lands exactly on its stop does
 * not close, it stands the joint off.
 *
 * Wound clockwise, because it is a hole.
 */
export function mortiseRing(o, d, n, s, e, width, slack = 0) {
  const hw = width / 2;
  const a = s - slack / 2;
  const b = e + slack / 2;
  const pt = (t, k) => [o[0] + d[0] * t + n[0] * k, o[1] + d[1] * t + n[1] * k];
  // CCW in (d, n) is a, -hw -> b, -hw -> b, hw -> a, hw. A hole wants the
  // other way round, and the caller cannot be expected to know which basis
  // this ended up in, so it is reversed here once and for all.
  return [pt(a, -hw), pt(a, hw), pt(b, hw), pt(b, -hw)];
}

/** How much land a joint feature keeps clear of anything else. */
export { jointLand };
