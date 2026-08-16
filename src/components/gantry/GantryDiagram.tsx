import type { Vec } from '../../types'

// Pandangan atas mesin (skala 1 unit mesin = 1 unit SVG):
// origin 0,0 mesin di penjuru belakang-kiri katil, X bertambah ke kanan,
// Y bertambah ke arah depan mesin (ke bawah pada rajah).
export const GANTRY_X_MAX = 130
export const GANTRY_Y_MAX = 90

const BED_X0 = 30 // svg-x untuk mesin X = 0
const BED_Y0 = 26 // svg-y untuk mesin Y = 0
const RAIL_X = 24 // rel Y kiri (laluan beam cermin 1 → cermin 2)
const TUBE_Y = 12.5 // garis tengah tiub laser

const toSvgX = (x: number) => BED_X0 + x
const toSvgY = (y: number) => BED_Y0 + y

interface GantryDiagramProps {
  x: number
  y: number
  highlightM1M2?: boolean
  highlightM2Head?: boolean
  targetPoint?: Vec | null
  compact?: boolean
  motionEnabled: boolean
  className?: string
  /** Segmen beam yang sedang bercahaya semasa Test Laser. */
  beamPhase?: 'idle' | 'tube' | 'toM1' | 'm1m2' | 'm2head' | 'fire'
  /** Kesan tembakan yang ditinggalkan, berserta koordinatnya. */
  marks?: { x: number; y: number; id: number }[]
}

export const GantryDiagram = ({
  x,
  y,
  highlightM1M2 = false,
  highlightM2Head = false,
  targetPoint = null,
  compact = false,
  motionEnabled,
  className,
  beamPhase = 'idle',
  marks = [],
}: GantryDiagramProps) => {
  const headX = toSvgX(x)
  const gantryY = toSvgY(y)
  const moveClass = motionEnabled ? 'beam-node' : 'beam-node beam-node--static'
  // Sekali sesuatu segmen dicapai, ia kekal bercahaya sehingga tembakan tamat.
  // Bertimbun: segmen yang sudah menyala kekal menyala sehingga tembakan tamat.
  const after = (...phases: string[]) => phases.includes(beamPhase)
  const lit = {
    tubeBody: beamPhase !== 'idle',
    toM1: after('toM1', 'm1m2', 'm2head', 'fire'),
    m1m2: after('m1m2', 'm2head', 'fire'),
    m2head: after('m2head', 'fire'),
  }
  const firing = beamPhase === 'fire'
  const labelSize = compact ? 5.2 : 4
  const smallLabelSize = compact ? 4.6 : 3.6
  return (
    <div className={`w-full ${className ?? ''}`}>
      <div className="w-full rounded-xl border border-line bg-white p-1.5 sm:p-2">
        <svg
          viewBox="0 0 172 134"
          className="h-auto w-full"
          role="img"
          aria-label={`Pandangan atas mesin laser. Head berada pada X ${x}, Y ${y}.`}
        >
          <defs>
            <marker
              id="gantry-axis-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 Z" fill="#5f6b7a" />
            </marker>
          </defs>

          {/* Rangka mesin */}
          <rect
            x="3"
            y="3"
            width="166"
            height="122"
            rx="5"
            fill="#f2f5fa"
            stroke="#c7d0dc"
            strokeWidth="1"
          />

          {/* Katil mesin dengan grid halus */}
          <rect
            x={BED_X0 - 2}
            y={BED_Y0 - 2}
            width={GANTRY_X_MAX + 4}
            height={GANTRY_Y_MAX + 4}
            rx="2"
            fill="#ffffff"
            stroke="#dce3ec"
            strokeWidth="0.8"
          />
          <g stroke="#eef2f7" strokeWidth="0.35">
            {[20, 40, 60, 80, 100, 120].map((gx) => (
              <line
                key={`gv-${gx}`}
                x1={toSvgX(gx)}
                y1={BED_Y0}
                x2={toSvgX(gx)}
                y2={BED_Y0 + GANTRY_Y_MAX}
              />
            ))}
            {[30, 60].map((gy) => (
              <line
                key={`gh-${gy}`}
                x1={BED_X0}
                y1={toSvgY(gy)}
                x2={BED_X0 + GANTRY_X_MAX}
                y2={toSvgY(gy)}
              />
            ))}
          </g>

          {/* Tiub laser di belakang — menyala merah dahulu semasa menembak */}
          {lit.tubeBody ? (
            <rect
              x="32"
              y="6"
              width="126"
              height="13"
              rx="6.5"
              fill="var(--color-beam)"
              opacity="0.25"
            />
          ) : null}
          <rect
            x="34"
            y="8"
            width="122"
            height="9"
            rx="4.5"
            fill={lit.tubeBody ? 'var(--color-beam)' : '#d8e2f0'}
            fillOpacity={lit.tubeBody ? 0.55 : 1}
            stroke={lit.tubeBody ? 'var(--color-beam)' : '#b6c6da'}
            strokeWidth={lit.tubeBody ? 1.2 : 0.8}
          />
          <text
            x="95"
            y="14.6"
            textAnchor="middle"
            fill="#5f6b7a"
            fontSize={smallLabelSize}
            fontWeight="600"
          >
            Tiub Laser
          </text>

          {/* Rel Y kiri */}
          <line
            x1={RAIL_X}
            y1={BED_Y0 - 6}
            x2={RAIL_X}
            y2={BED_Y0 + GANTRY_Y_MAX + 4}
            stroke="#c7d0dc"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* Senggatan Y = 0 / 45 / 90 */}
          {[0, 45, 90].map((tick) => (
            <g key={`tick-${tick}`}>
              <line
                x1={RAIL_X - 4}
                y1={toSvgY(tick)}
                x2={RAIL_X - 1.5}
                y2={toSvgY(tick)}
                stroke="#9aa5b4"
                strokeWidth="0.7"
              />
              <text
                x={RAIL_X - 5.5}
                y={toSvgY(tick) + 1.4}
                textAnchor="end"
                fill="#5f6b7a"
                fontSize={smallLabelSize}
              >
                {tick}
              </text>
            </g>
          ))}

          {/* Laluan beam: tiub → cermin 1 → cermin 2 → head */}
          <g strokeLinecap="round" fill="none">
            {lit.toM1 ? (
              <line
                x1="34"
                y1={TUBE_Y}
                x2={RAIL_X}
                y2={TUBE_Y}
                stroke="var(--color-beam)"
                strokeWidth="5"
                opacity="0.3"
              />
            ) : null}
            <line
              x1="34"
              y1={TUBE_Y}
              x2={RAIL_X}
              y2={TUBE_Y}
              stroke="var(--color-beam)"
              strokeWidth={lit.toM1 ? 2.4 : 1.3}
              opacity="0.9"
            />
            {/* Segmen cermin 1 → cermin 2: panjang berubah ikut Y */}
            <line
              x1={RAIL_X}
              y1={TUBE_Y}
              x2={RAIL_X}
              y2={gantryY}
              stroke="var(--color-beam)"
              strokeWidth={highlightM1M2 || lit.m1m2 ? 2.4 : 1.3}
              opacity={highlightM1M2 || lit.m1m2 ? 1 : 0.9}
              className={moveClass}
              style={{ transition: motionEnabled ? undefined : 'none' }}
            />
            {highlightM1M2 || lit.m1m2 ? (
              <line
                x1={RAIL_X}
                y1={TUBE_Y}
                x2={RAIL_X}
                y2={gantryY}
                stroke="var(--color-beam)"
                strokeWidth={lit.m1m2 ? 6 : 5}
                opacity={lit.m1m2 ? 0.32 : 0.18}
              />
            ) : null}
            <line
              x1={RAIL_X}
              y1={gantryY}
              x2={headX}
              y2={gantryY}
              stroke="var(--color-beam)"
              strokeWidth={highlightM2Head || lit.m2head ? 2.4 : 1.3}
              opacity={highlightM2Head || lit.m2head ? 1 : 0.9}
            />
            {highlightM2Head || lit.m2head ? (
              <line
                x1={RAIL_X}
                y1={gantryY}
                x2={headX}
                y2={gantryY}
                stroke="var(--color-beam)"
                strokeWidth={lit.m2head ? 6 : 5}
                opacity={lit.m2head ? 0.32 : 0.18}
              />
            ) : null}
          </g>

          {/* Kesan tembakan Test Laser, berserta koordinat */}
          {marks.map((mark) => (
            <g key={mark.id}>
              <circle
                cx={toSvgX(mark.x)}
                cy={toSvgY(mark.y)}
                r="2.6"
                fill="var(--color-beam)"
                opacity="0.22"
              />
              <circle
                cx={toSvgX(mark.x)}
                cy={toSvgY(mark.y)}
                r="1.1"
                fill="var(--color-beam)"
              />
              {/* Rapat di atas titik dan bertitik tengah padanya. Sepuhan
                  berjejari 2.6, jadi -4.2 cukup untuk tidak bertindih. */}
              <text
                x={toSvgX(mark.x)}
                y={toSvgY(mark.y) - 4.2}
                textAnchor="middle"
                fill="var(--color-beam)"
                fontSize={smallLabelSize}
                fontWeight="700"
              >
                X({mark.x}), Y({mark.y})
              </text>
            </g>
          ))}

          {/* Denyar di head semasa laser menembak */}
          {firing ? (
            <circle
              cx={headX}
              cy={gantryY}
              r="5.5"
              fill="var(--color-beam)"
              opacity="0.35"
            />
          ) : null}

          {/* Cermin 1 (statik, belakang-kiri) */}
          <g>
            <rect
              x={RAIL_X - 3.2}
              y={TUBE_Y - 3.2}
              width="6.4"
              height="6.4"
              rx="1"
              transform={`rotate(45 ${RAIL_X} ${TUBE_Y})`}
              fill="#3f4c63"
              stroke="#ffffff"
              strokeWidth="0.8"
            />
            <text
              x="6"
              y="22"
              textAnchor="start"
              fill="#3f4c63"
              fontSize={smallLabelSize}
              fontWeight="700"
            >
              Cermin 1
            </text>
          </g>

          {/* Bar gantry (bergerak ikut Y) + cermin 2 + head */}
          <g>
            <rect
              x={RAIL_X - 3}
              y={gantryY - 3}
              width={GANTRY_X_MAX + BED_X0 - RAIL_X + 8}
              height="6"
              rx="3"
              fill="#c3cfdd"
              stroke="#9fb0c4"
              strokeWidth="0.7"
              className={moveClass}
            />
            <rect
              x={RAIL_X - 3.2}
              y={gantryY - 3.2}
              width="6.4"
              height="6.4"
              rx="1"
              transform={`rotate(45 ${RAIL_X} ${gantryY})`}
              fill="#6d28d9"
              stroke="#ffffff"
              strokeWidth="0.8"
              className={moveClass}
            />
            <text
              x={BED_X0 + GANTRY_X_MAX + 4}
              y={gantryY - 4.5}
              textAnchor="end"
              fill="#5f6b7a"
              fontSize={smallLabelSize}
              fontWeight="700"
              className={moveClass}
            >
              Y={y}
            </text>
            {/* Head (bergerak ikut X dan Y) */}
            <g
              className={moveClass}
              style={{ transform: `translate(${headX}px, ${gantryY}px)` }}
            >
              <rect
                x="-4"
                y="-4.6"
                width="8"
                height="9.2"
                rx="2"
                fill="#14213d"
                stroke="#ffffff"
                strokeWidth="0.8"
              />
              <circle r="1.8" fill="var(--color-beam)" />
              {/* Label Cermin 3 di bawah head */}
              <text
                y="9.6"
                textAnchor="middle"
                fill="#14213d"
                fontSize={smallLabelSize}
                fontWeight="700"
                stroke="#ffffff"
                strokeWidth="0.9"
                style={{ paintOrder: 'stroke' }}
              >
                Cermin 3
              </text>
            </g>
            {/* Kilauan cermin 2 → cermin 3 diulang di sini kerana bar gantry
                dilukis selepas laluan beam dan akan menutup garisan asal.
                Diletak sebelum label Cermin 2 supaya label kekal terbaca. */}
            {lit.m2head ? (
              <g strokeLinecap="round" fill="none">
                <line
                  x1={RAIL_X}
                  y1={gantryY}
                  x2={headX}
                  y2={gantryY}
                  stroke="var(--color-beam)"
                  strokeWidth="6"
                  opacity="0.32"
                />
                <line
                  x1={RAIL_X}
                  y1={gantryY}
                  x2={headX}
                  y2={gantryY}
                  stroke="var(--color-beam)"
                  strokeWidth="2.4"
                  opacity="1"
                />
              </g>
            ) : null}

            {/* Label Cermin 2 dilukis paling atas (halo putih) supaya tak
                terlindung bila head berada di X = 0 */}
            <text
              x={RAIL_X + 7}
              y={gantryY + 1.8}
              textAnchor="start"
              fill="#6d28d9"
              fontSize={smallLabelSize}
              fontWeight="700"
              stroke="#ffffff"
              strokeWidth="0.9"
              style={{ paintOrder: 'stroke' }}
              className={moveClass}
            >
              Cermin 2
            </text>
          </g>

          {/* Nota konsep (statik di tepi) */}
          {compact ? null : (
            <text
              x="6"
              y={BED_Y0 + GANTRY_Y_MAX + 12}
              fill="#6d28d9"
              fontSize={smallLabelSize}
              fontWeight="700"
            >
              ◆ Cermin 2 ikut gantry · Cermin 3 pada head
            </text>
          )}

          {/* Sasaran (untuk tugasan gerak ke tengah) */}
          {targetPoint ? (
            <g>
              <circle
                cx={toSvgX(targetPoint.x)}
                cy={toSvgY(targetPoint.y)}
                r="6"
                fill="none"
                stroke="var(--color-screw-2)"
                strokeWidth="1.2"
                strokeDasharray="3 2"
              />
              <circle
                cx={toSvgX(targetPoint.x)}
                cy={toSvgY(targetPoint.y)}
                r="1.4"
                fill="var(--color-screw-2)"
              />
            </g>
          ) : null}

          {/* Origin 0,0 dan anak panah paksi */}
          <g>
            <circle cx={BED_X0} cy={BED_Y0} r="1.6" fill="#14213d" />
            <text
              x={BED_X0 + 3.5}
              y={BED_Y0 - 2.5}
              fill="#14213d"
              fontSize={labelSize}
              fontWeight="700"
            >
              0,0
            </text>
            <line
              x1={BED_X0 + 14}
              y1={BED_Y0 + 6}
              x2={BED_X0 + 38}
              y2={BED_Y0 + 6}
              stroke="#5f6b7a"
              strokeWidth="0.9"
              markerEnd="url(#gantry-axis-arrow)"
            />
            <text
              x={BED_X0 + 41}
              y={BED_Y0 + 7.6}
              fill="#5f6b7a"
              fontSize={labelSize}
              fontWeight="700"
            >
              X
            </text>
            <line
              x1={BED_X0 + 10}
              y1={BED_Y0 + 10}
              x2={BED_X0 + 10}
              y2={BED_Y0 + 34}
              stroke="#5f6b7a"
              strokeWidth="0.9"
              markerEnd="url(#gantry-axis-arrow)"
            />
            <text
              x={BED_X0 + 8.5}
              y={BED_Y0 + 40}
              fill="#5f6b7a"
              fontSize={labelSize}
              fontWeight="700"
            >
              Y
            </text>
          </g>

          {/* Kapsyen orientasi */}
          <text
            x="166"
            y="7"
            textAnchor="end"
            fill="#9aa5b4"
            fontSize={smallLabelSize}
            fontWeight="600"
          >
            Belakang
          </text>
          <text
            x="86"
            y="131.5"
            textAnchor="middle"
            fill="#5f6b7a"
            fontSize={labelSize}
            fontWeight="600"
          >
            Depan mesin (pintu)
          </text>
        </svg>
      </div>
    </div>
  )
}
