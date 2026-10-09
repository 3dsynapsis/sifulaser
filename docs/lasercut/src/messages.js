// Every sentence a customer can see about their file, in one place, in Bahasa
// Melayu. Short and direct: what happened, and what to do about it.
//
// Three strings are the spec's own words and are tested character for
// character: the oversize message, the minimum-charge note and the disclaimer.

export const OVERSIZE = 'Saiz melebihi 120 x 90 cm (sekeping papan 4 x 3 kaki) - hubungi kami untuk sebut harga';
export const MIN_NOTE = 'Caj minimum RM10 dikenakan';
export const DISCLAIMER = 'Harga anggaran. Harga muktamad disahkan oleh staff selepas semakan fail.';
export const ATTACH_NOTE = 'Sila lampirkan fail anda dalam WhatsApp selepas mesej dibuka.';

export const ERRORS = {
  'empty': 'Fail ini kosong (0 KB). Sila semak fail dan cuba lagi.',
  'too-large': 'Fail terlalu besar (maksimum 50 MB). Hantar fail melalui WhatsApp untuk sebut harga.',
  'ai-not-pdf-compatible': "Fail .ai ini tak dapat dibaca. Buka dalam Illustrator > File > Save As, tandakan 'Create PDF Compatible File', kemudian muat naik semula.",
  'image-unsupported': 'Format gambar ini (HEIC/TIFF) tidak disokong. Simpan sebagai PNG atau JPG dan muat naik semula, atau hantar melalui WhatsApp.',
  'image-unreadable': 'Gambar ini tak dapat dibuka oleh pelayar ini. Cuba simpan semula sebagai PNG atau JPG.',
  'image-empty': 'Gambar ini kosong atau lutsinar sepenuhnya - tiada apa untuk dijejak.',
  'not-supported': 'Fail ini bukan PDF, AI, DXF atau gambar PNG/JPG.',
  'dwg': 'Fail DWG belum boleh dibaca terus. Dalam AutoCAD pilih File > Save As > DXF, kemudian muat naik fail DXF itu. Atau hantar fail DWG ini melalui WhatsApp untuk sebut harga.',
  'binary-dxf': 'Fail DXF ini format binari. Simpan semula sebagai ASCII DXF dan muat naik semula.',
  'text-only': 'Fail ini hanya ada teks yang belum ditukar ke outline. Tukar teks ke outline (Create Outlines / Convert to Curves) dan muat naik semula.',
  'nothing': 'Tiada apa untuk dipotong atau diukir - semua layer diabaikan. Tukar sekurang-kurangnya satu layer kepada Potong atau Ukir.',
  'encrypted-password': 'Fail PDF ini dilindungi kata laluan. Sila buang kata laluan dan muat naik semula.',
  'encrypted-unsupported': 'Fail ini ada tetapan keselamatan yang kami tak dapat baca. Sila simpan semula tanpa security dan muat naik semula.',
  'corrupt': 'Fail ini rosak atau tidak lengkap. Cuba simpan semula dan muat naik.',
  'raster-only': 'Fail ini hanya ada gambar, tiada garisan potong vektor. Sila lukis outline bentuk yang hendak dipotong.',
  'no-closed-path': 'Bentuk untuk dipotong tidak dijumpai di halaman 1. Pastikan outline anda bentuk tertutup (closed path).',
  'cut-overlap': 'Ada garisan potong yang bertindih. Sila betulkan supaya setiap bentuk tidak bersilang.',
  'too-complex': 'Fail ini terlalu kompleks untuk dikira di telefon. Hantar melalui WhatsApp untuk sebut harga.',
  'oversize': OVERSIZE,
  'qty-invalid': 'Masukkan kuantiti nombor bulat, sekurang-kurangnya 1.',

  'read-failed': 'Fail tak dapat dibuka oleh pelayar ini. Cuba pilih fail sekali lagi.',
};

/** Errors where the customer should still be able to WhatsApp us the file. */
export const WHATSAPP_ON_ERROR = new Set(['too-large', 'too-complex', 'oversize', 'dwg', 'image-unsupported']);

export const errorText = (code) => ERRORS[code] || ERRORS.corrupt;

const RULE_WORD = { a: 'CutContour', b: 'Cut' };

/** "Garisan potong dikesan melalui: ..." - always shown with a result. */
export function ruleText(rule, names = []) {
  const shown = names.slice(0, 3).map((n) => `'${n}'`).join(', ');
  if (rule === 'a') return `Garisan potong dikesan melalui: warna spot ${shown || `'${RULE_WORD.a}'`}`;
  if (rule === 'b') return `Garisan potong dikesan melalui: lapisan ${shown || `'${RULE_WORD.b}'`}`;
  if (rule === 'c') return 'Saiz kepingan diambil dari bentuk paling luar';
  return '';
}

export function warningText(w) {
  switch (w.code) {
    case 'multi-page': return `Fail ini ada ${w.pages} halaman. Hanya halaman 1 dikira.`;
    case 'live-text':
    case 'live-text-cut-colour': return 'Ada teks yang belum ditukar ke outline, jadi teks itu TIDAK termasuk dalam harga. Tukar dahulu (Illustrator: Type > Create Outlines; CorelDRAW: Convert to Curves) dan muat naik semula.';
    case 'outside-cut': return 'Ada bentuk di luar garisan potong yang tidak dikira. Sila semak pratonton.';
    case 'no-cut': return 'Tiada bentuk tertutup untuk dipotong, jadi bahan dikira ikut kotak di sekeliling design. Tukar layer outline kepada Potong jika design perlu dipotong keluar.';
    case 'dxf-units': return 'Fail DXF ini tidak menyatakan unit. Kami anggap milimeter - semak saiz di bawah dan ubah jika salah.';
    case 'dxf-units-known': return `Unit fail DXF: ${w.unit}. Saiz sudah ditukar ke cm.`;
    case 'dxf': return w.text || '';
    case 'image-size': return `Gambar tiada saiz sebenar. Kami mulakan pada ${w.mm / 10} cm (sisi paling panjang) - tetapkan saiz sebenar di bahagian Saiz.`;
    case 'image-traced': return 'Gambar dijejak jadi bentuk vektor ikut warna. Bingkai segi empat gambar dipotong dan warna lain diukir - tukar di bahagian Layer jika mahu bentuk dipotong keluar.';
    case 'fallback-outline': return '';
    case 'background-fill': return 'Ada warna latar yang menutup seluruh kepingan. Ia dianggap warna bahan dan TIDAK diukir. Jika mahu ukir seluruh permukaan, nyatakan dalam WhatsApp.';
    case 'outside-artboard': return 'Ada objek di luar artboard yang tidak dikira.';
    case 'annotations': return 'Komen/anotasi PDF tidak dikira sebagai garisan potong.';
    case 'many-pieces': return `Fail ini ada ${w.n} kepingan. Sila semak senarai saiz, atau WhatsApp kami untuk pengesahan.`;
    case 'open-cut': return w.rule === 'a'
      ? 'Garisan potong berwarna spot dijumpai tetapi tidak tertutup, jadi ia tidak dikira. Sila tutup outline (closed path).'
      : "Lapisan 'cut' dijumpai tetapi garisannya tidak tertutup, jadi ia tidak dikira. Sila tutup outline (closed path).";
    case 'open-cut-some': return 'Ada garisan potong yang tidak tertutup dan tidak dikira. Sila semak pratonton.';
    case 'repaired': return 'Fail ini sedikit rosak tetapi berjaya dibaca. Sila semak saiz dalam pratonton.';
    default: return '';
  }
}
