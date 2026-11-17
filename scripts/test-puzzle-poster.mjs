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
check('lubang dulu, keychain, frame sheet last', kcSheet.paths.map((p) => p.id).join() === 'holes,keychains,sheet');
check('label material, PCS satu sheet dan berapa kali cut', kcSheet.texts.slice(3).map((t) => t.text).join('|') === 'Acrylic Putih 3mm|96 PCS SATU SHEET|CUT 1 KALI');
const hookLay = kc.layoutKeychains({ sizeMm: 50, sheet: 'mini', type: 'hook', hole: { angle: 0 } });
check('hook 5 cm atas Mini: 30', hookLay.capacity === 30);
const hookSheet = buildKeychainSheet(hookLay, { material: 'Acrylic Putih 3mm', hole: kc.hookOffset({ angle: 0 }, 50), hookR: kc.HOOK_R });
check('file cut hook: setiap keychain ada telinga 3 mm', (hookSheet.paths[1].d.match(/A 3 3 /g) || []).length === 90
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

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
