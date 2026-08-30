// Siaran WhatsApp "Episod Laser" tulisan Sifu Hisham.
//
// PENTING: teks di bawah adalah suara pemilik sendiri. Jangan ubah ayat,
// jangan betulkan ejaan, jangan terjemah. Pembaca sudah kenal gaya ini.
// Untuk tambah episod baharu: tambah satu entri di HUJUNG array POSTS.

import type { CSSProperties, ComponentType } from 'react'
import { CakeSlice, LayoutGrid, RectangleHorizontal } from 'lucide-react'

export interface BlogPost {
  /** Nombor episod — identiti paling kuat siaran ini. */
  episode: number
  /** Kunci untuk pautan dalam (#/blog/81). */
  slug: string
  title: string
  /** Alat yang jadi topik episod ini. */
  tool: string
  /** Pautan yang disebut dalam siaran asal. */
  link: { label: string; href: string }
  color: string
  softBg: string
  border: string
  Icon: ComponentType<{ className?: string; style?: CSSProperties }>
  /** Isi siaran, satu perenggan bernombor setiap entri. */
  points: string[]
}

/** Penutup yang sama untuk setiap episod. */
export const SIGN_OFF = [
  'Cuba dan bagitahu saya kalau ada apa apa masalah.',
  'Sifu Hisham',
  '(sifulaser.com)',
]

export const BLOG_POSTS: BlogPost[] = [
  {
    episode: 81,
    slug: '81',
    title: 'Stand Nama. Kerja Renyah, Harga Pula Tak Seberapa!',
    tool: 'Stand Nama',
    link: { label: 'sifulaser.com/#/stand', href: '#/stand' },
    color: '#2f5db0',
    softBg: '#eef2fb',
    border: '#cfdcf3',
    Icon: RectangleHorizontal,
    points: [
      'Order stand nama meja ni memang selalu ada. Sekolah, pejabat, majlis.',
      'Tapi jujur cakap - kerja dia renyah, harga pula tak seberapa.',
      'Sebabnya setiap nama kena adjust semula. FAZRIN pendek. ABDUL RAHMAN BIN ABDULLAH panjang.',
      'Nama panjang tak muat. Jadi kena besarkan stand, atau kecilkan huruf sampai tak nampak.',
      'Satu meja mesyuarat 20 orang. 20 kali adjust. Renyah, dan bayaran tetap sama.',
      'Sebab tu saya buat STAND NAMA.',
      'Anda kunci saiz siap dulu. 200mm x 55mm. Yang mengalah adalah HURUF, bukan stand.',
      'Nama panjang, huruf mengecil sendiri sampai muat. Saiz stand tak berubah. 20 orang, 20 stand sama saiz.',
      'Tapak, slot dan nama sekolah di depan tapak - semua dia kira sendiri.',
      'Ada 3 gaya. PLATE biasa, CUT OUT, dan PLATE 3D.',
      'PLATE 3D ini yang baru. Nama TIDAK diengrave. Dia dipotong dari akrilik GOLD MIRROR dan dilekat atas plate. Jadi tulisan TIMBUL. Ada Gold, Silver dan Rose Gold.',
      'Dan di sinilah harga boleh naik. Stand engrave biasa memang orang tawar. Stand tulisan timbul gold mirror, lain ceritanya.',
      'Nak lekat huruf lurus pun senang. Alat ni skor panduan atas plate. Bila huruf duduk betul, garisan panduan tu hilang bawah huruf.',
      'Satu je kena ingat - huruf mirror tu bahan lain, keluar layer sendiri. Potong berasingan, jangan atas kayu.',
      'Alhamdulillah. Kerja renyah tadi sekarang seminit, dan boleh jual lebih mahal.',
    ],
  },
  {
    episode: 82,
    slug: '82',
    title: 'Buat Cake Topper 3 Minit Siap!',
    tool: 'Cake Topper',
    link: { label: 'sifulaser.com/#/topper', href: '#/topper' },
    color: '#b8386b',
    softBg: '#fdeff5',
    border: '#f7d3e2',
    Icon: CakeSlice,
    points: [
      'Order cake topper masuk petang ni. Esok pagi nak siap.',
      'Duduk depan komputer. Masalah pertama bukan mesin. Masalah pertama - nak buat design apa?',
      'Buka Google. Buka Pinterest. Tengok punya tengok, satu jam hilang.',
      'Jumpa satu yang cantik. Tapi itu gambar je. Tak boleh potong. Kena lukis semula dari kosong.',
      'Lepas tu baru kerja sebenar. Pilih font. Susun tiga baris. Kira saiz ikut kek. Buat border. Kira stake.',
      'Dua tiga jam untuk satu topper. Untung tak sepadan dengan masa.',
      'Esok order lain masuk. Nikah pula. Ulang semua dari kosong.',
      'Sebab tu saya buat CAKE TOPPER.',
      'Dalam dia ada 10 PRESET yang dah siap. Bukan template kosong. Design penuh.',
      'Setiap preset dah set semua sekali - perkataan, font, lebar, tinggi baris, ketebalan huruf dan stake. Nombor nombor tu memang kena kerja sama, sebab tu dia datang satu pakej.',
      'Happy Birthday. Happy Birthday 2. Selamat Hari Jadi. Nikah. Nikah 2. Nikah 3. Aqiqah. Tahniah. Selamat Bersara. Anniversary.',
      'Cara guna - klik preset, tukar nama, habis. Itu sahaja.',
      'Nak lain sikit? Tukar BORDER. Ada Circle, Hexagon, Octagon, Heart, Vine dan Double Square. Satu klik, design terus nampak lain.',
      'Rasa tulisan jauh sangat dengan border? Ada slider tarik rapat.',
      'Font ada 33. Yang menulis, yang tebal, yang kemas.',
      'Saiz ikut kek. Kek 12cm, topper 120mm. Dah dikira, tak payah agak.',
      'Dan satu perkara yang dia buat diam diam - dia cantum semua huruf jadi SATU kepingan. Font menulis kalau potong terus, dia hancur jadi berpuluh kepingan. Titik atas huruf i pun terbang. Alat ni sambung semua tu automatik.',
      'Kalau huruf keluar terlalu halus sampai senang patah, dia bagitahu dulu. Sebelum anda buang akrilik.',
      'Export SVG dan PDF. Ada butang SEND WHATSAPP untuk terus hantar pada staf.',
      'Alhamdulillah. Sekarang order masuk petang, 3 minit siap. Yang lama tu bukan potong. Yang lama tu fikir design.',
    ],
  },
  {
    episode: 83,
    slug: '83',
    title: 'Design Tak Payah Tunggu Sampai Balik Ofis!',
    tool: 'Semua alat',
    link: { label: 'sifulaser.com', href: '#/' },
    color: '#0f766e',
    softBg: '#e9f6f4',
    border: '#c4e5e0',
    Icon: LayoutGrid,
    points: [
      'Client WhatsApp pukul 5 petang. Nak cake topper. Nak tahu harga dan nak tengok design dulu.',
      'Saya tak ada di ofis.',
      'Nak buat design kena buka CorelDRAW atau Illustrator. Software tu ada dekat komputer ofis sahaja.',
      'Lesen pun satu komputer. Tak boleh install merata rata.',
      'Jadi client kena tunggu. Esok pagi baru saya boleh reply.',
      'Masalahnya client tu tanya 3 kedai serentak. Yang reply dulu, dia yang dapat order.',
      'Sebab tu saya buat semua alat ni dalam WEBSITE, bukan software.',
      'Tak payah install. Tak payah lesen. Tak payah tunggu loading 5 minit.',
      'Buka browser, terus guna. Laptop rumah pun boleh. Laptop anak pun boleh.',
      'Dan sebab design tu DIJANA, bukan dilukis, ia laju. Anda masukkan nombor, dia keluarkan garisan potong.',
      'Sekarang ada 7 alat. BOX MAKER, PUZZLE, STAND NAMA, CAKE TOPPER, QR CODE, TEXT ENGRAVER dan TEMPLATE ADJUSTER.',
      'Semua export SVG dan PDF. Layer dah diasingkan, masuk LightBurn terus jadi layer.',
      'Ada juga butang SEND WHATSAPP. Fail dan spec kerja terus masuk WhatsApp, hantar pada staf atau pada client.',
      'Alhamdulillah. Client tanya petang, saya reply petang juga. Tak payah tunggu balik ofis.',
    ],
  },
]

export const findBlogPost = (slug: string): BlogPost | undefined =>
  BLOG_POSTS.find((post) => post.slug === slug)

/**
 * Teks biasa untuk disalin terus ke WhatsApp — tiada markdown, tiada bullet
 * pelik. Susunan sama seperti siaran asal: tajuk, isi bernombor, pautan,
 * kemudian penutup.
 */
export const blogPostPlainText = (post: BlogPost): string =>
  [
    `EPISOD LASER ${post.episode}`,
    post.title,
    '',
    ...post.points.map((point, index) => `${index + 1}. ${point}`),
    '',
    post.link.label,
    '',
    ...SIGN_OFF,
  ].join('\n')
