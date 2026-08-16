import { useState } from 'react'
import { Check, RotateCcw, Target, X } from 'lucide-react'
import { MAX_MARKS, type PulseMark } from '../../hooks/useGantryLesson'

interface GantryCoordinateQuizProps {
  marks: PulseMark[]
  onCheck: (id: number, x: number, y: number) => boolean
  onReset: () => void
  className?: string
}

type Draft = { x: string; y: string; wrong: boolean }

const emptyDraft: Draft = { x: '', y: '', wrong: false }

const fieldClass = [
  'min-h-11 w-full rounded-xl border border-line bg-surface px-2 text-center',
  'font-mono text-sm font-bold text-ink tabular-nums outline-none',
  'focus:border-screw-2',
  'disabled:bg-canvas disabled:text-muted',
].join(' ')

/**
 * Latihan membaca koordinat: setiap tembakan Test Laser menambah satu baris,
 * dan pelajar mengisi X dan Y titik itu dengan membaca kedudukannya pada rajah.
 */
export const GantryCoordinateQuiz = ({
  marks,
  onCheck,
  onReset,
  className,
}: GantryCoordinateQuizProps) => {
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})

  const draftOf = (id: number) => drafts[id] ?? emptyDraft
  const setDraft = (id: number, patch: Partial<Draft>) =>
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyDraft), ...patch },
    }))

  const submit = (mark: PulseMark) => {
    const draft = draftOf(mark.id)
    if (draft.x === '' || draft.y === '') return
    const correct = onCheck(mark.id, Number(draft.x), Number(draft.y))
    setDraft(mark.id, { wrong: !correct })
  }

  const solved = marks.filter((mark) => mark.solved).length

  return (
    <section
      className={`card flex flex-col gap-3 p-4 sm:p-5 ${className ?? ''}`}
      aria-labelledby="gantry-quiz-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="gantry-quiz-heading"
            className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg"
          >
            <Target className="h-5 w-5 text-screw-2" aria-hidden="true" />
            Latihan Koordinat
          </h2>
          <p className="mt-0.5 text-xs text-muted sm:text-sm">
            Gerakkan head ke mana-mana, tekan Test Laser, kemudian baca
            kedudukan titik itu pada rajah dan isi nilainya.
          </p>
        </div>
        {marks.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setDrafts({})
              onReset()
            }}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line px-2.5 py-2 text-xs font-semibold text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset
          </button>
        ) : null}
      </div>

      {marks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-canvas px-4 py-5 text-center text-sm text-muted">
          Belum ada titik. Tekan <span className="font-bold">Test Laser</span>{' '}
          untuk mula.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {marks.map((mark) => {
            const draft = draftOf(mark.id)
            return (
              <li
                key={mark.id}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                  mark.solved
                    ? 'border-[#c9ecd6] bg-[#edf9f1]'
                    : draft.wrong
                      ? 'border-[#f4cfd0] bg-[#fdf0f0]'
                      : 'border-line bg-surface'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    mark.solved
                      ? 'bg-screw-3 text-white'
                      : 'bg-[#fdecec] text-[#c8393c]'
                  }`}
                >
                  {mark.index}
                </span>

                <label className="flex min-w-0 flex-1 items-center gap-1">
                  <span className="text-xs font-bold text-muted">X</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={mark.solved ? mark.x : draft.x}
                    disabled={mark.solved}
                    onChange={(event) =>
                      setDraft(mark.id, { x: event.target.value, wrong: false })
                    }
                    className={fieldClass}
                    aria-label={`Nilai X untuk titik ${mark.index}`}
                  />
                </label>

                <label className="flex min-w-0 flex-1 items-center gap-1">
                  <span className="text-xs font-bold text-muted">Y</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={mark.solved ? mark.y : draft.y}
                    disabled={mark.solved}
                    onChange={(event) =>
                      setDraft(mark.id, { y: event.target.value, wrong: false })
                    }
                    className={fieldClass}
                    aria-label={`Nilai Y untuk titik ${mark.index}`}
                  />
                </label>

                {mark.solved ? (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-screw-3 text-white"
                    aria-label="Betul"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => submit(mark)}
                    disabled={draft.x === '' || draft.y === ''}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-screw-2 text-white transition-colors hover:bg-[#1a66b4] disabled:opacity-40"
                    aria-label={`Semak jawapan titik ${mark.index}`}
                  >
                    {draft.wrong ? (
                      <X className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <p className="text-center text-xs text-muted" aria-live="polite">
        {marks.length} daripada {MAX_MARKS} titik · {solved} betul
        {marks.length >= MAX_MARKS
          ? ' · tembakan seterusnya memulakan pusingan baharu'
          : ''}
      </p>
    </section>
  )
}
