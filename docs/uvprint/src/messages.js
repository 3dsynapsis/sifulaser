// Every sentence a customer can see about their file, in one place, in Bahasa
// Melayu. Short and direct: what happened, and what to do about it.
//
// Three strings are the spec's own words and are tested character for
// character: the oversize message, the minimum-charge note and the disclaimer.

export const OVERSIZE = 'Saiz melebihi bed mesin 90 x 60 cm - hubungi kami untuk sebut harga';
export const MIN_NOTE = 'Harga minimum RM20 dikenakan';
export const DISCLAIMER = 'Harga anggaran. Harga akhir disahkan selepas semakan fail.';
export const ATTACH_NOTE = 'Sila lampirkan fail anda dalam WhatsApp selepas mesej dibuka.';

export const ERRORS = {
  'empty': 'Fail ini kosong (0 KB). Sila semak fail dan cuba lagi.',
  'too-large': 'Fail terlalu besar (maksimum 50 MB). Hantar fail melalui WhatsApp untuk sebut harga.',
  'ai-not-pdf-compatible': "Fail .ai ini tak dapat dibaca. Buka dalam Illustrator > File > Save As, tandakan 'Create PDF Compatible File', kemudian muat naik semula.",
  'image-file': 'Fail ini bukan PDF atau AI (nampaknya fail gambar). Sila hantar fail vektor PDF atau AI.',
  'not-pdf': 'Fail ini bukan PDF atau AI. Sila hantar fail vektor PDF atau AI.',
  'encrypted-password': 'Fail PDF ini dilindungi kata laluan. Sila buang kata laluan dan muat naik semula.',
  'encrypted-unsupported': 'Fail ini ada tetapan keselamatan yang kami tak dapat baca. Sila simpan semula tanpa security dan muat naik semula.',
  'corrupt': 'Fail ini rosak atau tidak lengkap. Cuba simpan semula dan muat naik.',
  'raster-only': 'Fail ini hanya ada gambar, tiada garisan potong vektor. Sila lukis outline potong dalam Illustrator.',
  'no-closed-path': 'Garisan potong tidak dijumpai di halaman 1. Pastikan outline anda bentuk tertutup (closed path).',
  'cut-overlap': 'Ada garisan potong yang bertindih. Sila betulkan supaya setiap bentuk tidak bersilang.',
  'too-complex': 'Fail ini terlalu kompleks untuk dikira di telefon. Hantar melalui WhatsApp untuk sebut harga.',
  'oversize': OVERSIZE,
  'qty-invalid': 'Masukkan kuantiti nombor bulat, sekurang-kurangnya 1.',

  'read-failed': 'Fail tak dapat dibuka oleh pelayar ini. Cuba pilih fail sekali lagi.',
};

/** Errors where the customer should still be able to WhatsApp us the file. */
export const WHATSAPP_ON_ERROR = new Set(['too-large', 'too-complex', 'oversize']);

export const errorText = (code) => ERRORS[code] || ERRORS.corrupt;

const RULE_WORD = { a: 'CutContour', b: 'Cut' };

/** "Garisan potong dikesan melalui: ..." - always shown with a result. */
export function ruleText(rule, names = []) {
  const shown = names.slice(0, 3).map((n) => `'${n}'`).join(', ');
  if (rule === 'a') return `Garisan potong dikesan melalui: warna spot ${shown || `'${RULE_WORD.a}'`}`;
  if (rule === 'b') return `Garisan potong dikesan melalui: lapisan ${shown || `'${RULE_WORD.b}'`}`;
  if (rule === 'c') return 'Garisan potong dikesan melalui: outline paling luar';
  return '';
}

export function warningText(w) {
  switch (w.code) {
    case 'multi-page': return `Fail ini ada ${w.pages} halaman. Hanya halaman 1 dikira.`;
    case 'live-text': return 'Ada teks yang belum ditukar ke outline. Teks tidak dikira sebagai garisan potong (Type > Create Outlines).';
    case 'live-text-cut-colour': return 'Ada teks berwarna garisan potong yang belum ditukar ke outline. Teks tidak dikira sebagai garisan potong (Type > Create Outlines).';
    case 'outside-cut': return 'Ada bentuk di luar garisan potong yang tidak dikira. Sila semak pratonton.';
    case 'fallback-outline': return 'Tiada CutContour dijumpai - kami guna outline paling luar. Sila pastikan saiz dalam pratonton betul.';
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
