# Puzzle Generator (salinan vendored)

Aplikasi statik untuk menjana garisan potong puzzle jigsaw. Ia **bukan**
sebahagian daripada build Vite — fail di sini dihidangkan terus oleh GitHub
Pages di `sifulaser.com/puzzle/`, dan halaman React `#/puzzle` memuatkannya
dalam iframe. Corak yang sama seperti `docs/boxmaker/`.

## Sumber asal

Projek asal: `CLAUDE CODE/13_Puzzle Generator` (vanilla ES modules, tiada build
step). Di sana ada ujian geometri (`npm test`) yang **membandingkan hasil kita
dengan penjana rujukan** di https://draradech.github.io/jigsaw/jigsaw.html —
rentetan path yang dijangka diambil terus dari laman itu.

## Cara kemas kini

```bash
SRC="../13_Puzzle Generator"
cp "$SRC/index.html" "$SRC/styles.css" docs/puzzle/
cp -r "$SRC/src" "$SRC/vendor" docs/puzzle/
```

Jangan salin `tools/` atau `package.json` — hanya diperlukan semasa pembangunan.

Sejak 4 November 2026 projek sumber dan salinan ini **sama**, jadi arahan di atas
selamat. Kerja baharu dibuat di projek sumber, kemudian disalin ke sini.
`vendor/LICENCES.txt` mesti kekal bersama `pdf-lib` dan `PDF.js`.

## Nota

Bentuk knob dan jalan rawak diport dari penjana Draradech supaya seed yang sama
menghasilkan puzzle yang sama. Yang kita tambah: pampasan kerf (melebarkan kepala
tab supaya cengkaman kekal selepas laser makan bahan) dan amaran bila tab + jitter
terlalu tinggi sehingga garisan bersilang.

## Poster ke puzzle (4 November 2026)

Upload PDF poster, pilih saiz, dapat semua fail kerja: **fail cut** (3 part atas
job sheet, format sama seperti fail CorelDRAW kedai) dan **fail print** (artwork
di tempatnya, dengan layer Spot). PDF kekal dalam browser dan tidak dihantar ke
mana-mana. Butang Simpan hanya menghantar tetapan ke akaun.

Peraturan yang dipersetujui bos, semua dalam `src/geom/poster.js`:

- Pilih kertas: sisi panjang poster ikut sisi panjang kertas, sisi pendek ikut
  ratio poster dan tidak dipaksa. Poster 2:3 pada A3 ialah 280 x 420 mm, bukan A3.
- Taip tinggi: tinggi itu yang dipakai, apa pun arah poster.
- Keping kekal lebih kurang 40 mm. Papan lebih besar bermakna lebih banyak keping.
- Artwork lebih besar dari puzzle: sekurang-kurangnya 3 mm di sisi panjang dan 2 mm
  di sisi pendek. Lebihan itu jatuh atas frame clear.
- Frame clear dan batang border 16 mm, backing dan border bucu R5, semua 3 mm.
- Panel mesti muat UV bed 900 x 600 mm, kalau tidak Export ditolak.
- PDF banyak page: tick page yang dikehendaki. Page saiz sama kongsi satu seed dan
  satu fail cut, fail print satu untuk setiap page (bos, 5 November 2026). Page saiz
  lain dapat seed dan fail cut sendiri. Keping dua poster saiz sama boleh tertukar,
  jadi kena asingkan ikut gambar.

Fail print ada tiga layer PDF (bos, 5 November 2026), supaya tidak perlu lagi buka
Photoshop sebelum FlexiPRINT:

- `Artwork` di atas, kemudian `Spot 1` dan `Spot 2`. FlexiPRINT cetak white ikut
  **nama** layer, jadi ejaan `Spot 1` dan `Spot 2` jangan diubah (`SPOT_LAYERS`).
- Setiap Spot ialah segi empat penuh sama saiz dan sama tempat dengan artwork, bukan
  penuh page, sebab frame clear tidak kena white.
- Warna Spot ialah spot colour nama yang sama, dengan alternatif hitam 100% sebagai
  penanda. Layer `Artwork` bermula dengan segi empat tanpa dakwat, jadi hitam itu
  tidak boleh terlihat atau tercetak, walaupun poster ada kawasan telus.
- **Belum diuji dalam FlexiPRINT sebenar** pada masa nota ini ditulis.

Semak layer sebelum download (bos, 6 November 2026): Preview > **File print**.
Alat membina fail print yang sama seperti butang File print, kemudian membacanya
semula dengan PDF.js (`src/printCheck.js`), pembaca yang tiada kaitan dengan
pdf-lib yang menulisnya. Setiap layer ada ikon mata untuk on/off, macam Photoshop.

- Warna untuk mata sahaja, fail tidak berubah: kawasan kosong (clear, tiada
  dakwat) petak-petak kelabu, Artwork warna asal, Spot 1 magenta `#e6007e`, Spot 2
  cyan `#00a0e9`. Spot dilukis lut sinar, jadi bila dua-dua on warnanya jadi ungu.
- Semakan automatik: nama tiga layer tepat, Artwork di tempatnya, dan setiap Spot
  penuh dan sama saiz dengan artwork. Salah satu gagal, barisnya merah.
- Ini hanya mengesahkan fail. Ia tidak menjamin FlexiPRINT membacanya.

Simpan (bos, 5 November 2026: kerja tidak boleh hilang bila terkeluar atau tersilap):

- Butang Simpan buka popup Simpan sebagai: taip nama baru, atau pilih fail lama untuk
  overwrite. Nama yang sudah ada bermaksud fail itu, dan butangnya tertulis Overwrite.
- Akaun simpan tetapan sahaja (`extra.poster`): saiz, tick, client, dateline, seed.
  Seed ditulis, bukan dikira semula, supaya garisan cut kekal sama walaupun
  `strength.js` berubah.
- PDF kekal dalam IndexedDB browser ini, dikenal melalui hash. PC lain atau data
  browser yang dikosongkan: alat minta PDF itu semula.
- Draf automatik: setiap perubahan ditulis ke browser, jadi reload atau terkeluar
  mengembalikan kerja, walaupun Simpan belum ditekan.
- Menutup atau menukar poster yang belum disimpan bertanya dahulu.
- Export menyimpan hanya kali pertama (seperti alat lain). Ia tidak overwrite fail
  yang sudah ada, hanya mengingatkan; bos mahu pilih overwrite sendiri.

Fail baharu dalam `src/`:

- `geom/poster.js` - kiraan saiz, bleed, grid, UV bed (tulen)
- `geom/strength.js` - pilih seed yang paling kuat untuk akrilik 3 mm (tulen)
- `exportJobSheet.js` - job sheet: susunan part dan penulis PDF
- `posterPdf.js` - baca PDF pelanggan dan tulis fail print
- `posterFlow.js` - keadaan dan panel mod poster
- `posterSaved.js` - bentuk rekod poster dalam akaun (tulen)
- `posterVault.js` - PDF dan draf dalam IndexedDB
- `printCheck.js` - baca semula layer fail print untuk Preview > File print
- `zip.js` - ZIP tanpa mampatan untuk "Download semua"

`vendor/` hanya dimuat bila seseorang upload poster (lebih kurang 2 MB):

- `pdf.min.mjs`, `pdf.worker.min.mjs` - PDF.js 4.10.38, untuk pratonton
- `pdf-lib.esm.min.js` - pdf-lib 1.17.1, meletak page pelanggan tanpa mengubahnya

Jenama: fail cut dapat jalur "by sifulaser.com" seperti biasa. Fail print **tidak**,
kerana jalur itu akan tercetak. Ia ditinggalkan oleh `brandPdf` kerana pdf-lib menulis
aliran objek. Dalam ZIP, `posterFlow.js` memanggil `brandFile` sendiri kerana fail
dalam ZIP tidak melalui cangkuk muat turun.

Ujian: `npm test` di projek sumber, dan `node scripts/test-puzzle-poster.mjs` di repo
laman ini.

## Perubahan yang asalnya dibuat terus dalam salinan ini

Sudah disalin balik ke projek sumber pada 4 November 2026.

**24 Oktober 2026 - butang Simpan dan galeri "Reka bentuk saya"**, sama seperti
Plak Box, Box Maker, Rehal dan alat lain. Reka bentuk disimpan ke akaun
pengguna (Firestore `users/{uid}/designs/{id}`, `tool: 'puzzle'`) - bila Simpan
ditekan, dan sendiri bila Export dibuka dan bila fail dimuat turun (SVG, PDF,
WhatsApp). Yang disimpan hanya tetapannya, bukan fail SVG/PDF:

- `params` - sepuluh tetapan penjana, tepat seperti `buildPuzzle` menerimanya:
  lebar, tinggi, lajur, baris, saiz tab, jitter, seed, jejari bucu, kerf,
  `kerfComp`
- `extra` - `{ material, splitLayers }`: id bahan dan pilihan lapisan export
- `material` - nama bahan yang dibaca manusia (cth. "Falcata 3 mm")
- nama automatik "Puzzle 300 x 200 mm, 15 x 10 keping" selagi bar atas masih
  "Untitled puzzle". Latar pratonton (cerah/gelap) tidak disimpan.

Fail baharu:

- `src/cloud.js` - Firestore melalui REST, token dari `sifulaser.session`
- `src/designs.js` - dialog Simpan dan galeri (TOOL `'puzzle'`)
- `src/saved.js` - keadaan alat <-> rekod akaun (tulen, tiada DOM); nilai rosak
  jatuh ke lalai, nombor dihadkan ke julat kawalan

Fail diubah:

- `index.html` - butang `#saveBtn` dan `#filesBtn` di bar atas, dialog
  `#saveDlg` dan `#filesDlg`, baris `#exportSaved` dalam dialog Export
- `src/main.js` - `galleryStore`, simpan bila Export / muat turun, buka
  `?design=<id>`, `ctx.startOver`
- `src/ui.js` - satu baris: "Start over" memanggil `ctx.startOver`, yang
  memutuskan reka bentuk yang sedang dibuka (supaya simpanan seterusnya tidak
  menulis atasnya) dan mengemas kini nama di bar atas
- `styles.css` - gaya galeri, dan pada telefon (<= 640 px) bar atas dua baris
  dan butang dialog dua sebaris (dahulu empat butang Export melebarkan dialog
  melepasi skrin)
- `styles.css` (hujung fail) - telefon (<= 640 px) susun MENEGAK: pratonton
  di atas selebar skrin, panel tetapan menatal di bawahnya, seperti Plak Box
  dan Tray (bos, 24 Oktober 2026). Sebelum ini pratonton tinggal ~140 px
  lebar di sebelah panel.

Ujian: `node scripts/test-puzzle-designs.mjs` (di repo laman ini).
