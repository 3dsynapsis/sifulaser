# Gambar tile untuk halaman utama

Tiga belas gambar, satu bagi setiap alat yang menghasilkan sesuatu. Tujuh alat lain
(Simulator, Maintenance, Troubleshooting, Template Adjuster, Converter File,
Blog, About) tidak menghasilkan apa-apa untuk digambarkan dan memakai ikon
lucide, bukan gambar.

Converter File tiada gambar atas sebab yang sama seperti Template Adjuster: ia
menukar bekas fail dan tidak menghasilkan bentuk sendiri, jadi apa-apa gambar
untuknya sebenarnya gambar lukisan orang lain.

UV Print Calculator juga membaca fail orang lain, tetapi ia MENGHASILKAN
sesuatu yang boleh digambarkan: pratonton garisan potong dan harga. Gambarnya
ialah apa yang kalkulator itu sendiri tunjukkan untuk satu fixture sebenar,
bukan lukisan pelanggan yang direka-reka.

Semuanya dilukis pada nisbah 96 x 64 (3:2) di atas latar lutsinar, supaya warna
well tile menembusi dan kesemua tiga belas terbaca sebagai satu set.

## Enam yang dijana - tidak boleh jadi basi

| Fail | Dijana oleh |
|---|---|
| `puzzle.svg` | `13_Puzzle Generator/tools/thumb.mjs` |
| `text.svg` | `14_Text Engraver/tools/thumb.mjs` |
| `qr.svg` | `16_QR Generator/tools/thumb.mjs` |
| `keychain.svg` | `21_Keychain Generator/tools/thumb.mjs` |
| `uvprint.svg` | `7_SifuLaser/scripts/thumb-uvprint.mjs` |
| `lasercut.svg` | `7_SifuLaser/scripts/thumb-lasercut.mjs` |

Setiap satu memanggil `build*()` alat itu sendiri dan menulis semula gambar
daripada geometri sebenar. Jalankan semula bila-bila masa:

    node tools/thumb.mjs "<...>/7_SifuLaser/docs/images/tools/<nama>.svg"

Kalau alat berubah, gambar berubah sekali. Itulah sebabnya enam ini dijana dan
bukan difoto.

`lasercut.svg` dijana dengan cara yang sama seperti `uvprint.svg` di bawah:
`scripts/thumb-lasercut.mjs` mengimport salinan VENDORED di
`docs/lasercut/src` (`analyseFile()` dan `quote()`), membaca fail contoh
`plaque-200x120.pdf` dari `23_Lasercut Languange Machine/quote/tools/samples/`,
dan melukis papan plywood, ukiran, garisan halus biru, garisan potong merah
dan julat harga satu set plywood 3 mm. Jalankan semula selepas
`node scripts/vendor-lasercut.mjs`:

    node scripts/thumb-lasercut.mjs

`uvprint.svg` ialah yang pertama penjananya tinggal dalam repo ini
sementara ALATNYA tinggal di luar. Ia mengimport salinan VENDORED di `docs/uvprint/src`
(`analyseFile()` dan `quote()`), membaca fixture `a-cutcontour-objstm.pdf` dari
`26_UV Print Calculator/tools/fixtures/`, dan melukis artwork kelabu, garisan
potong merah dan jumlah harga 10 set akrilik 3 mm - jadi gambar itu dibuat oleh
kod yang sama yang dihidangkan sifulaser.com. Jalankan semula selepas
`node scripts/vendor-uvprint.mjs`:

    node scripts/thumb-uvprint.mjs

## Tujuh yang difoto - BOLEH jadi basi, dan tiada apa-apa akan memberitahu

`boxmaker.webp`, `stand.webp`, `tag.webp`, `rehal.webp`, `topper.webp`,
`tray.webp`, `plakbox.webp`.

Rehal, Cake Topper, Tray Organizer dan Plak Box dahulu dijana (`*.svg`). Pada
17 Oktober 2026 bos meminta keempat-empatnya ditukar kepada foto 3D "seperti
Box Maker dan Stand Nama" - gambar rata itu kelihatan seperti lukisan di
sebelah tile yang lain. Kesemuanya ditembak daripada salinan dalam `docs/`
(bukan pelayan dev alat): Rehal tanpa Quran lutsinar (pada 128 px ia hanya
kabus atas corak), Topper dalam Mirror gold, Tray dan Plak Box pada tetapan
lalai. Penjana SVG lama (`thumb.mjs` dalam projek asal Rehal/Topper,
`scripts/thumb-tray.mjs` dan `scripts/thumb-plakbox.mjs` di sini) tidak lagi
dipakai; dua yang di sini sudah dibuang.

Plak Box: plak dalam pratonton 3D dahulu hanya kotak sempadan kosong, yang
dalam foto terbaca sebagai papan kosong dalam kotak. Kini `docs/plakbox`
melukis plak biasa di dalam kotak sempadan itu (papan kayu atas blok, plat emas
berukir) - gambaran sahaja, saiznya tetap saiz yang diisi pengguna.

Ketiga-tiganya ialah pemandangan 3D sebenar, kerana produknya ialah pemasangan:
kotak memang 3D, muka stand menembusi slot tapaknya, dan tag dilekat dua muka.
Fail rata bagi ketiga-tiganya hanyalah sheet potongan - iaitu gambar salah yang
memulakan kerja ini.

Harganya: **tiada apa-apa dalam repo ini yang dapat mengesan gambar yang sudah
basi.** Almari Laci ditambah ke Box Maker pada hari gambar ini diambil; kalau
gambar diambil sehari sebelum itu, ia sudah salah dan tiada apa-apa yang akan
berkata demikian. Ini tidak boleh diselesaikan, hanya boleh dicatat.

**Diambil: 4 September 2026** (Box Maker, Stand, Tag) dan **17 Oktober 2026**
(Rehal, Topper, Tray, Plak Box). Ambil semula selepas apa-apa perubahan rupa pada alat itu:

    # mulakan pelayan alat dahulu (preview_start: box-maker, stand, tag-generator)
    # dan docs/ untuk Rehal, Topper, Tray, Plak Box: cd docs && python3 -m http.server 8765
    node scripts/tile-shots.mjs docs/images/tools
    # atau satu sahaja:
    node scripts/tile-shots.mjs docs/images/tools boxmaker

Di container Claude Code (Linux, tiada Chrome Windows) skrip memakai
`/opt/pw-browsers/chromium` dengan WebGL SwiftShader; `TILE_BASE` menembak
kesemuanya dari docs/.

`scripts/tile-shots.mjs` sudah memegang keseluruhan resipi dan menguatkuasakannya
sendiri: localStorage dikosongkan (kalau tidak, ia memotret sesi terakhir sesiapa
pun, yang memang berlaku semasa skrip ini ditulis), backdrop kekal `light`, anak
panah ukuran dan kawalan pentas disembunyikan, dan potongan diukur daripada
saluran alpha supaya produk memenuhi bingkai. Box Maker sengaja ditetapkan ke
gaya **Almari Laci**, bukan `open` yang lalai - dulang terbuka pada 116 px
hanyalah segi empat yang samar.
