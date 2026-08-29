# Cake Topper (salinan vendored)

Penjana topper kek — nama dipotong satu keping dari akrilik, dengan pancang
yang dicucuk ke dalam kek. Ia **bukan** sebahagian daripada build Vite —
dihidangkan terus oleh GitHub Pages di `sifulaser.com/topper/`, dan halaman
React `#/topper` memuatkannya dalam iframe.

## Sumber asal

`CLAUDE CODE/18_Cake Topper` — vanilla ES modules, tiada build step.
`npm test` di sana: 177 assertion.

## Cara kemas kini

```bash
SRC="../18_Cake Topper"
cp "$SRC/index.html" "$SRC/styles.css" docs/topper/
rm -rf docs/topper/src && cp -r "$SRC/src" docs/topper/
```

## Enjin dikongsi dengan Stand Nama

Bahagian sukar topper — menyatukan huruf jadi **satu keping** — ialah medan
jarak yang sama yang kita bina untuk mod Cut-out Stand Nama. Yang ditambah di
sini:

- **Thicken.** Menggemukkan huruf. Dalam medan jarak ini percuma: ia cuma
  menukar aras yang dijejak. Ia buat dua kerja serentak — huruf halus jadi
  cukup kuat untuk dicucuk ke kek, dan huruf bersebelahan tertarik bercantum
  sehingga tak perlu jambatan langsung.
- **Line height bawah 100%** sebagai default, supaya baris bertindih. Kalau
  "Happy" tak bersentuh "Birthday", itu dua keping berasingan.
- **Pancang** yang meluncur sendiri ke bawah huruf terdekat. Pancang yang
  jatuh dalam jurang antara huruf tak melekat pada apa-apa.
- **Semakan imbangan.** Topper bergantung pada pancangnya. Alat mengira di
  mana berat huruf sebenarnya berada dan memberi amaran kalau ia akan senget.

## Fon

33 fon. Lapan ditambah khusus untuk topper, iaitu fon yang Cuttle sendiri
syorkan: Courgette, Grand Hotel, Itim, Lakki Reddy, Leckerli One, Niconne,
Rochester, Style Script. Great Vibes sudah ada sebelum ini.

**Rochester ialah Apache 2.0**, bukan OFL — ia mendahului perpindahan Google
Fonts ke OFL. Lesen setiap fon disenaraikan dalam `src/font/LICENCES.txt`.
Jangan buang fail itu.

## Bahan

Akrilik tuang (cast), bukan kayu. Ia masuk ke dalam makanan; kayu berliang,
menyerap lembapan dan minyak kek, dan tak boleh dibasuh bersih. Cast juga
keluar dengan tepi berkilat, extruded tidak.

## Ilham

Idea dari Cake Topper Generator oleh Cuttle. Enjin di sini milik kita sendiri,
dan tiada sekatan lesen — Cuttle memerlukan langganan Pro untuk membuat atau
menjual barang fizikal, dan melarang SVG hasilnya diedarkan.
