import { Info, RefreshCw } from 'lucide-react'

interface ResetPanelProps {
  onReset: () => void
  className?: string
}

export const ResetPanel = ({ onReset, className }: ResetPanelProps) => (
  <section className={`card flex flex-col gap-4 p-4 sm:p-5 ${className ?? ''}`}>
    <button
      type="button"
      onClick={onReset}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-beam px-4 py-3 text-base font-semibold text-white transition-[background-color,transform] hover:bg-[#c81f24] active:scale-[0.99]"
      aria-label="Reset alignment dan mulakan latihan baharu dari kedudukan rawak"
    >
      <RefreshCw className="h-5 w-5" aria-hidden="true" />
      Reset Alignment
    </button>
    <div className="rounded-xl border border-[#cfe0f5] bg-[#eef5fd] p-3 sm:p-4">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-screw-2">
        <Info className="h-4 w-4" aria-hidden="true" />
        Maklumat
      </h3>
      <p className="text-xs text-[#2b4d73] sm:text-sm">
        Pastikan mesin dalam keadaan selamat dan penutup ditutup semasa latihan
        simulasi ini.
      </p>
    </div>
  </section>
)
