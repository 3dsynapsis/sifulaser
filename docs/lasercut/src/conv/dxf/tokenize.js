// Bytes in, (code, value) records out.
//
// DXF is strictly two physical lines per record, from byte 0 to end of file:
// an odd line is the group code, the line under it is that code's value. There
// is no exception and no nesting at this level, which is why the loop below is
// a flat i += 2 with no lookahead. That parity was checked against both of the
// owner's files - 69,939 records in one, 244,284 in the other - and never
// slipped once.
//
// Everything here is about the two ways a real file differs from that clean
// picture: how it is encoded, and how its lines end.

const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

const BINARY_SENTINEL = 'AutoCAD Binary DXF';

/** Bytes as latin1 - one byte, one character, never fails, never reorders. */
function latin1(bytes) {
  let out = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length)));
  }
  return out;
}

/**
 * Turn a file's bytes into text, or refuse.
 *
 * Two things go wrong if you skip this and read the file as UTF-8, which is
 * what the browser's FileReader.readAsText does:
 *
 * A binary DXF comes back as mojibake and throws no error. The parser then
 * finds no valid code/value pairs, returns nothing, and the user sees an empty
 * preview and concludes the tool is broken. It is not - their file is binary -
 * and saying so is the whole fix.
 *
 * A text DXF's strings are in the codepage named by $DWGCODEPAGE, not UTF-8.
 * Both of the owner's fixtures say ANSI_1252 and both happen to be pure ASCII,
 * so a UTF-8 read works on them by luck. It stops working the moment a layer is
 * named in Malay or Jawi from a Windows program - and this customer base writes
 * both. windows-1252 differs from latin1 only in the 0x80-0x9f range, so the
 * decode is a byte-for-byte read plus a 32-entry fixup, and needs no ICU data
 * that a node build might not have.
 */
export function readDxfBytes(bytes) {
  const head = latin1(bytes.subarray(0, 24));
  if (head.startsWith(BINARY_SENTINEL)) {
    return {
      error: 'binary-dxf',
      message: 'Fail DXF ini format binari. Simpan semula sebagai ASCII DXF dari program asal.',
    };
  }
  const raw = latin1(bytes);
  const cpMatch = raw.match(/\$DWGCODEPAGE[\r\n]+\s*3[\r\n]+([^\r\n]*)/i);
  const codepage = cpMatch ? cpMatch[1].trim() : 'ANSI_1252';
  if (/utf-?8/i.test(codepage)) {
    return { text: new TextDecoder('utf-8').decode(bytes), codepage: 'UTF8' };
  }
  let text = raw;
  const HI = new RegExp(`[${String.fromCharCode(0x80)}-${String.fromCharCode(0x9f)}]`, "g");
  if (HI.test(raw)) {
    HI.lastIndex = 0;
    text = raw.replace(HI, (c) => String.fromCharCode(CP1252_HIGH[c.charCodeAt(0) - 0x80]));
  }
  return { text, codepage };
}

/**
 * Text into (code, value) pairs.
 *
 * Codes are right-justified to width 3 and integers to width 6 in files
 * AutoCAD writes ("  0", " 70", "     4"), and not padded at all in files other
 * programs write - so every value is trimmed before anybody looks at it.
 * Line endings are CRLF in both fixtures, but these files travel between
 * Windows CAD and Mac laser software, so LF and a bare CR both have to split
 * as well: splitting on CRLF alone leaves a trailing carriage return on every
 * value, and Number() of that is NaN, and a NaN coordinate draws nothing while
 * raising nothing.
 */
export function tokenize(text) {
  const lines = String(text).split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isFinite(code)) continue;
    out.push([code, lines[i + 1]]);
  }
  return out;
}

/** A DXF float. Values like 1.000000000000000E+20 are real and appear in the wild. */
export function num(v) {
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

/** A DXF integer, padded or not. */
export function int(v) {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

export const str = (v) => String(v).trim();
