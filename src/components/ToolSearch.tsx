import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { searchTools } from '../data/tools'

/**
 * Carian direktori: 18 sasaran (14 tile + 4 destinasi nav), padanan substring
 * lipat-huruf, maksimum enam baris.
 *
 * Grid di bawah TIDAK pernah disusun semula. Meredupkan atau menapis empat
 * belas tile yang semuanya sudah kelihatan lebih lambat daripada membaca
 * senarai ini, dan pada 375 px senarai ini ialah keseluruhan jawapannya.
 */
export const ToolSearch = () => {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const results = useMemo(() => searchTools(query), [query])

  useEffect(() => setActive(0), [query])

  // "/" memfokus kotak carian.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)
        return
      // Jangan rampas '/' bila orang sedang menaip, atau bila fokus ada di
      // dalam iframe mana-mana alat — sembilan halaman alat semuanya iframe
      // same-origin dan menaip '/' di sana perkara biasa.
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
        return
      if (
        el?.getAttribute('contenteditable') === 'true' ||
        el?.tagName === 'IFRAME'
      )
        return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Klik di luar menutup senarai.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const show = open && query.trim().length > 0
  const go = (href: string) => {
    window.location.hash = href.replace(/^#/, '')
    setOpen(false)
    inputRef.current?.blur()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!show || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(results[active].href)
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={show && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            show && results.length ? `${listId}-${active}` : undefined
          }
          aria-label="Cari tool"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Cari tool... contoh: Box Maker, QR, Alignment..."
          /* 16px di bawah 640 dengan sengaja — iOS zum masuk pada apa-apa
             yang lebih kecil sebaik sahaja medan itu difokus. */
          className="h-[52px] w-full rounded-xl border border-line bg-white pr-4 pl-11 text-base font-medium text-ink shadow-[0_1px_2px_rgb(20_33_61/0.05)] outline-none placeholder:text-muted/80 focus:border-screw-2 sm:text-[15px]"
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {show ? `${results.length} hasil carian` : ''}
      </p>

      {/* Keadaan tiada-padanan BUKAN listbox. Pautan yang bersarang dalam
          listbox tidak boleh dicapai sebagai option, dan combobox yang
          mengiklankan popup berperanan listbox dengan sifar option ialah janji
          yang tidak ditepati. Jadi role itu — dan aria-expanded di atas —
          hanya muncul bila ada option sebenar untuk dilayari. */}
      {show && results.length === 0 ? (
        <div className="search-pop">
          <p className="px-3 py-3 text-[13px] text-muted">
            Tiada tool yang sepadan dengan &ldquo;{query.trim()}&rdquo;.{' '}
            <a
              href="#/blog"
              className="font-semibold text-screw-2 underline-offset-2 hover:underline"
            >
              Cuba cari dalam blog
            </a>
          </p>
        </div>
      ) : null}

      {show && results.length > 0 ? (
        <div className="search-pop" id={listId} role="listbox">
          {results.map((item, index) => (
            <a
              key={item.href}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              data-active={index === active}
              className="search-opt"
              href={item.href}
              onMouseEnter={() => setActive(index)}
              onClick={() => setOpen(false)}
            >
              <span
                className="h-6 w-6 shrink-0 rounded-full"
                style={{ background: item.accent }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-ink">
                  {item.title}
                </span>
                <span className="block truncate text-[11.5px] text-muted">
                  {item.line}
                </span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}
