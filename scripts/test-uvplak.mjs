// Ujian tab UV Plak (Bos, 28 Nov 2026) pada kod yang sifulaser.com hidangkan.
//
//     node scripts/test-uvplak.mjs
//
//   * saiz - file A4 jadi plak A4 297 x 210; A3 420 x 297; taip lebar, tinggi ikut nisbah.
//   * border 10 mm, 4 keping sudut 45: dua panjang sama, dua pendek sama, tepi luar
//     tepat saiz plak, susunan dalam file cut tak bertindih.
//   * base acrylic 5mm: 1 keping penuh + keping beralur, alur 3.4 mm, kaki plak sedalam alur.
//   * print: berhenti 2 mm bawah border (gam lekat pada kayu), atau lebih 2 mm tanpa border.
//   * huruf timbul: tulisan disurih dengan lubang huruf, garisan lukisan tak dikira.
//   * file cut: satu setiap material, lubang huruf dulu, frame last; PDF sah.
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
const { PDFDocument } = await imp('puzzle/vendor/pdf-lib.esm.min.js');
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
console.log('pelan plak A4, border, base 2 keping');
const plan = P.planPlak({ pageW: 297, pageH: 210.2, size: 'A4', border: true, base: true, baseLayers: 2 });
{
  check('muka plak 297 x 210', plan.width === 297 && plan.height === 210);
  check('kaki 5 mm (alur base 2 keping)', plan.tongue === 5, plan.tongue);
  check('plat dipotong 297 x 215', plan.plate.width === 297 && plan.plate.height === 215);
  check('page print = plat + frame 10 mm', plan.page.width === 317 && plan.page.height === 235, `${plan.page.width}x${plan.page.height}`);
  check('design di (10, 10)', plan.design.x === 10 && plan.design.y === 10 && plan.design.width === 297);
  check('print berhenti 2 mm bawah border', plan.printBox.x === 18 && plan.printBox.y === 18
    && plan.printBox.width === 281 && plan.printBox.height === 194, JSON.stringify(plan.printBox));
  check('muat bed UV', plan.fitsBed);
  check('skala design = 1 (A4 ke A4)', near(plan.scale, 1, 0.001) && near(plan.scaleY, 210 / 210.2, 1e-6));
  const bare = P.planPlak({ pageW: 297, pageH: 210, size: 'A4', border: false, base: false });
  check('tanpa border: print lebih 2 mm keliling', bare.printBox.x === 8 && bare.printBox.width === 301 && bare.printBox.height === 214);
  check('tanpa base: tiada kaki', bare.tongue === 0 && bare.plate.height === 210 && bare.base === null);
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
console.log('base acrylic 5mm');
{
  const b = plan.base;
  check('panjang = plak + 15 mm kiri kanan', b.length === 327, b.length);
  check('dalam ikut tinggi plak (5 mm langkah, 50-120)', b.depth === 65, b.depth);
  check('alur 3.4 mm lebar', b.slot.width === 3.4);
  check('alur 0.6 mm lebih panjang dari plak', b.slot.length === 297.6);
  check('alur di tengah', near(b.slot.x * 2 + b.slot.length, b.length) && near(b.slot.y * 2 + b.slot.width, b.depth));
  check('2 keping: 1 penuh, 1 beralur, alur 5 mm', b.pieces.length === 2 && !b.pieces[0].slot && b.pieces[1].slot && b.slotDepth === 5);
  const b3 = P.planBase(297, 210, 3);
  check('3 keping: alur 10 mm, tebal 15 mm', b3.pieces.length === 3 && b3.slotDepth === 10 && b3.height === 15);
  check('plak tinggi: base paling dalam 120', P.planBase(420, 600, 2).depth === 120);
  check('plak rendah: base paling cetek 50', P.planBase(200, 80, 2).depth === 50);
  const st = P.standingSize(plan);
  check('berdiri: tinggi muka + base atas alur', st.height === 215 && st.width === 327 && st.depth === 65, JSON.stringify(st));
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
  const pagePlan = P.planPlak({ pageW: 100, pageH: 60, size: 'file', border: true, base: true, baseLayers: 2 });
  const jobs = P.plakCutJobs(pagePlan, found, { front: 'maple-3', border: 'black-3', letters: 'black-3' });
  check('3 file: Maple, Black, Acrylic', jobs.map((j) => j.material.label).join() === 'Plywood Maple 3mm,Plywood Black 3mm,Acrylic 5mm',
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
  const maple = buildPlakSheet(jobs[0], { units: 1 });
  check('Maple: plak dulu, frame last', maple.paths.map((p) => p.id).join() === 'plate,frame' && maple.paths[1].stroke === 'cut');
  const base = buildPlakSheet(jobs[2], { units: 1 });
  check('Acrylic: alur dulu, base last', base.paths.map((p) => p.id).join() === 'slots,base');
  check('Acrylic: 2 keping, 1 alur', (base.paths[1].d.match(/M /g) || []).length === 2 && (base.paths[0].d.match(/M /g) || []).length === 1);
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

// ---- simpan --------------------------------------------------------------------------
console.log('simpan ke akaun');
{
  const job = {
    file: { name: 'Semeru_Kabinet.pdf', size: 12345, hash: 'a'.repeat(64), pages: 1 },
    page: 0, size: 'A3', custom: 400, border: false, letters: true, letterMin: 12, off: [3, 1, 3],
    materials: { front: 'black-3', border: 'maple-3', letters: 'black-3' },
    base: true, baseLayers: 3, quantity: 5, client: 'Semeru', dateline: '2026-12-01', view: 'cut', sheet: 'black-3',
  };
  const rec = Saved.plakRecord(job, plan, 13);
  const back = Saved.readPlak({ extra: JSON.stringify(rec.extra) });
  check('rekod kembali sama', back && back.size === 'A3' && back.border === false && back.baseLayers === 3
    && back.quantity === 5 && back.letterMin === 12 && back.materials.front === 'black-3' && back.view === 'cut');
  check('huruf dibuang: unik dan tersusun', back.off.join() === '1,3');
  check('params rata dan nombor', Object.values(rec.params).every((v) => typeof v === 'number') && Object.keys(rec.params).length <= 40);
  check('material ditulis seperti file cut', rec.material === 'Plywood Black 3mm + Acrylic 5mm', rec.material);
  const junk = Saved.cleanPlak({
    file: { name: 'x.pdf', pages: 1 }, size: 'A9', custom: 'besar', baseLayers: 7, quantity: -2, letterMin: 999,
    materials: { front: 'kayu' }, view: 'apa', off: 'semua', dateline: 'esok',
  });
  check('nilai rosak jatuh ke default', junk.size === 'A4' && junk.custom === null && junk.baseLayers === 2 && junk.quantity === 1
    && junk.letterMin === Saved.LETTER_MIN_RANGE[1] && junk.materials.front === 'maple-3' && junk.materials.border === 'black-3'
    && junk.view === 'plak' && junk.off.length === 0 && junk.dateline === '');
  check('default: border, huruf dan base hidup', junk.border && junk.letters && junk.base);
  check('tanpa nama file: bukan job', Saved.cleanPlak({ file: {} }) === null && Saved.readPlak({ extra: '{bad' }) === null);
}

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
