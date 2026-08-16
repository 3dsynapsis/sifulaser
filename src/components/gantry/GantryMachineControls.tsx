import { Crosshair, Zap } from 'lucide-react'

interface GantryMachineControlsProps {
  busy: boolean
  onOrigin: () => void
  onTestLaser: () => void
  className?: string
}

const buttonClass = [
  'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5',
  'text-sm font-semibold transition-[background-color,scale] active:scale-[0.98]',
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
  <div className={`flex flex-col gap-2 ${className ?? ''}`}>
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onOrigin}
        disabled={busy}
        className={`${buttonClass} border-line bg-surface text-ink hover:bg-canvas`}
      >
        <Crosshair className="h-4 w-4 text-screw-2" aria-hidden="true" />
        Origin
        <span className="font-mono text-xs text-muted">0,0</span>
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
    <p className="text-center text-[11px] text-muted" aria-live="polite">
      {busy
        ? 'Mesin sedang menembak…'
        : 'Origin pulang ke 0,0 · Test Laser tinggalkan kesan berserta koordinat'}
    </p>
  </div>
)
