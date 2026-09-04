// Siaran WhatsApp "Episod Laser" tulisan Sifu Hisham.
//
// PENTING: teks di bawah adalah suara pemilik sendiri. Jangan ubah ayat,
// jangan betulkan ejaan, jangan terjemah. Pembaca sudah kenal gaya ini.
// Untuk tambah episod baharu: tambah satu entri di HUJUNG array POSTS.

import type { CSSProperties, ComponentType } from 'react'
import {
  CakeSlice,
  Gift,
  LayoutGrid,
  Luggage,
  RectangleHorizontal,
} from 'lucide-react'

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
  {
    episode: 84,
    slug: '84',
    title: 'Luggage Tag. Client Tak Ada Design, Tak Ada Saiz.',
    tool: 'Tag Generator',
    link: { label: 'sifulaser.com/#/tag', href: '#/tag' },
    color: '#b45309',
    softBg: '#fdf3e3',
    border: '#f2ddb8',
    Icon: Luggage,
    points: [
      'Client WhatsApp - nak buat luggage tag. 50 biji untuk rombongan.',
      'Saya tanya nak design macam mana. Dia jawab "you designkan lah".',
      'Saya tanya saiz pula. Dia jawab "yang biasa tu".',
      'Yang biasa tu berapa? Tak ada standard. Jadi saya yang kena teka.',
      'Teka punya teka, lukis, hantar. Dia kata kecil sangat. Lukis semula. Petang tu habis.',
      'Sebab tu saya buat TAG GENERATOR.',
      'Ada 5 design siap - Travel, Beg Sekolah, Tag Staf, Tag Haiwan dan Save The Date. Saiz dah dikunci. Bukan template kosong, design penuh.',
      'Klik satu, tukar nama, habis. Depan nama, belakang nombor telefon.',
      'Satu je yang selalu pecah pada luggage tag - lubang tali. Alat ni ukur sendiri jarak lubang ke tepi, dan bagitahu kalau terlalu rapat sebelum anda potong.',
      'Alhamdulillah. Client tak ada design, tak ada saiz - sekarang bukan masalah saya lagi.',
    ],
  },
  {
    episode: 85,
    slug: '85',
    title: 'Nak Buat Kotak Hadiah, Tapi Tak Ada Idea.',
    tool: 'Box Maker',
    link: { label: 'sifulaser.com/#/boxmaker', href: '#/boxmaker' },
    color: '#6d28d9',
    softBg: '#f3eefd',
    border: '#ded0f7',
    Icon: Gift,
    points: [
      'Order masuk - nak kotak untuk hadiah. Door gift majlis, 100 biji.',
      'Duduk depan komputer. Masalah pertama bukan mesin. Masalah pertama - nak buat kotak macam mana?',
      'Buka Google. Buka Pinterest. Tengok punya tengok, sejam hilang. Yang cantik tu gambar je, tak boleh potong.',
      'Sedangkan kotak hadiah ni sebenarnya satu bentuk sahaja. Tutup kena boleh tanggal. Angkat, letak tepi, barang nampak elok. Macam kotak kasut.',
      'Tapi tutup cabut tu kotak kedua. Dia kena lebih besar sikit untuk sarung masuk. Lebih berapa? Ketat setengah milimeter je, tutup tak masuk langsung - bahan hangus, potong baru.',
      'Sebab tu saya tambah LIFT-OFF LID dalam BOX MAKER.',
      'Pilih gaya tu, taip saiz kotak. Tutup dia kira sendiri. Tebal papan dan kerf semua dah diambil kira.',
      'Ada slider CLEARANCE, mula 0.4mm. Bahan yang kembang, buka sikit. Ada takuk ibu jari, senang nak cangkuk angkat.',
      'Satu je kena ingat - tutup ni duduk di LUAR dinding, jadi kotak siap lebih besar sedikit dari saiz yang anda taip. Alat ni papar saiz sebenar tu.',
      'Alhamdulillah. Tak payah cari idea lagi. Bentuk kotak hadiah tu memang dah ada dalam alat.',
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
