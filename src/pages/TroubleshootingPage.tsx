import { useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  CornerDownRight,
  Stethoscope,
} from 'lucide-react'
import {
  BRANCHES,
  FULL_TEST,
  RARE_EVENTS,
  SOP_META,
  type NodeTone,
  type TroubleshootNode,
} from '../data/troubleshooting'

/** Warna mengikut kotak dalam carta asal. */
const TONE: Record<NodeTone, { bg: string; border: string; text: string }> = {
  start: { bg: '#fdf7d0', border: '#e9dc86', text: '#4a4212' },
  action: { bg: '#fdf7d0', border: '#e9dc86', text: '#4a4212' },
  exit: { bg: '#fdf3e8', border: '#f6ddc0', text: '#a3540b' },
  plain: { bg: '#ffffff', border: '#e3e8ef', text: '#1f2937' },
}

/**
 * Satu kotak carta. Anak-anak dilorek ke dalam dengan garis kiri supaya
 * hubungan "selepas ini" kekal jelas walaupun pada skrin sempit.
 */
const Node = ({ node, depth }: { node: TroubleshootNode; depth: number }) => {
  const tone = TONE[node.tone ?? 'plain']

  return (
    <li>
      <div
        className="rounded-xl border px-3 py-2.5"
        style={{
          backgroundColor: tone.bg,
          borderColor: tone.border,
          color: tone.text,
        }}
      >
        <p className="text-sm font-semibold leading-snug">{node.label}</p>
        {node.note ? (
          <p className="mt-0.5 text-xs opacity-80">{node.note}</p>
        ) : null}
      </div>

      {node.children?.length ? (
        <ul
          className="mt-2 flex flex-col gap-2 border-l-2 pl-3"
          style={{ borderColor: depth % 2 === 0 ? '#cfe0f5' : '#e3e8ef' }}
        >
          {node.children.map((child) => (
            <Node key={child.label} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export const TroubleshootingPage = () => {
  const [open, setOpen] = useState<string | null>(BRANCHES[0]?.id ?? null)

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
            <p className="text-sm text-muted">{SOP_META.title}</p>
            <p className="mt-1 text-[11px] font-semibold text-muted">
              {SOP_META.version} · {SOP_META.date}
            </p>
          </div>
        </header>

        <section className="card flex flex-col gap-1.5 p-4 text-sm sm:p-5">
          <p className="text-ink">
            <span className="font-bold">Purpose:</span> {SOP_META.purpose}
          </p>
          <p className="text-ink">
            <span className="font-bold">Scope:</span> {SOP_META.scope}
          </p>
          <p className="text-ink">
            <span className="font-bold">Responsibilities:</span>{' '}
            {SOP_META.responsibilities}
          </p>
        </section>

        <div
          className="rounded-xl border px-4 py-3 text-center text-base font-bold"
          style={{
            backgroundColor: TONE.start.bg,
            borderColor: TONE.start.border,
            color: TONE.start.text,
          }}
        >
          {SOP_META.start}
        </div>

        <section className="card flex flex-col gap-3 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <ClipboardList
              className="h-5 w-5 text-screw-2"
              aria-hidden="true"
            />
            {FULL_TEST.title}
          </h2>
          <ol className="flex flex-col gap-2">
            {FULL_TEST.items.map((item, index) => (
              <li key={item} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef5fd] text-xs font-bold text-screw-2">
                  {index + 1}
                </span>
                <span className="text-sm text-ink">{item}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex items-center gap-2 px-1 text-xs font-semibold text-muted">
          <CornerDownRight className="h-4 w-4" aria-hidden="true" />
          Keputusan Full Test menentukan cabang di bawah
        </div>

        <nav
          className="flex flex-col gap-3"
          aria-label="Cabang troubleshooting"
        >
          {BRANCHES.map((branch) => {
            const expanded = open === branch.id
            const tone = TONE[branch.tone]

            return (
              <section key={branch.id} className="card overflow-hidden">
                <h2>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : branch.id)}
                    className="flex w-full min-h-14 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas"
                  >
                    <span
                      className="h-9 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tone.border }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-ink">
                        {branch.label}
                      </span>
                      {branch.note ? (
                        <span className="block text-xs text-muted">
                          {branch.note}
                        </span>
                      ) : null}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </h2>

                {expanded ? (
                  <ul className="flex flex-col gap-2 border-t border-line px-4 py-4">
                    {branch.nodes.map((node) => (
                      <Node key={node.label} node={node} depth={0} />
                    ))}
                  </ul>
                ) : null}
              </section>
            )
          })}
        </nav>

        <section className="card flex flex-col gap-3 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <CircleAlert className="h-5 w-5 text-[#c8393c]" aria-hidden="true" />
            {RARE_EVENTS.title}
          </h2>
          <ol className="flex flex-col gap-2">
            {RARE_EVENTS.items.map((item, index) => (
              <li key={item} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fdecec] text-xs font-bold text-[#c8393c]">
                  {index + 1}
                </span>
                <span className="text-sm text-ink">{item}</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="pb-4 text-center text-xs text-muted">
          Kandungan mengikut {SOP_META.title} ({SOP_META.version},{' '}
          {SOP_META.date}).
        </p>
      </div>
    </div>
  )
}
