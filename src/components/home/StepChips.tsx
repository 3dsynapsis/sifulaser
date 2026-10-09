import { useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ToolGroup } from '../../data/tools'

export const stepAnchor = (id: string) => `langkah-${id}`

/**
 * Cip lompat Harga · Idea · Fail · Belajar, melekat di bawah bar atas.
 *
 * Butang dan bukan pautan #sauh: hash laman ini ialah penghala, dan
 * useHashRoute menggulung ke atas pada setiap pertukaran hash. Satu sauh di
 * sini akan membuang orang ke halaman utama paling atas.
 */
export const StepChips = ({ groups }: { groups: ToolGroup[] }) => {
  const reduce = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string>(groups[0]?.id ?? '')
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null)

  // Langkah aktif = langkah terakhir yang tepinya sudah melepasi garis di
  // bawah cip. Dikira dari kedudukan, bukan IntersectionObserver: langkah 4
  // pendek dan tidak pernah memenuhi ambang nisbah pada skrin tinggi.
  useEffect(() => {
    let frame = 0
    const pick = () => {
      frame = 0
      const line =
        (trackRef.current?.getBoundingClientRect().bottom ?? 0) + 24
      let current = groups[0]?.id ?? ''
      for (const g of groups) {
        const el = document.getElementById(stepAnchor(g.id))
        if (el && el.getBoundingClientRect().top <= line) current = g.id
      }
      // Hujung halaman: langkah terakhir menang walaupun tepinya tidak
      // sempat sampai ke garis itu.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        current = groups[groups.length - 1]?.id ?? current
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(pick)
    }
    pick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [groups])

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      const el = track.querySelector<HTMLElement>('[aria-current="true"]')
      setInd(el ? { x: el.offsetLeft, w: el.offsetWidth } : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(track)
    return () => ro.disconnect()
  }, [active])

  const jump = (id: string) => {
    const el = document.getElementById(stepAnchor(id))
    if (!el) return
    setActive(id)
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav className="chips" aria-label="Lompat ke langkah">
      <div className="chips-track" ref={trackRef}>
        {ind ? (
          <span
            className="chips-ind"
            style={{ transform: `translateX(${ind.x}px)`, width: ind.w }}
            aria-hidden="true"
          />
        ) : null}
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className="chip"
            aria-current={g.id === active ? 'true' : undefined}
            onClick={() => jump(g.id)}
          >
            <span className="chip-num" aria-hidden="true">
              {g.step}
            </span>
            {g.chip}
          </button>
        ))}
      </div>
    </nav>
  )
}
