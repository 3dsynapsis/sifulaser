import { ArrowLeft, Award, ExternalLink } from 'lucide-react'

/**
 * Plak Box ialah aplikasi statik berasingan yang dihidangkan dari
 * `docs/plakbox/`. Sama seperti alat-alat lain, ia dimuatkan dalam iframe
 * supaya jenama dan navigasi SifuLaser kekal.
 *
 * Award, kerana produknya plak cenderahati dalam kotak pameran. AboutPage
 * memakai glif yang sama untuk pencapaian, tetapi tiada ALAT lain yang
 * memakainya, jadi pada laman utama ia tetap unik.
 *
 * Alat ini ADA butang export (id="exportBtn" dalam sumbernya), jadi gate log
 * masuk /shared/export-gate.js menyentuhnya seperti Box Maker dan Tray.
 */
export const PlakBoxPage = () => (
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
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f6efe7] sm:inline-flex"
            aria-hidden="true"
          >
            <Award className="h-5 w-5 text-[#8a5a3b]" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base leading-tight font-bold text-ink sm:text-xl">
              Plak Box
            </h1>
            <p className="truncate text-xs text-muted sm:text-sm">
              Tapak cetak 3D (STL) dan saiz kotak akrilik untuk plak cenderahati
            </p>
          </div>
        </div>
        <a
          href="/plakbox/"
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
      src="/plakbox/"
      title="Plak Box — tapak cetak 3D dan kotak akrilik untuk plak"
      className="min-h-0 w-full flex-1 border-0"
    />
  </div>
)
