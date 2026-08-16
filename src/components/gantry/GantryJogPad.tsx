import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { GANTRY_X_MAX, GANTRY_Y_MAX } from './GantryDiagram'
import type { Vec } from '../../types'

const jogButtonClass = [
  'inline-flex items-center justify-center rounded-xl border border-line bg-surface text-screw-2 shadow-sm',
  'h-11 w-11 sm:h-12 sm:w-12',
  'transition-[background-color,scale,border-color,opacity]',
  'hover:bg-[#eef5fd] active:scale-95',
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:active:scale-100',
].join(' ')

interface GantryJogPadProps {
  position: Vec
  onJog: (dx: number, dy: number) => void
  className?: string
}

export const GantryJogPad = ({ position, onJog, className }: GantryJogPadProps) => (
  <div className={`flex flex-col items-center gap-2 ${className ?? ''}`}>
    <div className="grid grid-cols-3 gap-1">
      <span />
      <button
        type="button"
        onClick={() => onJog(0, -1)}
        disabled={position.y === 0}
        className={jogButtonClass}
        aria-label="Gerak gantry ke belakang — Y berkurang"
      >
        <ArrowUp className="h-6 w-6" aria-hidden="true" />
      </button>
      <span />
      <button
        type="button"
        onClick={() => onJog(-1, 0)}
        disabled={position.x === 0}
        className={jogButtonClass}
        aria-label="Gerak head ke kiri — X berkurang"
      >
        <ArrowLeft className="h-6 w-6" aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-canvas text-[10px] font-bold text-muted sm:h-12 sm:w-12"
      >
        JOG
      </span>
      <button
        type="button"
        onClick={() => onJog(1, 0)}
        disabled={position.x === GANTRY_X_MAX}
        className={jogButtonClass}
        aria-label="Gerak head ke kanan — X bertambah"
      >
        <ArrowRight className="h-6 w-6" aria-hidden="true" />
      </button>
      <span />
      <button
        type="button"
        onClick={() => onJog(0, 1)}
        disabled={position.y === GANTRY_Y_MAX}
        className={jogButtonClass}
        aria-label="Gerak gantry ke depan — Y bertambah"
      >
        <ArrowDown className="h-6 w-6" aria-hidden="true" />
      </button>
      <span />
    </div>
    <p
      className="flex w-full flex-col items-center rounded-xl border border-line bg-canvas/60 px-2 py-1.5 font-mono text-sm font-bold text-ink tabular-nums sm:text-base"
      aria-live="polite"
    >
      <span className="whitespace-nowrap">X = {position.x}</span>
      <span className="whitespace-nowrap">Y = {position.y}</span>
    </p>
  </div>
)
