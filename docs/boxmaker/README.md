# Box Maker (salinan vendored)

Aplikasi statik untuk mereka kotak laser finger joint. Ia **bukan** sebahagian
daripada build Vite — fail di sini dihidangkan terus oleh GitHub Pages di
`sifulaser.com/boxmaker/`, dan halaman React `#/boxmaker` memuatkannya dalam
iframe.

Kerana `vite.config.ts` menetapkan `emptyOutDir: false` dan skrip build hanya
memadam `docs/assets`, folder ini kekal setiap kali `npm run build` dijalankan.

## Sumber asal

Projek asal: `CLAUDE CODE/12_Box Maker` (vanilla ES modules, tiada build step).
Di sana ada ujian geometri (`npm test`) dan penjana sampel (`node tools/sample.js`).

## Cara kemas kini

Salin semula fail berikut dari projek asal, kemudian commit:

```bash
SRC="../12_Box Maker"
cp "$SRC/index.html" "$SRC/styles.css" docs/boxmaker/
cp -r "$SRC/src" "$SRC/vendor" docs/boxmaker/
cp -r "$SRC/assets/fonts" docs/boxmaker/assets/
```

Jangan salin `node_modules/`, `tools/`, `samples/` atau `package.json` — semuanya
hanya diperlukan semasa pembangunan.

## Kandungan

- `index.html`, `styles.css` — shell aplikasi
- `src/` — logik (geometri kotak, editor 2D, paparan 3D, penulis SVG)
- `vendor/` — three.js dan opentype.js (MIT)
- `assets/fonts/` — Inter, Roboto, Roboto Mono, Oswald, Bebas Neue, Lobster,
  Pacifico (OFL/Apache), dimuatkan hanya bila pengguna pilih font berkenaan

## Perubahan yang dibuat terus dalam salinan ini

**Amaran:** perubahan di bawah wujud dalam `docs/boxmaker/` sahaja. Kalau
langkah "Cara kemas kini" di atas dijalankan tanpa memindahkannya dahulu ke
projek asal, ia akan terpadam senyap. Pindahkan dahulu, atau salin semula
fail-fail ini selepas mengemas kini.

### Perpustakaan corak Islamik (alat "Pattern")

Corak bintang/girih yang dipotong tembus, dijana dengan kaedah Hankin
("polygons in contact") atas jubin 4.6.12, 3.12.12, 4.8.8, 6.6.6 dan 4.4.4.4.
Lubang sentiasa satu lebar jejari dari satu sama lain, dari sendi jari, mortis,
lubang engsel dan objek lain pada muka yang sama; kerf ditambah pada jejari.

- `src/geom/pattern.js` — **baharu**, modul tulen (tiada import). Penjana corak.
- `src/geom/decor.js` — jenis objek `pattern`: `makeObject`, `objectRings(obj, ctx)`,
  `patternInfo` (cache per panel).
- `src/geom/box.js` — satu baris: `pan.kerf` untuk pampasan jejari.
- `src/view2d.js`, `src/view3d.js`, `src/exportSvg.js`, `src/ui.js` (ringkasan) —
  hantar `{ panel, decor }` kepada `objectRings`; `view2d.hitTest` utamakan
  objek kecil di atas corak.
- `src/ui.js` — `patternGroup` (inspektor), `patternMenu` + pratonton.
- `src/main.js` — pengendali butang `pattern`.
- `index.html` — butang alat "Pattern".
- `styles.css` — `.pattern-list`; jalur alat telefon dirapatkan supaya 7 butang muat.

Ujian: `node scripts/test-boxmaker-pattern.mjs` (dari akar repo).
