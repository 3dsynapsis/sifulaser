import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ImageOff } from 'lucide-react'
import { ImageWithFallback } from './ImageWithFallback'
import { ScrewKnob } from './ScrewKnob'
import type { CentreLevelConfig, Direction, ScrewId } from '../types'

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

const overlayBase = 'absolute -translate-x-1/2 -translate-y-1/2'

interface ScrewAdjustPanelProps {
  level: CentreLevelConfig
  activeScrew: ScrewId | null
  activeDirection: Direction | null
  compact: boolean
  onMove: (screwId: ScrewId, direction: Direction) => void
  /** Dimaklumkan semasa knob diseret, supaya anak panah panduan boleh dipapar. */
  onDragChange: (screwId: ScrewId, direction: Direction | null) => void
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
  onDragChange,
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
            'Sentuh dan tahan knob skru, kemudian seret jari ke atas atau ke bawah. Anak panah pada sasaran menunjukkan arah beam bergerak.'}
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
              <ScrewKnob
                screw={level.screws[screwId]}
                isActive={activeScrew === screwId}
                onMove={onMove}
                onDragChange={onDragChange}
                disabled={disabled}
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
          {level.screwOrder.map((screwId, index) => {
            const screw = level.screws[screwId]
            const style: CSSProperties = { top: screw.pod.top }
            if (screw.pod.side === 'left') style.left = 0
            else style.right = 0
            return (
              <span
                key={screwId}
                className="absolute -translate-y-1/2"
                style={style}
              >
                <ScrewKnob
                  screw={screw}
                  isActive={activeScrew === screwId}
                  onMove={onMove}
                  onDragChange={onDragChange}
                  disabled={disabled}
                  flipHint={screw.pod.side === 'right'}
                  hintDelay={index * 1.133}
                />
              </span>
            )
          })}
        </div>
      )}
    </section>
  )
}
