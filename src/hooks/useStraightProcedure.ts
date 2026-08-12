import { useCallback, useRef, useState } from 'react'
import {
  STRAIGHT_PRESETS,
  STRAIGHT_VARIANT_X,
  STRAIGHT_VARIANT_Y,
} from '../lib/sim'
import type { Shot, StraightAxis, Vec } from '../types'

export const useStraightProcedure = (axis: StraightAxis = 'y') => {
  const variant = axis === 'x' ? STRAIGHT_VARIANT_X : STRAIGHT_VARIANT_Y
  const [stepIndex, setStepIndex] = useState(0)
  const [shots, setShots] = useState<Shot[]>([])
  const [machineValue, setMachineValue] = useState(variant.nearValue)
  const [reference, setReference] = useState<Vec>(STRAIGHT_PRESETS[0])
  const shotIdCounter = useRef(0)

  const step = variant.steps[stepIndex]
  const acrylicApplied = stepIndex > 0
  const canAdjust = step.id === 'align'

  const restart = useCallback(() => {
    setStepIndex(0)
    setShots([])
    setMachineValue(variant.nearValue)
    setReference(
      STRAIGHT_PRESETS[Math.floor(Math.random() * STRAIGHT_PRESETS.length)],
    )
  }, [variant.nearValue])

  const fire = useCallback((x: number, y: number) => {
    shotIdCounter.current += 1
    const id = shotIdCounter.current
    setShots((current) => {
      const next: Shot[] = [
        ...current,
        { id, x, y, isReference: false, order: current.length + 1 },
      ]
      if (next.length <= 8) return next
      const evictIndex = next.findIndex((shot) => !shot.isReference)
      return next.filter((_, index) => index !== evictIndex)
    })
  }, [])

  return {
    variant,
    stepIndex,
    step,
    steps: variant.steps,
    shots,
    machineValue,
    reference,
    acrylicApplied,
    canAdjust,
    performStep: useCallback(
      (screwOffset: Vec) => {
        switch (step.id) {
          case 'moveNear':
            setMachineValue(variant.nearValue)
            break
          case 'moveFar':
            setMachineValue(variant.farValue)
            break
          case 'fireNear':
            fire(reference.x, reference.y)
            break
          case 'mark':
            setShots((current) =>
              current.map((shot) => ({ ...shot, isReference: true })),
            )
            break
          case 'align':
            fire(reference.x + screwOffset.x, reference.y + screwOffset.y)
        }
        if (step.id !== 'align') {
          setStepIndex((index) =>
            Math.min(index + 1, variant.steps.length - 1),
          )
        }
      },
      [fire, reference, step.id, variant],
    ),
    restart,
  }
}
