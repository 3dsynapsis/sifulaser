import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  MessageCircle,
  Newspaper,
} from 'lucide-react'
import {
  BLOG_POSTS,
  SIGN_OFF,
  blogPostPlainText,
  findBlogPost,
  type BlogPost,
} from '../data/blog'

/** Warna tema seksyen Blog — sama keluarga dengan kad di halaman utama. */
const BLOG_COLOR = '#0f766e'
const BLOG_SOFT = '#e9f6f4'

/* ------------------------------------------------------------------ */
/* Salin teks                                                          */
/* ------------------------------------------------------------------ */

/**
 * Clipboard API kadang kadang tergantung tanpa jawapan (contohnya bila tab
 * tak fokus) — bukan gagal, cuma tak balas. Jadi kita beri had masa supaya
 * butang tidak tersangkut menunggu selamanya.
 */
const settleWithin = (promise: Promise<unknown>, ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    promise.then(
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      () => {
        clearTimeout(timer)
        resolve(false)
      },
    )
  })

/**
 * Salin teks biasa. Ramai pembaca buka pautan ini dari dalam WhatsApp,
 * dan browser dalam app tu kadang kadang tak bagi Clipboard API — jadi ada
 * kaedah lama sebagai sandaran.
 */
const copyPlainText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      const ok = await settleWithin(navigator.clipboard.writeText(text), 1200)
      if (ok) return true
    }
  } catch {
    /* jatuh ke kaedah lama di bawah */
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/**
 * Tukar apa apa gambar kepada PNG. Clipboard hanya terima PNG, sedangkan
 * screenshot disimpan sebagai JPEG supaya fail kecil — jadi ia dilukis atas
 * kanvas dahulu, di dalam browser, sebelum disalin.
 */
const asPng = (blob: Blob): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      URL.revokeObjectURL(url)
      if (!ctx) {
        reject(new Error('kanvas tiada konteks'))
        return
      }
      ctx.drawImage(image, 0, 0)
      canvas.toBlob(
        (png) => (png ? resolve(png) : reject(new Error('kanvas tak jadi PNG'))),
        'image/png',
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('gambar tak dapat dibaca'))
    }
    image.src = url
  })

/**
 * Salin gambar ke clipboard. Ini kerja browser komputer — telefon selalunya
 * tak benarkan, jadi bila gagal butang beritahu cara lain (tekan lama atau
 * klik kanan pada gambar) dan bukan sekadar kata gagal.
 */
const copyImage = async (src: string): Promise<boolean> => {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      return false
    }
    const response = await fetch(src)
    if (!response.ok) return false
    const png = await asPng(await response.blob())
    return await settleWithin(
      navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]),
      4000,
    )
  } catch {
    return false
  }
}

type CopyState = 'idle' | 'done' | 'fail'

const CopyButton = ({
  post,
  color,
  full = false,
}: {
  post: BlogPost
  color: string
  /** Butang lebar penuh untuk halaman episod. */
  full?: boolean
}) => {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), 2400)
    return () => clearTimeout(timer)
  }, [state])

  const handleClick = async (event: React.MouseEvent) => {
    // Kad senarai adalah pautan penuh — jangan biar klik ini membukanya.
    event.preventDefault()
    event.stopPropagation()
    const ok = await copyPlainText(blogPostPlainText(post))
    setState(ok ? 'done' : 'fail')
  }

  const done = state === 'done'
  const label =
    state === 'done' ? 'Disalin!' : state === 'fail' ? 'Cuba lagi' : 'Salin teks'

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Salin teks biasa untuk WhatsApp"
      className={`relative z-10 inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
        full ? 'w-full' : ''
      }`}
      style={{
        borderColor: done ? '#c9ecd6' : 'var(--color-line)',
        backgroundColor: done ? '#edf9f1' : 'var(--color-surface)',
        color: done ? '#147a37' : color,
      }}
    >
      {done ? (
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span aria-live="polite">{label}</span>
    </button>
  )
}

/**
 * Gambar alat, siap dengan butang salin.
 *
 * Sebabnya: bila siaran ini dihantar ke WhatsApp, teks sahaja tidak cukup —
 * pembaca mahu nampak rupa alat itu. Sebelum ini gambar tu kena diambil
 * sendiri: buka alat, susun design, screenshot. Sekarang ia sudah ada di sini,
 * satu klik, terus boleh tampal.
 */
const ImageCard = ({ post }: { post: BlogPost }) => {
  // Gambar ini besar (3000 px lebar), jadi menukarnya kepada PNG makan masa
  // sesaat dua. Tanpa keadaan 'busy' butang nampak macam tak ditekan.
  const [state, setState] = useState<CopyState | 'busy'>('idle')

  useEffect(() => {
    if (state === 'idle' || state === 'busy') return
    const timer = setTimeout(() => setState('idle'), 3200)
    return () => clearTimeout(timer)
  }, [state])

  const done = state === 'done'
  const busy = state === 'busy'
  const label =
    state === 'done'
      ? 'Gambar disalin!'
      : state === 'fail'
        ? 'Tekan lama pada gambar'
        : busy
          ? 'Menyalin…'
          : 'Salin gambar'

  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5">
      <img
        src={post.image}
        alt={`Paparan ${post.tool} di sifulaser.com`}
        loading="lazy"
        className="w-full rounded-xl border"
        style={{ borderColor: post.border }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setState('busy')
          setState((await copyImage(post.image)) ? 'done' : 'fail')
        }}
        title="Salin gambar ini untuk ditampal terus ke WhatsApp"
        className="inline-flex min-h-11 w-full select-none items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-70"
        style={{
          borderColor: done ? '#c9ecd6' : 'var(--color-line)',
          backgroundColor: done ? '#edf9f1' : 'var(--color-surface)',
          color: done ? '#147a37' : post.color,
        }}
      >
        {done ? (
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span aria-live="polite">{label}</span>
      </button>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Kepingan kecil yang dikongsi                                        */
/* ------------------------------------------------------------------ */

/** Nombor episod — identiti paling kuat siaran ini, jadi ia dibesarkan. */
const EpisodeBadge = ({ post }: { post: BlogPost }) => (
  <span
    className="flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center rounded-2xl"
    style={{ backgroundColor: post.softBg, color: post.color }}
    aria-hidden="true"
  >
    <span className="text-[8px] font-bold uppercase tracking-[0.18em] opacity-70">
      Episod
    </span>
    <span className="text-[28px] font-extrabold leading-none tabular-nums">
      {post.episode}
    </span>
  </span>
)

const Pill = ({
  children,
  color,
  softBg,
}: {
  children: React.ReactNode
  color: string
  softBg: string
}) => (
  <span
    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
    style={{ backgroundColor: softBg, color }}
  >
    {children}
  </span>
)

/* ------------------------------------------------------------------ */
/* Senarai episod                                                      */
/* ------------------------------------------------------------------ */

const BlogIndex = () => (
  <div className="min-h-screen bg-canvas">
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
      <a
        href="#/"
        className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Utama
      </a>

      <header className="card flex items-center gap-4 p-4 sm:p-5">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: BLOG_SOFT }}
        >
          <Newspaper
            className="h-7 w-7"
            style={{ color: BLOG_COLOR }}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-ink sm:text-xl">Blog</h1>
          <p className="text-sm text-muted">
            Episod Laser — nota Sifu Hisham dari kerja harian. Satu masalah
            sebenar, satu penyelesaian.
          </p>
        </div>
      </header>

      <nav className="flex flex-col gap-4" aria-label="Senarai episod">
        {[...BLOG_POSTS].reverse().map((post) => (
          <article
            key={post.slug}
            className="card group relative flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5 sm:p-5"
            style={{ borderColor: post.border }}
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <EpisodeBadge post={post} />
              <div className="min-w-0 flex-1">
                <a
                  href={`#/blog/${post.slug}`}
                  className="after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                >
                  <h2 className="text-base font-bold leading-snug text-ink sm:text-lg">
                    {post.title}
                  </h2>
                </a>
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Pill color={post.color} softBg={post.softBg}>
                    <post.Icon className="mr-1 h-3 w-3" aria-hidden="true" />
                    {post.tool}
                  </Pill>
                  <span className="text-[11px] font-semibold text-muted">
                    {post.points.length} poin
                  </span>
                </span>
              </div>
            </div>

            <p className="line-clamp-2 text-sm text-muted">{post.points[0]}</p>

            <div className="flex items-center justify-between gap-3">
              <span
                className="inline-flex items-center gap-1.5 text-sm font-bold transition-transform group-hover:translate-x-0.5"
                style={{ color: post.color }}
              >
                Baca penuh
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
              <CopyButton post={post} color={post.color} />
            </div>
          </article>
        ))}
      </nav>

      <section
        className="flex items-center gap-3 rounded-2xl border p-4"
        style={{ borderColor: '#c4e5e0', backgroundColor: BLOG_SOFT }}
      >
        <MessageCircle
          className="h-6 w-6 shrink-0"
          style={{ color: BLOG_COLOR }}
          aria-hidden="true"
        />
        <p className="text-sm text-[#155e56]">
          Setiap episod boleh disalin sebagai teks biasa — terus tampal dalam
          WhatsApp, tiada tanda pelik.
        </p>
      </section>
    </div>
  </div>
)

/* ------------------------------------------------------------------ */
/* Satu episod penuh                                                   */
/* ------------------------------------------------------------------ */

const BlogArticle = ({ post }: { post: BlogPost }) => {
  const index = BLOG_POSTS.findIndex((item) => item.slug === post.slug)
  const previous = BLOG_POSTS[index - 1]
  const next = BLOG_POSTS[index + 1]

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
        <a
          href="#/blog"
          className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Semua episod
        </a>

        {/* Kepala: nombor episod dibesarkan sebagai elemen tipografi utama. */}
        <header
          className="card flex flex-col gap-4 p-4 sm:p-5"
          style={{ borderColor: post.border }}
        >
          <div className="flex items-end gap-3">
            <span
              className="text-[64px] font-extrabold leading-[0.78] tabular-nums sm:text-[76px]"
              style={{ color: post.color }}
            >
              {post.episode}
            </span>
            <span className="pb-1.5 text-[11px] font-bold uppercase leading-[1.35] tracking-[0.2em] text-muted">
              Episod
              <br />
              Laser
            </span>
          </div>

          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span
              className="h-[3px] w-14 rounded-full"
              style={{ backgroundColor: post.color }}
            />
            <span className="h-[3px] flex-1 rounded-full bg-line" />
          </div>

          <h1 className="text-xl font-extrabold leading-snug text-ink sm:text-2xl">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-1.5">
            <Pill color={post.color} softBg={post.softBg}>
              <post.Icon className="mr-1 h-3 w-3" aria-hidden="true" />
              {post.tool}
            </Pill>
            <span className="text-[11px] font-semibold text-muted">
              {post.points.length} poin
            </span>
          </div>

          <CopyButton post={post} color={post.color} full />
        </header>

        {/* Gambar untuk dihantar bersama teks ke WhatsApp. */}
        <ImageCard post={post} />

        {/* Isi: setiap poin bernombor, nombor jadi elemen tipografi. */}
        <section className="card p-4 sm:p-5">
          <ol className="flex flex-col">
            {post.points.map((point, i) => (
              <li
                key={i}
                className="grid grid-cols-[1.9rem_1fr] gap-x-2.5 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[2.25rem_1fr] sm:gap-x-3"
              >
                <span
                  className="mt-[3px] text-right text-[17px] font-extrabold leading-none tabular-nums sm:text-[19px]"
                  style={{ color: post.color }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="text-[15px] leading-[1.65] text-ink">
                  {point}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Pautan yang disebut dalam siaran. */}
        <a
          href={post.link.href}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: post.color }}
        >
          <post.Icon className="h-4 w-4" aria-hidden="true" />
          Buka {post.tool}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
        <p className="-mt-2 text-center text-xs text-muted">{post.link.label}</p>

        {/* Penutup tetap setiap episod. */}
        <section
          className="flex gap-3 rounded-2xl border p-4"
          style={{ borderColor: post.border, backgroundColor: post.softBg }}
        >
          <MessageCircle
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: post.color }}
            aria-hidden="true"
          />
          <div className="min-w-0 text-sm text-ink">
            <p>{SIGN_OFF[0]}</p>
            <p className="mt-1.5 font-bold" style={{ color: post.color }}>
              {SIGN_OFF[1]}
            </p>
            <p className="text-xs text-muted">{SIGN_OFF[2]}</p>
          </div>
        </section>

        {/* Episod sebelum & selepas. */}
        <nav className="flex gap-3" aria-label="Episod lain">
          {previous ? (
            <a
              href={`#/blog/${previous.slug}`}
              className="card flex min-h-11 flex-1 items-center gap-2 p-3 text-left transition-transform hover:-translate-y-0.5"
            >
              <ChevronLeft
                className="h-4 w-4 shrink-0"
                style={{ color: previous.color }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
                  Episod {previous.episode}
                </span>
                <span className="block truncate text-xs font-semibold text-ink">
                  {previous.tool}
                </span>
              </span>
            </a>
          ) : null}
          {next ? (
            <a
              href={`#/blog/${next.slug}`}
              className="card flex min-h-11 flex-1 items-center justify-end gap-2 p-3 text-right transition-transform hover:-translate-y-0.5"
            >
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
                  Episod {next.episode}
                </span>
                <span className="block truncate text-xs font-semibold text-ink">
                  {next.tool}
                </span>
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0"
                style={{ color: next.color }}
                aria-hidden="true"
              />
            </a>
          ) : null}
        </nav>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const readSlug = (): string =>
  window.location.hash
    .replace(/^#\/?/, '')
    .replace(/\/$/, '')
    .split('/')[1] ?? ''

/** Bahagian kedua hash (#/blog/81 -> "81"). */
const useBlogSlug = (): string => {
  const [slug, setSlug] = useState(readSlug)

  useEffect(() => {
    const onHashChange = () => setSlug(readSlug())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return slug
}

export const BlogPage = () => {
  const slug = useBlogSlug()
  const post = slug ? findBlogPost(slug) : undefined
  return post ? <BlogArticle post={post} /> : <BlogIndex />
}
