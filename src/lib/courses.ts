// Kelas "Bina Website Sendiri Dengan AI" - nama dan pautan untuk kad halaman
// utama dan carian.
//
// Di sini dan bukan dalam data/kelasWeb.ts supaya halaman utama tidak menarik
// senarai modul ke dalam bundle utama - halaman kelas dimuat secara malas.
//
// Kelas ini hanya untuk pengguna yang log masuk (Boss, 9 Nov 2026): log masuk
// sahaja sudah cukup untuk buka slide, tanpa penanda peserta di Panel Admin.
// Pautan slide ada dalam bundle awam, jadi ini memisahkan pengguna daripada
// pelawat, bukan rahsia - sama seperti panduan maintenance.

export const WEB_AI_CLASS = {
  title: 'Bina Website Sendiri Dengan AI',
  cardTitle: 'Kelas Bina Website Sendiri Dengan AI',
  cardDesc: 'Slide Pembukaan hingga Modul 5 untuk peserta kelas.',
  href: '#/kelas-web',
}
