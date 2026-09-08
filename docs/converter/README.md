# Converter File (salinan vendored)

Menukar **format** fail vektor dan tidak menukar apa-apa lagi. SVG dan DXF
masuk; SVG, PDF atau DXF keluar. Ia **bukan** sebahagian daripada build Vite —
dihidangkan terus oleh GitHub Pages di `sifulaser.com/converter/`, dan halaman
React `#/converter` memuatkannya dalam iframe.

## Sumber asal

`CLAUDE CODE/23_File Converter` — vanilla ES modules, tiada build step.
`npm test` di sana: 291 assertion untuk teras penukaran, 21 lagi untuk
keputusan yang dibuat oleh antara muka. Kedua-duanya tanpa framework dan tanpa
dependency.

> Nombor folder `23_` berulang: `23_Lasercut Languange Machine` sudah wujud dan
> `24_` pun sudah diambil. Arahan asal diikut seadanya dan bukan dinomborkan
> semula secara senyap. `25_` masih kosong kalau ia patut dipindahkan.

## Cara kemas kini

```bash
SRC="../23_File Converter"
cp "$SRC/index.html" "$SRC/styles.css" docs/converter/
rm -rf docs/converter/src && cp -r "$SRC/src" docs/converter/
```

## Kenapa ia bukan Template Adjuster

Kepada orang luar dua alat ini nampak sama. Perbezaannya ialah keseluruhan
tujuan masing-masing, jadi kedua-dua UI menyebutnya sendiri:

- **Template Adjuster** MENGUBAH lukisan — saiz dan tebal garisan.
- **Converter File** menukar BEKASNYA. Saiz, bentuk, kedudukan mutlak,
  lengkung, keadaan buka/tutup, nama lapisan dan warna semuanya keluar seperti
  ia masuk.

## Peraturan unit, iaitu sebab alat ini berbentuk begini

Penukar yang yakin mencetak "20 cm x 15 cm" untuk lukisan yang dibuat dalam inci
menyebabkan seseorang memotong papan pada saiz yang salah. Jadi hanya ada dua
jawapan yang dibenarkan: nombor yang fail itu sendiri nyatakan, dan *"saya tak
tahu, beritahu saya."*

`src/units.js` memulangkan `mmPerUnit` **null** apabila unit tidak diketahui —
bukan 1, bukan 25.4/96, bukan apa-apa yang munasabah. Itulah penguatkuasaannya:
tiada nombor untuk jatuh kepadanya, jadi kod yang terlepas pemeriksaan
menghasilkan `NaN` dan bukan ukuran salah yang meyakinkan.

Bila pengguna menjawab soalan unit, jawapan itu dilabel di **empat** tempat:
dalam blok Maklumat Fail, di sebelah butang Tukar, dalam ayat berjaya, dan
**di dalam fail yang dimuat turun** — komen `<!-- ... -->` untuk SVG, rekod
`999` untuk DXF. Yang terakhir itu yang penting enam bulan kemudian, apabila
fail itu sudah di-email kepada orang ketiga.

## Yang belum disahkan

Fail DXF yang ditulis oleh alat ini **belum pernah dibuka dalam LightBurn atau
AutoCAD** — tiada perisian itu di tempat ia dibina. Ia ditulis mengikut
spesifikasi AC1015 dan boleh dibaca semula oleh pembaca alat ini sendiri.
Sila import satu fail dan sahkan saiz serta orientasinya sebelum guna untuk
kerja sebenar.

`src/importSvg.js` memerlukan `getCTM()` dan tidak boleh diuji di node, jadi
pengiraan `<text>`/`<image>`/`<use>` yang digugurkan disemak dengan tangan
dalam pelayar, bukan oleh suite.
