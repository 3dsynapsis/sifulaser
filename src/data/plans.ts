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
    label: 'Kedai Laser',
    detail: 'Senarai barang keperluan kerja laser di Shopee kami.',
    free: true,
  },
  {
    label: 'About Me',
    detail: 'Latar belakang SifuLaser dan Mahligai Seni.',
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
    label: 'Kandungan baharu akan datang',
    detail: 'Panduan dan level baharu ditambah dari masa ke masa.',
    free: false,
  },
  {
    label: 'Sokongan terus melalui WhatsApp',
    detail: 'Tanya terus jika ada masalah pada mesin anda.',
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
      'Log masuk dengan Google, kemudian WhatsApp kami. Kami akan berikan maklumat pembayaran dan buka Akses Penuh untuk akaun anda sebaik bayaran diterima.',
  },
  {
    question: 'Berapa lama akses saya sah?',
    answer:
      'Bayaran sekali sahaja untuk akses selamanya — termasuk panduan baharu yang kami tambah kemudian. Tiada bayaran bulanan.',
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
