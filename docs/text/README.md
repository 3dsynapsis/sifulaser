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

## Perubahan yang dibuat terus dalam salinan ini

**24 Oktober 2026 - butang Simpan dan galeri "Reka bentuk saya"**, sama seperti
Plak Box, Box Maker, Rehal dan alat lain. Reka bentuk disimpan ke akaun
pengguna (Firestore `users/{uid}/designs/{id}`, `tool: 'text'`) - bila Simpan
ditekan, dan sendiri bila Export dibuka dan bila fail dimuat turun. Yang
disimpan hanya tetapannya (teks, muka taip, saiz, jarak, condong, lebar,
margin, lengkung, laju ukiran), bukan fail SVG/PDF.

Fail baharu:

- `src/cloud.js` - Firestore melalui REST, token dari `sifulaser.session`
- `src/designs.js` - dialog Simpan dan galeri (TOOL `'text'`)
- `src/saved.js` - keadaan alat <-> rekod akaun (tulen, tiada DOM)

Fail diubah:

- `index.html` - butang `#saveBtn` dan `#filesBtn` di bar atas, dialog
  `#saveDlg` dan `#filesDlg`, baris `#exportSaved` dalam dialog Export
- `src/main.js` - `galleryStore`, simpan bila Export / muat turun, buka
  `?design=<id>`
- `src/ui.js` - "Start over" memutuskan reka bentuk yang sedang dibuka
  (`ctx.startOver`), supaya simpanan seterusnya tidak menulis atasnya
- `styles.css` - gaya galeri, dan bar atas dua baris pada telefon (<= 640 px)
- `styles.css` (hujung fail) - telefon (<= 640 px) susun MENEGAK: pratonton
  di atas selebar skrin, panel tetapan menatal di bawahnya, seperti Plak Box
  dan Tray (bos, 24 Oktober 2026). Sebelum ini pratonton tinggal ~140 px
  lebar di sebelah panel.

Ujian: `node scripts/test-text-designs.mjs` (di repo laman ini).

> **Amaran:** perubahan ini wujud di sini SAHAJA. Salin fail-fail di atas
> balik ke projek sumber (`14_Text Engraver`) sebelum menjalankan "Cara kemas
> kini" sekali lagi - arahan `cp` itu menulis atas `index.html`, `styles.css`
> dan `src/`, dan semua ini akan hilang senyap.
