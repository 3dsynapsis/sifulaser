import { Crown, LogIn, LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { PRICE_LABEL } from '../lib/access'
import { upgradeWhatsappUrl } from '../lib/upgrade'

export const AccountBar = () => {
  const { configured, user, paid, loading, signIn, signOut, error } = useAuth()

  if (!configured) return null

  if (loading) {
    return (
      <div className="card flex min-h-[68px] items-center gap-3 p-4">
        <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-line" />
        <span className="h-4 w-40 animate-pulse rounded bg-line" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef5fd]">
            <UserRound className="h-5 w-5 text-screw-2" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted">
            Log masuk untuk akses penuh — semua level simulator dan panduan
            maintenance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signIn()}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a67b6]"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Log masuk dengan Google
        </button>
        {error ? (
          <p className="text-xs font-semibold text-[#8a2226]">{error}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="h-10 w-10 shrink-0 rounded-full border border-line object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef5fd]">
            <UserRound className="h-5 w-5 text-screw-2" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">
            {user.displayName || user.email}
          </p>
          {paid ? (
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#fdf3e8] px-2 py-0.5 text-[11px] font-bold text-[#a3540b]">
              <Crown className="h-3 w-3" aria-hidden="true" />
              Akses Penuh
            </span>
          ) : (
            <span className="mt-0.5 inline-block rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold text-muted">
              Akaun Percuma
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Log keluar</span>
        </button>
      </div>
      {!paid ? (
        <a
          href={upgradeWhatsappUrl(user.email)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#e07514] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c76409]"
        >
          <Crown className="h-4 w-4" aria-hidden="true" />
          Naik taraf ke Akses Penuh — {PRICE_LABEL}
        </a>
      ) : null}
    </div>
  )
}
