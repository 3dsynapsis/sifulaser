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
cp -r "$SRC/src" docs/puzzle/
```

Jangan salin `tools/` atau `package.json` — hanya diperlukan semasa pembangunan.

## Nota

Bentuk knob dan jalan rawak diport dari penjana Draradech supaya seed yang sama
menghasilkan puzzle yang sama. Yang kita tambah: pampasan kerf (melebarkan kepala
tab supaya cengkaman kekal selepas laser makan bahan) dan amaran bila tab + jitter
terlalu tinggi sehingga garisan bersilang.
