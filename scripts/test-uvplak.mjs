// Ujian tab UV Plak (Bos, 28 Nov 2026) pada kod yang sifulaser.com hidangkan.
//
//     node scripts/test-uvplak.mjs
//
//   * saiz - file A4 jadi plak A4 297 x 210; A3 420 x 297; taip lebar, tinggi ikut nisbah.
//   * border 10 mm, 4 keping sudut 45: dua panjang sama, dua pendek sama, tepi luar
//     tepat saiz plak, susunan dalam file cut tak bertindih.
//   * base acrylic hitam 5mm satu keping, alur tembus 3.4 mm, kaki plak 4 mm (1 mm pendek dari
//     tebal base, tak tercucuk keluar di bawah).
//   * white ink di bawah ink design sahaja: stensil 1 bit, putih design jadi tanpa ink.
//   * print: berhenti 2 mm bawah border (gam lekat pada kayu), atau lebih 2 mm tanpa border.
//   * huruf timbul: tulisan disurih dengan lubang huruf, garisan lukisan tak dikira.
//   * file cut: satu file, satu page, bahagian setiap material berlabel; lubang huruf dulu,
//     frame last; PDF sah.
//   * simpan: rekod akaun kembali sama, nilai rosak jatuh ke default.

import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const imp = (p) => import(pathToFileURL(join(root, p)).href);

const P = await imp('puzzle/src/geom/plak.js');
const L = await imp('puzzle/src/geom/letters.js');
const { buildPlakSheet, sheetToPdf } = await imp('puzzle/src/exportJobSheet.js');
const Saved = await imp('puzzle/src/plakSaved.js');
const { PDFDocument, PDFName, PDFRawStream } = await imp('puzzle/vendor/pdf-lib.esm.min.js');
const { openForPrint, buildLayeredPrint } = await imp('puzzle/src/posterPdf.js');
const { parsePath } = await imp('puzzle/src/exportPdf.js');

let pass = 0;
let fail = 0;
const check = (name, ok, got = '') => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  GAGAL ${name} ${got}`); }
};
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// ---- saiz ----------------------------------------------------------------------------
console.log('saiz plak');
{
  const a4 = P.plakSize(297, 210.2, 'A4');
  check('A4 landscape 297 x 210', a4.width === 297 && a4.height === 210, `${a4.width}x${a4.height}`);
  const a3 = P.plakSize(297, 210.2, 'A3');
  check('A3 landscape 420 x 297 (210.2 dikira A4)', a3.width === 420 && a3.height === 297, `${a3.width}x${a3.height}`);
  const wide = P.plakSize(300, 150, 'A4');
  check('nisbah lain kekal: 297 x 148.5', wide.width === 297 && wide.height === 148.5, `${wide.width}x${wide.height}`);
  const tall = P.plakSize(210, 297, 'A4');
  check('A4 portrait 210 x 297', tall.width === 210 && tall.height === 297, `${tall.width}x${tall.height}`);
  const file = P.plakSize(250, 180, 'file');
  check('ikut file: saiz page', file.width === 250 && file.height === 180);
  const typed = P.plakSize(297, 210, 'custom', 400);
  check('taip lebar 400, tinggi ikut nisbah', typed.width === 400 && near(typed.height, 282.8, 0.06), `${typed.width}x${typed.height}`);
  check('taip terlalu besar dihadkan ke bed', P.cleanCustom(5000) === P.CUSTOM_MAX_MM);
  check('taip terlalu kecil dihadkan', P.cleanCustom(5) === P.PLAK_MIN_MM);
  check('taip bukan nombor: null', P.cleanCustom('abc') === null);
  check('custom tanpa nilai jatuh ke saiz file', P.plakSize(250, 180, 'custom', null).width === 250);
}

// ---- pelan ---------------------------------------------------------------------------
console.log('pelan plak A4, border, base');
const plan = P.planPlak({ pageW: 297, pageH: 210.2, size: 'A4', border: true, base: true });
{
  check('muka plak 297 x 210', plan.width === 297 && plan.height === 210);
  check('kaki 4 mm, 1 mm pendek dari base 5 mm', plan.tongue === 4 && plan.base.height - plan.tongue === 1, plan.tongue);
  check('plat dipotong 297 x 214', plan.plate.width === 297 && plan.plate.height === 214);
  check('page print = plat + frame 10 mm', plan.page.width === 317 && plan.page.height === 234, `${plan.page.width}x${plan.page.height}`);
  check('design di (10, 10)', plan.design.x === 10 && plan.design.y === 10 && plan.design.width === 297);
  check('print berhenti 2 mm bawah border', plan.printBox.x === 18 && plan.printBox.y === 18
    && plan.printBox.width === 281 && plan.printBox.height === 194, JSON.stringify(plan.printBox));
  check('muat bed UV', plan.fitsBed);
  check('skala design = 1 (A4 ke A4)', near(plan.scale, 1, 0.001) && near(plan.scaleY, 210 / 210.2, 1e-6));
  const bare = P.planPlak({ pageW: 297, pageH: 210, size: 'A4', border: false, base: false });
  check('tanpa border: print lebih 2 mm keliling', bare.printBox.x === 8 && bare.printBox.width === 301 && bare.printBox.height === 214);
  check('tanpa base: tiada kaki', bare.tongue === 0 && bare.plate.height === 210 && bare.base === null
    && bare.tenons.length === 0 && bare.plate.outline.length === 4);
  check('tanpa border: tiada jalur', bare.strips.length === 0);
  const big = P.planPlak({ pageW: 297, pageH: 210, size: 'custom', custom: 880, border: true, base: true });
  check('terlalu besar untuk bed: ditanda', !big.fitsBed);
  const small = P.planPlak({ pageW: 297, pageH: 210, size: 'custom', custom: 60, border: true, base: true });
  check('terlalu kecil: ditanda', small.tooSmall);
}

// ---- border --------------------------------------------------------------------------
console.log('border 4 keping sudut 45');
{
  const strips = P.borderStrips(297, 210, 10);
  check('4 jalur', strips.length === 4);
  const top = strips.find((s) => s.id === 'top').points;
  check('jalur atas: tepi luar 297, dalam 277', near(dist(top[0], top[1]), 297) && near(dist(top[2], top[3]), 277));
  const left = strips.find((s) => s.id === 'left').points;
  check('jalur kiri: tepi luar 210, dalam 190', near(dist(left[0], left[3]), 210) && near(dist(left[1], left[2]), 190));
  // The mitre: the top strip's end and the left strip's end are the same diagonal.
  const topEnd = [top[0], top[3]];
  const leftEnd = [left[0], left[1]];
  check('sudut 45: hujung jalur atas dan kiri sama garis', near(topEnd[1][0], leftEnd[1][0]) && near(topEnd[1][1], leftEnd[1][1])
    && near(Math.abs(topEnd[1][0] - topEnd[0][0]), Math.abs(topEnd[1][1] - topEnd[0][1])));
  // Each strip as cut matches its place on the plate: same edge lengths.
  const lay = P.stripLayout(297, 210, 10, 3);
  const lens = (pts) => pts.map((p, i) => dist(p, pts[(i + 1) % pts.length])).sort((a, b) => a - b).map((v) => Math.round(v * 100) / 100);
  for (const piece of lay.pieces) {
    const onPlate = strips.find((s) => s.id === piece.id).points;
    check(`jalur ${piece.id}: bentuk dipotong = bentuk atas plak`, JSON.stringify(lens(piece.points)) === JSON.stringify(lens(onPlate)));
  }
  const ys = lay.pieces.map((p) => [Math.min(...p.points.map((q) => q[1])), Math.max(...p.points.map((q) => q[1]))]);
  check('jalur dalam file cut tak bertindih, jarak 3 mm', ys.every((r, i) => i === 0 || near(r[0] - ys[i - 1][1], 3)));
  check('blok jalur 297 x 49 mm (jimat)', lay.width === 297 && lay.height === 49, `${lay.width}x${lay.height}`);
  check('dua panjang sama, dua pendek sama', lay.pieces.filter((p) => p.long === 297).length === 2 && lay.pieces.filter((p) => p.long === 210).length === 2);
}

// ---- base ----------------------------------------------------------------------------
console.log('base acrylic hitam 5mm');
{
  const b = plan.base;
  check('panjang = plak + 15 mm kiri kanan', b.length === 327, b.length);
  check('dalam ikut tinggi plak (5 mm langkah, 50-120)', b.depth === 65, b.depth);
  // The feet: Stand Nama's rule. 297 wide: 14 mm in from each end, two feet each 36% of
  // the 269 mm between, so 96.84 mm long with a 75.32 mm bridge between their slots.
  check('2 kaki, 14 mm dari hujung, 96.84 mm', JSON.stringify(plan.tenons) === '[[14,110.84],[186.16,283]]', JSON.stringify(plan.tenons));
  check('plak kecil: satu kaki panjang', P.tenonSpans(120).length === 1 && P.tenonSpans(120)[0][0] === 14);
  check('plak sangat kecil: satu kaki 12 mm di tengah', JSON.stringify(P.tenonSpans(30)) === '[[9,21]]', JSON.stringify(P.tenonSpans(30)));
  check('satu alur setiap kaki', b.slots.length === 2);
  check('alur saiz kaki: 96.84 x 3 mm', b.slots.every((sl) => sl.length === 96.84 && sl.width === 3));
  check('alur di bawah kaki (base lebih 15 mm)', b.slots[0].x === 29 && near(b.slots[1].x, 15 + 186.16));
  check('alur di tengah dalam base', near(b.slots[0].y * 2 + 3, b.depth));
  check('jambatan antara alur', b.slots[1].x - (b.slots[0].x + b.slots[0].length) > 70);
  const out = plan.plate.outline;
  check('bentuk plak: segi empat + 2 kaki (12 titik)', out.length === 12, out.length);
  check('kaki turun 4 mm bawah muka', out.filter(([, y]) => y === 214).length === 4 && out.filter(([, y]) => y === 210).length === 6);
  check('satu keping 5 mm, alur tembus', b.pieces.length === 1 && b.pieces[0].slot && b.slotDepth === 5 && b.height === 5);
  check('plak tinggi: base paling dalam 120', P.planBase(420, 600).depth === 120);
  check('plak rendah: base paling cetek 50', P.planBase(200, 80).depth === 50);
  const st = P.standingSize(plan);
  check('berdiri: muka 210 atas base 5 = 215 tinggi', st.height === 215 && st.width === 327 && st.depth === 65, JSON.stringify(st));
}

// ---- huruf ---------------------------------------------------------------------------
console.log('huruf timbul dari piksel');
// A page 100 x 60 mm at 0.2 mm a pixel: an "O" (ring) 20 mm tall with a 4 mm stroke,
// an "I" bar, a thin drawn line 30 mm long, a block hidden under a picture box, and a
// red block (a logo's lettering: dark by luminance, not black).
const raster = (() => {
  const k = 0.2;
  const width = 500;
  const height = 300;
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const ink = (fn, rgb = [20, 20, 20]) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const mx = (x + 0.5) * k;
        const my = (y + 0.5) * k;
        if (fn(mx, my)) {
          const i = (y * width + x) * 4;
          [rgba[i], rgba[i + 1], rgba[i + 2]] = rgb;
        }
      }
    }
  };
  ink((x, y) => { const r = Math.hypot(x - 20, y - 30); return r <= 10 && r >= 6; });        // O
  ink((x, y) => x >= 40 && x <= 44 && y >= 20 && y <= 40);                                    // I
  ink((x, y) => x >= 50 && x <= 80 && y >= 50 && y <= 50.4);                                  // drawn line
  ink((x, y) => x >= 85 && x <= 95 && y >= 10 && y <= 25);                                    // under a picture
  ink((x, y) => x >= 55 && x <= 70 && y >= 8 && y <= 24, [237, 28, 36]);                     // red lettering
  return { rgba, width, height, mmPerPx: k };
})();
{
  const found = L.findLetters(raster, [{ x: 82, y: 5, width: 16, height: 25 }]);
  check('2 huruf dijumpai (O dan I): garisan, gambar dan tulisan merah tak dikira', found.length === 2, found.length);
  const o = found.find((c) => c.box.width > 15);
  const i = found.find((c) => c.box.width < 6);
  check('O: kotak 20 x 20 mm', o && near(o.box.width, 20, 0.5) && near(o.box.height, 20, 0.5), o && JSON.stringify(o.box));
  const parts = o && L.splitLoops(o);
  check('O: satu luar, satu lubang', parts && parts.outer.length === 1 && parts.holes.length === 1);
  const areaOuter = parts && Math.abs(L.loopArea(parts.outer[0]));
  const areaHole = parts && Math.abs(L.loopArea(parts.holes[0]));
  check('O: luas luar ~ pi 10^2', near(areaOuter, Math.PI * 100, 4), areaOuter);
  check('O: luas lubang ~ pi 6^2', near(areaHole, Math.PI * 36, 3), areaHole);
  check('O: garisan ~ 4 mm', o && o.stroke > 3 && o.stroke < 4.6, o && o.stroke);
  check('I: 4 x 20 mm, tiada lubang', i && near(i.box.width, 4, 0.5) && near(i.box.height, 20, 0.5) && L.splitLoops(i).holes.length === 0);
  check('id ikut kiri ke kanan', found[0] === o && found[1] === i && o.id === 0 && i.id === 1);
  check('surihan diringkaskan (sedikit titik)', o.loops.every((loop) => loop.length < 120), o.loops.map((l) => l.length).join());
  const unmasked = L.findLetters(raster, []);
  check('tanpa kotak gambar: blok tu pun calon', unmasked.length === 3, unmasked.length);
  const d = L.letterPath(o, 2, 5, 5);
  check('path huruf: dua gelung tertutup, skala 2', (d.match(/M /g) || []).length === 2 && (d.match(/Z/g) || []).length === 2);
  const pts = [...d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  check('path huruf: skala dan alih betul', near(Math.min(...xs), 25, 0.4) && near(Math.max(...xs), 65, 0.4)
    && near(Math.min(...ys), 45, 0.4) && near(Math.max(...ys), 85, 0.4), `${Math.min(...xs)} ${Math.max(...xs)} ${Math.min(...ys)} ${Math.max(...ys)}`);
  const squash = L.letterPath(o, 1, 0, 0, 0.5);
  const sy = [...squash.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
  check('path huruf: skala Y sendiri', near(Math.max(...sy), 20, 0.3), Math.max(...sy));

  // ---- file cut ----------------------------------------------------------------------
  console.log('file cut');
  const pagePlan = P.planPlak({ pageW: 100, pageH: 60, size: 'file', border: true, base: true });
  const jobs = P.plakCutJobs(pagePlan, found, { front: 'maple-3', border: 'black-3', letters: 'black-3' });
  check('3 file: Maple, Black, Acrylic Hitam', jobs.map((j) => j.material.label).join() === 'Plywood Maple 3mm,Plywood Black 3mm,Acrylic Hitam 5mm',
    jobs.map((j) => j.material.label).join());
  check('Black: border dan huruf', jobs[1].parts.join() === 'border,letters');
  const allBlack = P.plakCutJobs(pagePlan, found, { front: 'black-3', border: 'black-3', letters: 'black-3' });
  check('semua Black: satu file plywood sahaja + base', allBlack.length === 2 && allBlack[0].parts.join() === 'front,border,letters');
  const noLetters = P.plakCutJobs(pagePlan, [], { front: 'maple-3', border: 'black-3', letters: 'black-3' });
  check('tanpa huruf: Black ada border sahaja', noLetters[1].parts.join() === 'border');
  const box = P.lettersBox(found, pagePlan.scale);
  check('kotak huruf atas plak', near(box.x, 10, 0.5) && near(box.width, 34, 0.5), JSON.stringify(box));

  const black = buildPlakSheet(jobs[1], { client: 'Semeru', dateline: '1 Dec 2026', units: 2, what: 'PLAK UV 100 x 60 mm' });
  check('susunan cut: lubang huruf, huruf, jalur', black.paths.map((p) => p.id).join() === 'counters,letters,strips', black.paths.map((p) => p.id).join());
  check('label: material, unit, kali', black.texts.some((t) => t.text === 'Plywood Black 3mm') && black.texts.some((t) => t.text === '2 UNIT')
    && black.texts.some((t) => t.text === 'CUT 2 KALI'));
  const all = buildPlakSheet(jobs, { units: 2, what: 'PLAK UV 100 x 60 mm, 3 material' });
  check('satu file: 3 bahagian, setiap satu berlabel material', ['Plywood Maple 3mm', 'Plywood Black 3mm', 'Acrylic Hitam 5mm']
    .every((m) => all.texts.filter((t) => t.text === m).length === 1) && all.texts.filter((t) => t.text === 'CUT 2 KALI').length === 3);
  check('satu file: susunan cut merentas bahagian, frame last',
    all.paths.map((q) => q.id).join() === 'counters,letters,strips,plate,slots,base,frame', all.paths.map((q) => q.id).join());
  const secs = all.texts.filter((t) => /mm$/.test(t.text) && /Plywood|Acrylic/.test(t.text)).map((t) => t.x);
  check('satu file: bahagian kiri ke kanan ikut material', secs.length === 3 && secs[0] < secs[1] && secs[1] < secs[2]);
  const allParts = Object.values(all.parts);
  check('satu file: tiada bahagian bertindih', !allParts.some((a, ai) => allParts.some((b, bi) => bi > ai
    && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height)));
  const allPdf = await PDFDocument.load(new TextEncoder().encode(sheetToPdf(all, { title: 'ujian' })));
  check('satu file: PDF sah, satu page', allPdf.getPageCount() === 1);
  const maple = buildPlakSheet(jobs[0], { units: 1 });
  check('Maple: plak dulu, frame last', maple.paths.map((p) => p.id).join() === 'plate,frame' && maple.paths[1].stroke === 'cut');
  const base = buildPlakSheet(jobs[2], { units: 1 });
  check('Acrylic Hitam: label pada file cut', base.texts.some((t) => t.text === 'Acrylic Hitam 5mm'));
  check('Acrylic: alur dulu, base last', base.paths.map((p) => p.id).join() === 'slots,base');
  check('Acrylic: 1 keping, 1 alur (plak 100 mm: 1 kaki)', (base.paths[1].d.match(/M /g) || []).length === 1 && (base.paths[0].d.match(/M /g) || []).length === 1);
  // Nothing in a sheet lies outside its page or over another part.
  for (const sheet of [black, maple, base]) {
    const pts = sheet.paths.flatMap((p) => parsePath(p.d).filter((c) => c[0] !== 'Z' && c[0] !== 'A').map((c) => c.slice(1)));
    const okInside = pts.every(([x, y]) => x >= 0 && y >= 0 && x <= sheet.width && y <= sheet.height);
    check(`${sheet.texts.find((t) => /mm$/i.test(t.text) && /Plywood|Acrylic/.test(t.text))?.text}: semua garis dalam page`, okInside);
  }
  const blocks = Object.values(black.parts);
  const overlap = blocks.some((a, ai) => blocks.some((b, bi) => bi > ai && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height));
  check('bahagian dalam satu file tak bertindih', !overlap);
  const pdf = await PDFDocument.load(new TextEncoder().encode(sheetToPdf(black, { title: 'ujian' })));
  check('PDF cut sah, satu page', pdf.getPageCount() === 1);
}

// ---- white ink ---------------------------------------------------------------------
console.log('white di bawah ink sahaja');
{
  // 10 x 3 pixels: black, red, near-white (245), white, a soft edge (200), the rest white.
  const w = 10;
  const rgba = new Uint8ClampedArray(w * 3 * 4).fill(255);
  const put = (x, y, rgb) => { const i = (y * w + x) * 4; [rgba[i], rgba[i + 1], rgba[i + 2]] = rgb; };
  put(0, 0, [0, 0, 0]);
  put(1, 0, [237, 28, 36]);
  put(2, 0, [245, 245, 245]);
  put(4, 0, [200, 200, 200]);
  put(9, 2, [10, 10, 10]);
  const m = P.inkMask(rgba, w, 3);
  const bit = (x, y) => (m.bits[y * Math.ceil(w / 8) + (x >> 3)] >> (7 - (x & 7))) & 1;
  check('stensil: 2 bait satu baris (10 piksel)', m.bits.length === 6);
  check('hitam, merah, tepi lembut dapat white (bit 0)', bit(0, 0) === 0 && bit(1, 0) === 0 && bit(4, 0) === 0 && bit(9, 2) === 0);
  check('putih dan hampir putih: tiada white (bit 1)', bit(2, 0) === 1 && bit(3, 0) === 1 && bit(5, 1) === 1);
  check('4 piksel ink', m.inked === 4, m.inked);
  check('hampir putih jadi putih tulen: tiada ink atas kayu', rgba[2 * 4] === 255 && rgba[2 * 4 + 1] === 255);
  check('ink asal tak berubah', rgba[4] === 237 && rgba[0] === 0);
  check('mod white: lalai bawah design', P.whiteMode('apa') === 'design' && P.whiteMode('full') === 'full');
}
{
  // The print file paints both Spots through the stencil, not as a box.
  const src = await PDFDocument.create();
  src.addPage([200, 100]).drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
  const doc = await openForPrint(await src.save());
  const m = P.inkMask(new Uint8ClampedArray(16 * 8 * 4).fill(0), 16, 8);
  const box = { x: 5, y: 5, width: 60, height: 30 };
  const bytes = await buildLayeredPrint({ width: 70, height: 40 }, [{ doc, pageIndex: 0, art: box, box, mask: m }]);
  const out = await PDFDocument.load(bytes);
  const masks = out.context.enumerateIndirectObjects().map(([, o]) => o)
    .filter((o) => o instanceof PDFRawStream && o.dict.get(PDFName.of('ImageMask'))?.toString() === 'true');
  check('file print: satu stensil ImageMask 16 x 8', masks.length === 1
    && masks[0].dict.get(PDFName.of('Width')).asNumber() === 16 && masks[0].dict.get(PDFName.of('Height')).asNumber() === 8);
  const xobj = out.getPage(0).node.Resources().get(PDFName.of('XObject'));
  check('file print: stensil dalam sumber page', xobj && xobj.keys().some((k) => /WhiteMask/.test(k.toString())));
}

// ---- simpan --------------------------------------------------------------------------
console.log('simpan ke akaun');
{
  const job = {
    file: { name: 'Semeru_Kabinet.pdf', size: 12345, hash: 'a'.repeat(64), pages: 1 },
    page: 0, size: 'A3', custom: 400, border: false, letters: true, letterMin: 12, off: [3, 1, 3],
    materials: { front: 'black-3', border: 'maple-3', letters: 'black-3' },
    base: true, white: 'full', quantity: 5, client: 'Semeru', dateline: '2026-12-01', view: 'cut', sheet: 'black-3',
  };
  const rec = Saved.plakRecord(job, plan, 13);
  const back = Saved.readPlak({ extra: JSON.stringify(rec.extra) });
  check('rekod kembali sama', back && back.size === 'A3' && back.border === false && back.white === 'full'
    && back.quantity === 5 && back.letterMin === 12 && back.materials.front === 'black-3' && back.view === 'cut');
  check('huruf dibuang: unik dan tersusun', back.off.join() === '1,3');
  check('paparan 3D disimpan', Saved.cleanPlak({ ...job, view: '3d' }).view === '3d');
  check('params rata dan nombor', Object.values(rec.params).every((v) => typeof v === 'number') && Object.keys(rec.params).length <= 40);
  check('material ditulis seperti file cut', rec.material === 'Plywood Black 3mm + Acrylic Hitam 5mm', rec.material);
  const junk = Saved.cleanPlak({
    file: { name: 'x.pdf', pages: 1 }, size: 'A9', custom: 'besar', white: 'separuh', quantity: -2, letterMin: 999,
    materials: { front: 'kayu' }, view: 'apa', off: 'semua', dateline: 'esok',
  });
  check('nilai rosak jatuh ke default', junk.size === 'A4' && junk.custom === null && junk.white === 'design' && junk.quantity === 1
    && junk.letterMin === Saved.LETTER_MIN_RANGE[1] && junk.materials.front === 'maple-3' && junk.materials.border === 'black-3'
    && junk.view === 'plak' && junk.off.length === 0 && junk.dateline === '');
  check('default: border, huruf dan base hidup', junk.border && junk.letters && junk.base);
  check('tanpa nama file: bukan job', Saved.cleanPlak({ file: {} }) === null && Saved.readPlak({ extra: '{bad' }) === null);
}

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
