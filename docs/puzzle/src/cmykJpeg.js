// The print file's picture in CMYK (Boss, 11 Nov 2026): "pastikan dalam format
// CMYK, bukan RGB", like the designer's Photoshop files.
//
// A browser can only draw RGB, so the picture pdf.js draws is turned into CMYK here,
// through src/cmykTable.js: pdf.js's own CMYK to RGB run backwards (see
// tools/make-cmyk-table.js). A CMYK poster comes back as nearly the inks it was made
// with; a colour of one ink alone, black text above all, comes back as that one ink.
// Then it is saved as a CMYK JPEG, which
// no browser can write either, so the encoder is here too: baseline JPEG, four
// components at full size, stored the way Photoshop stores CMYK (inverted, 255 = no
// ink) with Adobe's marker saying no colour transform. pdf-lib's embedJpg places it
// with the Decode array that undoes the inversion.
//
// No DOM: it runs in a worker (cmykWorker.js) and in the tests.

import { GRID, TABLE_BASE64 } from './cmykTable.js';
import { cmykToRgb } from './pdfjsCmyk.js';

let table = null;
function cmykTable() {
  if (!table) {
    const bin = atob(TABLE_BASE64);
    table = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) table[i] = bin.charCodeAt(i);
  }
  return table;
}

// An ink this light (about 1%) comes from interpolating between grid points, not from
// the poster, and on black text it would print a faint rim of colour.
const SNAP = 3;

// Colours of one ink alone: black text, greys, a flat cyan. Between grid points the
// table would mix in a few percent of the other inks, so these are recognised first and
// kept to their one ink. Each ink's colours are indexed by each channel in turn, the one
// that changes most first: a channel that has already hit 0 (red, past 90% cyan) can no
// longer tell one level from the next, and the next channel can.
const AXIS_TOLERANCE = 2;   // 8-bit steps: what pdf.js's rounding and blending leave
let axes = null;

function inkAxes() {
  if (axes) return axes;
  axes = [3, 0, 1, 2].map((ink) => {        // K first: black text matters most
    const drawn = [];
    for (let s = 0; s <= 2040; s++) {
      const inks = [0, 0, 0, 0];
      inks[ink] = s / 2040;
      drawn.push({ level: Math.round((s / 2040) * 255), rgb: cmykToRgb(...inks).map((v) => Math.min(255, Math.max(0, Math.round(v)))) });
    }
    const spread = (ch) => drawn[0].rgb[ch] - drawn[drawn.length - 1].rgb[ch];
    const keys = [0, 1, 2].sort((a, b) => spread(b) - spread(a)).filter((ch) => spread(ch) > 8).map((key) => {
      const level = new Int16Array(256).fill(-1);  // ink 0..255 for each value of the key channel
      const rgb = new Uint8Array(256 * 3);          // what that ink level draws
      // Several levels share a key value: it gets the middle one. Where that is not the
      // colour (a channel clamped at 0), the next key tells them apart.
      const sum = new Float64Array(256);
      const count = new Uint16Array(256);
      for (const d of drawn) {
        sum[d.rgb[key]] += d.level;
        count[d.rgb[key]] += 1;
      }
      for (let v = 0; v < 256; v++) {
        if (!count[v]) continue;
        level[v] = Math.round(sum[v] / count[v]);
        const inks = [0, 0, 0, 0];
        inks[ink] = level[v] / 255;
        rgb.set(cmykToRgb(...inks).map((c) => Math.min(255, Math.max(0, Math.round(c)))), v * 3);
      }
      // Solid ink is what designers use most: the colour full ink draws is full ink.
      const full = drawn[drawn.length - 1].rgb;
      level[full[key]] = 255;
      rgb.set(full, full[key] * 3);
      return { key, level, rgb };
    });
    return { ink, keys };
  });
  return axes;
}

/**
 * RGBA pixels to CMYK as a CMYK JPEG holds them: 4 bytes a pixel, 255 = no ink.
 * Tetrahedral interpolation in the table, as colour management systems do.
 * @param rgba        Uint8Array or Uint8ClampedArray, 4 bytes a pixel
 * @param pixelCount  how many pixels
 */
export function rgbaToCmyk(rgba, pixelCount) {
  const T = cmykTable();
  const A = inkAxes();
  const last = GRID - 1;
  const sR = GRID * GRID * 4;
  const sG = GRID * 4;
  const sB = 4;
  const s111 = sR + sG + sB;
  const scale = last / 255;
  const out = new Uint8Array(pixelCount * 4);
  let pr = -1;
  let pg = -1;
  let pb = -1;
  let k0 = 255;
  let k1 = 255;
  let k2 = 255;
  let k3 = 255;
  for (let i = 0, end = pixelCount * 4; i < end; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    // Posters are full of flat colour: the same pixel again costs nothing.
    if (r !== pr || g !== pg || b !== pb) {
      pr = r;
      pg = g;
      pb = b;
      let one = -1;
      let level = 0;
      for (let a = 0; a < 4 && one < 0; a++) {
        const { ink, keys } = A[a];
        for (let j = 0; j < keys.length && one < 0; j++) {
          const axis = keys[j];
          const v = axis.key === 0 ? r : axis.key === 1 ? g : b;
          const l = axis.level[v];
          const o = v * 3;
          if (l >= 0 && Math.abs(axis.rgb[o] - r) <= AXIS_TOLERANCE && Math.abs(axis.rgb[o + 1] - g) <= AXIS_TOLERANCE
            && Math.abs(axis.rgb[o + 2] - b) <= AXIS_TOLERANCE) {
            one = ink;
            level = l < SNAP ? 0 : l;
          }
        }
      }
      if (one >= 0) {
        k0 = one === 0 ? 255 - level : 255;
        k1 = one === 1 ? 255 - level : 255;
        k2 = one === 2 ? 255 - level : 255;
        k3 = one === 3 ? 255 - level : 255;
        out[i] = k0;
        out[i + 1] = k1;
        out[i + 2] = k2;
        out[i + 3] = k3;
        continue;
      }
      const fr = r * scale;
      const fg = g * scale;
      const fb = b * scale;
      const ir = fr >= last ? last - 1 : fr | 0;
      const ig = fg >= last ? last - 1 : fg | 0;
      const ib = fb >= last ? last - 1 : fb | 0;
      const dr = fr - ir;
      const dg = fg - ig;
      const db = fb - ib;
      let o1;
      let o2;
      let w0;
      let w1;
      let w2;
      let w3;
      if (dr >= dg) {
        if (dg >= db) { o1 = sR; o2 = sR + sG; w0 = 1 - dr; w1 = dr - dg; w2 = dg - db; w3 = db; } else if (dr >= db) { o1 = sR; o2 = sR + sB; w0 = 1 - dr; w1 = dr - db; w2 = db - dg; w3 = dg; } else { o1 = sB; o2 = sR + sB; w0 = 1 - db; w1 = db - dr; w2 = dr - dg; w3 = dg; }
      } else if (db >= dg) { o1 = sB; o2 = sG + sB; w0 = 1 - db; w1 = db - dg; w2 = dg - dr; w3 = dr; } else if (db >= dr) { o1 = sG; o2 = sG + sB; w0 = 1 - dg; w1 = dg - db; w2 = db - dr; w3 = dr; } else { o1 = sG; o2 = sR + sG; w0 = 1 - dg; w1 = dg - dr; w2 = dr - db; w3 = db; }
      const a = ir * sR + ig * sG + ib * sB;
      const p1 = a + o1;
      const p2 = a + o2;
      const p3 = a + s111;
      const v0 = w0 * T[a] + w1 * T[p1] + w2 * T[p2] + w3 * T[p3];
      const v1 = w0 * T[a + 1] + w1 * T[p1 + 1] + w2 * T[p2 + 1] + w3 * T[p3 + 1];
      const v2 = w0 * T[a + 2] + w1 * T[p1 + 2] + w2 * T[p2 + 2] + w3 * T[p3 + 2];
      const v3 = w0 * T[a + 3] + w1 * T[p1 + 3] + w2 * T[p2 + 3] + w3 * T[p3 + 3];
      k0 = v0 < SNAP ? 255 : 255 - Math.round(v0);
      k1 = v1 < SNAP ? 255 : 255 - Math.round(v1);
      k2 = v2 < SNAP ? 255 : 255 - Math.round(v2);
      k3 = v3 < SNAP ? 255 : 255 - Math.round(v3);
    }
    out[i] = k0;
    out[i + 1] = k1;
    out[i + 2] = k2;
    out[i + 3] = k3;
  }
  return out;
}

// ---- baseline JPEG, four components ---------------------------------------------

/** Zig-zag position -> index in a row-major 8 x 8 block. */
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

/** The JPEG standard's luminance table (Annex K), row-major. Used for all four inks. */
const BASE_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

// The standard's Huffman tables (Annex K.3), luminance DC and AC.
const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

// Scale factors of the AAN DCT below, row and column.
const AASF = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.541196100, 0.275899379];

function huffman(bits, vals) {
  const codes = new Uint16Array(256);
  const sizes = new Uint8Array(256);
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]; i++) {
      codes[vals[k]] = code;
      sizes[vals[k]] = len;
      k++;
      code++;
    }
    code <<= 1;
  }
  return { codes, sizes };
}

/** The standard table at a quality, as libjpeg scales it. Row-major. */
export function quantTable(quality) {
  const q = Math.min(100, Math.max(1, quality));
  const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
  return BASE_QUANT.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));
}

class BitWriter {
  constructor(size) {
    this.buf = new Uint8Array(size);
    this.pos = 0;
    this.acc = 0;
    this.count = 0;
  }

  room(extra) {
    if (this.pos + extra <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.pos + extra));
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
  }

  bytes(list) {
    this.room(list.length);
    for (const b of list) this.buf[this.pos++] = b;
  }

  /** Entropy-coded bits, at most 16 at a time; a 0xFF byte is followed by 0x00. */
  bits(value, length) {
    this.acc = (this.acc << length) | value;
    this.count += length;
    while (this.count >= 8) {
      const b = (this.acc >>> (this.count - 8)) & 0xff;
      this.room(2);
      this.buf[this.pos++] = b;
      if (b === 0xff) this.buf[this.pos++] = 0;
      this.count -= 8;
    }
    this.acc &= (1 << this.count) - 1;
  }

  /** Pad the last byte with 1s. */
  flush() {
    if (this.count > 0) this.bits((1 << (8 - this.count)) - 1, 8 - this.count);
  }
}

/** Forward DCT, AAN, in place on a row-major block. Leaves out the scale AASF carries. */
function fdct(d) {
  for (let o = 0; o < 64; o += 8) {
    const t0 = d[o] + d[o + 7];
    const t7 = d[o] - d[o + 7];
    const t1 = d[o + 1] + d[o + 6];
    const t6 = d[o + 1] - d[o + 6];
    const t2 = d[o + 2] + d[o + 5];
    const t5 = d[o + 2] - d[o + 5];
    const t3 = d[o + 3] + d[o + 4];
    const t4 = d[o + 3] - d[o + 4];
    let t10 = t0 + t3;
    const t13 = t0 - t3;
    let t11 = t1 + t2;
    let t12 = t1 - t2;
    d[o] = t10 + t11;
    d[o + 4] = t10 - t11;
    const z1 = (t12 + t13) * 0.707106781;
    d[o + 2] = t13 + z1;
    d[o + 6] = t13 - z1;
    t10 = t4 + t5;
    t11 = t5 + t6;
    t12 = t6 + t7;
    const z5 = (t10 - t12) * 0.382683433;
    const z2 = 0.541196100 * t10 + z5;
    const z4 = 1.306562965 * t12 + z5;
    const z3 = t11 * 0.707106781;
    const z11 = t7 + z3;
    const z13 = t7 - z3;
    d[o + 5] = z13 + z2;
    d[o + 3] = z13 - z2;
    d[o + 1] = z11 + z4;
    d[o + 7] = z11 - z4;
  }
  for (let o = 0; o < 8; o++) {
    const t0 = d[o] + d[o + 56];
    const t7 = d[o] - d[o + 56];
    const t1 = d[o + 8] + d[o + 48];
    const t6 = d[o + 8] - d[o + 48];
    const t2 = d[o + 16] + d[o + 40];
    const t5 = d[o + 16] - d[o + 40];
    const t3 = d[o + 24] + d[o + 32];
    const t4 = d[o + 24] - d[o + 32];
    let t10 = t0 + t3;
    const t13 = t0 - t3;
    let t11 = t1 + t2;
    let t12 = t1 - t2;
    d[o] = t10 + t11;
    d[o + 32] = t10 - t11;
    const z1 = (t12 + t13) * 0.707106781;
    d[o + 16] = t13 + z1;
    d[o + 48] = t13 - z1;
    t10 = t4 + t5;
    t11 = t5 + t6;
    t12 = t6 + t7;
    const z5 = (t10 - t12) * 0.382683433;
    const z2 = 0.541196100 * t10 + z5;
    const z4 = 1.306562965 * t12 + z5;
    const z3 = t11 * 0.707106781;
    const z11 = t7 + z3;
    const z13 = t7 - z3;
    d[o + 40] = z13 + z2;
    d[o + 24] = z13 - z2;
    d[o + 8] = z11 + z4;
    d[o + 56] = z11 - z4;
  }
}

/**
 * A CMYK JPEG of pixels from rgbaToCmyk.
 * @param cmyk    4 bytes a pixel, as rgbaToCmyk gives them
 * @param quality 1..100, as for any JPEG; 92 keeps small text clean
 * @returns Uint8Array, the whole file
 */
export function encodeCmykJpeg(cmyk, width, height, quality = 92) {
  const qt = quantTable(quality);
  const scaleBy = new Float64Array(64);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) scaleBy[row * 8 + col] = 1 / (qt[row * 8 + col] * AASF[row] * AASF[col] * 8);
  }
  const dc = huffman(DC_BITS, DC_VALS);
  const ac = huffman(AC_BITS, AC_VALS);
  const out = new BitWriter(Math.max(1 << 16, (width * height) >> 1));

  const u16 = (v) => [(v >> 8) & 0xff, v & 0xff];
  out.bytes([0xff, 0xd8]);                                          // SOI
  out.bytes([0xff, 0xee, 0x00, 0x0e, 0x41, 0x64, 0x6f, 0x62, 0x65,  // APP14 "Adobe"
    0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00]);                     // version 100, no transform
  out.bytes([0xff, 0xdb, 0x00, 0x43, 0x00, ...ZIGZAG.map((n) => qt[n])]);
  out.bytes([0xff, 0xc0, 0x00, 0x14, 0x08, ...u16(height), ...u16(width), 0x04,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0x04, 0x11, 0x00]);
  out.bytes([0xff, 0xc4, ...u16(2 + 17 + DC_VALS.length + 17 + AC_VALS.length),
    0x00, ...DC_BITS, ...DC_VALS, 0x10, ...AC_BITS, ...AC_VALS]);
  out.bytes([0xff, 0xda, 0x00, 0x0e, 0x04, 0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0x04, 0x00, 0x00, 0x3f, 0x00]);

  const block = new Float64Array(64);
  const coef = new Int32Array(64);
  const previous = [0, 0, 0, 0];
  const stride = width * 4;
  const put = (code, size) => out.bits(code, size);
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      for (let c = 0; c < 4; c++) {
        // The last blocks of a row or column repeat the edge pixel, as libjpeg does.
        for (let y = 0; y < 8; y++) {
          const row = Math.min(by + y, height - 1) * stride + c;
          for (let x = 0; x < 8; x++) block[y * 8 + x] = cmyk[row + Math.min(bx + x, width - 1) * 4] - 128;
        }
        fdct(block);
        for (let i = 0; i < 64; i++) {
          const v = block[i] * scaleBy[i];
          coef[i] = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0;
        }
        const diff = coef[0] - previous[c];
        previous[c] = coef[0];
        if (diff === 0) put(dc.codes[0], dc.sizes[0]);
        else {
          const size = 32 - Math.clz32(diff < 0 ? -diff : diff);
          put(dc.codes[size], dc.sizes[size]);
          put(diff < 0 ? (diff - 1) & ((1 << size) - 1) : diff, size);
        }
        let run = 0;
        for (let k = 1; k < 64; k++) {
          const v = coef[ZIGZAG[k]];
          if (v === 0) {
            run++;
            continue;
          }
          while (run > 15) {
            put(ac.codes[0xf0], ac.sizes[0xf0]);
            run -= 16;
          }
          const size = 32 - Math.clz32(v < 0 ? -v : v);
          const symbol = (run << 4) | size;
          put(ac.codes[symbol], ac.sizes[symbol]);
          put(v < 0 ? (v - 1) & ((1 << size) - 1) : v, size);
          run = 0;
        }
        if (run > 0) put(ac.codes[0], ac.sizes[0]);
      }
    }
  }
  out.flush();
  out.bytes([0xff, 0xd9]);                                          // EOI
  return out.buf.slice(0, out.pos);
}
