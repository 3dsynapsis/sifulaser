# Tray Organizer

Aplikasi statik untuk mereka dulang organizer berpetak - petak tak seragam,
pembahagi di sebarang kedudukan - dalam DUA mod atas satu susun atur:

- **Laser cut**: panel finger joint, half-lap pada setiap persilangan, output
  SVG berlapisan (`src/geom/tray.js`).
- **Cetak 3D**: satu jasad pepejal manifold dengan dinding senipis perimeter
  nozzle, fillet, lantai, pilihan kaki boleh susun, output STL binari
  (`src/geom/tray3d.js`). Digabungkan ke dalam alat yang sama dan bukan tile
  baharu, mengikut preseden Cake Topper yang ada butang STL di sebelah SVG.
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

Cetak 3D, ~530 semakan ke atas `src/geom/tray3d.js`: mesh MANIFOLD (setiap
tepi dikongsi tepat dua segitiga arah bertentangan - itulah yang Bambu Studio
dan Orca semak), isi padu mesh = isi padu analitik, bbox tepat, tiada segitiga
merosot, STL binari 84 + 50n bait dengan normal unit - untuk fillet 0 dan bukan
0, pembahagi rendah dan separas rim, kaki boleh susun, grid 1x1 hingga 12x12.

Jalankan kedua-duanya sebelum setiap commit yang menyentuh geometri.

## Gambar tile

```bash
node scripts/thumb-tray.mjs
```

Menulis `docs/images/tools/tray.svg` daripada `buildTray()` sebenar - pandangan
atas dulang dengan petak tak seragam. Dijana, bukan dilukis, atas sebab yang
sama seperti tujuh tile lain: gambar yang dibuat daripada output alat tidak
boleh hanyut daripada alat.

## Kandungan

- `index.html`, `styles.css` - rangka aplikasi
- `src/geom/tray.js` - geometri laser: dinding, lantai, pembahagi, half-lap, slot, kerf
- `src/geom/tray3d.js` - geometri cetak: satu cangkerang manifold (rangka pembahagi
  pada paras sendiri, fillet, kaki boleh susun), isi padu, katil printer, penulis STL
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
