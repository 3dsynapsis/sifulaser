// The pattern engine's front door.
//
// Everything the rest of the tool needs is re-exported here, so nothing outside
// src/geom/pattern/ has to know which file a thing lives in. The stand builder
// calls buildPattern once per decorated panel and reads `cut`, `check` and
// `derived`; the inspector reads PRESETS, CARTOUCHES and the floors; the tests
// reach past this into the individual modules on purpose, because a test that
// can only see the front door cannot tell which room the fault is in.

export {
  buildPattern, PRESETS, presetOf, pitchRange, presetSegments,
} from './pattern.js';
export { CARTOUCHES, cartoucheRing, makeRegion, ringClearOf, bearingSpread } from './region.js';
export {
  minWidth, holeFloor, maxCell, frameBand, jointLand, strapFloor, strapDefault,
  MIN_TIP_ANGLE, THETA_MAX,
} from './floors.js';
export {
  checkPanel, testA, testB, ringsCross, ringDepths, minWebBetweenRings,
} from './connect.js';
export { rasterPanel, traceField, edt, label4 } from './raster.js';
export { TILINGS, selfCheck as tilingSelfCheck } from './tilings.js';
export { starOracle, starCell, picSegments } from './pic.js';
export { LATTICES, latticeSegments, weaveCellInradius } from './lattice.js';
export {
  planarFaces, splitSegments, inradius, minTipAngle, ringArea, ringBBox,
  distToRing, inRing,
} from './arrangement.js';
