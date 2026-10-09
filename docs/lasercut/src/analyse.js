// Bytes in, a priceable laser job out. Pure: no DOM (except image decoding,
// which works in a worker), no network. Runs inside the Web Worker in the
// browser and directly under node in tests.
//
// Two steps, because the second one runs again every time the customer
// changes a layer or the size:
//   openFile(bytes)              read the file once: drawing, layers, defaults
//   runJob(session, roles, s)    pieces, laser time and preview for those
//                                layer jobs at scale s
//
// The file type is decided by its bytes, never by its name or MIME type:
// WhatsApp downloads arrive as "DOC-20260914-WA0003.pdf" with an empty MIME
// type, and a DWG renamed .dxf must get the DWG message.

import { latin1 } from './pdf/lexer.js';
import { readPdf } from './pdf/content.js';
import { readDxf } from './importDxf.js';
import { readImage } from './importImage.js';
import { MM_PER_PT } from './cut.js';
import { assignLayers, defaultRoles, layerList, ROLES } from './layers.js';
import { laserJob } from './laser.js';
import { ptToUm, CUT_SPEEDS } from './pricing.js';
import { buildPreview, viewBox } from './preview.js';

export const MAX_BYTES = 50 * 1024 * 1024;
const MANY_PIECES = 50;

export function sniff(u8) {
  if (!u8 || u8.length === 0) return { code: 'empty' };
  if (u8.length > MAX_BYTES) return { code: 'too-large' };
  const head = latin1(u8, 0, Math.min(u8.length, 1024));
  if (head.includes('%PDF-')) return { ok: true, kind: 'pdf' };
  const b = u8;
  const starts = (...xs) => xs.every((x, i) => b[i] === x);
  if (starts(0xff, 0xd8, 0xff) || starts(0x89, 0x50, 0x4e, 0x47) || head.startsWith('GIF8') || head.startsWith('BM')
    || (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP')) {
    return { ok: true, kind: 'image' };
  }
  if (starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a)
    || head.slice(4, 12) === 'ftypheic' || head.slice(4, 12) === 'ftypmif1') {
    return { code: 'image-unsupported' };
  }
  if (/^AC1\d{3}/.test(head)) return { code: 'dwg' };
  // Legacy Illustrator / EPS. Only at the START: a PDF-compatible .ai carries
  // "%!PS-Adobe" inside its own metadata, after the %PDF header.
  if (head.startsWith('%!PS-Adobe') || starts(0xc5, 0xd0, 0xd3, 0xc6)) return { code: 'ai-not-pdf-compatible' };
  if (head.startsWith('AutoCAD Binary DXF')) return { code: 'binary-dxf' };
  const text4k = latin1(u8, 0, Math.min(u8.length, 4096));
  if (/(^|[\r\n])\s*0\s*[\r\n]+\s*SECTION\s*[\r\n]/.test(text4k)) return { ok: true, kind: 'dxf' };
  if (latin1(u8, 0, Math.min(u8.length, 65536)).includes('%PDF-')) return { code: 'corrupt' };
  return { code: 'not-supported' };
}

// Illustrator writes this placeholder page when "Create PDF Compatible File" is
// OFF: the file still starts with %PDF, but page 1 is only a sentence of text.
const PLACEHOLDER = /saved without PDF Content|Create PDF Compatible File/i;

function fileWarnings(read) {
  const out = [];
  if (read.pageCount > 1) out.push({ code: 'multi-page', pages: read.pageCount });
  if (read.repaired) out.push({ code: 'repaired' });
  // Invisible OCR text (render mode 3) is not the customer's doing.
  if ((read.texts || []).some((t) => t.mode !== 3)) out.push({ code: 'live-text' });
  if (read.page?.annots) out.push({ code: 'annotations' });
  return out;
}

/** Read a file once. */
export async function openFile(bytes, name = '') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const s = sniff(u8);
  if (!s.ok) return { ok: false, code: s.code };
  let read;
  let warnings = [];
  if (s.kind === 'pdf') {
    read = await readPdf(u8);
    if (!read.ok) return { ok: false, code: read.error };
    if (read.paths.length === 0 && read.images === 0 && PLACEHOLDER.test(read.textSample)) return { ok: false, code: 'ai-not-pdf-compatible' };
  } else if (s.kind === 'dxf') {
    const r = readDxf(u8);
    if (!r.ok) return { ok: false, code: r.error };
    read = r.read;
    warnings = r.warnings;
  } else {
    const r = await readImage(u8);
    if (!r.ok) return { ok: false, code: r.error };
    read = r.read;
    warnings = r.warnings;
  }
  const assigned = assignLayers(read);
  if (!assigned.layers.size) return { ok: false, code: read.texts?.length ? 'text-only' : 'nothing' };
  const roles = defaultRoles(read, assigned);
  return {
    ok: true,
    session: { name, source: s.kind, read, assigned, roles, warnings: [...warnings, ...fileWarnings(read)] },
  };
}

/** Everything in the drawing multiplied by s about the origin. */
export function scaleRead(read, s) {
  if (!(s > 0) || s === 1) return read;
  const box = (b) => (b ? b.map((v) => v * s) : b);
  return {
    ...read,
    page: { ...read.page, mediaBox: box(read.page?.mediaBox) },
    paths: read.paths.map((p) => ({
      ...p,
      lw: p.lw * s,
      clip: box(p.clip),
      subs: p.subs.map((sub) => ({ ...sub, bb: box(sub.bb), pts: sub.pts.map((v) => v * s) })),
    })),
    rasters: (read.rasters || []).map((r) => ({ ...r, bb: box(r.bb) })),
  };
}

/** The laser job for these layer roles at this scale. */
export function runJob(session, roles = session.roles, scale = 1) {
  const clean = {};
  for (const key of session.assigned.layers.keys()) clean[key] = ROLES.includes(roles?.[key]) ? roles[key] : session.roles[key];
  const read = scaleRead(session.read, scale);
  const layers = layerList(session.assigned, clean);
  const warnings = [...session.warnings];
  if (layers.some((L) => L.background && L.role === 'ignore')) warnings.push({ code: 'background-fill' });
  const base = { name: session.name, source: session.source, roles: clean, defaults: session.roles, layers, scale, warnings };

  const job = laserJob(read, session.assigned, clean, CUT_SPEEDS);
  if (job.error) return { ...base, ok: false, code: job.error, pieces: [] };
  const { draw, pieces: rawPieces, ...laser } = job;

  const rotate = read.page?.rotate || 0;
  const swap = rotate === 90 || rotate === 270;
  // Pieces in reading order as the customer sees the page - rows top to bottom,
  // left to right within a row - so "1" in the list is the "1" in the preview.
  const items = rawPieces.map((p, i) => ({ i, box: viewBox(p.bb, rotate) })).sort((A, B) => A.box.y - B.box.y);
  const rows = [];
  for (const it of items) {
    const mid = it.box.y + it.box.h / 2;
    const row = rows.find((r) => mid >= r.y0 && mid <= r.y1);
    if (row) { row.items.push(it); row.y1 = Math.max(row.y1, it.box.y + it.box.h); } else rows.push({ y0: it.box.y, y1: it.box.y + it.box.h, items: [it] });
  }
  const order = rows.flatMap((r) => r.items.sort((A, B) => A.box.x - B.box.x)).map(({ i }) => rawPieces[i]);
  const pieces = order.map(({ bb }) => {
    const w = ptToUm(bb[2] - bb[0]), h = ptToUm(bb[3] - bb[1]);
    return swap ? { wUm: h, hUm: w } : { wUm: w, hUm: h };
  });
  if (pieces.length > MANY_PIECES) warnings.push({ code: 'many-pieces', n: pieces.length });
  if (laser.noCut) warnings.push({ code: 'no-cut' });
  if (laser.outside) warnings.push({ code: 'outside-cut' });

  let all = null;
  for (const p of order) all = all ? [Math.min(all[0], p.bb[0]), Math.min(all[1], p.bb[1]), Math.max(all[2], p.bb[2]), Math.max(all[3], p.bb[3])] : [...p.bb];
  const wMm = (all[2] - all[0]) * MM_PER_PT, hMm = (all[3] - all[1]) * MM_PER_PT;
  const sizeMm = swap ? { w: hMm, h: wMm } : { w: wMm, h: hMm };

  const preview = buildPreview(read, order, rotate, new Set(), draw);
  return { ...base, ok: true, pieces, laser, preview, sizeMm };
}

/** Open and price in one go (tests, and the first look at a file). */
export async function analyseFile(bytes, name = '', { roles = null, scale = 1 } = {}) {
  const o = await openFile(bytes, name);
  if (!o.ok) return { ok: false, code: o.code, pieces: [], name };
  return runJob(o.session, { ...o.session.roles, ...(roles || {}) }, scale);
}
