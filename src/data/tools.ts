// Direktori alat halaman utama — data, bukan markup.
//
// Senarai ini dulu duduk di dalam HomePage.tsx sebagai tatasusunan CARDS.
// Dipindahkan ke sini kerana dua benda kini membacanya (grid dan carian), dan
// kerana scripts/blog-screenshots.mjs sudah menyimpan salinan kedua senarai
// laluan yang ditulis tangan — salinan itu boleh diterbitkan dari sini
// kemudian.
//
// LIMA BELAS destinasi hari ini, EMPAT BELAS tile. Yang keluar dari grid ialah
// "Pakej & Harga": ia sudah jadi pill nav DAN butang CTA biru besar di jalur
// kaki, jadi tile menjadikannya kemunculan ketiga bagi satu destinasi pada satu
// halaman. Tempatnya diambil oleh "About Me & Kedai Laser" (bersama kedai
// Shopee di dalamnya). Tiada apa-apa yang hilang.

import {
  Boxes,
  Box,
  BookOpen,
  CakeSlice,
  ClipboardCheck,
  Crosshair,
  House,
  KeyRound,
  Luggage,
  Newspaper,
  PenLine,
  Puzzle,
  QrCode,
  RectangleHorizontal,
  Scaling,
  Settings2,
  Stethoscope,
  Tag,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Route } from '../hooks/useHashRoute'

export type GroupId = 'mesin' | 'design' | 'generator' | 'belajar'

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
  Icon: LucideIcon
}

export const TOOLS: ToolEntry[] = [
  // ---- 1. MESIN & PENJAGAAN ----
  {
    title: 'Simulator Alignment',
    shortDescription: 'Latih alignment cermin, langkah demi langkah.',
    description: 'Belajar dan praktik alignment cermin untuk Mesin Laser Cut.',
    href: '#/simulator',
    group: 'mesin',
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
    group: 'mesin',
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
    group: 'mesin',
    variant: 'icon',
    keywords: ['rosak', 'masalah', 'sop', 'punca', 'tak potong'],
    premium: true,
    Icon: Stethoscope,
  },

  // ---- 2. BUAT DESIGN UNTUK LASER ----
  {
    title: 'Box Maker',
    shortDescription: 'Kotak finger joint, terus jadi fail SVG.',
    description:
      'Reka kotak finger joint ikut saiz anda, terus dapat fail SVG siap potong.',
    href: '#/boxmaker',
    group: 'design',
    variant: 'art',
    // FOTO 3D, diambil 4 September 2026, gaya Almari Laci. Boleh jadi basi dan
    // tiada apa-apa dalam repo ini akan memberitahu. Ambil semula dengan
    // `node scripts/tile-shots.mjs docs/images/tools boxmaker` selepas apa-apa
    // perubahan rupa. Lihat docs/images/tools/README.md.
    art: '/images/tools/boxmaker.webp',
    keywords: ['kotak', 'almari', 'laci', 'finger joint', 'box', 'bekas'],
    Icon: Box,
  },
  {
    title: 'Puzzle Generator',
    shortDescription: 'Garisan jigsaw ikut saiz papan anda.',
    description:
      'Jana garisan potong jigsaw ikut saiz papan anda, terus dapat fail SVG.',
    href: '#/puzzle',
    group: 'design',
    variant: 'art',
    art: '/images/tools/puzzle.svg',
    keywords: ['jigsaw', 'teka-teki', 'papan', 'kepingan', 'mainan'],
    Icon: Puzzle,
  },
  {
    title: 'Text Engraver',
    shortDescription: 'Teks satu garisan untuk ukiran laju.',
    description:
      'Teks satu garisan untuk ukiran laju. Dapat fail SVG atau PDF ikut saiz mm.',
    href: '#/text',
    group: 'design',
    variant: 'art',
    art: '/images/tools/text.svg',
    keywords: ['tulisan', 'ukir', 'engrave', 'font', 'single line', 'plotter'],
    Icon: PenLine,
  },
  {
    title: 'Stand Nama',
    shortDescription: 'Papan nama meja, siap dengan tapak.',
    description:
      'Papan tanda nama meja: plate berukir atau huruf potong, siap dengan tapak.',
    href: '#/stand',
    group: 'design',
    variant: 'art',
    // FOTO 3D, 4 September 2026 — sama amaran seperti Box Maker di atas.
    art: '/images/tools/stand.webp',
    keywords: ['papan nama', 'meja', 'signage', 'plate', 'nameplate', 'tapak'],
    Icon: RectangleHorizontal,
  },

  // ---- 3. GENERATOR PANTAS ----
  {
    title: 'QR Generator',
    shortDescription: 'Link jadi kod QR, saiz mm sebenar.',
    description:
      'Tukar link jadi kod QR untuk laser. Saiz mm sebenar, ada bingkai keychain.',
    href: '#/qr',
    group: 'generator',
    variant: 'art',
    art: '/images/tools/qr.svg',
    keywords: ['kod', 'scan', 'link', 'plaque', 'papan', 'barcode'],
    Icon: QrCode,
  },
  {
    title: 'Keychain Generator',
    shortDescription: 'Nama jadi kekunci, siap lubang ring.',
    description:
      'Nama jadi kekunci satu keping, siap lubang ring. Untuk akrilik atau kayu.',
    href: '#/keychain',
    group: 'generator',
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
    group: 'generator',
    variant: 'art',
    // FOTO 3D, 4 September 2026 — sama amaran seperti Box Maker di atas.
    art: '/images/tools/tag.webp',
    keywords: ['beg', 'luggage', 'sekolah', 'alamat', 'tali', 'label'],
    Icon: Luggage,
  },
  {
    title: 'Cake Topper',
    shortDescription: 'Nama atas kek, satu keping berpancang.',
    description:
      'Nama untuk atas kek, satu keping dengan pancang. Untuk akrilik tuang.',
    href: '#/topper',
    group: 'generator',
    variant: 'art',
    art: '/images/tools/topper.svg',
    keywords: ['kek', 'cake', 'birthday', 'akrilik', 'pancang', 'harijadi'],
    Icon: CakeSlice,
  },

  // ---- 4. BELAJAR & SUMBER ----
  {
    title: 'Template Adjuster',
    shortDescription: 'Ubah saiz dan tebal fail SVG luar.',
    description:
      'Fail SVG dari internet tak padan material anda? Ubah saiz dan tebalnya.',
    href: '#/adjust',
    group: 'belajar',
    variant: 'icon',
    keywords: ['svg', 'template', 'saiz', 'tebal', 'skala', 'material'],
    Icon: Scaling,
  },
  {
    title: 'Blog',
    shortDescription: 'Episod Laser, nota kerja Sifu Hisham.',
    description:
      'Episod Laser — nota Sifu Hisham dari kerja harian, sedia untuk disalin.',
    href: '#/blog',
    group: 'belajar',
    variant: 'icon',
    keywords: ['episod', 'nota', 'artikel', 'panduan', 'tulisan', 'hisham'],
    Icon: Newspaper,
  },
  {
    title: 'About Me & Kedai Laser',
    shortDescription: 'Kenali kami dan kedai Shopee laser.',
    description:
      'Kenali SifuLaser, dan lihat barang keperluan kerja laser di Shopee kami.',
    href: '#/about',
    group: 'belajar',
    variant: 'icon',
    keywords: ['kedai', 'shopee', 'beli', 'barang', 'mahligai seni', 'hubungi'],
    Icon: UserRound,
  },
]

export interface ToolGroup {
  id: GroupId
  title: string
  subtitle: string
  Icon: LucideIcon
  /** Lima pemboleh ubah warna yang diwarisi oleh setiap anak panel. */
  vars: CSSProperties
  /**
   * Hanya kumpulan yang benar-benar ada tempat untuk pergi mendapat pautan.
   * Tiga daripada empat kumpulan tiada halaman indeks, dan useHashRoute jatuh
   * senyap ke 'home' untuk laluan yang tidak dikenali — jadi href yang salah
   * kelihatan seperti halaman rosak, bukan 404. Sauh dalam halaman pula akan
   * bergaduh dengan window.scrollTo(0, 0) dalam useHashRoute.
   */
  seeAll?: { label: string; href: string }
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
    id: 'mesin',
    title: 'Mesin & Penjagaan',
    subtitle: 'Pastikan mesin sentiasa dalam keadaan optimum.',
    Icon: Settings2,
    vars: vars(1),
  },
  {
    id: 'design',
    title: 'Buat Design untuk Laser',
    subtitle: 'Jana fail SVG siap potong dengan mudah.',
    Icon: Boxes,
    vars: vars(2),
  },
  {
    id: 'generator',
    title: 'Generator Pantas',
    subtitle: 'Masukkan maklumat, dapat fail SVG terus.',
    Icon: Zap,
    vars: vars(3),
  },
  {
    id: 'belajar',
    title: 'Belajar & Sumber',
    subtitle: 'Nota, panduan dan perkongsian dari Sifu Hisham.',
    Icon: BookOpen,
    vars: vars(4),
    // Satu-satunya kumpulan yang mendapatnya: 12 episod blog benar-benar
    // melebihi satu tile.
    seeAll: { label: 'Lihat semua', href: '#/blog' },
  },
]

export const toolsInGroup = (id: GroupId): ToolEntry[] =>
  TOOLS.filter((t) => t.group === id)

/** Empat destinasi bar nav. Semuanya laluan sedia ada — tiada kerja penghalaan. */
export interface NavItem {
  label: string
  /**
   * Ekor label yang digugurkan pada telefon (span .nav-pill-long). Empat pill
   * berjumlah lebih lebar daripada trek 343 px pada 375 px, jadi tanpa ini
   * destinasi keempat duduk di luar skrin sehingga diskrol. Yang digugurkan
   * hanya panjang label — destinasi kekal empat.
   */
  labelTail?: string
  href: string
  Icon: LucideIcon
  /** Nama laluan yang dikembalikan useHashRoute bila pill ini aktif. */
  route: Route
}

export const NAV: NavItem[] = [
  { label: 'Home', href: '#/', Icon: House, route: 'home' },
  { label: 'Blog', href: '#/blog', Icon: Newspaper, route: 'blog' },
  {
    label: 'Pakej',
    labelTail: ' & Harga',
    href: '#/pakej',
    Icon: Tag,
    route: 'pakej',
  },
  { label: 'About', href: '#/about', Icon: UserRound, route: 'about' },
]

/**
 * Sasaran carian: 14 tile ditambah destinasi nav yang BUKAN sudah menjadi
 * tile = 16. Blog dan About memiliki #/blog dan #/about sebagai alat, jadi
 * memasukkan pill navnya juga memberi dua baris serupa yang menuju ke tempat
 * yang sama — dan dua adik-beradik React dengan key yang sama, kerana
 * ToolSearch mengunci pada href. Dua daripada enam slot hasil dibazirkan
 * untuk mengulang satu destinasi, dengan label yang lebih buruk.
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
  mesin: 'var(--color-g1-accent)',
  design: 'var(--color-g2-accent)',
  generator: 'var(--color-g3-accent)',
  belajar: 'var(--color-g4-accent)',
}

interface RankedTarget extends SearchTarget {
  titleFold: string
  keywordFold: string
}

const TOOL_HREFS = new Set(TOOLS.map((tool) => tool.href))

const TARGETS: RankedTarget[] = [
  ...TOOLS.map((tool) => ({
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
  ...NAV.filter(
    (item) => item.route !== 'home' && !TOOL_HREFS.has(item.href),
  ).map((item) => {
    // Nama penuh, bukan `label` sahaja: `label` ialah versi pendek telefon
    // ("Pakej"), dan carian untuk "harga" mesti tetap menjumpainya.
    const full = `${item.label}${item.labelTail ?? ''}`
    return {
      title: full,
      line: 'Halaman laman',
      href: item.href,
      accent: 'var(--color-screw-2)',
      haystack: fold(`${full} halaman laman`),
      titleFold: fold(full),
      keywordFold: '',
    }
  }),
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
