# Skrip

## `build-legal.mjs` - page polisi (Terma, Privasi, Refund, Ambil Sendiri, Hubungi)

Menjana `docs/terma/`, `docs/privasi/`, `docs/refund/`, `docs/ambil/`,
`docs/hubungi/` dan `docs/shared/legal.css` daripada `src/data/company.ts` -
sumber yang sama dengan footer laman (`src/components/LegalFooter.tsx`). Fail
statik dengan URL sebenar, bukan route `#/`, kerana pemeriksa gerbang
pembayaran (Bayarcash) dan enjin carian membaca laman tanpa JavaScript.

Butiran syarikat ikut sijil SSM SYNAPSIS ENTERPRISE (alamat UTAMA 44A Jalan
Keluli AK7/AK). Keputusan Boss 20 Oktober 2026: ambil sendiri di Shah Alam
sahaja (tiada pos), siap 3-5 hari bekerja, disimpan 30 hari, bayaran balik
penuh hanya sebelum kerja bermula.

```bash
node scripts/build-legal.mjs && node scripts/build-llms.mjs && npm run build
```

`build-llms.mjs` juga membaca `company.ts`: sitemap memuatkan page polisi, dan
llms.txt serta JSON-LD membawa nama syarikat dan alamat.

## `blog-screenshots.mjs` — gambar untuk halaman episod blog

Setiap episod di `#/blog` memaparkan satu screenshot alat, dengan butang
**Salin gambar** di bawahnya. Sebabnya: bila siaran itu dihantar ke WhatsApp,
teks sahaja tak cukup — pembaca mahu nampak rupa alat. Sebelum ini gambar itu
kena diambil sendiri (buka alat, susun design, screenshot). Sekarang ia sudah
sedia atas halaman.

Gambar disimpan dalam `docs/images/blog/`, dinamakan ikut nombor episod, dan
dirujuk dari medan `image` dalam `src/data/blog.ts`.

### Bila perlu jalankan semula

- Tambah episod baharu (tambah satu entri dalam `SHOTS`).
- Rupa alat berubah sampai gambar lama tak lagi mewakili.

### Cara jalankan

Ia guna Chrome yang sedia terpasang melalui DevTools Protocol — tiada pakej
baharu perlu dipasang. Ia menembak **laman sebenar** (sifulaser.com), jadi
pastikan perubahan alat sudah live dahulu.

```bash
node scripts/blog-screenshots.mjs docs/images/blog
```

Untuk ambil semula satu dua sahaja, beri namanya:

```bash
node scripts/blog-screenshots.mjs docs/images/blog 85-lift-off-lid 86-almari-laci
```

### Perkara yang perlu diingat

- **Alat 3D perlu masa.** Kamera berpusing masuk dahulu; kalau ditangkap awal
  huruf akan bertindih. Sebab itu ada masa tunggu yang panjang dalam skrip.
  Kalau satu gambar keluar pelik, naikkan `wait` untuk shot itu sahaja.
- **Alat duduk dalam iframe** pada domain yang sama, jadi `contentDocument`
  boleh dicapai — itu caranya skrip klik preset dan gaya kotak.
- **Fail disimpan JPEG** supaya kecil. Clipboard hanya terima PNG, jadi
  `BlogPage.tsx` menukarnya dalam browser sebelum salin.
