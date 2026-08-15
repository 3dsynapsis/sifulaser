# SifuLaser

Aplikasi latihan operator mesin laser cut oleh **Mahligai Seni** — simulator
alignment cermin, panduan maintenance, setup WiFi dan setting chiller.

Live: <https://sifulaser.com>

## Stack

- Vite 7 + React 19.2.8 (pin tepat)
- TypeScript
- Tailwind CSS 4.3.3 melalui `@tailwindcss/vite`
- lucide-react untuk ikon

## Cara build

```bash
npm ci
npm run build     # output ke docs/ (padam asset index-* lama dulu)
```

`vite.config.ts` menetapkan `base: '/'` dan `outDir: 'docs'` dengan
`emptyOutDir: false` supaya `docs/images/`, `docs/favicon.svg`, `docs/CNAME`
dan `docs/.nojekyll` tidak dipadam.

Untuk development: `npm run dev`.

## Deploy

GitHub Pages dihidangkan dari branch `main`, folder `/docs`. Push ke `main`
akan auto-deploy dalam 1-2 minit. Fail `docs/CNAME` mengekalkan custom domain
`sifulaser.com` (DNS diuruskan di Cloudflare).

## Akaun & akses berbayar

Login menggunakan Google (Firebase Auth, projek `sifulaser`). Status bayaran
disimpan di Firestore, koleksi `users`, satu dokumen per pengguna:

| Medan | Jenis | Maksud |
|---|---|---|
| `email` | string | Email akaun Google |
| `name` | string | Nama paparan |
| `paid` | boolean | `true` = Akses Penuh |
| `paidUntil` | Timestamp \| null | Tarikh luput langganan |
| `plan` | `'full'` \| `'class'` \| null | Pakej yang dibeli |
| `createdAt` | Timestamp | Tarikh daftar |

Pembahagian akses:

- **Percuma** — Simulator Level 1 (Cermin), About Me & Kedai Laser
- **Akses Penuh (RM250 / 2 tahun)** — Level 2-5 + semua panduan Maintenance

### Panel Admin

Log masuk di <https://sifulaser.com> dengan akaun admin
(`3dsynapsis@gmail.com`), kemudian tekan butang **Panel Admin** pada kad akaun
di halaman utama — atau terus ke <https://sifulaser.com/#/admin>.

Di sana anda boleh:

- Lihat semua akaun berserta status (Percuma / Akses Penuh sehingga tarikh X /
  Luput), penanda Peserta Kelas, dan bila mereka mendaftar
- Ringkasan: jumlah akaun, Akses Penuh, Peserta Kelas (x/10 tempat), Percuma
- Tapis mengikut Semua / Akses Penuh / Peserta Kelas / Percuma, dan cari
  mengikut nama atau email
- **Beri Akses** (oren) — luluskan pakej digital sahaja
- **Beri Kelas** (ungu) — luluskan dan tandakan sebagai peserta kelas
  bersemuka; kedua-duanya memberi akses digital 2 tahun yang sama
- **Lanjut** — pembaharuan; tempoh baharu disambung dari tarikh luput sedia
  ada, bukan dari hari ini, jadi pelanggan tidak rugi baki hari
- **Tarik** — batalkan akses serta-merta

Pelanggan yang sudah ditanda sebagai peserta kelas tidak akan diturunkan
semula ke pakej digital walaupun butang oren ditekan kemudian.

Perubahan berkuat kuasa serta-merta pada skrin pelanggan tanpa perlu refresh.

### Email automatik

Setiap kali **Beri Akses**, **Beri Kelas** atau **Tarik** ditekan, pelanggan
menerima email pemberitahuan secara automatik — ucapan tahniah, tarikh luput
akses, dan pautan terus ke <https://sifulaser.com>.

Email dihantar melalui [EmailJS](https://emailjs.com). Log masuk Gmail di
browser **tidak** memberi laman ini kuasa menghantar email; akaun Gmail perlu
disambungkan sekali di EmailJS, dan server merekalah yang menghantar.

Setup sekali sahaja:

1. Daftar di <https://emailjs.com>, sambungkan `sifulaser@gmail.com` sebagai
   **Email Service**.
2. Cipta satu **Email Template** dengan tetapan:
   - To Email — `{{to_email}}`
   - Subject — `{{subject}}`
   - Content — `{{{message_html}}}` (tiga kurungan, supaya HTML terpapar)
3. Salin Service ID, Template ID dan Public Key ke dalam `MAIL_CONFIG`
   di `src/lib/mail.ts`, kemudian `npm run build` dan commit folder `docs/`.
4. Di EmailJS, buka **Account → Security → Allowed Origins** dan hadkan kepada
   `https://sifulaser.com`. Public Key memang terdedah dalam bundle browser,
   jadi sekatan domain inilah yang menghalang orang lain menyalahguna kuota.

Selagi `MAIL_CONFIG` kosong, panel berfungsi seperti biasa tetapi tiada email
dihantar — nota di bawah senarai akan menyatakan ia belum diaktifkan. Jika
email gagal dihantar, akses **tetap** tersimpan dan panel memaparkan amaran
supaya anda boleh memaklumkan pelanggan secara manual.

Teks email boleh diubah dalam fungsi `buildMail` di `src/lib/mail.ts`.

Kuasa admin dikuatkuasakan di `firestore.rules`, bukan di app sahaja: hanya
email admin (yang disahkan Google) boleh membaca semua rekod dan mengemas kini
medan `paid`/`paidUntil`. Menukar kod di browser tidak memberi sesiapa akses.

Apabila `paidUntil` sudah lepas, akaun kembali ke pakej Percuma secara
automatik. Firebase Console masih boleh digunakan jika perlu, tetapi Panel
Admin lebih pantas untuk kerja harian.

Security rules (`firestore.rules`) memastikan pengguna hanya boleh membaca
rekod sendiri dan **tidak boleh** menukar status bayaran sendiri. Hanya admin
melalui Firebase Console boleh berbuat demikian.

> **Nota keselamatan:** peringkat ini mengunci kandungan di peringkat paparan.
> Orang yang mahir teknikal masih boleh membaca teks panduan dalam bundle
> JavaScript. Untuk perlindungan penuh, kandungan berbayar perlu dipindahkan
> ke Firestore dan dilindungi security rules.

## Struktur

- `src/levels.ts` — config semua level simulator (nombor, label, skru, imej)
- `src/lib/sim.ts` — pemalar & fungsi simulasi (threshold, preset, langkah)
- `src/lib/settings.ts` — simpan/muat tetapan localStorage
- `src/data/maintenance.ts` — kandungan panduan weekly, yearly, WiFi, chiller
- `src/data/shop.ts` — produk kedai Shopee LCM Supplies
- `src/hooks/` — `useAlignmentSim`, `useStraightProcedure`, `useHashRoute`
- `src/pages/` — halaman utama, maintenance, kedai, about
- `src/components/` — komponen UI simulator; `App.tsx` susun layout grid
