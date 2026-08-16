import { useState } from 'react'
import { ArrowLeft, ChevronRight, GraduationCap, Wrench } from 'lucide-react'
import { LEVELS } from '../levels'
import type { CentreLevelConfig } from '../types'

/** Asas skru diambil terus daripada latihan Cermin supaya sentiasa sepadan. */
const BASICS = LEVELS.level1 as CentreLevelConfig

interface SkillGateProps {
  /** Nama latihan yang pelajar cuba masuki. */
  targetLabel: string
  onPass: () => void
  onLearn: () => void
  onBack: () => void
}

/**
 * Semakan asas skru sebelum mana-mana latihan.
 *
 * Pelajar mesti mengesahkan yang dia tahu fungsi tiga skru itu. Jika belum,
 * ada jalan terus ke latihan asas dan boleh kembali ke sini selepas itu.
 */
export const SkillGate = ({
  targetLabel,
  onPass,
  onLearn,
  onBack,
}: SkillGateProps) => {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
      <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted">
        Semakan sebelum {targetLabel}
      </p>

      <section className="card flex flex-col gap-4 p-4 sm:p-5">
        <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Wrench className="h-5 w-5 text-screw-2" aria-hidden="true" />
          Asas Skru
        </h1>

        <ul className="flex flex-col gap-2">
          {BASICS.screwOrder.map((id) => {
            const screw = BASICS.screws[id]
            return (
              <li
                key={id}
                className="flex items-start gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: screw.colorVar }}
                  aria-hidden="true"
                >
                  {screw.number}
                </span>
                <span className="text-sm text-ink">{screw.guide}</span>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          onClick={() => setConfirmed(!confirmed)}
          aria-pressed={confirmed}
          className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
            confirmed
              ? 'border-[#c9ecd6] bg-[#edf9f1]'
              : 'border-line bg-surface hover:bg-canvas'
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
              confirmed
                ? 'border-screw-3 bg-screw-3 text-white'
                : 'border-line bg-surface'
            }`}
            aria-hidden="true"
          >
            {confirmed ? '✓' : ''}
          </span>
          <span
            className={`text-sm font-semibold ${confirmed ? 'text-[#1f6b33]' : 'text-ink'}`}
          >
            Saya reti fungsi ketiga-tiga skru ini
          </span>
        </button>
      </section>

      <button
        type="button"
        disabled={!confirmed}
        onClick={onPass}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-[#1a66b4] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Teruskan ke {targetLabel}
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onLearn}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#f6ddc0] bg-[#fdf3e8] px-4 py-3 text-sm font-semibold text-[#a3540b] transition-colors hover:bg-[#fbe9d6]"
      >
        <GraduationCap className="h-5 w-5" aria-hidden="true" />
        Belum reti — belajar asas skru dulu
      </button>

      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Kembali ke rajah
      </button>
    </div>
  )
}
