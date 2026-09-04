# Gambar tile untuk halaman utama

Lapan gambar, satu bagi setiap alat yang menghasilkan sesuatu. Enam alat lain
(Simulator, Maintenance, Troubleshooting, Template Adjuster, Blog, About) tidak
menghasilkan apa-apa untuk digambarkan dan memakai ikon lucide, bukan gambar.

Semuanya dilukis pada nisbah 96 x 64 (3:2) di atas latar lutsinar, supaya warna
well tile menembusi dan kelapan-lapannya terbaca sebagai satu set.

## Lima yang dijana - tidak boleh jadi basi

| Fail | Dijana oleh |
|---|---|
| `puzzle.svg` | `13_Puzzle Generator/tools/thumb.mjs` |
| `text.svg` | `14_Text Engraver/tools/thumb.mjs` |
| `qr.svg` | `16_QR Generator/tools/thumb.mjs` |
| `topper.svg` | `18_Cake Topper/tools/thumb.mjs` |
| `keychain.svg` | `21_Keychain Generator/tools/thumb.mjs` |

Setiap satu memanggil `build*()` alat itu sendiri dan menulis semula gambar
daripada geometri sebenar. Jalankan semula bila-bila masa:

    node tools/thumb.mjs "<...>/7_SifuLaser/docs/images/tools/<nama>.svg"

Kalau alat berubah, gambar berubah sekali. Itulah sebabnya lima ini dijana dan
bukan difoto.

## Tiga yang difoto - BOLEH jadi basi, dan tiada apa-apa akan memberitahu

`boxmaker.webp`, `stand.webp`, `tag.webp`.

Ketiga-tiganya ialah pemandangan 3D sebenar, kerana produknya ialah pemasangan:
kotak memang 3D, muka stand menembusi slot tapaknya, dan tag dilekat dua muka.
Fail rata bagi ketiga-tiganya hanyalah sheet potongan - iaitu gambar salah yang
memulakan kerja ini.

Harganya: **tiada apa-apa dalam repo ini yang dapat mengesan gambar yang sudah
basi.** Almari Laci ditambah ke Box Maker pada hari gambar ini diambil; kalau
gambar diambil sehari sebelum itu, ia sudah salah dan tiada apa-apa yang akan
berkata demikian. Ini tidak boleh diselesaikan, hanya boleh dicatat.

**Diambil: 4 September 2026.** Ambil semula selepas apa-apa perubahan rupa pada
ketiga-tiga alat itu:

    # mulakan pelayan alat dahulu (preview_start: box-maker, stand, tag-generator)
    node scripts/tile-shots.mjs docs/images/tools
    # atau satu sahaja:
    node scripts/tile-shots.mjs docs/images/tools boxmaker

`scripts/tile-shots.mjs` sudah memegang keseluruhan resipi dan menguatkuasakannya
sendiri: localStorage dikosongkan (kalau tidak, ia memotret sesi terakhir sesiapa
pun, yang memang berlaku semasa skrip ini ditulis), backdrop kekal `light`, anak
panah ukuran dan kawalan pentas disembunyikan, dan potongan diukur daripada
saluran alpha supaya produk memenuhi bingkai. Box Maker sengaja ditetapkan ke
gaya **Almari Laci**, bukan `open` yang lalai - dulang terbuka pada 116 px
hanyalah segi empat yang samar.
