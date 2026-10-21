// Fail potong untuk tapak laser: lapisan papan (geom/layers.js) disusun atas
// helaian katil laser dan ditulis sebagai SVG dan PDF - penulis, susunan dan
// nota bahan yang SAMA dengan kotak akrilik (acrylic.js), supaya kedua-dua
// fail dibaca dengan cara yang sama di mesin.
//
// Lapisan dalam setiap fail:
//   Potong            merah   tepi luar setiap lapisan, alur (bingkai dan
//                             tengah), poket, slot - dengan kerf
//   Tanda penjajaran  biru    skor ringan di mana lapisan atas diletak;
//                             tertutup bila dilekat (lihat geom/layers.js)
//   Label             kelabu  pilihan, nombor lapisan
//   Nota              hijau   bahan, helaian, bilangan lapis - dibaca, bukan dipotong
//
// Tulen: tiada DOM, diuji oleh scripts/test-plakbox.mjs.

import {
  nest, sheetDef, sheetToSvg, sheetToPdf, noteLines, notePlace, DEFAULT_SHEET,
} from './acrylic.js';
import { layerPieces } from './geom/layers.js';
import { boardOf } from './geom/base.js';

const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Kerf papan: 0..1 mm, atau lalai papan itu. */
export function cleanBoardKerf(k, board) {
  const v = Number(k);
  return k !== '' && k != null && Number.isFinite(v) && v >= 0 && v <= 1 ? v : boardOf(board).kerf;
}

/**
 * Semua fail tapak laser untuk satu model (mod 'laser'): satu bagi setiap
 * helaian, setiap satu SVG dan PDF. Pulangkan { files: [{ name, pdfName, svg,
 * pdf, sheet, note }], kerf, sheet, board, pieces } atau null untuk tapak cetak 3D.
 */
export function baseFiles(model, { sheet = DEFAULT_SHEET, kerf = null, labels = false, marks = true } = {}) {
  if (!model.layers) return null;
  const p = model.params;
  const d = model.derived;
  const board = boardOf(p.board);
  const k = cleanBoardKerf(kerf, p.board);
  const def = sheetDef(sheet);
  const pieces = layerPieces(model.layers, k, { marks });
  const sheets = nest(pieces, def);
  // Tebal SEBENAR dalam nota bila berbeza daripada nominal: pekerja perlu
  // tahu fail ini dikira untuk papan 2.8 mm, bukan 3 mm.
  const material = Math.abs(p.boardT - board.t) > 0.01 ? `${board.name} (sebenar ${fmt(p.boardT)}mm)` : board.name;
  const stamp = `${fmt(d.baseL)}x${fmt(d.baseW)}x${fmt(p.baseH)}`;
  const files = sheets.map((s, i) => {
    const base = `plakbox-tapak-${board.id}-${stamp}${sheets.length > 1 ? `-helaian${i + 1}` : ''}`;
    const title = `Plak Box - tapak lapis ${board.name}, ${model.layers.N} lapis, kerf ${fmt(k)} mm`;
    const note = notePlace(s, noteLines({
      kind: 'tapak', material, sheet: def, index: i + 1, total: sheets.length, count: s.placed.length, kerf: k,
    }));
    return {
      name: `${base}.svg`, pdfName: `${base}.pdf`,
      svg: sheetToSvg(s, { title, labels, note }),
      pdf: sheetToPdf(s, { title, labels, note }),
      sheet: s, note,
    };
  });
  return { files, kerf: k, sheet: def, board, pieces };
}
