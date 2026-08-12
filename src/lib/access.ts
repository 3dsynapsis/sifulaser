// Peraturan akses percuma vs berbayar.
//
// Percuma: Simulator Level 1 (Cermin), About Me & Kedai Laser.
// Berbayar: Level 2-5 simulator + semua panduan Maintenance.
//
// Dua pakej berbayar memberi akses digital yang sama; pakej Kelas menambah
// sesi latihan bersemuka.

import type { LevelId } from '../types'

export const FREE_LEVEL_IDS: LevelId[] = ['level1']

/** Pakej Akses Penuh (digital sahaja). */
export const PRICE_LABEL = 'RM200'
export const ORIGINAL_PRICE_LABEL = 'RM500'
export const SAVING_LABEL = 'Jimat RM300'

/** Pakej Kelas Training Fizikal + Akses Penuh. */
export const CLASS_PRICE_LABEL = 'RM275'
export const CLASS_ORIGINAL_PRICE_LABEL = 'RM700'
export const CLASS_SAVING_LABEL = 'Jimat RM425'

/** Tempoh sah Akses Penuh selepas pembayaran. */
export const ACCESS_PERIOD_LABEL = '2 tahun'
export const ACCESS_PERIOD_YEARS = 2

export const isLevelFree = (levelId: LevelId): boolean =>
  FREE_LEVEL_IDS.includes(levelId)

export const canAccessLevel = (levelId: LevelId, paid: boolean): boolean =>
  paid || isLevelFree(levelId)

// Semua panduan maintenance adalah kandungan berbayar.
export const canAccessMaintenance = (paid: boolean): boolean => paid
