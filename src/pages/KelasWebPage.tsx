import { ArrowLeft, ExternalLink, LockKeyhole, LogIn, MessageCircle } from 'lucide-react'
import { SiteHeader } from '../components/SiteHeader'
import { KELAS_MODULES, KELAS_WEB, type KelasModule } from '../data/kelasWeb'
import { PAYMENT_WHATSAPP_DISPLAY, classHelpWhatsappUrl } from '../data/payment'
import { useAuth } from '../lib/auth'

/**
 * Kelas "Bina Website Sendiri Dengan AI" - #/kelas-web.
 *
 * Satu halaman sahaja: senarai modul. Tekan modul dan deck slide modul itu
 * terbuka di claude.ai dalam tab baharu. Tiada halaman penerangan di tengah -
 * Boss mahu terus ke slide (7 Nov 2026). Pautan lama #/kelas-web/modul-1
 * jatuh ke halaman ini juga.
 *
 * Log masuk sahaja sudah cukup (Boss, 9 Nov 2026): pelawat yang belum log
 * masuk hanya nampak permintaan log masuk, dan sesiapa yang sudah log masuk
 * nampak senarai dan boleh buka slide. Tiada penanda peserta di Panel Admin.
 *
 * Warna keluarga langkah 4 (ungu "Belajar lebih"). Semua kad sama rupa.
 */

const ACCENT = 'var(--color-g4-accent)'
const INK = 'var(--color-g4-ink)'
const WASH = 'var(--color-g4-wash)'
const SOFT = 'var(--color-g4-soft)'
const LINE = 'var(--color-g4-line)'

type Access = 'loading' | 'open' | 'signin'

const useKelasAccess = (): Access => {
  const { configured, user, loading } = useAuth()
  // Tanpa Firebase (pembangunan tempatan) tiada cara untuk log masuk, jadi
  // halaman kekal terbuka - sama seperti `paid` dalam lib/auth.tsx.
  if (!configured) return 'open'
  // `npm run dev` sahaja: ?kelas-preview untuk semak rupa selepas log masuk
  // tanpa log masuk. import.meta.env.DEV ialah false dalam build, jadi cabang
  // ini dibuang terus daripada laman sebenar.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('kelas-preview')) {
    return 'open'
  }
  if (user) return 'open'
  return loading ? 'loading' : 'signin'
}

const ModuleBadge = ({ kelas }: { kelas: KelasModule }) => (
  <span
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
    style={{ backgroundColor: ACCENT }}
    aria-hidden="true"
  >
    {kelas.number ?? (kelas.Icon ? <kelas.Icon className="h-5 w-5" /> : null)}
  </span>
)

/** Kad modul ialah pautan terus ke deck slide, dalam tab baharu. */
const ModuleCard = ({ kelas }: { kelas: KelasModule }) => (
  <li>
    <a
      href={kelas.deckUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="card flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5"
    >
      <ModuleBadge kelas={kelas} />
      <span className="min-w-0 flex-1">
        <span
          className="block text-[11px] font-bold uppercase tracking-wider"
          style={{ color: INK }}
        >
          {kelas.label} · {kelas.duration}
        </span>
        <span className="mt-0.5 block text-base font-bold leading-snug text-ink sm:text-lg">
          {kelas.title}
        </span>
        <span className="mt-0.5 block text-sm text-muted">{kelas.summary}</span>
      </span>
      <ExternalLink className="h-5 w-5 shrink-0" style={{ color: INK }} aria-hidden="true" />
      <span className="sr-only">Buka slide di tab baharu</span>
    </a>
  </li>
)

const SignInNotice = () => {
  const { signIn } = useAuth()

  return (
    <section className="card flex flex-col items-center gap-3 p-5 text-center sm:p-6">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: SOFT }}
      >
        <LockKeyhole className="h-7 w-7" style={{ color: INK }} aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-base font-bold text-ink sm:text-lg">Log masuk untuk lihat kelas</h2>
        <p className="mt-1 text-sm text-muted">
          Halaman ini hanya untuk pengguna yang log masuk. Log masuk dengan akaun Google anda.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void signIn()}
        className="inline-flex min-h-11 w-full max-w-[320px] items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a67b6]"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Log masuk dengan Google
      </button>
    </section>
  )
}

const HelpCard = () => (
  <section
    className="flex items-start gap-3 rounded-2xl border p-4"
    style={{ borderColor: LINE, backgroundColor: WASH }}
  >
    <MessageCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: INK }} aria-hidden="true" />
    <div className="min-w-0 text-sm text-ink">
      <p className="font-bold">Tersangkut selepas kelas?</p>
      <p className="mt-0.5 text-muted">
        WhatsApp pengajar, terutama bila menyambung domain atau mengemas kini laman.
      </p>
      <a
        href={classHelpWhatsappUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--color-g3-accent)' }}
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        WhatsApp {PAYMENT_WHATSAPP_DISPLAY}
      </a>
    </div>
  </section>
)

export const KelasWebPage = () => {
  const access = useKelasAccess()

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-5 sm:py-8">
        <a
          href="#/"
          className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Utama
        </a>

        {/* Sebelum log masuk, pelawat tidak nampak apa-apa tentang kelas -
            hanya permintaan log masuk. Semasa status log masuk dimuatkan,
            rangka kosong supaya senarai tidak terpancar. */}
        {access === 'loading' ? (
          <div className="card h-40 animate-pulse" />
        ) : access === 'signin' ? (
          <SignInNotice />
        ) : (
          <>
            <header className="card flex flex-col gap-3 p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: INK }}>
                Kelas · Slide peserta
              </p>
              <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
                {KELAS_WEB.title}
              </h1>
              <p className="text-[15px] leading-relaxed text-muted">{KELAS_WEB.intro}</p>
              <ul className="flex flex-wrap gap-2">
                {KELAS_WEB.meta.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-muted"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </header>

            <ol className="flex flex-col gap-3" aria-label="Modul kelas">
              {KELAS_MODULES.map((kelas) => (
                <ModuleCard key={kelas.slug} kelas={kelas} />
              ))}
            </ol>

            <HelpCard />
          </>
        )}
      </div>
    </div>
  )
}
