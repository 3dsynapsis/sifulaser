import { DEFAULT_MOVEMENT_STEP, STORAGE_KEY } from './sim'
import { DEFAULT_LEVEL_ID } from '../levels'
import type { HeadVariantId, LevelId } from '../types'

export interface StoredSettings {
  movementStep: number
  showTrail: boolean
  animationsEnabled: boolean
  levelId: LevelId
  headVariant: HeadVariantId
}

const DEFAULT_SETTINGS: StoredSettings = {
  movementStep: DEFAULT_MOVEMENT_STEP,
  showTrail: true,
  animationsEnabled: true,
  levelId: DEFAULT_LEVEL_ID,
  headVariant: 'bodor',
}

const isHeadVariant = (value: unknown): value is HeadVariantId =>
  value === 'bodor' || value === 'xd'

const isValidStep = (value: unknown): value is number =>
  value === 0.25 || value === 0.5 || value === 1

// Hanya level yang selamat disambung semula selepas reload; level prosedur
// (beam lurus) sentiasa bermula dari langkah pertama.
const isRestorableLevel = (value: unknown): value is LevelId =>
  value === 'level1' || value === 'level2' || value === 'level3'

export const loadSettings = (): StoredSettings => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || !parsed) return DEFAULT_SETTINGS
    const value = parsed as Record<string, unknown>
    return {
      movementStep: isValidStep(value.movementStep)
        ? value.movementStep
        : DEFAULT_SETTINGS.movementStep,
      showTrail:
        typeof value.showTrail === 'boolean'
          ? value.showTrail
          : DEFAULT_SETTINGS.showTrail,
      animationsEnabled:
        typeof value.animationsEnabled === 'boolean'
          ? value.animationsEnabled
          : DEFAULT_SETTINGS.animationsEnabled,
      levelId: isRestorableLevel(value.levelId)
        ? value.levelId
        : DEFAULT_SETTINGS.levelId,
      headVariant: isHeadVariant(value.headVariant)
        ? value.headVariant
        : DEFAULT_SETTINGS.headVariant,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export const saveSettings = (settings: StoredSettings): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage tidak tersedia (mod privasi dll) — abaikan
  }
}
