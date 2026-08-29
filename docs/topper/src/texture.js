// Procedural surfaces for the 3D preview. No image files.
//
// Mostly this tool cuts acrylic, and an acrylic finish is barely a picture at
// all. Falcata is the exception and it is the opposite: a wood face IS its
// grain, so that one gets the figured profile the other tools paint. The rest of
// this file is about surfaces that have no pattern - a topper goes into food,
// and where wood is chosen it is a single-use piece, because wood takes up
// washed clean.
//
// An acrylic finish is mostly not a picture at all. A mirror sheet has no
// surface pattern: what makes it read as a mirror is that it is smooth, that it
// is metallic, and that there is a room for it to reflect. So the work splits
// three ways:
//
//   boardCanvas      the colour on the face, and only glitter has one
//   roughnessCanvas  how polished each spot is - the whole of glitter's sparkle
//   studioEnvCanvas  the room the mirror finishes reflect
//
// The first two are keyed to the same fleck field, so a fleck that is brighter
// is also the fleck that is shinier. Painting them independently would give a
// sheet with white dots on it rather than glitter.

const SIZE = 512;          // texture pixels
export const TILE_MM = 40; // how many millimetres one tile covers

/**
 * How many millimetres one tile covers, per finish.
 *
 * Glitter is flecks a few tenths of a millimetre across, so its tile has to be
 * small or the flecks come out the size of dinner plates. Wood is the opposite:
 * the figure in a board runs over tens of millimetres, and at a 40 mm tile it
 * repeats twice inside a single letter and reads as noise rather than as grain.
 * Ninety is what the Box Maker paints a board face at, and it is the scale the
 * profile was drawn for.
 */
export const tileFor = (kind) => (kind === 'wood' ? 90 : TILE_MM);

const cache = new Map();

function rngFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const clamp255 = (v) => Math.max(0, Math.min(255, v));

function blankCanvas(w = SIZE, h = SIZE) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const PROFILE = 4096;   // samples of the cross-grain lightness curve

/**
 * One period of the cross-grain lightness curve, ported from 12_Box Maker.
 *
 * A sum of sine bands at INTEGER frequencies, which is the whole trick: an
 * integer number of periods across the tile means the left edge meets the right
 * edge exactly, so one 40 mm tile repeats across a whole topper with no seam to
 * spot. The sharpened peaks stand in for the open pores that make falcata read
 * as falcata rather than as beige.
 */
function grainProfile(rand, { figure, pores, poreFreq }) {
  const bands = [1, 2, 3, 5, 7, 11, 13, 17, 23, 29, 37, 43]
    .map((f) => ({ f, a: 1 / Math.sqrt(f), p: rand() * Math.PI * 2 }));
  const norm = bands.reduce((sum, b) => sum + b.a, 0);
  const out = new Float32Array(PROFILE);
  for (let i = 0; i < PROFILE; i++) {
    let v = 0;
    for (const b of bands) v += b.a * Math.sin(2 * Math.PI * b.f * (i / PROFILE) + b.p);
    v /= norm;
    let l = 1 + v * figure;
    if (pores > 0) {
      const pk = Math.sin(2 * Math.PI * poreFreq * (i / PROFILE) + v * 2.1);
      l -= Math.max(0, pk) ** 14 * pores;
    }
    out[i] = l;
  }
  return out;
}

/** A wood face: the grain profile swept down the board with a whisper of drift. */
function woodCanvas(hex) {
  const rand = rngFrom(`wood|${hex}`);
  const profile = grainProfile(rand, { figure: 0.055, pores: 0.13, poreFreq: 96 });
  const w1 = rand() * Math.PI * 2;
  const w2 = rand() * Math.PI * 2;
  const [r0, g0, b0] = hexToRgb(hex);
  const canvas = blankCanvas();
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  let n = 0;
  for (let y = 0; y < SIZE; y++) {
    const t = y / SIZE;
    // Sawn boards run far straighter than a wood shader usually admits.
    const wob = 0.0035 * Math.sin(2 * Math.PI * t + w1)
      + 0.0015 * Math.sin(6 * Math.PI * t + w2);
    for (let x = 0; x < SIZE; x++) {
      let u = x / SIZE + wob;
      u -= Math.floor(u);
      let l = profile[(u * PROFILE) | 0];
      // Hash noise keyed on the pixel, so the speckle tiles without a seam too.
      const h = Math.imul((x * 73856093) ^ (y * 19349663), 2654435761) >>> 0;
      l += (h / 4294967296 - 0.5) * 0.012;
      const k = n++ * 4;
      d[k] = clamp255(r0 * l);
      d[k + 1] = clamp255(g0 * l);
      d[k + 2] = clamp255(b0 * l);
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * A field of glitter flecks: 0 away from one, 1 at its centre.
 *
 * Flecks are written with wrapped indices so the tile joins itself in both
 * directions. One 40 mm tile has to repeat across a 400 mm topper without the
 * join showing up as a line of bare acrylic.
 *
 * At 512 px over 40 mm one pixel is 0.078 mm, so a fleck two or three pixels
 * across is the 0.2 to 0.5 mm a real glitter sheet is loaded with.
 */
function fleckField() {
  if (cache.has('flecks')) return cache.get('flecks');
  const rand = rngFrom('glitter-flecks');
  const f = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < 2400; i++) {
    const cx = rand() * SIZE;
    const cy = rand() * SIZE;
    const r = 1.4 + rand() * 2.2;
    const peak = 0.55 + rand() * 0.45;
    const r2 = r * r;
    const lo = Math.ceil(-r);
    const hi = Math.floor(r);
    for (let dy = lo; dy <= hi; dy++) {
      for (let dx = lo; dx <= hi; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const x = ((((cx + dx) | 0) % SIZE) + SIZE) % SIZE;
        const y = ((((cy + dy) | 0) % SIZE) + SIZE) % SIZE;
        const v = peak * (1 - d2 / r2);
        const k = y * SIZE + x;
        if (v > f[k]) f[k] = v;
      }
    }
  }
  cache.set('flecks', f);
  return f;
}

/**
 * The colour on the face of the sheet.
 *
 * kind: 'none' | 'mirror' | 'clear' | 'glitter' | 'wood'. Only glitter and wood
 * return anything - the rest have no pattern to paint.
 * A plain, mirrored or clear sheet has no pattern to paint - it is the
 * material's own colour, and a map of it would be a flat image the renderer has
 * to sample for no gain. Null means "use the colour directly".
 */
export function boardCanvas(hex, kind = 'none') {
  if (kind === 'wood') {
    const wk = `wood|${hex}`;
    if (!cache.has(wk)) cache.set(wk, woodCanvas(hex));
    return cache.get(wk);
  }
  if (kind !== 'glitter') return null;
  const key = `colour|${hex}`;
  if (cache.has(key)) return cache.get(key);

  const f = fleckField();
  const [r0, g0, b0] = hexToRgb(hex);
  const canvas = blankCanvas();
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < SIZE * SIZE; i++) {
    // Flecks go towards white rather than towards a brighter tint: a fleck is a
    // chip of foil suspended in the acrylic, not more acrylic.
    const t = f[i];
    const k = i * 4;
    d[k] = clamp255(r0 + (255 - r0) * t * 0.95);
    d[k + 1] = clamp255(g0 + (255 - g0) * t * 0.95);
    d[k + 2] = clamp255(b0 + (255 - b0) * t * 0.95);
    d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, canvas);
  return canvas;
}

/**
 * How polished each spot on the face is: black is a mirror, white is matt.
 *
 * This is what actually makes glitter sparkle. Each fleck is a tiny mirror in a
 * satin field, so as the piece turns, one fleck after another lines up with a
 * light in the environment and flares. Brightening the colour alone gives a
 * sheet that stays exactly as bright however you turn it, which is the one
 * thing glitter never does.
 */
export function roughnessCanvas(kind = 'none') {
  if (kind !== 'glitter') return null;
  const key = 'rough|glitter';
  if (cache.has(key)) return cache.get(key);

  const f = fleckField();
  const canvas = blankCanvas();
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = clamp255(255 * (0.42 - 0.4 * f[i]));
    const k = i * 4;
    d[k] = v;
    d[k + 1] = v;
    d[k + 2] = v;
    d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, canvas);
  return canvas;
}

/**
 * The room a mirror finish reflects, as an equirectangular panorama.
 *
 * A mirror with nothing to reflect is a flat colour, which is the whole thing
 * this is here to avoid. What sells it is a horizon and a few soft sources:
 * turn the piece and the highlight sweeps across it the way it does on real
 * mirror gold.
 *
 * `pale` follows the stage backdrop, so a mirror on the light backdrop reflects
 * a bright room and on the dark one a dim room. Otherwise the topper looks lit
 * from somewhere other than where it is standing.
 */
export function studioEnvCanvas(pale = true) {
  const key = `env|${pale}`;
  if (cache.has(key)) return cache.get(key);

  const W = 1024;
  const H = 512;
  const canvas = blankCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // The dark room is dimmer, not unlit. A mirror reflects whatever is in front
  // of it, so an environment as dark as the dark backdrop turns mirror silver
  // into a black silhouette - true to the physics and useless as a preview of
  // what somebody is buying. It stays a room with the lights turned down.
  const sky = pale ? ['#ffffff', '#eaeef4', '#bcc3cd'] : ['#dfe3e9', '#a2a8b2', '#6b7078'];
  const floor = pale ? '#9aa0a9' : '#42464d';
  const grad = ctx.createLinearGradient(0, 0, 0, H / 2);
  grad.addColorStop(0, sky[0]);
  grad.addColorStop(0.84, sky[1]);
  grad.addColorStop(1, sky[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H / 2);
  // Below the horizon is a floor, and it is darker than the sky. That step in
  // brightness is the horizon, and the horizon is what makes a mirror read as a
  // mirror instead of as a lump of coloured metal.
  ctx.fillStyle = floor;
  ctx.fillRect(0, H / 2, W, H / 2);

  // Softboxes, high and to either side, the way a table-top shot is lit.
  const lamp = (cx, cy, rx, ry, strength) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, `rgba(255,255,255,${strength})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.fillRect(cx - rx, cy - rx, rx * 2, rx * 2);
    ctx.restore();
  };
  lamp(W * 0.26, H * 0.2, 190, 110, pale ? 1 : 0.9);
  lamp(W * 0.74, H * 0.27, 140, 90, pale ? 0.7 : 0.62);
  lamp(W * 0.5, H * 0.05, 300, 80, pale ? 0.5 : 0.45);

  cache.set(key, canvas);
  return canvas;
}
