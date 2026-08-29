# Template Adjuster (salinan vendored)

Membaiki fail SVG yang dimuat turun supaya padan dengan material yang ada.
Ia **bukan** sebahagian daripada build Vite — dihidangkan terus oleh GitHub
Pages di `sifulaser.com/adjust/`, dan halaman React `#/adjust` memuatkannya
dalam iframe.

## Sumber asal

`CLAUDE CODE/17_Template Adjuster` — vanilla ES modules, tiada build step.
`npm test` di sana: 204 assertion.

## Cara kemas kini

```bash
SRC="../17_Template Adjuster"
cp "$SRC/index.html" "$SRC/styles.css" docs/adjust/
rm -rf docs/adjust/src && cp -r "$SRC/src" docs/adjust/
```

## Dua tombol, sengaja berasingan

- **Saiz keseluruhan** — skala semua benda, termasuk slot.
- **Tebal material** — ubah **hanya** ciri yang bergantung pada tebal papan,
  dan tidak menskala apa-apa.

Guna yang pertama sahaja pada fail bersambungan menghasilkan kotak yang tak
muat: slot 3 mm jadi 4.5 mm. Alat ini memberi amaran bila itu berlaku.

`src/geom/refit.js` meneka tebal asal dengan histogram ciri kecil dalam fail
itu, mengesan slot segi empat dan kedalaman jari, dan **mengira apa yang ia
tak faham** — bukan meneka. Laporan "18 slot diubah, 3 ciri tak dikenali" itu
syarat, bukan hiasan: jawapan salah yang senyap bermakna sekeping papan
terbuang.

Pembaca SVG datang dari `12_Box Maker/src/importArt.js`, bukan `box.js` —
yang itu penjana, bukan pembaca.
