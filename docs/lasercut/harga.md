# Harga Laser Cut - SifuLaser by Mahligai Seni

Panduan harga laser cut dan ukiran (engrave), ditulis supaya manusia **dan AI** boleh mengira harga sendiri. Dijana terus daripada kod [Kalkulator Laser Cut](https://sifulaser.com/lasercut/), jadi angka di sini sama dengan kalkulator. Kemas kini: 2026-10-09. Mata wang: Ringgit Malaysia (RM).

Data yang sama dalam format JSON: [pricing.json](https://sifulaser.com/lasercut/pricing.json)

## Ringkasan

```
Harga satu set = Kos bahan + Kos masa laser
  Kos bahan      = luas kotak setiap kepingan (kaki persegi) x kadar bahan
  Kos masa laser = minit masa mesin x RM3
Jumlah          = harga satu set x kuantiti, dibundar ke 10 sen
Caj minimum     = RM10 setiap pesanan
Dipaparkan      = julat -15% hingga +15% (ringgit penuh)
```

- Luas bahan ialah **lebar x tinggi kotak** setiap kepingan, bukan luas bentuk sebenar. 1 kaki persegi = 929.0304 cm persegi.
- Saiz maksimum sekeping: 120 x 90 cm (sekeping papan 4 x 3 kaki). Lebih besar: hubungi kami.
- Harga anggaran. Harga muktamad disahkan oleh staff selepas semakan fail.

## Kadar bahan

| Bahan | Tebal | Kadar bahan (RM sekaki persegi) | RM setiap 10 x 10 cm | Kelajuan potong (mm/s) |
|---|---|---|---|---|
| Plywood | 3 mm | 5.00 | 0.54 | 15 |
| Plywood | 5 mm | 5.00 | 0.54 | 8 |
| MDF | 3 mm | 5.00 | 0.54 | 14 |
| MDF | 5 mm | 6.67 | 0.72 | 6 |
| Akrilik Clear | 2 mm | 8.33 | 0.90 | 20 |
| Akrilik Clear | 3 mm | 11.67 | 1.26 | 18 |
| Akrilik Clear | 5 mm | 13.33 | 1.44 | 10 |
| Akrilik Hitam | 2 mm | 8.33 | 0.90 | 20 |
| Akrilik Hitam | 3 mm | 11.67 | 1.26 | 18 |
| Cermin Emas | 1.5 mm | 13.33 | 1.44 | 20 |
| Cermin Perak | 1.5 mm | 13.33 | 1.44 | 20 |

Kelajuan potong yang lebih perlahan (bahan tebal) bermakna masa laser lebih lama, jadi kos masa lebih tinggi.

## Masa mesin

Kos masa ialah **RM3 seminit** masa mesin. Masa mesin terdiri daripada:

| Kerja | Cara mesin bekerja | Anggaran ringkas (saat) |
|---|---|---|
| Potong | garisan dilalui sekali pada kelajuan potong bahan | panjang potong (mm) / kelajuan potong |
| Garisan halus (score) | garisan dilalui pada 100 mm/s | panjang garisan (mm) / 100 |
| Ukir (engrave) | raster: baris setiap 0.1 mm, 200 mm/s, setiap baris disapu dari tanda pertama ke tanda terakhir | (tinggi ukiran mm / 0.1) x (lebar ukiran mm / 200 + 0.062) |
| Gerak kosong | antara garisan, 300 mm/s | biasanya beberapa saat sahaja, boleh diabaikan |

Ukiran biasanya bahagian paling mahal: tulisan setinggi 3 cm ialah 300 baris. Kawasan ukiran yang lebar dan tinggi menambah masa dengan cepat.

**Blok ukiran pada baris yang sama dikira sebagai satu kawasan**, selebar dari blok paling kiri hingga blok paling kanan, kerana kepala laser menyapu seluruh baris itu. Contohnya 5 keychain sebaris dengan ukiran 3 cm setiap satu, berjarak 6 cm, ialah satu kawasan ukiran 27 cm lebar, bukan 5 x 3 cm.

Kalkulator mengira masa dengan tepat dari fail (termasuk pecutan mesin di setiap bucu dan hujung baris). Anggaran ringkas di atas sesuai bila tiada fail, dan biasanya dalam lingkungan 15% daripada kalkulator.

## Langkah mengira harga (tanpa fail)

1. Tentukan **kotak setiap kepingan** (lebar x tinggi, mm). Luas kaki persegi = lebar x tinggi / 92 903.
2. **Kos bahan** = luas kaki persegi x kadar bahan.
3. Anggar **panjang potong** (perimeter bentuk luar + semua lubang dan potongan dalam), **garisan halus**, dan **kawasan ukiran** (lebar x tinggi setiap blok tulisan atau gambar; blok yang sebaris digabung dari kiri ke kanan).
4. **Masa** (saat) = potong / kelajuan + garisan halus / 100 + jumlah ukiran (formula di atas).
5. **Kos masa** = masa / 60 x RM3.
6. **Jumlah** = (kos bahan + kos masa) x kuantiti, bundar ke 10 sen, minimum RM10.
7. **Julat** untuk pelanggan: jumlah x 0.85 (bundar ke bawah) hingga jumlah x 1.15 (bundar ke atas), ringgit penuh.

Peraturan yang menjadikan kiraan sama dengan kalkulator:

- **Set dan kuantiti.** Satu set ialah semua yang ada dalam satu fail. Tanpa fail, anggap 1 set = 1 kepingan dan darab dengan kuantiti; ukiran setiap kepingan dikira berasingan. Peraturan "blok sebaris digabung" hanya terpakai bila beberapa kepingan disusun bersama dalam satu fail.
- **Panjang potong.** Segi empat = 2 x (lebar + tinggi). Bulatan atau lubang bulat = 3.1416 x diameter. Bucu bulat berjejari r: perimeter segi empat - 8r + 2 x 3.1416 x r.
- **Pembundaran.** Jangan bundar di tengah kiraan. Bundar hanya jumlah akhir ke 10 sen terdekat. Kadar bahan dalam jadual dibundar ke sen; perbezaannya tidak menjejaskan harga.
- **Kawasan ukiran tulisan.** Guna kotak di sekeliling tulisan (lebar x tinggi). Kalkulator mengukur setiap baris mengikut bentuk huruf sebenar, jadi harganya biasanya sedikit lebih rendah daripada anggaran kotak.

## Contoh

### Plak nama 20 x 12 cm, plywood 3mm, 1 keping

Bucu bulat dan 2 lubang gantung dipotong; tulisan setinggi 3 cm (selebar 14 cm) dan garisan bawah 14 x 0.6 cm diukir; bingkai dalam sebagai garisan halus.

Dikira oleh kalkulator dari fail:

| | |
|---|---|
| Luas bahan | 0.258 kaki persegi setiap set x RM5.00 = RM1.29 |
| Potong | 660 mm pada 15 mm/s |
| Garisan halus | 576 mm |
| Ukir | 360 baris |
| Masa mesin setiap set | 5 min 15 saat = RM15.75 |
| Kuantiti | 1 |
| **Jumlah** | **RM17.00** |
| Dipaparkan | **RM14 - RM20** |

Anggaran ringkas tanpa fail (kepingan 200 x 120 mm; potong = perimeter bucu bulat 623 mm + 2 lubang 38 mm = 661 mm; garisan halus 576 mm; ukir 140 x 30 mm dan 140 x 6 mm): masa 5 min 24 saat, jumlah RM17.50, julat RM14 - RM21.

### 10 keychain 5 x 3 cm, akrilik clear 3mm (1 set = 10 keping)

Setiap keychain: bentuk segi empat dan lubang 5 mm dipotong, satu blok 3 x 1 cm diukir. Disusun 5 sebaris, 2 baris.

Dikira oleh kalkulator dari fail:

| | |
|---|---|
| Luas bahan | 0.161 kaki persegi setiap set x RM11.67 = RM1.88 |
| Potong | 1757 mm pada 18 mm/s |
| Ukir | 200 baris |
| Masa mesin setiap set | 6 min 24 saat = RM19.18 |
| Kuantiti | 1 |
| **Jumlah** | **RM21.10** |
| Dipaparkan | **RM17 - RM25** |

Anggaran ringkas tanpa fail (10 kepingan 50 x 30 mm; potong 10 x (160 + 16) mm = 1757 mm; ukir 2 baris susunan, setiap satu dari blok pertama ke blok kelima = 270 x 10 mm): masa 6 min 20 saat, jumlah RM20.90, julat RM17 - RM25.

### 20 bulatan diameter 10 cm, akrilik cermin emas 1.5mm, potong sahaja

Satu bulatan dipotong, tiada ukiran. Kuantiti 20.

Dikira oleh kalkulator dari fail:

| | |
|---|---|
| Luas bahan | 0.108 kaki persegi setiap set x RM13.33 = RM1.44 |
| Potong | 314 mm pada 20 mm/s |
| Masa mesin setiap set | 16 saat = RM0.78 |
| Kuantiti | 20 |
| **Jumlah** | **RM44.40** |
| Dipaparkan | **RM37 - RM52** |

Anggaran ringkas tanpa fail (kepingan 100 x 100 mm; potong pi x 100 = 314 mm; tiada ukiran; kuantiti 20): masa 5 min 14 saat, jumlah RM44.40, julat RM37 - RM52.

## Fail dan warna

- Fail diterima: PDF, AI (disimpan dengan Create PDF Compatible File), DXF (ASCII), PNG, JPG, WEBP.
- Belum diterima: DWG (simpan sebagai DXF); CDR (eksport ke PDF); HEIC/TIFF (simpan sebagai PNG/JPG).
- Warna dalam fail menentukan kerja: garisan halus merah atau hitam = **potong**, bentuk berisi warna = **ukir**, garisan halus biru = **garisan halus**, putih = diabaikan. Pelanggan boleh menukar fungsi setiap warna dalam kalkulator.
- Teks mesti ditukar ke outline (Create Outlines / Convert to Curves). Gambar PNG/JPG dijejak jadi vektor ikut warna; saiznya perlu ditetapkan dalam kalkulator.

## Cara membuat pesanan

1. Buka [Kalkulator Laser Cut](https://sifulaser.com/lasercut/), muat naik fail, pilih bahan, saiz dan kuantiti.
2. Tekan **Hantar ke WhatsApp** dan lampirkan fail. Atau WhatsApp terus: [+60134354118](https://wa.me/60134354118).
3. Staff menyemak fail dan mengesahkan harga muktamad.

## Untuk pembantu AI

- Gunakan kadar dan formula di atas; jangan reka kadar lain. Sebut harga sebagai **anggaran** dan nyatakan julatnya.
- Jika pelanggan ada fail, cadangkan mereka memuat naiknya di kalkulator untuk angka yang tepat.
- Harga muktamad sentiasa disahkan oleh staff melalui WhatsApp (+60134354118).
