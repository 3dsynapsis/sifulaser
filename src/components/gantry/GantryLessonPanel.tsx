import { Check, RefreshCw } from 'lucide-react'
import type { GantryStep } from '../../hooks/useGantryLesson'

interface GantryLessonPanelProps {
  steps: GantryStep[]
  stepIndex: number
  step: GantryStep | null
  finished: boolean
  successMessage: string
  onAdvance: () => void
  onRestart: () => void
  className?: string
}

export const GantryLessonPanel = ({
  steps,
  stepIndex,
  step,
  finished,
  successMessage,
  onAdvance,
  onRestart,
  className,
}: GantryLessonPanelProps) => (
  <section
    className={`card flex flex-col gap-3 p-4 sm:p-5 ${className ?? ''}`}
    aria-labelledby="gantry-lesson-heading"
  >
    <div>
      <h2
        id="gantry-lesson-heading"
        className="text-base font-bold text-ink sm:text-lg"
      >
        Latihan Gerakan Gantry
      </h2>
      <p className="mt-0.5 text-xs text-muted sm:text-sm">
        {finished
          ? 'Semua langkah selesai'
          : `Langkah ${stepIndex + 1} daripada ${steps.length}`}
      </p>
    </div>
    <ol className="space-y-1.5">
      {steps.map((item, index) => {
        const isDone = finished || index < stepIndex
        const isCurrent = !finished && index === stepIndex
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
    {finished ? (
      <p
        className="flex w-full items-start gap-2 rounded-xl border p-2.5 text-xs sm:p-3 sm:text-sm"
        aria-live="polite"
        style={{
          color: 'var(--color-aligned)',
          borderColor: 'color-mix(in srgb, var(--color-aligned) 35%, #ffffff)',
          backgroundColor: 'color-mix(in srgb, var(--color-aligned) 10%, #ffffff)',
        }}
      >
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {successMessage}
      </p>
    ) : (
      <p className="rounded-xl border border-line bg-canvas/60 p-3 text-xs text-muted sm:text-sm">
        {step?.hint}
      </p>
    )}
    {!finished && step?.action ? (
      <button
        type="button"
        onClick={onAdvance}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-3 text-base font-semibold text-white transition-[background-color,transform] hover:bg-[#1a66b4] active:scale-[0.99]"
      >
        <Check className="h-5 w-5" aria-hidden="true" />
        {step.action}
      </button>
    ) : null}
    <button
      type="button"
      onClick={onRestart}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-beam bg-surface px-4 py-2.5 text-sm font-semibold text-beam transition-colors hover:bg-[#fdf0f0]"
      aria-label="Mula semula latihan gerakan gantry dari langkah pertama"
    >
      <RefreshCw className="h-4 w-4" aria-hidden="true" />
      Mula Semula
    </button>
  </section>
)
