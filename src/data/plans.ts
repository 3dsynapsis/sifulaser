// Kandungan halaman Pakej & Harga.

export interface PlanFeature {
  label: string
  /** Keterangan pendek di bawah label (pilihan). */
  detail?: string
  free: boolean
}

export const PLAN_FEATURES: PlanFeature[] = [
  {
    label: 'Simulator Level 1 — Cermin / Mirror Mount',
    detail: 'Latihan asas pelarasan 3 skru pada mirror mount.',
    free: true,
  },
  {
    label: 'About Me & Kedai Laser',
    detail:
      'Latar belakang SifuLaser dan senarai barang keperluan kerja laser di Shopee kami.',
    free: true,
  },
  {
    label: 'Simulator Level 2 — Head Laser',
    detail: 'Termasuk dua jenis head: Bodor dan XD Laser.',
    free: false,
  },
  {
    label: 'Simulator Level 3 — Gerakan Gantry',
    detail: 'Fahami sistem koordinat dan pergerakan gantry.',
    free: false,
  },
  {
    label: 'Simulator Level 4 & 5 — Beam Lurus',
    detail: 'Prosedur beam lurus paksi Y dan paksi X.',
    free: false,
  },
  {
    label: 'Panduan Weekly Maintenance',
    detail: 'Senarai semak mingguan 5 minit + format report.',
    free: false,
  },
  {
    label: 'Panduan Yearly Maintenance',
    detail: 'Penyelenggaraan berkala power supply, chiller dan lens.',
    free: false,
  },
  {
    label: 'Cara Setup WiFi (board Trocen)',
    detail: 'Sambung mesin ke rangkaian office tanpa kabel USB.',
    free: false,
  },
  {
    label: 'Cara Setting Chiller CW5000',
    detail: 'Nilai F0–F9 terbaik untuk iklim lembap + video panduan.',
    free: false,
  },
  {
    label: 'Kandungan baharu sepanjang tempoh langganan',
    detail:
      'Panduan dan level baharu yang kami tambah dalam tempoh 2 tahun anda.',
    free: false,
  },
]

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
