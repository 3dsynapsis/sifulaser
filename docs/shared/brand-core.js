// "by sifulaser.com" dalam setiap fail yang dimuat turun dari alat - pemasaran
// jangka panjang: fail itu dikongsi, dibuka oleh tukang potong lain, dan
// namanya ikut sekali.
//
// Keputusan bos (21 Oktober 2026):
//   * Dalam FAIL sahaja, dalam lapisan sendiri yang tidak dipotong. TIDAK
//     diukir pada produk - pelanggan kadang-kadang marah.
//   * STL: "sifulaser.com" terbenam sedikit di bawah tapak (Plak Box, dalam
//     geometrinya sendiri - lihat docs/plakbox/src/geom/base.js).
//
// Jadi tulisan itu diletak dalam JALUR BAHARU di bawah semua yang ada dalam
// fail - kanvas dipanjangkan, tiada apa-apa dialih. Ia tidak pernah bertindih
// dengan mana-mana keping: kalau pekerja terlupa mematikan lapisannya, ia
// terukir pada sisa helaian di luar keping, bukan pada produk. Warna hijau
// (#00a651), lejang satu garisan Hershey - bukan <text>, yang bergantung pada
// fon mesin dan digugurkan sesetengah perisian laser.
//
// Tulen: tiada DOM. brand.js memasangnya pada muat turun; diuji oleh
// scripts/test-brand.mjs.

import { SANS } from './hershey-sans.js';

export const BRAND_TEXT = 'by sifulaser.com';
export const BRAND_COLOR = '#00a651';
export const BAND_MM = 10;          // tinggi jalur baharu di bawah kandungan
const CAP_MM = 4.5;                 // tinggi huruf
const LEFT_MM = 4;                  // dari tepi kiri

const r3 = (v) => Math.round(v * 1000) / 1000;
const fmt = (v) => {
  const r = r3(v);
  return Object.is(r, -0) ? '0' : String(r);
};

/** Nama fail dengan awalan sifulaser- (sekali sahaja). */
export function brandName(name) {
  const n = String(name || 'fail');
  return /^sifulaser[-_.]/i.test(n) ? n : `sifulaser-${n}`;
}

/**
 * Tulisan sebagai poligaris, x dari `x0`, garis dasar pada `base`, tinggi
 * huruf `cap`. `down` true bila paksi y menghala ke bawah (SVG): huruf
 * diterbalikkan supaya terbaca tegak.
 */
export function textPolylines(text, x0, base, cap, { down = false } = {}) {
  const k = cap / (SANS.cap || 21);
  const out = [];
  let x = x0;
  for (const ch of String(text)) {
    const g = SANS.glyphs[ch.codePointAt(0)] || SANS.glyphs[63];
    if (!g) continue;
    for (const st of g.s) {
      const p = [];
      for (let i = 0; i < st.length; i += 2) p.push([x + st[i] * k, down ? base - st[i + 1] * k : base + st[i + 1] * k]);
      out.push(p);
    }
    x += g.w * k;
  }
  return out;
}

/**
 * Tinggi huruf dan jarak kiri (mm) untuk lebar kanvas `wMm`: 4.5 mm bila muat,
 * lebih kecil bila kanvas sempit (QR, kekunci), tidak kurang 1.2 mm.
 */
export function fitText(wMm) {
  const left = Math.min(LEFT_MM, Math.max(0.5, wMm * 0.04));
  const per = textWidth(BRAND_TEXT, 1);
  const cap = Math.max(1.2, Math.min(CAP_MM, (wMm - 2 * left) / per));
  return { cap, left };
}

export const textWidth = (text, cap) => {
  const k = cap / (SANS.cap || 21);
  let w = 0;
  for (const ch of String(text)) w += (SANS.glyphs[ch.codePointAt(0)] || SANS.glyphs[63] || { w: 0 }).w * k;
  return w;
};

// ---- SVG ----------------------------------------------------------------------

const MM_PER = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

function lengthMm(v) {
  const m = /^\s*([0-9.]+)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(String(v ?? ''));
  if (!m) return null;
  return Number(m[1]) * MM_PER[(m[2] || '').toLowerCase()];
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[2] ?? m[3]) : null;
};
const setAttr = (tag, name, value) => {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*')`, 'i');
  return re.test(tag) ? tag.replace(re, `$1"${value}"`) : tag.replace(/^<svg\b/i, `<svg ${name}="${value}"`);
};

/**
 * SVG -> SVG dengan jalur jenama di bawah. Pulangkan teks asal tanpa ubah
 * bila ia tidak boleh difahami dengan selamat (tiada saiz), atau sudah ada.
 */
export function brandSvg(svg) {
  const text = String(svg);
  if (text.includes('id="sifulaser-brand"')) return text;
  const m = /<svg\b[^>]*>/i.exec(text);
  const close = text.lastIndexOf('</svg>');
  if (!m || close < 0) return text;
  let tag = m[0];
  const wMm = lengthMm(attr(tag, 'width'));
  const hMm = lengthMm(attr(tag, 'height'));
  let vb = (attr(tag, 'viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) vb = null;
  if (!vb && !(wMm && hMm)) return text;
  if (!vb) {
    // Tiada viewBox: unit pengguna ialah px. viewBox setara mengekalkan
    // pemetaan kandungan tepat seperti sebelumnya.
    vb = [0, 0, (wMm * 96) / 25.4, (hMm * 96) / 25.4];
  }
  // Unit pengguna per mm. Tanpa saiz fizikal, anggap unit ialah mm.
  const upm = wMm ? vb[2] / wMm : 1;
  const band = BAND_MM * upm;
  const newVb = [vb[0], vb[1], vb[2], vb[3] + band];
  tag = setAttr(tag, 'viewBox', newVb.map(fmt).join(' '));
  if (hMm) {
    // Tinggi dalam unit asalnya kalau px / tanpa unit, selainnya dalam mm.
    const unit = (/([a-z]+)\s*$/i.exec(attr(tag, 'height') || '')?.[1] || '').toLowerCase();
    const hNew = hMm + BAND_MM;
    tag = setAttr(tag, 'height', unit === '' || unit === 'px' ? `${fmt((hNew * 96) / 25.4)}${unit}` : `${fmt(hNew)}mm`);
  }
  const fit = fitText(vb[2] / upm);
  const cap = fit.cap * upm;
  const base = vb[1] + vb[3] + band * 0.5 + cap / 2;
  const d = textPolylines(BRAND_TEXT, vb[0] + fit.left * upm, base, cap, { down: true })
    .filter((p) => p.length > 1)
    .map((p) => `M${p.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}`).join('');
  const group = `<g id="sifulaser-brand" data-layer="sifulaser.com" fill="none" stroke="${BRAND_COLOR}" `
    + `stroke-width="${fmt(0.25 * upm)}" stroke-linecap="round" stroke-linejoin="round">`
    + `<title>${BRAND_TEXT} - nota sahaja, jangan potong lapisan ini</title><path d="${d}"/></g>`;
  const head = text.slice(0, m.index) + tag + text.slice(m.index + m[0].length, close);
  return `${head}${group}\n${text.slice(close)}`;
}

// ---- PDF ----------------------------------------------------------------------
// Kemas kini tambahan (incremental update): bait asal tidak disentuh langsung.
// Di hujung fail ditambah - aliran "q" yang dipasang SEBELUM kandungan asal,
// aliran "Q + jenama" SELEPASNYA (keadaan grafik asal, misalnya matriks mm,
// tidak bocor ke jenama), versi baharu setiap objek /Page dengan MediaBox
// dipanjangkan ke bawah, dan jadual xref + trailer dengan /Prev. Untuk PDF
// ringkas yang alat-alat ini tulis (1.4, xref jadual, tanpa aliran objek);
// selainnya fail dikembalikan tanpa ubah.

const PT_PER_MM = 72 / 25.4;
const latin1 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return s;
};
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

export function brandPdf(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const s = latin1(bytes);
  if (!s.startsWith('%PDF-') || s.includes('/sifulaser-brand')) return bytes;
  if (/\/Type\s*\/(ObjStm|XRef)\b/.test(s)) return bytes;
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s);
  const tr = s.lastIndexOf('trailer');
  if (!sx || tr < 0) return bytes;
  const trailer = s.slice(tr, sx.index);
  const size = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1]);
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1];
  const info = /\/Info\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1];
  if (!size || !root) return bytes;
  // Objek /Page (bukan /Pages): nombor, generasi, kamus.
  const pages = [];
  const re = /(\d+)\s+(\d+)\s+obj\s*([\s\S]*?)endobj/g;
  let mm;
  while ((mm = re.exec(s))) {
    const body = mm[3];
    if (!/\/Type\s*\/Page(?!s)\b/.test(body)) continue;
    const mb = /\/MediaBox\s*\[\s*([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s*\]/.exec(body);
    const cont = /\/Contents\s+(\d+\s+\d+\s+R|\[[^\]]*\])/.exec(body);
    if (!mb || !cont) return bytes;
    pages.push({ num: Number(mm[1]), gen: Number(mm[2]), body, mb: mb.slice(1, 5).map(Number), mbText: mb[0], cont });
  }
  if (!pages.length) return bytes;
  const band = BAND_MM * PT_PER_MM;
  const out = [];
  let off = bytes.length;
  const xref = [];
  const add = (num, gen, body) => {
    const chunk = `${num} ${gen} obj\n${body}\nendobj\n`;
    xref.push({ num, gen, off });
    out.push(chunk);
    off += chunk.length;
  };
  const stream = (content) => `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  let next = size;
  // Aliran "q" dikongsi semua halaman.
  const qNum = next++;
  if (!s.endsWith('\n')) { out.push('\n'); off += 1; }
  add(qNum, 0, stream('q'));
  for (const pg of pages) {
    const [x0, y0, x1, y1] = pg.mb;
    const yb = y0 - band;
    const fit = fitText((x1 - x0) / PT_PER_MM);
    const cap = fit.cap * PT_PER_MM;
    const base = yb + band * 0.5 - cap / 2;
    const ops = ['Q', '% /sifulaser-brand', `0 0.651 0.318 RG ${fmt(0.25 * PT_PER_MM)} w 1 J 1 j`];
    for (const p of textPolylines(BRAND_TEXT, x0 + fit.left * PT_PER_MM, base, cap)) {
      if (p.length < 2) continue;
      ops.push(`${p.map(([x, y], i) => `${fmt(x)} ${fmt(y)} ${i ? 'l' : 'm'}`).join(' ')} S`);
    }
    const bNum = next++;
    add(bNum, 0, stream(ops.join('\n')));
    const oldRefs = pg.cont[1].startsWith('[') ? pg.cont[1].slice(1, -1).trim() : pg.cont[1];
    const body = pg.body
      .replace(pg.mbText, `/MediaBox [${fmt(x0)} ${fmt(yb)} ${fmt(x1)} ${fmt(y1)}]`)
      .replace(pg.cont[0], `/Contents [${qNum} 0 R ${oldRefs} ${bNum} 0 R]`)
      .trim();
    add(pg.num, pg.gen, body);
  }
  // Jadual xref tambahan: satu subseksyen bagi setiap objek.
  let xt = 'xref\n';
  for (const e of xref.sort((a, b) => a.num - b.num)) {
    xt += `${e.num} 1\n${String(e.off).padStart(10, '0')} ${String(e.gen).padStart(5, '0')} n \n`;
  }
  const xrefOff = off;
  xt += `trailer\n<< /Size ${next} /Root ${root}${info ? ` /Info ${info}` : ''} /Prev ${sx[1]} >>\n`
    + `startxref\n${xrefOff}\n%%EOF\n`;
  out.push(xt);
  const tail = ascii(out.join(''));
  const res = new Uint8Array(bytes.length + tail.length);
  res.set(bytes, 0);
  res.set(tail, bytes.length);
  return res;
}

// ---- STL ----------------------------------------------------------------------
// Pengepala 80 bait STL binari, atau nama `solid` STL ASCII. Tulisan terbenam di
// bawah tapak dibuat oleh alat yang memiliki geometrinya (Plak Box); di sini
// hanya nama di dalam fail.

export function brandStl(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const headStr = latin1(bytes.subarray(0, Math.min(bytes.length, 256)));
  if (/^solid\b/.test(headStr) && /facet\s+normal/.test(latin1(bytes.subarray(0, Math.min(bytes.length, 2048))))) {
    // ASCII: "solid <nama>" -> "solid sifulaser.com <nama>"
    const s = latin1(bytes);
    if (s.startsWith('solid sifulaser.com')) return bytes;
    return ascii(s.replace(/^solid[ \t]*/, 'solid sifulaser.com '));
  }
  if (bytes.length < 84) return bytes;
  const out = bytes.slice();
  const old = latin1(bytes.subarray(0, 80)).replace(/\0+$/, '').trim();
  if (old.startsWith(BRAND_TEXT)) return bytes;
  const head = `${BRAND_TEXT} ${old}`.slice(0, 80).padEnd(80, ' ');
  for (let i = 0; i < 80; i++) out[i] = head.charCodeAt(i) & 0x7f;
  return out;
}

/**
 * Satu fail -> fail berjenama. `kind` dari sambungan nama atau jenis MIME.
 * Pulangkan { data, name, kind } - `data` Uint8Array atau rentetan.
 */
export function brandFile(name, type, data) {
  const ext = /\.([a-z0-9]+)$/i.exec(String(name || ''))?.[1]?.toLowerCase() || '';
  const t = String(type || '').toLowerCase();
  const kind = ext === 'svg' || t.includes('svg') ? 'svg'
    : ext === 'pdf' || t === 'application/pdf' ? 'pdf'
      : ext === 'stl' || t.includes('stl') ? 'stl' : 'other';
  const bytes = typeof data === 'string' ? ascii(data) : (data instanceof Uint8Array ? data : new Uint8Array(data));
  let out = bytes;
  if (kind === 'svg') out = new TextEncoder().encode(brandSvg(new TextDecoder().decode(bytes)));
  else if (kind === 'pdf') out = brandPdf(bytes);
  else if (kind === 'stl') out = brandStl(bytes);
  return { data: out, name: brandName(name), kind };
}
