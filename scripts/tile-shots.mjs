// Gambar tile untuk tiga alat 3D di halaman utama: Box Maker, Stand Nama, Tag.
// Guna Chrome sedia ada melalui DevTools Protocol - tiada pakej baru.
//
//   node scripts/tile-shots.mjs <folder-output> [nama ...]
//
// Beza dengan scripts/blog-screenshots.mjs, dan sebabnya:
//
//   1. Ia menembak SERVER TEMPATAN alat itu sendiri (localhost:5178 dan
//      rakan-rakannya), bukan sifulaser.com. Gambar tile mesti diambil daripada
//      kerja yang belum naik lagi; menunggu deploy dahulu bermakna gambar
//      sentiasa satu langkah di belakang alat.
//   2. Ia menghantar `clip` kepada Page.captureScreenshot. Skrip blog mengambil
//      seluruh viewport; sebuah tile hanya 128 x 85 px, jadi inspector dan bar
//      tab mesti dibuang sebelum gambar dikecilkan, bukan selepas.
//
// Mulakan pelayan alat dahulu (preview_start: box-maker, stand, tag-generator).

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9334
const PROFILE = 'C:\\Users\\badru\\AppData\\Local\\Temp\\claude-tile-profile'

// Lebar gambar akhir. Well sebuah tile ialah 128 px, jadi 384 memberi 3x - cukup
// tajam untuk skrin retina, dan jauh lebih ringan daripada 512 yang dicuba
// dahulu (Box Maker seorang diri 222 KB pada 512).
const OUT_W = 384

// Ruang kosong di sekeliling produk, sebagai pecahan lebar produk itu sendiri.
const MARGIN = 0.06

// Nisbah peranti yang dipaksa pada Chrome di bawah. Disimpan sebagai pemalar
// kerana ia perlu dibahagi keluar semula daripada skala clip.
const DSF = 2

/**
 * Buang setiap lapisan yang bukan produk itu sendiri.
 *
 * Anak SVG di dalam #stage3d ialah anak panah ukuran ("200mm"), dan jiran-jiran
 * di luar #stage3d ialah pemilih backdrop, hint, dan kiub muka. Semuanya
 * bertindih dengan segi empat yang hendak dipotong, jadi menyembunyikannya
 * adalah satu-satunya cara clip menghasilkan produk sahaja.
 */
const STRIP = `(() => {
  const kill = [
    '#stage3d > svg', '#backdropPick', '#stageHint', '#lidBtn',
    '#faces', '#sides', '#warnings',
  ];
  let n = 0;
  for (const sel of kill) {
    for (const e of document.querySelectorAll(sel)) { e.style.display = 'none'; n++; }
  }
  // Backdrop kekal "light" - itu yang menala pencahayaan dan bayang di
  // view3d.js - tetapi kecerunan CSS di belakang kanvas dibuang. WebGLRenderer
  // ketiga-tiga alat dibuka dengan alpha: true, jadi kanvas itu sendiri memang
  // lutsinar dan yang tinggal hanyalah produk. Itu yang membolehkan gambar
  // duduk atas warna well seperti lima tile SVG yang lain, bukan sebagai kotak
  // kelabu di dalamnya.
  let s = document.querySelector('#stage3d');
  while (s && s !== document.documentElement) {
    s.style.background = 'transparent';
    s = s.parentElement;
  }
  document.documentElement.style.background = 'transparent';
  if (document.body) document.body.style.background = 'transparent';
  return 'buang ' + n + ', latar lutsinar';
})()`

/** Klik satu kawalan ikut teksnya. Alat ini dibuka terus, bukan dalam iframe. */
const click = (label) => `(() => {
  const want = ${JSON.stringify(label)}.toLowerCase();
  const els = [...document.querySelectorAll('button, [role=button], .card, label')];
  const hit = els.find((e) => (e.textContent || '').trim().toLowerCase().replace(/\\s+/g, ' ').startsWith(want));
  if (!hit) return 'tak jumpa: ' + want;
  hit.click();
  return 'klik: ' + (hit.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
})()`

/** Segi empat 3:2 terbesar yang muat di tengah #stage3d, dalam piksel CSS. */
const CLIP = `(() => {
  const s = document.querySelector('#stage3d');
  if (!s) return null;
  const b = s.getBoundingClientRect();
  if (b.width < 50 || b.height < 50) return null;
  const ar = 3 / 2;
  let w = b.width; let h = w / ar;
  if (h > b.height) { h = b.height; w = h * ar; }
  return { x: b.x + (b.width - w) / 2, y: b.y + (b.height - h) / 2, width: w, height: h };
})()`

/**
 * Kotak sempadan produk di dalam gambar, diukur daripada saluran alpha.
 *
 * Bingkai kamera setiap alat ditala untuk pentas penuh, jadi memotong pada
 * #stage3d meninggalkan produk terapung kecil di tengah-tengah ruang kosong.
 * Meneka faktor pengecilan boleh memotong bahagian model tanpa disedari, jadi
 * gambar itu diukur: PNG yang baru ditangkap dilukis semula ke dalam kanvas 2D
 * dan setiap piksel yang tidak lutsinar dikira. Ia PNG, bukan kanvas WebGL yang
 * hidup, jadi getImageData memang boleh dibaca.
 *
 * Pulangannya pecahan 0-1, supaya pemanggil boleh menukarnya kembali kepada
 * piksel CSS tanpa tahu apa-apa tentang nisbah peranti.
 */
const BBOX = (dataUrl) => `(async () => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + ${JSON.stringify(dataUrl)};
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const { data, width, height } = x.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // 8 daripada 255: cukup tinggi untuk mengabaikan pinggir anti-alias dan
      // sisa bayang yang hampir lutsinar, cukup rendah untuk mengekalkan
      // bayang sentuh sebenar di bawah produk.
      if (data[(py * width + px) * 4 + 3] > 8) {
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0: x0 / width, y0: y0 / height, x1: (x1 + 1) / width, y1: (y1 + 1) / height };
})()`

/**
 * Tukar PNG kepada WebP, melalui kanvas Chrome sendiri.
 *
 * PNG lossless bagi foto kayu bertekstur ialah tawaran yang buruk untuk sekeping
 * gambar 128 px: ketiga-tiganya keluar antara 118 KB dan 248 KB. WebP menyimpan
 * saluran alpha yang diperlukan supaya warna well menembusi, pada kira-kira satu
 * per sepuluh saiz itu. Laman ini memang sudah menghantar .webp
 * (docs/images/pinch-hand.webp), jadi tiada format baharu diperkenalkan.
 */
const TOWEBP = (dataUrl, q) => `(async () => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + ${JSON.stringify(dataUrl)};
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const url = c.toDataURL('image/webp', ${q});
  if (!url.startsWith('data:image/webp')) return null;
  return url.slice(url.indexOf(',') + 1);
})()`

const SHOTS = [
  {
    name: 'boxmaker',
    url: 'http://localhost:5178',
    key: 'box-maker.project.v1',
    // BUKAN gaya 'open' yang lalai. Dulang terbuka pada 116 px hanyalah segi
    // empat samar; Almari Laci jelas sekeping perabot walaupun sekecil itu, dan
    // ia ciri terbaharu alat - iaitu seluruh hujah tentang gambar jadi basi.
    setup: [click('Almari Laci')],
  },
  {
    name: 'stand',
    url: 'http://localhost:5181',
    key: 'stand-maker.project.v1',
    // Lalai: silhouette, FAZRIN / ABD RAHMAN, blue-highway, 165 x 55 mm.
    setup: [],
  },
  {
    name: 'tag',
    url: 'http://localhost:5185',
    key: 'tag-maker.project.v1',
    // Lalai: bentuk tag, 50 x 90 mm, slot stadium. Muka hadapan.
    setup: [],
  },
]

/* ------------------------------------------------------------------ */

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map() }

  static async open(url) {
    const ws = new WebSocket(url)
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('ws gagal: ' + url)) })
    const c = new Cdp(ws)
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && c.waiting.has(msg.id)) {
        const { ok, no } = c.waiting.get(msg.id)
        c.waiting.delete(msg.id)
        msg.error ? no(new Error(msg.error.message)) : ok(msg.result)
      }
    }
    return c
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((ok, no) => {
      this.waiting.set(id, { ok, no })
      setTimeout(() => { if (this.waiting.delete(id)) no(new Error('timeout: ' + method)) }, 60000)
    })
  }
}

const chromeReady = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch { /* belum sedia */ }
    await sleep(500)
  }
  throw new Error('Chrome tak buka port debug')
}

const main = async () => {
  const outDir = process.argv[2]
  if (!outDir) throw new Error('beri folder output')
  const only = process.argv.slice(3)
  const shots = only.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS
  mkdirSync(outDir, { recursive: true })
  try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* tiada */ }

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--disable-features=Translate',
    '--use-gl=angle',
    'about:blank',
  ], { stdio: 'ignore' })

  const browser = await Cdp.open(await chromeReady())

  for (const shot of shots) {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
    await browser.send('Page.enable', {}, sessionId)
    await browser.send('Runtime.enable', {}, sessionId)
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: DSF, mobile: false,
    }, sessionId)

    // Setiap alat menyimpan seluruh projeknya. Tanpa ini kita memotret sesi
    // terakhir sesiapa pun yang membuka alat itu, bukan tetapannya yang lalai -
    // dan itu berlaku betul-betul semasa skrip ini ditulis.
    await browser.send('Storage.clearDataForOrigin', {
      origin: shot.url, storageTypes: 'local_storage,indexeddb,cache_storage,websql',
    }, sessionId)

    await browser.send('Page.navigate', { url: shot.url }, sessionId)
    await sleep(9000)

    const ev = async (expr) => {
      const r = await browser.send('Runtime.evaluate', {
        expression: expr, returnByValue: true, awaitPromise: true,
      }, sessionId)
      if (r.exceptionDetails) throw new Error(`${shot.name}: ${r.exceptionDetails.text}`)
      return r.result?.value
    }

    // Bukti localStorage benar-benar kosong semasa muat, bukan andaian.
    const keys = await ev('JSON.stringify(Object.keys(localStorage))')
    console.log(`  ${shot.name}: localStorage ${keys}`)

    for (const step of shot.setup) {
      console.log(`  ${shot.name}: ${await ev(step)}`)
      await sleep(5000)
    }

    console.log(`  ${shot.name}: ${await ev(STRIP)}`)
    await sleep(1200)

    const stage = await ev(CLIP)
    if (!stage) throw new Error(`${shot.name}: #stage3d tiada atau terlalu kecil`)

    // PNG, bukan JPEG: JPEG tiada saluran alpha, dan tanpa alpha gambar ini
    // kembali menjadi segi empat kelabu di dalam well berwarna.
    await browser.send('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 0 },
    }, sessionId)

    // Tangkapan pertama hanyalah untuk diukur, bukan untuk disimpan.
    const probe = await browser.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false, clip: { ...stage, scale: 0.5 },
    }, sessionId)

    const bb = await ev(BBOX(probe.data))
    if (!bb) throw new Error(`${shot.name}: pentas kosong - tiada produk untuk difoto`)

    // Kembali kepada piksel CSS, kemudian dikembangkan semula kepada 3:2 supaya
    // gambar akhir sepadan dengan well tanpa perlu diregangkan.
    let w = (bb.x1 - bb.x0) * stage.width
    let h = (bb.y1 - bb.y0) * stage.height
    const cx = stage.x + (bb.x0 + bb.x1) / 2 * stage.width
    const cy = stage.y + (bb.y0 + bb.y1) / 2 * stage.height
    w *= 1 + MARGIN * 2
    h *= 1 + MARGIN * 2
    if (w / h < 3 / 2) w = h * (3 / 2); else h = w / (3 / 2)

    // Bahagi dengan DSF. `scale` pada clip didarab dengan deviceScaleFactor,
    // jadi OUT_W / w sahaja menghasilkan gambar dua kali lebih besar daripada
    // yang diminta - kali pertama ia ditulis, 384 keluar sebagai 767 px dan
    // membawa saiz fail empat kali ganda bersamanya.
    const clip = {
      x: cx - w / 2, y: cy - h / 2, width: w, height: h, scale: OUT_W / w / DSF,
    }
    console.log(`  ${shot.name}: produk ${Math.round((bb.x1 - bb.x0) * 100)}% x ${Math.round((bb.y1 - bb.y0) * 100)}% daripada pentas`)

    const { data } = await browser.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false, clip,
    }, sessionId)

    const webp = await ev(TOWEBP(data, 0.9))
    if (!webp) throw new Error(`${shot.name}: Chrome enggan mengekod WebP`)

    const buf = Buffer.from(webp, 'base64')
    const png = Buffer.from(data, 'base64')
    const file = `${outDir}/${shot.name}.webp`
    writeFileSync(file, buf)
    console.log(`${shot.name}.webp  ${OUT_W}px  ${(buf.length / 1024).toFixed(0)} KB  (png ${(png.length / 1024).toFixed(0)} KB)`)
    await browser.send('Target.closeTarget', { targetId })
  }

  chrome.kill()
  console.log('siap')
  process.exit(0)
}

main().catch((e) => { console.error('GAGAL:', e.message); process.exit(1) })
