import { useRef, useState } from 'react'
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
}: ScrewKnobProps) => {
  const [dragging, setDragging] = useState(false)
  const [offset, setOffset] = useState(0)
  const startY = useRef(0)
  const fired = useRef(0)

  const color = screw.colorVar

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    startY.current = event.clientY
    fired.current = 0
    setOffset(0)
    setDragging(true)
  }

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging || disabled) return
    // Positif bermakna jari bergerak ke atas.
    const delta = startY.current - event.clientY
    setOffset(Math.max(-BAR_H / 2, Math.min(BAR_H / 2, delta)))

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
        {/* Alur knob, meniru rupa kepala skru */}
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="1.4" opacity="0.4" />
          {[0, 45, 90, 135].map((angle) => (
            <line
              key={angle}
              x1="12"
              y1="4.5"
              x2="12"
              y2="7"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
              transform={`rotate(${angle} 12 12)`}
            />
          ))}
          <circle cx="12" cy="12" r="3.4" fill={color} />
        </svg>
        <span
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-white"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          {screw.number}
        </span>
      </button>
    </div>
  )
}
