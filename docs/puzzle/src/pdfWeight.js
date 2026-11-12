// What makes a customer's PDF heavy that the print does not need (Boss, 12 Nov 2026).
//
// Illustrator, with "Preserve Illustrator Editing Capabilities" ticked, keeps its own
// copy of the artwork inside the PDF, so that Illustrator can open it for editing:
// blocks of 64 KB named AIPDFPrivateData1..N, counted by a NumBlock entry. A
// designer's A3 poster measured 62.5 MB, 27.4 MB of it this (418 blocks). The print
// file has no use for it - the tool redraws the poster as a 300 dpi picture - but it
// fills the browser's store and every WhatsApp hop on the way here.
//
// Read straight from the bytes, no parsing: Illustrator writes these entries as plain
// text. A file that hides them in a compressed object stream simply goes unnoticed,
// which is the right way for a notice to fail. Pure: bytes in, numbers out.

export const ILLUSTRATOR_BLOCK = 65536;

const CHUNK = 8 * 1024 * 1024;
const OVERLAP = 64;
const latin1 = new TextDecoder('latin1');

/** Every chunk of the file as text, each overlapping the last so no key is cut in two. */
function* chunks(bytes) {
  for (let from = 0; from < bytes.length; from += CHUNK) {
    const start = Math.max(0, from - OVERLAP);
    yield latin1.decode(bytes.subarray(start, Math.min(bytes.length, from + CHUNK)));
  }
}

/**
 * Illustrator's editing data in a PDF: { blocks, bytes }, the bytes reckoned at 64 KB a
 * block, or null when there is none.
 */
export function illustratorEditData(bytes) {
  if (!bytes?.length) return null;
  let blocks = 0;
  let keys = 0;
  for (const text of chunks(bytes)) {
    const m = /\/NumBlock\s+(\d+)/.exec(text);
    if (m) blocks = Math.max(blocks, Number(m[1]));
    if (!blocks) keys += (text.match(/\/AIPDFPrivateData\d+\s/g) || []).length;
  }
  // Without NumBlock, the keys themselves say how many blocks there are. A key cut by
  // the overlap may be counted twice; it is an estimate, and a small one at that.
  const n = blocks || keys;
  return n > 0 ? { blocks: n, bytes: n * ILLUSTRATOR_BLOCK } : null;
}
