# Kalkulator Laser Cut (salinan vendored)

Kalkulator anggaran harga **laser cut dan ukiran**. Pelanggan pilih fail PDF,
Adobe Illustrator `.ai`, DXF, atau gambar PNG/JPG (dijejak jadi vektor ikut
warna), pilih bahan, saiz dan kuantiti, dan terus nampak julat harga. Setiap
warna ialah satu layer yang fungsinya boleh ditukar (Potong, Ukir, Garisan
halus, Abaikan). Sebut harga dihantar ke WhatsApp kedai untuk disahkan staff.
DWG belum boleh dibaca (format tertutup) - pelanggan diminta Save As DXF.

Cara harga dikira:

- **Bahan**: luas kotak setiap kepingan x harga sekeping papan 4 x 3 kaki,
  markup 100%.
- **Masa laser**: panjang garisan potong, garisan halus (biru) dan ukiran
  raster (0.1 mm antara baris), dikira dengan pecutan mesin, x RM3 seminit.
- Caj minimum RM10. Julat yang ditunjuk ialah -15% hingga +15%.

Fail pelanggan **tidak dimuat naik ke mana-mana**. Ia dibaca dalam pelayar oleh
pembaca PDF yang sama dengan UV Print Calculator (`src/pdf/`), pembaca DXF
Converter File (`src/conv/`) dan enjin Sifu Vector (`src/raster/`), di dalam
Web Worker dari halaman yang sama.

Ia **bukan** sebahagian daripada build Vite. Fail di sini dihidangkan terus
oleh GitHub Pages di `sifulaser.com/lasercut/`, dan halaman React `#/lasercut`
memuatkannya dalam iframe, sama seperti `docs/uvprint/`. Ia belum ada tile di
halaman utama (lihat komen dalam `src/data/tools.ts`), tetapi boleh dicari.

## Sumber asal

`CLAUDE CODE/23_Lasercut Languange Machine/quote`: vanilla ES modules, tiada
build step, tiada dependency. `npm test` di sana menjalankan ujian laser
(potong, ukir, harga, WhatsApp) dan ujian pembaca PDF.

Harga bahan, kelajuan potong dan kadar seminit ada dalam `src/pricing.js` di
sumber.

## Cara kemas kini

Jangan edit fail di sini. Edit di sumber, jalankan `npm test` di sana, kemudian:

```
node scripts/vendor-lasercut.mjs
```
