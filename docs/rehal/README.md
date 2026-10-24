# Rehal Generator (salinan vendored)

Penjana **rehal Al-Quran** untuk laser: panel belakang bercorak geometri Islam
dengan nama terukir di dalam medalion, tapak, bibir penahan dan dua pipi yang
menjadikan sudut baca satu fakta dan bukan harapan. Lima keping, 9 mm papan
lapis, lebih kurang 330 mm melintang.

Ia **bukan** sebahagian daripada build Vite — fail di sini dihidangkan terus
oleh GitHub Pages di `sifulaser.com/rehal/`, dan halaman React `#/rehal`
memuatkannya dalam iframe. Corak sama seperti `docs/boxmaker/`, `docs/stand/`
dan `docs/keychain/`.

## Sumber asal

`CLAUDE CODE/25_Rehal Generator` — vanilla ES modules, tiada build step.
`npm test` di sana menjalankan tiga suite: enjin corak, stand, dan nest+export.

README penuh alat itu (sudut baca, kiraan terbalik, padanan sendi 9 mm, sepuluh
corak, dan senarai apa yang **belum** ditentukur) tinggal di sumber, bukan di
sini. Fail ini hanya bercakap tentang salinan vendored.

## Cara kemas kini

```bash
SRC="../25_Rehal Generator"
cp "$SRC/index.html" "$SRC/styles.css" docs/rehal/
rm -rf docs/rehal/src && cp -r "$SRC/src" docs/rehal/
rm -rf docs/rehal/vendor && cp -r "$SRC/vendor" docs/rehal/
```

Yang **tidak** disalin: `package.json`, `tools/`, `.claude/`, dan `README.md`
ini. Tiga yang pertama tiada gunanya kepada pelayar; yang keempat ialah nota
tulisan tangan tentang salinan vendored, jadi menyalin README sumber di atasnya
akan memadamkannya.

Fail di `docs/` berakhiran CRLF, sumbernya LF. `cp` biasa akan meninggalkan
`docs/rehal/` sebagai satu-satunya pokok berakhiran LF dalam `docs/`; kalau itu
mengganggu, tukar semasa menyalin.

## Dua tag yang tinggal di `index.html` SUMBER

Beacon Cloudflare Web Analytics dan `<script src="/shared/export-gate.js">`
berada dalam `25_Rehal Generator/index.html`, bukan hanya di sini. Vendoring
ialah `cp index.html`, jadi tag yang hidup hanya dalam `docs/` akan terpadam
senyap pada kemas kini berikutnya. Butang export membawa `id="exportBtn"`, dan
itu sahaja kewajipan alat ini kepada gate itu.

## Fail lesen yang WAJIB ikut

`src/font/CREDITS.txt` dan `src/font/LICENCES.txt`. Syarat Hershey dan OFL
kedua-duanya menjadikan pengedaran bersyarat kepada fail-fail itu bergerak
bersama data fon. Fon itu sendiri ialah set yang sama yang sudah dihantar oleh
Keychain Generator dan Cake Topper — tiada yang baru ditulis, tiada yang
dibuang.

## Gambar tile

Sejak 17 Oktober 2026 tile ini ialah FOTO 3D, `docs/images/tools/rehal.webp`,
diambil daripada salinan dalam `docs/rehal` oleh `scripts/tile-shots.mjs` -
bos mahu ia nampak seperti Box Maker dan Stand Nama, bukan lukisan rata.
`rehal.svg` yang dijana oleh `25_Rehal Generator/tools/thumb.mjs` tidak lagi
dipakai. Foto boleh jadi basi; ambil semula selepas apa-apa perubahan rupa:

    cd docs && python3 -m http.server 8765      # terminal lain
    node scripts/tile-shots.mjs docs/images/tools rehal

## Perubahan terus: senarai alat galeri (24 Oktober 2026)

`src/designs.js` - senarai `TOOLS` ditambah `plakbox` dan `tray` supaya reka bentuk dari
alat itu yang muncul dalam "Reka bentuk saya" boleh dibuka (ia membawa ke
`/<alat>/?design=<id>`). Tanpanya baris itu tidak berbuat apa-apa bila
ditekan. Perubahan ini dibuat terus dalam salinan `docs/`: salin baris yang
sama ke projek sumber sebelum menyalin semula alat ini, kalau tidak ia hilang
senyap.
