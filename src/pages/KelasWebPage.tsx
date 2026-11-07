import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Flag,
  Lightbulb,
  ListChecks,
  LockKeyhole,
  LogIn,
  MessageCircle,
  Presentation,
  TriangleAlert,
} from 'lucide-react'
import { SiteHeader } from '../components/SiteHeader'
import {
  KELAS_MODULES,
  KELAS_WEB,
  findKelasModule,
  type KelasBlock,
  type KelasModule,
  type KelasStep,
} from '../data/kelasWeb'
import {
  PAYMENT_WHATSAPP_DISPLAY,
  classAccessWhatsappUrl,
  classHelpWhatsappUrl,
} from '../data/payment'
import { isAdmin } from '../lib/admin'
import { useAuth } from '../lib/auth'
import { copyPlainText } from '../lib/clipboard'
import { WEB_AI_COURSE } from '../lib/courses'

/**
 * Rujukan peserta Kelas "Bina Website Sendiri Dengan AI".
 *
 *   #/kelas-web           senarai modul - terbuka kepada semua, jadi silibus
 *   #/kelas-web/modul-1   satu modul - isi untuk peserta sahaja
 *
 * Peserta = akaun yang admin tandakan dalam Panel Admin (users/{uid}.kursus
 * mengandungi 'website-ai'). Rekod itu didengar secara langsung, jadi halaman
 * terbuka sendiri sebaik admin menanda - peserta tidak perlu muat semula.
 *
 * Warna keluarga langkah 4 (ungu "Belajar lebih"). Setiap kad langkah sama
 * rupa - tiada kad yang tiba-tiba gelap - mengikut gaya slide kelas.
 */

const ACCENT = 'var(--color-g4-accent)'
const INK = 'var(--color-g4-ink)'
const WASH = 'var(--color-g4-wash)'
const SOFT = 'var(--color-g4-soft)'
const LINE = 'var(--color-g4-line)'

/* ------------------------------------------------------------------ */
/* Akses                                                               */
/* ------------------------------------------------------------------ */

type Access = 'loading' | 'open' | 'signin' | 'pending'

const useKelasAccess = (): { access: Access; email: string } => {
  const { configured, user, loading, courses } = useAuth()
  const email = user?.email ?? ''
  // Tanpa Firebase (pembangunan tempatan) tiada cara untuk log masuk, jadi
  // halaman kekal terbuka - sama seperti `paid` dalam lib/auth.tsx.
  if (!configured) return { access: 'open', email }
  // `npm run dev` sahaja: ?kelas-preview untuk semak rupa isi modul tanpa log
  // masuk. import.meta.env.DEV ialah false dalam build, jadi cabang ini
  // dibuang terus daripada laman sebenar.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('kelas-preview')) {
    return { access: 'open', email }
  }
  if (loading) return { access: 'loading', email }
  if (!user) return { access: 'signin', email }
  if (isAdmin(user) || courses.includes(WEB_AI_COURSE)) return { access: 'open', email }
  return { access: 'pending', email }
}

/* ------------------------------------------------------------------ */
/* Senarai semak - disimpan dalam browser                              */
/* ------------------------------------------------------------------ */

const storageKey = (slug: string): string => `sifulaser.kelasweb.${slug}`

const readChecked = (slug: string): number[] => {
  try {
    const raw = window.localStorage.getItem(storageKey(slug))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => Number.isInteger(item))
      : []
  } catch {
    return []
  }
}

const writeChecked = (slug: string, value: number[]): void => {
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(value))
  } catch {
    /* Simpanan disekat (mod peribadi): tanda kekal untuk sesi ini sahaja. */
  }
}

const countDone = (kelas: KelasModule, checked: number[]): number =>
  kelas.checklist.filter((_, index) => checked.includes(index)).length

/* ------------------------------------------------------------------ */
/* Hash: #/kelas-web/<slug>                                            */
/* ------------------------------------------------------------------ */

const readSlug = (): string =>
  window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '').split('/')[1] ?? ''

const useKelasSlug = (): string => {
  const [slug, setSlug] = useState(readSlug)

  useEffect(() => {
    const onHashChange = () => setSlug(readSlug())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return slug
}

/* ------------------------------------------------------------------ */
/* Kotak prompt                                                        */
/* ------------------------------------------------------------------ */

type CopyState = 'idle' | 'done' | 'fail'

const isPlaceholder = (part: string): boolean => part.startsWith('[') && part.endsWith(']')

/** [teks dalam kurungan] diserlahkan supaya peserta ingat untuk menukarnya. */
const PromptText = ({ text }: { text: string }) => (
  <>
    {text.split(/(\[[^\]]+\])/).map((part, index) =>
      isPlaceholder(part) ? (
        <mark
          key={index}
          className="rounded-sm px-0.5"
          style={{ backgroundColor: 'var(--color-g2-soft)', color: 'var(--color-g2-ink)' }}
        >
          {part}
        </mark>
      ) : (
        <span key={index}>{part}</span>
      ),
    )}
  </>
)

const PromptBox = ({ label, text }: { label: string; text: string }) => {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), 2400)
    return () => clearTimeout(timer)
  }, [state])

  const copy = async () => setState((await copyPlainText(text)) ? 'done' : 'fail')
  const hasPlaceholder = /\[[^\]]+\]/.test(text)

  return (
    <figure
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: LINE, backgroundColor: WASH }}
    >
      <figcaption
        className="flex items-center justify-between gap-2 border-b px-3 py-1.5"
        style={{ borderColor: LINE }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: INK }}>
          {label}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-semibold transition-colors hover:bg-canvas"
          style={{
            borderColor: LINE,
            color: state === 'done' ? 'var(--color-g3-ink)' : INK,
          }}
        >
          {state === 'done' ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span aria-live="polite">
            {state === 'done'
              ? 'Disalin'
              : state === 'fail'
                ? 'Tekan lama untuk salin'
                : 'Salin prompt'}
          </span>
        </button>
      </figcaption>
      <p className="select-text whitespace-pre-wrap px-3 py-3 text-[15px] leading-relaxed text-ink">
        <PromptText text={text} />
      </p>
      {hasPlaceholder ? (
        <p className="-mt-1 px-3 pb-3 text-xs text-muted">
          Tukar teks berwarna kepada maklumat anda sebelum hantar.
        </p>
      ) : null}
    </figure>
  )
}

/* ------------------------------------------------------------------ */
/* Blok dalam satu langkah                                             */
/* ------------------------------------------------------------------ */

const NOTE_TONES = {
  tip: {
    Icon: Lightbulb,
    border: 'var(--color-g1-line)',
    background: 'var(--color-g1-wash)',
    color: 'var(--color-g1-ink)',
  },
  warning: {
    Icon: TriangleAlert,
    border: 'var(--color-g2-line)',
    background: 'var(--color-g2-wash)',
    color: 'var(--color-g2-ink)',
  },
}

const Note = ({ tone, children }: { tone: keyof typeof NOTE_TONES; children: ReactNode }) => {
  const style = NOTE_TONES[tone]
  return (
    <p
      className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm leading-relaxed"
      style={{ borderColor: style.border, backgroundColor: style.background, color: style.color }}
    >
      <style.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

const SmallNumber = ({ value }: { value: number }) => (
  <span
    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums"
    style={{ backgroundColor: SOFT, color: INK }}
    aria-hidden="true"
  >
    {value}
  </span>
)

const Block = ({ block }: { block: KelasBlock }) => {
  switch (block.kind) {
    case 'text':
      return <p className="text-[15px] leading-relaxed text-ink">{block.text}</p>
    case 'points':
      return block.ordered ? (
        <ol className="flex flex-col gap-2">
          {block.items.map((item, index) => (
            <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-ink">
              <SmallNumber value={index + 1} />
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {block.items.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[15px] leading-relaxed text-ink">
              <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'diagram':
      return (
        <pre className="overflow-x-auto rounded-xl border border-line bg-canvas p-3 font-mono text-[13px] leading-relaxed text-ink">
          {block.text}
        </pre>
      )
    case 'prompt':
      return <PromptBox label={block.label} text={block.text} />
    case 'tip':
      return <Note tone="tip">{block.text}</Note>
    case 'warning':
      return <Note tone="warning">{block.text}</Note>
    case 'link':
      return (
        <a
          href={block.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 w-fit items-center gap-1.5 text-sm font-semibold underline-offset-2 hover:underline"
          style={{ color: INK }}
        >
          {block.label}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      )
  }
}

/** Satu kad langkah. Semua kad sama rupa; hanya nombor yang berubah. */
const StepCard = ({ step, index }: { step: KelasStep; index: number }) => (
  <li className="card flex flex-col gap-3 p-4 sm:p-5">
    <div className="flex items-center gap-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: ACCENT }}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <h2 className="text-base font-bold text-ink sm:text-lg">{step.title}</h2>
    </div>
    {step.blocks.map((block, blockIndex) => (
      <Block key={blockIndex} block={block} />
    ))}
  </li>
)

/* ------------------------------------------------------------------ */
/* Bahagian kongsi                                                     */
/* ------------------------------------------------------------------ */

const BackLink = ({ href, label }: { href: string; label: string }) => (
  <a
    href={href}
    className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
  >
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    {label}
  </a>
)

const ModuleBadge = ({ kelas }: { kelas: KelasModule }) => (
  <span
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
    style={{ backgroundColor: ACCENT }}
    aria-hidden="true"
  >
    {kelas.number ?? <Flag className="h-5 w-5" />}
  </span>
)

const AccessNotice = ({
  access,
  email,
}: {
  access: 'signin' | 'pending'
  email: string
}) => {
  const { signIn, signOut } = useAuth()

  return (
    <section className="card flex flex-col items-center gap-3 p-5 text-center sm:p-6">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: SOFT }}
      >
        <LockKeyhole className="h-7 w-7" style={{ color: INK }} aria-hidden="true" />
      </span>

      {access === 'signin' ? (
        <>
          <div>
            <h2 className="text-base font-bold text-ink sm:text-lg">Isi modul untuk peserta kelas</h2>
            <p className="mt-1 text-sm text-muted">
              Log masuk dengan akaun Google anda. Selepas Sifu tandakan akaun anda sebagai
              peserta, semua modul terbuka.
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
        </>
      ) : (
        <>
          <div>
            <h2 className="text-base font-bold text-ink sm:text-lg">Akaun ini belum dibuka</h2>
            <p className="mt-1 text-sm text-muted">
              <span className="font-semibold text-ink">{email}</span> belum ditanda sebagai
              peserta. Hantar email ini kepada Sifu di WhatsApp. Halaman ini terbuka sendiri
              sebaik akaun anda ditanda.
            </p>
          </div>
          <a
            href={classAccessWhatsappUrl(email)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-full max-w-[320px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-g3-accent)' }}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            WhatsApp Sifu
          </a>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-10 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Log keluar, guna akaun Google lain
          </button>
        </>
      )}
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

/* ------------------------------------------------------------------ */
/* Senarai modul                                                       */
/* ------------------------------------------------------------------ */

const ModuleRow = ({ kelas, open }: { kelas: KelasModule; open: boolean }) => {
  const done = open ? countDone(kelas, readChecked(kelas.slug)) : 0

  return (
    <li>
      <a
        href={`#/kelas-web/${kelas.slug}`}
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
          {done > 0 ? (
            <span
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold"
              style={{ color: 'var(--color-g3-ink)' }}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {done}/{kelas.checklist.length} disemak
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
        ) : (
          <>
            <LockKeyhole className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="sr-only">Untuk peserta kelas</span>
          </>
        )}
      </a>
    </li>
  )
}

const KelasHub = () => {
  const { access, email } = useKelasAccess()
  const open = access === 'open'

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-5 sm:py-8">
        <BackLink href="#/" label="Utama" />

        <header className="card flex flex-col gap-3 p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: INK }}>
            Kelas · Rujukan peserta
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

        {access === 'loading' ? (
          <div className="card h-28 animate-pulse" />
        ) : access === 'open' ? null : (
          <AccessNotice access={access} email={email} />
        )}

        <ol className="flex flex-col gap-3" aria-label="Modul kelas">
          {KELAS_MODULES.map((kelas) => (
            <ModuleRow key={kelas.slug} kelas={kelas} open={open} />
          ))}
        </ol>

        {open ? <HelpCard /> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Satu modul                                                          */
/* ------------------------------------------------------------------ */

const Checklist = ({ kelas }: { kelas: KelasModule }) => {
  const [checked, setChecked] = useState<number[]>(() => readChecked(kelas.slug))

  useEffect(() => {
    setChecked(readChecked(kelas.slug))
  }, [kelas.slug])

  const toggle = (index: number) => {
    const next = checked.includes(index)
      ? checked.filter((item) => item !== index)
      : [...checked, index]
    setChecked(next)
    writeChecked(kelas.slug, next)
  }

  const done = countDone(kelas, checked)
  const total = kelas.checklist.length

  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="kelas-semak">
      <div className="flex items-center justify-between gap-3">
        <h2 id="kelas-semak" className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg">
          <ListChecks className="h-5 w-5 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
          {kelas.checklistTitle}
        </h2>
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: done === total ? 'var(--color-g3-ink)' : INK }}
        >
          {done}/{total}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {kelas.checklist.map((item, index) => (
          <li key={item}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] leading-snug text-ink">
              <input
                type="checkbox"
                checked={checked.includes(index)}
                onChange={() => toggle(index)}
                className="mt-0.5 h-5 w-5 shrink-0"
                style={{ accentColor: ACCENT }}
              />
              <span>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Tanda disimpan dalam browser ini sahaja.</p>
    </section>
  )
}

/** Tajuk langkah sahaja - untuk pelawat yang belum ditanda sebagai peserta. */
const Outline = ({ kelas }: { kelas: KelasModule }) => (
  <section className="card p-4 sm:p-5">
    <h2 className="text-sm font-bold text-ink">Dalam modul ini</h2>
    <ol className="mt-2.5 flex flex-col gap-2">
      {kelas.steps.map((step, index) => (
        <li key={step.title} className="flex items-start gap-2.5 text-sm text-muted">
          <SmallNumber value={index + 1} />
          <span>{step.title}</span>
        </li>
      ))}
    </ol>
  </section>
)

const NavCard = ({ kelas, direction }: { kelas: KelasModule; direction: 'prev' | 'next' }) => (
  <a
    href={`#/kelas-web/${kelas.slug}`}
    className={`card flex min-h-11 flex-1 items-center gap-2 p-3 transition-transform hover:-translate-y-0.5 ${
      direction === 'next' ? 'justify-end text-right' : 'text-left'
    }`}
  >
    {direction === 'prev' ? (
      <ChevronLeft className="h-4 w-4 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
    ) : null}
    <span className="min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
        {kelas.label}
      </span>
      <span className="block truncate text-xs font-semibold text-ink">{kelas.title}</span>
    </span>
    {direction === 'next' ? (
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
    ) : null}
  </a>
)

const KelasModulePage = ({ kelas }: { kelas: KelasModule }) => {
  const { access, email } = useKelasAccess()
  const open = access === 'open'
  const index = KELAS_MODULES.findIndex((item) => item.slug === kelas.slug)
  const previous = KELAS_MODULES[index - 1]
  const next = KELAS_MODULES[index + 1]

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-5 sm:py-8">
        <BackLink href="#/kelas-web" label="Semua modul" />

        <header className="card flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <ModuleBadge kelas={kelas} />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: INK }}>
              {kelas.label} · {kelas.duration}
            </p>
          </div>
          <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
            {kelas.title}
          </h1>
          <p className="text-[15px] leading-relaxed text-muted">{kelas.summary}</p>
          <p
            className="rounded-xl border px-3 py-2.5 text-sm leading-relaxed text-ink"
            style={{ borderColor: LINE, backgroundColor: WASH }}
          >
            <span className="font-bold" style={{ color: INK }}>
              Hasil anda:{' '}
            </span>
            {kelas.outcome}
          </p>
          {open ? (
            <a
              href={kelas.deckUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold transition-colors hover:bg-canvas"
              style={{ borderColor: LINE, color: INK }}
            >
              <Presentation className="h-4 w-4" aria-hidden="true" />
              {kelas.number ? `Buka slide ${kelas.label}` : 'Buka slide penutup'}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </header>

        {access === 'loading' ? (
          <div className="card h-40 animate-pulse" />
        ) : access === 'open' ? (
          <>
            <ol className="flex flex-col gap-4" aria-label={`Langkah ${kelas.label}`}>
              {kelas.steps.map((step, stepIndex) => (
                <StepCard key={step.title} step={step} index={stepIndex} />
              ))}
            </ol>
            <Checklist kelas={kelas} />
            {kelas.number === null ? <HelpCard /> : null}
          </>
        ) : (
          <>
            <Outline kelas={kelas} />
            <AccessNotice access={access} email={email} />
          </>
        )}

        <nav className="flex gap-3" aria-label="Modul lain">
          {previous ? <NavCard kelas={previous} direction="prev" /> : null}
          {next ? <NavCard kelas={next} direction="next" /> : null}
        </nav>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export const KelasWebPage = () => {
  const slug = useKelasSlug()
  const kelas = slug ? findKelasModule(slug) : undefined
  return kelas ? <KelasModulePage kelas={kelas} /> : <KelasHub />
}
