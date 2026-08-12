// Peraturan akses percuma vs berbayar.
//
// Percuma: Simulator Level 1 (Cermin), Kedai Laser, About Me.
// Berbayar: Level 2-5 simulator + semua panduan Maintenance.

import type { LevelId } from '../types'

export const FREE_LEVEL_IDS: LevelId[] = ['level1']

export const PRICE_LABEL = 'RM250'

export const isLevelFree = (levelId: LevelId): boolean =>
  FREE_LEVEL_IDS.includes(levelId)

export const canAccessLevel = (levelId: LevelId, paid: boolean): boolean =>
  paid || isLevelFree(levelId)

// Semua panduan maintenance adalah kandungan berbayar.
export const canAccessMaintenance = (paid: boolean): boolean => paid
