import type { Shot, Vec } from '../types'

// Paparan acrylic 20 mm; 5 unit SVG per mm, pusat pada (50, 50)
export const ACRYLIC_SCALE = 100 / 20
export const acrylicPoint = (v: Vec) => ({
  cx: 50 + v.x * ACRYLIC_SCALE,
  cy: 50 - v.y * ACRYLIC_SCALE,
})
// Kesan tembakan berdiameter 4 mm
export const BURN_RADIUS = (4 / 2) * ACRYLIC_SCALE
const REFERENCE_COLOR = '#6d28d9'

interface AcrylicViewProps {
  shots: Shot[]
  reference: Vec
  acrylicApplied: boolean
  machineAxisLabel: string
  machineValue: number
  motionEnabled: boolean
  className?: string
}

export const AcrylicView = ({
  shots,
  reference,
  acrylicApplied,
  machineAxisLabel,
  machineValue,
  motionEnabled,
  className,
}: AcrylicViewProps) => {
  const latest = shots.length > 0 ? shots[shots.length - 1] : null
  const referenceShot = shots.find((shot) => shot.isReference) ?? null
  const showSeparation =
    referenceShot !== null && latest !== null && latest.id !== referenceShot.id
  return (
    <div className={`w-full ${className ?? ''}`}>
      <div className="aspect-square w-full rounded-xl border border-line bg-white p-1.5 sm:p-2">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full"
          role="img"
          aria-label={`Acrylic. ${shots.length} kesan tembakan. Mesin di ${machineAxisLabel} sama dengan ${machineValue}.`}
        >
          <defs>
            <radialGradient id="burn-glow">
              <stop offset="0%" stopColor="var(--color-beam)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--color-beam)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle
            cx="50"
            cy="50"
            r="49"
            fill="#f7f9fc"
            stroke="#c7d0dc"
            strokeWidth="0.8"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#eef2f7"
            strokeWidth="0.6"
          />
          {acrylicApplied ? (
            <>
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="#e8f0fb"
                fillOpacity="0.55"
                stroke="#bcd2ee"
                strokeWidth="0.8"
                strokeDasharray="3 2"
              />
              <text
                x="50"
                y="8"
                textAnchor="middle"
                fill="#7b8798"
                fontSize="4.2"
              >
                acrylic
              </text>
            </>
          ) : (
            <text x="50" y="52" textAnchor="middle" fill="#9aa5b4" fontSize="5">
              Tampal acrylic dahulu
            </text>
          )}
          {showSeparation ? (
            <line
              x1={acrylicPoint(referenceShot).cx}
              y1={acrylicPoint(referenceShot).cy}
              x2={acrylicPoint(latest).cx}
              y2={acrylicPoint(latest).cy}
              stroke="#e39a18"
              strokeWidth="0.9"
              strokeDasharray="2.5 2"
            />
          ) : null}
          {shots.map((shot) => {
            const { cx, cy } = acrylicPoint(shot)
            const isLatest = latest !== null && shot.id === latest.id
            return shot.isReference ? (
              <g key={shot.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={BURN_RADIUS}
                  fill="#3f3f46"
                  fillOpacity="0.55"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={BURN_RADIUS + 1.6}
                  fill="none"
                  stroke={REFERENCE_COLOR}
                  strokeWidth="1.8"
                />
                <text
                  x={cx}
                  y={cy - BURN_RADIUS - 3.5}
                  textAnchor="middle"
                  fill={REFERENCE_COLOR}
                  fontSize="5"
                  fontWeight="700"
                >
                  1
                </text>
              </g>
            ) : (
              <g
                key={shot.id}
                className={isLatest && motionEnabled ? 'beam-node' : undefined}
              >
                {isLatest ? (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={BURN_RADIUS * 2.4}
                    fill="url(#burn-glow)"
                  />
                ) : null}
                <circle
                  cx={cx}
                  cy={cy}
                  r={BURN_RADIUS}
                  fill="var(--color-beam)"
                  fillOpacity={isLatest ? 0.95 : 0.35}
                />
                <text
                  x={cx}
                  y={cy - BURN_RADIUS - 3.5}
                  textAnchor="middle"
                  fill="var(--color-beam)"
                  fontSize="5"
                  fontWeight="700"
                  opacity={isLatest ? 1 : 0.5}
                >
                  {shot.order}
                </text>
              </g>
            )
          })}
          <text
            x="50"
            y="96"
            textAnchor="middle"
            fill="#5f6b7a"
            fontSize="4.6"
            fontWeight="600"
          >
            Mesin di {machineAxisLabel} = {machineValue}
          </text>
          <g opacity="0.55">
            <line
              x1="6"
              y1="90"
              x2={6 + 4 * ACRYLIC_SCALE}
              y2="90"
              stroke="#5f6b7a"
              strokeWidth="0.8"
            />
            <text x="6" y="87" fill="#5f6b7a" fontSize="3.6">
              4 mm
            </text>
          </g>
        </svg>
      </div>
      <p className="sr-only">
        Tanda rujukan berada pada X {reference.x.toFixed(1)}, Y{' '}
        {reference.y.toFixed(1)} milimeter.
      </p>
    </div>
  )
}
