import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { Direction, ScrewConfig, ScrewId } from '../types'

/** Sudut putaran (darjah) untuk satu langkah pergerakan beam. */
const STEP_DEG = 24

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
 * Pegang kepala pin pada tuas dan pusingkan mengelilingi knob; kepala pin
 * mengikut jari.
 *
 * Seretan diukur mengikut SUDUT terhadap pusat knob, bukan jarak menegak.
 * Ukuran menegak nampak mudah tetapi ia bercanggah dengan gerakan membulat
 * yang diajak oleh tuas: apabila jari melalui bahagian atas atau bawah
 * lengkungan, gerakannya menjadi mendatar semata-mata, jarak menegak tidak
 * berubah, dan knob tersangkut.
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
  /** Putaran terkumpul, tanpa had — skru sebenar tiada hujung. */
  const [angle, setAngle] = useState(0)
  /**
   * Petunjuk melahu: hidup sebaik halaman dibuka, padam sebaik pengguna
   * menyentuh, dan hidup semula selepas seketika tidak digunakan.
   */
  const [hint, setHint] = useState(true)
  const idleTimer = useRef<number | undefined>(undefined)
  /** Pusat knob dalam koordinat tetingkap, dirakam semasa seretan bermula. */
  const centre = useRef({ x: 0, y: 0 })
  /** Sudut jari pada bingkai sebelumnya, untuk mengira penambahan. */
  const lastPointer = useRef(0)
  /** Jumlah putaran terkumpul sejak seretan bermula. */
  const turned = useRef(0)
  const fired = useRef(0)

  /** Sudut jari terhadap pusat knob, darjah, bertambah mengikut arah jam. */
  const pointerAngle = (x: number, y: number) =>
    (Math.atan2(y - centre.current.y, x - centre.current.x) * 180) / Math.PI

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
    const box = event.currentTarget.getBoundingClientRect()
    centre.current = {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    }
    lastPointer.current = pointerAngle(event.clientX, event.clientY)
    turned.current = 0
    fired.current = 0
    setDragging(true)
  }

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging || disabled) return

    const now = pointerAngle(event.clientX, event.clientY)
    // Normalkan ke (-180, 180] supaya lintasan sempadan ±180° tidak
    // ditafsirkan sebagai putaran hampir penuh ke arah bertentangan.
    let step = now - lastPointer.current
    while (step > 180) step -= 360
    while (step <= -180) step += 360
    lastPointer.current = now

    // Abaikan lonjakan besar; ia hanya berlaku bila jari terlalu hampir pusat
    // di mana sudut menjadi tidak stabil.
    if (Math.abs(step) > 90) return

    turned.current += step
    setAngle((current) => current + step)

    // Ikut jam menambah (plus), lawan jam menolak (minus) — sama seperti
    // butang pusing yang digantikan.
    const steps = Math.trunc(turned.current / STEP_DEG)
    while (fired.current < steps) {
      onMove(screw.id, 'plus')
      fired.current += 1
    }
    while (fired.current > steps) {
      onMove(screw.id, 'minus')
      fired.current -= 1
    }
    onDragChange(screw.id, step === 0 ? null : step > 0 ? 'plus' : 'minus')
  }

  const end = () => {
    if (!dragging) return
    setDragging(false)
    onDragChange(screw.id, null)
  }

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ '--screw-color': color } as CSSProperties}
    >
      {/*
        Butang meliputi knob DAN tuas. Kawasan sentuh sengaja jauh lebih besar
        daripada knob yang kelihatan: memusing knob 44px dengan ibu jari mudah
        tergelincir, dan kepala pin di hujung tuas memberi pemegang yang lebih
        jauh dari pusat — lebih stabil dan lebih mudah dikawal.
      */}
      <button
        type="button"
        disabled={disabled}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className={[
          'relative flex h-[88px] w-[88px] touch-none select-none items-center justify-center',
          'transition-transform active:scale-95',
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
          dragging || isActive ? 'scale-105' : '',
        ].join(' ')}
        style={{ color }}
        aria-label={`Skru ${screw.number}: pegang kepala pin dan seret ke atas untuk gerakkan beam ${screw.minusLabel}, ke bawah untuk ${screw.plusLabel}`}
      >
        <svg viewBox="0 0 80 80" className="h-full w-full" aria-hidden="true">
          <defs>
            <radialGradient id={`knob-dome-${screw.id}`} cx="38%" cy="32%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="70%" stopColor="#f4f7fa" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </radialGradient>
            <radialGradient id={`pin-glow-${screw.id}`}>
              <stop offset="0%" stopColor={color} stopOpacity="0.55" />
              <stop offset="60%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Landasan bulat semasa diseret — menunjukkan laluan yang perlu
              diikut jari, menggantikan bar menegak yang tidak lagi sesuai
              setelah seretan bertukar kepada gerakan membulat. */}
          {dragging ? (
            <circle
              cx="40"
              cy="40"
              r="32.5"
              fill="none"
              stroke={color}
              strokeWidth="7"
              strokeOpacity="0.16"
            />
          ) : null}

          {/* Gelang denyut, hanya semasa melahu */}
          {showHint ? (
            <circle
              cx="40"
              cy="40"
              r="21"
              fill="none"
              stroke={color}
              strokeWidth="2"
              className="knob-hint-ring"
            />
          ) : null}

          {/*
            Semua yang berputar berada dalam satu kumpulan: alur, tuas dan
            kepala pin. Jadi tuas mengikut knob tepat seperti diminta.

            Alur keriting semuanya serupa dan TIADA jarum unik — skru mirror
            mount tidak mempunyai kedudukan sifar. Tuas pula bukan penanda
            sudut mutlak; ia pemegang, sama seperti tuas pada skru sebenar.
          */}
          <g className={showHint ? 'knob-hint-turn' : undefined}>
            <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '40px 40px' }}>
              {Array.from({ length: 12 }, (_, i) => (
                <line
                  key={i}
                  x1="40"
                  y1="22"
                  x2="40"
                  y2="27"
                  stroke={color}
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  opacity="0.7"
                  transform={`rotate(${i * 30} 40 40)`}
                />
              ))}

              {/* Tuas dari pusat knob ke kepala pin */}
              <line
                x1="40"
                y1="40"
                x2="63"
                y2="17"
                stroke={color}
                strokeWidth="3.4"
                strokeLinecap="round"
              />
              {/* Kilauan kepala pin — memberitahu di mana nak pegang */}
              <circle
                cx="63"
                cy="17"
                r="11"
                fill={`url(#pin-glow-${screw.id})`}
                className={showHint ? 'pin-glow--pulse' : undefined}
              />
              <circle
                cx="63"
                cy="17"
                r="6"
                fill={color}
                stroke="#ffffff"
                strokeWidth="2.2"
              />
            </g>
          </g>

          <circle
            cx="40"
            cy="40"
            r="13"
            fill={`url(#knob-dome-${screw.id})`}
            stroke={color}
            strokeWidth="1.8"
          />
          {/* Kilauan tetap — tidak berputar, jadi alur kelihatan melintasinya */}
          <ellipse cx="35.5" cy="34.5" rx="5" ry="3.4" fill="#ffffff" opacity="0.75" />
          <circle cx="40" cy="40" r="3" fill={color} opacity="0.85" />

          {/* Nombor skru, dilekat pada knob bukan pada kotak butang */}
          <circle cx="26" cy="26" r="7" fill={color} stroke="#ffffff" strokeWidth="2" />
          <text
            x="26"
            y="29.2"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="9"
            fontWeight="700"
          >
            {screw.number}
          </text>
        </svg>
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
