// Kandungan diambil daripada SOP Weekly Maintenance Operator Laser Machine
// (Version 1, 9.1.2025) dan SOP Yearly Maintenance Laser (Version 1, 20.3.2025).

export interface MaintenancePhoto {
  path: string
  alt: string
  caption?: string
}

export interface MaintenanceStep {
  title: string
  points: string[]
  photos?: MaintenancePhoto[]
  takePicture?: string
  video?: { embedUrl: string; watchUrl: string; title: string }
  settings?: { code: string; value: string }[]
}

export interface MaintenanceGuideData {
  id: 'weekly' | 'yearly' | 'wifi' | 'chiller'
  badge: string
  title: string
  intro: string
  accentVar: string
  meta: { label: string; value: string }[]
  steps: MaintenanceStep[]
  finalTitle: string
  finalPoints: string[]
}

const IMG = 'images/maintenance/'
const IMG_WIFI = 'images/wifi/'

export const WEEKLY_GUIDE: MaintenanceGuideData = {
  id: 'weekly',
  badge: 'Setiap Sabtu',
  title: 'Weekly Maintenance',
  intro:
    'Senarai semak mingguan supaya mesin laser tahan lama. Hanya 5 minit setiap Sabtu — siapkan 3 gambar untuk report.',
  accentVar: 'var(--color-screw-3)',
  meta: [
    { label: 'Bila', value: 'Setiap Sabtu' },
    { label: 'Masa', value: '±5 minit' },
    { label: 'Siapa', value: 'Production Team' },
  ],
  steps: [
    {
      title: 'Water Chiller — bersihkan filter',
      points: [
        'Buka penutup dan bersihkan filter penapis udara chiller.',
        'Pastikan habuk dibuang sepenuhnya sebelum pasang semula.',
      ],
      photos: [
        { path: `${IMG}chiller.jpg`, alt: 'Water chiller CW-5000' },
        {
          path: `${IMG}chiller-filter.jpg`,
          alt: 'Filter chiller sedang dibersihkan',
          caption: 'Contoh: Pic 1 — filter chiller',
        },
      ],
      takePicture: 'Pic 1 — gambar filter chiller',
    },
    {
      title: 'Extractor Udara — bersihkan kipas',
      points: [
        'Buka dan bersihkan kipas extractor.',
        'Buka kipas berhati-hati supaya blade tidak rosak.',
      ],
      photos: [{ path: `${IMG}extractor-fan.jpg`, alt: 'Kipas extractor udara' }],
    },
    {
      title: 'Compressor — buang air',
      points: ['Buang air dalam tangki compressor sehingga habis.'],
      photos: [{ path: `${IMG}compressor.jpg`, alt: 'Compressor udara' }],
    },
    {
      title: 'Compressor — semak / tukar minyak',
      points: [
        'Tukar minyak compressor 2 kali sebulan.',
        'Semak paras minyak pada tingkap penglihat (sight glass).',
      ],
      photos: [
        {
          path: `${IMG}oil-level.jpg`,
          alt: 'Tingkap paras minyak compressor',
          caption: 'Contoh: Pic 2 — oil level',
        },
      ],
      takePicture: 'Pic 2 — gambar oil level',
    },
    {
      title: 'Sapu / vacuum kawasan kerja',
      points: ['Sapu atau vacuum lantai office dan kawasan mesin.'],
      photos: [
        {
          path: `${IMG}workplace.jpg`,
          alt: 'Kawasan kerja yang telah dibersihkan',
          caption: 'Contoh: Pic 3 — workplace',
        },
      ],
      takePicture: 'Pic 3 — gambar workplace',
    },
  ],
  finalTitle: 'Hantar Report ke WhatsApp Boss',
  finalPoints: [
    'Pic 1 — filter chiller yang telah dibersihkan',
    'Pic 2 — paras minyak (oil level) compressor',
    'Pic 3 — kawasan kerja (workplace) yang telah disapu',
  ],
}

export const WIFI_GUIDE: MaintenanceGuideData = {
  id: 'wifi',
  badge: 'Board Trocen · LaserCAD',
  title: 'Cara Setup WiFi',
  intro:
    'Panduan menyambung mesin laser ke rangkaian WiFi office menggunakan TP-Link Range Extender — selepas siap, boleh hantar fail dari LaserCAD tanpa kabel USB.',
  accentVar: '#2f6fe4',
  meta: [
    { label: 'Mesin', value: 'Board Trocen (LaserCAD)' },
    { label: 'Alat', value: 'TP-Link TL-WA855RE' },
    { label: 'Masa', value: '±15 minit' },
  ],
  steps: [
    {
      title: 'Sediakan peralatan',
      points: [
        'Panduan ini hanya untuk mesin laser yang menggunakan board Trocen (software LaserCAD).',
        'Alat diperlukan: TP-Link WiFi Range Extender model TL-WA855RE dan satu kabel LAN (RJ45).',
      ],
      photos: [
        {
          path: `${IMG_WIFI}tl-wa855re.jpg`,
          alt: 'TP-Link TL-WA855RE WiFi Range Extender',
          caption: 'TP-Link TL-WA855RE',
        },
      ],
    },
    {
      title: 'Sambung kabel LAN ke mesin laser',
      points: [
        'Cucuk satu hujung kabel LAN ke port Ethernet pada WiFi extender.',
        'Cucuk hujung satu lagi ke port LAN pada mesin laser.',
      ],
    },
    {
      title: 'Set IP address pada mesin laser',
      points: [
        'Pada panel mesin laser, masukkan IP address statik — contoh: 192.168.1.17.',
        'Pastikan setiap mesin guna IP yang berbeza (tidak boleh sama dengan mesin lain).',
        'Selepas itu, hidupkan (ON) mesin.',
      ],
    },
    {
      title: 'Setup WiFi extender',
      points: [
        'Di komputer, sambung ke WiFi extender dan buka halaman tetapan: http://tplinkrepeater.net (atau IP 192.168.0.254).',
        'Ikut wizard setup: pilih WiFi utama office dan masukkan password supaya extender connect kepada router utama.',
        'Tekan Finish / Selesai — extender akan restart secara automatik.',
      ],
    },
    {
      title: 'Sambung komputer ke rangkaian',
      points: [
        'Selepas extender restart, connect komputer ke WiFi utama office — atau ke WiFi extender pun boleh.',
        'Kedua-duanya berada dalam rangkaian yang sama, jadi mana-mana pun berfungsi.',
      ],
    },
    {
      title: 'Daftarkan mesin dalam LaserCAD',
      points: [
        'Buka software LaserCAD dan tekan butang Select Mode di Control Panel.',
        'Pilih Network Mode, kemudian tekan Add.',
        'Masukkan nama mesin (contoh: MachineTest) dan IP address mesin (192.168.1.17), kemudian tekan OK.',
        'Tick ✓ pada mesin yang baru didaftarkan — nama dan IP mesin akan tertera di Control Panel.',
      ],
      photos: [
        {
          path: `${IMG_WIFI}lasercad-device-ip.svg`,
          alt: 'Dialog Device IP dalam LaserCAD',
          caption: 'Add → masukkan nama & IP mesin',
        },
        {
          path: `${IMG_WIFI}lasercad-select-mode.svg`,
          alt: 'Senarai Network Mode dalam LaserCAD',
          caption: 'Network Mode → tick mesin anda',
        },
        {
          path: `${IMG_WIFI}lasercad-control-panel.svg`,
          alt: 'Control Panel LaserCAD menunjukkan mesin dipilih',
          caption: 'Nama & IP tertera di Control Panel',
        },
      ],
    },
    {
      title: 'Test hantar fail',
      points: [
        'Hantar satu fail test dari LaserCAD ke mesin laser.',
        'Jika fail sampai ke mesin, setup selesai!',
      ],
    },
  ],
  finalTitle: 'Tip Jika Gagal Connect',
  finalPoints: [
    'Pastikan komputer dan mesin berada dalam rangkaian yang sama.',
    'Semak nombor ketiga IP mesin sama dengan IP router. Contoh: jika router guna 192.168.1.x, IP mesin mesti bermula 192.168.1 juga (contoh: 192.168.1.17). Jika mesin guna 192.168.0.x, ia tidak akan connect — ubah IP mesin supaya sepadan.',
    'Semak IP mesin tidak bercanggah dengan mesin lain — setiap mesin mesti ada IP unik.',
    'Cuba restart WiFi extender dan mesin laser, kemudian test semula.',
  ],
}

export const CHILLER_GUIDE: MaintenanceGuideData = {
  id: 'chiller',
  badge: 'Water Chiller · CW-5000',
  title: 'Cara Setting Chiller CW5000',
  intro:
    'Setting terbaik untuk chiller CW-5000 di negara lembap seperti Malaysia dan Brazil. Ikut video dan jadual di bawah — hanya 5 minit.',
  accentVar: '#0891b2',
  meta: [
    { label: 'Mesin', value: 'Water Chiller CW-5000' },
    { label: 'Sesuai', value: 'Negara lembap (Malaysia / Brazil)' },
    { label: 'Masa', value: '±5 minit' },
  ],
  steps: [
    {
      title: 'Tonton video panduan',
      points: [
        'Video ini menunjukkan cara masuk ke menu setting dan nilai terbaik untuk CW-5000.',
      ],
      video: {
        embedUrl: 'https://www.youtube-nocookie.com/embed/EWr1KlqAqV0',
        watchUrl: 'https://youtu.be/EWr1KlqAqV0',
        title: 'Best Setting CW5000 for Humid Country',
      },
    },
    {
      title: 'Masuk ke menu setting',
      points: [
        'Tekan dan tahan butang Up (▲) dan SET serentak selama 5 saat.',
        'Masukkan password: 8.',
      ],
    },
    {
      title: 'Masukkan nilai F0 hingga F9',
      points: ['Set setiap parameter mengikut jadual di bawah:'],
      settings: [
        { code: 'F0', value: '23' },
        { code: 'F1', value: '0' },
        { code: 'F2', value: '1' },
        { code: 'F3', value: '0' },
        { code: 'F4', value: '4' },
        { code: 'F5', value: '14' },
        { code: 'F6', value: '45' },
        { code: 'F7', value: '8' },
        { code: 'F8', value: '35' },
        { code: 'F9', value: '15' },
      ],
    },
  ],
  finalTitle: 'Nota',
  finalPoints: [
    'Setting ini adalah setting terbaik untuk negara beriklim lembap seperti Malaysia dan Brazil.',
    'Selepas set, pastikan suhu air stabil dan tiada peluh air (condensation) pada laser tube.',
  ],
}

export const YEARLY_GUIDE: MaintenanceGuideData = {
  id: 'yearly',
  badge: 'Ikut Jadual Kalendar',
  title: 'Yearly Maintenance',
  intro:
    'Penyelenggaraan berkala untuk jangka hayat mesin yang lebih lama. Dijadualkan dalam Google Calendar — peruntukkan 1 jam untuk setiap mesin.',
  accentVar: 'var(--color-near)',
  meta: [
    { label: 'Bila', value: 'Ikut jadual Google Calendar' },
    { label: 'Masa', value: '1 jam / 1 mesin' },
    { label: 'Siapa', value: 'Production Team' },
  ],
  steps: [
    {
      title: 'Power Supply Laser Tube',
      points: [
        'Buka casing dan bersihkan bahagian dalam.',
        'Guna berus plastik + vacuum.',
        'Ubah terminal negatif dengan memasang connector block (TB 1503) supaya mudah maintenance akan datang.',
      ],
      photos: [
        { path: `${IMG}psu-laser-tube.jpg`, alt: 'Power supply laser tube' },
        {
          path: `${IMG}tb1503.jpg`,
          alt: 'Connector block TB 1503',
          caption: 'Connector block TB 1503',
        },
      ],
    },
    {
      title: 'Power Supply 24V / 36V',
      points: ['Buka casing dan bersihkan bahagian dalam.', 'Guna berus plastik + vacuum.'],
      photos: [{ path: `${IMG}psu-24v.jpg`, alt: 'Power supply 24V/36V' }],
    },
    {
      title: 'Chiller — tukar air',
      points: ['Buang air sehingga habis.', 'Isi dengan air baru.'],
      photos: [{ path: `${IMG}chiller.jpg`, alt: 'Water chiller' }],
    },
    {
      title: 'Laser Tube — cuci lens',
      points: ['Cuci lens pada laser tube dengan berhati-hati.'],
      photos: [{ path: `${IMG}laser-tube.jpg`, alt: 'Laser tube' }],
    },
    {
      title: 'Mesin Laser — vacuum wayar',
      points: ['Vacuum di bahagian wayar untuk kurangkan habuk.'],
      photos: [
        {
          path: `${IMG}brush.jpg`,
          alt: 'Berus plastik',
          caption: 'Guna berus plastik bersama vacuum',
        },
      ],
    },
  ],
  finalTitle: 'Hantar Report ke WhatsApp Boss',
  finalPoints: [
    'Hantar gambar kerja yang telah siap kepada Boss di WhatsApp.',
    'Tandakan tarikh siap dalam Google Calendar.',
    'Set peringatan untuk sesi maintenance berikutnya.',
  ],
}
