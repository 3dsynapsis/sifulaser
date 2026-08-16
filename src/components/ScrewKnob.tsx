import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { Direction, ScrewConfig, ScrewId } from '../types'

/** Jarak seret (piksel) untuk satu langkah pergerakan beam. */
const STEP_PX = 22
/** Tinggi bar yang timbul semasa knob disentuh. */
const BAR_H = 168
const BAR_W = 30

interface ScrewKnobProps {
  screw: ScrewConfig
  isActive: boolean
  disabled?: boolean
  onMove: (screwId: ScrewId, direction: Direction) => void
  /** Dimaklumkan semasa seretan bermula, bertukar arah, dan berakhir. */
  onDragChange: (screwId: ScrewId, direction: Direction | null) => void
  /** Balikkan tangan supaya ia menghala ke dalam kad, bukan keluar tepi. */
  flipHint?: boolean
  /** Kelewatan petunjuk, supaya tangan muncul bergilir bukan serentak. */
  hintDelay?: number
}

/**
 * Knob pelarasan skru.
 *
 * Sentuh knob dan bar akan timbul; seret jari ke atas atau ke bawah untuk
 * menggerakkan beam. Bar sengaja dibentuk paling lebar di tengah dan mengecil
 * ke kedua-dua hujung, meniru rasa memusing knob sebenar — bahagian tengah
 * ialah kedudukan neutral, dan makin jauh jari bergerak makin halus baki
 * pelarasan yang tinggal.
 */
export const ScrewKnob = ({
  screw,
  isActive,
  disabled = false,
  onMove,
  onDragChange,
  flipHint = false,
  hintDelay = 0,
}: ScrewKnobProps) => {
  const [dragging, setDragging] = useState(false)
  const [offset, setOffset] = useState(0)
  /** Putaran terkumpul, tanpa had — skru sebenar tiada hujung. */
  const [angle, setAngle] = useState(0)
  /**
   * Petunjuk melahu: hidup sebaik halaman dibuka, padam sebaik pengguna
   * menyentuh, dan hidup semula selepas seketika tidak digunakan.
   */
  const [hint, setHint] = useState(true)
  const idleTimer = useRef<number | undefined>(undefined)
  const startY = useRef(0)
  const fired = useRef(0)
  const lastDelta = useRef(0)

  const color = screw.colorVar
  const showHint = hint && !dragging && !disabled

  useEffect(
    () => () => {
      if (idleTimer.current !== undefined) {
        window.clearTimeout(idleTimer.current)
      }
    },
    [],
  )

  const wake = () => {
    setHint(false)
    if (idleTimer.current !== undefined) window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setHint(true), 7000)
  }

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    wake()
    event.currentTarget.setPointerCapture(event.pointerId)
    startY.current = event.clientY
    fired.current = 0
    lastDelta.current = 0
    setOffset(0)
    setDragging(true)
  }

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging || disabled) return
    // Positif bermakna jari bergerak ke atas.
    const delta = startY.current - event.clientY
    setOffset(Math.max(-BAR_H / 2, Math.min(BAR_H / 2, delta)))
    // Putaran ikut seretan mentah, jadi ia terus berpusing walaupun penanda
    // bar sudah sampai hujung.
    //
    // Penambahan dikira DAHULU dan disimpan dalam pemboleh ubah tempatan.
    // Kalau dibaca di dalam fungsi kemas kini React, ref sudah pun ditulis
    // semula sebelum fungsi itu dijalankan, dan penambahan jadi sifar.
    const turn = (delta - lastDelta.current) * 1.6
    lastDelta.current = delta
    setAngle((current) => current + turn)

    const steps = Math.trunc(delta / STEP_PX)
    while (fired.current < steps) {
      onMove(screw.id, 'minus')
      fired.current += 1
    }
    while (fired.current > steps) {
      onMove(screw.id, 'plus')
      fired.current -= 1
    }
    onDragChange(screw.id, delta === 0 ? null : delta > 0 ? 'minus' : 'plus')
  }

  const end = () => {
    if (!dragging) return
    setDragging(false)
    setOffset(0)
    onDragChange(screw.id, null)
  }

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ '--screw-color': color } as CSSProperties}
    >
      {/* Bar hanya timbul semasa jari menyentuh knob */}
      {dragging ? (
        <svg
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          width={BAR_W}
          height={BAR_H}
          viewBox={`0 0 ${BAR_W} ${BAR_H}`}
          aria-hidden="true"
        >
          {/* Bentuk gelendong: penuh di tengah, mengecil ke kedua-dua hujung */}
          <path
            d={`M ${BAR_W / 2} 2
                C ${BAR_W - 3} ${BAR_H * 0.3}, ${BAR_W - 3} ${BAR_H * 0.7}, ${BAR_W / 2} ${BAR_H - 2}
                C 3 ${BAR_H * 0.7}, 3 ${BAR_H * 0.3}, ${BAR_W / 2} 2 Z`}
            fill={color}
            opacity="0.16"
            stroke={color}
            strokeOpacity="0.5"
            strokeWidth="1"
          />
          <line
            x1={BAR_W / 2}
            y1="8"
            x2={BAR_W / 2}
            y2={BAR_H - 8}
            stroke={color}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          {/* Penanda kedudukan jari */}
          <circle
            cx={BAR_W / 2}
            cy={BAR_H / 2 - offset}
            r="6"
            fill={color}
            stroke="#ffffff"
            strokeWidth="2"
          />
        </svg>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className={[
          'relative flex h-11 w-11 touch-none select-none items-center justify-center rounded-full border-2 bg-surface shadow-md',
          'transition-[transform,border-color] active:scale-95',
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
          dragging || isActive ? 'scale-105' : '',
        ].join(' ')}
        style={{ borderColor: color, color }}
        aria-label={`Skru ${screw.number}: seret ke atas untuk gerakkan beam ${screw.minusLabel}, ke bawah untuk ${screw.plusLabel}`}
      >
        {/*
          Alur keriting yang semuanya serupa dan berputar mengikut jari.
          Sengaja TIADA jarum atau tanda unik: skru mirror mount tidak
          mempunyai kedudukan sifar, dan satu penanda tetap akan menipu
          pelajar bahawa ada kedudukan asal. Kilauan di bawah kekal diam
          supaya alur kelihatan melintasinya — itu yang membaca sebagai
          putaran.
        */}
        <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
          <defs>
            <radialGradient id={`knob-dome-${screw.id}`} cx="38%" cy="32%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="70%" stopColor="#f4f7fa" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </radialGradient>
          </defs>
          {/* Gelang denyut, hanya semasa melahu */}
          {showHint ? (
            <circle
              cx="20"
              cy="20"
              r="15"
              fill="none"
              stroke={color}
              strokeWidth="2"
              className="knob-hint-ring"
            />
          ) : null}
          <g className={showHint ? 'knob-hint-turn' : undefined}>
          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '20px 20px' }}>
            {Array.from({ length: 12 }, (_, i) => (
              <line
                key={i}
                x1="20"
                y1="2"
                x2="20"
                y2="7"
                stroke={color}
                strokeWidth="2.6"
                strokeLinecap="round"
                opacity="0.7"
                transform={`rotate(${i * 30} 20 20)`}
              />
            ))}
          </g>
          </g>
          <circle
            cx="20"
            cy="20"
            r="13"
            fill={`url(#knob-dome-${screw.id})`}
            stroke={color}
            strokeWidth="1.6"
          />
          {/* Kilauan tetap — tidak berputar */}
          <ellipse cx="15.5" cy="14.5" rx="5" ry="3.4" fill="#ffffff" opacity="0.75" />
          <circle cx="20" cy="20" r="3" fill={color} opacity="0.85" />
        </svg>
        <span
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-white"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          {screw.number}
        </span>
      </button>

      {/* Petunjuk melahu: tangan mencubit, diletak di DEPAN knob. Di belakang
          ia terlindung dan tidak dapat dikenali. Pil dalam gambar asal telah
          dibuang, jadi celah antara hujung jari lut sinar dan knob menembusinya
          — jari kelihatan mencubit knob itu sendiri. */}
      {showHint ? (
        /* Pembalut bersaiz sifar duduk tepat di pusat knob. Kerana titik
           cubitan gambar dijajarkan ke titik yang sama, membalikkan pembalut
           ini memutar tangan mengelilingi titik cubitan — jadi cubitan kekal
           pada knob dan hanya arah tangan bertukar. */
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0"
          style={flipHint ? { transform: 'scaleX(-1)' } : undefined}
          aria-hidden="true"
        >
          <img
            src="images/pinch-hand.webp"
            alt=""
            width={480}
            height={320}
            className="knob-hint-hand absolute w-[104px] max-w-none select-none"
            style={{ animationDelay: `${hintDelay}s` }}
          />
        </span>
      ) : null}
    </div>
  )
}
