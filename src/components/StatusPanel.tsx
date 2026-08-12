import { Check, Crosshair, Info } from 'lucide-react'
import { STATUS_COLORS } from '../lib/sim'
import type { AlignmentStatus } from '../types'

interface StatusPanelProps {
  alignmentStatus: AlignmentStatus
  labels: Record<AlignmentStatus, string>
  successMessage: string
  srText: string
  helperText: string
  className?: string
}

export const StatusPanel = ({
  alignmentStatus,
  labels,
  successMessage,
  srText,
  helperText,
  className,
}: StatusPanelProps) => {
  const color = STATUS_COLORS[alignmentStatus]
  const isAligned = alignmentStatus === 'aligned'
  const StatusIcon = isAligned ? Check : Crosshair
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 xl:flex-col xl:flex-nowrap xl:items-stretch ${className ?? ''}`}
    >
      <div
        aria-live="polite"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3 xl:block xl:space-y-2"
      >
        <h3 className="text-xs font-bold text-ink sm:text-sm xl:text-base">
          Status Alignment
        </h3>
        <p
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm"
          style={{
            color,
            backgroundColor: `color-mix(in srgb, ${color} 12%, #ffffff)`,
          }}
        >
          <StatusIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {labels[alignmentStatus]}
        </p>
        <p className="sr-only">
          {srText}
          {isAligned ? ` ${successMessage}` : ''}
        </p>
      </div>
      {isAligned ? (
        <p
          className="flex w-full items-start gap-2 rounded-xl border p-2.5 text-xs sm:p-3 sm:text-sm"
          style={{
            color: 'var(--color-aligned)',
            borderColor: 'color-mix(in srgb, var(--color-aligned) 35%, #ffffff)',
            backgroundColor:
              'color-mix(in srgb, var(--color-aligned) 10%, #ffffff)',
          }}
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {successMessage}
        </p>
      ) : (
        <p className="hidden w-full items-start gap-2 rounded-xl border border-[#cfe0f5] bg-[#eef5fd] p-3 text-xs text-[#2b4d73] sm:text-sm xl:flex">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-screw-2"
            aria-hidden="true"
          />
          {helperText}
        </p>
      )}
    </div>
  )
}
