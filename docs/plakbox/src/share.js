// Kongsi dengan gambar: satu PNG (pandangan 3D + butiran order + harga) dan
// mesej order yang sama, melalui menu kongsi telefon (Web Share).
//
// Kenapa ini wujud di sebelah "Order melalui WhatsApp": pautan wa.me hanya
// membawa teks. Menu kongsi boleh membawa gambar, tetapi tidak boleh memilih
// penerima - pelanggan memilih chat kedai sendiri, jadi butang ini pilihan
// kedua, bukan pengganti.
//
// Semuanya SEGERAK dalam klik (lukis 3D, susun gambar, toDataURL, Blob,
// navigator.share): Safari menolak share() yang dipanggil selepas await,
// kerana sentuhan pengguna sudah tamat.

/** Susun gambar order: 3D di atas, butiran di bawah. Pulangkan kanvas. */
export function composeOrderImage(shot, { title, lines, price, footer }) {
  const W = 1080, H = 1350, PAD = 56;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f5f7';
  g.fillRect(0, 0, W, H);
  // 3D, segi empat sama, di tengah bahagian atas.
  const top = 0, size = 960;
  g.drawImage(shot, (W - size) / 2, top, size, size);
  // Panel putih butiran.
  const y0 = 930;
  g.fillStyle = '#ffffff';
  g.fillRect(0, y0, W, H - y0);
  g.fillStyle = '#e1e5ea';
  g.fillRect(0, y0, W, 2);
  const font = (wt, px) => `${wt} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  /** Tulis satu baris, dikecilkan sehingga muat lebar. */
  const text = (s, x, y, wt, px, color, maxW = W - 2 * PAD) => {
    let p = px;
    g.font = font(wt, p);
    while (g.measureText(s).width > maxW && p > 18) g.font = font(wt, --p);
    g.fillStyle = color;
    g.fillText(s, x, y);
  };
  g.textBaseline = 'alphabetic';
  text(title, PAD, y0 + 74, 800, 44, '#14213d', W - 2 * PAD - 300);
  // Harga di kanan baris tajuk.
  g.font = font(800, 52);
  const pw = g.measureText(price).width;
  text(price, W - PAD - Math.min(pw, 300), y0 + 76, 800, 52, '#2f7d4f', 300);
  let y = y0 + 138;
  for (const s of lines) {
    text(s, PAD, y, 500, 34, '#3c4656');
    y += 52;
  }
  text(footer, PAD, H - 40, 600, 28, '#6b7280');
  return c;
}

/** data:URL -> Blob, segerak (toBlob tidak segerak - lihat atas). */
export function dataUrlToBlob(url) {
  const [head, b64] = url.split(',');
  const mime = /data:([^;]+)/.exec(head)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Kongsi gambar + teks. Pulangkan 'share' bila menu kongsi dibuka, atau
 * 'fallback' bila peranti tidak boleh berkongsi fail (kebanyakan komputer):
 * gambar dimuat turun dan WhatsApp dibuka dengan mesej, untuk dilampirkan
 * sendiri.
 */
export function shareOrder({ canvas, text, filename, waHref, download }) {
  const blob = dataUrlToBlob(canvas.toDataURL('image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  // Sesetengah aplikasi (WhatsApp iOS) membuang teks bila ada fail: salin
  // juga ke papan keratan supaya boleh ditampal. Tidak ditunggu - share()
  // mesti dipanggil dalam sentuhan yang sama.
  try { navigator.clipboard?.writeText(text).catch(() => {}); } catch { /* tiada izin */ }
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], text, title: 'Order Plak Box' }).catch(() => {});
    return 'share';
  }
  download(filename, blob, 'image/png');
  window.open(waHref, '_blank', 'noopener');
  return 'fallback';
}
