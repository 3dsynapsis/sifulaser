// Kandungan halaman Pakej & Harga.

export type TierId = 'free' | 'full' | 'class'

export interface PlanFeature {
  label: string
  /** Keterangan pendek di bawah label (pilihan). */
  detail?: string
  /** Pakej yang termasuk ciri ini. */
  tiers: TierId[]
}

const DIGITAL: TierId[] = ['full', 'class']
const SEMUA: TierId[] = ['free', 'full', 'class']

export const PLAN_FEATURES: PlanFeature[] = [
  {
    label: 'Simulator Level 1 — Cermin / Mirror Mount',
    detail: 'Latihan asas pelarasan 3 skru pada mirror mount.',
    tiers: SEMUA,
  },
  {
    label: 'About Me & Kedai Laser',
    detail:
      'Latar belakang SifuLaser dan senarai barang keperluan kerja laser di Shopee kami.',
    tiers: SEMUA,
  },
  {
    label: 'Box Maker — reka kotak finger joint',
    detail:
      'Masukkan saiz, terus dapat fail SVG siap potong. Ada divider 2 atau 4 ruang.',
    tiers: SEMUA,
  },
  {
    label: 'Puzzle Generator — jana jigsaw',
    detail:
      'Tetapkan saiz papan dan bilangan cebisan, terus dapat fail SVG siap potong.',
    tiers: SEMUA,
  },
  {
    label: 'Text Engraver — teks satu garisan',
    detail:
      'Fon satu garisan untuk ukiran laju, saiz dalam mm sebenar. Keluar SVG atau PDF.',
    tiers: SEMUA,
  },
  {
    label: 'Stand Nama — papan tanda nama meja',
    detail:
      'Pilih saiz Small, Medium atau Large. Plate berukir atau huruf dipotong '
      + 'tembus, 25 pilihan fon, siap dengan tapak berslot.',
    tiers: SEMUA,
  },
  {
    label: 'QR Generator — kod QR untuk laser',
    detail:
      'Masukkan link, terus dapat SVG atau PDF. Saiz dalam mm sebenar, dan ia '
      + 'beri amaran kalau modul terlalu halus untuk diimbas selepas diukir.',
    tiers: SEMUA,
  },
  {
    label: 'Template Adjuster — padankan fail dengan material anda',
    detail:
      'Muat naik SVG yang anda muat turun, ubah saiz keseluruhan dan tebal '
      + 'material secara berasingan. Ia lapor apa yang diubah dan apa yang tidak.',
    tiers: SEMUA,
  },
  {
    label: 'Cake Topper — nama untuk atas kek',
    detail:
      'Satu keping dengan pancang, siap untuk akrilik tuang. 33 pilihan fon. '
      + 'Ia memberi amaran kalau huruf terlalu halus, atau kalau ia akan senget.',
    tiers: SEMUA,
  },
  {
    label: 'Simulator Level 2 — Head Laser',
    detail: 'Termasuk dua jenis head: Bodor dan XD Laser.',
    tiers: DIGITAL,
  },
  {
    label: 'Simulator Level 3 — Gerakan Gantry',
    detail: 'Fahami sistem koordinat dan pergerakan gantry.',
    tiers: DIGITAL,
  },
  {
    label: 'Simulator Level 4 & 5 — Beam Lurus',
    detail: 'Prosedur beam lurus paksi Y dan paksi X.',
    tiers: DIGITAL,
  },
  {
    label: 'Panduan Weekly Maintenance',
    detail: 'Senarai semak mingguan 5 minit + format report.',
    tiers: DIGITAL,
  },
  {
    label: 'Panduan Yearly Maintenance',
    detail: 'Penyelenggaraan berkala power supply, chiller dan lens.',
    tiers: DIGITAL,
  },
  {
    label: 'Cara Setup WiFi (board Trocen)',
    detail: 'Sambung mesin ke rangkaian office tanpa kabel USB.',
    tiers: DIGITAL,
  },
  {
    label: 'Cara Setting Chiller CW5000',
    detail: 'Nilai F0–F9 terbaik untuk iklim lembap + video panduan.',
    tiers: DIGITAL,
  },
  {
    label: 'Kandungan baharu sepanjang tempoh langganan',
    detail:
      'Panduan dan level baharu yang kami tambah dalam tempoh 2 tahun anda.',
    tiers: DIGITAL,
  },
  {
    label: 'Kelas bersemuka 4 jam bersama sifu',
    detail: 'Sesi latihan fizikal alignment laser, bukan secara video.',
    tiers: ['class'],
  },
  {
    label: 'Tunjuk cara terus di hadapan anda',
    detail: 'Lihat setiap langkah dilakukan secara langsung, bukan teori.',
    tiers: ['class'],
  },
  {
    label: 'Sesi soal jawab tanpa had sepanjang kelas',
    detail: 'Tanya apa-apa masalah mesin anda dan dapat jawapan serta-merta.',
    tiers: ['class'],
  },
  {
    label: 'Kumpulan kecil — maksimum 10 peserta',
    detail: 'Sifu ada masa untuk beri perhatian kepada setiap peserta.',
    tiers: ['class'],
  },
]

/** Butiran kelas latihan bersemuka. */
export const CLASS_SEAT_LIMIT = 10

export const CLASS_INFO = {
  title: 'Kelas Training Fizikal Alignment Laser',
  dateLabel: 'Sabtu, 12 September 2026',
  timeLabel: '9:30 pagi – 1:30 tengah hari',
  durationLabel: '4 jam',
  locationLabel:
    '3D Synapsis, 44a, Jalan Keluli AK7/AK, Seksyen 7, 40000 Shah Alam, Selangor',
  locationUrl: 'https://maps.app.goo.gl/dgSTQMqnD1udUVLE6',
  seatsLabel: `Terhad ${CLASS_SEAT_LIMIT} peserta`,
}

export interface PlanFaq {
  question: string
  answer: string
}

export const PLAN_FAQ: PlanFaq[] = [
  {
    question: 'Bagaimana cara bayar?',
    answer:
      'Log masuk dengan Google, kemudian tekan "Naik taraf" untuk lihat butiran akaun bank dan kod QR. Selepas bayar, hantar resit ke WhatsApp yang tertera di halaman tersebut — kami akan buka Akses Penuh untuk akaun anda.',
  },
  {
    question: 'Berapa lama akses saya sah?',
    answer:
      'Akses Penuh sah selama 2 tahun dari tarikh pembayaran, termasuk semua panduan dan level baharu yang kami tambah dalam tempoh tersebut. Tiada bayaran bulanan.',
  },
  {
    question: 'Apa jadi selepas 2 tahun?',
    answer:
      'Anda boleh perbaharui untuk 2 tahun berikutnya pada harga yang sama. Tarikh luput sentiasa dipaparkan pada akaun anda, jadi anda tahu bila masanya. Jika tidak diperbaharui, akaun kembali ke pakej Percuma — data anda kekal.',
  },
  {
    question: 'Beza pakej Akses Penuh dengan pakej Kelas?',
    answer:
      'Kedua-duanya memberi akses digital yang sama selama 2 tahun. Pakej Kelas menambah sesi latihan bersemuka 4 jam bersama sifu, di mana anda boleh melihat setiap langkah dilakukan secara langsung dan bertanya soalan tentang mesin anda sendiri.',
  },
  {
    question: 'Boleh guna pada berapa peranti?',
    answer:
      'Akses terikat pada akaun Google anda, bukan peranti. Log masuk pada telefon, tablet atau komputer — semua berfungsi.',
  },
  {
    question: 'Saya belum pasti — boleh cuba dahulu?',
    answer:
      'Boleh. Simulator Level 1 (Cermin) percuma sepenuhnya tanpa perlu log masuk. Cuba dahulu, kemudian naik taraf bila anda rasa berbaloi.',
  },
]
