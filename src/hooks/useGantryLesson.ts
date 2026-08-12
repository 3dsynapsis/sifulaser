import { useCallback, useEffect, useState } from 'react'
import { clamp } from '../lib/sim'
import { GANTRY_X_MAX, GANTRY_Y_MAX } from '../components/gantry/GantryDiagram'
import type { Vec } from '../types'

export const GANTRY_JOG_STEP = 10
export const GANTRY_CENTRE_TARGET: Vec = { x: 60, y: 40 }

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

  const finished = stepIndex >= GANTRY_STEPS.length
  const step = finished ? null : GANTRY_STEPS[stepIndex]

  useEffect(() => {
    if (finished) return
    const current = GANTRY_STEPS[stepIndex]
    if (current.done?.(position)) {
      setStepIndex((index) => index + 1)
    }
  }, [position, stepIndex, finished])

  const jog = useCallback((dx: number, dy: number) => {
    setPosition((current) => ({
      x: clamp(current.x + dx * GANTRY_JOG_STEP, 0, GANTRY_X_MAX),
      y: clamp(current.y + dy * GANTRY_JOG_STEP, 0, GANTRY_Y_MAX),
    }))
  }, [])

  const advance = useCallback(() => {
    setStepIndex((index) => Math.min(index + 1, GANTRY_STEPS.length))
  }, [])

  const restart = useCallback(() => {
    setPosition({ x: 0, y: 0 })
    setStepIndex(0)
  }, [])

  return {
    position,
    stepIndex,
    step,
    steps: GANTRY_STEPS,
    finished,
    highlightM1M2: step?.id === 'goY90' || step?.id === 'backY0',
    targetPoint: step?.id === 'centre' ? GANTRY_CENTRE_TARGET : null,
    jog,
    advance,
    restart,
  }
}
