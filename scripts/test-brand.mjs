// Ujian jenama "by sifulaser.com" dalam fail export (docs/shared/brand-core.js).
// Tiada kebergantungan.
//
//     node scripts/test-brand.mjs [folder-fail-muat-turun ...]
//
// Tanpa argumen: fail contoh daripada penulis Plak Box dan SVG/PDF sintetik.
// Dengan folder: setiap .svg / .pdf / .stl di dalamnya juga disemak sebagai
// fail yang SUDAH dijenamakan (dari pelayar, melalui brand.js) - nama
// sifulaser-..., jalur jenama ada, kandungan asal tidak berganjak.
//
// Yang disemak:
//   * SVG   - kandungan asal kekal tepat; viewBox dan tinggi bertambah satu
//             jalur 10 mm; tulisan berada SEPENUHNYA dalam jalur baharu itu
//             (di luar setiap keping) dan dalam lebar kanvas; dua kali = sekali.
//   * PDF   - bait asal kekal tepat (kemas kini tambahan); setiap ofset xref
//             baharu menunjuk ke "N G obj"; /Prev = startxref lama; /Length
//             setiap aliran baharu betul; MediaBox setiap halaman dipanjangkan
//             ke bawah; kandungan dibungkus q ... Q sebelum jenama.
//   * STL   - pengepala membawa jenama, segitiga tidak berubah.
//   * terbenam - docs/shared/deboss.js: prisma atas poligon cembung (segi
//             empat, berbucu bulat, oktagon, dengan titik kolinear) bertapak
//             jenama tertutup, manifold, isipadu = prisma - huruf; huruf
//             dicerminkan (dibaca dari bawah); terlalu kecil -> null.
//   * mudah dicetak - pada setiap saiz huruf: TIADA pulau (stensil: bahagian
//             dalam a, e, o bersambung ke muka luar), lejang >= 1.2 mm,
//             jambatan yang direka berada pada huruf yang betul.
//   * nama  - awalan sifulaser- sekali sahaja.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const imp = (rel) => import(pathToFileURL(path.join(here, '..', rel)).href);
const B = await imp('docs/shared/brand-core.js');

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 80) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
const latin1 = (u8) => Buffer.from(u8).toString('latin1');

// ---- SVG ----------------------------------------------------------------------
function svgBox(text) {
  const tag = /<svg\b[^>]*>/i.exec(text)[0];
  const get = (n) => new RegExp(`\\s${n}="([^"]*)"`).exec(tag)?.[1];
  return { vb: get('viewBox')?.split(/[\s,]+/).map(Number), w: get('width'), h: get('height'), tag };
}

/** Semak SVG berjenama `out` (dan, bila diberi, berbanding asal `orig`). */
function checkBrandedSvg(tag, out, orig = null) {
  check(`${tag}: ada kumpulan jenama`, out.includes('id="sifulaser-brand"'));
  const g = /<g id="sifulaser-brand"[\s\S]*?<\/g>/.exec(out)?.[0] || '';
  check(`${tag}: warna hijau, lapisan sifulaser.com`, g.includes(`stroke="${B.BRAND_COLOR}"`) && g.includes('data-layer="sifulaser.com"'));
  const nums = [...(/ d="([^"]*)"/.exec(g)?.[1] || '').matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  check(`${tag}: tulisan ada titik`, nums.length > 20, `${nums.length}`);
  const box = svgBox(out);
  const [vx, vy, vw, vh] = box.vb;
  // Unit pengguna per mm - peraturan yang sama dengan brand-core: mm, atau
  // px / tanpa unit pada 96 dpi.
  const wNum = parseFloat(box.w);
  const upm = /mm$/.test(box.w || '') ? vw / wNum : /^[\d.]+(px)?$/.test(box.w || '') ? vw / ((wNum * 25.4) / 96) : 1;
  const bandTop = vy + vh - B.BAND_MM * upm;
  check(`${tag}: tulisan dalam jalur baharu, dalam lebar`, nums.every(([x, y]) => y >= bandTop - 1e-6 && y <= vy + vh + 1e-6 && x >= vx - 1e-6 && x <= vx + vw + 1e-6),
    `${JSON.stringify(nums.find(([x, y]) => !(y >= bandTop && y <= vy + vh && x >= vx && x <= vx + vw)))}`);
  if (orig) {
    const ob = svgBox(orig);
    const [, , ow, oh] = ob.vb || [0, 0, (parseFloat(ob.w) * 96) / 25.4, (parseFloat(ob.h) * 96) / 25.4];
    if (ob.vb || ob.w) {
      check(`${tag}: viewBox + jalur`, Math.abs(vw - ow) < 2e-3 && Math.abs(vh - (oh + B.BAND_MM * upm)) < 2e-3, `${box.vb} lawan ${ob.vb}`);
    }
    if (/mm$/.test(ob.h || '')) check(`${tag}: tinggi + 10 mm`, Math.abs(parseFloat(box.h) - (parseFloat(ob.h) + B.BAND_MM)) < 1e-6);
    // Kandungan asal (selepas tag akar, sebelum </svg>) kekal tepat.
    const inner = (t) => t.slice(/<svg\b[^>]*>/i.exec(t).index + /<svg\b[^>]*>/i.exec(t)[0].length, t.lastIndexOf('</svg>'));
    check(`${tag}: kandungan asal tidak berubah`, inner(out).startsWith(inner(orig)));
    check(`${tag}: dua kali = sekali`, B.brandSvg(out) === out);
  }
}

const { sheetToSvg, sheetToPdf } = await imp('docs/plakbox/src/acrylic.js');
const sheet = { w: 600, h: 400, placed: [
  { piece: { label: 'A' }, x: 5, y: 5, w: 256, h: 322, rot: false },
  { piece: { label: 'B' }, x: 265, y: 5, w: 100, h: 322, rot: false }] };
const svgs = {
  plakbox: sheetToSvg(sheet, { labels: true }),
  'tanpa viewBox, mm': '<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="80mm"><path d="M10 10H100V60H10Z" stroke="red"/></svg>',
  'px tanpa unit': '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect x="5" y="5" width="50" height="40"/></svg>',
  'sempit 30 mm': '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><rect x="1" y="1" width="28" height="28"/></svg>',
  'viewBox berganjak': '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="-3 -3 100 50"><rect x="0" y="0" width="94" height="44"/></svg>',
};
for (const [k, v] of Object.entries(svgs)) checkBrandedSvg(`svg ${k}`, B.brandSvg(v), v);
check('svg tanpa saiz: tidak diubah', B.brandSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')
  === '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
check('svg rosak: tidak diubah', B.brandSvg('bukan svg') === 'bukan svg');
{
  const out = B.brandSvg(svgs['sempit 30 mm']);
  const g = /<g id="sifulaser-brand"[\s\S]*?<\/g>/.exec(out)[0];
  const xs = [...g.matchAll(/(-?[\d.]+) -?[\d.]+/g)].map((m) => Number(m[1]));
  check('svg sempit: tulisan dikecilkan, muat 30 mm', Math.max(...xs) <= 30 && Math.max(...xs) - Math.min(...xs) > 10);
}

// ---- PDF ----------------------------------------------------------------------
/** Semak PDF berjenama `out`; `orig` (bila ada) mesti awalan tepatnya. */
function checkBrandedPdf(tag, out, orig = null) {
  const s = latin1(out);
  check(`${tag}: ada jenama`, s.includes('/sifulaser-brand'));
  if (orig) check(`${tag}: bait asal kekal tepat`, Buffer.from(out.subarray(0, orig.length)).equals(Buffer.from(orig)));
  check(`${tag}: berakhir %%EOF`, /startxref\s+\d+\s+%%EOF\s*$/.test(s));
  const sx = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)[1]);
  check(`${tag}: startxref menunjuk ke xref`, s.startsWith('xref', sx));
  // Setiap entri xref (semua seksyen) menunjuk ke "N G obj".
  let bad = 0, n = 0;
  for (const xm of s.matchAll(/xref\n([\s\S]*?)trailer/g)) {
    const lines = xm[1].split('\n').filter(Boolean);
    for (let i = 0; i < lines.length;) {
      const [first, count] = lines[i].split(' ').map(Number);
      for (let k = 0; k < count; k++) {
        const [off, gen, f] = lines[i + 1 + k].trim().split(' ');
        if (f !== 'n') continue;
        n++;
        if (!s.startsWith(`${first + k} ${Number(gen)} obj`, Number(off))) bad++;
      }
      i += 1 + count;
    }
  }
  check(`${tag}: setiap ofset xref betul`, n > 0 && bad === 0, `${bad}/${n}`);
  const trailers = [...s.matchAll(/trailer\s*<<([\s\S]*?)>>/g)];
  if (trailers.length > 1) {
    const prev = Number(/\/Prev\s+(\d+)/.exec(trailers[trailers.length - 1][1])?.[1]);
    check(`${tag}: /Prev = xref lama`, s.startsWith('xref', prev));
  }
  // /Length aliran.
  let lenBad = 0;
  for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    if (s.slice(start + Number(m[1]), start + Number(m[1]) + 10) !== '\nendstream') lenBad++;
  }
  check(`${tag}: /Length setiap aliran betul`, lenBad === 0, `${lenBad}`);
}

const pdfs = {
  'plakbox satu halaman': Buffer.from(sheetToPdf(sheet, { labels: true }), 'latin1'),
};
// Dua halaman, ditulis dengan tangan.
{
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 283.465 141.732] /Contents 4 0 R /Resources << >> >>',
    `<< /Length ${'10 10 100 50 re S Q q'.length} >>\nstream\n10 10 100 50 re S Q q\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 141.732 70.866] /Contents [6 0 R] /Resources << >> >>',
    `<< /Length ${'5 5 50 20 re S'.length} >>\nstream\n5 5 50 20 re S\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  pdfs['dua halaman'] = Buffer.from(out, 'latin1');
}
for (const [k, v] of Object.entries(pdfs)) {
  const o = new Uint8Array(v);
  const out = B.brandPdf(o);
  checkBrandedPdf(`pdf ${k}`, out, o);
  const s = latin1(out);
  const pages = [...latin1(o).matchAll(/\/MediaBox \[([-\d. ]+)\]/g)].map((m) => m[1].split(' ').map(Number));
  const after = [...s.slice(o.length).matchAll(/\/MediaBox \[([-\d. ]+)\]/g)].map((m) => m[1].split(' ').map(Number));
  check(`pdf ${k}: setiap halaman dipanjangkan ke bawah 10 mm`, after.length === pages.length
    && after.every((b, i) => Math.abs(b[1] - (pages[i][1] - (B.BAND_MM * 72) / 25.4)) < 0.01 && b[3] === pages[i][3] && b[2] === pages[i][2]));
  check(`pdf ${k}: kandungan q ... Q, kemudian jenama`, [...s.slice(o.length).matchAll(/\/Contents \[(\d+) 0 R [\s\S]*? (\d+) 0 R\]/g)].length === pages.length
    && /stream\nq\nendstream/.test(s.slice(o.length)) && /stream\nQ\n% \/sifulaser-brand/.test(s.slice(o.length)));
  check(`pdf ${k}: dua kali = sekali`, Buffer.from(B.brandPdf(out)).equals(Buffer.from(out)));
}
{
  const objStm = new Uint8Array(Buffer.from('%PDF-1.5\n1 0 obj\n<< /Type /ObjStm >>\nendobj\nstartxref\n9\n%%EOF\n', 'latin1'));
  check('pdf aliran objek: tidak diubah', B.brandPdf(objStm) === objStm || Buffer.from(B.brandPdf(objStm)).equals(Buffer.from(objStm)));
  const junk = new Uint8Array([1, 2, 3]);
  check('pdf rosak: tidak diubah', Buffer.from(B.brandPdf(junk)).equals(Buffer.from(junk)));
}

// ---- STL ----------------------------------------------------------------------
{
  const { trianglesToStl, buildPlakBox, DEFAULTS } = await imp('docs/plakbox/src/geom/base.js');
  const m = buildPlakBox({ ...DEFAULTS });
  const stl = new Uint8Array(trianglesToStl(m.bodies[0].mesh, 'SifuLaser Plak Box tapak'));
  const out = B.brandStl(stl);
  check('stl binari: pengepala bermula dengan jenama', latin1(out.subarray(0, 80)).startsWith(B.BRAND_TEXT));
  check('stl binari: segitiga tidak berubah', Buffer.from(out.subarray(80)).equals(Buffer.from(stl.subarray(80))));
  check('stl binari: dua kali = sekali', Buffer.from(B.brandStl(out)).equals(Buffer.from(out)));
  const asc = new Uint8Array(Buffer.from('solid topper\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid topper\n'));
  const ao = latin1(B.brandStl(asc));
  check('stl ascii: nama solid berjenama', ao.startsWith('solid sifulaser.com topper') && ao.includes('vertex 1 0 0'));
}

// ---- jenama terbenam (STL) --------------------------------------------------------
{
  const D = await imp('docs/shared/deboss.js');
  const area = (pts) => pts.reduce((a, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return a + x * v - u * y; }, 0) / 2;
  const prism = (outer, plan, H = 5) => {
    const t = [];
    const push = (a, b, c) => t.push(a, b, c);
    if (!D.debossFace(outer, plan, push)) return null;
    const O = area(outer) < 0 ? outer.slice().reverse() : outer;
    // Atas: kipas dari pusat (titik kolinear pada tepi tidak merosot).
    const c = [O.reduce((s, q) => s + q[0], 0) / O.length, O.reduce((s, q) => s + q[1], 0) / O.length, H];
    for (let i = 0; i < O.length; i++) push(c, [...O[i], H], [...O[(i + 1) % O.length], H]);
    for (let i = 0; i < O.length; i++) {
      const a = O[i], b = O[(i + 1) % O.length];
      push([...a, 0], [...b, 0], [...b, H]); push([...a, 0], [...b, H], [...a, H]);
    }
    return t;
  };
  const report = (t) => {
    const k = (q) => q.map((v) => v.toFixed(6)).join(',');
    const edges = new Map();
    let vol = 0, degenerate = 0;
    for (let i = 0; i < t.length; i += 3) {
      const [a, b, c] = [t[i], t[i + 1], t[i + 2]];
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      const cr = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      if (Math.hypot(...cr) < 1e-9) degenerate++;
      for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.set(`${k(p)}|${k(q)}`, (edges.get(`${k(p)}|${k(q)}`) || 0) + 1);
    }
    let bad = 0;
    for (const [e, n] of edges) { const [p, q] = e.split('|'); if (n !== 1 || edges.get(`${q}|${p}`) !== 1) bad++; }
    return { vol, bad, degenerate };
  };
  const rr = (x0, y0, x1, y1, r, seg = 8) => {
    const pts = [];
    for (const [cx, cy, a0] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]]) {
      for (let s = 0; s <= seg; s++) {
        const a = ((a0 + (90 * s) / seg) * Math.PI) / 180;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    }
    return pts;
  };
  const shapes = {
    'segi empat': [[0, 0], [120, 0], [120, 50], [0, 50]],
    'segi empat ikut jam': [[0, 0], [0, 50], [120, 50], [120, 0]],
    'titik kolinear': [[0, 0], [30, 0], [70, 0], [120, 0], [120, 20], [120, 50], [60, 50], [0, 50], [0, 25]],
    'berbucu bulat': rr(0, 0, 150, 60, 12),
    oktagon: Array.from({ length: 8 }, (_, i) => [80 + 80 * Math.cos((i * Math.PI) / 4 + Math.PI / 8), 80 + 80 * Math.sin((i * Math.PI) / 4 + Math.PI / 8)]),
    tinggi: [[0, 0], [30, 0], [30, 140], [0, 140]],
  };
  for (const [name, outer] of Object.entries(shapes)) {
    const xs = outer.map((q) => q[0]), ys = outer.map((q) => q[1]);
    const ins = name === 'oktagon' ? 25 : name === 'berbucu bulat' ? 13 : 2;
    const plan = D.debossPlan({ x0: Math.min(...xs) + ins, y0: Math.min(...ys) + ins, x1: Math.max(...xs) - ins, y1: Math.max(...ys) - ins });
    check(`terbenam ${name}: ada rancangan`, !!plan);
    if (!plan) continue;
    const t = prism(outer, plan);
    check(`terbenam ${name}: muka dibina`, !!t);
    if (!t) continue;
    const r = report(t);
    check(`terbenam ${name}: manifold`, r.bad === 0, `${r.bad}`);
    check(`terbenam ${name}: tiada segitiga merosot`, r.degenerate === 0, `${r.degenerate}`);
    const want = Math.abs(area(outer)) * 5 - plan.volume;
    check(`terbenam ${name}: isipadu = prisma - huruf`, Math.abs(r.vol - want) < 1e-6 * want, `${r.vol} vs ${want}`);
    check(`terbenam ${name}: huruf ada`, plan.area > 20 && plan.cap >= D.DEBOSS.capMin);
    check(`terbenam ${name}: arah`, plan.vertical === (name === 'tinggi'));
    // Dicerminkan: 's' (huruf pertama) di hujung +x (melintang) / -y (menegak).
    const mid = (s) => (plan.vertical ? (s[1] + s[3]) / 2 : (s[0] + s[2]) / 2);
    const first = mid(plan.segs[0]), last = mid(plan.segs[plan.segs.length - 1]);
    check(`terbenam ${name}: dicerminkan`, plan.vertical ? first < last : first > last);
  }
  check('terbenam: terlalu kecil -> null', D.debossPlan({ x0: 0, y0: 0, x1: 20, y1: 8 }) === null);
  check('terbenam: had huruf 9 mm', D.debossPlan({ x0: 0, y0: 0, x1: 500, y1: 300 }).cap === D.DEBOSS.capMax);
  // Tulisan 7 mm perlu tampalan 75.9 x 14.2 mm (mana-mana arah).
  check('terbenam: di bawah 7 mm tiada tulisan', D.debossPlan({ x0: 0, y0: 0, x1: 75, y1: 70 }) === null
    && D.debossPlan({ x0: 0, y0: 0, x1: 300, y1: 13.5 }) === null && D.debossPlan({ x0: 0, y0: 0, x1: 13.5, y1: 300 }) === null
    && D.debossPlan({ x0: 0, y0: 0, x1: 76, y1: 14.5 }) !== null);
  // Mudah dicetak: setiap saiz dari capMin ke capMax, kedua-dua arah.
  for (let cap = D.DEBOSS.capMin; cap <= D.DEBOSS.capMax + 1e-9; cap += 0.25) {
    for (const vertical of [false, true]) {
      const box = vertical ? { x0: 0, y0: 0, x1: 60, y1: 300 } : { x0: 0, y0: 0, x1: 300, y1: 60 };
      const p = D.debossPlan(box, { capMax: cap });
      const tag = `terbenam ${cap.toFixed(2)} mm${vertical ? ' menegak' : ''}`;
      check(`${tag}: ada`, !!p && Math.abs(p.cap - cap) < 1e-9 && p.vertical === vertical);
      if (!p) continue;
      const { comps } = D.flatComponents(p);
      check(`${tag}: tiada pulau pada lapisan pertama`, comps.length === 1, `${comps.length - 1} pulau`);
      check(`${tag}: lejang >= 1.2 mm`, p.stroke >= 1.2 - 1e-9, `${p.stroke}`);
      // 4 jambatan yang direka (o x2, e, a) dan tiada jambatan sandaran.
      check(`${tag}: jambatan = 4 yang direka`, p.bridges === 4, `${p.bridges}`);
      // Setiap lekuk masih wujud: kawasan huruf tidak hilang ditelan jambatan.
      check(`${tag}: huruf masih ada`, p.area > 20 * cap, `${p.area}`);
    }
  }
  // Teks tanpa jambatan yang direka: pulau disambung oleh stencil() sandaran.
  {
    const p = D.debossPlan({ x0: 0, y0: 0, x1: 300, y1: 60 }, { text: 'BOOK 0898' });
    const { comps } = D.flatComponents(p);
    check('terbenam teks lain: pulau disambung sandaran', comps.length === 1 && p.bridges >= 4, `${comps.length - 1} pulau, ${p.bridges} jambatan`);
  }
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  check('terbenam: tampalan melebihi muka -> false', D.debossFace(sq, D.debossPlan({ x0: 0, y0: 0, x1: 120, y1: 40 }), () => {}) === false);
}

// ---- nama dan brandFile -----------------------------------------------------------
check('nama: awalan', B.brandName('box-200x120.svg') === 'sifulaser-box-200x120.svg');
check('nama: sekali sahaja', B.brandName('sifulaser-box.svg') === 'sifulaser-box.svg');
{
  const f = B.brandFile('dulang.svg', 'image/svg+xml', svgs.plakbox);
  check('brandFile svg', f.kind === 'svg' && f.name === 'sifulaser-dulang.svg' && new TextDecoder().decode(f.data).includes('sifulaser-brand'));
  const p = B.brandFile('kotak.pdf', 'application/pdf', pdfs['plakbox satu halaman']);
  check('brandFile pdf', p.kind === 'pdf' && latin1(p.data).includes('/sifulaser-brand'));
  const g = B.brandFile('gambar.png', 'image/png', new Uint8Array([137, 80, 78, 71]));
  check('brandFile lain: nama sahaja, isi sama', g.kind === 'other' && g.name === 'sifulaser-gambar.png' && g.data.length === 4);
}

// ---- fail sebenar dari pelayar (pilihan) ------------------------------------------
for (const dir of process.argv.slice(2)) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const ext = path.extname(f).toLowerCase();
    if (!['.svg', '.pdf', '.stl'].includes(ext)) continue;
    check(`muat turun ${f}: nama sifulaser-`, f.startsWith('sifulaser-'));
    const buf = new Uint8Array(fs.readFileSync(full));
    if (ext === '.svg') checkBrandedSvg(`muat turun ${f}`, buf.toString ? Buffer.from(buf).toString('utf8') : '');
    if (ext === '.pdf') checkBrandedPdf(`muat turun ${f}`, buf);
    if (ext === '.stl') check(`muat turun ${f}: STL berjenama`, latin1(buf.subarray(0, 80)).includes('sifulaser.com'));
  }
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
