import { LEVELS, LEVEL_ORDER } from '../levels'
import type { LevelId } from '../types'

interface LevelTabsProps {
  levelId: LevelId
  onChange: (levelId: LevelId) => void
}

export const LevelTabs = ({ levelId, onChange }: LevelTabsProps) => (
  <div className="border-b border-line bg-surface">
    <div
      className="mx-auto grid w-full max-w-[1500px] grid-cols-3 gap-2 px-3 pb-2 sm:px-6 sm:pb-3 xl:grid-cols-5"
      role="tablist"
      aria-label="Pilih latihan"
    >
      {LEVEL_ORDER.map((id) => {
        const level = LEVELS[id]
        const isActive = id === levelId
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors sm:gap-2 sm:px-3 sm:text-sm xl:px-2 xl:text-xs ${isActive ? 'border-screw-2 bg-[#eef5fd] text-screw-2' : 'border-line bg-surface text-muted hover:bg-canvas hover:text-ink'}`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isActive ? 'bg-screw-2 text-white' : 'bg-line text-muted'}`}
              aria-hidden="true"
            >
              {level.number}
            </span>
            <span className="truncate xl:hidden">{level.shortName}</span>
            <span className="hidden truncate xl:inline">{level.tabLabel}</span>
          </button>
        )
      })}
    </div>
  </div>
)
