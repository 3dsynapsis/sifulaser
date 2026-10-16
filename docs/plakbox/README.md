# Plak Box

Kotak pameran untuk plak cenderahati: plak berdiri di dalam kotak akrilik
jernih, di atas tapak. Dihidangkan terus oleh GitHub Pages di
`sifulaser.com/plakbox/`; halaman React `#/plakbox` memuatkannya dalam iframe.

Bukan salinan vendored - sumber alat ini MEMANG tinggal di sini, sama seperti
`docs/tray/`. Ubah terus.

## Dua bahagian

1. **Tapak - cetak 3D, output STL.** (Siap.) Pepejal; infill ditetapkan dalam
   Bambu Studio, bukan di sini. Ada alur keliling untuk dinding akrilik dan
   poket cetek untuk tapak plak. Dahulu tapak ini dibuat daripada MDF yang
   dipotong laser berlapis-lapis. Empat jenis, semuanya boleh dicetak TANPA
   SUPPORT (diuji: tiada segitiga menghadap ke bawah lebih landai dari 45°):

   | Jenis | Rupa | Kenapa boleh dicetak tanpa support |
   |---|---|---|
   | Standard | Blok, tingkat kecil di tepi atas | Mengecil ke atas |
   | Serong | Sisi condong, lebar di bawah; semua sisi atau depan sahaja | Mengecil ke atas |
   | Klasik | Lengkung S (ogee Rom) di tepi atas, macam tapak trofi kayu | Kedua-dua lengkung berundur ke atas |
   | Dua Tingkat | Tingkat bawah lebar (ruang plat nama), tingkat atas kecil | Mengecil ke atas |
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
  `profileOf()`, `buildBody()`, `trianglesToStl()`. Jasad = permukaan atas
  (medan tinggi atas grid segi empat tak seragam: alur, poket) + kulit sisi
  (satu cincin bagi setiap titik PROFIL tepi, dengan titik bahagi yang sama
  dengan grid atas) + muka bawah (grid yang sama). Jenis tapak hanya profil
  yang berbeza. Mesh tertutup tepat tanpa CSG.
- `bibir` (rim) diukur dari tepi PERMUKAAN ATAS; profil terkeluar di luar itu
  (Standard, Serong, Klasik, Dua Tingkat). Jenis "Terapung" (kaki tersorok)
  dibuang pada 16 Oktober 2026 kerana tidak stabil untuk kotak yang tinggi.
- `src/view3d.js` - pratonton three.js: tapak (segitiga yang sama dengan STL),
  akrilik lutsinar dengan selotip, plak sebagai kotak sempadan.
- `src/main.js` - panel tetapan, ringkasan, export, cara pasang.
- `vendor/` - three.js dan OrbitControls (MIT), disalin dari `docs/tray/vendor`.

## Ujian

    node scripts/test-plakbox.mjs       # mesh tertutup, isipadu, saiz akrilik muat alur
    node scripts/thumb-plakbox.mjs      # jana semula docs/images/tools/plakbox.svg
