import { ArrowLeft, Box, ExternalLink } from 'lucide-react'

/**
 * Box Maker ialah aplikasi statik berasingan yang dihidangkan dari
 * `docs/boxmaker/`. Ia dimuatkan dalam iframe supaya navigasi dan jenama
 * SifuLaser kekal, tanpa perlu menulis semula aplikasi itu dalam React.
 */
export const BoxMakerPage = () => (
  <div className="flex h-[100svh] flex-col bg-canvas">
    <header className="shrink-0 bg-surface">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <a
            href="#/"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-ink"
            aria-label="Kembali ke halaman utama SifuLaser"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </a>
          <span
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f7ee] sm:inline-flex"
            aria-hidden="true"
          >
            <Box className="h-5 w-5 text-[#3f8f52]" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base leading-tight font-bold text-ink sm:text-xl">
              Box Maker
            </h1>
            <p className="truncate text-xs text-muted sm:text-sm">
              Reka kotak finger joint, terus dapat fail SVG untuk dipotong
            </p>
          </div>
        </div>
        <a
          href="/boxmaker/"
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink sm:px-3"
        >
          <ExternalLink className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">Skrin penuh</span>
        </a>
      </div>
    </header>
    <iframe
      src="/boxmaker/"
      title="Box Maker — pereka kotak laser"
      className="min-h-0 w-full flex-1 border-0"
    />
  </div>
)
