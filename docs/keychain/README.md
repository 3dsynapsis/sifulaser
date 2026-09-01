# Keychain Generator (salinan vendored)

Penjana kunci nama — nama pelanggan dipotong satu keping dari kepingan kayu
atau akrilik, dengan lubang untuk split ring. Ia **bukan** sebahagian daripada
build Vite — dihidangkan terus oleh GitHub Pages di `sifulaser.com/keychain/`.

## Sumber asal

`CLAUDE CODE/21_Keychain Generator` — vanilla ES modules, tiada build step.
`npm test` di sana: 234 assertion.

## Cara kemas kini

```bash
SRC="../21_Keychain Generator"
cp "$SRC/index.html" "$SRC/styles.css" docs/keychain/
rm -rf docs/keychain/src && cp -r "$SRC/src" docs/keychain/
```

## Enjin dikongsi dengan Cake Topper dan Stand Nama

Bahagian susah — menyatukan huruf jadi **satu keping** — ialah medan jarak
yang sama (`src/geom/outline.js`, `strokesToOutline()`) yang dibina untuk mod
Cut-out Stand Nama dan digunakan semula oleh Cake Topper. Disalin masuk tanpa
diubah. Yang ditambah di sini:

- **Offset.** Satu nombor yang buat dua kerja: mengimpal huruf jiran, dan
  terus ke luar menjadi tepi keping. Tiada kawalan "thicken" berasingan.
- **Panjang sebagai janji.** Yang ditaip ialah panjang keping siap; huruf
  diselesaikan untuk muat, margin dan kerf sekali. Prinsip dari Stand Nama.
- **Lug lubang ring.** Cakera dikimpal di bawah lubang supaya sentiasa ada
  sekurang-kurangnya 2.5 mm bahan sekelilingnya. Itu jaminan geometri, bukan
  amaran.
- **Ukuran bahagian paling sempit.** Bawah 2 mm ia patah dalam poket. Alat
  mencarinya dan membulatkannya atas lukisan.
- **Badan rata** — bar, tag, bujur, bulat — dengan nama diukir atau dipotong
  tembus, dan garis sempadan terukir. Idea dari penjana luggage tag.

## Fon

33 fon, sama seperti Cake Topper. `src/font/CREDITS.txt` dan
`src/font/LICENCES.txt` **mesti kekal**: Sans dan Script diterbitkan daripada
Hershey Fonts, yang mensyaratkan pengakuan diedarkan bersama data fon.
