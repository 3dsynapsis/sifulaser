# Text Engraver (salinan vendored)

Aplikasi statik untuk menjana teks **satu garisan** (single-stroke) bagi laser,
plotter dan pemotong vinil. Ia **bukan** sebahagian daripada build Vite — fail
di sini dihidangkan terus oleh GitHub Pages di `sifulaser.com/text/`, dan
halaman React `#/text` memuatkannya dalam iframe. Corak sama seperti
`docs/boxmaker/` dan `docs/puzzle/`.

## Sumber asal

Projek asal: `CLAUDE CODE/14_Text Engraver` (vanilla ES modules, tiada build
step). Di sana ada ujian (`npm test`) dan penukar fon
(`tools/convert-jhf.mjs`).

## Cara kemas kini

```bash
SRC="../14_Text Engraver"
cp "$SRC/index.html" "$SRC/styles.css" docs/text/
cp -r "$SRC/src" docs/text/
```

## Fon

Data fon dalam `src/font/` diterbitkan daripada **Hershey Fonts** (domain awam,
bebas untuk kegunaan komersial). Pengiktirafan wajib ada dalam
`src/font/CREDITS.txt` — jangan buang fail itu, ia sebahagian daripada syarat
penggunaan.

Kita **tidak** menyalin fon dari templatemaker.nl. Sebahagian fon di sana
digunakan dengan kebenaran khusus kepada mereka, bukan kepada kita.

## Yang kita tambah berbanding rujukan

- Saiz dalam **milimeter sebenar** (tinggi huruf besar), bukan unit SVG
- **Download PDF** selain SVG
- Berbilang baris dengan penjajaran kiri/tengah/kanan
- Jarak huruf, perkataan dan baris
- Anggaran jarak perjalanan kepala dan masa mengukir
