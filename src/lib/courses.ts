// Kelas yang peserta pernah hadiri, disimpan di Firestore: users/{uid}.kursus
// sebagai senarai id (contoh ['website-ai']).
//
// Ini berasingan daripada `plan`. `plan: 'class'` ialah kelas fizikal alignment
// laser yang datang bersama Akses Penuh; kelas AI tiada kaitan dengan bayaran
// itu, dan seorang pelanggan boleh hadir kedua-duanya. Senarai, bukan boolean,
// supaya kelas baharu nanti cuma perlu id baharu - firestore.rules tidak perlu
// diubah lagi.
//
// Hanya admin boleh menulis medan ini (lihat firestore.rules). Isi kelas itu
// sendiri ada dalam bundle awam, jadi kunci ini memisahkan peserta daripada
// pelawat, bukan rahsia - sama seperti panduan maintenance.

export const WEB_AI_COURSE = 'website-ai'

/**
 * Nama dan pautan Kelas Website AI untuk kad halaman utama dan carian. Di sini
 * dan bukan dalam data/kelasWeb.ts supaya halaman utama tidak menarik seluruh
 * isi kelas ke dalam bundle utama - halaman kelas dimuat secara malas.
 */
export const WEB_AI_CLASS = {
  title: 'Bina Website Sendiri Dengan AI',
  cardTitle: 'Kelas Bina Website Sendiri Dengan AI',
  cardDesc: 'Rujukan peserta: Modul 1 hingga 5, prompt dan langkah.',
  href: '#/kelas-web',
}

/** Baca medan kursus dari Firestore dengan selamat. */
export const toCourses = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
