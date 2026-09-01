// Procedural board surfaces. No image files: the grain is a sum of sine bands at
// integer frequencies, so the tile is seamless in both directions and one texture
// can repeat across a 900 mm sheet without a visible join.

const SIZE = 512;      // texture pixels
export const TILE_MM = 90; // how many millimetres one tile covers
const PROFILE = 4096;  // samples of the cross-grain profile

const cache = new Map();

function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFrom(seed) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * One period of the cross-grain lightness curve: broad figure from low
 * frequencies, plus sharpened peaks standing in for the pores.
 */
function grainProfile(rand, { figure, pores, poreFreq }) {
  const bands = [1, 2, 3, 5, 7, 11, 13, 17, 23, 29, 37, 43]
    .map((f) => ({ f, a: 1 / Math.sqrt(f), p: rand() * Math.PI * 2 }));
  const norm = bands.reduce((sum, b) => sum + b.a, 0);
  const out = new Float32Array(PROFILE);
  for (let i = 0; i < PROFILE; i++) {
    const x = i / PROFILE;
    let v = 0;
    for (const b of bands) v += b.a * Math.sin(2 * Math.PI * b.f * x + b.p);
    v /= norm;
    let l = 1 + v * figure;
    if (pores > 0) {
      const p = Math.sin(2 * Math.PI * poreFreq * x + v * 2.1);
      l -= Math.max(0, p) ** 14 * pores;
    }
    out[i] = l;
  }
  return out;
}

/**
 * Build a board texture as an ImageData-backed canvas.
 * kind: 'wood' (figured grain) | 'mdf' (flat, fine speckle) | 'none'.
 */
export function boardCanvas(hex, kind = 'wood') {
  const key = `${hex}|${kind}`;
  if (cache.has(key)) return cache.get(key);
  if (kind === 'none') {
    cache.set(key, null);
    return null;
  }

  const rand = rngFrom(seedFrom(key));
  const wood = kind === 'wood';
  const profile = grainProfile(rand, wood
    ? { figure: 0.055, pores: 0.13, poreFreq: 96 }
    : { figure: 0.02, pores: 0, poreFreq: 0 });

  // Grain lines drift a little down the board instead of running dead straight.
  const wobble = new Float32Array(SIZE);
  const w1 = rand() * Math.PI * 2;
  const w2 = rand() * Math.PI * 2;
  for (let y = 0; y < SIZE; y++) {
    const t = y / SIZE;
    // Only a whisper of drift - sawn boards run far straighter than a wood-grain
    // shader usually admits, and the reference veneer is straighter still.
    wobble[y] = wood
      ? 0.0035 * Math.sin(2 * Math.PI * 1 * t + w1) + 0.0015 * Math.sin(2 * Math.PI * 3 * t + w2)
      : 0;
  }

  const [r0, g0, b0] = hexToRgb(hex);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  const speckle = wood ? 0.012 : 0.05;

  let n = 0;
  for (let y = 0; y < SIZE; y++) {
    const wob = wobble[y];
    for (let x = 0; x < SIZE; x++) {
      let u = x / SIZE + wob;
      u -= Math.floor(u);
      let l = profile[(u * PROFILE) | 0];
      // hash noise keyed on the pixel, so it tiles without a seam
      const h = Math.imul((x * 73856093) ^ (y * 19349663), 2654435761) >>> 0;
      l += ((h / 4294967296) - 0.5) * speckle;
      const i = n++ * 4;
      d[i] = Math.max(0, Math.min(255, r0 * l));
      d[i + 1] = Math.max(0, Math.min(255, g0 * l));
      d[i + 2] = Math.max(0, Math.min(255, b0 * l));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, canvas);
  return canvas;
}
