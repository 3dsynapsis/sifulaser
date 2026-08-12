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
| `paidUntil` | Timestamp \| null | Tarikh luput; `null` = tiada luput |
| `createdAt` | Timestamp | Tarikh daftar |

Pembahagian akses:

- **Percuma** — Simulator Level 1 (Cermin), Kedai Laser, About Me
- **Akses Penuh (RM250)** — Level 2-5 + semua panduan Maintenance

### Cara naikkan taraf pengguna ke Akses Penuh

1. Pengguna log masuk sekali di <https://sifulaser.com> (rekod dicipta
   automatik dengan `paid: false`).
2. Pengguna bayar dan WhatsApp anda.
3. Buka [Firestore → koleksi `users`](https://console.firebase.google.com/project/sifulaser/firestore/databases/-default-/data/~2Fusers),
   cari dokumen dengan email tersebut.
4. Tukar `paid` kepada `true`. Untuk langganan bertempoh, isi `paidUntil`
   dengan tarikh luput; biarkan `null` untuk akses selamanya.
5. Perubahan berkuat kuasa serta-merta — skrin pengguna dikemas kini tanpa
   perlu refresh.

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
