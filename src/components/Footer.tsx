import { ShieldCheck } from 'lucide-react'

export const Footer = ({ className }: { className?: string }) => (
  <footer
    className={`flex flex-col items-center gap-1.5 px-4 py-2 text-center ${className ?? ''}`}
  >
    <p className="flex items-center justify-center gap-2 text-xs font-medium text-muted sm:text-sm">
      <ShieldCheck className="h-4 w-4 shrink-0 text-screw-3" aria-hidden="true" />
      Keselamatan diutamakan. Ikuti prosedur keselamatan mesin laser anda.
    </p>
    <p className="text-xs text-muted">
      Simulator ini hanya untuk tujuan latihan dan tidak mengawal mesin laser
      sebenar.
    </p>
  </footer>
)
