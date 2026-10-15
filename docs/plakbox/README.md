# Plak Box

Kotak pameran untuk plak cenderahati: plak berdiri di dalam kotak akrilik
jernih, di atas tapak. Dihidangkan terus oleh GitHub Pages di
`sifulaser.com/plakbox/`; halaman React `#/plakbox` memuatkannya dalam iframe.

Bukan salinan vendored - sumber alat ini MEMANG tinggal di sini, sama seperti
`docs/tray/`. Ubah terus.

## Dua bahagian

1. **Tapak - cetak 3D, output STL.** (Siap.) Satu jasad pepejal; infill
   ditetapkan dalam Bambu Studio, bukan di sini. Ada alur keliling untuk
   dinding akrilik, poket cetek untuk tapak plak, dan tepi bertingkat pilihan.
   Dahulu tapak ini dibuat daripada MDF yang dipotong laser berlapis-lapis.
2. **Kotak akrilik jernih - potong laser, output SVG.** (Bahagian 2, belum.)
   Lima keping tanpa tanggam, dicantum hujung ke hujung dan sambungannya
   ditutup selotip (tiada chloroform). Saiz setiap keping sudah dikira dan
   dipaparkan dalam panel "Kotak akrilik".

## Input

Saiz LUAR plak yang dimasukkan - panjang, lebar, tinggi - TERMASUK tapak plak
itu sendiri. Kotak akrilik = plak + ruang di setiap sisi + tebal akrilik; tapak
= kotak akrilik + kelonggaran alur + bibir.

## Fail

- `src/geom/base.js` - geometri tulen (tiada DOM): `buildPlakBox()`,
  `heightfieldMesh()`, `trianglesToStl()`. Tapak ialah medan tinggi atas grid
  segi empat tak seragam, jadi mesh tertutup tepat tanpa CSG.
- `src/view3d.js` - pratonton three.js: tapak (segitiga yang sama dengan STL),
  akrilik lutsinar dengan selotip, plak sebagai kotak sempadan.
- `src/main.js` - panel tetapan, ringkasan, export, cara pasang.
- `vendor/` - three.js dan OrbitControls (MIT), disalin dari `docs/tray/vendor`.

## Ujian

    node scripts/test-plakbox.mjs       # mesh tertutup, isipadu, saiz akrilik muat alur
    node scripts/thumb-plakbox.mjs      # jana semula docs/images/tools/plakbox.svg
