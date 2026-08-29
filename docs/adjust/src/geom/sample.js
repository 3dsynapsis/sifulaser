// Test material.
//
// The tool exists to fix files somebody else drew, which makes "somebody else's
// file" the one thing it cannot be developed against - any particular download
// is one sample of one generator's habits. So the panels here are drawn to
// order, with the thickness known exactly, and the tests assert against numbers
// that were decided before the code ran. The UI uses the same builders for its
// "Load a sample" button, so what you can try in the browser is what the tests
// check.
//
// Millimetres, y-up, outer rings counter-clockwise and holes clockwise.

const cw = (pts) => pts.slice().reverse();

/**
 * A panel with fingers along the bottom edge and slots through the face - the
 * two thickness-dependent features this tool knows about, in one part.
 *
 * The fingers stick DOWN, below y = 0, because that is what a finger does: the
 * panel's nominal size is w x h and the fingers are extra, buried in the
 * neighbouring board. So the top and both sides are the part's real dimensions
 * and must not move when only the thickness changes; the bottom of the bounding
 * box must move by exactly the thickness difference.
 *
 * `gap` wider than `finger` makes the fingers the minority level, so the run
 * reader has an unambiguous answer. Pass gap === finger for the symmetric case,
 * which is the one that has to fall back to "the outer level is the finger".
 */
export function jointedPanel({
  w = 100, h = 100, t = 3, finger = 10, gap = 15,
  slots = 3, slotLen = 30, holes = true,
} = {}) {
  const pts = [];
  // Bottom edge, left to right, stepping down into a finger every `gap`.
  let x = 0;
  pts.push([0, 0]);
  while (x + gap + finger <= w) {
    const a = x + gap;
    const b = a + finger;
    pts.push([a, 0], [a, -t], [b, -t], [b, 0]);
    x = b;
  }
  pts.push([w, 0], [w, h], [0, h]);

  const rings = [pts];
  if (holes) {
    // Slots for boards standing on edge: `t` wide, `slotLen` long, upright, on a
    // regular pitch across the middle of the panel.
    for (let i = 0; i < slots; i++) {
      const cx = (w * (i + 1)) / (slots + 1);
      const cy = h * 0.55;
      rings.push(cw([
        [cx - t / 2, cy - slotLen / 2],
        [cx + t / 2, cy - slotLen / 2],
        [cx + t / 2, cy + slotLen / 2],
        [cx - t / 2, cy + slotLen / 2],
      ]));
    }
  }
  return rings;
}

/** How many fingers jointedPanel() will actually fit, so tests can expect a number. */
export function fingerCount({ w = 100, finger = 10, gap = 15 } = {}) {
  let x = 0;
  let n = 0;
  while (x + gap + finger <= w) {
    x += gap + finger;
    n++;
  }
  return n;
}

export function circleRing(cx, cy, r, seg = 96, clockwise = false) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return clockwise ? cw(pts) : pts;
}

/**
 * No joinery anywhere: a rounded outline with a star and a circle cut out of it.
 * Nothing here is the thickness of anything, and the honest answer for this file
 * is "nothing recognised" rather than a shape quietly pulled about.
 */
export function decorativePanel({ w = 120, h = 90, r = 12 } = {}) {
  const outer = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= 12; i++) {
      const a = a0 + (i / 12) * (Math.PI / 2);
      outer.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(w - r, r, -Math.PI / 2);
  corner(w - r, h - r, 0);
  corner(r, h - r, Math.PI / 2);
  corner(r, r, Math.PI);

  const star = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 22 : 9;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    star.push([w * 0.32 + Math.cos(a) * rad, h / 2 + Math.sin(a) * rad]);
  }
  return [outer, cw(star), circleRing(w * 0.72, h / 2, 18, 96, true)];
}

/** A slot with rounded ends - slot-sized, slot-shaped, not a rectangle. */
export function stadiumSlot(cx, cy, length, width, seg = 24) {
  const r = width / 2;
  const half = Math.max(0, length / 2 - r);
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([cx + half + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([cx - half + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return cw(pts);
}

export function squareHole(cx, cy, size) {
  return cw([
    [cx - size / 2, cy - size / 2],
    [cx + size / 2, cy - size / 2],
    [cx + size / 2, cy + size / 2],
    [cx - size / 2, cy + size / 2],
  ]);
}

/**
 * The whole sample as an SVG string, in real millimetres, so the file the demo
 * button loads goes through the importer exactly as a download would.
 */
export function sampleSvg(rings, { pad = 6 } = {}) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const r of rings) {
    for (const [x, y] of r) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  const w = x1 - x0 + pad * 2;
  const h = y1 - y0 + pad * 2;
  const n = (v) => Math.round(v * 1000) / 1000;
  // SVG is y-down; the rings are y-up, so the y axis is flipped on the way out.
  const d = rings.map((r) => r
    .map(([x, y], i) => `${i ? 'L' : 'M'}${n(x - x0 + pad)} ${n(y1 - y + pad)}`)
    .join('') + 'Z').join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}mm" height="${n(h)}mm" `
    + `viewBox="0 0 ${n(w)} ${n(h)}"><path d="${d}" fill="none" stroke="#000" `
    + 'stroke-width="0.2"/></svg>';
}
