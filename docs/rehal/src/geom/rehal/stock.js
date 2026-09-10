// The board, and the book that sits on it.
//
// Two tables that the rest of the stand builder reads and that store.js can
// hand straight to an inspector. They live in geom/ rather than in the store
// because the mass model needs the density and the joint model needs the
// thickness, and a test that has no DOM still has to be able to ask for both.
//
// THE THICKNESS FIELD IS NOT DECORATION. Every other tool in this project cuts
// 3 mm, where the difference between the label and the board is a few
// hundredths and nobody notices. Nominal 9 mm plywood is routinely 8.5 to
// 9.5 mm, which is wider than the whole clearance the joint maths computes -
// so the fit is decided by the board, not by the formula. That is why every
// entry carries a nominal thickness AND the build takes a measured one, and
// why the README tells the user to put a caliper on the sheet first.
//
// Millimetres and kilograms per cubic metre.

/**
 * Densities are catalogue figures, not weighings.
 *
 * Local 9 mm ply runs anywhere from 480 to 700 kg/m^3, which moves the stand's
 * own mass by about a third either way. The book dominates the overturning
 * moment, so the tipping verdict barely moves with it - but the total mass
 * printed on the card does, and that number should be checked against a
 * kitchen scale on the first real build rather than believed.
 */
export const MATERIALS = [
  { id: 'ply9', name: 'Plywood 9 mm', t: 9, kerf: 0.3, density: 600, colour: '#c8a86b' },
  { id: 'ply12', name: 'Plywood 12 mm', t: 12, kerf: 0.35, density: 600, colour: '#c8a86b' },
  { id: 'ply6', name: 'Plywood 6 mm', t: 6, kerf: 0.25, density: 600, colour: '#d2b47a' },
  { id: 'mdf9', name: 'MDF 9 mm', t: 9, kerf: 0.28, density: 750, colour: '#b9a894' },
  { id: 'ply52', name: 'Plywood 5.2 mm', t: 5.2, kerf: 0.25, density: 600, colour: '#dcc08a' },
  { id: 'ply3', name: 'Plywood 3 mm', t: 3, kerf: 0.2, density: 600, colour: '#e2caa0' },
  { id: 'acr9', name: 'Akrilik 9 mm', t: 9, kerf: 0.3, density: 1190, colour: '#9fd6e6' },
];

export const materialOf = (id) => MATERIALS.find((m) => m.id === id) || MATERIALS[0];

/**
 * Three Qurans, as a slab.
 *
 * `slant` is how far the book reaches up the panel when it is open and lying
 * on it, `thickness` is the closed block, `open` is how wide it is across when
 * open. These are estimates from common sizes and they have not been measured
 * on the owner's own stock - which matters most for `open`, because the large
 * one comes out wider than a 330 mm stand and its pages will hang over the
 * side rails. That is a fact about big Qurans, not a fault in the stand, but
 * the width slider is there if the owner would rather it did not.
 */
export const BOOKS = [
  { id: 'kecil', name: 'Kecil', mass: 0.5, slant: 210, thickness: 25, open: 300 },
  { id: 'sederhana', name: 'Sederhana', mass: 1.1, slant: 250, thickness: 35, open: 360 },
  { id: 'besar', name: 'Besar', mass: 1.9, slant: 300, thickness: 45, open: 420 },
];

export const bookOf = (id) => BOOKS.find((b) => b.id === id) || BOOKS[1];

/** kg from a volume in mm^3. */
export const massOf = (volumeMm3, density) => volumeMm3 * density * 1e-9;
