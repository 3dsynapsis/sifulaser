import type { RefObject } from 'react'
import { RefreshCw } from 'lucide-react'
import { Modal } from './Modal'
import { MOVEMENT_STEP_OPTIONS } from '../lib/sim'

const Toggle = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex min-h-12 w-full items-center justify-between gap-4 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-canvas"
  >
    <span className="min-w-0">
      <span className="block text-sm font-medium text-ink">{label}</span>
      {description ? (
        <span className="block text-xs text-muted">{description}</span>
      ) : null}
    </span>
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-screw-3' : 'bg-[#c8d1dd]'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${checked ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'}`}
      />
    </span>
  </button>
)

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  movementStep: number
  onMovementStepChange: (value: number) => void
  showTrail: boolean
  onShowTrailChange: (value: boolean) => void
  animationsEnabled: boolean
  onAnimationsEnabledChange: (value: boolean) => void
  prefersReducedMotion: boolean
  onReset: () => void
}

export const SettingsDialog = ({
  open,
  onClose,
  returnFocusRef,
  movementStep,
  onMovementStepChange,
  showTrail,
  onShowTrailChange,
  animationsEnabled,
  onAnimationsEnabledChange,
  prefersReducedMotion,
  onReset,
}: SettingsDialogProps) => (
  <Modal open={open} onClose={onClose} title="Tetapan" returnFocusRef={returnFocusRef}>
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">
          Jarak pergerakan setiap klik
        </legend>
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label="Jarak pergerakan setiap klik"
        >
          {MOVEMENT_STEP_OPTIONS.map((option) => {
            const isSelected = option.value === movementStep
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onMovementStepChange(option.value)}
                className={`flex min-h-12 flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm font-semibold transition-colors ${isSelected ? 'border-screw-2 bg-[#eef5fd] text-screw-2' : 'border-line bg-surface text-ink hover:bg-canvas'}`}
              >
                {option.label}
                <span className="text-xs font-normal text-muted">
                  {option.value.toFixed(2)}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Toggle
          label="Tunjukkan jejak beam"
          description="Paparkan lapan kedudukan beam terdahulu sebagai titik pudar."
          checked={showTrail}
          onChange={onShowTrailChange}
        />
        <Toggle
          label="Aktifkan animasi"
          description={
            prefersReducedMotion
              ? 'Sistem anda meminta reduced motion - animasi dikurangkan secara automatik.'
              : 'Pergerakan beam dan maklum balas skru dianimasikan.'
          }
          checked={animationsEnabled}
          onChange={onAnimationsEnabledChange}
        />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Simulasi</h3>
        <button
          type="button"
          onClick={() => {
            onReset()
            onClose()
          }}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-beam bg-surface px-4 py-2.5 text-sm font-semibold text-beam transition-colors hover:bg-[#fdf0f0]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reset simulasi
        </button>
      </div>
    </div>
  </Modal>
)
