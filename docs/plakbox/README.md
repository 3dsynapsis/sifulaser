# Plak Box

Kotak pameran untuk plak cenderahati: plak berdiri di dalam kotak akrilik
jernih, di atas tapak. Plak itu sama ada plak bertapak sendiri (duduk dalam
poket), atau - jenis Dua Tingkat Slot - plak akrilik sekeping yang dicucuk
tegak ke dalam slot di tengah tapak. Dihidangkan terus oleh GitHub Pages di
`sifulaser.com/plakbox/`; halaman React `#/plakbox` memuatkannya dalam iframe.

Bukan salinan vendored - sumber alat ini MEMANG tinggal di sini, sama seperti
`docs/tray/`. Ubah terus.

## Dua bahagian

1. **Tapak - cetak 3D, output STL.** (Siap.) Pepejal; infill ditetapkan dalam
   Bambu Studio, bukan di sini. Ada alur keliling untuk dinding akrilik dan
   poket cetek untuk tapak plak. Dahulu tapak ini dibuat daripada MDF yang
   dipotong laser berlapis-lapis. Lima jenis, semuanya boleh dicetak TANPA
   SUPPORT (diuji: tiada segitiga menghadap ke bawah lebih landai dari 45°):

   | Jenis | Rupa | Kenapa boleh dicetak tanpa support |
   |---|---|---|
   | Standard | Blok, tingkat kecil di tepi atas | Mengecil ke atas |
   | Serong | Sisi condong, lebar di bawah; semua sisi atau depan sahaja | Mengecil ke atas |
   | Klasik | Lengkung S (ogee Rom) di tepi atas, macam tapak trofi kayu | Kedua-dua lengkung berundur ke atas |
   | Dua Tingkat | Tingkat bawah lebar (ruang plat nama), tingkat atas kecil | Mengecil ke atas |
   | Dua Tingkat Slot | Profil Dua Tingkat dengan alur kotak yang sama, tetapi slot (bukan poket) untuk plak akrilik sekeping, lalai 5 mm | Mengecil ke atas; slot tegak |

   Slot tepat di tengah tapak (kiri-kanan dan depan-belakang) dan tegak, jadi
   plak masuk lurus. Saiz = panjang plak + 2 × kelonggaran, tebal plak + 2 ×
   kelonggaran (lalai 0.25), dalam 12 mm; lantai di bawahnya sekurang-kurangnya
   3 mm. Bagi jenis ini "lebar plak" ialah ruang depan-belakang yang plak itu
   berdiri di tengahnya, jadi kotak akrilik dikira tepat seperti jenis lain.
   (Versi pertama, 16 Oktober 2026, tiada kotak dan plaknya condong; ditukar
   pada hari yang sama atas permintaan - plak mesti tegak di tengah, dalam kotak.)
2. **Kotak akrilik jernih - potong laser, output SVG.** (Siap, 18 Oktober 2026.)
   Lima keping tanpa tanggam, dicantum hujung ke hujung dan sambungannya
   ditutup selotip (tiada chloroform). Export → "Kotak akrilik" memberi fail
   SVG: keping disusun atas helaian saiz katil laser (600 × 400, 900 × 600,
   1300 × 900, atau kepingan penuh 2440 × 1220) dengan putaran 90° bila
   lebih padat, satu fail bagi setiap helaian, dan setiap garis potong
   dibesarkan separuh kerf (lalai 0.15 mm) supaya keping siap tepat saiznya.
   Lapisan Potong merah 0.1 mm; label nama keping pilihan, dalam lapisan
   kelabu sendiri (lejang satu garisan Hershey, sama seperti Tray). Jenis
   Dua Tingkat Slot juga mendapat fail berasingan untuk garis luar plak
   akrilik sekeping (tebalnya lain, helaian lain). Pratonton setiap helaian
   dalam dialog dilukis daripada susunan yang sama yang ditulis ke fail.

   **PDF dan nota bahan (19 Oktober 2026).** Setiap fail kini ada dua bentuk:
   SVG dan PDF (satu halaman sesaiz helaian, vektor, skala sebenar mm) -
   kerana tidak semua tempat boleh membuka SVG. Kedua-duanya membawa nota untuk
   pekerja yang memotong: "Acrylic 2mm Clear" (tebal ikut pilihan), helaian
   ke berapa dan saiznya, bilangan keping, kerf. Plak slot mendapat "Acrylic
   5mm - plak" (tanpa "Clear", warnanya ikut reka bentuk). Nota itu lejang satu
   garisan Hershey dalam lapisan Nota hijau sendiri (#00a651), di atas keping;
   bila tiada ruang, kanvas dipanjangkan ke atas dan nota duduk di luar katil -
   keping tidak berganjak. Nota itu sendiri berkata "jangan potong lapisan ini".

   **Akrilik 2 mm dan 3 mm sahaja (20 Oktober 2026).** Kotak hanya ditawarkan
   dalam Clear 2 mm dan 3 mm (stok Kalkulator Laser Cut). Tebal lain dalam
   simpanan lama atau URL disnap ke yang terdekat, dengan nota di senarai amaran.

## Harga (20 Oktober 2026)

Kad "Harga" di atas panel tetapan, supaya pelanggan boleh order terus melalui
WhatsApp (nombor kedai yang sama dengan Kalkulator Laser Cut). Kiraan dalam
`src/price.js`, tulen:

- **Tapak** = berat PLA anggaran x RM0.50 sesegram (Boss). Berat dikira seperti
  slicer Bambu Studio "0.20mm Standard" pada pencetak Bambu Lab: kulit penuh
  (2 dinding 0.42 + 0.45 mm, 5 lapis atas = 1.0 mm, 3 lapis bawah = 0.6 mm),
  bahagian dalam infill 10%, PLA 1.24 g/cm3. Kulit diukur daripada mesh STL
  yang sama dengan yang dimuat turun - setiap segitiga mengikut arah normalnya
  (atas / bawah / sisi). Kos filamen RM80 sekilo disimpan dalam `PRINT` untuk
  rujukan sahaja; harga jual ialah RM0.50 sesegram.
- **Kotak akrilik** = enjin Kalkulator Laser Cut, DIIMPORT dari
  `../lasercut/src/pricing.js` dan `laser.js` (tidak disalin): lima keping saiz
  siap, bahan `acr2` / `acr3` (harga helaian x 2 markup), masa potong setiap
  tepi dengan pecutan mesin (`segTime`), gerak kosong antara keping mengikut
  susunan helaian, RM3 seminit, minimum RM10. Bila harga bahan atau laju potong
  ditukar dalam kalkulator itu, Plak Box ikut sendiri.
- **Jumlah** = (tapak x kuantiti) + akrilik, dibundar 10 sen; ditunjuk sebagai
  julat -15% hingga +15% (ringgit penuh), sama seperti Kalkulator Laser Cut.
  Tidak termasuk plak. Staff mengesahkan harga muktamad.

Lalai (plak 230 x 80 x 310 mm, Standard, 3 mm): tapak +-198 g = RM99.23,
akrilik RM45.40, jumlah RM144.60 (RM122 - RM167). Akrilik 2 mm: RM132.00.

Kalau sumber Kalkulator Laser Cut (`23_Lasercut Languange Machine/quote`)
ditukar, salinan dalam `docs/lasercut` dikemas kini dahulu - Plak Box membaca
salinan itu.

## Input

Saiz LUAR plak yang dimasukkan - panjang, lebar, tinggi - TERMASUK tapak plak
itu sendiri. Kotak akrilik = plak + ruang di setiap sisi + tebal akrilik; tapak
= kotak akrilik + kelonggaran alur + bibir.

## Fail

- `src/acrylic.js` - fail potong akrilik, tulen: `boxPieces()`, `plaquePiece()`,
  `nest()` (MaxRects, best short side fit, putaran 90°), `noteLines()` dan
  `notePlace()` (nota bahan), `sheetToSvg()`, `sheetToPdf()` (penulis PDF
  kecil sendiri, ASCII, tiada fon), `acrylicFiles()`. `src/geom/label.js` dan `hershey-sans.js` disalin dari
  `docs/tray/src/geom/` untuk label.
- `src/price.js` - harga: `printGrams()` (berat tapak), `acrylicJob()` (keping
  dan masa laser untuk `quote()`), `plakQuote()`, `orderMessage()` /
  `orderUrl()` (mesej WhatsApp daripada sebut harga yang sama dengan skrin).
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
  akrilik lutsinar dengan selotip, plak sebagai kotak sempadan yang samar
  dengan plak biasa dilukis di dalamnya - papan kayu, plat emas berukir,
  gambaran sahaja (atau plak akrilik sekeping tegak dalam slot). Butang "Angkat kotak" di atas pentas
  menganimasikan kotak naik dari alur (jenis slot: plak pun keluar dari slot)
  dan turun semula - konsep yang sama dengan "Open the box" dalam Box Maker.
  Ia menggantikan tab "Akrilik diangkat".
- `src/main.js` - kad harga, panel tetapan, ringkasan, export, cara pasang.
- `vendor/` - three.js dan OrbitControls (MIT), disalin dari `docs/tray/vendor`.

## Ujian

    node scripts/test-plakbox.mjs       # mesh tertutup, isipadu, saiz akrilik muat alur, fail potong akrilik,
                                        # nota bahan (tidak menindih keping), PDF sah (offset xref, saiz halaman),
                                        # harga (berat kubus kiraan tangan, akrilik = quote() terus, julat,
                                        # kuantiti, mesej WhatsApp), akrilik 2 / 3 mm sahaja

Gambar tile `docs/images/tools/plakbox.webp` ialah foto 3D alat ini sendiri -
ambil semula dengan `node scripts/tile-shots.mjs docs/images/tools plakbox`
(lihat `docs/images/tools/README.md`).
