// Syarikat di sebalik SifuLaser, seperti dalam sijil SSM (Borang D, 3 Julai
// 2025) - alamat UTAMA perniagaan, bukan cawangan 68 Jalan Keluli AN7/AN yang
// mahligaiseni.com guna.
//
// Satu sumber untuk dua tempat: footer laman (LegalFooter, React) dan page
// polisi statik /terma/, /privasi/, /refund/, /ambil/, /hubungi/ yang dijana
// oleh scripts/build-legal.mjs. Tukar di sini, kemudian:
//
//     node scripts/build-legal.mjs && npm run build
//
// Keputusan Boss, 20 Oktober 2026: barang diambil sendiri di Shah Alam sahaja
// (tiada pos - akrilik mudah pecah), siap 3-5 hari bekerja, disimpan 30 hari.

export const COMPANY = {
  name: 'SYNAPSIS ENTERPRISE',
  regNo: '201003171487 (SA0163793-U)',
  brand: 'Mahligai Seni',
  address: ['No 44A, Jalan Keluli AK7/AK', 'Seksyen 7', '40000 Shah Alam', 'Selangor, Malaysia'],
  mapsUrl: 'https://maps.app.goo.gl/dgSTQMqnD1udUVLE6',
  whatsapp: '60134354118',
  whatsappDisplay: '+60 13-435 4118',
  email: '3dsynapsis@gmail.com',
  pickupHours: {
    ms: 'Isnin hingga Sabtu, 10:30 pagi - 6:30 petang (kecuali cuti umum)',
    en: 'Monday to Saturday, 10:30 am - 6:30 pm (except public holidays)',
  },
  leadTime: { ms: '3-5 hari bekerja', en: '3-5 working days' },
  holdDays: 30,
  refundDays: 14,
  updated: { ms: '20 Oktober 2026', en: '20 October 2026' },
} as const

/** Page polisi, dalam susunan footer. */
export const LEGAL_PAGES = [
  { path: '/terma/', ms: 'Terma & Syarat', en: 'Terms & Conditions' },
  { path: '/privasi/', ms: 'Dasar Privasi', en: 'Privacy Policy' },
  { path: '/refund/', ms: 'Pembatalan & Bayaran Balik', en: 'Cancellation & Refund' },
  { path: '/ambil/', ms: 'Penghantaran & Ambil Sendiri', en: 'Delivery & Self-Collection' },
  { path: '/hubungi/', ms: 'Hubungi Kami', en: 'Contact Us' },
] as const
