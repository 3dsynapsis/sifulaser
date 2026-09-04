// Ambil screenshot setiap halaman alat untuk halaman episod blog.
// Guna Chrome yang sedia terpasang melalui DevTools Protocol - tiada pakej baru.
//
//   node shot.mjs <folder-output> [nama-shot ...]
//
// Tanpa nama, ia ambil semua. Beri nama untuk ambil semula satu dua sahaja.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9333
const PROFILE = 'C:\\Users\\badru\\AppData\\Local\\Temp\\claude-shot-profile'
const SITE = 'https://sifulaser.com'

/**
 * Klik satu elemen dalam iframe alat, dicari ikut teksnya.
 * Alat duduk dalam iframe pada domain yang sama, jadi contentDocument boleh dicapai.
 */
const clickInTool = (label) => `(() => {
  const f = document.querySelector('iframe');
  const d = f && f.contentDocument;
  if (!d) return 'tiada iframe';
  const want = ${JSON.stringify(label)}.toLowerCase();
  const els = [...d.querySelectorAll('button, [role=button], .card, label')];
  const hit = els.find((e) => (e.textContent || '').trim().toLowerCase().startsWith(want));
  if (!hit) return 'tak jumpa: ' + want;
  hit.click();
  return 'klik: ' + (hit.textContent || '').trim().slice(0, 40);
})()`

/** Skrol halaman utama ke bahagian senarai alat. */
const scrollToTools = `(() => {
  const h = [...document.querySelectorAll('h2, h3')]
    .find((e) => /alat/i.test(e.textContent || ''));
  if (h) { h.scrollIntoView({ block: 'start' }); return 'skrol ke: ' + h.textContent.trim(); }
  window.scrollTo(0, 520);
  return 'skrol tetap';
})()`

const SHOTS = [
  { name: '81-stand', url: '#/stand' },
  { name: '82-topper', url: '#/topper', setup: clickInTool('Happy Birthday 2') },
  { name: '83-semua-alat', url: '#/' },
  { name: '84-tag', url: '#/tag' },
  { name: '85-lift-off-lid', url: '#/boxmaker', setup: clickInTool('Lift-off Lid') },
  {
    name: '86-almari-laci',
    url: '#/boxmaker',
    setup: [clickInTool('Almari Laci'), clickInTool('Saiz almari biasa')],
  },
  { name: '87-save', url: '#/keychain' },
  { name: '88-3d', url: '#/topper', setup: clickInTool('Nikah') },
  { name: '89-layer', url: '#/tag', setup: clickInTool('2D Design') },
  { name: '90-client-design', url: '#/text' },
  { name: '91-telefon', url: '#/boxmaker', w: 400, h: 860 },
  { name: '92-qr', url: '#/qr' },
]

/* ------------------------------------------------------------------ */

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); this.events = [] }

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
      } else if (msg.method) c.events.push(msg)
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
    const w = shot.w ?? 1500
    const h = shot.h ?? 880
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })

    await browser.send('Page.enable', {}, sessionId)
    await browser.send('Runtime.enable', {}, sessionId)
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 2, mobile: !!shot.w,
    }, sessionId)

    // Alat menyimpan tetapan terakhir, jadi shot sebelum ini boleh menumpang
    // masuk ke shot berikutnya. Setiap tangkapan bermula dari kosong.
    await browser.send('Storage.clearDataForOrigin', {
      origin: SITE, storageTypes: 'local_storage,indexeddb,cache_storage,websql',
    }, sessionId)

    await browser.send('Page.navigate', { url: SITE + '/' + shot.url }, sessionId)
    await sleep(shot.wait ?? 11000)

    for (const step of [shot.setup].flat().filter(Boolean)) {
      const r = await browser.send('Runtime.evaluate', {
        expression: step, returnByValue: true, awaitPromise: true,
      }, sessionId)
      console.log(`  ${shot.name}: ${r.result?.value ?? r.exceptionDetails?.text ?? '?'}`)
      await sleep(shot.settle ?? 7000)
    }

    const { data } = await browser.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 90, captureBeyondViewport: false,
    }, sessionId)

    const file = `${outDir}/${shot.name}.jpg`
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log(`${shot.name}.jpg  ${(Buffer.from(data, 'base64').length / 1024).toFixed(0)} KB`)
    await browser.send('Target.closeTarget', { targetId })
  }

  chrome.kill()
  console.log('siap')
  process.exit(0)
}

main().catch((e) => { console.error('GAGAL:', e.message); process.exit(1) })
