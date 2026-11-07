// Rujukan peserta Kelas "Bina Website Sendiri Dengan AI".
//
// Sumber: deck slide kelas di claude.ai (deck penuh ialah master; setiap modul
// juga ada deck sendiri - deckUrl di bawah). Halaman ini BUKAN salinan slide:
// ia mengambil apa yang peserta perlukan selepas kelas - langkah, prompt yang
// boleh disalin dan senarai semak - dan meninggalkan nota pengajar. Bila slide
// berubah, kemas kini di sini juga; prompt mesti sama perkataan demi perkataan
// dengan slide.
//
// Gaya Boss untuk bahan kelas: sebut "prompt", bukan "arahan" (kecuali arahan
// pemasangan), dan setiap kad langkah sama rupa - tiada satu kad yang tiba-tiba
// gelap atau tebal.
//
// Setiap langkah ialah senarai blok yang dipapar ikut susunan ditulis, supaya
// tip boleh datang sebelum atau selepas prompt mengikut apa yang masuk akal
// untuk langkah itu.

import { WEB_AI_CLASS, WEB_AI_COURSE } from '../lib/courses'

export type KelasBlock =
  | { kind: 'text'; text: string }
  | { kind: 'points'; items: string[]; ordered: boolean }
  /** Rajah teks, contoh susunan folder. Dipapar dalam fon monospace. */
  | { kind: 'diagram'; text: string }
  /** Kotak prompt dengan butang Salin. [teks dalam kurungan] diserlahkan. */
  | { kind: 'prompt'; label: string; text: string }
  | { kind: 'tip'; text: string }
  | { kind: 'warning'; text: string }
  | { kind: 'link'; label: string; href: string }

export interface KelasStep {
  title: string
  blocks: KelasBlock[]
}

export interface KelasModule {
  /** Bahagian kedua hash: #/kelas-web/<slug>. */
  slug: string
  /** "Modul 1" ... atau "Selepas kelas". */
  label: string
  /** Nombor dalam bulatan; null untuk halaman Selepas kelas. */
  number: number | null
  title: string
  summary: string
  outcome: string
  duration: string
  /** Deck slide modul ini di claude.ai. */
  deckUrl: string
  steps: KelasStep[]
  checklistTitle: string
  checklist: string[]
}

const text = (value: string): KelasBlock => ({ kind: 'text', text: value })
const points = (items: string[]): KelasBlock => ({ kind: 'points', items, ordered: false })
const sequence = (items: string[]): KelasBlock => ({ kind: 'points', items, ordered: true })
const diagram = (lines: string[]): KelasBlock => ({ kind: 'diagram', text: lines.join('\n') })
const prompt = (label: string, value: string): KelasBlock => ({
  kind: 'prompt',
  label,
  text: value,
})
const tip = (value: string): KelasBlock => ({ kind: 'tip', text: value })
const warning = (value: string): KelasBlock => ({ kind: 'warning', text: value })
const link = (label: string, href: string): KelasBlock => ({ kind: 'link', label, href })

export const KELAS_WEB = {
  course: WEB_AI_COURSE,
  title: WEB_AI_CLASS.title,
  intro:
    'Semua langkah dan prompt dari kelas, ikut modul. Buka bila-bila masa anda ' +
    'nak ulang semula atau kemas kini laman.',
  meta: ['5 modul', 'Claude Code atau Codex', 'Tanpa tulis kod'],
}

export const KELAS_MODULES: KelasModule[] = [
  {
    slug: 'modul-1',
    label: 'Modul 1',
    number: 1,
    title: 'Kenal Claude Code',
    summary: 'AI yang buat kerja dalam komputer anda.',
    outcome: 'Folder projek tersusun dan aplikasi yang sedia digunakan.',
    duration: '45 minit',
    deckUrl: 'https://claude.ai/artifact/PF7R9pP4zXjFrRqbT7wQ5k',
    steps: [
      {
        title: 'Claude Code dan Codex: AI yang buat kerja',
        blocks: [
          text(
            'Chat biasa di claude.ai atau chatgpt.com hanya menjawab dengan teks; anda ' +
              'salin dan tampal sendiri. Claude Code dan Codex pula menulis dan mengubah ' +
              'fail dalam folder anda, kemudian menyemak hasilnya.',
          ),
          points([
            'Claude Code: dalam aplikasi Claude, tab Code.',
            'Codex: dalam aplikasi Codex, untuk pengguna ChatGPT.',
            'Prompt yang ditaip sama untuk kedua-duanya.',
            'Tak semua pelan langganan termasuk alat ini, jadi semak pelan anda.',
          ]),
        ],
      },
      {
        title: 'Pasang aplikasi di komputer',
        blocks: [
          text(
            'Claude dan ChatGPT di Chrome hanya untuk chat biasa. Yang kita guna ialah ' +
              'aplikasi yang dipasang di komputer.',
          ),
          sequence([
            'Muat turun dari claude.ai/download.',
            'Install dan log masuk.',
            'Tekan tab Code.',
          ]),
          link('claude.ai/download', 'https://claude.ai/download'),
          tip(
            'Pengguna ChatGPT: muat turun aplikasi Codex (di Windows, dari Microsoft ' +
              'Store) dan log masuk dengan akaun ChatGPT.',
          ),
        ],
      },
      {
        title: 'Sediakan folder di Desktop',
        blocks: [
          diagram([
            'Desktop',
            '└─ Project AI',
            '   └─ 1_website-syarikat',
            '      ├─ profil-syarikat.pdf',
            '      ├─ logo.png',
            '      └─ gambar/',
          ]),
          points([
            'Desktop ialah tempat paling senang untuk tambah gambar atau fail baharu.',
            'Satu folder untuk setiap projek, bernombor di depan supaya tersusun: 1_, 2_, 3_.',
          ]),
          warning(
            'Dalam aplikasi, pilih folder 1_website-syarikat, bukan Desktop atau Project ' +
              'AI. Kalau pilih folder besar, AI boleh buka semua fail lain di situ.',
          ),
        ],
      },
      {
        title: 'Pilih model ikut pakej',
        blocks: [
          text('Pemilih model dan effort ada di bawah kotak prompt.'),
          points([
            'Pakej RM100 (Claude Pro, ChatGPT Plus), Claude Code: Opus 5.5, effort ' +
              'sederhana. Sonnet untuk kerja ringan. Elak Fable: ia guna kredit tambahan.',
            'Pakej RM100, Codex: Sol, effort default. Luna untuk kerja ringan. Astra ' +
              'hanya untuk kerja berat; jangan semua Astra High.',
            'Pakej RM500 (Claude Max, ChatGPT Pro), Claude Code: Opus 5.5 untuk kerja ' +
              'harian, Fable untuk kerja yang paling susah.',
            'Pakej RM500, Codex: Astra lebih kerap. Effort High hanya bila perlu.',
          ]),
          tip(
            'Harga ialah anggaran sebulan. Effort tinggi ambil masa lebih lama dan cepat ' +
              'habiskan had penggunaan. Nama model dan had boleh berubah; semak dalam ' +
              'aplikasi.',
          ),
        ],
      },
      {
        title: 'Beri akses kepada AI',
        blocks: [
          text(
            'Secara asal, AI tanya kebenaran setiap kali nak ubah fail. Tukar mode supaya ' +
              'ia terus bekerja.',
          ),
          points([
            'Claude Code: buka pemilih mode dan pilih Auto. AI terus bekerja tanpa tanya.',
            'Codex: buka pemilih kebenaran dan pilih Default permissions. AI bebas dalam ' +
              'folder projek.',
          ]),
          tip('Auto tak muncul dalam pemilih? Pilih Accept edits.'),
          warning(
            'Elak Bypass permissions dan Full access. Dengan mode ini, AI boleh sentuh ' +
              'fail lain dalam komputer anda.',
          ),
        ],
      },
      {
        title: 'Cara ia bekerja',
        blocks: [
          sequence([
            'Anda tulis prompt dalam bahasa biasa.',
            'AI tulis fail dalam folder projek anda.',
            'Anda tengok hasil: buka laman dan baca.',
            'Anda minta ubah, kemudian ulang semula.',
          ]),
          tip('Ulang sampai anda puas hati. Tak perlu betul pada kali pertama.'),
        ],
      },
      {
        title: 'Prompt yang jelas ada tiga perkara',
        blocks: [
          points([
            'Apa: benda yang anda mahu dibina.',
            'Bahan: fail yang perlu digunakan.',
            'Rupa: warna, gaya dan bahasa.',
          ]),
          warning('Terlalu umum: "Buat website."'),
          prompt(
            'Contoh prompt yang jelas',
            'Bina laman web satu halaman untuk syarikat perabot saya. Guna maklumat dalam ' +
              'profil.pdf. Warna coklat kayu, Bahasa Melayu.',
          ),
        ],
      },
    ],
    checklistTitle: 'Sedia untuk Modul 2?',
    checklist: [
      'Aplikasi Claude (tab Code) atau Codex dipasang dan sudah log masuk',
      'Folder Project AI > 1_website-syarikat ada di Desktop, dengan PDF, logo dan gambar',
      'Folder 1_website-syarikat dipilih dalam aplikasi',
      'Model dipilih, dan mode Auto (atau Default permissions) dihidupkan',
    ],
  },
  {
    slug: 'modul-2',
    label: 'Modul 2',
    number: 2,
    title: 'Dari Folder ke Laman Web',
    summary: 'Folder bahan syarikat anda jadi laman web satu halaman.',
    outcome: 'Laman web syarikat satu halaman di komputer sendiri.',
    duration: '2 jam',
    deckUrl: 'https://claude.ai/artifact/8x9DqNgApFsQpkDYm3dY5x',
    steps: [
      {
        title: 'Apa ada dalam laman anda',
        blocks: [
          points([
            'Logo dan nama syarikat.',
            'Pengenalan: siapa anda dan apa yang anda buat.',
            'Servis atau produk: apa yang pelanggan boleh beli daripada anda.',
            'Galeri: gambar kerja dan produk anda.',
            'Hubungi: butang WhatsApp, alamat dan waktu operasi.',
          ]),
          tip('Satu halaman sahaja. Tiada login, tiada pangkalan data.'),
          link('Contoh: mahligaiseni.com', 'https://mahligaiseni.com'),
        ],
      },
      {
        title: 'Masukkan bahan',
        blocks: [
          text(
            'Letak PDF profil, logo, gambar dan latar belakang syarikat dalam folder ' +
              '1_website-syarikat. AI hanya boleh baca fail yang ada dalam folder ini.',
          ),
        ],
      },
      {
        title: 'Pasang skill design (sekali sahaja)',
        blocks: [
          text('Tulis prompt dalam aplikasi yang anda guna sahaja.'),
          prompt(
            'Claude Code',
            'Pasang skill frontend-design dan UI UX Pro Max untuk semua projek saya, ' +
              'kemudian beritahu saya bila siap.',
          ),
          prompt(
            'Codex',
            '$skill-installer pasang frontend-skill, kemudian pasang UI UX Pro Max untuk ' +
              'semua projek saya. Beritahu saya bila siap.',
          ),
          points([
            'frontend-design dan frontend-skill: rupa laman yang tersendiri, bukan rupa ' +
              'template.',
            'UI UX Pro Max: warna, font dan susun atur yang kemas.',
          ]),
          tip(
            'Selepas pasang, mulakan sesi baharu dalam Claude, atau mulakan semula Codex, ' +
              'supaya skill dikesan. Kalau pemasangan gagal, teruskan tanpa skill; laman ' +
              'masih boleh dibina.',
          ),
        ],
      },
      {
        title: 'Prompt 1: baca website rujukan',
        blocks: [
          text('Tukar mahligaiseni.com kepada website yang anda suka.'),
          prompt(
            'Tulis prompt',
            'Buka website mahligaiseni.com dan terangkan apa yang anda faham tentang reka ' +
              'bentuknya: susun atur, warna, font, gaya gambar dan animasi.',
          ),
          tip(
            'Sertakan gambar skrin website tu: tekan Win + Shift + S, kemudian tampal ' +
              'dalam kotak prompt.',
          ),
        ],
      },
      {
        title: 'Prompt 2: fahamkan folder dulu',
        blocks: [
          prompt(
            'Tulis prompt',
            'Baca semua fail dalam folder ini: PDF, gambar dan dokumen lain. Terangkan apa ' +
              'yang anda faham tentang syarikat saya: nama, servis atau produk, kelebihan, ' +
              'lokasi, CTA, maklumat hubungan, dan gambar mana sesuai untuk bahagian mana. ' +
              'Jangan bina laman lagi.',
          ),
          points([
            'AI guna maklumat sebenar, bukan teka-teka tentang syarikat anda.',
            'Silap ditangkap awal. Lebih mudah betulkan ringkasan daripada laman yang dah ' +
              'siap.',
            'Jimat had penggunaan. Kurang kerja yang perlu diulang.',
          ]),
          tip(
            'Ayat terakhir, "Jangan bina laman lagi", penting. Tanpanya AI mungkin terus ' +
              'mula membina.',
          ),
        ],
      },
      {
        title: 'Semak apa yang AI faham',
        blocks: [
          points([
            'Nama syarikat dan ejaan.',
            'Servis atau produk.',
            'Nombor telefon dan WhatsApp.',
            'Alamat dan waktu operasi.',
            'Gambar sesuai dengan bahagian.',
          ]),
          warning(
            'Tiada maklumat rekaan. AI kadang-kadang tambah perkara yang tiada dalam ' +
              'bahan, contohnya tahun ditubuhkan atau anugerah.',
          ),
          prompt(
            'Ada silap? Beritahu AI',
            'Betulkan: nombor WhatsApp kami [nombor telefon anda]. Kami juga buat servis ' +
              'pemasangan.',
          ),
        ],
      },
      {
        title: 'Prompt 3: bina laman dengan skill',
        blocks: [
          text('Hantar hanya selepas semua maklumat yang AI faham sudah betul.'),
          prompt(
            'Tulis prompt',
            'Berdasarkan maklumat yang anda faham dan yang saya sahkan, bina laman web ' +
              'satu halaman dalam Bahasa Melayu dengan bahagian pengenalan, servis, galeri ' +
              'dan hubungi. Ikut gaya website rujukan tadi, tetapi guna kandungan syarikat ' +
              'saya sendiri. Guna skill frontend-design dan UI UX Pro Max. Tambah animasi ' +
              'ringan tanpa React. Letak butang WhatsApp ke nombor [nombor telefon anda].',
          ),
          points([
            'Sebut nama skill dengan tepat.',
            'Tanpa React: laman kekal fail HTML biasa yang mudah diterbitkan.',
            'Beri nombor WhatsApp yang sebenar.',
          ]),
          tip('Pengguna Codex: tukar frontend-design kepada frontend-skill dalam prompt ini.'),
        ],
      },
      {
        title: 'Minta ubah, satu demi satu',
        blocks: [
          prompt('Contoh', 'Tukar warna utama kepada coklat gelap.'),
          prompt('Contoh', 'Besarkan tajuk dan logo di bahagian atas.'),
          prompt('Contoh', 'Tambah bahagian testimoni pelanggan selepas galeri.'),
          prompt('Contoh', 'Gantikan gambar pertama dengan bengkel.jpg.'),
          tip('Satu prompt, satu perubahan. Lebih mudah nampak apa yang berubah.'),
        ],
      },
    ],
    checklistTitle: 'Laman anda siap apabila',
    checklist: [
      'Nama dan logo syarikat betul',
      'Servis atau produk anda disenaraikan',
      'Galeri ada sekurang-kurangnya tiga gambar',
      'Butang WhatsApp membuka chat ke nombor anda',
    ],
  },
  {
    slug: 'modul-3',
    label: 'Modul 3',
    number: 3,
    title: 'AI Kawal Chrome',
    summary: 'AI buka laman anda dan semak macam pelanggan.',
    outcome: 'Laman yang sudah disemak dan dikemaskan.',
    duration: '45 minit',
    deckUrl: 'https://claude.ai/artifact/4GCzdQbQE2xSeGZL14AixA',
    steps: [
      {
        title: 'Dua cara AI guna browser',
        blocks: [
          points([
            'Cara 1, browser dalam aplikasi: tak perlu pasang apa-apa, tiada akaun yang ' +
              'log masuk. Sesuai untuk semak laman anda. (Claude: browser terbina dalam ' +
              'aplikasi. Codex: in-app browser.)',
            'Cara 2, Chrome anda sendiri: perlu pasang sambungan, guna akaun yang dah log ' +
              'masuk. Sesuai untuk Shopee dan berita. (Claude: Claude in Chrome. Codex: ' +
              'sambungan Codex untuk Chrome.)',
          ]),
          tip('Boleh: Google Chrome dan Microsoft Edge.'),
          warning('Tidak boleh: Firefox dan Safari.'),
        ],
      },
      {
        title: 'Sambung Claude ke Chrome',
        blocks: [
          sequence([
            'Buka Chrome Web Store, cari Claude dari Anthropic, tekan Add to Chrome.',
            'Log masuk dengan akaun Claude yang sama dengan aplikasi.',
            'Dalam tetapan aplikasi Claude, pilih Chrome sebagai Preferred browser.',
            'Bila AI minta akses ke satu laman, tekan Allow.',
          ]),
          prompt('Uji sambungan', 'Buka google.com dalam Chrome dan beritahu saya tajuk tab itu.'),
          tip('Sambungan tak dikesan? Tutup dan buka semula Chrome, kemudian cuba lagi.'),
        ],
      },
      {
        title: 'Sambung Codex ke Chrome',
        blocks: [
          sequence([
            'Dalam aplikasi Codex, buka Settings dan cari Computer Use atau Plugins.',
            'Ikut arahan untuk tambah sambungan ke Chrome, kemudian log masuk akaun ' +
              'ChatGPT yang sama.',
            'Bila Codex minta guna Chrome, benarkan.',
          ]),
          prompt('Uji sambungan', 'Buka google.com dalam Chrome dan beritahu saya tajuk tab itu.'),
          tip('Tak mahu pasang apa-apa? Guna in-app browser Codex untuk semak laman anda sendiri.'),
        ],
      },
      {
        title: 'Latihan: AI guna Chrome',
        blocks: [
          prompt(
            'Latihan A · Berita',
            'Buka utusan.com.my dalam Chrome dan senaraikan 3 berita utama hari ini: tajuk, ' +
              'ringkasan satu ayat dan link.',
          ),
          prompt(
            'Latihan B · Shopee',
            'Buka shopee.com.my dalam Chrome. Cari TV 40 hingga 42 inci, susun ikut harga ' +
              'paling murah, dan senaraikan 3 pilihan termurah: nama, saiz, harga dan link. ' +
              'Jangan tambah ke troli atau beli apa-apa.',
          ),
          warning(
            'Keluar CAPTCHA atau minta log masuk? Selesaikan sendiri, kemudian beritahu AI ' +
              'teruskan.',
          ),
        ],
      },
      {
        title: 'AI semak laman anda macam pelanggan',
        blocks: [
          points([
            'Buka: AI buka laman anda dalam browser.',
            'Tengok: paparan telefon dan komputer.',
            'Baiki: cari silap, kemudian betulkan fail.',
          ]),
          prompt(
            'Tulis prompt',
            'Buka index.html dalam browser. Semak paparan telefon dan komputer, senaraikan ' +
              'apa yang tak kemas, kemudian betulkan.',
          ),
          tip(
            'Untuk laman anda sendiri, browser dalam aplikasi (Cara 1) atau Chrome (Cara 2) ' +
              'pun boleh.',
          ),
        ],
      },
    ],
    checklistTitle: 'Semak sebelum terbit',
    checklist: [
      'Nama syarikat, alamat dan nombor telefon betul',
      'Butang WhatsApp membuka chat yang betul',
      'Semua gambar keluar',
      'Laman kemas pada skrin telefon',
      'Tiada salah ejaan',
    ],
  },
  {
    slug: 'modul-4',
    label: 'Modul 4',
    number: 4,
    title: 'Terbit ke GitHub Pages',
    summary: 'Laman anda keluar dari komputer dan masuk ke internet.',
    outcome: 'Laman live di alamat percuma GitHub.',
    duration: '45 minit',
    deckUrl: 'https://claude.ai/artifact/VCq9ZwsuHfX6eWdiq2uaTL',
    steps: [
      {
        title: 'Dari komputer anda ke internet',
        blocks: [
          sequence([
            'Komputer anda: folder projek dengan fail laman.',
            'GitHub: salinan fail anda di internet.',
            'GitHub Pages: paparkan fail itu sebagai laman web.',
          ]),
          tip(
            'Alamat percuma anda: namaanda.github.io/website-syarikat. Tiada yuran ' +
              'hosting bulanan.',
          ),
        ],
      },
      {
        title: 'Daftar akaun GitHub',
        blocks: [
          sequence([
            'Pergi ke github.com/signup.',
            'Isi emel, kata laluan dan username.',
            'Selesaikan teka-teki untuk bukti anda bukan robot.',
            'Masukkan kod yang GitHub hantar ke emel anda.',
            'Pilih Free. Langkau soalan lain, terus ke dashboard.',
          ]),
          link('github.com/signup', 'https://github.com/signup'),
          tip(
            'Username anda jadi alamat laman: username.github.io/website-syarikat. Pilih ' +
              'yang pendek dan ikut nama syarikat.',
          ),
          warning('Teka-teki tak keluar? Matikan ad blocker. Kod tak sampai? Semak folder spam.'),
        ],
      },
      {
        title: 'Sambung AI ke GitHub',
        blocks: [
          text(
            'Prompt dan langkah sama untuk Claude Code dan Codex. Sekali sahaja untuk ' +
              'setiap komputer.',
          ),
          prompt(
            'Tulis prompt',
            'Sambungkan komputer ini ke akaun GitHub saya guna GitHub CLI, kemudian ' +
              'beritahu saya bila siap.',
          ),
          sequence([
            'AI pasang GitHub CLI dan mula proses log masuk.',
            'AI tunjuk kod 8 aksara dalam chat. Salin kod itu.',
            'Buka github.com/login/device, tampal kod, tekan Continue.',
            'Tekan Authorize. AI sahkan akaun anda dah disambung.',
          ]),
          link('github.com/login/device', 'https://github.com/login/device'),
          tip('Uji: tanya AI "Akaun GitHub mana yang disambungkan?"'),
        ],
      },
      {
        title: 'Terbit laman',
        blocks: [
          prompt(
            'Tulis prompt',
            'Naikkan projek ini ke GitHub sebagai repositori awam baharu dan hidupkan ' +
              'GitHub Pages. Beri saya alamat laman selepas siap.',
          ),
          text('Tunggu beberapa minit, kemudian buka alamat yang AI beri.'),
          tip('Nak kemas kini kemudian? Ubah laman, kemudian minta AI naikkan perubahan.'),
        ],
      },
    ],
    checklistTitle: 'Laman anda dah live?',
    checklist: [
      'Akaun GitHub sudah didaftar',
      'AI sudah disambung ke akaun GitHub anda',
      'Laman boleh dibuka di alamat github.io pada telefon anda',
    ],
  },
  {
    slug: 'modul-5',
    label: 'Modul 5',
    number: 5,
    title: 'Domain Sendiri',
    summary: 'Alamat yang pelanggan mudah ingat.',
    outcome: 'Laman di domain sendiri, atau panduan untuk menyambungnya selepas kelas.',
    duration: '30 minit',
    deckUrl: 'https://claude.ai/artifact/X94MFREmpaKsFp6J99Coy8',
    steps: [
      {
        title: 'Di mana beli domain?',
        blocks: [
          points([
            'Disyorkan, Cloudflare Registrar: harga kos, tahun pertama dan renew sama. ' +
              'Sekitar USD 10 hingga 11 setahun bagi .com.',
            'Tak disyorkan, Hostinger: harga domain dan renew lebih tinggi.',
            'Tak disyorkan, GoDaddy: tahun pertama murah, tapi harga renew jauh lebih tinggi.',
          ]),
          warning(
            'Nak .my atau .com.my? Cloudflare tak jual. Beli di pendaftar yang berdaftar ' +
              'dengan MYNIC.',
          ),
        ],
      },
      {
        title: 'Pilih nama domain',
        blocks: [
          points([
            'Pendek: senang ditaip dan disebut.',
            'Sama nama: ikut nama syarikat supaya mudah diingat.',
            'Semak dulu: pastikan nama itu belum diambil orang.',
          ]),
          tip('Domain dibayar setiap tahun. Semak harga semasa sebelum membeli.'),
        ],
      },
      {
        title: 'Daftar dan beli di Cloudflare',
        blocks: [
          sequence([
            'Buka dash.cloudflare.com/sign-up, isi emel dan kata laluan.',
            'Sahkan emel: tekan pautan dalam emel dari Cloudflare.',
            'Buka Domain Registration, kemudian Register Domains, taip nama pilihan.',
            'Isi maklumat pemilik dan kad, kemudian selesaikan pembelian.',
            'Domain muncul dalam senarai domain anda.',
          ]),
          link('dash.cloudflare.com/sign-up', 'https://dash.cloudflare.com/sign-up'),
          tip('Hidupkan auto-renew supaya domain tak luput.'),
          warning('Bayar sendiri dengan kad anda. Jangan biar AI atau orang lain isikan butiran kad.'),
        ],
      },
      {
        title: 'Sambung domain ke laman',
        blocks: [
          prompt(
            'Tulis prompt',
            'Saya dah beli domain [nama domain anda]. Sambungkan ke laman GitHub Pages ini ' +
              'dan beritahu rekod DNS yang perlu saya isi.',
          ),
          sequence([
            'AI tetapkan domain itu pada GitHub Pages.',
            'Isi rekod DNS di Cloudflare, ikut panduan yang AI beri.',
            'Tunggu domain aktif. Kadang-kadang ambil beberapa jam.',
          ]),
          tip(
            'Tak sempat lagi? Laman anda tetap live di alamat percuma GitHub. Domain boleh ' +
              'disambung bila-bila masa.',
          ),
        ],
      },
    ],
    checklistTitle: 'Domain anda sedia?',
    checklist: [
      'Domain dibeli dan auto-renew dihidupkan',
      'Rekod DNS diisi di Cloudflare',
      'Laman boleh dibuka di domain sendiri',
    ],
  },
  {
    slug: 'selepas',
    label: 'Selepas kelas',
    number: null,
    title: 'Selepas Kelas',
    summary: 'Jaga dan kemas kini laman anda sendiri.',
    outcome: 'Laman web syarikat anda terus live, dan anda tahu cara mengubahnya.',
    duration: 'Rujukan',
    deckUrl: 'https://claude.ai/artifact/ShTU3QQVjFbPdDgq4AZKoL',
    steps: [
      {
        title: 'Kemas kini laman sendiri',
        blocks: [
          text(
            'Buka folder projek dalam aplikasi, tulis prompt perubahan, kemudian minta AI ' +
              'naikkan perubahan ke GitHub.',
          ),
          prompt(
            'Contoh prompt',
            'Tukar nombor WhatsApp dalam laman kepada [nombor baharu], kemudian naikkan ' +
              'perubahan ke GitHub.',
          ),
        ],
      },
      {
        title: 'Simpan folder projek',
        blocks: [text('Folder 1_website-syarikat ialah salinan asal laman anda. Jangan padam.')],
      },
      {
        title: 'Langganan AI',
        blocks: [
          text(
            'Boleh berhenti, dan sambung semula pada bulan anda perlukan. Laman anda terus ' +
              'live walaupun langganan AI dihentikan.',
          ),
          tip('Domain pula perlu diperbaharui setiap tahun.'),
        ],
      },
    ],
    checklistTitle: 'Apa yang anda dah buat',
    checklist: [
      'Guna Claude Code untuk bina laman dengan prompt bahasa biasa',
      'Tukar bahan syarikat jadi laman web',
      'Guna AI untuk semak dan baiki laman dalam Chrome',
      'Terbitkan laman ke internet tanpa kos hosting',
      'Pilih dan sambung domain sendiri',
    ],
  },
]

export const findKelasModule = (slug: string): KelasModule | undefined =>
  KELAS_MODULES.find((item) => item.slug === slug)
