import { Crown, LockKeyhole, LogIn } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { PRICE_LABEL } from '../lib/access'
import { upgradeWhatsappUrl } from '../lib/upgrade'

interface LockedNoticeProps {
  /** Nama bahagian yang dikunci, contoh: "Panduan maintenance". */
  what: string
}

export const LockedNotice = ({ what }: LockedNoticeProps) => {
  const { configured, user, signIn } = useAuth()

  return (
    <section className="card flex flex-col items-center gap-3 p-5 text-center sm:p-6">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fdf3e8]">
        <LockKeyhole className="h-7 w-7 text-[#e07514]" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-base font-bold text-ink sm:text-lg">
          {what} untuk Akses Penuh
        </h2>
        <p className="mt-1 text-sm text-muted">
          {configured && !user
            ? 'Log masuk dahulu untuk semak status akaun anda.'
            : `Naik taraf sekali sahaja ${PRICE_LABEL} untuk buka semua level simulator dan panduan maintenance.`}
        </p>
      </div>

      {configured && !user ? (
        <button
          type="button"
          onClick={() => void signIn()}
          className="inline-flex min-h-11 w-full max-w-[320px] items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a67b6]"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Log masuk dengan Google
        </button>
      ) : (
        <a
          href={upgradeWhatsappUrl(user?.email)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full max-w-[320px] items-center justify-center gap-2 rounded-xl bg-[#e07514] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c76409]"
        >
          <Crown className="h-4 w-4" aria-hidden="true" />
          Naik taraf — {PRICE_LABEL}
        </a>
      )}

      <a
        href="#/"
        className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        Kembali ke halaman utama
      </a>
    </section>
  )
}
