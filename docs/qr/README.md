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
