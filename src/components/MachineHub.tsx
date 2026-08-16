import { LockKeyhole } from 'lucide-react'
import { GantryDiagram } from './gantry/GantryDiagram'
import type { LevelId } from '../types'
import { canAccessLevel } from '../lib/access'
import { useAuth } from '../lib/auth'

/**
 * Titik boleh tekan di atas rajah mesin.
 *
 * Kedudukan dalam peratus, diambil daripada viewBox GantryDiagram (172 x 134)
 * supaya penanda kekal betul pada semua saiz skrin.
 */
interface Hotspot {
  levelId: LevelId
  marker: number
  label: string
  where: string
  left: string
  top: string
}

const HOTSPOTS: Hotspot[] = [
  {
    levelId: 'level4',
    marker: 1,
    label: 'Beam Lurus Y',
    where: 'Cermin 1 → Cermin 2',
    left: '14%',
    top: '48%',
  },
  {
    levelId: 'level5',
    marker: 2,
    label: 'Beam Lurus X',
    where: 'Cermin 2 → Cermin 3',
    left: '35%',
    top: '79%',
  },
  {
    levelId: 'level2',
    marker: 3,
    label: 'Head',
    where: 'Cermin 3 pada head',
    left: '55%',
    top: '79%',
  },
  {
    levelId: 'level3',
    marker: 4,
    label: 'Gerakan Gantry',
    where: 'Pergerakan X dan Y',
    left: '74%',
    top: '44%',
  },
]

interface MachineHubProps {
  onSelect: (levelId: LevelId) => void
}

export const MachineHub = ({ onSelect }: MachineHubProps) => {
  const { paid } = useAuth()

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
      <header className="card flex flex-col gap-1 p-4 sm:p-5">
        <h1 className="text-lg font-bold text-ink sm:text-xl">
          Pilih bahagian mesin
        </h1>
        <p className="text-sm text-muted">
          Tekan penanda pada rajah, atau pilih dari senarai di bawah.
        </p>
      </header>

      <section className="card p-3 sm:p-4">
        <div className="relative">
          <GantryDiagram x={65} y={90} motionEnabled={false} />

          {HOTSPOTS.map((spot) => {
            const locked = !canAccessLevel(spot.levelId, paid)
            return (
              <button
                key={spot.levelId}
                type="button"
                onClick={() => onSelect(spot.levelId)}
                aria-label={`${spot.label} — ${spot.where}${locked ? ' (perlukan Akses Penuh)' : ''}`}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-transform hover:scale-110 active:scale-95"
                style={{ left: spot.left, top: spot.top }}
              >
                {/* Bulatan kelihatan lebih kecil daripada kawasan sentuh 44px
                    supaya label rajah tidak tertutup. */}
                <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-screw-2 text-xs font-bold text-white shadow-md">
                  {spot.marker}
                  {locked ? (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#e07514]">
                      <LockKeyhole
                        className="h-2.5 w-2.5 text-white"
                        aria-hidden="true"
                      />
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <nav className="flex flex-col gap-3" aria-label="Bahagian mesin">
        {HOTSPOTS.map((spot) => {
          const locked = !canAccessLevel(spot.levelId, paid)
          return (
            <button
              key={spot.levelId}
              type="button"
              onClick={() => onSelect(spot.levelId)}
              className="card flex min-h-16 items-center gap-3 p-4 text-left transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-screw-2 text-sm font-bold text-white">
                {spot.marker}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-ink">
                  {spot.label}
                </span>
                <span className="block text-xs text-muted">{spot.where}</span>
              </span>
              {locked ? (
                <LockKeyhole
                  className="h-4 w-4 shrink-0 text-muted"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          )
        })}
      </nav>

      <p className="pb-4 text-center text-xs text-muted">
        Setiap latihan bermula dengan semakan asas skru.
      </p>
    </div>
  )
}
