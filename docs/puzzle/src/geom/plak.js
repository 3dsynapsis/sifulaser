// The UV Plak tab's product (Boss, 28 Nov 2026): a plaque that stands on a desk. Pure
// arithmetic, no DOM.
//
// Up to three materials, glued together:
//
//   * the front plate, plywood Maple 3mm (or Black): the client's design UV printed on
//     it whole, with the big text too, as a guide for gluing the raised letters on;
//   * a black border glued on the front over the plate's edge, 10 mm wide, cut as four
//     strips with 45° mitred ends (Boss's choice "b") rather than as one frame, so the
//     middle of the sheet is not thrown away. The two long strips are alike, and so are
//     the two short ones;
//   * raised letters, the big text cut from plywood Black 3mm (letters.js finds them);
//   * a base of black acrylic 5mm, one piece (Boss, 28 Nov 2026: "hanya acrylic 5mm satu
//     layer je", "acrylic warna hitam"), the plaque standing in a slot cut through it.
//     The plate stands on "kaki": tenons below the design, as the Stand Nama tab makes
//     them (Boss, 28 Nov 2026: "kau boleh tengok tab stand nama"), one on a narrow
//     plate and two on a wide one, each stopping 14 mm short of its end. The base is
//     slotted only where they go, so a bridge of acrylic stays between the slots. Each
//     goes 4 mm into the base (TONGUE_MM; "maksimum kedalaman dia 4 mm"): 1 mm short of
//     its 5, so nothing pokes out underneath and the base sits flat. The plate's
//     bottom edge between and beside them is the shoulder that rests on the base, so the
//     depth is exact, and the whole design and its bottom border stay above the base.
//
// The white ink goes under the design's ink only (Boss, 28 Nov 2026: "white bawah gambar
// dan tulisan sahaja, biar kayu nampak"): inkMask, from the print picture's own pixels.
// Where the design is white nothing is printed at all, and the maple shows.
//
// The size is the plate's face, which is the design: the client's A4 page makes an A4
// plaque. The border lies over the design's outer 10 mm, where a plaque design leaves
// white anyway; the tab warns when there is ink under it. The print stops 2 mm under the
// border (PLAK_BLEED_MM), so the glue holds on wood and a print a little off still meets
// the border. With no border the print runs 2 mm past the plate's edge instead.
//
// The plate is cut inside a frame of the same sheet and UV printed while it still sits
// in it, as the UV File tab's panel is (panel.js): the frame's corner goes into the bed's
// corner, and the print file is a page the size of the frame.

import { fitsBed, PAPERS, UV_BED_MM } from './poster.js';
import { letterPath, splitLoops } from './letters.js';

export const PLAK_BORDER_MM = 10;
export const PLAK_BLEED_MM = 2;
export const PLAK_FRAME_MM = 10;      // the sheet round the plate, held for the UV bed
export const PLAK_THICK_MM = 3;       // both plywoods
export const PLAK_MIN_MM = 60;        // the plate's short side, at the least
export const BASE_LAYER_MM = 5;       // acrylic, one piece
export const TONGUE_MM = 4;           // how far the feet go into the base, short of its 5
// The feet and their slots, as the Stand Nama tab has them (its slotInset and its rule
// for one foot or two). A slot is the foot's own size, nominal: the laser's kerf makes
// the slot a little bigger and the foot a little smaller, and that is the play.
export const TENON_INSET_MM = 14;
export const TENON_TWO_FROM_MM = 110;
export const TENON_SHARE = 0.36;
export const BASE_OVERHANG_MM = 15;   // the base past the plate, each side
export const BASE_CORNER_MM = 5;
export const BASE_DEPTH_MIN_MM = 50;
export const BASE_DEPTH_MAX_MM = 120;
export const STRIP_GAP_MM = 3;        // between strips on the black sheet
export const CUSTOM_MAX_MM = UV_BED_MM.long - 2 * PLAK_FRAME_MM;

/**
 * The two plywoods (Boss, 28 Nov 2026). `label` goes on the cut file as it stands here.
 * `colour` is for the preview only.
 */
export const PLAK_MATERIALS = [
  { id: 'maple-3', label: 'Plywood Maple 3mm', kind: 'Maple', thick: '3 mm', colour: '#e4c99b' },
  { id: 'black-3', label: 'Plywood Black 3mm', kind: 'Black', thick: '3 mm', colour: '#1f1f22' },
];
// Black acrylic (Boss, 28 Nov 2026), named the way the shop's labels name acrylic.
export const BASE_MATERIAL = { id: 'acrylic-black-5', label: 'Acrylic Hitam 5mm', colour: '#121214', edge: '#3a3a40' };

/** Which part is cut from which plywood by default. */
export const PLAK_PARTS = [
  { id: 'front', label: 'Plak depan', fallback: 'maple-3' },
  { id: 'border', label: 'Border', fallback: 'black-3' },
  { id: 'letters', label: 'Huruf timbul', fallback: 'black-3' },
];

export const plakMaterial = (id, fallback = PLAK_MATERIALS[0].id) => PLAK_MATERIALS.find((m) => m.id === id)
  || PLAK_MATERIALS.find((m) => m.id === fallback) || PLAK_MATERIALS[0];

/** Every part's material, each one checked: unknown ids land on that part's default. */
export function cleanMaterials(raw) {
  const out = {};
  for (const part of PLAK_PARTS) out[part.id] = plakMaterial(raw?.[part.id], part.fallback).id;
  return out;
}

/** The sizes offered: a paper's long side, the file's own size, or a width typed in. */
export const PLAK_SIZES = [
  ...PAPERS.filter((p) => p.id !== 'A2').map((p) => ({ id: p.id, label: p.id, long: p.long })),
  { id: 'file', label: 'Ikut file' },
  { id: 'custom', label: 'Taip sendiri' },
];
export const plakSizeId = (id) => (PLAK_SIZES.some((s) => s.id === id) ? id : 'A4');

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A typed width, mm, kept to what can be made; null when it is not a number. */
export function cleanCustom(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? r1(clamp(n, PLAK_MIN_MM, CUSTOM_MAX_MM)) : null;
}

/**
 * The plate's face: the design at its size, mm. The ratio is the page's, always.
 * @param size   an id from PLAK_SIZES
 * @param custom the typed width, for 'custom'
 */
export function plakSize(pageW, pageH, size, custom) {
  const ratio = pageW / pageH;
  const paper = PLAK_SIZES.find((s) => s.id === size && s.long);
  if (paper) {
    // A page within a millimetre of the paper's own ratio is that paper: CorelDRAW saves
    // A4 as 297 x 210.2, and a plaque 0.2 mm off A4 helps no one.
    const short = PAPERS.find((p) => p.id === paper.id).short;
    const other = r1(paper.long / Math.max(ratio, 1 / ratio));
    const side = Math.abs(other - short) <= 1 ? short : other;
    return ratio >= 1 ? { width: paper.long, height: side } : { width: side, height: paper.long };
  }
  if (size === 'custom' && cleanCustom(custom) != null) {
    const width = cleanCustom(custom);
    return { width, height: r1(width / ratio) };
  }
  return { width: r1(pageW), height: r1(pageH) };
}

/** A trapezoid strip lying flat, its long edge `long`, as wide as `b`: wide side up or down. */
export function stripPoints(long, b, wideUp) {
  return wideUp
    ? [[0, 0], [long, 0], [long - b, b], [b, b]]
    : [[b, 0], [long - b, 0], [long, b], [0, b]];
}

/**
 * The border's four strips where they lie on the plate's face (W x H, mm from its
 * top-left), mitred at 45° so each corner meets on the diagonal.
 */
export function borderStrips(W, H, b = PLAK_BORDER_MM) {
  return [
    { id: 'top', long: W, points: [[0, 0], [W, 0], [W - b, b], [b, b]] },
    { id: 'bottom', long: W, points: [[0, H], [b, H - b], [W - b, H - b], [W, H]] },
    { id: 'left', long: H, points: [[0, 0], [b, b], [b, H - b], [0, H]] },
    { id: 'right', long: H, points: [[W, 0], [W, H], [W - b, H - b], [W - b, b]] },
  ];
}

/**
 * The strips as they are cut: lying flat in four rows, alternately wide side up and
 * down, so the slanted ends of one row sit over the next. mm from the block's corner.
 */
export function stripLayout(W, H, b = PLAK_BORDER_MM, gap = STRIP_GAP_MM) {
  const rows = [
    { id: 'top', long: W, wideUp: true },
    { id: 'bottom', long: W, wideUp: false },
    { id: 'left', long: H, wideUp: true },
    { id: 'right', long: H, wideUp: false },
  ];
  const pieces = rows.map((row, i) => ({
    id: row.id,
    long: row.long,
    points: stripPoints(row.long, b, row.wideUp).map(([x, y]) => [x, r2(y + i * (b + gap))]),
  }));
  return { width: Math.max(W, H), height: r2(4 * b + 3 * gap), pieces };
}

/**
 * Where the plate's feet go along its bottom edge, mm from its left: the Stand Nama
 * tab's rule (tenonSpans there). One long foot on a narrow plate; two on a wide one,
 * each TENON_SHARE of the span, so the base keeps a bridge between its slots and does
 * not flex while the glue goes off.
 */
export function tenonSpans(W, inset = TENON_INSET_MM, twoFrom = TENON_TWO_FROM_MM) {
  const ins = clamp(inset, 3, Math.max(3, W * 0.3));
  const a = ins;
  const b = W - ins;
  if (b - a < 12) return [[r2(W / 2 - 6), r2(W / 2 + 6)]];
  if (b - a < twoFrom) return [[r2(a), r2(b)]];
  const w = (b - a) * TENON_SHARE;
  return [[r2(a), r2(a + w)], [r2(b - w), r2(b)]];
}

/**
 * The base for a plate W wide whose face is H high: one piece of acrylic with a slot
 * through it for each foot; the feet go TONGUE_MM into it.
 * @param tenons the feet, from tenonSpans(W)
 */
export function planBase(W, H, tenons = tenonSpans(W)) {
  const n = 1;
  const length = r1(W + 2 * BASE_OVERHANG_MM);
  // About a third of the plaque's height, so a tall one does not tip; in 5 mm steps.
  const depth = clamp(Math.round((H * 0.3) / 5) * 5, BASE_DEPTH_MIN_MM, BASE_DEPTH_MAX_MM);
  const slots = tenons.map(([a, b]) => ({
    x: r2(BASE_OVERHANG_MM + a), y: r2((depth - PLAK_THICK_MM) / 2), length: r2(b - a), width: PLAK_THICK_MM,
  }));
  return {
    length,
    depth,
    layers: n,
    slots,
    slotDepth: n * BASE_LAYER_MM,
    tongue: Math.min(TONGUE_MM, n * BASE_LAYER_MM),
    height: n * BASE_LAYER_MM,
    pieces: [{ id: 'base', slot: true }],
  };
}

/** The plate's outline with its feet, mm from the face's top-left, y down. */
export function plateOutline(W, H, tenons, depth) {
  const pts = [[0, 0], [W, 0], [W, H]];
  for (const [a, b] of [...tenons].sort((p, q) => q[0] - p[0])) {
    pts.push([b, H], [b, r2(H + depth)], [a, r2(H + depth)], [a, H]);
  }
  pts.push([0, H]);
  return pts;
}

/**
 * Everything about one plaque.
 *
 * @param o { pageW, pageH: the design's page, mm; size, custom; border: boolean;
 *            base: boolean }
 */
export function planPlak(o) {
  const { width: W, height: H } = plakSize(o.pageW, o.pageH, o.size, o.custom);
  const border = o.border ? PLAK_BORDER_MM : 0;
  const tenons = o.base ? tenonSpans(W) : [];
  const base = o.base ? planBase(W, H, tenons) : null;
  const tongue = base ? base.tongue : 0;
  const F = PLAK_FRAME_MM;
  const design = { x: F, y: F, width: W, height: H };
  // Under the border the print stops PLAK_BLEED_MM in; with none it runs that far out.
  const inset = border ? border - PLAK_BLEED_MM : -PLAK_BLEED_MM;
  const printBox = {
    x: r2(F + inset), y: r2(F + inset), width: r2(W - 2 * inset), height: r2(H - 2 * inset),
  };
  const page = { width: r2(W + 2 * F), height: r2(H + tongue + 2 * F) };
  return {
    width: W,
    height: H,
    ratio: o.pageW / o.pageH,
    // Page mm to plate mm. The two differ only by the snap to a paper's size.
    scale: W / o.pageW,
    scaleY: H / o.pageH,
    border,
    tongue,
    tenons,
    plate: { width: W, height: r2(H + tongue), outline: plateOutline(W, H, tenons, tongue) },
    frame: F,
    page,
    design,
    printBox,
    strips: border ? borderStrips(W, H, border) : [],
    base,
    fitsBed: fitsBed(page.width, page.height),
    tooSmall: Math.min(W, H) < PLAK_MIN_MM,
  };
}

/** The plaque standing on its base, mm: what the finished thing measures. Its face starts on top of the base. */
export const standingSize = (plan) => ({
  width: plan.base ? Math.max(plan.width, plan.base.length) : plan.width,
  height: r1(plan.height + (plan.base ? plan.base.height : 0)),
  depth: plan.base ? plan.base.depth : PLAK_THICK_MM * (plan.border ? 2 : 1),
});

/**
 * How close the design's ink comes to the plate's edge, mm on the plate, from a
 * findContent box on a raster of the page. The border covers PLAK_BORDER_MM of it.
 */
export function inkMargin(box, mmPerPx, plan) {
  if (!box) return null;
  const k = plan.scale;
  const pageW = plan.width / k;
  const pageH = plan.height / k;
  return r1(k * Math.min(
    box.x0 * mmPerPx, box.y0 * mmPerPx, pageW - (box.x1 + 1) * mmPerPx, pageH - (box.y1 + 1) * mmPerPx,
  ));
}

/** A closed polygon as path data, mm, moved by (dx, dy). */
export function polyPath(points, dx = 0, dy = 0) {
  return `${points.map(([x, y], i) => `${i ? 'L' : 'M'} ${r2(x + dx)} ${r2(y + dy)}`).join(' ')} Z`;
}

/** A rectangle with rounded corners as path data, mm. r 0 is square. */
export function roundRectPath(x, y, w, h, r = 0) {
  if (!r) return polyPath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const q = Math.min(r, w / 2, h / 2);
  const f = (v) => r2(v);
  return `M ${f(x + q)} ${f(y)} L ${f(x + w - q)} ${f(y)} A ${q} ${q} 0 0 1 ${f(x + w)} ${f(y + q)} `
    + `L ${f(x + w)} ${f(y + h - q)} A ${q} ${q} 0 0 1 ${f(x + w - q)} ${f(y + h)} `
    + `L ${f(x + q)} ${f(y + h)} A ${q} ${q} 0 0 1 ${f(x)} ${f(y + h - q)} `
    + `L ${f(x)} ${f(y + q)} A ${q} ${q} 0 0 1 ${f(x + q)} ${f(y)} Z`;
}

// ---- the cut files ---------------------------------------------------------------------

export const BASE_GAP_MM = 5;   // between the base's pieces on the acrylic
/** Written under the material of the raised parts on the cut file (Boss, 28 Nov 2026). */
export const TAPE_NOTE = '(Tambah Double Tape)';

/** The letters' box on the plate, mm: page mm times the plan's scales. */
export function lettersBox(letters, scale, scaleY = scale) {
  if (!letters.length) return null;
  const x0 = Math.min(...letters.map((l) => l.box.x));
  const y0 = Math.min(...letters.map((l) => l.box.y));
  const x1 = Math.max(...letters.map((l) => l.box.x + l.box.width));
  const y1 = Math.max(...letters.map((l) => l.box.y + l.box.height));
  return {
    x: r2(x0 * scale), y: r2(y0 * scaleY), width: r2((x1 - x0) * scale), height: r2((y1 - y0) * scaleY),
  };
}

/**
 * What is cut, grouped by what it is cut from: one cut file per material. Each part is a
 * block, its paths in mm from the block's corner; `order` is when a path is cut, low
 * first, so nothing comes loose before what is inside it is cut (counters before
 * letters, the slot before the base, the plate before its frame).
 *
 * The letters keep their places as on the plate, so they can be lifted together on
 * transfer tape and laid on the printed guide in one go.
 *
 * @param letters   the chosen candidates from findLetters, page mm
 * @param materials { front, border, letters }: material ids
 * @returns [{ material: { id, label }, parts: ['front' | 'border' | 'letters' | 'base'], blocks,
 *          note }]: note, a line for the operator under the material (TAPE_NOTE)
 */
export function plakCutJobs(plan, letters, materials) {
  const mats = cleanMaterials(materials);
  const jobs = new Map();
  const add = (materialId, part, block) => {
    if (!jobs.has(materialId)) jobs.set(materialId, { parts: [], blocks: [] });
    jobs.get(materialId).parts.push(part);
    jobs.get(materialId).blocks.push(block);
  };
  const { page, frame: F, plate } = plan;
  add(mats.front, 'front', {
    id: 'front',
    width: page.width,
    height: page.height,
    paths: [
      { id: 'plate', stroke: 'hair', order: 4, d: polyPath(plate.outline, F, F) },
      { id: 'frame', stroke: 'cut', order: 9, d: polyPath([[0, 0], [page.width, 0], [page.width, page.height], [0, page.height]]) },
    ],
  });
  if (plan.border) {
    const lay = stripLayout(plan.width, plan.height, plan.border);
    add(mats.border, 'border', {
      id: 'border',
      width: lay.width,
      height: lay.height,
      paths: [{ id: 'strips', stroke: 'hair', order: 3, d: lay.pieces.map((p) => polyPath(p.points)).join(' ') }],
    });
  }
  const box = letters?.length ? lettersBox(letters, plan.scale, plan.scaleY) : null;
  if (box) {
    const holes = [];
    const outer = [];
    for (const l of letters) {
      const parts = splitLoops(l);
      const move = (loops) => letterPath({ loops }, plan.scale, -box.x, -box.y, plan.scaleY);
      if (parts.holes.length) holes.push(move(parts.holes));
      if (parts.outer.length) outer.push(move(parts.outer));
    }
    add(mats.letters, 'letters', {
      id: 'letters',
      width: box.width,
      height: box.height,
      paths: [
        { id: 'counters', stroke: 'hair', order: 1, d: holes.join(' ') },
        { id: 'letters', stroke: 'hair', order: 2, d: outer.join(' ') },
      ].filter((p) => p.d),
    });
  }
  // The sheet the raised parts come from gets double tape on its back before it is cut,
  // so each piece comes off ready to stick on (Boss, 28 Nov 2026). Not the plate's sheet.
  const tape = (parts) => parts.some((p) => p === 'letters' || p === 'border') && !parts.includes('front');
  const out = PLAK_MATERIALS.filter((m) => jobs.has(m.id)).map((m) => ({
    material: m,
    ...jobs.get(m.id),
    ...(tape(jobs.get(m.id).parts) ? { note: TAPE_NOTE } : {}),
  }));
  if (plan.base) {
    const b = plan.base;
    const slots = [];
    const outlines = [];
    b.pieces.forEach((piece, i) => {
      const y = i * (b.depth + BASE_GAP_MM);
      if (piece.slot) {
        for (const sl of b.slots) {
          slots.push(polyPath([[sl.x, sl.y], [sl.x + sl.length, sl.y], [sl.x + sl.length, sl.y + sl.width], [sl.x, sl.y + sl.width]], 0, y));
        }
      }
      outlines.push(roundRectPath(0, y, b.length, b.depth, BASE_CORNER_MM));
    });
    out.push({
      material: BASE_MATERIAL,
      parts: ['base'],
      blocks: [{
        id: 'base',
        width: b.length,
        height: r2(b.layers * b.depth + (b.layers - 1) * BASE_GAP_MM),
        paths: [
          { id: 'slots', stroke: 'hair', order: 5, d: slots.join(' ') },
          { id: 'base', stroke: 'hair', order: 6, d: outlines.join(' ') },
        ],
      }],
    });
  }
  return out;
}

// ---- the white ink ----------------------------------------------------------------------

/** Lighter than this on every channel is the design's white: no ink, and no white under it. */
export const INK_WHITE_LEVEL = 240;
export const WHITE_MODES = [
  { id: 'design', label: 'Bawah design sahaja', note: 'kayu nampak' },
  { id: 'full', label: 'Penuh', note: 'latar putih' },
];
export const whiteMode = (id) => (WHITE_MODES.some((m) => m.id === id) ? id : WHITE_MODES[0].id);

/**
 * Where a picture has ink, as the stencil the white ink is printed through: one bit a
 * pixel, rows padded to a byte, 0 where there is ink (a PDF image mask paints its 0s)
 * and 1 where there is none. The picture is changed too: its near-white is made pure
 * white, so not even a haze of colour lands on the bare wood.
 *
 * @returns { bits, width, height, inked }: inked, how many pixels get white
 */
export function inkMask(rgba, width, height, level = INK_WHITE_LEVEL) {
  const stride = Math.ceil(width / 8);
  const bits = new Uint8Array(stride * height).fill(0xff);
  let inked = 0;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (rgba[p + 3] > 127 && (rgba[p] < level || rgba[p + 1] < level || rgba[p + 2] < level)) {
        bits[row + (x >> 3)] &= ~(0x80 >> (x & 7));
        inked++;
      } else {
        rgba[p] = 255;
        rgba[p + 1] = 255;
        rgba[p + 2] = 255;
        rgba[p + 3] = 255;
      }
    }
  }
  return { bits, width, height, inked };
}
