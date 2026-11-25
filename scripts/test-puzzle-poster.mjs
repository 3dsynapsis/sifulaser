// Ujian "Poster ke puzzle" pada kod yang sifulaser.com hidangkan.
//
//     node scripts/test-puzzle-poster.mjs
//
// Ujian geometri penuh ada dalam projek sumber (13_Puzzle Generator, npm test).
// Yang diuji di sini ialah pertemuan alat itu dengan laman ini:
//
//   * saiz yang dipersetujui bos - poster 2:3 pada A3 ialah 280 x 420 mm, 77 keping,
//     artwork 284 x 426 mm, panel 312 x 452 mm, dan UV bed 900 x 600 mm.
//   * jenama (/shared/brand-core.js) - fail cut dapat jalur "by sifulaser.com" di
//     bawah semua part, tanpa mengalihkan apa-apa. Fail print TIDAK berubah walau
//     sebait: jalur itu akan tercetak.
//   * layer FlexiPrint - fail print ada Artwork, Spot 1 dan Spot 2, nama tepat.

import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const imp = (p) => import(pathToFileURL(join(root, p)).href);

const { buildPuzzle } = await imp('puzzle/src/geom/puzzle.js');
const { planPoster, puzzleParams, UV_BED_MM } = await imp('puzzle/src/geom/poster.js');
const { buildSheet, sheetToPdf } = await imp('puzzle/src/exportJobSheet.js');
const { openForPrint, buildPrintPdf } = await imp('puzzle/src/posterPdf.js');
const { PDFDocument, PDFName, PDFDict, PDFArray } = await imp('puzzle/vendor/pdf-lib.esm.min.js');
const { brandFile, BAND_MM } = await imp('shared/brand-core.js');

let pass = 0;
let fail = 0;
const check = (name, ok, got = '') => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  GAGAL ${name} ${got}`); }
};

console.log('saiz yang dipersetujui');
const plan = planPoster(173.397, 260.096, { paper: 'A3' });
check('puzzle 280 x 420', plan.width === 280 && plan.height === 420, `${plan.width}x${plan.height}`);
check('77 keping', plan.pieces === 77, plan.pieces);
check('artwork 284 x 426', plan.art.width === 284 && plan.art.height === 426);
check('artwork 14 mm kiri, 13 mm atas', plan.art.x === 14 && plan.art.y === 13);
check('panel 312 x 452', plan.panel.width === 312 && plan.panel.height === 452);
check('UV bed 900 x 600', UV_BED_MM.long === 900 && UV_BED_MM.short === 600);
check('A2 2:3 muat', planPoster(2, 3, { paper: 'A2' }).fitsBed);
check('A2 segi empat ditolak', !planPoster(1, 1, { paper: 'A2' }).fitsBed);

console.log('fail cut dan jenama');
const puzzle = buildPuzzle(puzzleParams(plan, 7));
const sheet = buildSheet(plan, puzzle, { client: 'Ujian', dateline: '1 Jan 2027' });
const cut = new TextEncoder().encode(sheetToPdf(sheet));
const brandedCut = brandFile('poster-cut-280x420.pdf', 'application/pdf', cut);
check('nama dapat awalan', brandedCut.name === 'sifulaser-poster-cut-280x420.pdf', brandedCut.name);
const cutDoc = await PDFDocument.load(brandedCut.data);
const toMm = 25.4 / 72;
const box = cutDoc.getPage(0).getMediaBox();
check('kanvas bertambah tepat satu jalur',
  Math.abs(box.height * toMm - (sheet.height + BAND_MM)) < 0.01, box.height * toMm);
check('lebar kanvas tidak berubah', Math.abs(box.width * toMm - sheet.width) < 0.01);
check('jalur tumbuh ke bawah, part tidak dialih', Math.abs(box.y * toMm + BAND_MM) < 0.01, box.y);
const text = new TextDecoder('latin1').decode(brandedCut.data);
check('tulisan jenama ada dalam fail', text.includes('/sifulaser-brand'));
check('warna jenama hijau', text.includes('0 0.651 0.318 RG'));

console.log('fail print tidak dijenamakan');
const src = await PDFDocument.create();
src.addPage([491.52, 737.28]).drawRectangle({ x: 10, y: 10, width: 100, height: 100 });
const print = await buildPrintPdf(await openForPrint(await src.save()), 0, plan);
const brandedPrint = brandFile('poster-print-284x426.pdf', 'application/pdf', print);
check('nama dapat awalan', brandedPrint.name === 'sifulaser-poster-print-284x426.pdf');
check('kandungan sama sebait demi sebait',
  brandedPrint.data.length === print.length && brandedPrint.data.every((b, i) => b === print[i]));

console.log('layer FlexiPrint dalam fail print');
const printDoc = await PDFDocument.load(brandedPrint.data);
const layers = printDoc.catalog.lookup(PDFName.of('OCProperties'), PDFDict)
  .lookup(PDFName.of('OCGs'), PDFArray).asArray()
  .map((r) => printDoc.context.lookup(r, PDFDict).lookup(PDFName.of('Name')).decodeText());
check('tiga layer, nama Spot tepat', layers.join('|') === 'Artwork|Spot 1|Spot 2', layers.join('|'));
check('saiz page kekal panel', Math.abs(printDoc.getPage(0).getWidth() * toMm - 312) < 0.01);

// UV File Generator (bos, 11 Nov 2026): tab /uvfile/ jalan atas kod yang sama, puzzle
// tanpa pieces. Poster dicut keluar di tepinya dalam frame 10 mm (bukan 16 mm macam
// puzzle, untuk jimat material); bleed 2 mm jatuh atas frame.
console.log('UV File Generator: panel tanpa puzzle');
const { planPanel } = await imp('puzzle/src/geom/panel.js');
const { buildPanelSheet } = await imp('puzzle/src/exportJobSheet.js');
const panel = planPanel(173.397, 260.096, { paper: 'A3' });
check('poster 280 x 420', panel.width === 280 && panel.height === 420, `${panel.width}x${panel.height}`);
check('panel 300 x 440 (border 10 mm)', panel.panel.width === 300 && panel.panel.height === 440,
  `${panel.panel.width}x${panel.panel.height}`);
check('artwork 284 x 426 (bleed 2 mm, ratio kekal)', panel.art.width === 284 && panel.art.height === 426);
check('artwork 8 mm kiri, 7 mm atas', panel.art.x === 8 && panel.art.y === 7);
check('tiada keping', panel.pieces === 0);
const own = planPanel(297, 420, { actual: true });
check('saiz asal PDF: panel 317 x 440', own.panel.width === 317 && own.panel.height === 440);
const panelSheet = buildPanelSheet(panel, { units: 3 });
check('garis poster dulu, frame last', panelSheet.paths.map((p) => p.id).join() === 'poster,frame',
  panelSheet.paths.map((p) => p.id).join());
check('garis poster bucu R3 (tak tajam), frame bucu R5',
  (panelSheet.paths[0].d.match(/A 3 3 /g) || []).length === 4
    && (panelSheet.paths[1].d.match(/A 5 5 /g) || []).length === 4);
check('label acrylic putih dan unit',
  panelSheet.texts.slice(3).map((t) => t.text).join('|') === 'Acrylic Putih 3mm|3 UNIT');
check('material lain tertulis dalam fail cut',
  buildPanelSheet(panel, { units: 2, material: 'Acrylic Clear 5mm' }).texts.slice(3).map((t) => t.text).join('|')
    === 'Acrylic Clear 5mm|2 UNIT');
const panelCut = brandFile('poster-cut-280x420.pdf', 'application/pdf',
  new TextEncoder().encode(sheetToPdf(panelSheet)));
check('fail cut panel dapat jenama', new TextDecoder('latin1').decode(panelCut.data).includes('/sifulaser-brand'));
const panelPrint = await buildPrintPdf(await openForPrint(await src.save()), 0, panel);
const brandedPanelPrint = brandFile('poster-print-284x426.pdf', 'application/pdf', panelPrint);
check('fail print panel tidak berubah sebait',
  brandedPanelPrint.data.length === panelPrint.length && brandedPanelPrint.data.every((b, i) => b === panelPrint[i]));
const panelLayers = (await PDFDocument.load(panelPrint)).catalog.lookup(PDFName.of('OCProperties'), PDFDict)
  .lookup(PDFName.of('OCGs'), PDFArray);
check('fail print panel ada tiga layer', panelLayers.size() === 3, panelLayers.size());

// Keychain UV File Generator (bos, 17 Nov 2026): tab /keychainuv/ jalan atas kod yang
// sama. Keychain bulat 4/5/6 cm, lubang 2 mm, jarak 7 mm dan 7 mm dari tepi sheet (tiada
// masking tape, bos 17 Nov 2026).
console.log('Keychain UV File Generator: sheet keychain');
const kc = await imp('puzzle/src/geom/keychain.js');
const { buildKeychainSheet } = await imp('puzzle/src/exportJobSheet.js');
const { buildLayeredPrint } = await imp('puzzle/src/posterPdf.js');
const kecil = kc.layoutKeychains({ sizeMm: 50, sheet: 'kecil' });
check('5 cm atas Kecil 490 x 740: 96 keychain (8 x 12)', kecil.capacity === 96 && kecil.cols === 8, kecil.capacity);
check('5 cm atas Besar 550 x 850: 126', kc.layoutKeychains({ sizeMm: 50, sheet: 'besar' }).capacity === 126);
check('sheet Mini 300 x 400: 30', kc.layoutKeychains({ sizeMm: 50, sheet: 'mini' }).capacity === 30);
check('90 atas Mini: 30 satu keping, 3 kali', (() => {
  const m = kc.layoutKeychains({ sizeMm: 50, sheet: 'mini', quantity: 90 });
  return m.perSheet === 30 && m.sheets === 3;
})());
check('sheet Custom 490 x 370: 48', kc.layoutKeychains({ sizeMm: 50, sheet: 'custom', custom: { width: 490, height: 370 } }).capacity === 48);
check('100 keychain atas Kecil: 2 sheet x 50', (() => {
  const q = kc.layoutKeychains({ sizeMm: 50, sheet: 'kecil', quantity: 100 });
  return q.sheets === 2 && q.perSheet === 50;
})());
check('garis cut sekurang-kurangnya 7 mm dari tepi sheet', kecil.items.every((it) => it.x - 25 >= 7 && it.y - 25 >= 7
  && 490 - it.x - 25 >= 7 && 740 - it.y - 25 >= 7));
const kcHole = kc.holeOffset({ angle: 0, inset: kc.HOLE_INSET_MM }, 50);
check('lubang 2 mm di atas, tinggal 1.5 mm acrylic ke tepi', kcHole.dx === 0 && kcHole.dy === -22.5
  && kc.holeWall({ angle: 0, inset: kc.HOLE_INSET_MM }, 50) === 1.5);
const kcSheet = buildKeychainSheet(kecil, { material: 'Acrylic Putih 3mm', hole: kcHole });
check('FRONT biru dulu, lubang, keychain, frame sheet last', kcSheet.paths.map((p) => p.id).join() === 'front,holes,keychains,sheet'
  && kcSheet.paths[0].colour === 'blue');
check('label material, PCS satu sheet dan berapa kali cut', kcSheet.texts.slice(3).map((t) => t.text).join('|') === 'Acrylic Putih 3mm|96 PCS SATU SHEET|CUT 1 KALI');
const hookLay = kc.layoutKeychains({ sizeMm: 50, sheet: 'mini', type: 'hook', hole: { angle: 0 } });
check('hook 5 cm atas Mini: 30', hookLay.capacity === 30);
const hookSheet = buildKeychainSheet(hookLay, { material: 'Acrylic Putih 3mm', hole: kc.hookOffset({ angle: 0 }, 50), hookR: kc.HOOK_R });
check('file cut hook: setiap keychain ada telinga 3 mm', (hookSheet.paths.find((p) => p.id === 'keychains').d.match(/A 3 3 /g) || []).length === 90
  && hookSheet.texts[2].text.includes('HOOK'));
const kcCut = brandFile('keychain-cut-50mm-kecil.pdf', 'application/pdf', new TextEncoder().encode(sheetToPdf(kcSheet)));
check('fail cut keychain dapat jenama', new TextDecoder('latin1').decode(kcCut.data).includes('/sifulaser-brand'));
const { rgbaToCmyk, encodeCmykJpeg } = await imp('puzzle/src/cmykJpeg.js');
const kcJpg = encodeCmykJpeg(rgbaToCmyk(new Uint8ClampedArray(8 * 8 * 4).fill(180), 64), 8, 8, 90);
const kcPrint = await buildLayeredPrint(kecil.sheet, kecil.items.map((it) => ({
  jpg: kcJpg,
  box: { x: it.x - 27, y: it.y - 27, width: 54, height: 54 },
  shape: { cx: it.x, cy: it.y, r: 27, hole: { cx: it.x + kcHole.dx, cy: it.y + kcHole.dy, r: 1 } },
})));
const kcPrintDoc = await PDFDocument.load(kcPrint);
check('fail print keychain sebesar sheet', Math.abs(kcPrintDoc.getPage(0).getWidth() * toMm - 490) < 0.01);
check('fail print keychain ada tiga layer', kcPrintDoc.catalog.lookup(PDFName.of('OCProperties'), PDFDict)
  .lookup(PDFName.of('OCGs'), PDFArray).size() === 3);
const kcBranded = brandFile('keychain-print-50mm-kecil.pdf', 'application/pdf', kcPrint);
check('fail print keychain tidak berubah sebait',
  kcBranded.data.length === kcPrint.length && kcBranded.data.every((b, i) => b === kcPrint[i]));

// ---- UV File: buang ruang putih (Boss, 25 Nov 2026) ----------------------------------
// Logo kecil di tengah A4 (contoh Masjid Asy Syakirin: 79% page putih). Tab mencari
// artwork, memangkas page kepadanya + 3 mm, dan semua saiz selepas itu ikut pangkasan.
console.log('\nbuang ruang putih (UV File)');
{
  const C = await imp('puzzle/src/geom/crop.js');
  const { planPanel } = await imp('puzzle/src/geom/panel.js');
  const { cleanPoster } = await imp('puzzle/src/posterSaved.js');
  const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;

  // Page putih 210 x 297 mm sebagai raster 420 x 594 (0.5 mm/px), artwork sebuah blok
  // seperti logo contoh: 91.7 x 145.8 mm, 61.7 mm dari kiri, 64 mm dari atas.
  const W = 420, H = 594, mmPx = 0.5;
  const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
  const ink = (x0, y0, x1, y1, [r, g, b, a = 255]) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4;
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
      }
    }
  };
  ink(123, 128, 306, 419, [40, 90, 60]);
  ink(5, 590, 5, 590, [0, 0, 0]);                 // sebutir habuk di bucu: bukan artwork
  const box = C.findContent(rgba, W, H);
  check('artwork dijumpai, habuk diabaikan', box && box.x0 === 123 && box.y0 === 128 && box.x1 === 306 && box.y1 === 419,
    JSON.stringify(box));
  const crop = C.trimCrop(box, mmPx, 210, 297);
  // Jarak = 3% sisi panjang artwork (146 mm -> 4.38 mm), tidak kurang 3 mm.
  const gap = 0.03 * 146;
  check('pangkas = artwork + 3% sisi panjangnya', crop && near(crop.x, 61.5 - gap) && near(crop.y, 64 - gap)
    && near(crop.w, 92 + 2 * gap) && near(crop.h, 146 + 2 * gap), JSON.stringify(crop));
  check('jarak paling kecil 3 mm', near(C.trimCrop({ x0: 100, y0: 100, x1: 139, y1: 119 }, mmPx, 210, 297).x, 47));
  check('75% page dibuang (jarak termasuk)', Math.round(C.trimmedShare(crop, 210, 297) * 100) === 75,
    C.trimmedShare(crop, 210, 297));
  // Tinggi output 100 mm: poster ikut pangkasan, bukan page.
  const before = planPanel(210, 297, { height: 100 });
  const after = planPanel(crop.w, crop.h, { height: 100 });
  check('sebelum: poster 70.7 x 100 (ikut page)', before.width === 70.7 && before.height === 100, `${before.width}x${before.height}`);
  check('selepas: poster ikut pangkasan, logo hampir 2x lebih besar', near(after.width, 100 * crop.w / crop.h, 0.06)
    && after.height === 100 && after.panel.width < before.panel.width, `${after.width}x${after.height}`);
  // Pangkasan = tepi poster; bleed diambil dari page di luarnya (bukan dari dalam pangkasan).
  const bc = C.bleedCrop(crop, after, { x: after.art.bleedX, y: after.art.bleedY });
  check('bleedCrop: pangkasan + bleed dalam unit page, sama nisbah dengan artwork',
    near(bc.x, crop.x - after.art.bleedX * crop.w / after.width, 1e-9)
    && near(bc.w / bc.h, after.art.width / after.art.height, 0.002), JSON.stringify(bc));
  const bt = C.bleedCrop(crop, { width: after.height, height: after.width }, { x: after.art.bleedY, y: after.art.bleedX }, true);
  check('bleedCrop dipusing: paksi bertukar, hasil sama', near(bt.x, bc.x, 1e-9) && near(bt.y, bc.y, 1e-9)
    && near(bt.w, bc.w, 1e-9) && near(bt.h, bc.h, 1e-9));

  // Tiada yang patut dipangkas: page penuh warna, page kosong, PNG lutsinar.
  const full = new Uint8ClampedArray(W * H * 4).fill(200);
  check('poster penuh warna: tidak dipangkas', C.trimCrop(C.findContent(full, W, H), mmPx, 210, 297) === null);
  check('page kosong: tiada artwork', C.findContent(new Uint8ClampedArray(W * H * 4).fill(255), W, H) === null);
  const clear = new Uint8ClampedArray(W * H * 4);                     // lutsinar: 0,0,0,0
  for (let y = 200; y < 260; y++) for (let x = 100; x < 300; x++) clear.set([20, 20, 20, 255], (y * W + x) * 4);
  const cb = C.findContent(clear, W, H);
  check('PNG lutsinar: kawasan lutsinar bukan artwork', cb && cb.x0 === 100 && cb.y0 === 200 && cb.x1 === 299 && cb.y1 === 259);
  check('hampir seluruh page: tidak dipangkas (< 5%)', C.trimCrop({ x0: 2, y0: 2, x1: W - 3, y1: H - 3 }, mmPx, 210, 297) === null);

  // Had dan bulatan.
  check('pangkas kekal atas page', JSON.stringify(C.cleanCrop({ x: -5, y: 290, w: 400, h: 50 }, 210, 297))
    === JSON.stringify({ x: 0, y: 287, w: 210, h: 10 }));
  check('pangkas paling kecil 10 mm', C.cleanCrop({ x: 50, y: 50, w: 2, h: 3 }, 210, 297).w === 10);
  check('pangkas rosak -> null', C.cleanCrop({ x: NaN, y: 0, w: 1, h: 1 }, 210, 297) === null);
  check('seluruh page dikenali', C.isWholePage({ x: 0, y: 0, w: 210, h: 297 }, 210, 297)
    && !C.isWholePage(crop, 210, 297));

  // Putaran: 90 kemudian 270 kembali ke asal; 180 dua kali juga.
  const back = C.turnRect(C.turnRect(crop, 210, 297, 90), 297, 210, 270);
  check('turnRect 90 lalu 270 = asal', ['x', 'y', 'w', 'h'].every((k) => near(back[k], crop[k], 1e-9)), JSON.stringify(back));
  const t90 = C.turnRect({ x: 10, y: 20, w: 30, h: 40 }, 210, 297, 90);
  check('turnRect 90: bucu atas-kiri ke atas-kanan', t90.x === 297 - 20 - 40 && t90.y === 10 && t90.w === 40 && t90.h === 30);
  const t180 = C.turnRect({ x: 10, y: 20, w: 30, h: 40 }, 210, 297, 180);
  check('turnRect 180', t180.x === 170 && t180.y === 237);

  // pageBoxFor: pangkasan jatuh TEPAT atas sasaran (artwork + bleed), pada setiap putaran.
  const target = { x: 8, y: 8, width: 68.5, height: 104 };
  for (const turn of [0, 90, 180, 270]) {
    const tw = turn % 180 ? { ...target, width: 104, height: 68.5 } : target;
    const c = C.turnRect(crop, 210, 297, turn);
    const pb = C.pageBoxFor(crop, 210, 297, tw, turn);
    const [fw, fh] = turn % 180 ? [297, 210] : [210, 297];
    const k = pb.width / fw;
    check(`pageBoxFor ${turn}: pangkasan = sasaran`, near(pb.x + c.x * k, tw.x, 1e-9) && near(pb.y + c.y * (pb.height / fh), tw.y, 1e-9)
      && near(c.w * k, tw.width, 1e-9) && near(c.h * (pb.height / fh), tw.height, 1e-9));
  }
  check('pageBoxFor tanpa pangkasan = sasaran', JSON.stringify(C.pageBoxFor(null, 210, 297, target)) === JSON.stringify(target));

  // Rekod simpan: crops dibersihkan; rekod lama tiada crops (page penuh).
  const file = { name: 'logo.pdf', size: 10, hash: 'a'.repeat(64), pages: 2 };
  const job = cleanPoster({
    files: [file], view: 'crop',
    crops: [{ i: 0, x: 58.5, y: 61, w: 98, h: 152, auto: true }, { i: 0, x: 1, y: 1, w: 9, h: 9 },
      { i: 1, x: NaN, y: 0, w: 1, h: 1 }, { i: 7, x: 0, y: 0, w: 5, h: 5 }, { i: 1, x: -1, y: 0, w: 5, h: 5 }, 'x'],
  });
  check('rekod: satu pangkasan sah setiap page, yang rosak dibuang', job.crops.length === 1 && job.crops[0].i === 0
    && job.crops[0].auto === true && job.crops[0].w === 98, JSON.stringify(job.crops));
  check('rekod: paparan Pangkas disimpan', job.view === 'crop');
  check('rekod lama: tiada crops', !('crops' in cleanPoster({ files: [file] })));
}

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
