// Layers, the way a laser operator thinks about a file: by colour.
//
// Every painted object lands in one or two layers - its outline in a line layer
// of that colour, its fill in a fill layer of that colour - and every layer has
// one job:
//
//   cut      Potong         along every line and every shape's edge
//   engrave  Ukir           raster-fill shapes; engrave lines and pictures
//   score    Garisan halus  a vector line at score speed, along lines and edges
//   ignore   Abaikan        nothing
//
// The guesses below are only the starting point: customers do not agree on a
// colour code (plenty cut in blue and score in red), so the screen lists every
// layer and the customer can change any of them.
//
// Line and fill of one colour are separate layers on purpose. The commonest file
// of all is a black hairline outline with black lettering inside it: one layer
// "black" could only be cut or engraved, and either answer is wrong for half of
// it. A shape outlined in its own fill colour (CorelDRAW's default outline) is
// one shape, so its outline joins the fill layer instead.
//
// Pure: no DOM. Runs in the worker and under node.

import { isCutColour } from './pdf/content.js';
import { MM_PER_PT, outermostRoots } from './cut.js';

export const ROLES = ['cut', 'engrave', 'score', 'ignore'];
export const ROLE_LABEL = { cut: 'Potong', engrave: 'Ukir', score: 'Garisan halus', ignore: 'Abaikan' };
export const THICK_MM = 0.5; // a line this wide is artwork, engraved, not a cut
const NEAR_WHITE = 0.94;
const BACKGROUND_SHARE = 0.85; // a fill covering this much of a piece is its board colour

const q15 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 15);
export const hexOf = (rgb) => `#${rgb.map((v) => q15(v).toString(16).repeat(2)).join('')}`;
const rgbOfHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const isWhiteish = (rgb) => !!rgb && rgb[0] >= NEAR_WHITE && rgb[1] >= NEAR_WHITE && rgb[2] >= NEAR_WHITE;
export const isBlue = (rgb) => !!rgb && rgb[2] >= 0.5 && rgb[2] > rgb[0] + 0.25 && rgb[2] > rgb[1] + 0.15;
const sameColour = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.3;

/** A colour's everyday Malay name. */
export function colourName(rgb) {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (l <= 0.16) return 'Hitam';
  if (l >= NEAR_WHITE && d < 0.08) return 'Putih';
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15) return l > 0.6 ? 'Kelabu muda' : 'Kelabu';
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  if (h < 15 || h >= 340) return l < 0.3 ? 'Merah gelap' : 'Merah';
  if (h < 45) return l < 0.4 ? 'Coklat' : 'Oren';
  if (h < 70) return l < 0.35 ? 'Coklat' : 'Kuning';
  if (h < 165) return 'Hijau';
  if (h < 200) return 'Biru muda';
  if (h < 255) return 'Biru';
  if (h < 290) return 'Ungu';
  return 'Merah jambu';
}

const firstCut = (sep) => (Array.isArray(sep) ? sep.find((n) => n && n !== 'None') : null);

/**
 * Which layer each part of each path belongs to.
 * @returns { parts: [{ stroke: key|null, fill: key|null }] per read.paths,
 *            rasterKey, layers: Map<key, layer> }
 */
export function assignLayers(read) {
  const layers = new Map();
  const touch = (key, make) => {
    if (!layers.has(key)) layers.set(key, { key, n: 0, ...make() });
    layers.get(key).n++;
    return key;
  };
  // A DXF's own layer names travel with the colour ("DIMENSIONS", "CUT"),
  // because in CAD files the layer, not the colour, says what a line is for.
  const colourLayer = (prefix, rgb, kind, file = null) => {
    const hex = hexOf(rgb);
    return touch(`${prefix}:${hex}${file ? `:${file}` : ''}`, () => ({ kind, colour: hex, rgb: rgbOfHex(hex), name: colourName(rgbOfHex(hex)), file }));
  };

  const parts = read.paths.map((p) => {
    if (p.frame) return { stroke: touch('B', () => ({ kind: 'frame', colour: null, name: 'Bingkai gambar' })), fill: null };
    if (p.clipPainted) return { stroke: null, fill: touch('I', () => ({ kind: 'image', colour: null, name: 'Gambar' })) };
    const cutLayer = p.oc?.find((g) => /cut/i.test(g.name));
    if (cutLayer) {
      const key = touch(`O:${cutLayer.name}`, () => ({ kind: 'named', colour: null, name: `Lapisan '${cutLayer.name}'`, cutHint: true }));
      return { stroke: p.stroke ? key : null, fill: p.fill ? key : null };
    }
    const out = { stroke: null, fill: null };
    if (p.fill && p.fillRGB) {
      out.fill = isCutColour(p.fillSep)
        ? touch(`S:${firstCut(p.fillSep)}`, () => ({ kind: 'spot', colour: null, name: `Warna spot '${firstCut(p.fillSep)}'`, cutHint: true }))
        : colourLayer('F', p.fillRGB, 'fill');
    }
    if (p.stroke && p.strokeRGB) {
      const ownOutline = p.fill && !isCutColour(p.strokeSep) && sameColour(p.fillRGB, p.strokeRGB);
      if (!ownOutline) {
        out.stroke = isCutColour(p.strokeSep)
          ? touch(`S:${firstCut(p.strokeSep)}`, () => ({ kind: 'spot', colour: null, name: `Warna spot '${firstCut(p.strokeSep)}'`, cutHint: true }))
          : colourLayer(p.lw * MM_PER_PT >= THICK_MM ? 'T' : 'L', p.strokeRGB, p.lw * MM_PER_PT >= THICK_MM ? 'thick' : 'line', p.dxfLayer || null);
      }
    }
    return out;
  });
  const rasterKey = (read.rasters || []).length ? touch('I', () => ({ kind: 'image', colour: null, name: 'Gambar' })) : null;
  if (rasterKey) layers.get('I').n += read.rasters.length - 1;
  return { parts, rasterKey, layers };
}

/**
 * The starting job for every layer. `roots` (optional) are the outermost
 * outlines of everything visible, so a fill layer made only of whole shapes
 * (acrylic letters, a filled plaque) starts as Potong and one sitting inside
 * something else (lettering on a plaque) starts as Ukir.
 */
export function defaultRoles(read, assigned) {
  const roles = {};
  const { parts, layers } = assigned;
  const visible = read.paths.filter((p, i) => {
    const k = [parts[i].stroke, parts[i].fill].filter(Boolean);
    return k.length && k.some((key) => {
      const L = layers.get(key);
      return !(L.rgb && isWhiteish(L.rgb)) && !(read.paths[i].backdrop);
    });
  });
  let roots = [];
  try {
    roots = outermostRoots(visible, { mediaBox: read.page?.mediaBox || null }).roots;
  } catch {
    // too many outlines to tell: every fill layer starts as Ukir
  }
  const rootPaths = new Set(roots.map((r) => r.path));
  // A fill covering (nearly) a whole piece is the colour of the board in a
  // mockup, not a request to engrave the entire surface: as engraving it turns
  // a RM30 cut job into hundreds of ringgit. It starts as Abaikan and the
  // customer is told, so they can switch it on if they really mean it.
  const pathBox = (p) => {
    let bb = null;
    for (const s of p.subs) bb = bb ? [Math.min(bb[0], s.bb[0]), Math.min(bb[1], s.bb[1]), Math.max(bb[2], s.bb[2]), Math.max(bb[3], s.bb[3])] : [...s.bb];
    return bb;
  };
  const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const isBackground = (p) => {
    const bb = pathBox(p);
    if (!bb || roots.length > 500) return false;
    return roots.some((r) => {
      if (r.path === p) return false;
      const ov = [Math.max(bb[0], r.bb[0]), Math.max(bb[1], r.bb[1]), Math.min(bb[2], r.bb[2]), Math.min(bb[3], r.bb[3])];
      const ra = area(r.bb);
      return ra > 0 && area(ov) >= BACKGROUND_SHARE * ra && area(bb) <= ra / BACKGROUND_SHARE;
    });
  };
  // Fill layers last: whether a fill is only a mockup depends on its outline's job.
  const ordered = [...layers.values()].sort((A, B) => (A.kind === 'fill') - (B.kind === 'fill'));
  for (const L of ordered) {
    let role;
    if (L.cutHint || L.kind === 'frame') role = 'cut';
    else if (L.kind === 'image') role = 'engrave';
    else if (L.rgb && isWhiteish(L.rgb)) role = 'ignore';
    else if (L.kind === 'thick') role = 'engrave';
    else if (L.file && /cut|potong/i.test(L.file)) role = 'cut';
    else if (L.file && /dim|anno|text|title|border|frame|construct|hidden|defpoints/i.test(L.file)) role = 'ignore';
    else if (L.kind === 'line') role = isBlue(L.rgb) ? 'score' : 'cut';
    else {
      // A fill layer: whole shapes are cut out, shapes inside something are engraved.
      const idx = [];
      read.paths.forEach((p, i) => { if (parts[i].fill === L.key) idx.push(i); });
      const own = idx.map((i) => read.paths[i]);
      const backdrop = own.length && own.every((p) => p.backdrop);
      // Every shape outlined in a cut colour of its own (a pale fill inside a
      // red hairline): the line says "cut here", the fill is a mockup colour.
      const mockup = idx.length && idx.every((i) => parts[i].stroke && roles[parts[i].stroke] === 'cut');
      if (backdrop || mockup) role = 'ignore';
      else if (own.length && own.every((p) => rootPaths.has(p))) role = 'cut';
      else if (own.length && own.every((p) => rootPaths.has(p) || isBackground(p))) { role = 'ignore'; L.background = true; }
      else role = 'engrave';
    }
    roles[L.key] = role;
  }
  return roles;
}

/** Layers in the order the screen lists them: by job, then by size. */
export function layerList(assigned, roles) {
  const order = { cut: 0, score: 1, engrave: 2, ignore: 3 };
  return [...assigned.layers.values()]
    .map((L) => ({ key: L.key, name: L.name, kind: L.kind, colour: L.colour, file: L.file || null, n: L.n, background: !!L.background, role: roles[L.key] || 'ignore' }))
    .sort((a, b) => order[a.role] - order[b.role] || b.n - a.n || a.key.localeCompare(b.key));
}
