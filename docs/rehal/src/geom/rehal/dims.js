// Every dimension of the stand, derived from four numbers the user chooses.
//
// The user picks overall width, panel slant height, reading angle and base
// depth. Everything else in this file is worked out from those, in one place,
// so that the flat drawing, the 3D placement, the mass model and the tests are
// all reading the same arithmetic rather than each doing their own.
//
// WORLD FRAME: x forward, toward the reader. y across. z up. The origin is the
// REAR-BOTTOM edge of the base, so the whole footprint is x in [0, D] and the
// backward tipping question is exactly "is the loaded centre of mass still at
// x > 0".
//
// WHY THE STAND OVERHANGS ITS OWN BASE AT THE BACK. A panel 250 mm long
// leaning at 35 degrees reaches 205 mm backwards. Putting base under all of
// that would mean a 250 mm deep base, half of which does nothing but sit
// there, and would make the tipping calculation this tool exists for
// impossible to fail. So the base is allowed to be shorter than the lean, the
// cheeks cantilever off the back of it, and whether that is safe is a
// question with a number attached rather than a matter of taste. The number is
// in stability.js.
//
// THE FIVE PIECES, and why it is not three. A single panel slotted into a flat
// base is a T. Nine millimetres of slot bearing does not hold a two kilogram
// book's overturning moment; the panel levers in the slot and the reading
// angle becomes a fit-dependent hope. Here the angle is a geometric fact: the
// two side cheeks carry the slope, the back panel tabs through them and acts
// as the shear web that stops them racking, the base ties their feet, and the
// lip ties their noses.
//
// Millimetres and degrees.

import { jointLand } from '../pattern/floors.js';
import { tabModule, mortiseWidth } from './joints.js';

const RAD = Math.PI / 180;

/**
 * Handling clearance between the book's bottom edge and the lip, and the
 * margin of base left in front of everything.
 */
export const TROUGH_CLEAR = 4;
export const FRONT_MARGIN = 8;

/**
 * The reading angle default, and the case for it.
 *
 * A reader sitting on the floor has their eye around 65 cm up and around 35 cm
 * behind the book, whose middle sits about 25 cm off the floor. That sight
 * line drops about 49 degrees below horizontal, and a page square to it stands
 * about 41 degrees from horizontal. A reader at a table looks down far less
 * steeply and wants nearer 25 to 30. 35 splits the two, sits in the flatter
 * half of the traditional 30-to-45 range, and every degree taken off it moves
 * the loaded centre of mass forward and lowers it - so the default errs
 * towards not falling over rather than towards looking dramatic.
 *
 * At 35 degrees tan(alpha) is 0.70, which is past any plausible friction
 * coefficient for paper or leather on plywood. The book slides. That is not a
 * claim that has been tested on a bench, but the lip is fitted either way, and
 * it is the only thing holding the book.
 */
export const ANGLE_DEFAULT = 35;
export const ANGLE_MIN = 20;
export const ANGLE_MAX = 55;

/** What the current angle is good for, in the user's words. */
export function angleNote(alpha) {
  if (alpha < 27) return 'Hampir rata - sesuai untuk meja tinggi.';
  if (alpha <= 42) return 'Sudut baca biasa - duduk atas lantai atau meja rendah.';
  return 'Curam - sesuai untuk pandangan dari jauh, tetapi kurang stabil.';
}

/**
 * Turn the chosen parameters into every line the cut file needs.
 *
 * Reading order matters here and is the reverse of how the stand is described:
 * the base's FRONT edge is pinned to the base depth, and the lip, the trough
 * and the panel foot are then placed backwards from it. Doing it the other way
 * round - placing the panel first and letting the base fall where it may -
 * makes the depth a derived quantity, and the depth is the one thing the user
 * is going to want to argue with.
 */
export function derive(p) {
  const t = p.thickness;
  const tm = p.measuredThickness ?? t;
  const kerf = p.kerf;
  const a = p.angle * RAD;
  const sinA = Math.sin(a);
  const cosA = Math.cos(a);
  const tanA = Math.tan(a);
  const land = jointLand(t);
  const module = tabModule(t);

  // WHERE THE PANEL'S TAB RUN IS ALLOWED TO START, and why it is not simply
  // `land`.
  //
  // The panel's tabs are mortises in the CHEEK, and that is the frame the land
  // has to be measured in. The cheek's bottom edge - the face that carries the
  // panel's whole thrust down into the base - is horizontal; the mortise line
  // leans at the reading angle. So a run that keeps a proper land measured
  // along the panel still walks its lowest mortise towards that bearing edge,
  // and the shallower the angle the further it walks.
  //
  // A mortise starting at run coordinate s has its lowest corner at
  //     z(s) = cosA*t/2  +  (s - slack/2)*sinA  -  (mw/2)*cosA
  // (mid-plane height, plus the run, less the half-width leaning back down and
  // the end slack). Setting z(s) = land and solving for s gives this. At 9 mm
  // and 35 degrees it asks for 20.1 mm where `land` alone asked for 13.5, and
  // at 20 degrees it asks for 26.2 - which is the whole gap between a design
  // that intends a 13.5 mm land and one that was measured at 4.45 mm.
  const mw = mortiseWidth(t, kerf, tm);
  const slack = mw - tm;
  const tabStart = (land - (Math.cos(a) * t) / 2 + (mw / 2) * Math.cos(a))
    / Math.sin(a) + slack / 2;

  // The cheeks stand this far inboard of the base's edge so their tenons have
  // land around them in the base. Rounded up to a whole millimetre because a
  // width the user can read off a ruler is worth a tenth of nothing.
  const inset = Math.ceil(Math.max(12, 1.5 * t));
  const panelW = p.width - 2 * inset;

  const hLip = p.lipHeight;
  // The cheek's top edge in the trough is a land above the lip, which makes it
  // a wall the book's bottom corner cannot slide sideways out of as well as
  // giving the lip's through-tenon something to be a tenon in.
  const wallTop = hLip + land;
  // A toe in front of the lip, so the lip's notch has material both sides of
  // it rather than opening out of the cheek's front corner.
  const nose = land;

  const xCheekFront = p.depth - FRONT_MARGIN;
  const xLipFront = xCheekFront - nose;
  const xLipRear = xLipFront - t;

  // The trough. The book lies on the panel with its lower face in the panel's
  // plane and its bottom face square to that, so the bottom face rises from
  // the book's resting corner at dx/dz = tan(alpha). The lip must clear that
  // over its whole height or the book sits proud of the trough and rocks.
  const trough = hLip * tanA + TROUGH_CLEAR;
  // Where the book's lower face meets the base: the panel's front-face plane
  // continued down to z = t. It is t/sin(alpha) forward of the panel's rear
  // bottom corner, and forgetting that term is worth 16 mm at 35 degrees -
  // enough to put the lip inside the book.
  const xBook = xLipRear - trough;
  const dRear = xBook - t / sinA;

  // The panel, as three lines in the xz plane with z measured from the base's
  // TOP face. Square-cut bottom edge, sitting with its lowest corner on the
  // base; the cheeks carry it, the base only stops it dropping.
  const nx = sinA;
  const nz = cosA;                 // outward normal of the reading face
  const vx = -cosA;
  const vz = sinA;                 // up the slope
  const backFoot = [dRear, 0];
  const backTop = [dRear + vx * p.height, vz * p.height];
  const frontFoot = [dRear + nx * t, nz * t];
  const frontTop = [backTop[0] + nx * t, backTop[1] + nz * t];
  const uRear = backTop[0];

  // The rail: the cheek's top edge, a land proud of the reading face. It has
  // to be at least that or there is no material above the panel's mortise; it
  // doubles as the ledge that keeps a wide book from sliding off sideways.
  const rail = land;
  const railAt = [frontTop[0] + nx * rail, frontTop[1] + nz * rail];
  const vRail = (x) => railAt[1] - (x - railAt[0]) * tanA;
  // Where the rail has come down to the trough wall. Clamped, because a steep
  // angle on a shallow base can put that point past the nose.
  let xLevel = railAt[0] + (railAt[1] - wallTop) / tanA;
  const railAtNose = vRail(xCheekFront);
  if (!(xLevel < xCheekFront)) xLevel = xCheekFront;

  return {
    ...p,
    t,
    tMeasured: tm,
    kerf,
    sinA,
    cosA,
    tanA,
    land,
    module,
    tabStart,
    inset,
    panelW,
    hLip,
    wallTop,
    nose,
    xCheekFront,
    xLipFront,
    xLipRear,
    trough,
    xBook,
    dRear,
    uRear,
    backFoot,
    backTop,
    frontFoot,
    frontTop,
    rail,
    railAt,
    vRail,
    xLevel,
    railAtNose,
    n: [nx, nz],
    v: [vx, vz],
  };
}

/**
 * The smallest base depth the geometry itself allows, before anything is said
 * about tipping. Below this the trough, the lip and the nose have eaten the
 * whole base and there is nowhere left to stand the cheeks' tenons.
 */
export function depthFloor(p) {
  const t = p.thickness;
  const land = jointLand(t);
  const trough = p.lipHeight * Math.tan(p.angle * RAD) + TROUGH_CLEAR;
  // 60 mm of base behind the book's resting line, which is roughly two tab
  // modules plus their land - the least that will carry two cheek tenons.
  return Math.ceil(FRONT_MARGIN + land + t + trough + 60);
}

/**
 * The depth at which nothing overhangs at all - the base reaches back under
 * the panel's top corner and the cheeks stop cantilevering.
 *
 * It is not the default, because it costs a third more plywood in the base and
 * because the automatic depth already keeps the loaded stand well clear of
 * going over. It is reported so that the inspector can offer it as one click,
 * for anybody who would rather have a stand that visibly cannot tip than one
 * that provably does not.
 */
export function flushDepth(p) {
  const t = p.thickness;
  const a = p.angle * RAD;
  const trough = p.lipHeight * Math.tan(a) + TROUGH_CLEAR;
  const dRear = p.height * Math.cos(a);
  const xBook = dRear + t / Math.sin(a);
  return Math.ceil((xBook + trough + t + jointLand(t) + FRONT_MARGIN) / 5) * 5;
}
