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

- **Sentiasa tanya sebelum langkah 4.** Push ke `main` terus menjadi live di
  sifulaser.com — tiada staging, tiada peringkat semakan.
- **Bawa kerja sampai langkah 2 secara automatik**, kemudian berhenti dan
  lapor kepada Bos. Langkah 3–4 tunggu kelulusan.
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

## Sejarah

Kekalkan sejarah **lurus** — fast-forward sahaja, elakkan merge commit.

## Projek

- React 19 + TypeScript + Vite + Tailwind 4, auth & data melalui Firebase.
- `docs/` ialah output build yang di-serve GitHub Pages (domain: sifulaser.com).
- `firestore.rules` mengawal akses data — semak elok-elok bila ubah tier bayaran.
