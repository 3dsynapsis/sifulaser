import { HEAD_VARIANTS } from '../levels'
import type { HeadVariantId } from '../types'

const VARIANT_ORDER: HeadVariantId[] = ['bodor', 'xd']

interface HeadVariantTabsProps {
  variant: HeadVariantId
  onChange: (variant: HeadVariantId) => void
}

// Sub-tab kecil untuk Level 2: pilih jenis head (Bodor / XD Laser)
export const HeadVariantTabs = ({ variant, onChange }: HeadVariantTabsProps) => (
  <div className="border-b border-line bg-surface">
    <div className="mx-auto flex w-full max-w-[1500px] items-center gap-2 px-3 pb-2 sm:px-6 sm:pb-3">
      <span className="text-xs font-semibold text-muted sm:text-sm">
        Jenis Head:
      </span>
      <div
        className="flex gap-1.5"
        role="radiogroup"
        aria-label="Pilih jenis head"
      >
        {VARIANT_ORDER.map((id) => {
          const isActive = id === variant
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(id)}
              className={`inline-flex min-h-9 items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${isActive ? 'border-screw-2 bg-[#eef5fd] text-screw-2' : 'border-line bg-surface text-muted hover:bg-canvas hover:text-ink'}`}
            >
              {HEAD_VARIANTS[id].label}
            </button>
          )
        })}
      </div>
    </div>
  </div>
)
