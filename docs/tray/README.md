# Tray Organizer

Aplikasi statik untuk mereka dulang organizer laser cut berpetak - petak tak
seragam, pembahagi di sebarang kedudukan, half-lap pada setiap persilangan.
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
node scripts/test-tray.mjs
```

~9,600 semakan ke atas `src/geom/tray.js`: bilangan panel, setiap gelang
ringkas (tiada silangan sendiri), mortis menerima tenon dalam ruang dunia
(termasuk dinding belakang dan kiri yang u-nya terbalik), half-lap pada setiap
persilangan separuh tinggi, slot 'alih' selebar t + slack, kerf, dan input
teruk yang tidak pernah campak. Jalankan sebelum setiap commit yang menyentuh
geometri.

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
- `src/geom/tray.js` - geometri: dinding, lantai, pembahagi, half-lap, slot, kerf
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
