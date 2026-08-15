// Email automatik bila admin luluskan atau tarik akses.
//
// Dihantar melalui EmailJS: laman ini hanya memanggil EmailJS, dan server
// EmailJS yang menghantar email bagi pihak akaun Gmail yang telah disambungkan
// sekali di emailjs.com. Log masuk Gmail di browser TIDAK memberi laman ini
// kuasa menghantar email — sambungan di emailjs.com itu yang diperlukan.
//
// PUBLIC_KEY memang terdedah dalam bundle browser (itu sifat EmailJS). Untuk
// mengelak orang lain menyalahguna kuota, hadkan domain di dashboard EmailJS:
//   Account -> Security -> Allowed Origins -> https://sifulaser.com
//
// LANGKAH SETUP (di emailjs.com, sekali sahaja):
//   1. Daftar akaun, sambungkan Gmail sifulaser@gmail.com sebagai Email Service.
//   2. Cipta satu Email Template dengan tetapan:
//        To Email : {{to_email}}
//        Subject  : {{subject}}
//        Content  : {{{message_html}}}     <- tiga kurungan, supaya HTML terpapar
//   3. Salin Service ID, Template ID dan Public Key ke dalam MAIL_CONFIG bawah.

import type { PaidPlan } from './admin'
import { ACCESS_PERIOD_LABEL } from './access'

export const MAIL_CONFIG = {
  serviceId: '',
  templateId: '',
  publicKey: '',
}

export const SITE_URL = 'https://sifulaser.com'
export const SUPPORT_EMAIL = 'sifulaser@gmail.com'

/** false jika kunci EmailJS belum diisi — email dilangkau senyap. */
export const IS_MAIL_CONFIGURED = Boolean(
  MAIL_CONFIG.serviceId && MAIL_CONFIG.templateId && MAIL_CONFIG.publicKey,
)

/** Jenis pemberitahuan yang dihantar kepada pelanggan. */
export type MailKind = PaidPlan | 'revoke'

const formatDate = (date: Date | null): string =>
  date
    ? date.toLocaleDateString('ms-MY', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—'

/** Elak teks nama/email pengguna ditafsir sebagai HTML dalam email. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const button = `
  <p style="margin:24px 0">
    <a href="${SITE_URL}"
       style="display:inline-block;background:#e07514;color:#ffffff;
              text-decoration:none;font-weight:700;font-size:15px;
              padding:12px 24px;border-radius:12px">
      Mula Belajar Sekarang
    </a>
  </p>
  <p style="margin:0 0 4px;font-size:13px;color:#6b7280">
    Atau buka terus: <a href="${SITE_URL}" style="color:#e07514">${SITE_URL}</a>
  </p>
  <p style="margin:0;font-size:13px;color:#6b7280">
    Log masuk dengan akaun Google yang sama seperti pendaftaran.
  </p>`

const wrap = (heading: string, body: string): string => `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
            max-width:560px;margin:0 auto;padding:24px;color:#111827;
            line-height:1.6">
  <h1 style="margin:0 0 16px;font-size:20px;color:#111827">${heading}</h1>
  ${body}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0" />
  <p style="margin:0;font-size:12px;color:#9ca3af">
    SifuLaser — Latihan Operator Mesin Laser<br />
    Ada soalan? Balas email ini atau hubungi ${SUPPORT_EMAIL}.
  </p>
</div>`

interface MailContent {
  subject: string
  html: string
}

/** Bina kandungan email mengikut jenis tindakan admin. */
export const buildMail = (
  kind: MailKind,
  name: string,
  paidUntil: Date | null,
): MailContent => {
  const greeting = `Assalamualaikum${name ? ` ${escapeHtml(name)}` : ''},`
  const expiry = formatDate(paidUntil)

  if (kind === 'revoke') {
    return {
      subject: 'Akses SifuLaser anda telah ditamatkan',
      html: wrap(
        'Akses anda telah ditamatkan',
        `<p style="margin:0 0 12px">${greeting}</p>
         <p style="margin:0 0 12px">
           Akses berbayar anda di SifuLaser telah ditamatkan. Kandungan
           percuma seperti Simulator Level 1 masih boleh diakses seperti biasa.
         </p>
         <p style="margin:0 0 12px">
           Jika anda rasa ini satu kesilapan, sila hubungi kami di
           ${SUPPORT_EMAIL} dan kami akan semak semula.
         </p>`,
      ),
    }
  }

  if (kind === 'class') {
    return {
      subject: 'Tahniah! Anda kini peserta Kelas Training SifuLaser',
      html: wrap(
        'Tahniah, tempat anda telah disahkan!',
        `<p style="margin:0 0 12px">${greeting}</p>
         <p style="margin:0 0 12px">
           <strong>Tahniah!</strong> Tempat anda dalam Kelas Training Fizikal
           Alignment Laser telah disahkan, dan Akses Penuh digital anda sudah
           pun dibuka.
         </p>
         <p style="margin:0 0 12px">
           Anda kini boleh menggunakan Simulator Level 1 hingga 5 serta semua
           panduan Penyelenggaraan sehingga
           <strong>${expiry}</strong> (${ACCESS_PERIOD_LABEL}).
         </p>
         <p style="margin:0 0 12px">
           Kami akan menghubungi anda secara berasingan untuk tarikh dan lokasi
           kelas bersemuka. Sementara menunggu, mulakan dengan simulator dahulu
           supaya anda lebih bersedia pada hari kelas.
         </p>
         ${button}`,
      ),
    }
  }

  return {
    subject: 'Tahniah! Akses Penuh SifuLaser anda telah dibuka',
    html: wrap(
      'Tahniah, Akses Penuh anda telah dibuka!',
      `<p style="margin:0 0 12px">${greeting}</p>
       <p style="margin:0 0 12px">
         <strong>Tahniah!</strong> Pembayaran anda telah disahkan dan Akses
         Penuh SifuLaser anda sudah dibuka sepenuhnya.
       </p>
       <p style="margin:0 0 12px">
         Anda kini boleh menggunakan Simulator Level 1 hingga 5 serta semua
         panduan Penyelenggaraan sehingga
         <strong>${expiry}</strong> (${ACCESS_PERIOD_LABEL}).
       </p>
       ${button}`,
    ),
  }
}

let cached: Promise<typeof import('@emailjs/browser')> | null = null

const loadEmailJs = () => {
  if (!cached) cached = import('@emailjs/browser')
  return cached
}

/**
 * Hantar pemberitahuan kepada pelanggan.
 *
 * Sengaja TIDAK melontar ralat: kegagalan email tidak boleh membatalkan akses
 * yang sudah berjaya disimpan. Pemanggil menerima false dan boleh memaklumkan
 * admin supaya email susulan dibuat secara manual.
 */
export const sendAccessEmail = async (
  kind: MailKind,
  to: { email: string; name: string },
  paidUntil: Date | null,
): Promise<boolean> => {
  if (!IS_MAIL_CONFIGURED || !to.email) return false

  try {
    const emailjs = await loadEmailJs()
    const { subject, html } = buildMail(kind, to.name, paidUntil)
    await emailjs.send(
      MAIL_CONFIG.serviceId,
      MAIL_CONFIG.templateId,
      {
        to_email: to.email,
        to_name: to.name || to.email,
        subject,
        message_html: html,
      },
      { publicKey: MAIL_CONFIG.publicKey },
    )
    return true
  } catch {
    return false
  }
}
