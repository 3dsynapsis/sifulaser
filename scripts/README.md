# Skrip

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
