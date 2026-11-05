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

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
