import { Check, Crosshair, RefreshCw, Zap } from 'lucide-react'
import type { StraightStep } from '../types'

interface StraightProcedurePanelProps {
  steps: StraightStep[]
  stepIndex: number
  step: StraightStep
  shotCount: number
  separationMm: number | null
  onAction: () => void
  onRestart: () => void
  className?: string
}

export const StraightProcedurePanel = ({
  steps,
  stepIndex,
  step,
  shotCount,
  separationMm,
  onAction,
  onRestart,
  className,
}: StraightProcedurePanelProps) => {
  const isLaserAction = step.id === 'fireNear' || step.id === 'align'
  return (
    <section
      className={`card flex flex-col gap-3 p-4 sm:p-5 ${className ?? ''}`}
      aria-labelledby="procedure-heading"
    >
      <div>
        <h2
          id="procedure-heading"
          className="text-base font-bold text-ink sm:text-lg"
        >
          Prosedur Beam Lurus
        </h2>
        <p className="mt-0.5 text-xs text-muted sm:text-sm">
          Langkah {stepIndex + 1} daripada {steps.length}
        </p>
      </div>
      <ol className="space-y-1.5">
        {steps.map((item, index) => {
          const isDone = index < stepIndex
          const isCurrent = index === stepIndex
          return (
            <li
              key={item.id}
              className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs sm:text-sm ${isCurrent ? 'bg-[#eef5fd] font-semibold text-screw-2' : 'text-muted'}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isDone ? 'bg-screw-3 text-white' : isCurrent ? 'bg-screw-2 text-white' : 'bg-line text-muted'}`}
                aria-hidden="true"
              >
                {isDone ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span>{item.label}</span>
            </li>
          )
        })}
      </ol>
      <p className="rounded-xl border border-line bg-canvas/60 p-3 text-xs text-muted sm:text-sm">
        {step.hint}
      </p>
      {separationMm === null ? null : (
        <p
          className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-xs sm:text-sm"
          aria-live="polite"
        >
          <span className="text-muted">Sesaran tembakan terakhir</span>
          <span className="font-mono text-base font-semibold text-ink tabular-nums">
            {separationMm.toFixed(1)} mm
          </span>
        </p>
      )}
      <button
        type="button"
        onClick={onAction}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-3 text-base font-semibold text-white transition-[background-color,transform] hover:bg-[#1a66b4] active:scale-[0.99]"
      >
        {isLaserAction ? (
          <Zap className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Crosshair className="h-5 w-5" aria-hidden="true" />
        )}
        {step.action}
        {step.id === 'align' && shotCount > 1 ? ` (tembakan ${shotCount + 1})` : ''}
      </button>
      <button
        type="button"
        onClick={onRestart}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-beam bg-surface px-4 py-2.5 text-sm font-semibold text-beam transition-colors hover:bg-[#fdf0f0]"
        aria-label="Mula semula prosedur beam lurus dari langkah pertama"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Mula Semula
      </button>
    </section>
  )
}
