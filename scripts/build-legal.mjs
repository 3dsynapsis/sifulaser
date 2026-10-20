// Page polisi sifulaser.com, dijana - jangan sunting HTML-nya dengan tangan:
//
//   docs/terma/index.html     Terma & Syarat
//   docs/privasi/index.html   Dasar Privasi (PDPA 2010)
//   docs/refund/index.html    Pembatalan & Bayaran Balik
//   docs/ambil/index.html     Penghantaran & Ambil Sendiri
//   docs/hubungi/index.html   Hubungi Kami
//   docs/shared/legal.css     gaya bersama
//
// Kenapa fail statik dan bukan route React (#/terma): pemeriksa gerbang
// pembayaran (Bayarcash) dan enjin carian membaca URL sebenar tanpa
// JavaScript. Butiran syarikat datang dari src/data/company.ts - sumber yang
// sama dengan footer laman - jadi kedua-duanya tidak boleh berbeza.
//
//     node scripts/build-legal.mjs
//
// Setiap page dalam Bahasa Melayu dahulu, kemudian English, seperti
// mahligaiseni.com.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANY as C, LEGAL_PAGES } from '../src/data/company.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(here, '..', 'docs');
const SITE = 'https://sifulaser.com';
const WA = `https://wa.me/${C.whatsapp}`;
const page = (p) => LEGAL_PAGES.find((x) => x.path === p);
const link = (p, lang) => `<a href="${p}">${page(p)[lang]}</a>`;

const company = (lang) => `<ul class="lg-contact">
  <li><strong>${C.name}</strong>, ${lang === 'ms' ? 'No. Pendaftaran SSM' : 'business registration no.'} ${C.regNo}</li>
  <li>${C.address.join(', ')}</li>
  <li>WhatsApp: <a href="${WA}">${C.whatsappDisplay}</a></li>
  <li>${lang === 'ms' ? 'Emel' : 'Email'}: <a href="mailto:${C.email}">${C.email}</a></li>
</ul>`;

// ---- kandungan ----------------------------------------------------------------
// Setiap page: { ms: html, en: html }. Ayat pendek, tiada jargon undang-undang
// yang tidak perlu - pelanggan perlu faham apa yang dijanjikan.

const DOCS_CONTENT = {
  '/terma/': {
    ms: `
<p>Laman <strong>sifulaser.com</strong> ("SifuLaser") dikendalikan oleh <strong>${C.name}</strong>, SSM ${C.regNo}, pemilik jenama ${C.brand}. Dengan menggunakan laman ini, anda bersetuju dengan terma berikut.</p>
<h2>1. Alat reka bentuk</h2>
<p>Alat di laman ini (contohnya Box Maker, Plak Box dan Kalkulator Laser Cut) percuma untuk digunakan. Fail yang dijana (SVG, PDF, STL) disediakan seadanya. Semak ukuran, tebal bahan dan tetapan mesin anda sebelum memotong atau mencetak. Kami tidak bertanggungjawab atas kerosakan bahan, mesin atau kerugian akibat penggunaan fail tersebut di luar tempahan dengan kami.</p>
<h2>2. Akaun</h2>
<p>Anda perlu daftar masuk dengan akaun Google untuk memuat turun fail, menyimpan reka bentuk dan membuat tempahan. Anda bertanggungjawab atas aktiviti dalam akaun anda.</p>
<h2>3. Harga</h2>
<p>Semua harga dalam Ringgit Malaysia (RM). Harga yang dipaparkan oleh alat ialah anggaran, kecuali jumlah yang ditunjukkan sebagai harga tetap semasa pembayaran. Untuk tempahan melalui WhatsApp, harga muktamad disahkan oleh staff sebelum anda membayar.</p>
<h2>4. Tempahan dan pembayaran</h2>
<p>Tempahan disahkan selepas bayaran penuh diterima. Bayaran dibuat melalui gerbang pembayaran pihak ketiga (contohnya Bayarcash: FPX, DuitNow atau kad) atau pindahan bank. Kami tidak menerima atau menyimpan maklumat kad dan perbankan anda.</p>
<h2>5. Pengeluaran dan pengambilan</h2>
<p>Barang dibuat ikut tempahan anda dalam ${C.leadTime.ms} selepas bayaran disahkan, dan <strong>diambil sendiri di Shah Alam</strong>. Kami tidak menghantar melalui pos buat masa ini. Lihat ${link('/ambil/', 'ms')}.</p>
<h2>6. Pembatalan dan bayaran balik</h2>
<p>Lihat ${link('/refund/', 'ms')}.</p>
<h2>7. Akses digital dan kelas</h2>
<p>Pakej Akses Penuh memberi akses kepada kandungan berbayar untuk tempoh yang dinyatakan semasa pembelian. Untuk menukar tarikh kelas latihan, hubungi kami sebelum kelas berlangsung.</p>
<h2>8. Hak harta intelek</h2>
<p>Reka bentuk yang anda hasilkan dengan alat kami adalah milik anda. Anda mesti mempunyai hak ke atas logo, gambar atau teks yang anda masukkan dalam tempahan. Kod alat, panduan, logo dan kandungan laman ini milik ${C.name} / ${C.brand}.</p>
<h2>9. Had tanggungjawab</h2>
<p>Tanggungjawab kami bagi sesuatu tempahan terhad kepada jumlah yang anda bayar untuk tempahan itu. Kami berusaha memastikan laman ini tepat dan sentiasa berfungsi, tetapi tidak menjamin ia bebas daripada kesilapan atau gangguan.</p>
<h2>10. Perubahan terma</h2>
<p>Terma ini boleh dikemas kini. Tarikh di atas menunjukkan versi terkini. Tempahan tertakluk kepada terma pada tarikh bayaran.</p>
<h2>11. Undang-undang</h2>
<p>Terma ini tertakluk kepada undang-undang Malaysia.</p>
<h2>12. Hubungi kami</h2>
${company('ms')}`,
    en: `
<p>The website <strong>sifulaser.com</strong> ("SifuLaser") is operated by <strong>${C.name}</strong>, SSM ${C.regNo}, owner of the ${C.brand} brand. By using this website you agree to these terms.</p>
<h2>1. Design tools</h2>
<p>The tools on this website (for example Box Maker, Plak Box and the Laser Cut Calculator) are free to use. Generated files (SVG, PDF, STL) are provided as is. Check the dimensions, material thickness and your machine settings before cutting or printing. We are not responsible for damage to materials or machines, or for losses, from using those files outside an order with us.</p>
<h2>2. Account</h2>
<p>You need to sign in with a Google account to download files, save designs and place orders. You are responsible for activity in your account.</p>
<h2>3. Prices</h2>
<p>All prices are in Malaysian Ringgit (RM). Prices shown by the tools are estimates, except an amount shown as a fixed price at payment. For orders placed through WhatsApp, our staff confirm the final price before you pay.</p>
<h2>4. Orders and payment</h2>
<p>An order is confirmed once full payment is received. Payment is made through a third-party payment gateway (for example Bayarcash: FPX, DuitNow or card) or bank transfer. We never receive or store your card or banking details.</p>
<h2>5. Production and collection</h2>
<p>Items are made to order within ${C.leadTime.en} after payment is confirmed, and are <strong>collected in person in Shah Alam</strong>. We do not ship by post at this time. See ${link('/ambil/', 'en')}.</p>
<h2>6. Cancellation and refunds</h2>
<p>See ${link('/refund/', 'en')}.</p>
<h2>7. Digital access and classes</h2>
<p>A Full Access plan gives access to paid content for the period stated at purchase. To change the date of a training class, contact us before the class takes place.</p>
<h2>8. Intellectual property</h2>
<p>Designs you create with our tools belong to you. You must have the rights to any logo, image or text you include in an order. The tools' code, guides, logos and website content belong to ${C.name} / ${C.brand}.</p>
<h2>9. Limitation of liability</h2>
<p>Our liability for an order is limited to the amount you paid for that order. We aim to keep this website accurate and available but do not guarantee it is free of errors or interruptions.</p>
<h2>10. Changes</h2>
<p>These terms may be updated. The date above shows the current version. An order is governed by the terms in force on the date of payment.</p>
<h2>11. Governing law</h2>
<p>These terms are governed by the laws of Malaysia.</p>
<h2>12. Contact us</h2>
${company('en')}`,
  },

  '/privasi/': {
    ms: `
<p>Dasar ini menerangkan cara <strong>${C.name}</strong>, SSM ${C.regNo}, pengendali sifulaser.com, mengendalikan maklumat anda selaras dengan Akta Perlindungan Data Peribadi 2010 (Malaysia).</p>
<h2>1. Maklumat yang kami kumpul</h2>
<ul>
  <li><strong>Akaun:</strong> nama dan alamat emel akaun Google anda bila anda daftar masuk.</li>
  <li><strong>Reka bentuk tersimpan:</strong> tetapan reka bentuk yang anda simpan (saiz, pilihan, nama), bukan fail potong.</li>
  <li><strong>Tempahan:</strong> nama, nombor telefon, butiran barang dan status bayaran.</li>
  <li><strong>Statistik lawatan:</strong> bilangan lawatan tanpa cookie melalui Cloudflare Web Analytics.</li>
  <li><strong>Dalam pelayar anda:</strong> tetapan alat disimpan dalam pelayar anda sendiri (localStorage) dan tidak dihantar kepada kami.</li>
</ul>
<h2>2. Maklumat kad dan bank</h2>
<p>Bayaran diproses terus oleh gerbang pembayaran. Kami tidak menerima atau menyimpan nombor kad atau maklumat perbankan anda.</p>
<h2>3. Tujuan</h2>
<p>Untuk menyediakan akaun dan menyimpan reka bentuk anda, memproses dan menyiapkan tempahan, menghubungi anda tentang tempahan, dan menambah baik laman ini.</p>
<h2>4. Perkongsian</h2>
<p>Kami tidak menjual maklumat anda. Maklumat hanya dikongsi dengan penyedia servis yang menjalankan laman ini: Google Firebase (akaun dan pangkalan data), Cloudflare (DNS dan statistik), GitHub Pages (hosting), gerbang pembayaran (Bayarcash), penyedia emel untuk notifikasi tempahan, dan WhatsApp bila anda menghubungi kami.</p>
<h2>5. Tempoh simpanan</h2>
<p>Maklumat disimpan selagi akaun anda aktif, atau selama yang dikehendaki undang-undang untuk rekod tempahan dan cukai.</p>
<h2>6. Hak anda</h2>
<p>Anda boleh meminta untuk melihat, membetulkan atau memadam maklumat anda dengan menghubungi kami. Reka bentuk tersimpan boleh dipadam sendiri dalam "Reka bentuk saya".</p>
<h2>7. Keselamatan</h2>
<p>Akses kepada data dihadkan: setiap akaun hanya boleh membaca rekodnya sendiri, dan hanya pentadbir boleh melihat rekod tempahan.</p>
<h2>8. Hubungi kami</h2>
${company('ms')}`,
    en: `
<p>This policy explains how <strong>${C.name}</strong>, SSM ${C.regNo}, operator of sifulaser.com, handles your information in line with Malaysia's Personal Data Protection Act 2010.</p>
<h2>1. Information we collect</h2>
<ul>
  <li><strong>Account:</strong> your Google account name and email address when you sign in.</li>
  <li><strong>Saved designs:</strong> the settings of designs you save (sizes, options, name), not the cut files.</li>
  <li><strong>Orders:</strong> name, phone number, item details and payment status.</li>
  <li><strong>Visit statistics:</strong> cookie-free visit counts through Cloudflare Web Analytics.</li>
  <li><strong>In your browser:</strong> tool settings are kept in your own browser (localStorage) and are not sent to us.</li>
</ul>
<h2>2. Card and bank details</h2>
<p>Payments are processed directly by the payment gateway. We never receive or store your card number or banking details.</p>
<h2>3. Purpose</h2>
<p>To provide your account and saved designs, to process and complete orders, to contact you about orders, and to improve this website.</p>
<h2>4. Sharing</h2>
<p>We do not sell your information. It is shared only with the service providers that run this website: Google Firebase (accounts and database), Cloudflare (DNS and statistics), GitHub Pages (hosting), the payment gateway (Bayarcash), an email provider for order notifications, and WhatsApp when you contact us.</p>
<h2>5. Retention</h2>
<p>Information is kept while your account is active, or as long as the law requires for order and tax records.</p>
<h2>6. Your rights</h2>
<p>You may ask to see, correct or delete your information by contacting us. You can delete saved designs yourself in "Reka bentuk saya" (My designs).</p>
<h2>7. Security</h2>
<p>Access to data is restricted: each account can read only its own records, and only administrators can see order records.</p>
<h2>8. Contact us</h2>
${company('en')}`,
  },

  '/refund/': {
    ms: `
<p>Barang SifuLaser dibuat khas ikut spesifikasi anda (saiz, bahan, reka bentuk). Kerana itu pembatalan dan bayaran balik mengikut peraturan berikut.</p>
<h2>1. Sebelum kerja bermula</h2>
<p>Anda boleh membatalkan tempahan dan menerima <strong>bayaran balik penuh</strong> selagi kerja belum bermula. Hubungi kami secepat mungkin selepas bayaran.</p>
<h2>2. Selepas kerja bermula</h2>
<p>Tempahan tidak boleh dibatalkan dan tiada bayaran balik, kerana barang dibuat khas dan tidak boleh dijual kepada orang lain.</p>
<h2>3. Barang rosak atau tidak ikut tempahan</h2>
<p>Sila semak barang semasa mengambil. Jika barang rosak atau tidak mengikut spesifikasi yang dibayar, kami akan <strong>membaikinya atau membuat semula tanpa caj</strong>. Jika itu tidak dapat dilakukan, anda menerima bayaran balik penuh.</p>
<h2>4. Barang tidak diambil</h2>
<p>Barang disimpan selama ${C.holdDays} hari dari tarikh kami maklumkan ia siap. Selepas itu, barang dianggap ditinggalkan dan tiada bayaran balik.</p>
<h2>5. Akses digital</h2>
<p>Tiada bayaran balik untuk pakej Akses Penuh selepas akses dibuka.</p>
<h2>6. Cara memohon</h2>
<p>Hubungi kami melalui WhatsApp atau emel dengan nombor tempahan anda. Bayaran balik yang diluluskan dikembalikan ke kaedah bayaran asal dalam ${C.refundDays} hari bekerja.</p>
<h2>7. Hubungi kami</h2>
${company('ms')}`,
    en: `
<p>SifuLaser items are made specially to your specification (size, material, design). For that reason cancellations and refunds follow these rules.</p>
<h2>1. Before work starts</h2>
<p>You may cancel your order for a <strong>full refund</strong> as long as work has not started. Contact us as soon as possible after paying.</p>
<h2>2. After work starts</h2>
<p>The order cannot be cancelled and is not refundable, because the item is made specially and cannot be sold to anyone else.</p>
<h2>3. Damaged or incorrect items</h2>
<p>Please inspect your item when you collect it. If it is damaged or does not match the specification you paid for, we will <strong>repair or remake it free of charge</strong>. If that is not possible, you receive a full refund.</p>
<h2>4. Uncollected items</h2>
<p>Items are kept for ${C.holdDays} days from the date we tell you they are ready. After that they are treated as abandoned and are not refundable.</p>
<h2>5. Digital access</h2>
<p>Full Access plans are not refundable once access has been opened.</p>
<h2>6. How to request</h2>
<p>Contact us by WhatsApp or email with your order number. Approved refunds are returned to the original payment method within ${C.refundDays} working days.</p>
<h2>7. Contact us</h2>
${company('en')}`,
  },

  '/ambil/': {
    ms: `
<h2>1. Ambil sendiri sahaja</h2>
<p>Buat masa ini <strong>kami tidak menghantar melalui pos atau kurier</strong>, kerana barang seperti kotak akrilik mudah pecah semasa penghantaran. Semua tempahan diambil sendiri di Shah Alam.</p>
<h2>2. Lokasi</h2>
<p>${C.name}<br>${C.address.join('<br>')}<br><a href="${C.mapsUrl}">Buka di Google Maps</a></p>
<h2>3. Waktu mengambil</h2>
<p>${C.pickupHours.ms}.</p>
<h2>4. Bila barang siap</h2>
<p>Barang siap dalam ${C.leadTime.ms} selepas bayaran disahkan. Kami akan maklumkan melalui WhatsApp atau emel bila ia sedia untuk diambil.</p>
<h2>5. Semasa mengambil</h2>
<ul>
  <li>Tunjukkan nombor tempahan anda.</li>
  <li>Semak barang sebelum pulang (lihat ${link('/refund/', 'ms')}).</li>
  <li>Wakil boleh mengambil bagi pihak anda dengan nombor tempahan yang sama.</li>
</ul>
<h2>6. Tempoh simpanan</h2>
<p>Barang disimpan selama ${C.holdDays} hari dari tarikh kami maklumkan ia siap.</p>
<h2>7. Fail digital</h2>
<p>Fail yang dijana oleh alat (SVG, PDF, STL) dimuat turun terus dari laman ini. Tiada penghantaran fizikal untuk fail.</p>
<h2>8. Hubungi kami</h2>
${company('ms')}`,
    en: `
<h2>1. Self-collection only</h2>
<p>At this time <strong>we do not ship by post or courier</strong>, because items such as acrylic boxes break easily in transit. All orders are collected in person in Shah Alam.</p>
<h2>2. Location</h2>
<p>${C.name}<br>${C.address.join('<br>')}<br><a href="${C.mapsUrl}">Open in Google Maps</a></p>
<h2>3. Collection hours</h2>
<p>${C.pickupHours.en}.</p>
<h2>4. When your order is ready</h2>
<p>Items are ready within ${C.leadTime.en} after payment is confirmed. We will tell you by WhatsApp or email when your order is ready to collect.</p>
<h2>5. When collecting</h2>
<ul>
  <li>Show your order number.</li>
  <li>Inspect the item before leaving (see ${link('/refund/', 'en')}).</li>
  <li>Someone else may collect on your behalf with the same order number.</li>
</ul>
<h2>6. Holding period</h2>
<p>Items are kept for ${C.holdDays} days from the date we tell you they are ready.</p>
<h2>7. Digital files</h2>
<p>Files generated by the tools (SVG, PDF, STL) are downloaded directly from this website. There is no physical delivery for files.</p>
<h2>8. Contact us</h2>
${company('en')}`,
  },

  '/hubungi/': {
    ms: `
<p>SifuLaser ialah platform alat reka bentuk laser, servis potong laser dan cetak 3D custom, serta latihan mesin laser oleh pasukan ${C.brand}.</p>
<h2>Syarikat</h2>
${company('ms')}
<h2>Lokasi dan waktu</h2>
<p>${C.address.join(', ')}<br>${C.pickupHours.ms}<br><a href="${C.mapsUrl}">Buka di Google Maps</a></p>
<h2>Polisi</h2>
<ul>${LEGAL_PAGES.filter((p) => p.path !== '/hubungi/').map((p) => `<li>${link(p.path, 'ms')}</li>`).join('')}</ul>`,
    en: `
<p>SifuLaser is a platform of laser design tools, custom laser cutting and 3D printing services, and laser machine training by the ${C.brand} team.</p>
<h2>Company</h2>
${company('en')}
<h2>Location and hours</h2>
<p>${C.address.join(', ')}<br>${C.pickupHours.en}<br><a href="${C.mapsUrl}">Open in Google Maps</a></p>
<h2>Policies</h2>
<ul>${LEGAL_PAGES.filter((p) => p.path !== '/hubungi/').map((p) => `<li>${link(p.path, 'en')}</li>`).join('')}</ul>`,
  },
};

// ---- page --------------------------------------------------------------------
const ANALYTICS = `<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "64b33f01984840f982c28feb1569fb91"}'></script><!-- End Cloudflare Web Analytics -->`;

function render(p) {
  const meta = page(p);
  const body = DOCS_CONTENT[p];
  const nav = LEGAL_PAGES.map((x) => `<a href="${x.path}"${x.path === p ? ' aria-current="page"' : ''}>${x.ms}</a>`).join('\n      ');
  return `<!doctype html>
<!-- Dijana oleh scripts/build-legal.mjs daripada src/data/company.ts - jangan sunting dengan tangan. -->
<html lang="ms">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${meta.ms} / ${meta.en} | SifuLaser</title>
<meta name="description" content="${meta.ms} SifuLaser (sifulaser.com), dikendalikan oleh ${C.name}, SSM ${C.regNo}.">
<link rel="canonical" href="${SITE}${p}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="/shared/legal.css">
</head>
<body>
<header class="lg-top">
  <a class="lg-brand" href="/">Sifu<i>Laser</i></a>
  <a class="lg-home" href="/">&larr; Laman utama</a>
</header>
<main class="lg-doc">
  <p class="lg-lang">Bahasa Melayu &middot; <a href="#en">English</a></p>
  <article lang="ms">
    <h1>${meta.ms}</h1>
    <p class="lg-meta">Dikemas kini: ${C.updated.ms}</p>
${body.ms}
  </article>
  <article lang="en" id="en">
    <h1>${meta.en}</h1>
    <p class="lg-meta">Last updated: ${C.updated.en}</p>
${body.en}
  </article>
</main>
<footer class="lg-foot">
  <nav aria-label="Polisi">
      ${nav}
  </nav>
  <p>&copy; 2026 ${C.name}, SSM ${C.regNo} &middot; ${C.brand}</p>
</footer>
${ANALYTICS}
</body>
</html>
`;
}

const CSS = `/* Dijana oleh scripts/build-legal.mjs - jangan sunting dengan tangan.
   Warna sama dengan laman utama (src/index.css). */
:root {
  --canvas: #f5f7fb; --surface: #ffffff; --ink: #14213d; --muted: #5f6b7a;
  --line: #dce3ec; --accent: #1f78d1;
}
@media (prefers-color-scheme: dark) {
  :root { --canvas: #0f1522; --surface: #172033; --ink: #e8edf6; --muted: #a3afc2; --line: #2a3650; --accent: #6aa9ec; }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--canvas); color: var(--ink);
  font: 400 15px/1.65 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
}
a { color: var(--accent); }
.lg-top {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  max-width: 760px; margin: 0 auto; padding: 16px;
}
.lg-brand { font-weight: 800; font-size: 18px; color: var(--ink); text-decoration: none; }
.lg-brand i { color: var(--accent); }
.lg-home { font-size: 14px; text-decoration: none; }
.lg-doc { max-width: 760px; margin: 0 auto; padding: 0 16px 24px; }
.lg-lang { font-size: 13px; color: var(--muted); margin: 0 0 12px; }
article {
  background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
  padding: 22px 20px; margin-bottom: 16px;
}
h1 { font-size: 24px; line-height: 1.25; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 22px 0 6px; }
p, ul { margin: 0 0 10px; }
ul { padding-left: 20px; }
.lg-meta { color: var(--muted); font-size: 13px; }
.lg-contact { list-style: none; padding: 0; }
.lg-contact li { margin-bottom: 4px; }
.lg-foot {
  max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; text-align: center;
  font-size: 13px; color: var(--muted);
}
.lg-foot nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; margin-bottom: 8px; }
.lg-foot a[aria-current="page"] { color: var(--ink); font-weight: 700; text-decoration: none; }
@media (max-width: 480px) {
  article { padding: 18px 16px; }
  h1 { font-size: 21px; }
}
`;

let n = 0;
for (const { path: p } of LEGAL_PAGES) {
  const dir = path.join(DOCS, p);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), render(p));
  n++;
}
fs.writeFileSync(path.join(DOCS, 'shared', 'legal.css'), CSS);
console.log(`${n} page polisi + shared/legal.css ditulis`);
