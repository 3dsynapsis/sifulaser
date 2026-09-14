# UV Print Calculator (salinan vendored)

Kalkulator harga **cetakan UV atas akrilik jernih**. Pelanggan pilih fail PDF
atau Adobe Illustrator `.ai`; alat ini mencari garisan potong (warna spot
`CutContour`, layer bernama "cut", atau bentuk tertutup paling luar), melukis
pratonton dengan garisan potong merah, dan mengira harga ikut kaki persegi
untuk akrilik 2 / 3 / 5 mm. Sebut harga dihantar ke WhatsApp kedai.

Fail pelanggan **tidak dimuat naik ke mana-mana**. Ia dibaca dalam pelayar oleh
pembaca PDF kecil yang ditulis khas untuk alat ini (`src/pdf/`), di dalam Web
Worker dari halaman yang sama.

Ia **bukan** sebahagian daripada build Vite — fail di sini dihidangkan terus
oleh GitHub Pages di `sifulaser.com/uvprint/`, dan halaman React `#/uvprint`
memuatkannya dalam iframe. Corak sama seperti `docs/converter/` dan
`docs/rehal/`.

## Sumber asal

`CLAUDE CODE/26_UV Print Calculator` — vanilla ES modules, tiada build step,
tiada dependency. `npm test` di sana menjalankan lima suite (harga, fixture,
pembaca PDF, mesej WhatsApp, antara muka) dan `npm run mutate` membuktikan
setiap ujian boleh gagal.

README penuh alat itu (peraturan garisan potong, cara harga dibundarkan, apa
yang dipilih bila laporan kajian bercanggah) tinggal di sumber, bukan di sini.
Fail ini hanya bercakap tentang salinan vendored.

## Cara kemas kini

```bash
node scripts/vendor-uvprint.mjs
```

Skrip itu menyalin `index.html`, `styles.css` dan `src/`, menukar akhiran baris
kepada CRLF (fail di `docs/` berakhiran CRLF, sumbernya LF), dan menyimpan
README ini. Kalau mahu buat dengan tangan:

```bash
SRC="../26_UV Print Calculator"
cp "$SRC/index.html" "$SRC/styles.css" docs/uvprint/
rm -rf docs/uvprint/src && cp -r "$SRC/src" docs/uvprint/
```

Yang **tidak** disalin: `package.json`, `tools/` (ujian, fixture, pelayan dev),
`.claude/`, dan `README.md` ini. Tiga yang pertama tiada gunanya kepada
pelayar; yang keempat ialah nota tentang salinan vendored, jadi menyalin README
sumber di atasnya akan memadamkannya.

## Dua tag yang tinggal di `index.html` SUMBER

Beacon Cloudflare Web Analytics dan `<script src="/shared/export-gate.js">`
berada dalam `26_UV Print Calculator/index.html`, bukan hanya di sini.
Vendoring ialah salinan, jadi tag yang hidup hanya dalam `docs/` akan terpadam
senyap pada kemas kini berikutnya.

## Tiada `exportBtn` — dengan sengaja

Setiap alat lain membawa `id="exportBtn"` supaya gate meminta pelanggan log
masuk sebelum muat turun. Alat ini **tiada muat turun**. Satu-satunya jalan
keluar ialah pautan sebut harga WhatsApp (`id="waBtn"`), dan pelanggan yang
bertanya harga tidak boleh disuruh log masuk dahulu. Jadi `exportBtn` tidak
wujud langsung di sini, dan gate itu tidak berbuat apa-apa.

`scripts/vendor-uvprint.mjs` gagal kalau `exportBtn` muncul dalam `index.html`
atau `src/`, dan `tools/test-ui.js` di sumber memeriksa perkara yang sama.

## Gambar tile

`docs/images/tools/uvprint.svg` dijana oleh `scripts/thumb-uvprint.mjs`
daripada kod vendored di sini dan fixture `a-cutcontour-objstm.pdf` di sumber:
garisan potong, artwork dan harga semuanya keluar dari `analyseFile()` dan
`quote()` yang sama yang dijalankan pelayar. Jana semula dengan:

    node scripts/thumb-uvprint.mjs
