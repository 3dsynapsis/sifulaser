import { Crosshair, Zap } from 'lucide-react'

interface GantryMachineControlsProps {
  busy: boolean
  onOrigin: () => void
  onTestLaser: () => void
  className?: string
}

const buttonClass = [
  'inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-2 py-2',
  'text-xs font-semibold transition-[background-color,scale] active:scale-[0.98] sm:text-sm',
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
].join(' ')

/**
 * Kawalan yang meniru panel mesin sebenar: pulang ke titik asal, dan acah
 * satu tembakan laser yang meninggalkan kesan berserta koordinatnya.
 */
export const GantryMachineControls = ({
  busy,
  onOrigin,
  onTestLaser,
  className,
}: GantryMachineControlsProps) => (
  <div className={`flex w-full flex-col gap-2 ${className ?? ''}`}>
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onOrigin}
        disabled={busy}
        className={`${buttonClass} border-line bg-surface text-ink hover:bg-canvas`}
      >
        <Crosshair className="h-4 w-4 text-screw-2" aria-hidden="true" />
        Origin
        <span className="font-mono text-[10px] text-muted">0,0</span>
      </button>
      <button
        type="button"
        onClick={onTestLaser}
        disabled={busy}
        className={`${buttonClass} border-[#f4cfd0] bg-[#fdf0f0] text-[#8a2226] hover:bg-[#fbe3e3]`}
      >
        <Zap className="h-4 w-4" aria-hidden="true" />
        Test Laser
      </button>
    </div>
    {busy ? (
      <p className="text-center text-[11px] font-semibold text-muted" aria-live="polite">
        Sedang menembak…
      </p>
    ) : null}
  </div>
)
