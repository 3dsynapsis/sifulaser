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

**Sudah dipindahkan, kali terakhir pada 18 Oktober 2026.** Perubahan di bawah
mula-mula dibuat terus di sini. Pada 11 Oktober (corak Islamik) dan 18 Oktober
(Mihrab, Bulat, Falcata 2.6 mm) kesemuanya disalin balik ke projek asal
(`CLAUDE CODE/12_Box Maker`), jadi "Cara kemas kini" di atas selamat dijalankan.

Kalau perubahan dibuat terus di sini lagi, amaran lama terpakai semula: ia
wujud dalam `docs/boxmaker/` sahaja, dan menyalin dari projek asal tanpa
memindahkannya dahulu akan memadamnya senyap. Semak dengan
`diff -rq --strip-trailing-cr "../12_Box Maker/src" docs/boxmaker/src` sebelum
menyalin - ia mesti senyap.

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
- `src/ui.js` — `patternGroup` (inspektor), `patternMenu` + pratonton, dan
  `patternPresets`: kad corak dalam panel Overall (di bawah Box Style). Satu
  tekan memotong corak pada semua dinding (pilihan: dinding + penutup) terus
  dalam 3D — tak perlu masuk 2D. Objek preset ditanda `preset: true`.
- `src/store.js` — `clampDecor` memanggil `refitPattern`: corak yang memenuhi
  muka (`fit: true`) ikut saiz muka bila dimensi/tebal kotak berubah.
- `src/main.js` — pengendali butang `pattern`.
- `index.html` — butang alat "Pattern".
- `styles.css` — `.pattern-list`; jalur alat telefon dirapatkan supaya 7 butang muat.

Ujian: `node scripts/test-boxmaker-pattern.mjs` (dari akar repo).

### Ukuran dalam (suis Outside / Inside)

Length, Width dan Height boleh dibaca sebagai ukuran luar kotak atau ruang
bersih di dalamnya (`params.measure`). Pada Almari Laci, "dalam" ialah ruang
dalam setiap laci.

- `src/geom/box.js` — `dimMap`, `outsideFor`, `insideOf`; `buildBox` menukar
  ukuran dalam kepada ukuran luar sekali di atas dan `derived.dims` melaporkan
  kedua-dua bacaan dari kotak yang benar-benar dibina.
- `src/store.js` — `setMeasure` menukar bacaan tanpa menggerakkan kotak;
  `applyDesign` kini membina semula kotak (dulu tidak) dan design lama tanpa
  `measure` dibuka sebagai ukuran luar.
- `src/ui.js` — `dimensionRows` (suis, tiga medan, bacaan sebaliknya, amaran).
- `src/view3d.js`, `styles.css` — garisan ukuran berpindah ke muka dalam dan
  berlabel "inside".

Ujian: `npm test` dalam projek asal (bahagian "inside dimensions").

### Gaya Mihrab (kotak gerbang lunas, pintu berkembar)

**Dibuat terus di sini pada 16 Oktober 2026 dan BELUM dipindahkan ke projek
asal.** Pindahkan dahulu sebelum menjalankan "Cara kemas kini", atau gaya ini
hilang senyap.

Bentuk depan ialah gerbang lunas (keel arch, "bentuk mihrab"): dua sisi tegak,
bahu melengkung, larian lurus ke puncak yang dibulatkan sedikit. Pintu berkembar
bergerbang di depan, berpusing keluar pada pin kayu segi empat - pin bawah ke
dalam papan tapak, pin atas ke dalam bucu siling. Di atas siling, mahkota
berongga: gerbang dalam, gerbang belakang, dan bumbung sekeping papan 3 mm yang
dipotong living hinge (kerf) supaya boleh dibengkokkan.

- `src/geom/arch.js` — **baharu**, modul tulen. `solveKeel` (tangen sepunya
  bulatan bahu dan bulatan puncak), `keelPath` (garisan offset), `keelZ`,
  `strip` (panjang jalur bumbung pada garis tengah papan, zon lentur, titik dan
  normal), `livingHinge` (baris potongan berselang dengan jambatan).
- `src/geom/box.js` — `style: 'mihrab'`; panel `plinth`, `ceiling`, `doorLeft`,
  `doorRight`, `rib`, `roof` (+ `back`, `left`, `right`). Pintu membawa
  `hinge: { axis: 'v', u, n, sign }`; bumbung membawa `bend: { y0, path }` dan
  `noDecor`. Gaya lain tidak berubah (dibandingkan output 30 kes).
- `src/view3d.js` — pintu berpusing pada paksi tegak; bumbung dilukis bengkok
  (`bentPanel`); kamera dibingkai semula bila gaya/skala berubah, berundur bila
  kotak tidak muat pentas, dan di telefon membingkai di antara butang atas dan
  jalur kamera bawah.
- `src/ui.js` — kad "Mihrab", `mihrabRows` (tinggi gerbang, bulat bahu, tepi
  tapak, butang saiz biasa), preset corak memotong pintu ("Doors" / "Doors +
  walls"), jalur 2D tanpa bumbung, langkah pasang, Joints tanpa skru.
- `src/main.js` — label butang "Open the doors", nota export.

Ujian: `node scripts/test-boxmaker-mihrab.mjs` (dari akar repo) — memasang
semua panel dalam grid voksel 0.5 mm (0.1 mm di sekitar engsel), memastikan
tiada panel bertindih, setiap lubang terisi, dan setiap pintu berpusing 0-100°
tanpa melanggar.

### Mihrab: lapisan ukiran, baring, saiz corak sekali gus

**Ditambah terus di sini pada 17 Oktober 2026 dan BELUM dipindahkan ke projek
asal.**

- **Lapisan ukiran** (`mihrabCarve`, panel `ribFace` "Arch carving") — papan
  gerbang kedua dilekat pada muka depan gerbang dalam, di atas siling, masuk
  `max(2, 0.7t)` mm dari tepi gerbang. Corak dipotong tembus padanya dan gerbang
  dalam yang kosong kelihatan di belakang, jadi ia terbaca sebagai ukiran bila
  pintu dibuka. Bila dihidupkan ia terus mendapat corak pintu (atau Star 12),
  dan preset "Doors" kini termasuk lapisan ini.
- **Baring** (`mihrabLie`) — kotak yang sama, berbaring atas belakangnya dengan
  pintu di atas (dibuka seperti tudung). Tapak berhenti rata dengan belakang;
  tanon belakang masuk takuk terbuka di tepi tapak, bukan mortis. Paparan 3D
  memusingkan model (gerbang menghadap kamera) dan medan saiz dinamakan semula:
  Width / Length, base to arch tip / Height lying down.
- **Saiz corak sekali gus** — Overall → Pattern ada "Pattern size (mm)" dan
  "Bar width (mm)" yang menukar setiap corak preset serentak. Bertukar Doors /
  Doors + walls kini mengekalkan saiz itu (dahulu ia kembali ke lalai).

Ujian ditambah dalam `scripts/test-boxmaker-mihrab.mjs`: lapisan ukiran
melekat pada gerbang dalam dan duduk atas siling, pintu masih berpusing tanpa
menyentuhnya; dalam mod baring tapak, belakang, dinding dan bumbung semuanya
mencecah satah meja dan setiap takuk tapak diisi tanon belakang.

### Mihrab: kunci pintu (Cangkuk, Selak, Pasak mihrab)

**Ditambah terus di sini pada 17 Oktober 2026 dan BELUM dipindahkan ke projek
asal.** `mihrabLock`: `'notch'` (lubang jari, lalai - sama seperti dahulu),
`'hook'`, `'bolt'`, `'pin'`. Fungsi `mihrabLock()` dalam `src/geom/box.js`.

Kancing pusing biasa pada satu pintu TIDAK mengunci dua pintu yang sama-sama
dibuka keluar: pintu yang membawa kancing itu masih boleh dibuka dahulu. Jadi
ketiga-tiga kunci di sini mengikat kedua-dua pintu:

- **Cangkuk** (`hook`, `hookCap`, `hookPin`, `catchPin`, `catchCap`) - cangkuk
  berpusing pada pin di pintu kiri, jarinya jatuh atas pin berpenutup di pintu
  kanan. Muka dalam jari ialah lengkok berpusat pada pin cangkuk, jadi bila
  diangkat suku pusingan ia tidak menekan pin tangkapan.
- **Selak** (`boltGuide`, `boltCover`, `bolt`, `boltPeg`, `boltKnob`,
  `boltKeeper`, `keeperCover`) - selak meluncur dalam pemandu di pintu kiri ke
  penangkap di pintu kanan; tombol pada pin melalui alur pada penutup pemandu.
  Alur itu bersegi (jejari bucu 2x kelegaan): pin tombol segi empat, dan alur
  berhujung bulat menyekat bucunya di hujung gerakan.
- **Pasak mihrab** (`earLeft`, `earRight`, `lockPin`) - setiap pintu ada
  telinga bertanon menembusi pintu; mihrab kecil berkaki dua (rupa kotak itu
  sendiri, bertingkap) dijatuhkan melalui kedua-dua telinga.

Bahagian pada pintu membawa `attach: 'doorLeft' | 'doorRight'` (berpusing
bersama pintu dalam 3D), bahagian yang bergerak membawa `lockMove`
(`turn` atau `path`, koordinat kotak). `src/view3d.js` membuka kunci dahulu
(~0.8 s, ikut masa) sebelum pintu berpusing, dan menguncinya semula selepas
pintu tertutup. Saiz rupa kunci membesar dengan lebar kotak (hingga 2.2x pada
308 mm ke atas); kelegaan dan pegangan tidak. Kad pilihan kunci dalam
`src/ui.js` dilukis daripada geometri kunci sebenar (pandangan depan).

Ujian dalam `scripts/test-boxmaker-mihrab.mjs`: semua bahagian dipasang tanpa
bertindih dan setiap lubang kunci terisi; terkunci, setiap pintu tersekat
dalam 4 darjah pertama; gerakan buka kunci (langkah <= 0.5 mm) tidak
melanggar; selepas dibuka setiap pintu dengan bahagiannya berpusing 0-100
darjah tanpa menyentuh pintu satu lagi, kunci atau badan kotak. Mutasi
(penutup pin terlalu kecil, selak tidak masuk penangkap, pasak tidak diangkat,
jari cangkuk terlalu rapat, alur selak berhujung bulat) semuanya ditangkap.

### Bahan Falcata 2.6 mm

Ditambah terus di sini pada 17 Oktober 2026 (`src/store.js`, `MATERIALS`:
`falcata26`, kerf 0.2 seperti Falcata 3 mm). BELUM dipindahkan ke projek asal.

### Gaya Bulat (kotak silinder)

**Dibuat terus di sini pada 17 Oktober 2026 dan BELUM dipindahkan ke projek
asal.**

Dinding ialah jalur living hinge (kerf sepanjang jalur) yang dibengkokkan jadi
silinder; kedua hujungnya bertemu dengan dovetail (lebar di hujung, jadi tidak
tertarik keluar ikut lilitan). Lebih daripada 560 mm, dinding dipotong beberapa
jalur, setiap sambungan dovetail yang sama. Dinding berdiri dalam alur: cakera
lantai di dalam, cincin di luar, kedua-duanya di atas cakera tapak. Penutup =
cakera selebar tapak + cakera palam di bawahnya (kelonggaran `lidSlack`).

- `src/geom/box.js` — `style: 'round'`, `roundLid`; panel `plinth`, `floorDisc`,
  `ring`, `wall` (+ `wall2`..`wall6`), `lidTop`, `lidPlug`. Length = diameter,
  width ikut length. Dinding: `bend: { plane: 'xy', z0, path }`.
- `src/view3d.js` — `bentPanel` kini dua satah ('xz' bumbung mihrab, 'xy'
  dinding bulat); garisan ukuran Ø dan tinggi.
- `src/ui.js` — kad "Bulat", `roundRows` (penutup, tepi tapak, kelonggaran,
  saiz biasa Ø 120 × 90), medan Diameter, preset corak pada penutup sahaja,
  langkah pasang.
- `src/main.js` — butang buka disorok bila tiada penutup; nota export.

Ujian: `node scripts/test-boxmaker-round.mjs`. Alat voksel dikongsi dengan
ujian Mihrab dalam `scripts/lib/boxmaker-voxel.mjs`.

### Kelonggaran pintu Mihrab dan tutup berengsel

Seorang pelanggan (18 Oktober 2026) tidak dapat menurunkan siling ke atas pintu
Mihrab: takuk pintu memberi bucu siling hanya 0.3 mm di atas dan bawah dan
0.5 mm di tepi, dan dia terpaksa mengoreknya dengan pisau.

- `src/geom/box.js` — `doorGap` (asal 0.6 mm) tetapan sendiri untuk pintu
  Mihrab, menggantikan `lidGap`: ruang atas, bawah dan tepi bucu siling dalam
  takuk, di kaki pintu, dan antara dua pintu. Hujung kedua-dua pin pintu
  dibulatkan (lead-in) supaya lubang menjumpai pin walaupun tersasar sedikit.
  `derived.mihrab.clear` melaporkan setiap ruang.
- `src/ui.js` — "Door gap (mm)" di bawah kunci pintu Mihrab, "Lid gap (mm)"
  untuk Lidded dan Double (`lidGap`, kekal 0.3 mm), dan peringatan untuk
  mengukur tebal papan sebenar di bawah Board thickness.
- `scripts/test-boxmaker-mihrab.mjs` — semakan lebar pintu kini membaca
  `doorGap`.

Kemudian pada hari yang sama, puncanya yang sebenar: takuk itu ialah **poket
yang bertutup di atas oleh gerbang pintu sendiri** (9 hingga 25 mm kayu), terbuka
hanya ke tepi luar pintu, sedangkan bucu siling duduk dalam satah pintu. Siling
dipasang terakhir dari atas, jadi ia tidak boleh turun langsung - berapa pun
ruangnya. Kini takuk **terbuka ke atas**: gerbang pintu berhenti di sisi dalam
takuk (`keelPath(..., { from: notchW })`), dan setiap pintu ada alur selebar
takuk di bahu luarnya. Langkah pasang "Ceiling goes on last" disemak semula.

Bos tidak suka alur penuh itu, jadi ia dikecilkan dan ditutup semula (pilihan 3):

- Bucu siling dikecilkan kepada saiz yang cukup untuk memegang pin sahaja
  (`xB = xp + bossM + ...`), jadi alur di bahu pintu 5.6 mm, bukan 7.6 mm.
- Kepingan yang dipotong itu menjadi part sendiri, `shoulderLeft` /
  `shoulderRight` (`attach` pada pintu masing-masing, `noDecor`). Selepas
  siling dipasang, ia ditekan semula ke dalam alur dan digam pada pintu sahaja.
  Ia duduk 0.6 mm di atas bucu siling, dan dikunci dengan dovetail supaya tidak
  tergelincir keluar ke tepi. Langkah pasang "Glue the shoulders back" ditambah.

Ujian: `npm test` dalam projek asal (bahagian "the ceiling can come straight
down", "the shoulder piece makes the arch whole again", "mihrab door gap" dan
"lid gap"). Ujian voksel dalam
`scripts/test-boxmaker-mihrab.mjs` menyemak pertindihan dan pusingan pintu
sahaja, bukan laluan pemasangan - sebab itu masalah ini terlepas.

### Gaya Mihrab 2.0 (depan dua lapis)

Diminta Bos pada 18 Oktober 2026 berdasarkan gambar kotak mihrab yang dijual di
pasaran: ambil kelebihannya, terutama dua lapis. Gaya baharu `style: 'mihrab2'`,
kad "Mihrab 2.0"; Mihrab yang asal tidak berubah. Versi pertama (muka depan
tinggi di hadapan badan berbumbung rata) diganti pada hari yang sama - lihat
semakan kedua di bawah. Yang kekal dari versi pertama:

- **Tympanum** di atas pintu (`m2Tympanum`): `'sunburst'` (asal), mana-mana corak
  Islamik, atau `'plain'` (terbuka untuk cetakan atau kaligrafi), atas transom.
- **Pintu** di belakang papan depan, `doorGap` (0.6 mm) dari bukaan di semua
  sisi, pin persegi ke lantai dan siling, terbuka kira-kira 95° (bingkai yang
  menahannya; `hinge.angle`, diikut oleh `src/view3d.js`). Tiada bahagian pintu
  di atas siling, jadi siling terus turun ke atas pin.
- **Medalion** (`medallion`), roset berlekuk dengan bintang khatam, atas transom.
- **Kunci** sama seperti Mihrab, saiznya menyesuaikan diri supaya muat dalam
  bukaan semasa dikunci, dibuka dan pintu dihayun; kalau tidak muat langsung,
  kunci seterusnya dipasang (Selak / Pasak -> Cangkuk -> lubang jari) dengan
  amaran (`derived.mihrab2.lock.wanted`).
- **Empat ruang** - memilih Mihrab 2.0 menetapkan 4 ruang dan Cangkuk.
- `src/geom/pattern.js` - `clipToConvex()` baharu.

### Mihrab 2.0, semakan kedua (18 Oktober 2026)

Bos tidak suka versi pertama: gerbang di atas hanya sekeping papan tercacak
tanpa apa-apa di belakangnya, dan dua lapisnya nampak pelik (satu plat
berlubang di seluruh muka, pintu kosong). Dikaji semula daripada 9 gambar
kotak rujukan dan cara kabinet bergerbang dibuat. Kotak itu dibina seperti
**sandwich**, dan dua lapis dipakai pada setiap muka, bukan satu plat:

- **Badan sandwich.** `back` kini bentuk mihrab penuh, sama dengan muka depan.
  Dinding sisi naik hingga kaki gerbang, dan satu jalur kerf lentur (`roof`,
  seperti Mihrab asal) membumbungi gerbang dari dinding ke dinding, bertab ke
  dalam slot di papan depan dan belakang. Muka dan belakang tersembul satu
  tebal papan di sekeliling bumbung. Hujung gerbang bumbung sebulat yang boleh
  dilentur (jejari luar sekurang-kurangnya `max(10, 3.3t)`); bucu muka kekal
  tajam.
- **Pintu dua lapis.** Setiap pintu ada grid tingkap (3 lajur), rel padu di
  tengah untuk kunci, dan papan jali (`jaliLeft`, `jaliRight`) digam di
  belakangnya dengan satu roset di setiap tingkap (`m2Door`, asal `bintang12`
  pada sudut sentuhan terbesar - bintang kecil dengan kelopak memancar).
  Tingkap tengah bercantum menjadi tingkap panjang untuk cetakan
  (`m2DoorPrint`).
- **Rantai quatrefoil.** Rel luar dan dalam nipis (`max(2, 0.8t)`), quatrefoil
  lebih besar dengan penyambung kecil di antaranya, dan rantai yang sama
  merentas transom. Tanon dinding sisi dan tab bumbung diletak **dalam celah
  rantai sahaja**, di bawah kayu bingkai yang padu, jadi semuanya tersorok
  walaupun rel luar nipis.
- **Sisi.** Kekisi girih penuh dari muka ke belakang dan dari kaki ke kaki
  gerbang, rata dengan tepi kedua-dua papan.
- **3D.** Papan sandar (`shade: 'backing'` - papan depan, dinding sisi)
  dipapar gelap dan papan jali (`'recess'`) sedikit gelap, supaya lapisan
  hadapan terbaca seperti dalam gambar.
- Siling kini masuk dari atas melalui saluran terbuka di bahagian atas dinding
  sisi (ditutup oleh kekisi), dan belakang ditolak masuk dari belakang.
  Langkah pasang ditulis semula. Kumpulan "Pattern" disembunyikan untuk gaya
  ini - coraknya dipilih dalam baris Mihrab 2.0 sendiri.
- Saiz standard kini 200 × 100 × 280 mm (perkadaran kotak dalam gambar).

Ujian (bahagian "mihrab 2.0", `npm test` projek asal): bumbung lentur
disampel dalam 3D terhadap setiap papan; empat laluan pemasangan (siling
turun, belakang dari belakang, bumbung, muka dari depan); hayunan pintu
bersama jali dan kunci; lubang jali hanya di belakang tingkap; tanon dan slot
tersorok di bawah bingkai; bibir bumbung satu papan; saiz dalam diukur.
Ujian mutasi: 25 cara rosak yang munasabah, kesemuanya ditangkap.

## Perubahan terus: senarai alat galeri (24 Oktober 2026)

`src/designs.js` - senarai `TOOLS` ditambah `converter`, `rehal`, `plakbox` dan `tray` supaya reka bentuk dari
alat itu yang muncul dalam "Reka bentuk saya" boleh dibuka (ia membawa ke
`/<alat>/?design=<id>`). Tanpanya baris itu tidak berbuat apa-apa bila
ditekan. Perubahan ini dibuat terus dalam salinan `docs/`: salin baris yang
sama ke projek sumber sebelum menyalin semula alat ini, kalau tidak ia hilang
senyap.
