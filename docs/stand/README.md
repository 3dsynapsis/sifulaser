# Stand Maker (salinan vendored)

Penjana **stand nama meja** untuk laser: satu muka tegak yang membawa nama, dan
satu tapak berlapis dengan slot untuk muka itu berdiri. Ia **bukan** sebahagian
daripada build Vite — fail di sini dihidangkan terus oleh GitHub Pages di
`sifulaser.com/stand/`, dan halaman React `#/stand` memuatkannya dalam iframe.
Corak sama seperti `docs/boxmaker/`, `docs/puzzle/` dan `docs/text/`.

## Sumber asal

Projek asal: `CLAUDE CODE/15_Stand Nama` (vanilla ES modules, tiada build step).
Di sana ada ujian (`npm test`, 207 assertion) dan penukar fon
(`npm run faces` → `tools/build-faces.mjs`).

## Cara kemas kini

```bash
SRC="../15_Stand Nama"
cp "$SRC/index.html" "$SRC/styles.css" docs/stand/
rm -rf docs/stand/src && cp -r "$SRC/src" docs/stand/
```

## Fon

25 fon dalam `src/font/`, lima setiap kategori (Block, Serif, Kursif, Papar)
ditambah lima fon satu garisan Hershey.

- **CC0 / domain awam** — dari perpustakaan awam Typodermic (Ray Larabie).
- **SIL Open Font License 1.1** — dari Google Fonts.
- **Hershey** — domain awam; pengiktirafan dalam `src/font/CREDITS.txt`.

`src/font/LICENCES.txt` menyenaraikan setiap fon dengan lesen dan sumbernya.
**Jangan buang fail itu** — OFL mensyaratkan lesen mesti mengikut data fon.
Hasil potongan pengguna pula bebas sepenuhnya, tiada syarat.

## Yang membezakan ia daripada tiga alat lain

- Dua gaya: **Plate** (ukir) dan **Cut-out** (huruf itu sendiri jadi bentuk)
- Saiz Small / Medium / Large — huruf diselesaikan untuk muat, bukan sebaliknya
- Mengira **berapa cebisan** hasil potongan itu, dan menyambung yang terapung
  (contoh: titik pada huruf i) dengan jambatan nipis
- Mengukur **ketebalan huruf sebenar** dan memberi amaran bila terlalu halus
  untuk dipotong
