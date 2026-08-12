import {
  ArrowRight,
  ClipboardCheck,
  Crosshair,
  Lightbulb,
  LockKeyhole,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import type { CSSProperties, ComponentType } from 'react'
import { AccountBar } from '../components/AccountBar'
import { useAuth } from '../lib/auth'

interface HomeCard {
  number: number
  title: string
  description: string
  href: string
  color: string
  softBg: string
  border: string
  /** true jika kad ini kandungan berbayar sepenuhnya. */
  premium?: boolean
  Icon: ComponentType<{ className?: string; style?: CSSProperties }>
}

const CARDS: HomeCard[] = [
  {
    number: 1,
    title: 'Simulator Alignment',
    description: 'Belajar dan praktik alignment cermin untuk Mesin Laser Cut.',
    href: '#/simulator',
    color: '#1f78d1',
    softBg: '#eef5fd',
    border: '#cfe0f5',
    Icon: Crosshair,
  },
  {
    number: 2,
    title: 'Maintenance',
    description:
      'Senarai semak weekly & yearly untuk memastikan mesin sentiasa optimum.',
    href: '#/maintenance',
    color: '#20a04a',
    softBg: '#edf9f1',
    border: '#c9ecd6',
    premium: true,
    Icon: ClipboardCheck,
  },
  {
    number: 3,
    title: 'Kedai Laser',
    description: 'Barang keperluan kerja laser — double tape, lanyard & lain-lain di Shopee kami.',
    href: '#/kedai',
    color: '#e07514',
    softBg: '#fdf3e8',
    border: '#f6ddc0',
    Icon: ShoppingBag,
  },
  {
    number: 4,
    title: 'About Me',
    description: 'Kenali saya dan tujuan di sebalik SifuLaser.',
    href: '#/about',
    color: '#7c3aed',
    softBg: '#f4effd',
    border: '#e2d5f8',
    Icon: UserRound,
  },
]

export const HomePage = () => {
  const { paid } = useAuth()

  return (
  <div className="min-h-screen bg-gradient-to-b from-[#eef4fc] via-canvas to-canvas">
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-6 sm:py-10">
      {/* Hero */}
      <header className="px-1 pt-2">
        <p className="flex items-end gap-2">
          <span className="text-5xl font-extrabold tracking-tight sm:text-6xl">
            <span className="text-ink">Sifu</span>
            <span className="italic text-screw-2">Laser</span>
          </span>
          <Sparkles className="mb-2 h-7 w-7 shrink-0 text-near" aria-hidden="true" />
          <span className="mb-2 whitespace-nowrap text-[11px] font-semibold text-muted">
            by Mahligai Seni
          </span>
        </p>
        <p className="mt-2 border-t-2 border-near/60 pt-2 text-sm font-semibold tracking-[0.25em] text-muted">
          ALIGN. MAINTAIN. PERFORM.
        </p>
      </header>

      {/* Kad selamat datang */}
      <section className="card flex items-center gap-4 p-4 sm:p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#eef5fd]">
          <Crosshair className="h-7 w-7 text-screw-2" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-ink sm:text-xl">Selamat datang!</h1>
          <p className="text-sm text-muted">
            Sedia untuk alignment yang tepat dan mesin yang terbaik.
          </p>
        </div>
      </section>

      {/* Akaun & status akses */}
      <AccountBar />

      {/* Kad menu */}
      <nav className="grid grid-cols-2 gap-3 sm:gap-4" aria-label="Menu utama">
        {CARDS.map(({ number, title, description, href, color, softBg, border, premium, Icon }) => (
          <a
            key={href}
            href={href}
            className="card group relative flex flex-col items-center gap-3 p-4 pt-5 text-center transition-transform hover:-translate-y-0.5"
            style={{ borderColor: border }}
          >
            <span
              className="absolute top-3 left-3 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            >
              {number}
            </span>
            {premium && !paid ? (
              <span
                className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-canvas text-muted"
                title="Perlukan Akses Penuh"
              >
                <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Perlukan Akses Penuh</span>
              </span>
            ) : null}
            <span
              className="mt-2 flex h-24 w-24 items-center justify-center rounded-full"
              style={{ backgroundColor: softBg }}
              aria-hidden="true"
            >
              <Icon className="h-12 w-12" style={{ color }} />
            </span>
            <span className="text-base font-bold text-ink sm:text-lg">{title}</span>
            <span className="text-xs text-muted sm:text-sm">{description}</span>
            <span
              className="mt-auto flex h-9 w-9 items-center justify-center rounded-full text-white transition-transform group-hover:translate-x-0.5"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            >
              <ArrowRight className="h-5 w-5" />
            </span>
          </a>
        ))}
      </nav>

      {/* Petikan penutup */}
      <section className="flex items-center gap-3 rounded-2xl border border-[#cfe0f5] bg-[#eef5fd] p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-screw-2/10">
          <Lightbulb className="h-6 w-6 text-screw-2" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-screw-2">
            Precision hari ini, hasil terbaik esok.
          </p>
          <p className="text-xs text-muted sm:text-sm">
            Jaga alignment, mesin akan jaga hasil anda.
          </p>
        </div>
        <TrendingUp className="h-6 w-6 shrink-0 text-screw-2/70" aria-hidden="true" />
      </section>
    </div>
  </div>
  )
}
