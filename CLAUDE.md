# Panduan Kerja — SifuLaser

## Aliran kerja wajib (safety line)

Setiap perubahan ikut 4 langkah ni. Jangan skip langkah 2.

1. **Kerja + commit** atas branch kerja (bukan terus `main`)
   ```bash
   git add -A && git commit -m "<mesej BM>"
   ```

2. **Push branch dahulu — jaring keselamatan**
   ```bash
   git push -u origin <branch-kerja>
   ```
   Selepas ni kerja selamat di GitHub walaupun container mati. Belum live.
   Push ke branch kerap-kerap; jangan simpan kerja lama-lama tanpa push.

3. **Pindah ke main** (fast-forward, kekalkan sejarah lurus)
   ```bash
   git checkout main && git merge <branch-kerja>
   ```

4. **Push ke main — ini yang buat ia LIVE**
   ```bash
   git push -u origin main
   ```

## Peraturan

- **Jalankan sampai langkah 4 tanpa tanya.** Bos beri kebenaran tetap pada
  28 Ogos 2026: tak perlu minta kelulusan untuk push ke `main`.
- Tetapi ingat push ke `main` terus menjadi live di sifulaser.com — tiada
  staging, tiada peringkat semakan. Jadi **sahkan dahulu sebelum push**:
  `npm run typecheck`, `npm run build`, dan lihat perubahan itu dalam
  pratonton. Selepas push, semak laman sebenar.
- Langkah 1–2 (commit + push branch) kekal wajib. Branch itu jaring
  keselamatan; jangan commit terus atas `main`.
- **Build dahulu sebelum push** kalau ada perubahan dalam `src/`.
  GitHub Pages serve dari folder `docs/`, jadi perubahan `src/` sahaja
  TIDAK akan nampak di laman sebenar:
  ```bash
  npm run typecheck && npm run build
  ```
  Commit hasil build dalam `docs/` bersama perubahan `src/`.

## Gaya commit

- Mesej dalam **Bahasa Melayu**, deskriptif, satu baris.
- Terangkan kesan kepada pengguna, bukan fail yang disentuh.
- Contoh sedia ada:
  - `Tambah baris Lokasi pada butiran kelas`
  - `Papar harga asal RM500 dicoret di sebelah RM250`
  - `Panel Admin: bezakan peserta kelas dan pelanggan digital`

## Analitik

Setiap halaman ada snippet Cloudflare Web Analytics sebelum `</body>`.
Ia diletak dalam **sumber** setiap alat, bukan hanya dalam `docs/`, sebab alat
di-vendor dengan menyalin `index.html` — kalau snippet itu hidup dalam `docs/`
sahaja, ia akan terpadam senyap kali berikutnya mana-mana alat dikemas kini.

Kalau tambah alat baharu, salin snippet itu ke `index.html` alat tersebut.

Alat juga memuatkan `/shared/export-gate.js`, yang minta pengguna daftar masuk
sebelum boleh muat turun. Tag itu pun diletak dalam **sumber** alat atas sebab
yang sama. Alat kekal percuma untuk diguna — gate itu hanya pada butang Export,
dan ia corong jualan, bukan kunci: bendera yang dibacanya localStorage biasa.

## Jenama dalam fail export

Setiap fail yang dimuat turun dari alat membawa "by sifulaser.com" — dalam
fail sahaja, tidak pernah dipotong atau diukir pada produk:

- **SVG / PDF**: tulisan hijau satu garisan dalam jalur 10 mm baharu di bawah
  semua keping, lapisan/kumpulan sendiri (`sifulaser-brand`).
- **STL**: pengepala fail, dan "sifulaser.com" terbenam 0.6 mm di tengah
  tapak, dicerminkan supaya terbaca bila objek diterbalikkan (Plak Box,
  Tray Organizer). Cake Topper tiada tapak — pengepala sahaja.
- **Nama fail**: awalan `sifulaser-`.

SVG/PDF/STL-pengepala/nama dibuat oleh `/shared/brand.js`, yang dimuat oleh
`/shared/export-gate.js` dan menangkap setiap muat turun Blob + `<a download>`
— tiada perubahan dalam alat. Alat baharu mendapatnya selagi ia memuatkan
export-gate. Tulisan terbenam STL ialah geometri, jadi ia dalam penjana jasad
alat itu sendiri melalui `/shared/deboss.js`. Ujian: `node scripts/test-brand.mjs`.

## Sejarah

Kekalkan sejarah **lurus** — fast-forward sahaja, elakkan merge commit.

## Projek

- React 19 + TypeScript + Vite + Tailwind 4, auth & data melalui Firebase.
- `docs/` ialah output build yang di-serve GitHub Pages (domain: sifulaser.com).
- `firestore.rules` mengawal akses data — semak elok-elok bila ubah tier bayaran.
