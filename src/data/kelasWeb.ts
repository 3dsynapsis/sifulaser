// Kelas "Bina Website Sendiri Dengan AI" - senarai modul untuk peserta.
//
// Setiap kad membuka deck slide modul itu di claude.ai, dalam tab baharu. Isi
// kelas tinggal dalam slide sahaja: Boss mahu peserta terus ke slide, tanpa
// halaman penerangan kedua di laman ini (7 Nov 2026). Jadi bila slide berubah,
// tiada apa-apa perlu diubah di sini - kecuali tajuk modul.
//
// Setiap deck mesti dikongsi "Anyone with the link" melalui menu Share di
// claude.ai. Kalau tidak, peserta akan nampak halaman log masuk claude.ai.

import { DoorOpen, Flag, type LucideIcon } from 'lucide-react'
import { WEB_AI_CLASS } from '../lib/courses'

export interface KelasModule {
  /** Kunci senarai sahaja. */
  slug: string
  /** "Pembukaan", "Modul 1" ... atau "Selepas kelas". */
  label: string
  /** Nombor dalam bulatan untuk modul. */
  number: number | null
  /** Ikon dalam bulatan untuk Pembukaan dan Selepas kelas, yang tiada nombor. */
  Icon?: LucideIcon
  title: string
  summary: string
  duration: string
  /** Deck slide modul ini di claude.ai. */
  deckUrl: string
}

export const KELAS_WEB = {
  title: WEB_AI_CLASS.title,
  intro:
    'Slide setiap modul kelas. Tekan modul untuk buka slide, bila-bila masa anda ' +
    'nak ulang semula atau kemas kini laman.',
  meta: ['5 modul', 'Claude Code atau Codex', 'Tanpa tulis kod'],
}

/** Ikut turutan kelas: Pembukaan, Modul 1 hingga 5, kemudian Selepas kelas. */
export const KELAS_MODULES: KelasModule[] = [
  {
    slug: 'pembukaan',
    label: 'Pembukaan',
    number: null,
    Icon: DoorOpen,
    title: 'Pengenalan Kelas',
    summary: 'Matlamat, kos, kelebihan bina sendiri dan jadual hari ini.',
    duration: '15 minit',
    deckUrl: 'https://claude.ai/artifact/PX7QpUKnjA5RJALtBpDCtu',
  },
  {
    slug: 'modul-1',
    label: 'Modul 1',
    number: 1,
    title: 'Kenal Claude Code',
    summary: 'AI yang buat kerja dalam komputer anda.',
    duration: '45 minit',
    deckUrl: 'https://claude.ai/artifact/PF7R9pP4zXjFrRqbT7wQ5k',
  },
  {
    slug: 'modul-2',
    label: 'Modul 2',
    number: 2,
    title: 'Dari Folder ke Laman Web',
    summary: 'Folder bahan syarikat anda jadi laman web satu halaman.',
    duration: '2 jam',
    deckUrl: 'https://claude.ai/artifact/8x9DqNgApFsQpkDYm3dY5x',
  },
  {
    slug: 'modul-3',
    label: 'Modul 3',
    number: 3,
    title: 'AI Kawal Chrome',
    summary: 'AI buka laman anda dan semak macam pelanggan.',
    duration: '45 minit',
    deckUrl: 'https://claude.ai/artifact/4GCzdQbQE2xSeGZL14AixA',
  },
  {
    slug: 'modul-4',
    label: 'Modul 4',
    number: 4,
    title: 'Terbit ke GitHub Pages',
    summary: 'Laman anda keluar dari komputer dan masuk ke internet.',
    duration: '45 minit',
    deckUrl: 'https://claude.ai/artifact/VCq9ZwsuHfX6eWdiq2uaTL',
  },
  {
    slug: 'modul-5',
    label: 'Modul 5',
    number: 5,
    title: 'Domain Sendiri',
    summary: 'Alamat yang pelanggan mudah ingat.',
    duration: '30 minit',
    deckUrl: 'https://claude.ai/artifact/X94MFREmpaKsFp6J99Coy8',
  },
  {
    slug: 'selepas',
    label: 'Selepas kelas',
    number: null,
    Icon: Flag,
    title: 'Selepas Kelas',
    summary: 'Ringkasan dan langkah selepas kelas.',
    duration: 'Penutup',
    deckUrl: 'https://claude.ai/artifact/ShTU3QQVjFbPdDgq4AZKoL',
  },
]
