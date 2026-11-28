// The job sheet: one page holding both parts of the product, laid out the way the
// shop already draws them in CorelDRAW.
//
//   White 3 mm   - the puzzle inside its frame
//   White 3 mm   - the backing
//
// Until 11 Nov 2026 the panel was clear and a third part, four white border strips,
// made the tray's wall. Boss dropped the strips and moved the panel to white acrylic.
// Each label says how many units the file is cut for: one cut file serves every
// puzzle at its size, so a job of five posters says 5 UNIT (Boss, 11 Nov 2026).
//
// The sheet is a plain description first (`buildSheet`) and a PDF second
// (`sheetToPdf`). The preview draws the same description, so what is on screen is
// what gets written.
//
// The cutting order is deliberate. Paths are written puzzle lines, puzzle edge,
// frame. If the frame goes first the panel is free of the sheet before the pieces
// are, and they shift as the rest is cut.
//
// The frame's outer corners are rounded R5 like the backing's, because the panel is
// stacked on the backing and the two have to line up (Boss, 11 Nov 2026). The
// puzzle's own edge inside it stays square: that is the edge of the pieces.

import { parsePath, pathToOps, byteLength } from './exportPdf.js';
import { borderPath } from './geom/puzzle.js';
import { FRAME_MM, CORNER_MM } from './geom/poster.js';
import { CARD_CORNER_MM } from './geom/cards.js';
import { circlePath, unionPath, HOLE_DIAMETER_MM } from './geom/keychain.js';
import { strokeText } from './geom/strokeText.js';

const MM_TO_PT = 72 / 25.4;
const PAGE_W = 1200;
const PAGE_H = 900;
const GAP = 64;
const PART_TOP = 382;
const BOTTOM = 63;

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

/** Largest size, up to `size`, at which every line fits in `room` mm. */
function fitSize(lines, size, room) {
  const widest = Math.max(...lines.map((t) => textWidthMm(t, size)));
  return widest > room ? (size * room) / widest : size;
}

/** The job, top of the page: client, dateline, and what is being made. */
function jobHead(texts, width, meta, what) {
  const headX = width * (298 / PAGE_W);
  const head = [
    `Nama Client: ${plainText(meta.client)}`,
    `Dateline: ${plainText(meta.dateline)}`,
    what,
  ];
  const headSize = fitSize(head, SIZE.header, width - headX - 20);
  head.forEach((text, i) => {
    texts.push({ x: headX, y: 99 + i * 51.15, size: headSize, text, anchor: 'start' });
  });
}

/** A label above a part, its last line a fixed distance above the part. */
function partLabel(texts, lines, cx, room) {
  const s = fitSize(lines, SIZE.large, room);
  const step = sizeMm(s) * LINE_STEP;
  const last = PART_TOP - 17;
  lines.forEach((text, i) => {
    texts.push({ x: cx, y: last - (lines.length - 1 - i) * step, size: s, text, anchor: 'middle' });
  });
}

/**
 * @param plan    result of planPoster
 * @param puzzle  result of buildPuzzle at plan's size
 * @param meta    { client, dateline, units }: units is how many puzzles this file
 *                is cut for, 1 when not said
 */
export function buildSheet(plan, puzzle, meta = {}) {
  const { panel } = plan;
  const units = Math.max(1, Math.round(Number(meta.units) || 1));
  const content = panel.width + GAP + panel.width;

  const width = Math.max(PAGE_W, content + 2 * GAP);
  const height = Math.max(PAGE_H, PART_TOP + panel.height + BOTTOM);
  const x0 = (width - content) / 2;
  const xPanel = x0;
  const xBacking = xPanel + panel.width + GAP;

  const paths = [];

  // The panel: puzzle lines, then the puzzle's own edge, as one compound path. The
  // frame stays a separate object after it, so it is the last thing cut.
  const puzzleD = `${puzzle.h}${puzzle.v}${borderPath(plan.width, plan.height, 0)}`;
  paths.push({
    id: 'puzzle',
    stroke: 'hair',
    d: translatePath(puzzleD, xPanel + FRAME_MM, PART_TOP + FRAME_MM),
  });
  paths.push({
    id: 'frame',
    stroke: 'cut',
    d: translatePath(`${borderPath(panel.width, panel.height, CORNER_MM)} Z`, xPanel, PART_TOP),
  });

  // The backing.
  paths.push({
    id: 'backing',
    stroke: 'cut',
    d: translatePath(`${borderPath(panel.width, panel.height, CORNER_MM)} Z`, xBacking, PART_TOP),
  });

  const texts = [];
  jobHead(texts, width, meta, `PUZZLE ${plan.width} x ${plan.height} mm, ${plan.pieces} pieces`);
  const room = panel.width + GAP - 8;
  partLabel(texts, ['Acrylic Putih 3mm', `${units} UNIT`], xPanel + panel.width / 2, room);
  partLabel(texts, ['Acrylic Putih 3mm', `${units} UNIT`], xBacking + panel.width / 2, room);

  return {
    width,
    height,
    paths,
    texts,
    parts: {
      panel: { x: xPanel, y: PART_TOP, width: panel.width, height: panel.height },
      backing: { x: xBacking, y: PART_TOP, width: panel.width, height: panel.height },
    },
  };
}

/**
 * The UV File tab's cut file (Boss, 11 Nov 2026): a puzzle with no pieces. The poster
 * is cut out at its own edge, its corners R3 (12 Nov 2026: square ones are sharp in
 * the hand, and R1 was still too small), inside a frame with R5 outer corners. The panel
 * is UV printed after cutting with the poster still in its frame, so the 2 mm bleed
 * lands on the frame and goes with it, and the poster's edge is printed right up to the
 * cut. One file serves every panel at its size, and the label says how many to cut.
 *
 * The order is the puzzle's, for the same reason: the poster first, the frame last, so
 * the panel is not free of the sheet while the poster is still being cut. The poster's
 * edge is a hairline, as the puzzle's own edge is in the shop's files.
 *
 * @param plan result of planPanel
 * @param meta { client, dateline, units, material }: material is the label to write,
 *             as PANEL_MATERIALS has it (Boss, 11 Nov 2026); white 3mm when absent
 */
export function buildPanelSheet(plan, meta = {}) {
  const { panel } = plan;
  const units = Math.max(1, Math.round(Number(meta.units) || 1));
  const material = typeof meta.material === 'string' && meta.material.trim()
    ? meta.material.trim()
    : 'Acrylic Putih 3mm';
  const width = Math.max(PAGE_W, panel.width + 2 * GAP);
  const height = Math.max(PAGE_H, PART_TOP + panel.height + BOTTOM);
  const xPanel = (width - panel.width) / 2;
  const inX = (panel.width - plan.width) / 2;    // the border, as wide as the plan made it
  const inY = (panel.height - plan.height) / 2;
  const posterD = borderPath(plan.width, plan.height, plan.cutCorner ?? 0);

  const paths = [{
    id: 'poster',
    stroke: 'hair',
    // borderPath closes a square outline itself, and leaves a rounded one open.
    d: translatePath(/Z\s*$/.test(posterD) ? posterD : `${posterD} Z`, xPanel + inX, PART_TOP + inY),
  }, {
    id: 'frame',
    stroke: 'cut',
    d: translatePath(`${borderPath(panel.width, panel.height, CORNER_MM)} Z`, xPanel, PART_TOP),
  }];
  const texts = [];
  jobHead(texts, width, meta, `PANEL UV ${panel.width} x ${panel.height} mm, poster ${plan.width} x ${plan.height} mm`);
  partLabel(texts, [material, `${units} UNIT`], xPanel + panel.width / 2, panel.width + GAP - 8);

  return {
    width,
    height,
    paths,
    texts,
    parts: { panel: { x: xPanel, y: PART_TOP, width: panel.width, height: panel.height } },
  };
}

/**
 * One bed load of UV panels as one cut file (Boss, 25 Nov 2026): every panel where the
 * print file puts it, so what comes off the laser goes onto the UV bed as it lies. The
 * posters first, each in its own hairline with R3 corners as on a single panel; then the
 * panels' edges, last, for the puzzle's reason - nothing comes loose while something
 * inside it is still being cut.
 *
 * The panels touch, so two of them share an edge. Each edge is written once (frameLines):
 * a line cut twice melts its kerf wider and leaves the acrylic's edge rough. The panels'
 * corners are square here: the frames are offcuts, and R5 corners would leave slivers
 * between panels.
 *
 * @param layout { width, height, items: [{ x, y, turned, plan }] }, mm from the corner
 *               of the bed; `turned`, the panel lies turned 90° clockwise
 * @param meta   { client, dateline, material, run, runs }
 */
export function buildPanelBedSheet(layout, meta = {}) {
  const material = typeof meta.material === 'string' && meta.material.trim()
    ? meta.material.trim()
    : 'Acrylic Putih 3mm';
  const width = Math.max(PAGE_W, layout.width + 2 * GAP);
  const height = Math.max(PAGE_H, PART_TOP + layout.height + BOTTOM);
  const xs = (width - layout.width) / 2;
  const posters = [];
  const rects = [];
  for (const it of layout.items) {
    const { plan } = it;
    const [pw, ph] = it.turned ? [plan.panel.height, plan.panel.width] : [plan.panel.width, plan.panel.height];
    const [qw, qh] = it.turned ? [plan.height, plan.width] : [plan.width, plan.height];
    const d = borderPath(qw, qh, plan.cutCorner ?? 0);
    posters.push(translatePath(/Z\s*$/.test(d) ? d : `${d} Z`, xs + it.x + (pw - qw) / 2, PART_TOP + it.y + (ph - qh) / 2));
    rects.push({ x: xs + it.x, y: PART_TOP + it.y, w: pw, h: ph });
  }
  const paths = [
    { id: 'poster', stroke: 'hair', d: posters.join(' ') },
    { id: 'frame', stroke: 'cut', d: frameLines(rects) },
  ];
  const texts = [];
  const n = layout.items.length;
  const run = meta.runs > 1 ? `RUN ${meta.run} DARI ${meta.runs}: ` : '';
  jobHead(texts, width, meta, `PANEL UV ${run}${n} panel, ${round3(layout.width)} x ${round3(layout.height)} mm`);
  partLabel(texts, [material, `${n} PANEL, CUT 1 KALI`], width / 2, layout.width + GAP - 8);
  return {
    width,
    height,
    paths,
    texts,
    parts: { bed: { x: xs, y: PART_TOP, width: layout.width, height: layout.height } },
  };
}

/**
 * The edges of rectangles that touch, each stretch of line once: every edge as a
 * segment, segments on the same line merged where they overlap or meet.
 */
export function frameLines(rects) {
  const key = (v) => Math.round(v * 1000) / 1000;
  const lines = { h: new Map(), v: new Map() };
  const add = (kind, at, a, b) => {
    const k = key(at);
    if (!lines[kind].has(k)) lines[kind].set(k, []);
    lines[kind].get(k).push([key(Math.min(a, b)), key(Math.max(a, b))]);
  };
  for (const r of rects) {
    add('h', r.y, r.x, r.x + r.w);
    add('h', r.y + r.h, r.x, r.x + r.w);
    add('v', r.x, r.y, r.y + r.h);
    add('v', r.x + r.w, r.y, r.y + r.h);
  }
  const out = [];
  for (const kind of ['h', 'v']) {
    for (const [at, spans] of [...lines[kind]].sort((p, q) => p[0] - q[0])) {
      spans.sort((p, q) => p[0] - q[0]);
      let [a, b] = spans[0];
      const flush = () => out.push(kind === 'h' ? `M ${a} ${at} L ${b} ${at}` : `M ${at} ${a} L ${at} ${b}`);
      for (const [c, e] of spans.slice(1)) {
        if (c <= b + 1e-6) b = Math.max(b, e);
        else { flush(); [a, b] = [c, e]; }
      }
      flush();
    }
  }
  return out.join(' ');
}

/**
 * The Keychain UV tab's cut file (Boss, 17 Nov 2026): one sheet of round keychains, the
 * job written above it. The holes first, then the keychains, then the sheet's own edge
 * last, for the puzzle's reason: nothing comes loose while something inside it is still
 * being cut. The sheet's edge is in the file as the red page border is in Boss's
 * CorelDRAW template, so the laser lines the job up on the sheet.
 *
 * Under the keychains the laser marks FRONT in blue, in single strokes (Boss, 17 Nov
 * 2026): it tells the UV printer which face of the sheet is the front. Blue is the
 * marking colour, red the cutting one; the mark comes first, before anything is cut.
 *
 * @param layout result of layoutKeychains
 * @param meta   { client, dateline, material, hole: { dx, dy }, hookR }: the hole's centre
 *               from each keychain's centre, mm; hookR, a hook's radius round that hole
 *               (Boss, 17 Nov 2026), makes each outline the keychain and its hook in one
 */
export function buildKeychainSheet(layout, meta = {}) {
  const { sheet, sizeMm, items } = layout;
  const material = typeof meta.material === 'string' && meta.material.trim()
    ? meta.material.trim()
    : 'Acrylic Putih 3mm';
  const hole = meta.hole || { dx: 0, dy: 0 };
  const width = Math.max(PAGE_W, sheet.width + 2 * GAP);
  const height = Math.max(PAGE_H, PART_TOP + sheet.height + BOTTOM);
  const xs = (width - sheet.width) / 2;
  const at = (it) => ({ x: xs + it.x, y: PART_TOP + it.y });

  // FRONT in the room under the lowest keychain (its hook too), as big as fits up to
  // 10 mm a capital, centred both ways in that room.
  const reachDown = Math.max(sizeMm / 2, meta.hookR ? hole.dy + meta.hookR : -Infinity);
  const lowest = items.length ? Math.max(...items.map((it) => it.y + reachDown)) : 0;
  const room = sheet.height - lowest;
  const capMm = Math.round(Math.max(3, Math.min(10, room - 4)) * 2) / 2;
  const front = strokeText('FRONT', {
    x: xs + sheet.width / 2, y: PART_TOP + lowest + room / 2 + capMm / 2, capMm, anchor: 'middle',
  });

  const paths = [
    { id: 'front', stroke: 'hair', colour: 'blue', d: front.d },
    {
      id: 'holes',
      stroke: 'hair',
      d: items.map((it) => circlePath(at(it).x + hole.dx, at(it).y + hole.dy, HOLE_DIAMETER_MM / 2)).join(' '),
    },
    {
      id: 'keychains',
      stroke: 'hair',
      d: items.map((it) => {
        const c = { cx: at(it).x, cy: at(it).y, r: sizeMm / 2 };
        return meta.hookR
          ? unionPath(c, { cx: c.cx + hole.dx, cy: c.cy + hole.dy, r: meta.hookR })
          : circlePath(c.cx, c.cy, c.r);
      }).join(' '),
    },
    { id: 'sheet', stroke: 'cut', d: translatePath(rectPath(sheet.width, sheet.height), xs, PART_TOP) },
  ];
  const texts = [];
  jobHead(texts, width, meta,
    `KEYCHAIN UV ${sizeMm / 10} cm${meta.hookR ? ' HOOK' : ''}, lubang ${HOLE_DIAMETER_MM} mm, `
    + `sheet ${sheet.label} ${sheet.width} x ${sheet.height} mm`);
  // What the laser operator is told (Boss, 17 Nov 2026): how many on a sheet, and how
  // many times to cut this same file.
  partLabel(texts, [material, `${layout.perSheet} PCS SATU SHEET`, `CUT ${layout.sheets} KALI`],
    xs + sheet.width / 2, sheet.width + GAP - 8);

  return {
    width,
    height,
    paths,
    texts,
    parts: { sheet: { x: xs, y: PART_TOP, width: sheet.width, height: sheet.height } },
  };
}

const PLAK_BLOCK_GAP = 20;   // between a plaque's parts on one sheet, mm
const PLAK_ROW_MM = 900;     // a row of parts wraps past this, unless one part is wider

/** A material's parts side by side, rows wrapping: where each block goes, and the size. */
function layoutBlocks(blocks) {
  const widest = Math.max(...blocks.map((b) => b.width));
  const rowMax = Math.max(PLAK_ROW_MM, widest);
  const placed = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.width > rowMax) {
      x = 0;
      y += rowH + PLAK_BLOCK_GAP;
      rowH = 0;
    }
    placed.push({ b, x, y });
    width = Math.max(width, x + b.width);
    x += b.width + PLAK_BLOCK_GAP;
    rowH = Math.max(rowH, b.height);
  }
  return { placed, width, height: y + rowH };
}

/**
 * The UV Plak tab's cut file (Boss, 28 Nov 2026): every part of the plaque on one page,
 * a section for each material side by side, each with its material and how many times
 * to cut it written above it, as the puzzle's sheet carries its panel and its backing.
 * Boss asked for it as one file ("combine je dalam satu file"); the operator cuts each
 * section on its own material.
 *
 * Paths are written in their `order` across every section, so the counters go before
 * the letters and the plate before the frame it sits in.
 *
 * @param jobs [{ material: { id, label }, blocks, note }] from plakCutJobs, `note` a line
 *             written under the material (TAPE_NOTE); one job alone
 *             makes a sheet of that material only
 * @param meta { client, dateline, units, what }
 */
export function buildPlakSheet(jobs, meta = {}) {
  const list = Array.isArray(jobs) ? jobs : [jobs];
  const units = Math.max(1, Math.round(Number(meta.units) || 1));
  const sections = list.map((job) => ({ job, ...layoutBlocks(job.blocks) }));
  const contentW = sections.reduce((sum, sec, i) => sum + sec.width + (i ? GAP : 0), 0);
  const contentH = Math.max(...sections.map((sec) => sec.height));
  const width = Math.max(PAGE_W, contentW + 2 * GAP);
  const height = Math.max(PAGE_H, PART_TOP + contentH + BOTTOM);
  let sx = (width - contentW) / 2;
  const groups = new Map();
  const texts = [];
  const parts = {};
  jobHead(texts, width, meta, meta.what || 'PLAK UV');
  for (const sec of sections) {
    for (const { b, x: bx, y: by } of sec.placed) {
      for (const p of b.paths) {
        const key = `${p.order}|${p.id}|${p.stroke}`;
        if (!groups.has(key)) groups.set(key, { id: p.id, stroke: p.stroke, order: p.order, d: [] });
        groups.get(key).d.push(translatePath(p.d, sx + bx, PART_TOP + by));
      }
      parts[list.length > 1 ? `${sec.job.material.id}:${b.id}` : b.id] = {
        x: sx + bx, y: PART_TOP + by, width: b.width, height: b.height,
      };
    }
    // Three lines at most: a fourth reaches up into the job's head. So the units and the
    // times share a line, and the note (double tape) has the middle one.
    partLabel(texts, [sec.job.material.label, ...(sec.job.note ? [sec.job.note] : []), `${units} UNIT, CUT ${units} KALI`],
      sx + sec.width / 2, sec.width + GAP - 8);
    sx += sec.width + GAP;
  }
  const paths = [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ id: g.id, stroke: g.stroke, d: g.d.join(' ') }));
  return {
    width,
    height,
    paths,
    texts,
    parts,
  };
}

const r2 = (v) => Math.round(v * 100) / 100;
const CARD_MARGIN = 20;   // round the card sheet on its page
const CARD_HEAD = 64;     // room above it for the job and the material

/**
 * The reference cards' cut file (Boss, 11 Nov 2026): every card on one white sheet,
 * the job written above it. Cards first as one compound path, the sheet's frame last,
 * for the same reason the puzzle comes before its frame.
 *
 * @param layout result of layoutCards
 * @param meta   { client, dateline }
 */
export function buildCardSheet(layout, meta = {}) {
  const { sheet, cards } = layout;
  const x0 = CARD_MARGIN;
  const y0 = CARD_HEAD;
  const width = r2(sheet.width + 2 * CARD_MARGIN);
  const height = r2(CARD_HEAD + sheet.height + CARD_MARGIN);

  const paths = [
    {
      id: 'cards',
      stroke: 'hair',
      d: cards.map((c) => translatePath(
        `${borderPath(c.width, c.height, CARD_CORNER_MM)} Z`, x0 + c.x, y0 + c.y,
      )).join(' '),
    },
    { id: 'frame', stroke: 'cut', d: translatePath(rectPath(sheet.width, sheet.height), x0, y0) },
  ];

  const sizes = [...new Set(cards.map((c) => `${c.width} x ${c.height}`))];
  const head = [
    `Nama Client: ${plainText(meta.client)}`,
    `Dateline: ${plainText(meta.dateline)}`,
    `KAD RUJUKAN A6, ${cards.length} kad, ${sizes.length === 1 ? `${sizes[0]} mm` : 'ikut ratio page'}`,
  ];
  const room = width - 2 * CARD_MARGIN;
  const headSize = fitSize(head, 36, room);
  const texts = head.map((text, i) => ({
    x: x0, y: 14 + i * 13, size: headSize, text, anchor: 'start',
  }));
  const material = ['Acrylic Putih 3mm, 1 UNIT'];
  texts.push({
    x: x0 + sheet.width / 2, y: CARD_HEAD - 6, size: fitSize(material, 30, room), text: material[0], anchor: 'middle',
  });

  return {
    width,
    height,
    paths,
    texts,
    parts: { cards: { x: x0, y: y0, width: sheet.width, height: sheet.height } },
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
  // A path marked 'blue' (CMYK 100/100/0/0, the colour of Boss's Front label) is a
  // laser marking, not a cut.
  const COLOUR = { red: '0 1 1 0 K', blue: '1 1 0 0 K' };
  let colour = 'red';
  const ops = ['0 J', '0 j', COLOUR.red];
  for (const p of sheet.paths) {
    const want = COLOUR[p.colour] ? p.colour : 'red';
    if (want !== colour) {
      ops.push(COLOUR[want]);
      colour = want;
    }
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
