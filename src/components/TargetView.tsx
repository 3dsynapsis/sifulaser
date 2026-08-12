import type { AlignmentStatus, TrailPoint, Vec } from '../types'

// Paparan sasaran ±5 mm dipetakan ke viewBox 100 unit; +Y ke atas skrin
const FIELD_SIZE = 10
const targetPoint = (v: Vec) => ({
  sx: ((v.x - -5) / FIELD_SIZE) * 100,
  sy: ((5 - v.y) / FIELD_SIZE) * 100,
})
const GRID_LINES = Array.from({ length: 19 }, (_, index) => (index + 1) * 5)

interface TargetViewProps {
  position: Vec
  history: TrailPoint[]
  showTrail: boolean
  alignmentStatus: AlignmentStatus
  motionEnabled: boolean
  className?: string
}

export const TargetView = ({
  position,
  history,
  showTrail,
  alignmentStatus,
  motionEnabled,
  className,
}: TargetViewProps) => {
  const { sx, sy } = targetPoint(position)
  const isAligned = alignmentStatus === 'aligned'
  const beamColor = isAligned ? 'var(--color-aligned)' : 'var(--color-beam)'
  const glowId = isAligned ? 'beam-glow-aligned' : 'beam-glow-default'
  const trail = showTrail ? history : []
  return (
    <div className={`w-full ${className ?? ''}`}>
      <div className="aspect-square w-full rounded-xl border border-line bg-white p-1.5 sm:p-2">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full"
          role="img"
          aria-label={`Kawasan sasaran beam. Beam berada pada X ${position.x.toFixed(1)} dan Y ${position.y.toFixed(1)}.`}
        >
          <defs>
            <marker
              id="axis-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 Z" fill="#9aa5b4" />
            </marker>
            <marker
              id="axis-arrow-soft"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 Z" fill="#bcc6d3" />
            </marker>
            <radialGradient id="beam-glow-default">
              <stop offset="0%" stopColor="var(--color-beam)" stopOpacity="0.55" />
              <stop offset="60%" stopColor="var(--color-beam)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-beam)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="beam-glow-aligned">
              <stop
                offset="0%"
                stopColor="var(--color-aligned)"
                stopOpacity="0.55"
              />
              <stop
                offset="60%"
                stopColor="var(--color-aligned)"
                stopOpacity="0.18"
              />
              <stop
                offset="100%"
                stopColor="var(--color-aligned)"
                stopOpacity="0"
              />
            </radialGradient>
          </defs>
          <g stroke="#eef2f7" strokeWidth="0.35">
            {GRID_LINES.map((line) => (
              <line key={`v-${line}`} x1={line} y1="2" x2={line} y2="98" />
            ))}
            {GRID_LINES.map((line) => (
              <line key={`h-${line}`} x1="2" y1={line} x2="98" y2={line} />
            ))}
          </g>
          <g
            stroke="#c7d0dc"
            strokeWidth="0.5"
            strokeDasharray="2.5 2.5"
            markerStart="url(#axis-arrow-soft)"
            markerEnd="url(#axis-arrow-soft)"
          >
            <line x1="14" y1="14" x2="86" y2="86" />
            <line x1="86" y1="14" x2="14" y2="86" />
          </g>
          <g
            stroke="#9aa5b4"
            strokeWidth="0.7"
            markerStart="url(#axis-arrow)"
            markerEnd="url(#axis-arrow)"
          >
            <line x1="50" y1="5" x2="50" y2="95" />
            <line x1="5" y1="50" x2="95" y2="50" />
          </g>
          <g stroke="#5f6b7a" strokeWidth="0.7" fill="none">
            <circle cx="50" cy="50" r="3.4" />
          </g>
          <g stroke="#5f6b7a" strokeWidth="0.6">
            <line x1="50" y1="45.5" x2="50" y2="54.5" />
            <line x1="45.5" y1="50" x2="54.5" y2="50" />
          </g>
          <g>
            {trail.map((point, index) => {
              const mapped = targetPoint(point)
              const opacity = 0.08 + ((index + 1) / trail.length) * 0.3
              return (
                <circle
                  key={point.id}
                  cx={mapped.sx}
                  cy={mapped.sy}
                  r="1.7"
                  fill="var(--color-beam)"
                  opacity={opacity}
                />
              )
            })}
          </g>
          <g
            className={`beam-node${motionEnabled ? '' : ' beam-node--static'}`}
            style={{ transform: `translate(${sx}px, ${sy}px)` }}
          >
            <circle
              r="6"
              fill={`url(#${glowId})`}
              className={isAligned && motionEnabled ? 'beam-glow--pulse' : undefined}
            />
            <circle r="2.6" fill={beamColor} />
            <circle cx="-0.7" cy="-0.8" r="0.9" fill="#ffffff" opacity="0.6" />
          </g>
        </svg>
      </div>
    </div>
  )
}
