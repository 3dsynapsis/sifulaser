// The PDF file structure: header, cross-reference table or stream, the /Prev
// chain, object streams, repair when the index is broken, and decryption.
//
// Evidence behind the choices (research report, section 2):
//   * every real Illustrator .ai on the owner's PC uses a classic xref TABLE with
//     CR line endings; Illustrator 28 "Save as PDF" and Ghostscript output use
//     xref STREAMS with object streams - so both are needed;
//   * a broken index must not become a wrong size, so the repair scans for
//     "N G obj" and rebuilds everything, and anything it still cannot read
//     reports 'corrupt' rather than guessing.

import { Lexer, Name, Ref, Kw, Str, Stream, latin1, WS, bytesOf } from './lexer.js';
import { inflate, predictor, ascii85, asciiHex, lzw, runLength, makeBudget } from './filters.js';
import { makeDecryptor } from './crypto.js';

export class PdfError extends Error {
  constructor(code, detail = '') { super(detail || code); this.code = code; }
}

export class PdfDoc {
  constructor(u8) {
    this.b = u8;
    this.xref = new Map();
    this.cache = new Map();
    this.trailer = null;
    this.repaired = false;
    this.crypt = null;
    this.encNum = -1;
    this.budget = makeBudget();
    this.base = 0;
    // Set when a decoded stream turned out truncated or damaged (see decode).
    this.incomplete = false;
  }

  async open() {
    const head = latin1(this.b, 0, Math.min(this.b.length, 1024));
    const at = head.indexOf('%PDF-');
    if (at < 0) throw new PdfError('not-pdf');
    // Offsets in files with junk before the header are sometimes relative to it.
    this.base = at;
    try {
      await this.readXrefChain();
      if (!this.trailer || !(await this.get(this.trailer.Root))) throw new Error('no root');
    } catch (e) {
      if (e.code === 'too-complex') throw e;
      await this.reconstruct();
    }
    if (this.trailer.Encrypt) {
      const encRef = this.trailer.Encrypt;
      if (encRef instanceof Ref) this.encNum = encRef.num;
      const enc = await this.get(encRef);
      if (!enc || typeof enc !== 'object') throw new PdfError('encrypted-unsupported');
      let id = await this.get(this.trailer.ID);
      id = Array.isArray(id) ? await this.get(id[0]) : null;
      this.crypt = await makeDecryptor(enc, id instanceof Str ? id : new Str(''));
      // Everything read so far was read without decryption.
      this.cache.clear();
      for (const e of this.xref.values()) delete e.stmData;
    }
  }

  async readXrefChain() {
    const tail = latin1(this.b, Math.max(0, this.b.length - 4096));
    const i = tail.lastIndexOf('startxref');
    if (i < 0) throw new Error('no startxref');
    let off = parseInt(tail.slice(i + 9).trim(), 10);
    const seen = new Set();
    while (Number.isFinite(off) && !seen.has(off)) {
      seen.add(off);
      const trailer = (await this.readXrefAt(off)) ?? (this.base ? await this.readXrefAt(off + this.base) : null);
      if (!trailer) throw new Error(`bad xref at ${off}`);
      if (!this.trailer) this.trailer = trailer;
      if (Number.isInteger(trailer.XRefStm)) await this.readXrefAt(trailer.XRefStm);
      off = trailer.Prev;
    }
  }

  async readXrefAt(off) {
    if (!(off >= 0 && off < this.b.length)) return null;
    const lx = new Lexer(this.b, off);
    const t = lx.next();
    if (t instanceof Kw && t.k === 'xref') {
      for (;;) {
        const s = lx.next();
        if (s instanceof Kw && s.k === 'trailer') return lx.obj();
        const count = lx.next();
        if (typeof s !== 'number' || typeof count !== 'number') return null;
        for (let k = 0; k < count; k++) {
          lx.skipWs();
          const line = latin1(this.b, lx.p, Math.min(this.b.length, lx.p + 20));
          const m = /^(\d{1,10})\s+(\d{1,5})\s+([nf])/.exec(line);
          if (!m) return null;
          lx.p += m[0].length;
          const num = s + k;
          if (this.xref.has(num)) continue; // a newer revision already won
          this.xref.set(num, m[3] === 'n' ? { type: 1, off: +m[1], gen: +m[2] } : { type: 0 });
        }
      }
    }
    if (typeof t === 'number') { // cross-reference stream
      const o = await this.parseIndirectAt(off);
      if (!(o?.value instanceof Stream) || o.value.dict.Type?.n !== 'XRef') return null;
      const d = o.value.dict;
      const data = await this.decode(o.value, { skipCrypt: true, xref: true });
      const W = d.W;
      if (!Array.isArray(W) || !data) return null;
      // A damaged index is rebuilt by scanning the file instead.
      if (data.incomplete) return null;
      const idx = d.Index || [0, d.Size];
      const rw = W[0] + W[1] + W[2];
      const field = (a, n, def) => {
        if (!n) return def;
        let v = 0;
        for (let q = 0; q < n; q++) v = v * 256 + data[a + q];
        return v;
      };
      let p = 0;
      for (let s = 0; s < idx.length; s += 2) {
        for (let k = 0; k < idx[s + 1] && p + rw <= data.length; k++, p += rw) {
          const type = field(p, W[0], 1), f2 = field(p + W[0], W[1], 0), f3 = field(p + W[0] + W[1], W[2], 0);
          const num = idx[s] + k;
          if (this.xref.has(num)) continue;
          this.xref.set(num, type === 1 ? { type: 1, off: f2, gen: f3 } : type === 2 ? { type: 2, stm: f2, idx: f3 } : { type: 0 });
        }
      }
      return d;
    }
    return null;
  }

  /** Rebuild the index by scanning the whole file for "N G obj". */
  async reconstruct() {
    this.repaired = true;
    this.xref.clear();
    this.cache.clear();
    const s = latin1(this.b);
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    let trailer = null;
    while ((m = re.exec(s))) this.xref.set(+m[1], { type: 1, off: m.index, gen: +m[2] });
    const ti = s.lastIndexOf('trailer');
    if (ti >= 0) { try { trailer = new Lexer(this.b, ti + 7).obj(); } catch { trailer = null; } }
    for (const [num, e] of [...this.xref]) {
      const o = await this.parseIndirectAt(e.off).catch(() => null);
      const v = o?.value;
      if (v instanceof Stream && v.dict.Type?.n === 'ObjStm') {
        const hdr = await this.objStmHeader(e, v).catch(() => []);
        hdr.forEach(([n], i) => {
          if (Number.isInteger(n) && (!this.xref.has(n) || this.xref.get(n).type !== 1)) this.xref.set(n, { type: 2, stm: num, idx: i });
        });
      }
      if ((!trailer || !trailer.Root) && v instanceof Stream && v.dict.Type?.n === 'XRef') trailer = v.dict;
    }
    if (!trailer?.Root || !(await this.get(trailer.Root))) {
      for (const [num] of this.xref) {
        const o = await this.get(new Ref(num, 0)).catch(() => null);
        if (o?.Type?.n === 'Catalog') { trailer = { ...(trailer || {}), Root: new Ref(num, 0) }; break; }
      }
    }
    if (!trailer?.Root) throw new PdfError('corrupt', 'no catalog');
    this.trailer = trailer;
  }

  async parseIndirectAt(off) {
    if (!(off >= 0 && off < this.b.length)) return undefined;
    const lx = new Lexer(this.b, off);
    const n = lx.next(), g = lx.next(), k = lx.next();
    if (typeof n !== 'number' || typeof g !== 'number' || !(k instanceof Kw && k.k === 'obj')) return undefined;
    const o = lx.obj();
    const save = lx.p;
    const t = lx.next();
    if (t instanceof Kw && t.k === 'stream' && o && typeof o === 'object' && !Array.isArray(o)) {
      let p = lx.p;
      if (this.b[p] === 13) p++;
      if (this.b[p] === 10) p++;
      let length = o.Length instanceof Ref ? await this.get(o.Length) : o.Length;
      const endOk = (L) => Number.isInteger(L) && L >= 0 && p + L <= this.b.length
        && latin1(this.b, p + L, Math.min(this.b.length, p + L + 12)).trimStart().startsWith('endstream');
      let truncated = false;
      if (!endOk(length)) {
        const e = indexOf(this.b, 'endstream', p);
        // No endstream at all: the file was cut off inside this stream.
        truncated = e < 0;
        length = e < 0 ? this.b.length - p : e - p;
        while (length > 0 && WS[this.b[p + length - 1]]) length--;
      }
      const st = new Stream(o, this.b.subarray(p, p + length));
      st.num = n; st.gen = g;
      if (truncated) st.truncated = true;
      return { value: st, num: n, gen: g };
    }
    lx.p = save;
    return { value: o, num: n, gen: g };
  }

  async objStmHeader(entry, stm) {
    if (!entry.stmData) {
      // Not flagged here: repair scans every object stream in the file, and a
      // damaged one only matters if an object page 1 needs is read from it (get).
      const data = await this.decode(stm, { noFlag: true });
      const lx = new Lexer(data || new Uint8Array(0), 0);
      const hdr = [];
      for (let i = 0; i < (stm.dict.N | 0); i++) hdr.push([lx.next(), lx.next()]);
      entry.stmData = { data: data || new Uint8Array(0), hdr };
    }
    return entry.stmData.hdr;
  }

  async get(v) {
    if (!(v instanceof Ref)) return v;
    if (this.cache.has(v.num)) return this.cache.get(v.num);
    this.cache.set(v.num, null); // loop guard for self-referencing objects
    const e = this.xref.get(v.num);
    let o = null;
    if (!e || e.type === 0) o = null;
    else if (e.type === 1) {
      let r = await this.parseIndirectAt(e.off);
      if (r === undefined && this.base) r = await this.parseIndirectAt(e.off + this.base);
      if (r === undefined) {
        if (!this.repaired) {
          this.cache.delete(v.num);
          await this.reconstruct();
          return this.get(v);
        }
        o = null;
      } else {
        o = r.value;
        if (this.crypt && v.num !== this.encNum) o = await this.decryptStrings(o, r.num, r.gen);
      }
    } else {
      const stmEntry = this.xref.get(e.stm);
      const stm = await this.get(new Ref(e.stm, 0));
      if (stm instanceof Stream && stmEntry) {
        const hdr = await this.objStmHeader(stmEntry, stm);
        const ent = hdr[e.idx] && hdr[e.idx][0] === v.num ? hdr[e.idx] : hdr.find(([n]) => n === v.num);
        o = ent ? new Lexer(stmEntry.stmData.data, (stm.dict.First | 0) + ent[1]).obj() : null;
        if (stmEntry.stmData.data.incomplete) this.incomplete = true;
      }
    }
    this.cache.set(v.num, o);
    return o;
  }

  async decryptStrings(o, num, gen, depth = 0) {
    if (depth > 50) return o;
    if (o instanceof Str) return new Str(latin1(await this.crypt.string(bytesOf(o.s), num, gen)));
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) o[i] = await this.decryptStrings(o[i], num, gen, depth + 1);
      return o;
    }
    if (o instanceof Stream) { await this.decryptStrings(o.dict, num, gen, depth + 1); return o; }
    if (o && typeof o === 'object' && !(o instanceof Name) && !(o instanceof Ref)) {
      for (const k of Object.keys(o)) o[k] = await this.decryptStrings(o[k], num, gen, depth + 1);
    }
    return o;
  }

  /**
   * Decoded stream bytes, or null for image codecs we do not decode. A stream
   * that runs to the end of the file, or whose Flate data is cut short or fails
   * its checksum, comes back with `.incomplete = true` and sets this.incomplete
   * (except an xref stream, whose damage is handled by rebuilding the index,
   * and an object stream, which is flagged when an object is read from it).
   */
  async decode(stm, opts = {}) {
    const data = await this.decodeRaw(stm, opts);
    if (data && (stm.truncated || data.incomplete)) {
      data.incomplete = true;
      if (!opts.xref && !opts.noFlag) this.incomplete = true;
    }
    return data;
  }

  async decodeRaw(stm, { skipCrypt = false } = {}) {
    let data = stm.bytes;
    const d = stm.dict;
    if (this.crypt && !skipCrypt && stm.num >= 0 && d.Type?.n !== 'XRef') {
      data = await this.crypt.stream(data, stm.num, stm.gen);
    }
    let filters = await this.get(d.Filter);
    let parms = await this.get(d.DecodeParms);
    if (!filters) return data;
    if (!Array.isArray(filters)) { filters = [filters]; parms = [parms]; }
    for (let i = 0; i < filters.length; i++) {
      const f = (await this.get(filters[i]))?.n;
      const p = Array.isArray(parms) ? await this.get(parms[i]) : null;
      if (f === 'FlateDecode' || f === 'Fl') {
        const raw = inflate(data, this.budget);
        data = predictor(raw, p);
        if (raw.incomplete) data.incomplete = true;
      }
      else if (f === 'LZWDecode' || f === 'LZW') data = predictor(lzw(data, p?.EarlyChange ?? 1), p);
      else if (f === 'ASCII85Decode' || f === 'A85') data = ascii85(data);
      else if (f === 'ASCIIHexDecode' || f === 'AHx') data = asciiHex(data);
      else if (f === 'RunLengthDecode' || f === 'RL') data = runLength(data);
      else if (f === 'Crypt') continue;
      else return null;
    }
    return data;
  }
}

function indexOf(u8, word, from) {
  const w = [...word].map((c) => c.charCodeAt(0));
  outer: for (let i = from; i <= u8.length - w.length; i++) {
    for (let k = 0; k < w.length; k++) if (u8[i + k] !== w[k]) continue outer;
    return i;
  }
  return -1;
}
