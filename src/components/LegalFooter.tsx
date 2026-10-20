import { COMPANY, LEGAL_PAGES } from '../data/company'

/**
 * Nama syarikat, nombor SSM dan pautan polisi di kaki setiap halaman yang
 * dibaca orang (utama, About, Pakej, Bayar). Pemeriksa gerbang pembayaran
 * mencari ini, dan pelanggan yang membayar berhak tahu dengan siapa mereka
 * berurusan. Page polisi itu sendiri fail statik - lihat
 * scripts/build-legal.mjs.
 */
export const LegalFooter = ({ className }: { className?: string }) => (
  <footer
    className={`flex flex-col items-center gap-2 px-4 pb-6 pt-2 text-center text-xs text-muted ${className ?? ''}`}
  >
    <nav
      aria-label="Polisi"
      className="flex flex-wrap justify-center gap-x-4 gap-y-1.5"
    >
      {LEGAL_PAGES.map((page) => (
        <a
          key={page.path}
          href={page.path}
          className="font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {page.ms}
        </a>
      ))}
    </nav>
    <p>
      &copy; 2026 {COMPANY.name}, SSM {COMPANY.regNo} &middot; {COMPANY.brand}
    </p>
  </footer>
)
