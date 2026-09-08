// The AutoCAD Colour Index, both ways.
//
// DXF does not carry an RGB per entity in the versions we read and write - it
// carries a number from 1 to 255 into a fixed palette, with 0 meaning BYBLOCK
// and 256 meaning BYLAYER. LightBurn and every other laser front-end reads
// those numbers to decide which cut setting a shape belongs to, so they have to
// survive the conversion or the user reassigns every setting by hand.
//
// BE STRAIGHT ABOUT WHAT THIS IS. Indices 0-9 and 250-255 below are the
// documented fixed entries. The 240 chromatic entries between them are
// GENERATED from the palette's documented scheme - twenty-four hues at fifteen
// degrees, five brightness levels, each at full and at one-third saturation -
// and have NOT been compared against a reference table from AutoCAD, because
// there is no AutoCAD in this environment to compare against. Individual
// entries may be a unit or two off in a channel.
//
// That is acceptable here and it is worth saying why: colour in this tool is
// never load-bearing. No coordinate, no dimension and no cut path depends on
// it. What does matter is that the mapping is self-consistent, so that a colour
// read out of a DXF and written back comes out as the same index - and that is
// tested rather than asserted.

const FIXED = {
  1: [255, 0, 0],
  2: [255, 255, 0],
  3: [0, 255, 0],
  4: [0, 255, 255],
  5: [0, 0, 255],
  6: [255, 0, 255],
  // 7 is whatever contrasts with the background - white on a dark canvas, black
  // on a light one. Everything downstream of us is a printed page or a laser
  // that treats a line as a line, so black is the only useful reading.
  7: [0, 0, 0],
  8: [65, 65, 65],
  9: [128, 128, 128],
  250: [51, 51, 51],
  251: [91, 91, 91],
  252: [132, 132, 132],
  253: [173, 173, 173],
  254: [214, 214, 214],
  255: [255, 255, 255],
};

const LEVELS = [255, 189, 129, 104, 79];

/** Full-saturation, full-value RGB for one of the palette's 24 hues. */
function hueRgb(g) {
  const h = g * 15;
  const seg = h / 60;
  const x = Math.floor(255 * (1 - Math.abs((seg % 2) - 1)));
  const i = Math.floor(seg) % 6;
  return [
    [255, x, 0], [x, 255, 0], [0, 255, x],
    [0, x, 255], [x, 0, 255], [255, 0, x],
  ][i];
}

export function aciToRgb(index) {
  const i = Number(index);
  if (FIXED[i]) return FIXED[i].slice();
  if (i < 10 || i > 249) return [0, 0, 0];
  const g = Math.floor((i - 10) / 10);
  const k = (i - 10) % 10;
  const level = LEVELS[k >> 1];
  const pale = (k & 1) === 1;
  const base = hueRgb(g);
  return base.map((c) => {
    const f = c / 255;
    // Full saturation is the hue scaled to this brightness level. One third
    // saturation lifts the floor to two thirds of the level, which is what
    // makes index 11 the familiar pale red (255, 170, 170).
    const v = pale ? level * (2 + f) / 3 : level * f;
    return Math.round(v);
  });
}

export const rgbToHex = ([r, g, b]) => `#${[r, g, b]
  .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
  .join('')}`;

export const aciToHex = (index) => rgbToHex(aciToRgb(index));

export function hexToRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** The palette entry closest to an RGB, by plain squared distance. */
export function rgbToAci(rgb) {
  if (!rgb) return 7;
  let best = 7;
  let bestD = Infinity;
  for (let i = 1; i <= 255; i++) {
    const c = aciToRgb(i);
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * A CSS colour string as an ACI index, for the DXF writer.
 * Anything unreadable falls to 7, which every reader understands and which
 * draws in the machine's default colour rather than in an invented one.
 */
export function cssToAci(css) {
  const s = String(css || '').trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent') return 7;
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return rgbToAci([Number(m[1]), Number(m[2]), Number(m[3])]);
  const hex = hexToRgb(s);
  if (hex) return rgbToAci(hex);
  const named = {
    red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], black: [0, 0, 0],
    white: [255, 255, 255], yellow: [255, 255, 0], cyan: [0, 255, 255],
    magenta: [255, 0, 255], grey: [128, 128, 128], gray: [128, 128, 128],
  };
  return named[s] ? rgbToAci(named[s]) : 7;
}
