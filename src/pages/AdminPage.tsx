import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Crown,
  GraduationCap,
  ChartNoAxesColumn,
  MailWarning,
  ShieldCheck,
  Undo2,
  UserRound,
  Users,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  isAccessActive,
  isAdmin,
  isClassParticipant,
  grantAccess,
  revokeAccess,
  subscribeUsers,
  type AdminUserRow,
} from '../lib/admin'
import { ACCESS_PERIOD_LABEL } from '../lib/access'
import {
  IS_MAIL_CONFIGURED,
  sendAccessEmail,
  type MailKind,
} from '../lib/mail'
import { CLASS_SEAT_LIMIT } from '../data/plans'

type Filter = 'semua' | 'akses' | 'kelas' | 'percuma'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'semua', label: 'Semua' },
  { id: 'akses', label: 'Akses Penuh' },
  { id: 'kelas', label: 'Peserta Kelas' },
  { id: 'percuma', label: 'Percuma' },
]

const formatDate = (date: Date | null): string =>
  date
    ? date.toLocaleDateString('ms-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export const AdminPage = () => {
  const { user, loading: authLoading } = useAuth()
  const admin = isAdmin(user)

  const [rows, setRows] = useState<AdminUserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mailFailed, setMailFailed] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('semua')

  useEffect(() => {
    if (!admin) return
    return subscribeUsers(setRows, setError)
  }, [admin])

  const filtered = useMemo(() => {
    if (!rows) return null
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      const active = isAccessActive(row)
      const matchFilter =
        filter === 'semua'
          ? true
          : filter === 'kelas'
            ? isClassParticipant(row)
            : filter === 'akses'
              ? active
              : !active
      if (!matchFilter) return false
      if (!needle) return true
      return (
        row.email.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle)
      )
    })
  }, [rows, search, filter])

  const stats = useMemo(() => {
    if (!rows) return null
    const active = rows.filter(isAccessActive).length
    // Paid as well as marked, because a seat is something an admin granted.
    // The rules now stop anyone writing `plan` into their own record, so this
    // is the second line rather than the first - and it also ignores any
    // record that was written before those rules were tightened.
    const kelas = rows.filter((row) => isClassParticipant(row) && row.paid).length
    return { total: rows.length, active, kelas, free: rows.length - active }
  }, [rows])

  /**
   * Jalankan tindakan admin, kemudian hantar email pemberitahuan.
   *
   * Kegagalan email tidak membatalkan akses yang sudah tersimpan — admin
   * sekadar dimaklumkan supaya boleh emailkan pelanggan secara manual.
   */
  const runAction = async (
    row: AdminUserRow,
    kind: MailKind,
    action: () => Promise<Date | null>,
  ) => {
    setBusyUid(row.uid)
    setError(null)
    setNotice(null)
    setMailFailed(null)

    let expiry: Date | null = null
    try {
      expiry = await action()
    } catch {
      setError('Tindakan gagal. Sila cuba lagi.')
      setBusyUid(null)
      return
    }

    if (!IS_MAIL_CONFIGURED) {
      setBusyUid(null)
      return
    }

    const sent = await sendAccessEmail(
      kind,
      { email: row.email, name: row.name },
      expiry,
    )
    if (sent) {
      setNotice(`Email pemberitahuan dihantar kepada ${row.email}.`)
    } else {
      setMailFailed(row.email)
    }
    setBusyUid(null)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto w-full max-w-[860px] px-4 py-8">
          <div className="card h-40 animate-pulse" />
        </div>
      </div>
    )
  }

  if (!admin) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-8">
          <section className="card flex flex-col items-center gap-3 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas">
              <ShieldCheck className="h-7 w-7 text-muted" aria-hidden="true" />
            </span>
            <h1 className="text-lg font-bold text-ink">Halaman admin</h1>
            <p className="text-sm text-muted">
              Halaman ini hanya untuk pentadbir SifuLaser.
            </p>
            <a
              href="#/"
              className="text-sm font-semibold text-screw-2 underline-offset-2 hover:underline"
            >
              Kembali ke halaman utama
            </a>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-5 sm:py-8">
        <a
          href="#/"
          className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Utama
        </a>

        <header className="card flex items-center gap-4 p-4 sm:p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eef5fd]">
            <ShieldCheck className="h-6 w-6 text-screw-2" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-ink sm:text-xl">
              Panel Admin
            </h1>
            <p className="text-sm text-muted">
              Luluskan akses {ACCESS_PERIOD_LABEL} dan tandakan peserta kelas.
            </p>
          </div>
        </header>

        {stats ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card flex flex-col items-center gap-0.5 p-3">
              <Users className="h-4 w-4 text-muted" aria-hidden="true" />
              <span className="text-xl font-extrabold text-ink">
                {stats.total}
              </span>
              <span className="text-[11px] font-semibold text-muted">
                Jumlah akaun
              </span>
            </div>
            <div className="card flex flex-col items-center gap-0.5 p-3">
              <Crown className="h-4 w-4 text-[#e07514]" aria-hidden="true" />
              <span className="text-xl font-extrabold text-[#e07514]">
                {stats.active}
              </span>
              <span className="text-[11px] font-semibold text-muted">
                Akses Penuh
              </span>
            </div>
            <div className="card flex flex-col items-center gap-0.5 p-3">
              <GraduationCap
                className="h-4 w-4 text-[#7c3aed]"
                aria-hidden="true"
              />
              <span className="text-xl font-extrabold text-[#7c3aed]">
                {stats.kelas}
                <span className="text-sm font-bold text-muted">
                  /{CLASS_SEAT_LIMIT}
                </span>
              </span>
              <span className="text-[11px] font-semibold text-muted">
                Peserta Kelas
              </span>
            </div>
            <div className="card flex flex-col items-center gap-0.5 p-3">
              <UserRound className="h-4 w-4 text-muted" aria-hidden="true" />
              <span className="text-xl font-extrabold text-ink">
                {stats.free}
              </span>
              <span className="text-[11px] font-semibold text-muted">
                Percuma
              </span>
            </div>
          </div>
        ) : null}

        {/*
          Cloudflare holds the visitor numbers, and reading them needs an API
          token. This site is static - GitHub Pages, no server of its own - so a
          token shipped with the app would be readable by anyone who opened the
          console, and the admin check above is React, not security. So the panel
          points at the numbers rather than fetching them.

          The account is left out of the URL on purpose: Cloudflare resolves
          ":account" against whoever is signed in, which keeps the account id out
          of a bundle anybody can download.
        */}
        <a
          className="card flex items-center gap-3 p-4 transition hover:border-screw-2"
          href="https://dash.cloudflare.com/?to=/:account/web-analytics"
          target="_blank"
          rel="noreferrer noopener"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef5fd]">
            <ChartNoAxesColumn
              className="h-5 w-5 text-screw-2"
              aria-hidden="true"
            />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">
              Pelawat laman
            </span>
            <span className="block text-xs text-muted">
              Cloudflare Web Analytics - tukar julat ke 7 hari untuk pelawat
              mingguan. Meliputi laman utama dan kelapan-lapan alat.
            </span>
          </span>
        </a>

        {stats && stats.kelas >= CLASS_SEAT_LIMIT ? (
          <p className="rounded-xl border border-[#f6ddc0] bg-[#fdf3e8] px-4 py-3 text-sm font-semibold text-[#a3540b]">
            Tempat kelas sudah penuh ({stats.kelas}/{CLASS_SEAT_LIMIT}).
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                filter === item.id
                  ? 'border-screw-2 bg-[#eef5fd] text-screw-2'
                  : 'border-line bg-surface text-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama atau email…"
          className="min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink outline-none focus:border-screw-2"
        />

        {error ? (
          <p className="rounded-xl border border-[#f4cfd0] bg-[#fdf0f0] px-4 py-3 text-sm font-semibold text-[#8a2226]">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-xl border border-[#cfe5d3] bg-[#f0f9f2] px-4 py-3 text-sm font-semibold text-[#1f6b33]">
            {notice}
          </p>
        ) : null}

        {mailFailed ? (
          <p className="flex items-start gap-2 rounded-xl border border-[#f6ddc0] bg-[#fdf3e8] px-4 py-3 text-sm font-semibold text-[#a3540b]">
            <MailWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Akses telah dikemas kini, tetapi email gagal dihantar kepada{' '}
              {mailFailed}. Sila maklumkan pelanggan secara manual.
            </span>
          </p>
        ) : null}

        {filtered === null ? (
          <div className="card h-40 animate-pulse" />
        ) : filtered.length === 0 ? (
          <p className="card p-6 text-center text-sm text-muted">
            {rows && rows.length === 0
              ? 'Belum ada pengguna yang mendaftar.'
              : 'Tiada pengguna sepadan dengan carian atau penapis anda.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((row) => {
              const active = isAccessActive(row)
              const expired = row.paid && !active
              const kelas = isClassParticipant(row)
              const busy = busyUid === row.uid

              return (
                <li key={row.uid} className="card flex flex-col gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">
                      {row.name || '(tiada nama)'}
                    </p>
                    <p className="truncate text-xs text-muted">{row.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fdf3e8] px-2 py-0.5 text-[11px] font-bold text-[#a3540b]">
                          <Crown className="h-3 w-3" aria-hidden="true" />
                          Sehingga {formatDate(row.paidUntil)}
                        </span>
                      ) : expired ? (
                        <span className="rounded-full bg-[#fdf0f0] px-2 py-0.5 text-[11px] font-bold text-[#8a2226]">
                          Luput {formatDate(row.paidUntil)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold text-muted">
                          Percuma
                        </span>
                      )}
                      {kelas ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f4effd] px-2 py-0.5 text-[11px] font-bold text-[#6d28d9]">
                          <GraduationCap className="h-3 w-3" aria-hidden="true" />
                          Peserta Kelas
                        </span>
                      ) : null}
                      <span className="text-[11px] text-muted">
                        Daftar {formatDate(row.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(row, 'full', () =>
                          grantAccess(row, 'full'),
                        )
                      }
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#e07514] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#c76409] disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {active ? 'Lanjut Akses' : 'Beri Akses'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(row, 'class', () =>
                          grantAccess(row, 'class'),
                        )
                      }
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#7c3aed] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:opacity-50"
                    >
                      <GraduationCap className="h-4 w-4" aria-hidden="true" />
                      {kelas ? 'Lanjut Kelas' : 'Beri Kelas'}
                    </button>
                    {row.paid ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(row, 'revoke', async () => {
                            await revokeAccess(row.uid)
                            return null
                          })
                        }
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-50"
                      >
                        <Undo2 className="h-4 w-4" aria-hidden="true" />
                        Tarik
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <p className="pb-4 text-center text-xs text-muted">
          Kedua-dua butang memberi akses digital {ACCESS_PERIOD_LABEL}; butang
          ungu menandakan pelanggan sebagai peserta kelas bersemuka.
          {IS_MAIL_CONFIGURED
            ? ' Pelanggan menerima email pemberitahuan automatik.'
            : ' Email automatik belum diaktifkan — kunci EmailJS belum diisi.'}
        </p>
      </div>
    </div>
  )
}
