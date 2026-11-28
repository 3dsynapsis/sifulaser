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
node "$SRC/tools/stamp-version.js"
cp "$SRC/index.html" "$SRC/styles.css" docs/puzzle/
cp -r "$SRC/src" "$SRC/vendor" docs/puzzle/
cp "$SRC/uvfile/index.html" docs/uvfile/index.html
mkdir -p docs/keychainuv && cp "$SRC/keychainuv/index.html" docs/keychainuv/index.html
```

Jangan salin `tools/` atau `package.json` — hanya diperlukan semasa pembangunan.

`stamp-version.js` (12 November 2026) menulis masa sekarang (waktu Malaysia) ke
`src/version.js`. Masa itu dipapar di bawah kanan panel ("Versi 12 Nov 2026, 10:01"),
supaya boleh nampak sama ada browser jalankan kod terbaru: GitHub Pages benarkan
browser simpan setiap fail 10 minit (`max-age=600`), jadi selepas deploy kod lama
boleh jalan lagi sehingga Ctrl+Shift+R.

Sejak 4 November 2026 projek sumber dan salinan ini **sama**, jadi arahan di atas
selamat. Kerja baharu dibuat di projek sumber, kemudian disalin ke sini.
`vendor/LICENCES.txt` mesti kekal bersama `pdf-lib` dan `PDF.js`.

## Nota

Bentuk knob dan jalan rawak diport dari penjana Draradech supaya seed yang sama
menghasilkan puzzle yang sama. Yang kita tambah: pampasan kerf (melebarkan kepala
tab supaya cengkaman kekal selepas laser makan bahan) dan amaran bila tab + jitter
terlalu tinggi sehingga garisan bersilang.

## Poster ke puzzle (4 November 2026)

Upload PDF poster, pilih saiz, dapat semua fail kerja: **fail cut** (panel dan
backing atas job sheet, format sama seperti fail CorelDRAW kedai) dan **fail print**
(artwork di tempatnya, dengan layer Spot). PDF kekal dalam browser dan tidak dihantar ke
mana-mana. Butang Simpan hanya menghantar tetapan ke akaun.

Peraturan yang dipersetujui bos, semua dalam `src/geom/poster.js`:

- Pilih kertas: sisi panjang poster ikut sisi panjang kertas, sisi pendek ikut
  ratio poster dan tidak dipaksa. Poster 2:3 pada A3 ialah 280 x 420 mm, bukan A3.
- Taip tinggi: tinggi itu yang dipakai, apa pun arah poster.
- Keping kekal lebih kurang 40 mm. Papan lebih besar bermakna lebih banyak keping.
- Artwork lebih besar dari puzzle: sekurang-kurangnya 3 mm di sisi panjang dan 2 mm
  di sisi pendek. Lebihan itu jatuh atas frame.
- Frame 16 mm, bucu luar frame dan backing sama R5 supaya panel tersusun tepat atas
  backing (bos, 11 November 2026). Panel dan backing acrylic putih 3 mm. Sejak
  11 November 2026 tiada lagi 4 batang border putih (bos): frame panel jadi dinding
  tray, dilekat atas backing. Label setiap part tulis bilangan UNIT, iaitu jumlah
  puzzle yang guna file cut tu.
- Panel mesti muat UV bed 900 x 600 mm, kalau tidak Export ditolak.
- PDF banyak page: tick page yang dikehendaki. Page saiz sama kongsi satu seed dan
  satu fail cut, fail print satu untuk setiap page (bos, 5 November 2026). Page saiz
  lain dapat seed dan fail cut sendiri. Keping dua poster saiz sama boleh tertukar,
  jadi kena asingkan ikut gambar.

Banyak PDF dalam satu job (bos, 11 November 2026): client boleh hantar satu PDF untuk
setiap poster. Upload, drag, Tambah PDF dan Tukar PDF terima banyak file sekali.

- File disusun ikut nama (1, 2, ... 10), page dinombor merentas semua file, dan
  senarai serta nama file keluar guna nama PDF. Nama job ialah bahagian yang sama
  dalam semua nama file ("A4 PUZZLE").
- Tambah PDF dengan nama yang sama dengan file dalam job menggantikan file lama
  (versi client yang dibetulkan), dan tick page dikekalkan.
- Pilihan A: job ikut arah kebanyakan page (seri jadi landscape). Page arah lain
  diputar 90 darjah ikut arah jam dalam preview, file print dan kad, jadi semua
  poster A4 kongsi satu panel dan satu file cut.
- Rekod simpanan ada `files` (senarai). Rekod lama dengan `file` dibaca sebagai
  senarai satu file. PC lain: tab minta semua PDF yang tiada sekali gus.

Gambar sebagai poster (bos, 17 November 2026): tab Puzzle, UV File dan Keychain UV
terima PNG, JPG (termasuk .jfif) dan WebP selain PDF, dan boleh bercampur dengan PDF
dalam satu job. GIF, BMP dan AVIF pun boleh dibuka; HEIC dan TIFF tidak, sebab Chrome
tak boleh lukis.

- Gambar jadi satu page yang saiznya tepat gambar itu (`PicturePage` dalam
  `posterPdf.js`). Browser yang decode dan lukis, jadi arah EXIF gambar telefon dan
  profil warna diikut. Selebihnya alat nampak page biasa: preview, putar 90, file
  print 300 dpi, cari bulatan keychain dan semakan layer semua sama.
- Saiz page dalam mm ikut dpi dalam file (JFIF, EXIF, pHYs PNG, BMP) bila 150 hingga
  2400 dpi. 72 dan 96 (kamera, skrin) atau tiada dpi: dikira 300 dpi. Saiz ini hanya
  penting untuk "Asal" dalam tab UV File; Puzzle dan Keychain ikut saiz yang dipilih.
- Satu gambar: panel tulis saiz pixel (contoh 2480 x 3508 px). Amaran resolusi rendah
  dan dpi keychain dikira dari pixel gambar.
- Kawasan telus dalam PNG jadi putih, macam kertas kosong dalam PDF.
- IndexedDB simpan gambar asal dengan jenisnya (`image/png` dan lain-lain), dan hash
  dari byte gambar asal, jadi pilih file yang sama di PC lain tetap dikenal.

File print gabungan (bos, 11 November 2026): file cut kekal satu set dan dicut
berulang. Panel yang dah dicut diletak rapat tepi ke tepi dari bucu kiri atas bed
UV 900 x 600 mm, jadi satu file print untuk satu run (`geom/runs.js`). Panel A4
landscape: 4 satu run (2 x 2, 658 x 484 mm). Panel yang tak muat bed ikut arah
biasa diputar. File print satu panel masih ada dalam Export, dilipat, untuk ulang
print; ZIP hanya ambil file cut, run dan kad.

Share ke WhatsApp (bos, 11 November 2026): dalam Export, setiap baris file ada kotak
tick. Butang "File cut (laser)" dan "File print (UV)" pilih kumpulan sekali, dan
Share hantar semua file yang di-tick dengan nota job (client, dateline, cara cut atau
letak panel).

- File dibina sebaik di-tick, sebab telefon cuma buka menu share beberapa saat
  selepas ditekan, dan run print ambil masa lebih lama untuk dibina.
- Jenama sama macam download: file cut ada "by sifulaser.com", file print tiada.
- Browser yang tak boleh share file (kebanyakan desktop tanpa menu share): file
  didownload dan WhatsApp dibuka dengan nota; file dilampirkan sendiri.

Fail print ada tiga layer PDF (bos, 5 November 2026), supaya tidak perlu lagi buka
Photoshop sebelum FlexiPRINT:

- `Artwork` di atas, kemudian `Spot 1` dan `Spot 2`. FlexiPRINT cetak white ikut
  **nama** layer, jadi ejaan `Spot 1` dan `Spot 2` jangan diubah (`SPOT_LAYERS`).
- Setiap Spot ialah segi empat penuh sama saiz dan sama tempat dengan artwork, bukan
  penuh page, sebab frame tidak kena white.
- Warna Spot ialah spot colour nama yang sama, dengan alternatif hitam 100% sebagai
  penanda. Layer `Artwork` bermula dengan segi empat tanpa dakwat, jadi hitam itu
  tidak boleh terlihat atau tercetak, walaupun poster ada kawasan telus.
- **Belum diuji dalam FlexiPRINT sebenar** pada masa nota ini ditulis.

Semak layer sebelum download (bos, 6 November 2026): Preview > **File print**.
Alat membina fail print yang sama seperti butang File print, kemudian membacanya
semula dengan PDF.js (`src/printCheck.js`), pembaca yang tiada kaitan dengan
pdf-lib yang menulisnya. Setiap layer ada ikon mata untuk on/off, macam Photoshop.

- Warna untuk mata sahaja, fail tidak berubah: kawasan kosong (tiada
  dakwat) petak-petak kelabu, Artwork warna asal, Spot 1 magenta `#e6007e`, Spot 2
  cyan `#00a0e9`. Spot dilukis lut sinar, jadi bila dua-dua on warnanya jadi ungu.
- Semakan automatik: nama tiga layer tepat, Artwork di tempatnya, dan setiap Spot
  penuh dan sama saiz dengan artwork. Salah satu gagal, barisnya merah.
- Ini hanya mengesahkan fail. Ia tidak menjamin FlexiPRINT membacanya.

Kad rujukan A6 (bos, 11 November 2026): satu kad gambar penuh untuk setiap page yang
di-tick, supaya client boleh rujuk bila pieces bercampur. Suis dalam kumpulan "Kad
rujukan A6"; semua kad atas satu sheet, jadi laser cut sekali dan UV print sekali.
Peraturan dalam `src/geom/cards.js`:

- Kad ikut A6 seperti puzzle ikut A3: sisi panjang 148 mm, sisi pendek ikut ratio
  poster. Poster 2:3 jadi kad 98.67 x 148 mm.
- Bleed 2 mm keliling setiap kad (bos), gambar dipotong (clip) tepat di situ.
- Jarak antara kad 4 mm, dua kali bleed: bleed kad sebelah bertemu tanpa bertindih.
- Frame 10 mm keliling, dicut paling akhir. Bucu kad R3.
- Susunan grid yang paling kecil yang muat UV bed. 4 page jadi 2 x 2, sheet
  221.34 x 320 mm.
- Fail print kad ada tiga layer yang sama. Spot penuh di bawah setiap kad dan bleed,
  bukan atas frame. Preview > Kad A6 menyemak semula setiap kad.
- Kesan bleed: 2 mm tepi poster jatuh di luar kad. Teks yang lebih rapat dari itu
  pada saiz A6 terpotong sedikit (sampel Prostar page 2, "penyusuan susu ibu").

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
- `posterPdf.js` - baca PDF atau gambar pelanggan dan tulis fail print
- `posterFile.js` - kenal jenis file, dpi gambar, saiz page gambar (tulen)
- `posterFlow.js` - keadaan dan panel mod poster
- `posterSaved.js` - bentuk rekod poster dalam akaun (tulen)
- `posterVault.js` - PDF dan draf dalam IndexedDB
- `printCheck.js` - baca semula layer fail print untuk Preview > File print
- `geom/cards.js` - saiz, bleed dan susunan kad rujukan A6 (tulen)
- `geom/runs.js` - susunan panel atas bed UV untuk file print gabungan (tulen)
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

## UV File Generator (11 November 2026)

Tab baharu `sifulaser.com/uvfile/` (halaman React `#/uvfile`) ialah aliran poster
ini **tanpa pieces**: poster dicut keluar di tepinya sendiri, dalam frame 10 mm (bucu
luar R5; asalnya 16 mm macam frame puzzle, bos kecilkan untuk jimat material). Fail
cut: garis poster dulu (hairline, bucu R3 supaya tak tajam di tangan; R1 dicuba dulu
dan terlalu kecil, 12 November 2026), frame last, label material dan "N
UNIT". Panel di-UV print dengan poster masih dalam frame, jadi bleed 2 mm jatuh atas
frame dan terbuang bersamanya (12 Nov 2026: versi pertama tiada garis poster, salah
faham). Fail print UV sama seperti di sini (gambar CMYK 300 dpi, Spot 1 dan Spot 2 di
bawah). Ada pilihan "Asal" untuk PDF yang sudah ikut saiz, dan pilihan Material di
atas saiz: Acrylic Putih 3mm (default), Clear 2mm, 3mm atau 5mm (`PANEL_MATERIALS`
dalam `src/geom/panel.js`). Material mengubah tulisan dalam fail cut, nota Export
dan WhatsApp, dan rekod Simpan; fail print kekal sama.

Ia **tiada kod sendiri**: `docs/uvfile/index.html` memuatkan `/puzzle/styles.css`
dan `/puzzle/src/uvMain.js` dari folder ini. Jadi:

- jangan buang `src/uvMain.js`, `src/geom/panel.js` atau `styles.css` dari sini;
- kemas kini kedua-dua tab sekali gus dengan arahan "Cara kemas kini" di atas (baris
  terakhirnya menyalin `uvfile/index.html`).

Draft dan PDF tab UV disimpan dalam IndexedDB berasingan (`sifulaser-uvfile`),
dan rekod akaun guna TOOL `'uvfile'`, jadi kerja dua tab tidak bercampur.
Ujian: `node scripts/test-puzzle-poster.mjs` (bahagian panel UV).

### Buang ruang putih (25 November 2026)

Logo klien selalu datang sebagai satu page A4 penuh dengan logo kecil di tengah
(contoh Masjid Asy Syakirin: 79% page putih). Tab UV File dahulu menyaiz PAGE, jadi
pada tinggi 100 mm logo cuma 31 x 49 mm. Kini setiap page ada **pangkasan**:

- **Auto** - bila fail dibuka, `geom/crop.js` (`findContent`, `trimCrop`) mencari
  kawasan yang bukan putih dan bukan lutsinar pada raster page, dan memangkas
  kepadanya + jarak 3% sisi panjang artwork (sekurang-kurangnya 3 mm). Page yang
  hampir penuh (< 5% boleh dibuang) dibiarkan.
- **Laras di skrin** - paparan "Pangkas": seluruh page dengan kotak biru yang
  bucu/tepinya boleh diseret (`View.renderCrop`), atau taip ruang yang dibuang di
  atas, bawah, kiri, kanan. "Seluruh page" mematikannya.
- Pangkasan ialah **tepi poster** (garis cut). Bleed 2 mm diambil dari page di luar
  pangkasan (`bleedCrop`), jadi artwork tidak dimakan bleed. Saiz output, "Asal",
  panel, fail cut, fail print, semakan resolusi dan arah page (`settleTurns`)
  semuanya ikut pangkasan.
- Disimpan dalam rekod dan draf sebagai `crops: [{ i, x, y, w, h, auto }]` (mm pada
  page). Rekod lama tanpa `crops` dibuka seperti dahulu: page penuh, tiada auto.
- Tab Puzzle tidak berubah (`crop: false` dalam `PRODUCTS`).
- Ujian: `node scripts/test-puzzle-poster.mjs` (bahagian "buang ruang putih").

> **Dibuat terus dalam salinan ini**, bukan dalam `13_Puzzle Generator`: fail baharu
> `src/geom/crop.js`, dan perubahan dalam `src/posterFlow.js`, `src/posterSaved.js`,
> `src/view.js`, `src/version.js` dan `styles.css`. Salin balik ke projek sumber
> sebelum "Cara kemas kini" dijalankan lagi, kalau tidak semuanya hilang senyap.

### Susun semua panel atas bed (25 November 2026)

Masukkan beberapa fail sekali gus (PDF, JPG, PNG): setiap satu jadi panel, dan semua
panel - apa pun saiznya - disusun bersama atas UV bed 900 x 600 mm. Dahulu hanya panel
yang saiznya SAMA TEPAT berkongsi run; logo yang dipangkas jarang sama saiz (84.8 lawan
84.9 mm), jadi tiga logo jadi dua atau tiga file cut dan run berasingan.

- `geom/runs.js` `packPanels` - rak (shelf), paling tinggi dahulu, rapat tepi ke tepi
  tanpa jarak. Dicuba tiga cara (seperti asal, semua dipusing, sisi panjang sepanjang
  900) dan yang paling sedikit bed, kemudian paling kecil luasnya, menang. Saiz yang
  sama keluar seperti `planRuns`.
- Satu muatan bed = **sepasang** fail: file cut run (`buildPanelBedSheet` dalam
  `exportJobSheet.js`) dan file print run, susunan panel sama. Dalam file cut: garis
  poster dulu, garis panel last, dan garis yang dikongsi dua panel ditulis sekali
  (`frameLines`), supaya laser tak potong dua kali. Bucu panel di sini segi empat:
  frame ialah sisa, dan bucu R5 meninggalkan serpih di antara panel.
- Preview "File cut" menunjukkan file cut run page itu. Export: setiap run, File cut
  kemudian File print. "Satu panel sahaja" kekal untuk ulang cut atau print satu panel.
- Tab Puzzle tidak berubah (`pack: false`): satu file cut setiap saiz, cut N kali.
- Ujian: `node scripts/test-puzzle-poster.mjs` (bahagian "susun panel pelbagai saiz").

> **Dibuat terus dalam salinan ini** juga: `src/geom/runs.js`, `src/exportJobSheet.js`,
> `src/posterFlow.js`, `src/version.js`. Salin balik ke `13_Puzzle Generator` sebelum
> "Cara kemas kini" dijalankan lagi.

## Keychain UV File Generator (17 November 2026)

Tab baharu `sifulaser.com/keychainuv/` (halaman React `#/keychainuv`). Masukkan PDF
design keychain bulat; tool ini:

- cari bulatan design dalam PDF sendiri (file pelanggan biasanya gambar bulat atas
  page putih, tiada bleed dan tiada garis cut) - `src/geom/keychain.js`;
- buat bleed 2 mm dengan menyambung warna tepi design keluar, bila file tiada bleed
  (bos pilih cara ini, bukan besarkan design atau cut ke dalam);
- buang garis border nipis di tepi design (dihidupkan sendiri bila dijumpai): print dan
  cut tak pernah tepat, dan garis 0.4 mm di tepi nampak tebal sebelah dan hilang
  sebelah bila lari 0.5 mm;
- lubang 2 mm di atas, tinggal 1.5 mm acrylic ke tepi (tengahnya 2.5 mm dari tepi; titik
  merah bos tinggal 1 mm, bos kata terlalu dekat), boleh diseret tapi tak lebih dekat;
- jenis keychain **Hook** (bos, 17 November 2026): telinga bulat 6 mm di tepi dengan lubang
  2 mm di tengahnya, 2 mm acrylic keliling lubang, tengahnya atas garis cut dan tiada
  radius di sambungan, ikut ukuran file "Lc Zahidah keychain" (telinga 3.07 mm, lubang
  2.09 mm). Garis cut keychain dan hook satu garis (`unionPath`); bleed dan white pun
  ikut hook; hook boleh diseret untuk pusing ikut tepi; sheet susun ikut kotak keychain
  dan hook (5 cm atas Mini masih 30);
- saiz 4, 5, 6 cm; sheet Kecil 490 x 740 atau Besar 550 x 850 mm (saiz template FRONT
  medal bos), jarak 7 mm garis cut ke garis cut dan 7 mm dari tepi sheet ke garis cut.
  Keychain tiada masking tape, jadi muat sebanyak mungkin (bos, 17 November 2026;
  asalnya 9 mm dan tape 15 mm macam medal). 5 cm: Kecil 96, Besar 126;
- kuantiti (termasuk lebihan) dibahagi sama rata supaya semua sheet guna file sama, dan
  file cut tulis "N PCS SATU SHEET" dan "CUT N KALI"; nama file pun ada `-30pcs-x3`.
  Contoh bos: client nak 84, dengan lebihan 90, atas Mini jadi 30 satu keping, cut dan
  UV print 3 kali;
- juga sheet Mini 300 x 400 (30 keychain 5 cm) dan Custom (taip lebar x tinggi, 100 mm
  sehingga bed UV 900 x 600): bos, 17 November 2026, print UV yang besar lari sikit di
  atas dan kiri, jadi sheet kecil lebih tepat;
- file cut: tulisan FRONT biru (CMYK 100/100/0/0) di bawah keychain, marking laser satu
  garisan supaya orang UV tahu muka depan (bos, 17 November 2026; huruf Hershey "futural"
  dalam `src/geom/strokeText.js`, kredit Hershey dalam fail itu mesti kekal); lubang,
  keychain, frame sheet last, label material, "N PCS SATU SHEET" dan "CUT N KALI";
- file print UV: satu gambar CMYK 300 dpi dikongsi semua keychain, Spot 1 dan Spot 2
  di bawah, setiap keychain bulat dengan lubang kosong (`buildLayeredPrint` terima
  `shape`), dan Preview, File print menyemak layer pada setiap bulatan.

Ia juga **tiada kod sendiri** di luar folder ini: `docs/keychainuv/index.html` memuatkan
`/puzzle/styles.css` dan `/puzzle/src/keychainMain.js`. IndexedDB `sifulaser-keychainuv`,
TOOL akaun `'keychainuv'`. Nama `keychain` sudah dipakai oleh Keychain Generator.
Ujian: `npm test` di projek sumber (`tools/test-keychain.js`) dan
`node scripts/test-puzzle-poster.mjs` di sini. **Belum diuji di mesin sebenar.**

## UV Plak Generator (28 November 2026)

Tab baharu `sifulaser.com/uvplak/` (halaman React `#/uvplak`). Masukkan design plak
(PDF, PNG atau JPG; contoh bos: Semeru_Kabinet.pdf, A4). Plak yang keluar:

- **Plak depan**, Plywood Maple 3mm (atau Black): seluruh design di-UV print, termasuk
  tulisan besar sebagai panduan tampal huruf timbul. Saiz = muka plak = design: A4, A3,
  ikut file, atau taip lebar/tinggi (nisbah design kekal; page dalam 1 mm dari nisbah
  kertas dikira kertas itu, sebab CorelDRAW simpan A4 sebagai 297 x 210.2).
- **Border hitam 10 mm** ditampal atas depan, atas 10 mm tepi design. Dipotong 4 keping
  bersudut 45 (pilihan "b" bos), disusun rapat dalam file cut supaya tengah sheet tak
  terbuang. Print berhenti 2 mm bawah border, supaya gam lekat pada kayu. Tanpa border,
  print lebih 2 mm lepas tepi plak. Tab beri amaran bila ink design masuk bawah border.
- **Huruf timbul** dari Plywood Black 3mm (`src/geom/letters.js`): page dilukis kira-kira
  0.12 mm satu piksel, gambar dalam PDF dikosongkan (`pageImageBoxes` dalam
  `posterPdf.js` - logo dan foto dicetak, tak dipotong), piksel gelap pada semua saluran
  ialah ink (tulisan merah logo tak dikira), setiap tompok ink jadi calon; garisan
  lukisan dibuang ikut nisbah tebal garisan kepada saiz. Calon disurih dengan marching
  squares pada tepi antialias, lubang huruf sekali (O, A, B), kemudian diringkaskan.
  Huruf setinggi "Huruf paling kecil" (lalai 10 mm) dipilih; tekan huruf dalam preview
  untuk buang atau tambah. Huruf kekal di tempatnya dalam file cut, supaya boleh
  diangkat sekali dengan transfer tape. Semeru Kabinet: 13 huruf, 4 lubang, tepat.
- **Base Acrylic Hitam 5mm satu keping** (bos, 28 November 2026: "hanya acrylic 5mm satu
  layer je", "acrylic warna hitam"); base lebih 15 mm kiri kanan, dalam kira-kira 0.3 x
  tinggi plak (50 hingga 120 mm).
- **Kaki plak macam Stand Nama** (bos: "kau boleh tengok tab stand nama"): tenon di bawah
  plak, 14 mm dari setiap hujung; satu kaki bila jarak antara kurang 110 mm, dua kaki
  (36% setiap satu) bila lebih, supaya base ada jambatan di antara alur (`tenonSpans`,
  peraturan sama dengan `docs/stand/src/geom/stand.js`). Alur dipotong tembus hanya di
  tempat kaki, saiz nominal kaki (3 mm tebal): kerf laser beri ruang, macam Stand Nama.
  Kaki masuk 4 mm (bos: "maksimum kedalaman dia 4 mm"), 1 mm pendek dari tebal base,
  jadi tak tercucuk keluar di bawah dan base duduk rata; tepi bawah plak di antara kaki
  ialah bahu yang duduk atas base. Plak A4: 2 kaki 96.84 mm, plat dipotong 297 x 214.

Fail: **satu file cut, satu page** (bos, 28 November 2026: "combine je dalam satu
file"; asalnya satu file setiap material): setiap material satu bahagian sebelah-
menyebelah, berlabel material dan "N UNIT, CUT N KALI" di atasnya (satu baris: baris
keempat naik ke kepala file). Bahagian kepingan yang ditampal (huruf timbul, border),
selain plak depan, dapat baris "(Tambah Double Tape)" terus bawah material (bos, 28
November 2026), supaya staff tampal double tape di belakang plywood sebelum cut. Macam job sheet
Puzzle yang bawa panel dan backing (`plakCutJobs` dalam `src/geom/plak.js`,
`buildPlakSheet` dalam `src/exportJobSheet.js`). Garis ditulis ikut susunan merentas
semua bahagian: lubang huruf dulu, huruf, jalur border, plak, alur, base, frame last.
Satu page, bukan satu page setiap material: perisian laser kadang-kadang baca page
pertama sahaja. Plak depan dipotong dalam frame 10 mm dan di-UV print sebelum
dikeluarkan, macam panel UV File.
**File print UV**: page = frame, gambar CMYK 300 dpi, Spot 1 dan Spot 2 (white)
**di bawah gambar dan tulisan sahaja** (bos, 28 November 2026: "white bawah gambar dan
tulisan sahaja, biar kayu nampak"): `inkMask` dalam `src/geom/plak.js` buat stensil 1 bit
dari piksel gambar print yang sama (lebih gelap dari 240 pada mana-mana saluran = ink),
dan hampir-putih dijadikan putih tulen supaya tiada kabus ink atas kayu.
`buildLayeredPrint` lukis Spot melalui stensil itu (`/ImageMask`, `placement.mask`).
Pilihan "Penuh" (white seluruh kotak, latar putih) kekal. Preview Plak dan 3D guna
gambar dengan putih lut sinar (`renderCutout`), jadi kayu nampak seperti hasil sebenar.
Preview, File print menyemak setiap Spot berada di bawah ink design sahaja
(`inspectPrint` pilihan `inkIn`, `judgeUnderInk` dalam `src/printCheck.js`). Semeru
Kabinet: 18% kawasan dapat ink dan white, 82% kayu kosong, 0% ink tanpa white.

**Preview 3D** (bos, 28 November 2026: "boleh lihat secara 3d macam tab box maker"):
`src/plak3d.js`, three.js r169 dalam `vendor/` (salinan sama dengan Box Maker, lesen
dalam `vendor/LICENCES.txt`), dimuat hanya bila 3D dibuka. Plak berdiri dalam alur base,
muka dengan print (tekstur dari preview), border dan huruf timbul 3 mm dari garis yang
sama dengan file cut, base acrylic hitam berkilat. Seret untuk pusing, klik dua kali untuk
muat semula.
Butang paparan **Plak / 3D / File cut / File print** ada di bar atas (bos, 28 November
2026: "mana butang 3d"), di tempat Box Maker letak 3D / 2D; di telefon ia dapat baris
sendiri bawah nama. Butang itu dibina oleh `plakMain.js`, bukan dalam `index.html`:
laman ini biar pelayar simpan setiap fail sehingga 10 minit, dan halaman baharu dengan
skrip lama dari cache menunjukkan butang yang tak buat apa-apa.

Ia juga **tiada kod sendiri** di luar folder ini: `docs/uvplak/index.html` memuatkan
`/puzzle/styles.css` dan `/puzzle/src/plakMain.js`. IndexedDB `sifulaser-uvplak`, TOOL
akaun `'uvplak'`. Ujian: `node scripts/test-uvplak.mjs`. **Belum diuji di mesin
sebenar.**

> **Dibuat terus dalam salinan ini**: `src/plakMain.js`, `src/plakFlow.js`,
> `src/plakSaved.js`, `src/plak3d.js`, `src/geom/plak.js`, `src/geom/letters.js`,
> `vendor/three.module.js`, `vendor/OrbitControls.js`, dan tambahan dalam
> `src/posterPdf.js` (`pageImageBoxes`), `src/exportJobSheet.js` (`buildPlakSheet`),
> `src/view.js` (`renderPlak`), `src/printCheck.js` (`inkIn`, `judgeUnderInk`),
> `src/designs.js` (TOOLS `uvplak`), `styles.css`,
> `src/version.js`. Salin balik ke `13_Puzzle Generator` sebelum "Cara kemas kini"
> dijalankan lagi.
