import { useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  RotateCcw,
  Stethoscope,
} from 'lucide-react'
import {
  BRANCHES,
  FULL_TEST,
  RARE_EVENTS,
  SOP_META,
  type NodeTone,
  type TroubleshootBranch,
  type TroubleshootNode,
} from '../data/troubleshooting'

/** Warna mengikut kotak dalam carta asal. */
const TONE: Record<NodeTone, { bg: string; border: string; text: string }> = {
  start: { bg: '#fdf7d0', border: '#e9dc86', text: '#4a4212' },
  action: { bg: '#fdf7d0', border: '#e9dc86', text: '#4a4212' },
  exit: { bg: '#fdf3e8', border: '#f6ddc0', text: '#a3540b' },
  plain: { bg: '#ffffff', border: '#e3e8ef', text: '#1f2937' },
}

type Stage = 'test' | 'symptom' | 'walk'

const STAGE_LABEL: Record<Stage, string> = {
  test: 'Langkah 1 daripada 3 · Full Test',
  symptom: 'Langkah 2 daripada 3 · Pilih simptom',
  walk: 'Langkah 3 daripada 3 · Ikut carta',
}

/** Kotak sesuatu nod, mengikut warna carta asal. */
const NodeCard = ({ node }: { node: TroubleshootNode }) => {
  const tone = TONE[node.tone ?? 'plain']
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{
        backgroundColor: tone.bg,
        borderColor: tone.border,
        color: tone.text,
      }}
    >
      <p className="text-base font-bold leading-snug">{node.label}</p>
      {node.note ? <p className="mt-1 text-sm opacity-80">{node.note}</p> : null}
    </div>
  )
}

export const TroubleshootingPage = () => {
  const [stage, setStage] = useState<Stage>('test')
  const [done, setDone] = useState<string[]>([])
  const [branch, setBranch] = useState<TroubleshootBranch | null>(null)
  /** Nod yang telah dipilih, dari yang pertama hingga kedudukan semasa. */
  const [path, setPath] = useState<TroubleshootNode[]>([])

  const restart = () => {
    setStage('test')
    setDone([])
    setBranch(null)
    setPath([])
  }

  const toggle = (item: string) =>
    setDone((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    )

  const current = path.length > 0 ? path[path.length - 1] : null
  const options = current
    ? (current.children ?? [])
    : (branch?.nodes ?? [])
  const terminal = Boolean(current) && options.length === 0
  /**
   * Satu-satunya pilihan yang tiada sambungan lagi ialah tindakan akhir.
   * Papar terus sebagai keputusan supaya pengguna tidak perlu menekan
   * "Seterusnya" hanya untuk melihat jawapan yang sama.
   */
  const finalAction =
    options.length === 1 && !options[0].children?.length ? options[0] : null

  const back = () => {
    if (stage === 'walk' && path.length > 0) {
      setPath((prev) => prev.slice(0, -1))
      return
    }
    if (stage === 'walk') {
      setBranch(null)
      setStage('symptom')
      return
    }
    setStage('test')
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
        <a
          href="#/"
          className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Utama
        </a>

        <header className="card flex items-center gap-4 p-4 sm:p-5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#fdecec]">
            <Stethoscope className="h-7 w-7 text-[#c8393c]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-ink sm:text-xl">
              Troubleshooting
            </h1>
            <p className="text-sm text-muted">{SOP_META.start}</p>
          </div>
        </header>

        <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted">
          {STAGE_LABEL[stage]}
        </p>

        {/* LANGKAH 1 — Full Test */}
        {stage === 'test' ? (
          <>
            <section className="card flex flex-col gap-3 p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                <ClipboardList
                  className="h-5 w-5 text-screw-2"
                  aria-hidden="true"
                />
                {FULL_TEST.title}
              </h2>
              <ul className="flex flex-col gap-2">
                {FULL_TEST.items.map((item, index) => {
                  const ticked = done.includes(item)
                  return (
                    <li key={item}>
                      <button
                        type="button"
                        onClick={() => toggle(item)}
                        aria-pressed={ticked}
                        className={`flex w-full min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                          ticked
                            ? 'border-[#c9ecd6] bg-[#edf9f1]'
                            : 'border-line bg-surface hover:bg-canvas'
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            ticked
                              ? 'bg-screw-3 text-white'
                              : 'bg-[#eef5fd] text-screw-2'
                          }`}
                        >
                          {ticked ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span
                          className={`text-sm ${ticked ? 'font-semibold text-[#1f6b33]' : 'text-ink'}`}
                        >
                          {item}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="text-center text-xs text-muted">
                {done.length} daripada {FULL_TEST.items.length} ditanda
              </p>
            </section>

            <button
              type="button"
              onClick={() => setStage('symptom')}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-3 text-base font-semibold text-white transition-[background-color,transform] hover:bg-[#1a66b4] active:scale-[0.99]"
            >
              Done
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : null}

        {/* LANGKAH 2 — pilih simptom */}
        {stage === 'symptom' ? (
          <>
            <h2 className="px-1 text-base font-bold text-ink">
              Apa yang berlaku pada mesin?
            </h2>
            <nav className="flex flex-col gap-3" aria-label="Pilih simptom">
              {BRANCHES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setBranch(item)
                    setPath([])
                    setStage('walk')
                  }}
                  className="card flex min-h-16 items-center gap-3 p-4 text-left transition-transform hover:-translate-y-0.5"
                  style={{ borderColor: TONE[item.tone].border }}
                >
                  <span
                    className="h-10 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: TONE[item.tone].border }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold text-ink">
                      {item.label}
                    </span>
                    {item.note ? (
                      <span className="block text-xs text-muted">
                        {item.note}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </nav>
          </>
        ) : null}

        {/* LANGKAH 3 — ikut carta, satu keputusan satu skrin */}
        {stage === 'walk' && branch ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5 px-1">
              <span className="rounded-full bg-[#eef5fd] px-2.5 py-1 text-[11px] font-bold text-screw-2">
                {branch.label}
              </span>
              {path.map((node) => (
                <span
                  key={node.label}
                  className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold text-muted"
                >
                  {node.label}
                </span>
              ))}
            </div>

            {terminal || finalAction ? (
              <>
                <section className="card flex flex-col gap-3 p-4 sm:p-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                    Tindakan
                  </h2>
                  <NodeCard node={(finalAction ?? current) as TroubleshootNode} />
                </section>
                <button
                  type="button"
                  onClick={restart}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-[#1a66b4]"
                >
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  Mula semula
                </button>
              </>
            ) : options.length === 1 ? (
              <>
                <section className="card flex flex-col gap-3 p-4 sm:p-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                    Langkah seterusnya
                  </h2>
                  <NodeCard node={options[0]} />
                </section>
                <button
                  type="button"
                  onClick={() => setPath((prev) => [...prev, options[0]])}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-[#1a66b4]"
                >
                  Seterusnya
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <h2 className="px-1 text-base font-bold text-ink">
                  Pilih keadaan yang sepadan:
                </h2>
                <div className="flex flex-col gap-3">
                  {options.map((option) => {
                    const tone = TONE[option.tone ?? 'plain']
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setPath((prev) => [...prev, option])}
                        className="flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-transform hover:-translate-y-0.5"
                        style={{
                          backgroundColor: tone.bg,
                          borderColor: tone.border,
                          color: tone.text,
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-bold leading-snug">
                            {option.label}
                          </span>
                          {option.note ? (
                            <span className="mt-0.5 block text-sm opacity-80">
                              {option.note}
                            </span>
                          ) : null}
                        </span>
                        <ChevronRight
                          className="h-5 w-5 shrink-0 opacity-60"
                          aria-hidden="true"
                        />
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </>
        ) : null}

        {stage !== 'test' ? (
          <button
            type="button"
            onClick={back}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali
          </button>
        ) : null}

        <RareEvents />

        <p className="pb-4 text-center text-xs text-muted">
          {SOP_META.title} · {SOP_META.version} · {SOP_META.date}
        </p>
      </div>
    </div>
  )
}

/** Nota rujukan carta — tertutup supaya tidak mengganggu aliran berpandu. */
const RareEvents = () => {
  const [open, setOpen] = useState(false)

  return (
    <section className="card overflow-hidden">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex w-full min-h-12 items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-canvas"
        >
          <CircleAlert
            className="h-4 w-4 shrink-0 text-[#c8393c]"
            aria-hidden="true"
          />
          <span className="flex-1 text-sm font-bold text-ink">
            {RARE_EVENTS.title}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h2>
      {open ? (
        <ol className="flex flex-col gap-2 border-t border-line px-4 py-4">
          {RARE_EVENTS.items.map((item, index) => (
            <li key={item} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fdecec] text-xs font-bold text-[#c8393c]">
                {index + 1}
              </span>
              <span className="text-sm text-ink">{item}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
