# Tray Organizer

Aplikasi statik untuk mereka dulang organizer berpetak - petak tak seragam,
pembahagi di sebarang kedudukan - dalam DUA mod atas satu susun atur:

- **Laser cut**: panel finger joint, half-lap pada setiap persilangan, output
  SVG berlapisan (`src/geom/tray.js`).
- **Cetak 3D**: satu jasad pepejal manifold dengan dinding senipis perimeter
  nozzle, fillet, lantai, pilihan kaki boleh susun, output STL binari
  (`src/geom/tray3d.js`). Digabungkan ke dalam alat yang sama dan bukan tile
  baharu, mengikut preseden Cake Topper yang ada butang STL di sebelah SVG.

Dalam mod cetak setiap petak boleh **dibelah sendiri** (`src/geom/layout.js`):
susun atur ialah pokok belahan, bukan grid, jadi satu petak panjang untuk sudu
boleh duduk di sebelah 2x2. Mod laser kekal dengan grid cols x rows - sendi T
laser (tenon masuk mortis pada pembahagi lain) belum dibina. Pokok disimpan
dalam `params.layout`; selagi ia null, mod cetak menerbitkannya daripada grid
laser, dan "Guna semula grid mod laser" membuangnya.

Ia **bukan** sebahagian daripada build Vite - fail di sini dihidangkan terus
oleh GitHub Pages di `sifulaser.com/tray/`, dan halaman React `#/tray`
memuatkannya dalam iframe.

Kerana `vite.config.ts` menetapkan `emptyOutDir: false` dan skrip build hanya
memadam `docs/assets`, folder ini kekal setiap kali `npm run build` dijalankan.

## Sumber tinggal DI SINI

Berbeza daripada alat lain, tiada folder sumber luar dan tiada skrip vendor.
`docs/tray/` ialah satu-satunya salinan. Ubah di sini, uji, commit.

Ini yang pertama. Alat lain disalin daripada projek berasingan (`12_Box Maker`,
`26_UV Print Calculator`...) dan vendoring ialah `cp index.html`, sebab itu
setiap README jiran mengingatkan supaya tag analitik dan export-gate diletak
dalam sumber. Di sini sumber dan docs ialah fail yang sama, jadi amaran itu
tidak terpakai - tetapi dua tag itu masih WAJIB ada dalam `index.html`.

## Jenama di tapak

STL cetak 3D membawa "sifulaser.com" terbenam di tengah tapak (atau di bawah
kaki bila boleh disusun), dicerminkan supaya terbaca bila dulang
diterbalikkan - `/shared/deboss.js`, 21 Oktober 2026. Dalamnya 0.6 mm tetapi
sentiasa meninggalkan sekurang-kurangnya 1 mm lantai: lantai 1.4 mm dapat
0.4 mm, lantai di bawah 1.4 mm tiada jenama. Isi padu analitik menolak
isipadu huruf.

## Ujian

```bash
node scripts/test-tray.mjs      # laser
node scripts/test-tray3d.mjs    # cetak 3D
```

Laser, ~9,600 semakan ke atas `src/geom/tray.js`: bilangan panel, setiap gelang
ringkas (tiada silangan sendiri), mortis menerima tenon dalam ruang dunia
(termasuk dinding belakang dan kiri yang u-nya terbalik), half-lap pada setiap
persilangan separuh tinggi, slot 'alih' selebar t + slack, kerf, dan input
teruk yang tidak pernah campak.

Cetak 3D, ~1,300 semakan ke atas `src/geom/tray3d.js` dan `layout.js`: mesh
MANIFOLD (setiap tepi dikongsi tepat dua segitiga arah bertentangan - itulah
yang Bambu Studio dan Orca semak), isi padu mesh = isi padu analitik, bbox
tepat, tiada segitiga merosot, STL binari 84 + 50n bait dengan normal unit -
untuk fillet 0 dan bukan 0, pembahagi rendah dan separas rim, kaki boleh susun,
grid 1x1 hingga 12x12, susun atur sudu / simpang T / bersarang / petak dalaman,
60 pokok rawak (PRNG bertitik benih), dan dulang 100 petak. Operasi pokok
(belah, buang, seret, taip saiz) disemak: petak + pembahagi = ruang dalam,
tiada pertindihan, had petak dihormati, jiran tidak bergerak bila dibelah.

Jalankan kedua-duanya sebelum setiap commit yang menyentuh geometri.

## Gambar tile

`docs/images/tools/tray.webp` ialah foto 3D alat ini sendiri (laser cut lalai,
6 petak), sejak 17 Oktober 2026 - dahulu SVG pandangan atas yang dijana. Foto
boleh jadi basi; ambil semula selepas apa-apa perubahan rupa:

```bash
cd docs && python3 -m http.server 8765      # terminal lain
node scripts/tile-shots.mjs docs/images/tools tray
```

## Kandungan

- `index.html`, `styles.css` - rangka aplikasi
- `src/geom/tray.js` - geometri laser: dinding, lantai, pembahagi, half-lap, slot, kerf
- `src/geom/tray3d.js` - geometri cetak: satu cangkerang manifold (rangka pembahagi
  pada paras sendiri, fillet, kaki boleh susun), isi padu, katil printer, penulis STL
- `src/geom/layout.js` - pokok belahan mod cetak: bentangan, belah, buang, seret, taip saiz
- `src/geom/path.js`, `label.js`, `hershey-sans.js` - dikongsi dengan Box Maker (salinan)
- `src/store.js` - keadaan, undo, simpan ke localStorage, operasi grid (belah/buang/seret)
- `src/grid.js` - editor grid pandangan atas, boleh seret dan sentuh
- `src/ui.js` - inspector
- `src/view3d.js` - pratonton three.js, ditonjolkan daripada gelang yang sama yang dieksport
- `src/view2d.js` - fail potong dilukis melalui `nest()` pengeksport
- `src/export.js` - susun atur kepingan dan penulis SVG (Potong merah, Label kelabu)
- `src/texture.js` - permukaan papan untuk 3D (salinan daripada Box Maker)
- `vendor/` - three.js dan OrbitControls (MIT), salinan daripada Box Maker

## Rujukan reka bentuk

- Idea editor: Bento3D (bento3d.design) - belah petak, seret pembahagi.
- Geometri half-lap: boxes.py `TypeTray` (`SlottedEdge(..., slots=0.5*hi)` pada
  arah bertentangan) dan Box Maker `buildDivider()` untuk kes 4 petak.
- Gaya 'alih': boxes.py `DividerTray` - slot dinding dengan `extra_slack` 0.2 mm.
