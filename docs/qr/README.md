# QR Generator (salinan vendored)

Penjana kod QR untuk laser. Modul gelap diukir (Fill), bingkai dipotong (Cut),
saiz dalam milimeter sebenar termasuk quiet zone. Ia **bukan** sebahagian
daripada build Vite — dihidangkan terus oleh GitHub Pages di
`sifulaser.com/qr/`, dan halaman React `#/qr` memuatkannya dalam iframe.

## Sumber asal

`CLAUDE CODE/16_QR Generator` — vanilla ES modules, tiada build step.
`npm test` di sana: 225 assertion.

## Cara kemas kini

```bash
SRC="../16_QR Generator"
cp "$SRC/index.html" "$SRC/styles.css" docs/qr/
rm -rf docs/qr/src && cp -r "$SRC/src" docs/qr/
```

## Encoder ditulis sendiri

`src/geom/qr.js` — byte mode, versi 1–40, aras L/M/Q/H, Reed-Solomon atas
GF(256), lapan mask dinilai dengan empat peraturan penalti, maklumat format
dan versi BCH. Tiada pergantungan luar.

Ujian menyemak kesemua 160 pasangan versi/aras terhadap jadual piawai, dan
menyahkod grid siap semula menggunakan penyahkod yang **menerbitkan**
pembahagian blok daripada sindrom Reed-Solomon — bukan bertanya kepada kod
yang sedang diuji. Itu yang mendedahkan dua pepijat serius semasa pembinaan.

## Belum diuji

**Tiada hasil bakar sebenar pernah diimbas.** Semua bukti setakat ini
matematik dan jadual piawai. Bakar satu keping dan imbas dengan telefon
sebelum jual.

## Perubahan yang dibuat terus dalam salinan ini

**24 Oktober 2026 - butang Simpan dan galeri "Reka bentuk saya"**, sama seperti
Plak Box, Box Maker, Rehal dan Tray Organizer. Reka bentuk disimpan ke akaun
pengguna di Firestore (`users/{uid}/designs/{id}`, `tool: 'qr'`) melalui REST,
dengan token yang laman utama tinggalkan dalam localStorage `sifulaser.session`.
Ia juga disimpan sendiri bila Export dibuka dan bila fail dimuat turun, dan
`?design=<id>` membukanya dari galeri alat lain.

Yang disimpan hanya tetapan (`params`, 14 kunci): 12 kunci `DEFAULTS` dalam
`src/geom/tag.js` (teks, aras, versi, boost, saiz, bingkai, margin, bucu,
lubang, tebal, kerf) serta `scanSpeed` dan `lineInterval`. Tiada `extra`.
Paparan (Artwork/Layers), latar pratonton dan `sheetWidth` tidak disimpan.

- `src/cloud.js` - **baharu**, salinan tepat templat galeri (Firestore REST).
- `src/designs.js` - **baharu**, templat galeri; hanya `TOOL`, `UNTITLED` dan
  `KEPT` diisi untuk alat ini.
- `src/saved.js` - **baharu**, modul tulen: keadaan alat <-> rekod akaun, setiap
  nilai disemak (rosak -> lalai, luar julat dikepit seperti medan alat).
- `src/main.js` - `galleryStore`, `applyDesign` (satu langkah undo),
  `saveAfterExport`, dialog Simpan/galeri, simpan senyap pada butang muat
  turun, dan `?design=<id>` di hujung fail.
- `index.html` - butang `#saveBtn` dan `#filesBtn` dalam bar atas, dialog
  `#saveDlg` dan `#filesDlg`, baris `#exportSaved` dalam dialog Export.
- `styles.css` - gaya galeri (di hujung fail), dan bar atas yang memberi laluan
  berperingkat: bacaan saiz di bar atas disorok di bawah 1500 px (label di
  bawah pratonton menyebut perkara yang sama), "Reka bentuk saya" jadi ikon
  sahaja di bawah 1100 px, dan dua baris di bawah 700 px supaya Export kekal
  dalam skrin telefon.
- `styles.css` (hujung fail) - telefon (<= 700 px) susun MENEGAK: pratonton
  di atas selebar skrin, panel tetapan menatal di bawahnya, seperti Plak Box
  dan Tray (bos, 24 Oktober 2026). Sebelum ini pratonton tinggal ~140 px
  lebar di sebelah panel.

Ujian: `node scripts/test-qr-designs.mjs` (dari akar repo).

**Amaran:** perubahan ini wujud dalam `docs/qr/` sahaja. Salin balik ke projek
asal (`CLAUDE CODE/16_QR Generator`) **sebelum** "Cara kemas kini" di atas
dijalankan lagi - kalau tidak, ia dipadam senyap oleh `cp` dan `rm -rf src`.
Semak dengan `diff -rq --strip-trailing-cr "../16_QR Generator/src" docs/qr/src`
sebelum menyalin - ia mesti senyap.
