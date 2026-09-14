// Bytes in, a priceable description of page 1 out. Pure: no DOM, no network.
// Runs inside the Web Worker in the browser and directly under node in tests.
//
// The file type is decided by its bytes, never by its name or MIME type:
// Android and WhatsApp downloads arrive as "DOC-20260914-WA0003.pdf" with an
// empty MIME type, and a JPG renamed .pdf must get the "this is a picture"
// message, not "file rosak".

import { latin1 } from './pdf/lexer.js';
import { readPdf } from './pdf/content.js';
import { detectCut } from './cut.js';
import { ptToUm } from './pricing.js';
import { buildPreview, viewBox } from './preview.js';

export const MAX_BYTES = 50 * 1024 * 1024;

export function sniff(u8) {
  if (!u8 || u8.length === 0) return { code: 'empty' };
  if (u8.length > MAX_BYTES) return { code: 'too-large' };
  const head = latin1(u8, 0, Math.min(u8.length, 1024));
  if (head.includes('%PDF-')) return { ok: true };
  const b = u8;
  const starts = (...xs) => xs.every((x, i) => b[i] === x);
  if (starts(0xff, 0xd8, 0xff) || starts(0x89, 0x50, 0x4e, 0x47) || head.startsWith('GIF8')
    || (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') || starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a)
    || head.slice(4, 12) === 'ftypheic' || head.slice(4, 12) === 'ftypmif1') {
    return { code: 'image-file' };
  }
  // Legacy Illustrator / EPS. Only at the START: a PDF-compatible .ai carries
  // "%!PS-Adobe" inside its own metadata, after the %PDF header.
  if (head.startsWith('%!PS-Adobe') || starts(0xc5, 0xd0, 0xd3, 0xc6)) return { code: 'ai-not-pdf-compatible' };
  if (latin1(u8, 0, Math.min(u8.length, 65536)).includes('%PDF-')) return { code: 'corrupt' };
  return { code: 'not-pdf' };
}

// Illustrator writes this placeholder page when "Create PDF Compatible File" is
// OFF: the file still starts with %PDF, but page 1 is only a sentence of text.
const PLACEHOLDER = /saved without PDF Content|Create PDF Compatible File/i;

export async function analyseFile(bytes, name = '') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const s = sniff(u8);
  if (!s.ok) return { ok: false, code: s.code };
  const read = await readPdf(u8);
  if (!read.ok) return { ok: false, code: read.error };
  if (read.paths.length === 0 && PLACEHOLDER.test(read.textSample)) return { ok: false, code: 'ai-not-pdf-compatible' };

  const cut = detectCut(read);
  const rotate = read.page.rotate;
  const swap = rotate === 90 || rotate === 270;

  // Pieces in reading order as the customer sees the page - rows top to bottom,
  // left to right within a row - so "Kepingan 1" in the list is the "1" in the
  // preview. A piece joins a row when its middle falls inside the row's height.
  const items = cut.pieces.map((p, i) => ({ i, box: viewBox(p.bb, rotate) })).sort((A, B) => A.box.y - B.box.y);
  const rows = [];
  for (const it of items) {
    const mid = it.box.y + it.box.h / 2;
    const row = rows.find((r) => mid >= r.y0 && mid <= r.y1);
    if (row) { row.items.push(it); row.y1 = Math.max(row.y1, it.box.y + it.box.h); } else rows.push({ y0: it.box.y, y1: it.box.y + it.box.h, items: [it] });
  }
  const order = rows.flatMap((r) => r.items.sort((A, B) => A.box.x - B.box.x));
  const pieces = order.map(({ i }) => {
    const bb = cut.pieces[i].bb;
    const w = ptToUm(bb[2] - bb[0]), h = ptToUm(bb[3] - bb[1]);
    return swap ? { wUm: h, hUm: w } : { wUm: w, hUm: h };
  });
  const orderedCut = order.map(({ i }) => cut.pieces[i]);
  const overlapSet = new Set((cut.overlap || []).map((i) => order.findIndex((o) => o.i === i)));

  const base = {
    name,
    rule: cut.rule,
    names: cut.names,
    pieces,
    holes: cut.holes,
    warnings: cut.warnings,
    pageCount: read.pageCount,
    rotate,
    encrypted: read.encrypted,
  };
  if (cut.error && cut.error !== 'cut-overlap') return { ...base, ok: false, code: cut.error, pieces: [] };
  const preview = buildPreview(read, orderedCut, rotate, overlapSet);
  if (cut.error) return { ...base, ok: false, code: cut.error, preview };
  return { ...base, ok: true, preview };
}
