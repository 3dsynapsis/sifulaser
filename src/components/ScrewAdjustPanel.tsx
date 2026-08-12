import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ImageOff,
  MoveDiagonal,
  MoveDiagonal2,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  RotateCw,
} from 'lucide-react'
import { ImageWithFallback } from './ImageWithFallback'
import type { CentreLevelConfig, Direction, ScrewAxis, ScrewConfig, ScrewId } from '../types'

const POD_LEFT = '-5%'
const POD_RIGHT = '105%'

const GuideLines = ({
  level,
  activeScrew,
}: {
  level: CentreLevelConfig
  activeScrew: ScrewId | null
}) => (
  <svg
    className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    aria-hidden="true"
    focusable="false"
  >
    {level.screwOrder.map((screwId) => {
      const screw = level.screws[screwId]
      const isActive = activeScrew === screwId
      return (
        <line
          key={screwId}
          x1={screw.knob.left}
          y1={screw.knob.top}
          x2={screw.pod.side === 'left' ? POD_LEFT : POD_RIGHT}
          y2={screw.pod.top}
          stroke={screw.colorVar}
          strokeWidth={isActive ? 2.5 : 1.5}
          strokeLinecap="round"
          strokeDasharray="4 3"
          opacity={isActive ? 0.95 : 0.5}
          className="overlay-item"
        />
      )
    })}
  </svg>
)

const AxisIcon = ({ axis, className }: { axis: ScrewAxis; className?: string }) =>
  axis === 'vertical' ? (
    <MoveVertical className={className} aria-hidden="true" />
  ) : axis === 'horizontal' ? (
    <MoveHorizontal className={className} aria-hidden="true" />
  ) : axis === 'diagonal-up' ? (
    <MoveDiagonal className={className} aria-hidden="true" />
  ) : (
    <MoveDiagonal2 className={className} aria-hidden="true" />
  )

interface ScrewControlProps {
  screw: ScrewConfig
  isActive: boolean
  activeDirection: Direction | null
  onMove: (screwId: ScrewId, direction: Direction) => void
  layout?: 'stacked' | 'inline'
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

export const ScrewControl = ({
  screw,
  isActive,
  activeDirection,
  onMove,
  layout = 'stacked',
  disabled = false,
  className,
  style,
}: ScrewControlProps) => {
  const color = screw.colorVar
  const buttonClass = [
    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-surface shadow-sm',
    'transition-[background-color,scale,border-color,opacity]',
    'hover:bg-[color-mix(in_srgb,var(--screw-color)_12%,#ffffff)] active:scale-95',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:active:scale-100',
    'sm:h-11 sm:w-11',
  ].join(' ')
  return (
    <div
      className={[
        'flex items-center',
        layout === 'stacked' ? 'flex-col gap-1' : 'flex-row gap-2',
        className ?? '',
      ].join(' ')}
      style={{ '--screw-color': color, ...style } as CSSProperties}
    >
      <span
        className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-bold text-white shadow-sm ring-2 ring-white"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        {screw.number}
        <AxisIcon axis={screw.axis} className="h-3 w-3" />
      </span>
      <button
        type="button"
        onClick={() => onMove(screw.id, 'minus')}
        disabled={disabled}
        className={`${buttonClass} ${isActive && activeDirection === 'minus' ? 'scale-95' : ''}`}
        style={{ color, borderColor: isActive ? color : 'var(--color-line)' }}
        aria-label={`Pusing Skru ${screw.number} lawan jam untuk gerakkan beam ${screw.minusLabel}`}
      >
        <RotateCcw className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onMove(screw.id, 'plus')}
        disabled={disabled}
        className={`${buttonClass} ${isActive && activeDirection === 'plus' ? 'scale-95' : ''}`}
        style={{ color, borderColor: isActive ? color : 'var(--color-line)' }}
        aria-label={`Pusing Skru ${screw.number} ikut jam untuk gerakkan beam ${screw.plusLabel}`}
      >
        <RotateCw className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}

const overlayBase = 'absolute -translate-x-1/2 -translate-y-1/2'

interface ScrewAdjustPanelProps {
  level: CentreLevelConfig
  activeScrew: ScrewId | null
  activeDirection: Direction | null
  compact: boolean
  onMove: (screwId: ScrewId, direction: Direction) => void
  disabled?: boolean
  hint?: string
  className?: string
}

export const ScrewAdjustPanel = ({
  level,
  activeScrew,
  activeDirection,
  compact,
  onMove,
  disabled = false,
  hint,
  className,
}: ScrewAdjustPanelProps) => {
  const [imageFailed, setImageFailed] = useState(false)
  const fallback = (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-canvas p-4 text-center">
      <ImageOff className="h-8 w-8 text-muted" aria-hidden="true" />
      <p className="text-sm font-medium text-ink">
        Gambar cermin tidak dapat dimuatkan
      </p>
      <p className="text-xs text-muted">
        Gunakan kawalan di bawah untuk melaraskan beam.
      </p>
    </div>
  )
  return (
    <section
      className={`card flex flex-col gap-3 p-2 sm:p-5 ${className ?? ''}`}
      aria-labelledby="screw-adjust-heading"
    >
      <div>
        <h2
          id="screw-adjust-heading"
          className="text-base font-bold text-ink sm:text-lg"
        >
          Laras Skru
        </h2>
        <p className="mt-0.5 text-xs text-muted sm:text-sm">
          {hint ??
            'Tekan butang di sebelah setiap skru untuk menggerakkan beam ke tengah sasaran.'}
        </p>
      </div>
      {imageFailed ? (
        <div className="flex flex-col gap-3">
          {fallback}
          {level.screwOrder.map((screwId) => (
            <div
              key={screwId}
              className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"
            >
              <span className="text-sm font-semibold text-ink">
                {level.screws[screwId].title}
              </span>
              <ScrewControl
                screw={level.screws[screwId]}
                isActive={activeScrew === screwId}
                activeDirection={activeScrew === screwId ? activeDirection : null}
                onMove={onMove}
                disabled={disabled}
                layout="inline"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={`relative mx-auto w-full py-1 ${level.adjustStageClass}`}>
          <ImageWithFallback
            image={level.image}
            fallback={null}
            onImageFailedChange={setImageFailed}
          >
            <GuideLines level={level} activeScrew={activeScrew} />
            {level.screwOrder.map((screwId) => {
              const screw = level.screws[screwId]
              const isActive = activeScrew === screwId
              return (
                <span key={screwId}>
                  <span
                    aria-hidden="true"
                    className={[
                      overlayBase,
                      'knob-ring rounded-full border-[3px] border-dashed',
                      compact ? 'h-9 w-9' : 'h-11 w-11',
                      isActive ? 'opacity-100' : 'opacity-0',
                      isActive && activeDirection === 'minus' ? '-rotate-8' : '',
                      isActive && activeDirection === 'plus' ? 'rotate-8' : '',
                    ].join(' ')}
                    style={{
                      top: screw.knob.top,
                      left: screw.knob.left,
                      borderColor: screw.colorVar,
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className={[
                      overlayBase,
                      'overlay-item z-10 flex items-center justify-center rounded-full font-bold text-white shadow-md ring-2 ring-white',
                      compact ? 'h-6 w-6 text-xs' : 'h-7 w-7 text-sm',
                      isActive ? 'scale-115' : 'scale-100',
                    ].join(' ')}
                    style={{
                      top: screw.badge.top,
                      left: screw.badge.left,
                      backgroundColor: screw.colorVar,
                    }}
                  >
                    {screw.number}
                  </span>
                </span>
              )
            })}
          </ImageWithFallback>
          {level.screwOrder.map((screwId) => {
            const screw = level.screws[screwId]
            const style: CSSProperties = { top: screw.pod.top }
            if (screw.pod.side === 'left') style.left = 0
            else style.right = 0
            return (
              <ScrewControl
                key={screwId}
                screw={screw}
                isActive={activeScrew === screwId}
                activeDirection={activeScrew === screwId ? activeDirection : null}
                onMove={onMove}
                disabled={disabled}
                className="absolute -translate-y-1/2"
                style={style}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
