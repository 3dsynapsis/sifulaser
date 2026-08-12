import type { RefObject } from 'react'
import { ArrowLeft, CircleQuestionMark, Settings } from 'lucide-react'

const AppLogo = ({ className }: { className?: string }) => (
  <span
    className={`inline-flex items-center justify-center rounded-xl bg-[#111c33] ${className ?? ''}`}
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 24 24"
      className="h-3/5 w-3/5"
      role="presentation"
      focusable="false"
    >
      <g stroke="var(--color-beam)" strokeWidth="1.8" strokeLinecap="round">
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
        <line x1="18.4" y1="5.6" x2="5.6" y2="18.4" />
      </g>
      <circle cx="12" cy="12" r="3.6" fill="var(--color-beam)" />
      <circle cx="12" cy="12" r="1.6" fill="#ffd9d9" />
    </svg>
  </span>
)

const headerButtonClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink sm:px-3'

interface AppHeaderProps {
  onOpenHelp: () => void
  onOpenSettings: () => void
  helpButtonRef: RefObject<HTMLButtonElement | null>
  settingsButtonRef: RefObject<HTMLButtonElement | null>
}

export const AppHeader = ({
  onOpenHelp,
  onOpenSettings,
  helpButtonRef,
  settingsButtonRef,
}: AppHeaderProps) => (
  <header className="bg-surface">
    <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <a
          href="#/"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-ink"
          aria-label="Kembali ke halaman utama SifuLaser"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </a>
        <AppLogo className="h-10 w-10 shrink-0 sm:h-12 sm:w-12" />
        <div className="min-w-0">
          <h1 className="truncate text-base leading-tight font-bold text-ink sm:text-2xl">
            Simulator Alignment Mesin Laser
          </h1>
          <p className="truncate text-xs text-muted sm:text-sm">
            Latihan pelarasan cermin laser
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          ref={helpButtonRef}
          onClick={onOpenHelp}
          className={headerButtonClass}
          aria-label="Buka panduan bantuan simulator"
        >
          <CircleQuestionMark className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">Bantuan</span>
        </button>
        <button
          type="button"
          ref={settingsButtonRef}
          onClick={onOpenSettings}
          className={headerButtonClass}
          aria-label="Buka tetapan simulator"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">Tetapan</span>
        </button>
      </div>
    </div>
  </header>
)
