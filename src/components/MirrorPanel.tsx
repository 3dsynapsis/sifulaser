import { ImageOff, Info, Lightbulb } from 'lucide-react'
import { ImageWithFallback } from './ImageWithFallback'
import { SCREW_ORDER } from '../levels'
import type { CentreLevelConfig, Direction, ScrewAxis, ScrewConfig, ScrewId } from '../types'

const QuickGuide = ({
  level,
  className,
}: {
  level: CentreLevelConfig
  className?: string
}) => (
  <div
    className={`rounded-xl border border-line bg-canvas/60 p-3 sm:p-4 ${className ?? ''}`}
  >
    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
      <Lightbulb className="h-4 w-4 text-near" aria-hidden="true" />
      Panduan Ringkas
    </h3>
    <ul className="space-y-1.5">
      {SCREW_ORDER.map((screwId) => {
        const screw = level.screws[screwId]
        return (
          <li
            key={screwId}
            className="flex items-start gap-2 text-xs text-muted sm:text-sm"
          >
            <span
              className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: screw.colorVar }}
              aria-hidden="true"
            >
              {screw.number}
            </span>
            <span>{screw.guide}</span>
          </li>
        )
      })}
    </ul>
  </div>
)

const VerticalArrow = ({
  color,
  className,
}: {
  color: string
  className?: string
}) => (
  <svg viewBox="0 0 20 60" className={className} aria-hidden="true" focusable="false">
    <path d="M10 13 V47" stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    <polygon points="10,3 4.5,15 15.5,15" fill={color} />
    <polygon points="10,57 4.5,45 15.5,45" fill={color} />
  </svg>
)

const HorizontalArrow = ({
  color,
  className,
}: {
  color: string
  className?: string
}) => (
  <svg viewBox="0 0 60 20" className={className} aria-hidden="true" focusable="false">
    <path d="M13 10 H47" stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    <polygon points="3,10 15,4.5 15,15.5" fill={color} />
    <polygon points="57,10 45,4.5 45,15.5" fill={color} />
  </svg>
)

const DiagonalArrow = ({
  color,
  className,
}: {
  color: string
  className?: string
}) => (
  <svg viewBox="0 0 56 56" className={className} aria-hidden="true" focusable="false">
    <path d="M16 16 L40 40" stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    <polygon points="5,5 6,20 20,6" fill={color} />
    <polygon points="51,51 50,36 36,50" fill={color} />
  </svg>
)

// Diagonal kiri-bawah ↔ kanan-atas (cermin kepada DiagonalArrow)
const DiagonalUpArrow = ({
  color,
  className,
}: {
  color: string
  className?: string
}) => (
  <svg viewBox="0 0 56 56" className={className} aria-hidden="true" focusable="false">
    <g transform="scale(-1 1) translate(-56 0)">
      <path d="M16 16 L40 40" stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <polygon points="5,5 6,20 20,6" fill={color} />
      <polygon points="51,51 50,36 36,50" fill={color} />
    </g>
  </svg>
)

const ARROW_SIZE_CLASSES: Record<ScrewAxis, string> = {
  vertical: 'h-14 w-5 sm:h-16 sm:w-6',
  diagonal: 'h-12 w-12 sm:h-14 sm:w-14',
  'diagonal-up': 'h-12 w-12 sm:h-14 sm:w-14',
  horizontal: 'h-5 w-14 sm:h-6 sm:w-16',
}

const renderAxisArrow = (axis: ScrewAxis, color: string, className: string) =>
  axis === 'vertical' ? (
    <VerticalArrow color={color} className={className} />
  ) : axis === 'horizontal' ? (
    <HorizontalArrow color={color} className={className} />
  ) : axis === 'diagonal-up' ? (
    <DiagonalUpArrow color={color} className={className} />
  ) : (
    <DiagonalArrow color={color} className={className} />
  )

const overlayBase = 'absolute -translate-x-1/2 -translate-y-1/2'

const ScrewOverlay = ({
  screw,
  isActive,
  direction,
  compact,
}: {
  screw: ScrewConfig
  isActive: boolean
  direction: Direction | null
  compact: boolean
}) => {
  const color = screw.colorVar
  return (
    <>
      <span
        aria-hidden="true"
        className={[
          overlayBase,
          'knob-ring rounded-full border-[3px] border-dashed',
          compact ? 'h-9 w-9' : 'h-11 w-11',
          isActive ? 'opacity-100' : 'opacity-0',
          direction === 'minus' ? '-rotate-8' : direction === 'plus' ? 'rotate-8' : '',
        ].join(' ')}
        style={{ top: screw.knob.top, left: screw.knob.left, borderColor: color }}
      />
      <span
        aria-hidden="true"
        className={[
          overlayBase,
          'overlay-item z-10 flex items-center justify-center rounded-full font-bold text-white shadow-md ring-2 ring-white',
          compact ? 'h-7 w-7 text-xs' : 'h-8 w-8 text-sm',
          isActive ? 'scale-115' : 'scale-100',
        ].join(' ')}
        style={{
          top: screw.refBadge.top,
          left: screw.refBadge.left,
          backgroundColor: color,
        }}
      >
        {screw.number}
      </span>
      <span
        aria-hidden="true"
        className={[
          overlayBase,
          'overlay-item',
          isActive ? 'scale-110 opacity-100' : 'scale-100 opacity-80',
        ].join(' ')}
        style={{ top: screw.refArrow.top, left: screw.refArrow.left }}
      >
        {renderAxisArrow(screw.axis, color, ARROW_SIZE_CLASSES[screw.axis])}
      </span>
    </>
  )
}

const imageFallback = (
  <div className="flex w-full max-w-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-canvas p-6 text-center sm:max-w-[300px]">
    <ImageOff className="h-8 w-8 text-muted" aria-hidden="true" />
    <p className="text-sm font-medium text-ink">
      Gambar cermin tidak dapat dimuatkan
    </p>
    <p className="text-xs text-muted">Rujuk nombor skru pada panel Laras Skru.</p>
  </div>
)

interface MirrorPanelProps {
  level: CentreLevelConfig
  activeScrew: ScrewId | null
  activeDirection: Direction | null
  compact: boolean
  onInfo: () => void
  className?: string
}

export const MirrorPanel = ({
  level,
  activeScrew,
  activeDirection,
  compact,
  onInfo,
  className,
}: MirrorPanelProps) => (
  <section
    className={`card flex flex-col gap-4 p-4 sm:p-5 ${className ?? ''}`}
    aria-labelledby="mirror-mount-heading"
  >
    <div className="flex items-start justify-between gap-3">
      <h2
        id="mirror-mount-heading"
        className="text-base font-bold text-ink sm:text-lg"
      >
        {level.refHeading}
      </h2>
      <button
        type="button"
        onClick={onInfo}
        className="-m-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink"
        aria-label="Maklumat lanjut mengenai skru pelarasan"
      >
        <Info className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
      <div className="flex justify-center px-9 py-2 sm:px-14 lg:shrink-0 lg:px-10">
        <ImageWithFallback
          image={level.image}
          className={level.refImageClass}
          fallback={imageFallback}
        >
          {level.screwOrder.map((screwId) => (
            <ScrewOverlay
              key={screwId}
              screw={level.screws[screwId]}
              isActive={activeScrew === screwId}
              direction={activeScrew === screwId ? activeDirection : null}
              compact={compact}
            />
          ))}
        </ImageWithFallback>
      </div>
      <QuickGuide level={level} className="lg:flex-1" />
    </div>
  </section>
)
