import { m, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { ToolSearch } from '../ToolSearch'

/**
 * Hero gelap halaman utama: katil mesin laser, dan di tepi bawahnya satu
 * sambungan finger joint yang dipotong oleh laser sebaik halaman dibuka.
 *
 * Tepi itu bukan hiasan semata-mata. Kandungan krim di bawah ialah kepingan
 * kedua sambungan itu - giginya mengisi celah gigi hero - jadi halaman ini
 * terbaca sebagai dua papan yang dicantum, iaitu kerja yang laman ini ajar.
 */

const TEETH_H = 36
const HI = 10
const LO = 26

/**
 * Garisan finger joint selebar `w` piksel. Tempoh gigi dalam piksel sebenar,
 * bukan dalam viewBox yang diregang: dengan preserveAspectRatio="none" gigi
 * 40 px pada desktop jadi 12 px yang tinggi dan kurus pada telefon.
 */
const teethPath = (w: number, period = 44): string => {
  let d = `M0 ${LO}`
  let x = 0
  let up = true
  while (x < w) {
    const nx = Math.min(x + period / 2, w)
    d += ` H${nx}`
    if (nx >= w) break
    d += ` V${up ? HI : LO}`
    up = !up
    x = nx
  }
  return d
}

const LASER_S = 2.8
const LASER_DELAY = 0.45

/**
 * Tajuk dan carian naik masuk dengan CSS (.hero-rise), bukan motion. Ciri
 * motion dimuat sebagai chunk berasingan, dan apa-apa `m` dengan `initial`
 * kekal tersorok sehingga chunk itu tiba - pada telefon dengan data perlahan
 * itu bermakna tajuk halaman utama kosong. Laser di tepi bawah boleh
 * menunggu; tajuk tidak.
 */
const rise = (i: number) => ({ animationDelay: `${80 + i * 90}ms` })

export const HomeHero = () => {
  const reduce = useReducedMotion()
  const edgeRef = useRef<HTMLDivElement>(null)
  // Lebar tetingkap sebagai tekaan pertama supaya gigi wujud pada cat pertama.
  const [w, setW] = useState(() =>
    typeof window === 'undefined' ? 1200 : window.innerWidth,
  )

  useLayoutEffect(() => {
    const el = edgeRef.current
    if (!el) return
    const measure = () => setW(Math.max(1, Math.round(el.clientWidth)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cut = teethPath(w)

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-inner">
        <p className="hero-eyebrow hero-rise" style={rise(0)}>
          One Stop Centre Laser
        </p>
        <h1 id="hero-title" className="hero-title">
          <span className="hero-rise block" style={rise(1)}>
            Satu Tempat.
          </span>
          <span className="hero-rise block" style={rise(2)}>
            Semua Kerja <span className="hero-hot">Laser.</span>
          </span>
        </h1>
        <div className="hero-search hero-rise" style={rise(3)}>
          <ToolSearch placeholder="Nak buat apa hari ini?" />
        </div>
      </div>

      <div ref={edgeRef} className="hero-edge" aria-hidden="true">
        <svg width={w} height={TEETH_H} viewBox={`0 0 ${w} ${TEETH_H}`}>
          <path d={`${cut} V${TEETH_H} H0 Z`} className="hero-edge-fill" />
        </svg>
        {/* SVG kedua untuk garisan sahaja: cahaya drop-shadow dipasang pada
            elemen <svg>, kerana Chrome tidak melukis penapis CSS pada <path>.
            Dalam SVG yang sama ia akan menyalakan isian krim juga. */}
        <svg
          width={w}
          height={TEETH_H}
          viewBox={`0 0 ${w} ${TEETH_H}`}
          className="hero-edge-glow"
        >
          <m.path
            d={cut}
            className="hero-edge-cut"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: LASER_S, delay: LASER_DELAY, ease: 'linear' }}
          />
          {reduce ? null : (
            <m.path
              d={cut}
              className="hero-edge-spark"
              initial={{ pathLength: 0.018, pathOffset: 0, opacity: 1 }}
              animate={{ pathOffset: 0.982, opacity: [1, 1, 0] }}
              transition={{
                duration: LASER_S,
                delay: LASER_DELAY,
                ease: 'linear',
                opacity: { duration: LASER_S, delay: LASER_DELAY, times: [0, 0.96, 1] },
              }}
            />
          )}
        </svg>
      </div>
    </section>
  )
}
