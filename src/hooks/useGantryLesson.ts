import { useCallback, useEffect, useRef, useState } from 'react'
import { clamp } from '../lib/sim'
import { GANTRY_X_MAX, GANTRY_Y_MAX } from '../components/gantry/GantryDiagram'
import { useMediaQuery } from './useMediaQuery'
import type { Vec } from '../types'

export const GANTRY_JOG_STEP = 10
export const GANTRY_CENTRE_TARGET: Vec = { x: 60, y: 40 }

/**
 * Peringkat kilauan semasa Test Laser, mengikut urutan sebenar:
 * tiub menyala dahulu, kemudian beam keluar ke cermin 1, cermin 2, dan head.
 */
export type BeamPhase =
  | 'idle'
  | 'tube'
  | 'toM1'
  | 'm1m2'
  | 'm2head'
  | 'fire'

/** Maksimum titik dalam satu pusingan latihan. */
export const MAX_MARKS = 5

export interface PulseMark extends Vec {
  id: number
  /** Nombor titik yang dipapar pada rajah, 1 hingga MAX_MARKS. */
  index: number
  /** true selepas pelajar mengisi koordinat dengan betul. */
  solved: boolean
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

export const useGantryLesson = () => {
  const [position, setPosition] = useState<Vec>({ x: 0, y: 0 })
  const [stepIndex, setStepIndex] = useState(0)
  const [beamPhase, setBeamPhase] = useState<BeamPhase>('idle')
  const [marks, setMarks] = useState<PulseMark[]>([])
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
      setMarks((prev) => {
        // Tembakan melebihi had memulakan pusingan baharu secara automatik.
        const base = prev.length >= MAX_MARKS ? [] : prev
        return [
          ...base,
          {
            ...position,
            id: markId.current,
            index: base.length + 1,
            solved: false,
          },
        ]
      })
      setBeamPhase('idle')
      setBusy(false)
    }

    if (reduceMotion) {
      leaveMark()
      return
    }

    setBeamPhase('tube')
    later(() => setBeamPhase('toM1'), 340)
    later(() => setBeamPhase('m1m2'), 640)
    later(() => setBeamPhase('m2head'), 980)
    later(() => setBeamPhase('fire'), 1320)
    later(leaveMark, 1880)
  }, [busy, position, reduceMotion, later])

  /**
   * Semak koordinat yang diisi pelajar untuk satu titik.
   * Mengembalikan true jika kedua-dua nilai tepat.
   */
  const checkAnswer = useCallback(
    (id: number, guessX: number, guessY: number): boolean => {
      const mark = marks.find((item) => item.id === id)
      if (!mark) return false
      const correct = mark.x === guessX && mark.y === guessY
      if (correct) {
        setMarks((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, solved: true } : item,
          ),
        )
      }
      return correct
    },
    [marks],
  )

  /** Kosongkan semua titik dan mulakan pusingan baharu. */
  const resetMarks = useCallback(() => {
    clearTimers()
    setMarks([])
    setBeamPhase('idle')
    setBusy(false)
  }, [clearTimers])

  const advance = useCallback(() => {
    setStepIndex((index) => Math.min(index + 1, GANTRY_STEPS.length))
  }, [])

  const restart = useCallback(() => {
    clearTimers()
    setPosition({ x: 0, y: 0 })
    setStepIndex(0)
    setBeamPhase('idle')
    setMarks([])
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
    busy,
    jog,
    goOrigin,
    testLaser,
    checkAnswer,
    resetMarks,
    advance,
    restart,
  }
}
