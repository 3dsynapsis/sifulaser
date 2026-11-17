// What the Puzzle, UV File and Keychain UV tabs take in (Boss, 17 Nov 2026): a PDF as
// before, or a picture. Clients often send a poster or a keychain design as a PNG or a
// JPG, and turning it into a PDF first was a step for nothing.
//
// A picture becomes a one-page "PDF" for the rest of the tool: a page exactly the size of
// the picture, which posterPdf.js (PicturePage) draws with the browser instead of pdf.js.
// The page's size in mm comes from the picture's own dpi when that is a print setting,
// else from 300 dpi (see printDpi). The Puzzle and Keychain tabs scale the art to the size
// picked anyway; only the UV File tab's "Asal" uses the page size as it is.
//
// Pure: bytes and names in, answers out. Nothing here touches the page.

const PDF_TYPE = 'application/pdf';

/** The pictures the browser draws, by what their bytes say they are. */
export const PICTURE_TYPES = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
};
const PICTURE_MIME = new Set([...Object.values(PICTURE_TYPES), 'image/pjpeg', 'image/x-ms-bmp']);
const PICTURE_EXT = /\.(png|jpe?g|jfif|pjpeg|pjp|webp|gif|bmp|avif)$/i;
const POSTER_EXT = /\.(pdf|png|jpe?g|jfif|pjpeg|pjp|webp|gif|bmp|avif)$/i;

/** For <input type="file" accept>. */
export const POSTER_ACCEPT = [
  'application/pdf', '.pdf',
  'image/png', '.png',
  'image/jpeg', '.jpg', '.jpeg', '.jfif',
  'image/webp', '.webp',
  'image/gif', '.gif',
  'image/bmp', '.bmp',
  'image/avif', '.avif',
].join(',');

/** What the person is told goes in. GIF, BMP and AVIF work too, but nobody sends those. */
export const POSTER_FORMATS = 'PDF, PNG, JPG atau WebP';

/** Whether the file says it is a picture, by its type or its name. */
export function saysPicture(file) {
  return PICTURE_MIME.has(String(file?.type || '').toLowerCase()) || PICTURE_EXT.test(String(file?.name || ''));
}

/** Whether a dropped or picked file is one the tabs take: a PDF or a picture. */
export function isPosterFile(file) {
  const type = String(file?.type || '').toLowerCase();
  return type === PDF_TYPE || PICTURE_MIME.has(type) || POSTER_EXT.test(String(file?.name || ''));
}

/** A file's name without its extension: "A4 PUZZLE 1.png" -> "A4 PUZZLE 1". */
export const stripExt = (name) => String(name).replace(POSTER_EXT, '');

const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));
const u16be = (b, at) => (b[at] << 8) | b[at + 1];
const u32be = (b, at) => b[at] * 2 ** 24 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);
const u32le = (b, at) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 2 ** 24;

/**
 * What the bytes are, from the first few: 'png', 'jpeg', 'webp', 'gif', 'bmp', 'avif', or
 * null for anything else. A PDF is null too: pdf.js decides about those.
 */
export function pictureKind(b) {
  if (!b || b.length < 16) return null;
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a
    && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'gif';
  // "BM" alone is two letters any file could start with: the header that follows says more.
  if (ascii(b, 0, 2) === 'BM' && [12, 40, 52, 56, 64, 108, 124].includes(u32le(b, 14))) return 'bmp';
  if (ascii(b, 4, 4) === 'ftyp' && /^avi[fs]$/.test(ascii(b, 8, 4))) return 'avif';
  return null;
}

/** Whether the bytes are a PDF: "%PDF-" within the first 1024, where readers look for it. */
export function looksLikePdf(b) {
  if (!b) return false;
  const head = ascii(b, 0, Math.min(b.length, 1024));
  return head.includes('%PDF-');
}

/** The MIME type of these bytes: the picture's, or a PDF's. */
export const typeOfBytes = (bytes) => PICTURE_TYPES[pictureKind(bytes)] || PDF_TYPE;

/**
 * An EXIF block's resolution, dpi, or null. `tiff` is where its TIFF header starts.
 * Only the first directory is read: XResolution (a fraction kept elsewhere in the block)
 * and ResolutionUnit (2 inch, the default, or 3 cm).
 */
function exifDpi(b, tiff, end) {
  if (tiff + 8 > end) return null;
  const le = b[tiff] === 0x49 && b[tiff + 1] === 0x49;   // "II"
  const be = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;   // "MM"
  if (!le && !be) return null;
  const u16 = (at) => (le ? b[at] | (b[at + 1] << 8) : u16be(b, at));
  const u32 = (at) => (le ? u32le(b, at) : u32be(b, at));
  const dir = tiff + u32(tiff + 4);
  if (dir + 2 > end) return null;
  let res = null;
  let unit = 2;
  for (let i = 0, n = u16(dir); i < n; i++) {
    const entry = dir + 2 + i * 12;
    if (entry + 12 > end) break;
    const tag = u16(entry);
    if (tag === 0x011a) {
      const at = tiff + u32(entry + 8);
      if (at + 8 <= end && u32(at + 4)) res = u32(at) / u32(at + 4);
    } else if (tag === 0x0128) {
      unit = u16(entry + 8);
    }
  }
  if (!(res > 0)) return null;
  if (unit === 2) return res;
  if (unit === 3) return res * 2.54;
  return null;
}

function pngDpi(b) {
  for (let at = 8; at + 12 <= b.length;) {
    const length = u32be(b, at);
    const type = ascii(b, at + 4, 4);
    if (type === 'pHYs') {
      if (length < 9 || at + 17 > b.length) return null;
      const perMetre = u32be(b, at + 8);
      return b[at + 16] === 1 && perMetre > 0 ? perMetre * 0.0254 : null;
    }
    if (type === 'IDAT' || type === 'IEND') return null;   // pHYs comes before the pixels
    at += 12 + length;
  }
  return null;
}

function jpegDpi(b) {
  let exif = null;
  for (let at = 2; at + 4 <= b.length;) {
    if (b[at] !== 0xff) break;
    const marker = b[at + 1];
    if (marker === 0xff) { at += 1; continue; }                     // padding
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { at += 2; continue; }
    if (marker === 0xda || marker === 0xd9) break;                  // the pixels: no more headers
    const length = u16be(b, at + 2);
    const start = at + 4;
    const end = Math.min(b.length, at + 2 + length);
    if (marker === 0xe0 && start + 12 <= end && ascii(b, start, 5) === 'JFIF\0') {
      const units = b[start + 7];
      const x = u16be(b, start + 8);
      if (units === 1 && x > 0) return x;
      if (units === 2 && x > 0) return x * 2.54;
      // units 0 is a shape, not a size: the EXIF block may still say
    } else if (marker === 0xe1 && exif == null && start + 6 <= end && ascii(b, start, 6) === 'Exif\0\0') {
      exif = exifDpi(b, start + 6, end);
    }
    at += 2 + length;
  }
  return exif;
}

function webpDpi(b) {
  for (let at = 12; at + 8 <= b.length;) {
    const length = u32le(b, at + 4);
    if (ascii(b, at, 4) === 'EXIF') {
      const start = at + 8;
      const end = Math.min(b.length, start + length);
      // Some writers keep JPEG's "Exif\0\0" in front of the TIFF header, most do not.
      return exifDpi(b, ascii(b, start, 6) === 'Exif\0\0' ? start + 6 : start, end);
    }
    at += 8 + length + (length % 2);
  }
  return null;
}

/** The dpi a picture's own header gives, or null when it gives none. */
export function pictureDpi(bytes, kind = pictureKind(bytes)) {
  if (!bytes) return null;
  if (kind === 'png') return pngDpi(bytes);
  if (kind === 'jpeg') return jpegDpi(bytes);
  if (kind === 'webp') return webpDpi(bytes);
  if (kind === 'bmp' && bytes.length >= 46 && u32le(bytes, 14) >= 40) {
    const perMetre = u32le(bytes, 38);
    return perMetre > 0 && perMetre < 2 ** 31 ? perMetre * 0.0254 : null;
  }
  return null;
}

/** The dpi a picture is reckoned at when its header says nothing about print. */
export const PICTURE_DPI = 300;
const PRINT_DPI_MIN = 150;
const PRINT_DPI_MAX = 2400;

/**
 * The dpi that gives a picture its size in mm. A designer's print file says 300 or 600
 * and means it. 72 and 96 are what cameras, phones and screens write without meaning
 * anything (a 4000 px photo at 72 dpi would be 1.4 m wide), and many files say nothing:
 * those are taken at 300 dpi, the shop's own standard.
 */
export function printDpi(dpi) {
  if (!(Number.isFinite(dpi) && dpi >= PRINT_DPI_MIN && dpi <= PRINT_DPI_MAX)) return PICTURE_DPI;
  return Math.round(dpi * 100) / 100;
}

/**
 * pdf.js's PageViewport for a page [0, 0, width, height] in points, at `scale`, turned
 * `rotation` degrees clockwise: the same numbers, so a picture page is laid out exactly as
 * a PDF page would be. { width, height, scale, rotation, transform }, transform mapping
 * page points (y up) to canvas pixels (y down).
 */
export function pictureViewport(width, height, scale = 1, rotation = 0) {
  const turn = ((rotation % 360) + 360) % 360;
  const [a, b, c, d] = {
    0: [1, 0, 0, -1], 90: [0, 1, 1, 0], 180: [-1, 0, 0, 1], 270: [0, -1, -1, 0],
  }[turn] || [];
  if (a === undefined) throw new Error('A page turns by a multiple of 90 degrees');
  const cx = width / 2;
  const cy = height / 2;
  const sideways = a === 0;
  const offX = (sideways ? cy : cx) * scale;
  const offY = (sideways ? cx : cy) * scale;
  return {
    width: (sideways ? height : width) * scale,
    height: (sideways ? width : height) * scale,
    scale,
    rotation: turn,
    transform: [
      a * scale, b * scale, c * scale, d * scale,
      offX - a * scale * cx - c * scale * cy,
      offY - b * scale * cx - d * scale * cy,
    ],
  };
}
