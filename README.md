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

## Struktur

- `src/levels.ts` — config semua level simulator (nombor, label, skru, imej)
- `src/lib/sim.ts` — pemalar & fungsi simulasi (threshold, preset, langkah)
- `src/lib/settings.ts` — simpan/muat tetapan localStorage
- `src/data/maintenance.ts` — kandungan panduan weekly, yearly, WiFi, chiller
- `src/data/shop.ts` — produk kedai Shopee LCM Supplies
- `src/hooks/` — `useAlignmentSim`, `useStraightProcedure`, `useHashRoute`
- `src/pages/` — halaman utama, maintenance, kedai, about
- `src/components/` — komponen UI simulator; `App.tsx` susun layout grid
