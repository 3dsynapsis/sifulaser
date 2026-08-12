export interface Vec {
  x: number
  y: number
}

export type AlignmentStatus = 'aligned' | 'near' | 'unaligned'

export type LevelId = 'level1' | 'level2' | 'level3' | 'level4' | 'level5'
export type LevelKind = 'centre' | 'straight' | 'gantry'

export type ScrewId = 'screw1' | 'screw2' | 'screw3'
// 'diagonal' = kiri-atas ↔ kanan-bawah; 'diagonal-up' = kiri-bawah ↔ kanan-atas
export type ScrewAxis = 'vertical' | 'horizontal' | 'diagonal' | 'diagonal-up'
export type HeadVariantId = 'bodor' | 'xd'
export type Direction = 'minus' | 'plus'

export interface OverlayPos {
  top: string
  left: string
}

export interface ScrewMovement extends Vec {
  description: string
}

export interface ScrewConfig {
  id: ScrewId
  number: number
  title: string
  extraTitle?: string
  description: string
  colorVar: string
  axis: ScrewAxis
  minusLabel: string
  plusLabel: string
  movement: { minus: ScrewMovement; plus: ScrewMovement }
  knob: OverlayPos
  badge: OverlayPos
  refBadge: OverlayPos
  refArrow: OverlayPos
  pod: { side: 'left' | 'right'; top: string }
  guide: string
}

export interface LevelImage {
  path: string
  width: number
  height: number
  alt: string
}

interface LevelBase {
  id: LevelId
  number: number
  kind: LevelKind
  shortName: string
  tabLabel: string
  targetHeading: string
  statusLabels: Record<AlignmentStatus, string>
  successMessage: string
}

export type StraightAxis = 'x' | 'y'

// Level dengan skru pelarasan (Level 1/2 'centre' dan Beam Lurus 'straight')
export interface CentreLevelConfig extends LevelBase {
  kind: 'centre' | 'straight'
  // Untuk kind 'straight': paksi yang diuji (y = rel kiri, x = sepanjang gantry)
  straightAxis?: StraightAxis
  refHeading: string
  image: LevelImage
  refImageClass: string
  adjustStageClass: string
  screwOrder: ScrewId[]
  screws: Record<ScrewId, ScrewConfig>
}

// Level latihan pergerakan gantry — tiada skru/imej
export interface GantryLevelConfig extends LevelBase {
  kind: 'gantry'
}

export type LevelConfig = CentreLevelConfig | GantryLevelConfig

export interface TrailPoint extends Vec {
  id: number
}

export interface Shot {
  id: number
  x: number
  y: number
  isReference: boolean
  order: number
}

export interface StraightStep {
  id: 'acrylic' | 'moveNear' | 'fireNear' | 'mark' | 'moveFar' | 'align'
  label: string
  action: string
  hint: string
}
