// The job sheet: one page holding all three parts of the product, laid out the
// way the shop already draws them in CorelDRAW.
//
//   Clear 3 mm   - the puzzle inside its frame
//   White 3 mm   - four mitred border strips, double tape on the back
//   White 3 mm   - the backing
//
// The sheet is a plain description first (`buildSheet`) and a PDF second
// (`sheetToPdf`). The preview draws the same description, so what is on screen is
// what gets written.
//
// Two things are deliberate:
//
//   * Cutting order. Paths are written puzzle lines, puzzle edge, frame. If the
//     frame goes first the panel is free of the sheet before the pieces are, and
//     they shift as the rest is cut.
//   * The border strips stand a little apart. Touching, each diagonal would be two
//     coincident lines and the laser would run it twice. They are separate objects
//     because they get moved onto offcuts anyway, which is why the border is four
//     strips and not one frame in the first place: it saves material.

import { parsePath, pathToOps, byteLength } from './exportPdf.js';
import { borderPath } from './geom/puzzle.js';
import { FRAME_MM, CORNER_MM } from './geom/poster.js';

const MM_TO_PT = 72 / 25.4;
const PAGE_W = 1200;
const PAGE_H = 900;
const GAP = 64;
const PART_TOP = 382;
const BOTTOM = 63;
const STRIP_GAP = 3;     // how far each border strip stands off its assembled place

const STROKE = { cut: 0.5669, hair: 0.216 };   // pt: 0.2 mm, and Corel's hairline
const SIZE = { header: 129.82, large: 109.46, small: 75.2 };  // pt
const LINE_STEP = 1.117;

// Helvetica's advance widths for ASCII 32-126, per 1000 of the font size. The PDF
// names the font rather than embedding it, so its metrics are known exactly and
// the labels can be centred without a text-measuring library.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Text the PDF's plain font can carry: accents dropped, anything else a "?". */
export const plainText = (s) => String(s ?? '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^\x20-\x7e]/g, '?');

/** Width in mm of plain text at a size in points. */
export function textWidthMm(text, size) {
  let units = 0;
  for (const ch of text) units += WIDTHS[ch.charCodeAt(0) - 32] ?? 556;
  return ((units / 1000) * size) / MM_TO_PT;
}

const sizeMm = (size) => size / MM_TO_PT;
const round3 = (v) => Math.round(v * 1000) / 1000;

/** The same absolute path, moved. */
export function translatePath(d, dx, dy) {
  const parts = [];
  for (const [cmd, ...n] of parsePath(d)) {
    if (cmd === 'Z') {
      parts.push('Z');
    } else if (cmd === 'A') {
      parts.push(`A ${n[0]} ${n[1]} ${n[2]} ${n[3]} ${n[4]} ${round3(n[5] + dx)} ${round3(n[6] + dy)}`);
    } else {
      parts.push(`${cmd} ${n.map((v, i) => round3(v + (i % 2 ? dy : dx))).join(' ')}`);
    }
  }
  return parts.join(' ');
}

const rectPath = (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;

/**
 * The four border strips in their assembled positions, origin at the outer
 * top-left. The rounded outer corner is split at its midpoint, so each strip owns
 * half of each corner. All four run the same way round the outside.
 */
export function borderStrips(W, H, band = FRAME_MM, R = CORNER_MM) {
  const k = round3(R * (1 - Math.SQRT1_2));
  const arc = (x, y) => `A ${R} ${R} 0 0 0 ${round3(x)} ${round3(y)}`;
  return {
    top: `M ${k} ${k} L ${band} ${band} L ${W - band} ${band} L ${round3(W - k)} ${k} `
      + `${arc(W - R, 0)} L ${R} 0 ${arc(k, k)} Z`,
    left: `M ${k} ${k} ${arc(0, R)} L 0 ${H - R} ${arc(k, H - k)} `
      + `L ${band} ${H - band} L ${band} ${band} Z`,
    bottom: `M ${k} ${round3(H - k)} ${arc(R, H)} L ${W - R} ${H} ${arc(W - k, H - k)} `
      + `L ${W - band} ${H - band} L ${band} ${H - band} Z`,
    right: `M ${round3(W - k)} ${round3(H - k)} ${arc(W, H - R)} L ${W} ${R} ${arc(W - k, k)} `
      + `L ${W - band} ${band} L ${W - band} ${H - band} Z`,
  };
}

/** Largest size, up to `size`, at which every line fits in `room` mm. */
function fitSize(lines, size, room) {
  const widest = Math.max(...lines.map((t) => textWidthMm(t, size)));
  return widest > room ? (size * room) / widest : size;
}

/**
 * @param plan    result of planPoster
 * @param puzzle  result of buildPuzzle at plan's size
 * @param meta    { client, dateline }
 */
export function buildSheet(plan, puzzle, meta = {}) {
  const { panel } = plan;
  const borderW = panel.width + 2 * STRIP_GAP;
  const borderH = panel.height + 2 * STRIP_GAP;
  const content = panel.width + GAP + borderW + GAP + panel.width;

  const width = Math.max(PAGE_W, content + 2 * GAP);
  const height = Math.max(PAGE_H, PART_TOP + panel.height + STRIP_GAP + BOTTOM);
  const x0 = (width - content) / 2;
  const xClear = x0;
  const xBorder = xClear + panel.width + GAP;
  const xBacking = xBorder + borderW + GAP;

  const paths = [];

  // Clear: puzzle lines, then the puzzle's own edge, as one compound path. The
  // frame stays a separate object after it, so it is the last thing cut.
  const puzzleD = `${puzzle.h}${puzzle.v}${borderPath(plan.width, plan.height, 0)}`;
  paths.push({
    id: 'puzzle',
    stroke: 'hair',
    d: translatePath(puzzleD, xClear + FRAME_MM, PART_TOP + FRAME_MM),
  });
  paths.push({
    id: 'frame',
    stroke: 'cut',
    d: translatePath(rectPath(panel.width, panel.height), xClear, PART_TOP),
  });

  // White: the strips, each pushed outwards from where it sits when assembled.
  const strips = borderStrips(panel.width, panel.height);
  const bx = xBorder + STRIP_GAP;
  const by = PART_TOP;
  paths.push({ id: 'strip-top', stroke: 'cut', d: translatePath(strips.top, bx, by - STRIP_GAP) });
  paths.push({ id: 'strip-left', stroke: 'cut', d: translatePath(strips.left, bx - STRIP_GAP, by) });
  paths.push({ id: 'strip-right', stroke: 'cut', d: translatePath(strips.right, bx + STRIP_GAP, by) });
  paths.push({ id: 'strip-bottom', stroke: 'cut', d: translatePath(strips.bottom, bx, by + STRIP_GAP) });

  // White: the backing.
  paths.push({
    id: 'backing',
    stroke: 'cut',
    d: translatePath(`${borderPath(panel.width, panel.height, CORNER_MM)} Z`, xBacking, PART_TOP),
  });

  const texts = [];

  // The job, top of the page.
  const headX = width * (298 / PAGE_W);
  const head = [
    `Nama Client: ${plainText(meta.client)}`,
    `Dateline: ${plainText(meta.dateline)}`,
    `PUZZLE ${plan.width} x ${plan.height} mm, ${plan.pieces} pieces`,
  ];
  const headSize = fitSize(head, SIZE.header, width - headX - 20);
  head.forEach((text, i) => {
    texts.push({ x: headX, y: 99 + i * 51.15, size: headSize, text, anchor: 'start' });
  });

  // A label above each part, its last line a fixed distance above the part.
  const label = (lines, size, cx, room, top) => {
    const s = fitSize(lines, size, room);
    const step = sizeMm(s) * LINE_STEP;
    const last = top - 17;
    lines.forEach((text, i) => {
      texts.push({ x: cx, y: last - (lines.length - 1 - i) * step, size: s, text, anchor: 'middle' });
    });
  };
  const room = panel.width + GAP - 8;
  label(['Acrylic Clear 3mm', '1 UNIT'], SIZE.large, xClear + panel.width / 2, room, PART_TOP);
  label(['Border', 'Acrylic Putih 3mm', 'Belakang Double Tape', '1 UNIT'], SIZE.small,
    xBorder + borderW / 2, room, PART_TOP - STRIP_GAP);
  label(['Acrylic Putih 3mm', '1 UNIT'], SIZE.large, xBacking + panel.width / 2, room, PART_TOP);

  return {
    width,
    height,
    paths,
    texts,
    parts: {
      clear: { x: xClear, y: PART_TOP, width: panel.width, height: panel.height },
      border: { x: xBorder, y: PART_TOP - STRIP_GAP, width: borderW, height: borderH },
      backing: { x: xBacking, y: PART_TOP, width: panel.width, height: panel.height },
    },
  };
}

const pdfText = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** The sheet as a single-page PDF 1.4, as a string of plain ASCII. */
export function sheetToPdf(sheet, opts = {}) {
  const { width, height } = sheet;

  // CMYK, the same red and black the shop's Corel files use. The red is 100%
  // magenta and yellow rather than RGB red, so it survives Corel's colour import.
  const ops = ['0 J', '0 j', '0 1 1 0 K'];
  for (const p of sheet.paths) {
    ops.push(`${STROKE[p.stroke]} w`);
    ops.push(...pathToOps(p.d, height));
    ops.push('S');
  }
  ops.push('0 0 0 1 k');
  for (const t of sheet.texts) {
    const w = textWidthMm(t.text, t.size);
    const x = t.anchor === 'middle' ? t.x - w / 2 : t.x;
    ops.push('BT', `/F1 ${fmt(t.size)} Tf`,
      `${fmt(x * MM_TO_PT)} ${fmt((height - t.y) * MM_TO_PT)} Td`,
      `(${pdfText(t.text)}) Tj`, 'ET');
  }

  const stream = ops.join('\n');
  const title = pdfText(plainText(opts.title || 'Puzzle job sheet'));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(width * MM_TO_PT)} ${fmt(height * MM_TO_PT)}] `
    + '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Title (${title}) /Creator (SifuLaser Puzzle Generator) >>`,
  ];

  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  return `${body}${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R `
    + `/Info ${objects.length} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
}
