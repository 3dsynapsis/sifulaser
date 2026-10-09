// Direktori alat halaman utama — data, bukan markup.
//
// Dua benda membacanya: halaman utama dan carian.
//
// Halaman utama ialah "One Stop Centre": empat langkah mengikut perjalanan
// satu kerja laser, bukan mengikut jenis alat. Susunan TOOLS di bawah IALAH
// susunan pada halaman, jadi alihkan entri untuk mengubah urutan tile.
//
//   1 harga    Berapa harganya?      - pelanggan dapat harga dulu
//   2 idea     Client tak ada idea   - alat yang menjana design penuh
//   3 fail     Ada idea, perlu fail  - alat yang mengubah atau menukar fail
//   4 belajar  Belajar lebih         - episod, kelas, dan rak mesin di bawah
//
// Mesin & penjagaan TIDAK lagi kumpulan sendiri. Bos memutuskan pada 9 Oktober
// 2026 bahawa laman ini bukan lagi tentang penjagaan mesin, jadi tiga alat itu
// duduk di rak kecil (`shelf: 'mesin'`) di hujung langkah 4.
//
// Blog dan About tidak menjadi tile (`onHome: false`): langkah 4 memaparkan
// episod terkini sendiri, dan About sudah ada di bar tab. Kedua-duanya kekal
// sebagai sasaran carian.

import {
  ArrowRightLeft,
  Box,
  BookOpenText,
  CakeSlice,
  Calculator,
  ClipboardCheck,
  Crosshair,
  House,
  KeyRound,
  LayoutGrid,
  Luggage,
  Newspaper,
  PenLine,
  Printer,
  Puzzle,
  QrCode,
  RectangleHorizontal,
  Scaling,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Route } from '../hooks/useHashRoute'

export type GroupId = 'harga' | 'idea' | 'fail' | 'belajar'

export interface ToolEntry {
  title: string
  /** Baris tile — maksimum 44 aksara, atau clamp dua baris memotong tengah perkataan. */
  shortDescription: string
  /** Ayat penuh lama. Tidak dipaparkan pada tile; carian memadankannya. */
  description: string
  href: string
  group: GroupId
  /** 'art' = gambar hasil alat; 'icon' = glif lucide (alat itu tidak menghasilkan apa-apa untuk digambarkan). */
  variant: 'art' | 'icon'
  /** Laluan mutlak ke docs/images/tools/. 404 di bawah `npm run dev` (publicDir: false). */
  art?: string
  keywords: string[]
  /** true jika kad ini kandungan berbayar sepenuhnya. */
  premium?: boolean
  /** 'mesin' = rak kecil di hujung langkah 4, bukan tile penuh. */
  shelf?: 'mesin'
  /** false = sasaran carian sahaja, tiada tile di halaman utama. */
  onHome?: boolean
  /**
   * true = alat belum siap: kadnya dipaparkan dengan label "Akan datang" tetapi
   * tidak boleh diklik, ia tiada dalam carian, dan fail untuk AI (llms.txt,
   * sitemap) tidak menyebutnya. Buang bila alat itu dimuktamadkan.
   */
  soon?: boolean
  Icon: LucideIcon
}

export const TOOLS: ToolEntry[] = [
  // ---- 1. BERAPA HARGANYA? ----
  {
    // Langkah pertama halaman utama: soalan pertama setiap kerja laser ialah
    // "berapa?". Kalkulator ini MEMBACA fail pelanggan (PDF, AI, DXF atau
    // gambar) dan hujungnya sebut harga WhatsApp ke kedai, pada harga kedai.
    title: 'Kalkulator Laser Cut',
    shortDescription: 'Harga potong & ukir laser dari fail anda.',
    description:
      'Upload PDF, AI, DXF atau gambar, pilih bahan dan saiz, dan terus nampak anggaran harga potong dan ukir laser, kemudian hantar sebut harga ke WhatsApp.',
    href: '#/lasercut',
    group: 'harga',
    variant: 'art',
    // SVG dijana oleh `node scripts/thumb-lasercut.mjs` daripada kod vendored
    // dan satu fail contoh sebenar: papan, ukiran, garisan potong dan julat
    // harga semuanya keluar dari alat itu sendiri.
    art: '/images/tools/lasercut.svg',
    keywords: [
      'laser cut',
      'laser',
      'potong',
      'ukir',
      'engrave',
      'harga',
      'sebut harga',
      'quotation',
      'plywood',
      'akrilik',
      'acrylic',
      'mdf',
      'cermin',
      'mirror',
      'dxf',
      'png',
      'gambar',
      'kalkulator',
    ],
    Icon: Calculator,
  },
  {
    // Jiran Kalkulator Laser Cut atas sebab yang sama: ia membaca fail
    // pelanggan dan hujungnya sebut harga WhatsApp ke kedai.
    title: 'UV Print Calculator',
    shortDescription: 'Harga UV print akrilik terus dari fail anda.',
    description:
      'Upload PDF atau AI dan terus nampak harga cetakan UV atas akrilik jernih, kemudian hantar sebut harga ke WhatsApp.',
    href: '#/uvprint',
    group: 'harga',
    variant: 'art',
    // Belum dimuktamadkan (Boss, 9 Okt 2026): kad dipaparkan, tidak boleh diklik.
    soon: true,
    // SVG dijana oleh `node scripts/thumb-uvprint.mjs` daripada kod vendored
    // dan satu fixture sebenar: garisan potong, artwork dan harga semuanya
    // keluar dari alat itu sendiri, jadi ia tidak boleh jadi basi.
    art: '/images/tools/uvprint.svg',
    keywords: [
      'uv print',
      'akrilik',
      'acrylic',
      'harga',
      'sebut harga',
      'quotation',
      'cetak',
      'pdf',
      'kalkulator',
    ],
    Icon: Printer,
  },

  // ---- 2. CLIENT TAK ADA IDEA ----
  {
    title: 'Box Maker',
    shortDescription: 'Kotak finger joint, terus jadi fail SVG.',
    description:
      'Reka kotak finger joint ikut saiz anda, terus dapat fail SVG siap potong.',
    href: '#/boxmaker',
    group: 'idea',
    variant: 'art',
    // FOTO 3D, diambil 4 September 2026, gaya Almari Laci. Boleh jadi basi dan
    // tiada apa-apa dalam repo ini akan memberitahu. Ambil semula dengan
    // `node scripts/tile-shots.mjs docs/images/tools boxmaker` selepas apa-apa
    // perubahan rupa. Lihat docs/images/tools/README.md.
    art: '/images/tools/boxmaker.webp',
    keywords: ['kotak', 'almari', 'laci', 'finger joint', 'box', 'bekas', 'corak', 'islamik', 'pattern', 'hamper'],
    Icon: Box,
  },
  {
    // Bersebelahan Box Maker dengan sengaja: kedua-duanya bekas finger joint,
    // tetapi Box Maker ialah kotak (bertutup, pembahagi 0/2/4 di tengah) dan
    // ini dulang TERBUKA yang petaknya bebas - bilangan dan saiz setiap satu.
    // Orang yang mencari "laci" atau "bekas" patut nampak kedua-duanya sekali
    // dan memilih dengan mata.
    title: 'Tray Organizer',
    shortDescription: 'Dulang berpetak, untuk laser atau 3D print.',
    description:
      'Reka dulang organizer berpetak untuk laci atau meja - belah petak, seret pembahagi, dapat SVG half-lap untuk laser atau STL satu jasad untuk 3D printer.',
    href: '#/tray',
    group: 'idea',
    variant: 'art',
    // SVG dijana oleh `node scripts/thumb-tray.mjs` daripada buildTray() sebenar
    // dalam docs/tray/src: pandangan atas dulang dengan petak tak seragam.
    // Tidak boleh jadi basi seperti tiga foto 3D.
    art: '/images/tools/tray.svg',
    keywords: [
      'dulang',
      'tray',
      'organizer',
      'laci',
      'petak',
      'pembahagi',
      'divider',
      'bento',
      'susun',
      'meja',
      'alat tulis',
      'stationery',
      'bekas',
      'stl',
      'cetak 3d',
      '3d print',
      'printer',
      'pla',
      'sudu',
      'cutlery',
    ],
    Icon: LayoutGrid,
  },
  {
    // Tinggi dalam senarai idea: rehal ialah hadiah yang paling kerap diminta
    // tanpa design, dan alat ini menjana keseluruhannya dari nama dan corak.
    title: 'Rehal Generator',
    shortDescription: 'Rehal Al-Quran, corak dan nama terukir.',
    description:
      'Rehal Al-Quran boleh lipat — corak geometri dan nama terukir di tengahnya.',
    href: '#/rehal',
    group: 'idea',
    variant: 'art',
    // SVG dijana oleh `node tools/thumb.mjs` alat itu sendiri daripada geometri
    // sebenar, jadi ia tidak boleh jadi basi seperti tiga foto 3D di atas.
    art: '/images/tools/rehal.svg',
    keywords: [
      'quran',
      'al-quran',
      'rehal',
      'kitab',
      'baca',
      'islamik',
      'geometri',
      'corak',
      'nama',
      'kayu',
    ],
    Icon: BookOpenText,
  },
  {
    title: 'Cake Topper',
    shortDescription: 'Nama atas kek, satu keping berpancang.',
    description:
      'Nama untuk atas kek, satu keping dengan pancang. Untuk akrilik tuang.',
    href: '#/topper',
    group: 'idea',
    variant: 'art',
    art: '/images/tools/topper.svg',
    keywords: ['kek', 'cake', 'birthday', 'akrilik', 'pancang', 'harijadi', 'stl', 'cetak 3d', '3d print'],
    Icon: CakeSlice,
  },
  {
    title: 'Stand Nama',
    shortDescription: 'Papan nama meja, siap dengan tapak.',
    description:
      'Papan tanda nama meja: plate berukir atau huruf potong, siap dengan tapak.',
    href: '#/stand',
    group: 'idea',
    variant: 'art',
    // FOTO 3D, 4 September 2026 — sama amaran seperti Box Maker di atas.
    art: '/images/tools/stand.webp',
    keywords: ['papan nama', 'meja', 'signage', 'plate', 'nameplate', 'tapak'],
    Icon: RectangleHorizontal,
  },
  {
    title: 'Keychain Generator',
    shortDescription: 'Nama jadi kekunci, siap lubang ring.',
    description:
      'Nama jadi kekunci satu keping, siap lubang ring. Untuk akrilik atau kayu.',
    href: '#/keychain',
    group: 'idea',
    variant: 'art',
    art: '/images/tools/keychain.svg',
    keywords: ['kunci', 'gantung', 'ring', 'akrilik', 'nama', 'souvenir'],
    Icon: KeyRound,
  },
  {
    title: 'Tag Generator',
    shortDescription: 'Tag beg dua muka, slot tali siap.',
    description:
      'Tag beg dengan slot tali. Muka depan untuk nama, belakang untuk alamat.',
    href: '#/tag',
    group: 'idea',
    variant: 'art',
    // FOTO 3D, 4 September 2026 — sama amaran seperti Box Maker di atas.
    art: '/images/tools/tag.webp',
    keywords: ['beg', 'luggage', 'sekolah', 'alamat', 'tali', 'label'],
    Icon: Luggage,
  },
  {
    title: 'Puzzle Generator',
    shortDescription: 'Garisan jigsaw ikut saiz papan anda.',
    description:
      'Jana garisan potong jigsaw ikut saiz papan anda, terus dapat fail SVG.',
    href: '#/puzzle',
    group: 'idea',
    variant: 'art',
    art: '/images/tools/puzzle.svg',
    keywords: ['jigsaw', 'teka-teki', 'papan', 'kepingan', 'mainan'],
    Icon: Puzzle,
  },

  // ---- 3. ADA IDEA, PERLU FAIL ----
  {
    title: 'Text Engraver',
    shortDescription: 'Teks satu garisan untuk ukiran laju.',
    description:
      'Teks satu garisan untuk ukiran laju. Dapat fail SVG atau PDF ikut saiz mm.',
    href: '#/text',
    group: 'fail',
    variant: 'art',
    art: '/images/tools/text.svg',
    keywords: ['tulisan', 'ukir', 'engrave', 'font', 'single line', 'plotter'],
    Icon: PenLine,
  },
  {
    title: 'QR Generator',
    shortDescription: 'Link jadi kod QR, saiz mm sebenar.',
    description:
      'Tukar link jadi kod QR untuk laser. Saiz mm sebenar, ada bingkai keychain.',
    href: '#/qr',
    group: 'fail',
    variant: 'art',
    art: '/images/tools/qr.svg',
    keywords: ['kod', 'scan', 'link', 'plaque', 'papan', 'barcode'],
    Icon: QrCode,
  },
  {
    title: 'Template Adjuster',
    shortDescription: 'Ubah saiz dan tebal fail SVG luar.',
    description:
      'Fail SVG dari internet tak padan material anda? Ubah saiz dan tebalnya.',
    href: '#/adjust',
    group: 'fail',
    variant: 'icon',
    keywords: ['svg', 'template', 'saiz', 'tebal', 'skala', 'material'],
    Icon: Scaling,
  },
  {
    // Duduk sebelah Template Adjuster dengan sengaja. Kepada orang luar dua
    // alat ini nampak sama, jadi yang paling menolong ialah melihatnya
    // bersebelahan: Adjuster MENGUBAH lukisan (saiz, tebal garisan), Converter
    // File hanya menukar BEKASNYA.
    title: 'Converter File',
    shortDescription: 'Tukar SVG dan DXF ke SVG, PDF atau DXF.',
    description:
      'Tukar format fail vektor tanpa mengubah saiz, bentuk atau kedudukan lukisan.',
    href: '#/converter',
    group: 'fail',
    variant: 'icon',
    keywords: ['svg', 'dxf', 'pdf', 'tukar', 'format', 'convert', 'autocad', 'lightburn', 'fail'],
    Icon: ArrowRightLeft,
  },

  // ---- 4. BELAJAR LEBIH ----
  {
    title: 'Blog',
    shortDescription: 'Episod Laser, nota kerja Sifu Hisham.',
    description:
      'Episod Laser — nota Sifu Hisham dari kerja harian, sedia untuk disalin.',
    href: '#/blog',
    group: 'belajar',
    onHome: false,
    variant: 'icon',
    keywords: ['episod', 'nota', 'artikel', 'panduan', 'tulisan', 'hisham'],
    Icon: Newspaper,
  },
  {
    title: 'Simulator Alignment',
    shortDescription: 'Latih alignment cermin, langkah demi langkah.',
    description: 'Belajar dan praktik alignment cermin untuk Mesin Laser Cut.',
    href: '#/simulator',
    group: 'belajar',
    shelf: 'mesin',
    variant: 'icon',
    keywords: ['cermin', 'mirror', 'laras', 'level', 'latihan', 'align'],
    Icon: Crosshair,
  },
  {
    title: 'Maintenance',
    shortDescription: 'Senarai semak weekly & yearly mesin anda.',
    description:
      'Senarai semak weekly & yearly untuk memastikan mesin sentiasa optimum.',
    href: '#/maintenance',
    group: 'belajar',
    shelf: 'mesin',
    variant: 'icon',
    keywords: ['servis', 'weekly', 'yearly', 'chiller', 'wifi', 'penjagaan'],
    premium: true,
    Icon: ClipboardCheck,
  },
  {
    title: 'Troubleshooting',
    shortDescription: 'Carta SOP bila mesin laser tak menjadi.',
    description: 'Carta SOP untuk kesan punca bila mesin laser tak berfungsi.',
    href: '#/troubleshoot',
    group: 'belajar',
    shelf: 'mesin',
    variant: 'icon',
    keywords: ['rosak', 'masalah', 'sop', 'punca', 'tak potong'],
    premium: true,
    Icon: Stethoscope,
  },
  {
    title: 'About Me & Kedai Laser',
    shortDescription: 'Kenali kami dan kedai Shopee laser.',
    description:
      'Kenali SifuLaser, dan lihat barang keperluan kerja laser di Shopee kami.',
    href: '#/about',
    group: 'belajar',
    onHome: false,
    variant: 'icon',
    keywords: ['kedai', 'shopee', 'beli', 'barang', 'mahligai seni', 'hubungi'],
    Icon: UserRound,
  },
]

export interface ToolGroup {
  id: GroupId
  /** Nombor langkah yang dipaparkan. Mengikut susunan GROUPS. */
  step: number
  title: string
  /** Label pendek untuk cip lompat di bawah hero — satu perkataan. */
  chip: string
  subtitle: string
  /** Lima pemboleh ubah warna yang diwarisi oleh setiap anak panel. */
  vars: CSSProperties
}

const vars = (n: 1 | 2 | 3 | 4): CSSProperties =>
  ({
    '--g-wash': `var(--color-g${n}-wash)`,
    '--g-soft': `var(--color-g${n}-soft)`,
    '--g-line': `var(--color-g${n}-line)`,
    '--g-accent': `var(--color-g${n}-accent)`,
    '--g-ink': `var(--color-g${n}-ink)`,
  }) as CSSProperties

export const GROUPS: ToolGroup[] = [
  {
    id: 'harga',
    step: 1,
    title: 'Berapa harganya?',
    chip: 'Harga',
    subtitle: 'Upload fail, terus nampak harga. Sebut harga terus ke WhatsApp.',
    vars: vars(2),
  },
  {
    id: 'idea',
    step: 2,
    title: 'Client tak ada idea',
    chip: 'Idea',
    subtitle: 'Isi nama dan saiz, alat ini lukis seluruh design untuk anda.',
    vars: vars(1),
  },
  {
    id: 'fail',
    step: 3,
    title: 'Ada idea, perlu fail',
    chip: 'Fail',
    subtitle: 'Tulisan, kod QR, ubah saiz dan tukar format fail.',
    vars: vars(3),
  },
  {
    id: 'belajar',
    step: 4,
    title: 'Belajar lebih',
    chip: 'Belajar',
    subtitle: 'Tips mingguan Sifu Hisham, kelas, dan panduan mesin.',
    vars: vars(4),
  },
]

/** Tile halaman utama dalam satu langkah, ikut susunan TOOLS. */
export const toolsInGroup = (id: GroupId): ToolEntry[] =>
  TOOLS.filter((t) => t.group === id && t.onHome !== false && !t.shelf)

/** Rak mesin di hujung langkah 4. */
export const machineShelf = (): ToolEntry[] =>
  TOOLS.filter((t) => t.shelf === 'mesin')

/**
 * Destinasi bar nav: pill di atas pada skrin lebar, bar tab di bawah pada
 * telefon. Tiga sahaja - bar tab telefon paling selesa dengan lima ke bawah,
 * dan "Pakej & Harga" kini dicapai dari langkah 4 halaman utama.
 */
export interface NavItem {
  label: string
  href: string
  Icon: LucideIcon
  /** Nama laluan yang dikembalikan useHashRoute bila pill ini aktif. */
  route: Route
}

export const NAV: NavItem[] = [
  { label: 'Home', href: '#/', Icon: House, route: 'home' },
  { label: 'Blog', href: '#/blog', Icon: Newspaper, route: 'blog' },
  { label: 'About', href: '#/about', Icon: UserRound, route: 'about' },
]

/**
 * Sasaran carian: setiap alat dalam TOOLS (termasuk Blog dan About, yang tiada
 * tile), Pakej & Kelas (yang kini dicapai dari langkah 4, bukan dari nav), dan
 * Home. Pill nav Blog dan About tidak ditambah lagi - alatnya sudah memiliki
 * #/blog dan #/about, dan ToolSearch mengunci pada href.
 */
export interface SearchTarget {
  title: string
  line: string
  href: string
  /** Warna titik dalam senarai hasil; nav memakai biru jenama. */
  accent: string
  haystack: string
}

/** Buang tanda diakritik supaya "kek" memadan "kék" dan sebaliknya. */
const fold = (value: string): string =>
  value
    .normalize('NFD')
    // \p{M} dan bukan julat aksara literal: julat literal ialah tanda gabungan
    // yang tidak kelihatan dalam fail ini dan mudah rosak bila fail disalin.
    .replace(/\p{M}/gu, '')
    .toLowerCase()

const ACCENT_BY_GROUP: Record<GroupId, string> = {
  harga: 'var(--color-g2-accent)',
  idea: 'var(--color-g1-accent)',
  fail: 'var(--color-g3-accent)',
  belajar: 'var(--color-g4-accent)',
}

interface RankedTarget extends SearchTarget {
  titleFold: string
  keywordFold: string
}

const TARGETS: RankedTarget[] = [
  // Alat "akan datang" tiada dalam carian: hasil carian ialah pautan.
  ...TOOLS.filter((tool) => !tool.soon).map((tool) => ({
    title: tool.title,
    line: tool.shortDescription,
    href: tool.href,
    accent: ACCENT_BY_GROUP[tool.group],
    haystack: fold(
      `${tool.title} ${tool.shortDescription} ${tool.description} ${tool.keywords.join(' ')}`,
    ),
    titleFold: fold(tool.title),
    keywordFold: fold(tool.keywords.join(' ')),
  })),
  {
    // Dulu pill nav "Pakej & Harga". Nav kini tiga destinasi sahaja, jadi
    // carian untuk "harga", "kelas" atau "pakej" mesti tetap sampai ke sini.
    title: 'Kelas & Pakej',
    line: 'Kelas training dan Akses Penuh',
    href: '#/pakej',
    accent: 'var(--color-g4-accent)',
    haystack: fold('kelas pakej harga training akses penuh langganan bayar'),
    titleFold: fold('kelas & pakej'),
    keywordFold: fold('kelas pakej harga training akses penuh langganan bayar'),
  },
  {
    title: 'Home',
    line: 'Halaman laman',
    href: '#/',
    accent: 'var(--color-screw-2)',
    haystack: fold('home utama halaman laman'),
    titleFold: fold('home'),
    keywordFold: '',
  },
]

/** Padanan substring lipat-huruf. Tajuk > kata kunci > keterangan. */
export const searchTools = (query: string, limit = 6): SearchTarget[] => {
  const q = fold(query.trim())
  if (!q) return []
  return TARGETS.filter((t) => t.haystack.includes(q))
    .map((t, index) => ({
      target: t,
      rank: t.titleFold.includes(q) ? 0 : t.keywordFold.includes(q) ? 1 : 2,
      index,
    }))
    // Susunan kekal stabil dalam setiap pangkat: urutan kumpulan.
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map(({ target }) => target)
}
