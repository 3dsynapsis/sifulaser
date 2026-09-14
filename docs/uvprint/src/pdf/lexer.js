// PDF tokenizer and object parser, shared by the file structure (objects.js)
// and the page content interpreter (content.js).
//
// Grown from the research prototype (26_scratch_research/proto/pdf-geom.mjs),
// which matched pdf.js on 20 of 22 real Illustrator/CorelDRAW files. Strings
// stay as latin1 "byte strings" here: decryption needs the bytes, and the few
// strings we show a person (layer names) are decoded later by textOf().

export const WS = new Uint8Array(256);
[0, 9, 10, 12, 13, 32].forEach((c) => { WS[c] = 1; });
const DL = new Uint8Array(256);
[...'()<>[]{}/%'].forEach((c) => { DL[c.charCodeAt(0)] = 1; });

export class Name { constructor(n) { this.n = n; } }
export class Ref { constructor(num, gen) { this.num = num; this.gen = gen; } }
export class Kw { constructor(k) { this.k = k; } }
export class Str { constructor(s) { this.s = s; } }
export class Stream {
  constructor(dict, bytes) {
    this.dict = dict;
    this.bytes = bytes;
    this.num = -1; // set when the stream is a top-level object, for decryption
    this.gen = 0;
  }
}
export const EOF = new Kw('%%EOF-token');

export const latin1 = (u8, a = 0, b = u8.length) => {
  let s = '';
  for (let i = a; i < b; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(b, i + 8192)));
  return s;
};

export const bytesOf = (s) => {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
  return u;
};

/**
 * A PDF text string as a person would read it: UTF-16BE with a BOM, UTF-8 with
 * a BOM (PDF 2.0), otherwise PDFDocEncoding - which agrees with latin1 for
 * every character a layer name is likely to use.
 */
export function textOf(v) {
  const s = v instanceof Str ? v.s : v instanceof Name ? v.n : String(v ?? '');
  if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < s.length; i += 2) out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
    return out;
  }
  if (s.startsWith('\xef\xbb\xbf') || v instanceof Name) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytesOf(s.startsWith('\xef\xbb\xbf') ? s.slice(3) : s)); } catch { /* not UTF-8 */ }
  }
  return s;
}

const ESC = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 };

export class Lexer {
  constructor(u8, pos = 0) { this.b = u8; this.p = pos; }

  skipWs() {
    const b = this.b;
    for (;;) {
      while (this.p < b.length && WS[b[this.p]]) this.p++;
      if (b[this.p] === 37) { // % comment
        while (this.p < b.length && b[this.p] !== 10 && b[this.p] !== 13) this.p++;
      } else return;
    }
  }

  next() {
    this.skipWs();
    const b = this.b;
    if (this.p >= b.length) return EOF;
    const c = b[this.p];
    if (c === 47) { // /Name, with #xx escapes decoded
      let s = '';
      this.p++;
      while (this.p < b.length && !WS[b[this.p]] && !DL[b[this.p]]) {
        if (b[this.p] === 35 && this.p + 2 < b.length) {
          const h = parseInt(String.fromCharCode(b[this.p + 1], b[this.p + 2]), 16);
          if (!Number.isNaN(h)) { s += String.fromCharCode(h); this.p += 3; continue; }
        }
        s += String.fromCharCode(b[this.p++]);
      }
      return new Name(s);
    }
    if (c === 40) { // (literal string)
      let depth = 1;
      const parts = [];
      this.p++;
      while (this.p < b.length) {
        const ch = b[this.p++];
        if (ch === 92) {
          const e = b[this.p++];
          if (ESC[e] !== undefined) parts.push(ESC[e]);
          else if (e >= 48 && e <= 55) {
            let o = e - 48;
            for (let k = 0; k < 2 && b[this.p] >= 48 && b[this.p] <= 55; k++) o = o * 8 + b[this.p++] - 48;
            parts.push(o & 255);
          } else if (e === 13) { if (b[this.p] === 10) this.p++; } else if (e !== 10) parts.push(e);
          continue;
        }
        if (ch === 40) depth++;
        else if (ch === 41 && --depth === 0) break;
        parts.push(ch);
      }
      return new Str(latin1(Uint8Array.from(parts)));
    }
    if (c === 60) {
      if (b[this.p + 1] === 60) { this.p += 2; return new Kw('<<'); }
      const out = [];
      let hi = -1;
      this.p++;
      while (this.p < b.length && b[this.p] !== 62) {
        const d = b[this.p++];
        const v = d >= 48 && d <= 57 ? d - 48 : (d | 32) >= 97 && (d | 32) <= 102 ? (d | 32) - 87 : -1;
        if (v < 0) continue;
        if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; }
      }
      if (hi >= 0) out.push(hi * 16);
      this.p++;
      return new Str(latin1(Uint8Array.from(out)));
    }
    if (c === 62 && b[this.p + 1] === 62) { this.p += 2; return new Kw('>>'); }
    if (c === 91 || c === 93 || c === 123 || c === 125) { this.p++; return new Kw(String.fromCharCode(c)); }
    if (c === 41 || c === 62) { this.p++; return this.next(); } // stray delimiter

    const st = this.p;
    while (this.p < b.length && !WS[b[this.p]] && !DL[b[this.p]]) this.p++;
    // Numbers: the hot path in content streams, so no regex.
    if ((c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46) {
      let neg = false, i = st, v = 0, frac = 0, scale = 1, ok = true, seenDigit = false;
      if (b[i] === 45 || b[i] === 43) { neg = b[i] === 45; i++; }
      for (; i < this.p; i++) {
        const d = b[i];
        if (d >= 48 && d <= 57) { seenDigit = true; if (frac) { scale /= 10; v += (d - 48) * scale; } else v = v * 10 + d - 48; }
        else if (d === 46 && !frac) frac = 1;
        else { ok = false; break; }
      }
      if (ok && seenDigit) return neg ? -v : v;
      // Malformed numbers such as "1.2-3" or "--5" turn up in real files.
      const f = parseFloat(latin1(b, st, this.p).replace(/^--/, '-'));
      return Number.isFinite(f) ? f : 0;
    }
    return new Kw(latin1(b, st, this.p));
  }

  /** Parse one object. Indirect references "n g R" only where allowRefs. */
  obj(allowRefs = true, tok = this.next(), depth = 0) {
    if (tok instanceof Kw) {
      if (depth > 100) return null;
      if (tok.k === '[') {
        const a = [];
        for (;;) {
          const t = this.next();
          if (t === EOF || (t instanceof Kw && t.k === ']')) return a;
          a.push(this.obj(allowRefs, t, depth + 1));
          if (allowRefs) foldRef(a);
        }
      }
      if (tok.k === '<<') {
        const d = Object.create(null);
        for (;;) {
          const k = this.next();
          if (k === EOF || (k instanceof Kw && k.k === '>>')) return d;
          if (!(k instanceof Name)) continue;
          d[k.n] = this.obj(allowRefs, this.next(), depth + 1);
        }
      }
      if (tok.k === 'true') return true;
      if (tok.k === 'false') return false;
      if (tok.k === 'null') return null;
    }
    if (allowRefs && typeof tok === 'number' && Number.isInteger(tok) && tok >= 0) {
      const save = this.p;
      const g = this.next();
      if (typeof g === 'number' && Number.isInteger(g)) {
        const r = this.next();
        if (r instanceof Kw && r.k === 'R') return new Ref(tok, g);
      }
      this.p = save;
    }
    return tok;
  }
}

function foldRef(a) {
  const n = a.length;
  if (n >= 3 && a[n - 1] instanceof Kw && a[n - 1].k === 'R' && Number.isInteger(a[n - 2]) && Number.isInteger(a[n - 3])) {
    a.splice(n - 3, 3, new Ref(a[n - 3], a[n - 2]));
  }
}
