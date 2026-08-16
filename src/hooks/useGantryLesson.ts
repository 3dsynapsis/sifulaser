import { useCallback, useEffect, useRef, useState } from 'react'
import { clamp } from '../lib/sim'
import { GANTRY_X_MAX, GANTRY_Y_MAX } from '../components/gantry/GantryDiagram'
import { useMediaQuery } from './useMediaQuery'
import type { Vec } from '../types'

export const GANTRY_JOG_STEP = 10
export const GANTRY_CENTRE_TARGET: Vec = { x: 60, y: 40 }

/** Segi empat contoh di tengah katil, digunakan oleh butang Run. */
export const CUT_RECT: Vec[] = [
  { x: 40, y: 25 },
  { x: 90, y: 25 },
  { x: 90, y: 65 },
  { x: 40, y: 65 },
  { x: 40, y: 25 },
]

/** Peringkat kilauan beam semasa Test Laser. */
export type BeamPhase = 'idle' | 'tube' | 'm1m2' | 'm2head' | 'fire'

export interface PulseMark extends Vec {
  id: number
}

export interface GantryStep {
  id: 'home' | 'goY90' | 'backY0' | 'centre'
  label: string
  action?: string
  hint: string
  done?: (pos: Vec) => boolean
}

export const GANTRY_STEPS: GantryStep[] = [
  {
    id: 'home',
    label: 'Perhatikan kedudukan asal mesin (0,0)',
    action: 'Faham, Teruskan',
    hint: 'Titik 0,0 berada di penjuru belakang kiri — itulah "home" mesin. Paksi X bertambah ke kanan, paksi Y bertambah ke arah depan mesin (ke bawah pada rajah).',
  },
  {
    id: 'goY90',
    label: 'Gerak gantry ke Y = 90',
    hint: 'Tekan butang anak panah bawah sehingga Y = 90. Gantry bergerak ke depan mesin — perhatikan jarak cermin 1 ke cermin 2 semakin jauh.',
    done: (pos) => pos.y === GANTRY_Y_MAX,
  },
  {
    id: 'backY0',
    label: 'Kembali ke Y = 0',
    hint: 'Tekan butang anak panah atas sehingga Y = 0. Gantry kembali ke belakang — jarak cermin 1 ke cermin 2 kini paling dekat.',
    done: (pos) => pos.y === 0,
  },
  {
    id: 'centre',
    label: 'Gerak head ke tengah katil (X = 60, Y = 40)',
    hint: 'Gunakan keempat-empat anak panah untuk meletakkan head pada sasaran biru di tengah katil.',
    done: (pos) =>
      pos.x === GANTRY_CENTRE_TARGET.x && pos.y === GANTRY_CENTRE_TARGET.y,
  },
]

/** Jarak setiap bingkai animasi, dalam unit mesin. */
const TRAVEL_STEP = 2.5
const FRAME_MS = 24

export const useGantryLesson = () => {
  const [position, setPosition] = useState<Vec>({ x: 0, y: 0 })
  const [stepIndex, setStepIndex] = useState(0)
  const [beamPhase, setBeamPhase] = useState<BeamPhase>('idle')
  const [marks, setMarks] = useState<PulseMark[]>([])
  /** Titik yang sudah dipotong dalam larian semasa. */
  const [cutPath, setCutPath] = useState<Vec[]>([])
  const [busy, setBusy] = useState(false)

  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const timers = useRef<number[]>([])
  const markId = useRef(0)

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const finished = stepIndex >= GANTRY_STEPS.length
  const step = finished ? null : GANTRY_STEPS[stepIndex]

  useEffect(() => {
    if (finished) return
    const current = GANTRY_STEPS[stepIndex]
    if (current.done?.(position)) {
      setStepIndex((index) => index + 1)
    }
  }, [position, stepIndex, finished])

  const jog = useCallback(
    (dx: number, dy: number) => {
      if (busy) return
      setPosition((current) => ({
        x: clamp(current.x + dx * GANTRY_JOG_STEP, 0, GANTRY_X_MAX),
        y: clamp(current.y + dy * GANTRY_JOG_STEP, 0, GANTRY_Y_MAX),
      }))
    },
    [busy],
  )

  /** Hantar head ke titik asal mesin. */
  const goOrigin = useCallback(() => {
    if (busy) return
    setPosition({ x: 0, y: 0 })
  }, [busy])

  /**
   * Acah tembakan laser: kilauan bergerak dari tiub ke cermin 1, cermin 2,
   * kemudian cermin 3 di head — dan meninggalkan tanda pada koordinat itu.
   */
  const testLaser = useCallback(() => {
    if (busy) return
    setBusy(true)

    const leaveMark = () => {
      markId.current += 1
      setMarks((prev) => [
        ...prev.slice(-5),
        { ...position, id: markId.current },
      ])
      setBeamPhase('idle')
      setBusy(false)
    }

    if (reduceMotion) {
      leaveMark()
      return
    }

    setBeamPhase('tube')
    later(() => setBeamPhase('m1m2'), 320)
    later(() => setBeamPhase('m2head'), 700)
    later(() => setBeamPhase('fire'), 1080)
    later(leaveMark, 1650)
  }, [busy, position, reduceMotion, later])

  /** Gerakkan head mengikut senarai titik, menjejak laluan potongan. */
  const travel = useCallback(
    (route: Vec[], onDone: () => void) => {
      let leg = 0
      let from = route[0]

      const walk = () => {
        if (leg >= route.length - 1) {
          onDone()
          return
        }
        const to = route[leg + 1]
        const dx = to.x - from.x
        const dy = to.y - from.y
        const span = Math.hypot(dx, dy)
        const frames = Math.max(1, Math.ceil(span / TRAVEL_STEP))
        let frame = 0

        const tick = () => {
          frame += 1
          const ratio = frame / frames
          const next = {
            x: Math.round((from.x + dx * ratio) * 10) / 10,
            y: Math.round((from.y + dy * ratio) * 10) / 10,
          }
          setPosition(next)
          setCutPath((prev) => [...prev, next])
          if (frame < frames) {
            later(tick, FRAME_MS)
          } else {
            from = to
            leg += 1
            later(walk, FRAME_MS)
          }
        }
        later(tick, FRAME_MS)
      }

      walk()
    },
    [later],
  )

  /** Simulasi memotong segi empat di tengah katil. */
  const run = useCallback(() => {
    if (busy) return
    setBusy(true)
    setCutPath([])

    if (reduceMotion) {
      setCutPath(CUT_RECT)
      setPosition(CUT_RECT[0])
      setBusy(false)
      return
    }

    // Gerak laju ke sudut mula tanpa memotong, kemudian potong keliling.
    setPosition(CUT_RECT[0])
    later(() => {
      setBeamPhase('fire')
      travel(CUT_RECT, () => {
        setBeamPhase('idle')
        // Pulang ke home seperti mesin sebenar — sekali gus membolehkan
        // hasil potongan dilihat penuh tanpa dilindung bar gantry.
        later(() => {
          setPosition({ x: 0, y: 0 })
          setBusy(false)
        }, 320)
      })
    }, 260)
  }, [busy, reduceMotion, later, travel])

  const advance = useCallback(() => {
    setStepIndex((index) => Math.min(index + 1, GANTRY_STEPS.length))
  }, [])

  const restart = useCallback(() => {
    clearTimers()
    setPosition({ x: 0, y: 0 })
    setStepIndex(0)
    setBeamPhase('idle')
    setMarks([])
    setCutPath([])
    setBusy(false)
  }, [clearTimers])

  return {
    position,
    stepIndex,
    step,
    steps: GANTRY_STEPS,
    finished,
    highlightM1M2: step?.id === 'goY90' || step?.id === 'backY0',
    targetPoint: step?.id === 'centre' ? GANTRY_CENTRE_TARGET : null,
    beamPhase,
    marks,
    cutPath,
    busy,
    jog,
    goOrigin,
    testLaser,
    run,
    advance,
    restart,
  }
}
