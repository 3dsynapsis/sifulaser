import {
  ChevronDown,
  LogIn,
  LogOut,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { isAdmin } from '../lib/admin'
import { useHashRoute } from '../hooks/useHashRoute'
import { NAV } from '../data/tools'

/**
 * Bar atas laman.
 *
 * Dirender pada HomePage SAHAJA dalam pusingan ini, tetapi ditulis berdiri
 * sendiri supaya ia boleh diterima pakai ke seluruh laman kemudian tanpa
 * ditulis semula. Sembilan halaman alat kini mempunyai pengepala sendiri, dan
 * AppHeader hanya untuk simulator.
 *
 * Tiada loceng notifikasi di sini dengan sengaja: tiada medan, tiada koleksi
 * dan tiada cap masa di mana-mana dalam projek yang boleh menyalakannya.
 * firestore.rules hanya membuka users/{uid} dan users/{uid}/designs, dan pos
 * blog tidak mempunyai tarikh — hanya nombor episod. Loceng yang tidak pernah
 * boleh menyala hanyalah perabot.
 */

/** Pill nav dengan satu isian meluncur yang diukur dari anchor aktif. */
const NavPills = ({ route }: { route: string }) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const el = wrap.querySelector<HTMLElement>('[aria-current="page"]')
      // Lebar sifar bermakna salinan ini disembunyikan (satu untuk desktop,
      // satu untuk telefon). Sembunyikan isian dan bukan melukisnya di 0,0.
      if (!el || el.offsetWidth === 0) {
        setInd(null)
        return
      }
      setInd({ x: el.offsetLeft, w: el.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [route])

  return (
    <div className="nav-trough nav-scroll" ref={wrapRef}>
      {ind ? (
        <span
          className="nav-ind"
          style={{ transform: `translateX(${ind.x}px)`, width: ind.w }}
          aria-hidden="true"
        />
      ) : null}
      {NAV.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="nav-pill"
          aria-current={item.route === route ? 'page' : undefined}
        >
          <item.Icon size={15} strokeWidth={2} aria-hidden="true" />
          {item.label}
        </a>
      ))}
    </div>
  )
}

const AccountSlot = () => {
  const {
    configured,
    user,
    paid,
    paidUntil,
    isClassParticipant,
    loading,
    signIn,
    signOut,
  } = useAuth()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Firebase belum dikonfigurasi: slot kekal kosong pada lebarnya, supaya bar
  // tidak menutup jurang dan bergerak.
  if (!configured) return <div className="home-authslot" aria-hidden="true" />

  if (loading) {
    return (
      <div className="home-authslot gap-2">
        <span className="h-9 w-9 animate-pulse rounded-full bg-line" />
        <span className="hidden mid:block">
          <span className="mb-1 block h-3 w-14 animate-pulse rounded bg-line" />
          <span className="block h-3 w-22 animate-pulse rounded bg-line" />
        </span>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="home-authslot">
        <button
          type="button"
          onClick={() => void signIn()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-screw-2 px-3.5 text-[13px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-[#1a67b6]"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          <span className="hidden wide:inline">Log masuk dengan Google</span>
          <span className="wide:hidden">Log masuk</span>
        </button>
      </div>
    )
  }

  // Nama datang dari token Google, bukan dari medan `name` dokumen Firestore.
  // Medan itu ditulis sekali pada log masuk pertama dan tiada apa-apa yang
  // menyegarkannya — ia jadi basi tanpa sesiapa tahu.
  const name = user.displayName || user.email || 'Akaun'

  // paidUntil boleh null sedangkan paid true (admin menetapkan paid terus dari
  // Firebase Console; firestore.rules membenarkannya). Dalam kes itu baris ini
  // ditinggalkan sepenuhnya, bukan dicetak sebagai "Sah sehingga —".
  const expiryLabel = paidUntil
    ? paidUntil.toLocaleDateString('ms-MY', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  // Satu rentetan, bukan lencana kedua: begitulah penanda "Peserta Kelas"
  // terselamat daripada reka bentuk baharu tanpa piksel tambahan.
  const planLabel = paid
    ? isClassParticipant
      ? 'Akses Penuh · Kelas'
      : 'Akses Penuh'
    : 'Akaun Percuma'

  return (
    <div className="home-authslot" ref={boxRef}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex max-w-full items-center gap-2 rounded-xl border border-transparent px-1.5 py-1.5 text-left transition-colors hover:border-line hover:bg-white/70 sm:px-2"
        >
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 shrink-0 rounded-full border border-line object-cover sm:h-9 sm:w-9"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef5fd] sm:h-9 sm:w-9">
              <UserRound className="h-4 w-4 text-screw-2" aria-hidden="true" />
            </span>
          )}
          <span className="hidden min-w-0 mid:block">
            <span className="block truncate text-[13px] leading-tight font-bold text-ink">
              {name}
            </span>
            <span
              className="block text-[11.5px] leading-tight font-bold"
              style={{ color: paid ? 'var(--color-screw-2)' : 'var(--color-muted)' }}
            >
              {planLabel}
            </span>
            {expiryLabel && paid ? (
              <span className="hidden text-[10.5px] leading-tight text-muted tabular-nums wide:block">
                Sah sehingga {expiryLabel}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className="hidden h-4 w-4 shrink-0 text-muted mid:block"
            aria-hidden="true"
          />
          <span className="sr-only">Menu akaun</span>
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white shadow-[0_20px_44px_-22px_rgb(20_33_61/0.6)]"
          >
            <p className="border-b border-line px-3 py-2 text-[11.5px] text-muted mid:hidden">
              <span className="block truncate font-bold text-ink">{name}</span>
              {planLabel}
            </p>
            {isAdmin(user) ? (
              <a
                href="#/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-2 px-3 text-[13px] font-semibold text-ink hover:bg-canvas"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Panel Admin
              </a>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                void signOut()
              }}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] font-semibold text-muted hover:bg-canvas hover:text-ink"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log keluar
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const SiteHeader = () => {
  const route = useHashRoute()
  const { error } = useAuth()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="home-bar" data-scrolled={scrolled ? 'true' : 'false'}>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
        <div className="home-bar-inner">
          <a href="#/" className="min-w-0 no-underline">
            <span className="home-wordmark flex flex-wrap items-center gap-x-2">
              <span className="text-2xl leading-none font-extrabold tracking-[-0.02em] mid:text-[34px]">
                <span className="text-ink">Sifu</span>
                <span className="text-screw-2 italic">Laser</span>
              </span>
              <Sparkles
                className="h-[18px] w-[18px] shrink-0 text-near"
                aria-hidden="true"
              />
              <span className="hidden text-[10.5px] leading-none font-semibold whitespace-nowrap text-muted mid:inline">
                by Mahligai Seni
              </span>
            </span>
            {/* Satu-satunya elemen yang digugurkan pada mana-mana lebar:
                tagline ini hilang di bawah 640 kerana wordmark sudah membawa
                jenama dan bar 56 px tiada ruang untuk dua baris. */}
            <span className="mt-[3px] hidden border-t-2 border-near/55 pt-1 text-[10px] leading-none font-bold tracking-[0.26em] text-muted uppercase mid:block">
              Align. Maintain. Perform.
            </span>
          </a>

          <nav aria-label="Navigasi laman" className="hidden sm:block">
            <NavPills route={route} />
          </nav>

          <AccountSlot />
        </div>

        {/* Pada telefon pill nav keluar dari bar ke barisnya sendiri. */}
        <nav aria-label="Navigasi laman" className="pb-2 sm:hidden">
          <NavPills route={route} />
        </nav>

        {error ? (
          <p className="pb-2 text-[12px] font-semibold text-[#8a2226]">{error}</p>
        ) : null}
      </div>
    </header>
  )
}
