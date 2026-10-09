// Stream filters: Flate (with PNG/TIFF predictors), LZW, ASCII85, ASCIIHex,
// RunLength. Image codecs (DCT, JPX, JBIG2, CCITT) are not decoded - an image
// can never be a cut line, so we only count images.
//
// Why our own inflate rather than DecompressionStream, which the prototype used:
//   * DecompressionStream needs Safari 16.4 / Chrome 103 for 'deflate-raw'; our
//     customers are on phones, and older phones would fail on every file.
//   * it throws on trailing junk and a missing Adler-32. This decoder accepts
//     both after a COMPLETE deflate stream, and on damage it keeps what it
//     decoded but marks the result `incomplete`: a stream that stopped before
//     its final block, or whose Adler-32 is present and wrong, must never be
//     priced from the part that survived (the reader turns it into 'corrupt').
//   * it is synchronous, so node tests and the browser run the same code path.
// It is the classic "puff" canonical-Huffman decoder: small and slow-ish
// (tens of MB/s), which is plenty for content streams.

export class TooComplex extends Error {
  constructor() { super('too-complex'); this.code = 'too-complex'; }
}

/** Shared decode budget, so a small "zip bomb" cannot eat a phone's memory. */
export const makeBudget = (bytes = 256 * 1024 * 1024) => ({ left: bytes });

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function huff(lengths, n) {
  const count = new Uint16Array(16);
  const symbol = new Uint16Array(n);
  for (let i = 0; i < n; i++) count[lengths[i]]++;
  count[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
  for (let i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
  return { count, symbol };
}

let FIXED = null;
function fixedTrees() {
  if (FIXED) return FIXED;
  const l = new Uint8Array(288);
  for (let i = 0; i < 144; i++) l[i] = 8;
  for (let i = 144; i < 256; i++) l[i] = 9;
  for (let i = 256; i < 280; i++) l[i] = 7;
  for (let i = 280; i < 288; i++) l[i] = 8;
  const d = new Uint8Array(30).fill(5);
  FIXED = [huff(l, 288), huff(d, 30)];
  return FIXED;
}

const PDF_WS = new Set([0, 9, 10, 12, 13, 32]);

function adler32(u8, n) {
  let a = 1, b = 0;
  for (let i = 0; i < n;) {
    const end = Math.min(n, i + 5552);
    for (; i < end; i++) { a += u8[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Inflate raw or zlib-wrapped deflate data. Never throws on damaged input:
 * returns what was decoded up to the damage, with `.incomplete = true` when the
 * stream stopped before its final block or its Adler-32 checksum is wrong.
 * Trailing junk after a complete stream, or a missing checksum, is accepted.
 * Throws TooComplex past the budget.
 */
export function inflate(data, budget = makeBudget()) {
  let pos = 0;
  // zlib header: CM = 8 and the 16-bit header is a multiple of 31
  const zlibWrapped = data.length > 2 && (data[0] & 0x0f) === 8 && ((data[0] << 8) | data[1]) % 31 === 0;
  if (zlibWrapped) pos = 2;
  let complete = false;
  let bitbuf = 0, bitcnt = 0;
  let out = new Uint8Array(Math.max(1024, data.length * 4));
  let o = 0;
  const END = {};
  const need = (n) => {
    if (o + n <= out.length) return;
    let size = out.length * 2;
    while (size < o + n) size *= 2;
    if (size - out.length > budget.left) { if (o + n - out.length > budget.left) throw new TooComplex(); size = o + n; }
    budget.left -= size - out.length;
    const next = new Uint8Array(size);
    next.set(out.subarray(0, o));
    out = next;
  };
  const bits = (n) => {
    while (bitcnt < n) {
      if (pos >= data.length) throw END;
      bitbuf |= data[pos++] << bitcnt;
      bitcnt += 8;
    }
    const v = bitbuf & ((1 << n) - 1);
    bitbuf >>>= n;
    bitcnt -= n;
    return v;
  };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = h.count[len];
      if (code - count < first) return h.symbol[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw END; // invalid code
  };
  try {
    let last = 0;
    while (!last) {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        if (pos + 4 > data.length) throw END;
        const len = data[pos] | (data[pos + 1] << 8);
        pos += 4;
        const n = Math.min(len, data.length - pos);
        need(n);
        out.set(data.subarray(pos, pos + n), o);
        o += n; pos += n;
        if (n < len) throw END;
        continue;
      }
      let lit, dist;
      if (type === 1) [lit, dist] = fixedTrees();
      else if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < ncode; i++) cl[CLORDER[i]] = bits(3);
        const clh = huff(cl, 19);
        const lengths = new Uint8Array(nlen + ndist);
        for (let i = 0; i < nlen + ndist;) {
          const sym = decode(clh);
          if (sym < 16) lengths[i++] = sym;
          else {
            let rep = 0, val = 0;
            if (sym === 16) { if (!i) throw END; val = lengths[i - 1]; rep = 3 + bits(2); }
            else if (sym === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            if (i + rep > nlen + ndist) throw END;
            while (rep--) lengths[i++] = val;
          }
        }
        lit = huff(lengths.subarray(0, nlen), nlen);
        dist = huff(lengths.subarray(nlen), ndist);
      } else throw END;
      for (;;) {
        const sym = decode(lit);
        if (sym < 256) { need(1); out[o++] = sym; }
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          if (li >= 29) throw END;
          const len = LBASE[li] + bits(LEXT[li]);
          const di = decode(dist);
          if (di >= 30) throw END;
          const d = DBASE[di] + bits(DEXT[di]);
          if (d > o) throw END;
          need(len);
          for (let k = 0; k < len; k++, o++) out[o] = out[o - d];
        }
      }
    }
    complete = true;
  } catch (e) {
    if (e !== END) throw e;
  }
  const result = out.subarray(0, o);
  if (!complete) result.incomplete = true;
  else if (zlibWrapped) {
    // The checksum starts on the next byte boundary. If there is not a full
    // one, or what follows is only whitespace, the writer left it out.
    const at = pos;
    const tail = data.subarray(at, at + 4);
    const blank = [...tail].every((c) => PDF_WS.has(c));
    if (tail.length === 4 && !blank) {
      const want = ((tail[0] << 24) | (tail[1] << 16) | (tail[2] << 8) | tail[3]) >>> 0;
      if (want !== adler32(result, o)) result.incomplete = true;
    }
  }
  return result;
}

export function predictor(data, parms) {
  const pred = parms?.Predictor || 1;
  if (pred < 2) return data;
  const colors = parms.Colors || 1, bpc = parms.BitsPerComponent || 8, cols = parms.Columns || 1;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * cols) / 8);
  if (pred === 2) {
    if (bpc !== 8) return data;
    const out = Uint8Array.from(data);
    for (let r = 0; r * rowLen < out.length; r++) {
      for (let i = bpp; i < rowLen && r * rowLen + i < out.length; i++) out[r * rowLen + i] = (out[r * rowLen + i] + out[r * rowLen + i - bpp]) & 255;
    }
    return out;
  }
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const t = data[r * (rowLen + 1)];
    const row = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (t === 1) v += a;
      else if (t === 2) v += b;
      else if (t === 3) v += (a + b) >> 1;
      else if (t === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  return out;
}

const isWs = (c) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;

export function ascii85(d) {
  const out = [];
  let t = 0, n = 0;
  let i = 0;
  if (d[0] === 60 && d[1] === 126) i = 2; // optional <~
  for (; i < d.length; i++) {
    const c = d[i];
    if (isWs(c)) continue;
    if (c === 126) break; // ~>
    if (c === 122 && n === 0) { out.push(0, 0, 0, 0); continue; }
    if (c < 33 || c > 117) continue;
    t = t * 85 + (c - 33);
    if (++n === 5) {
      out.push((t >>> 24) & 255, (t >>> 16) & 255, (t >>> 8) & 255, t & 255);
      t = 0; n = 0;
    }
  }
  if (n > 1) {
    for (let k = n; k < 5; k++) t = t * 85 + 84;
    const b = [(t >>> 24) & 255, (t >>> 16) & 255, (t >>> 8) & 255, t & 255];
    out.push(...b.slice(0, n - 1));
  }
  return Uint8Array.from(out);
}

export function asciiHex(d) {
  const out = [];
  let hi = -1;
  for (const c of d) {
    if (c === 62) break;
    const v = c >= 48 && c <= 57 ? c - 48 : (c | 32) >= 97 && (c | 32) <= 102 ? (c | 32) - 87 : -1;
    if (v < 0) continue;
    if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; }
  }
  if (hi >= 0) out.push(hi * 16);
  return Uint8Array.from(out);
}

export function lzw(d, early = 1) {
  const out = [];
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), len = new Int32Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; len[i] = 1; }
  let next = 258, width = 9, prev = -1, acc = 0, bitsIn = 0, p = 0;
  const str = (code) => {
    const s = new Array(len[code]);
    for (let c = code, i = len[code] - 1; c >= 0 && i >= 0; c = prefix[c], i--) s[i] = suffix[c];
    return s;
  };
  for (;;) {
    while (bitsIn < width && p < d.length) { acc = ((acc << 8) | d[p++]) >>> 0; bitsIn += 8; }
    if (bitsIn < width) break;
    const code = (acc >>> (bitsIn - width)) & ((1 << width) - 1);
    bitsIn -= width;
    acc &= (1 << bitsIn) - 1;
    if (code === 256) { next = 258; width = 9; prev = -1; continue; }
    if (code === 257) break;
    let s;
    if (code < next) s = str(code);
    else if (prev >= 0) { s = str(prev); s.push(s[0]); } else break;
    for (const v of s) out.push(v);
    if (prev >= 0 && next < 4096) { prefix[next] = prev; suffix[next] = s[0]; len[next] = len[prev] + 1; next++; }
    prev = code;
    if (next + early >= (1 << width) && width < 12) width++;
  }
  return Uint8Array.from(out);
}

export function runLength(d) {
  const out = [];
  for (let i = 0; i < d.length;) {
    const n = d[i++];
    if (n === 128) break;
    if (n < 128) { for (let k = 0; k <= n && i < d.length; k++) out.push(d[i++]); }
    else { const v = d[i++]; for (let k = 0; k < 257 - n; k++) out.push(v); }
  }
  return Uint8Array.from(out);
}
