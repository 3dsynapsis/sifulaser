import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Crown,
  GraduationCap,
  LogIn,
  MapPin,
  Minus,
  Sparkles,
  Users,
} from 'lucide-react'
import { CLASS_INFO, PLAN_FAQ, PLAN_FEATURES, type TierId } from '../data/plans'
import {
  ACCESS_PERIOD_LABEL,
  CLASS_ORIGINAL_PRICE_LABEL,
  CLASS_PRICE_LABEL,
  CLASS_SAVING_LABEL,
  ORIGINAL_PRICE_LABEL,
  PRICE_LABEL,
  SAVING_LABEL,
} from '../lib/access'
import { useAuth } from '../lib/auth'

const featuresFor = (tier: TierId) =>
  PLAN_FEATURES.filter((feature) => feature.tiers.includes(tier))

const TIER_COLUMNS: { id: TierId; label: string; accent: string }[] = [
  { id: 'free', label: 'Percuma', accent: 'text-muted' },
  { id: 'full', label: 'Akses Penuh', accent: 'text-[#a3540b]' },
  { id: 'class', label: 'Kelas + Akses', accent: 'text-[#6d28d9]' },
]

export const PlansPage = () => {
  const { configured, user, paid, paidUntil, signIn } = useAuth()

  const expiryLabel = paidUntil
    ? paidUntil.toLocaleDateString('ms-MY', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  const needsLogin = configured && !user

  const CallToAction = ({ color }: { color: string }) =>
    needsLogin ? (
      <button
        type="button"
        onClick={() => void signIn()}
        className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-screw-2 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a67b6]"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Log masuk dahulu
      </button>
    ) : (
      <a
        href="#/bayar"
        className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: color }}
      >
        <Crown className="h-4 w-4" aria-hidden="true" />
        Naik taraf sekarang
      </a>
    )

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-4 py-5 sm:py-8">
        <a
          href="#/"
          className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Utama
        </a>

        <header className="text-center">
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">
            Pakej &amp; Harga
          </h1>
          <p className="mx-auto mt-2 max-w-[560px] text-sm text-muted sm:text-base">
            Mula percuma dengan simulator cermin. Naik taraf untuk buka semua
            level dan panduan selama {ACCESS_PERIOD_LABEL} — atau belajar terus
            di hadapan sifu dalam kelas bersemuka.
          </p>
          {paid && configured ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#fdf3e8] px-3 py-1.5 text-xs font-bold text-[#a3540b] sm:text-sm">
              <Crown className="h-4 w-4" aria-hidden="true" />
              {expiryLabel
                ? `Akses Penuh anda sah sehingga ${expiryLabel}`
                : 'Anda sudah mempunyai Akses Penuh — terima kasih!'}
            </p>
          ) : null}
        </header>

        {/* Tiga pakej */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Percuma */}
          <section className="card flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-lg font-bold text-ink">Percuma</h2>
              <p className="mt-1 text-3xl font-extrabold text-ink">
                RM0
                <span className="ml-1 text-sm font-semibold text-muted">
                  selamanya
                </span>
              </p>
              <p className="mt-1 text-sm text-muted">
                Cuba simulator dan kenali SifuLaser. Tiada pendaftaran
                diperlukan.
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {featuresFor('free').map((feature) => (
                <li key={feature.label} className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-screw-3"
                    aria-hidden="true"
                  />
                  <span className="text-sm text-ink">{feature.label}</span>
                </li>
              ))}
              <li className="flex items-start gap-2">
                <Minus
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                  aria-hidden="true"
                />
                <span className="text-sm text-muted">
                  Level 2–5 dan panduan maintenance tidak termasuk
                </span>
              </li>
            </ul>

            <a
              href="#/simulator"
              className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
            >
              Mula guna percuma
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </section>

          {/* Akses Penuh */}
          <section className="card relative flex flex-col gap-4 border-2 border-[#e07514] p-5">
            <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-[#e07514] px-3 py-1 text-[11px] font-bold text-white">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Paling popular
            </span>

            <div>
              <h2 className="text-lg font-bold text-ink">Akses Penuh</h2>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-bold text-muted line-through">
                  {ORIGINAL_PRICE_LABEL}
                </span>
                <span className="text-3xl font-extrabold text-[#e07514]">
                  {PRICE_LABEL}
                </span>
                <span className="text-xs font-semibold text-muted">
                  / {ACCESS_PERIOD_LABEL}
                </span>
              </p>
              <p className="mt-1 inline-flex w-fit items-center rounded-full bg-[#edf9f1] px-2.5 py-0.5 text-xs font-bold text-[#147a37]">
                {SAVING_LABEL} — harga pengenalan
              </p>
              <p className="mt-2 text-sm text-muted">
                Semua kandungan digital dibuka selama {ACCESS_PERIOD_LABEL} dari
                tarikh pembayaran.
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {featuresFor('full')
                .filter((feature) => !feature.tiers.includes('free'))
                .map((feature) => (
                  <li key={feature.label} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#e07514]"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-ink">{feature.label}</span>
                  </li>
                ))}
            </ul>

            <CallToAction color="#e07514" />
          </section>

          {/* Kelas + Akses Penuh */}
          <section className="card relative flex flex-col gap-4 border-2 border-[#7c3aed] p-5">
            <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-[#7c3aed] px-3 py-1 text-[11px] font-bold text-white">
              <Users className="h-3 w-3" aria-hidden="true" />
              {CLASS_INFO.seatsLabel}
            </span>

            <div>
              <h2 className="text-lg font-bold text-ink">
                Kelas Training + Akses Penuh
              </h2>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-bold text-muted line-through">
                  {CLASS_ORIGINAL_PRICE_LABEL}
                </span>
                <span className="text-3xl font-extrabold text-[#7c3aed]">
                  {CLASS_PRICE_LABEL}
                </span>
              </p>
              <p className="mt-1 inline-flex w-fit items-center rounded-full bg-[#edf9f1] px-2.5 py-0.5 text-xs font-bold text-[#147a37]">
                {CLASS_SAVING_LABEL}
              </p>
            </div>

            <dl className="flex flex-col gap-1.5 rounded-xl border border-[#e2d5f8] bg-[#f4effd] p-3">
              <div className="flex items-center gap-2">
                <CalendarDays
                  className="h-4 w-4 shrink-0 text-[#6d28d9]"
                  aria-hidden="true"
                />
                <dt className="sr-only">Tarikh</dt>
                <dd className="text-xs font-bold text-[#6d28d9]">
                  {CLASS_INFO.dateLabel}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <Clock
                  className="h-4 w-4 shrink-0 text-[#6d28d9]"
                  aria-hidden="true"
                />
                <dt className="sr-only">Masa</dt>
                <dd className="text-xs font-bold text-[#6d28d9]">
                  {CLASS_INFO.timeLabel} ({CLASS_INFO.durationLabel})
                </dd>
              </div>
              <div className="flex items-start gap-2">
                <MapPin
                  className="mt-px h-4 w-4 shrink-0 text-[#6d28d9]"
                  aria-hidden="true"
                />
                <dt className="sr-only">Lokasi</dt>
                <dd className="text-xs font-bold text-[#6d28d9]">
                  <a
                    href={CLASS_INFO.locationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-[#c4b5fd] underline-offset-2 transition-colors hover:decoration-[#6d28d9]"
                  >
                    {CLASS_INFO.locationLabel}
                  </a>
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <GraduationCap
                  className="h-4 w-4 shrink-0 text-[#6d28d9]"
                  aria-hidden="true"
                />
                <dt className="sr-only">Termasuk</dt>
                <dd className="text-xs font-bold text-[#6d28d9]">
                  Termasuk Akses Penuh {ACCESS_PERIOD_LABEL}
                </dd>
              </div>
            </dl>

            <ul className="flex flex-col gap-2">
              {featuresFor('class')
                .filter((feature) => feature.tiers.length === 1)
                .map((feature) => (
                  <li key={feature.label} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#7c3aed]"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-ink">{feature.label}</span>
                  </li>
                ))}
              <li className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#7c3aed]"
                  aria-hidden="true"
                />
                <span className="text-sm text-ink">
                  Semua kandungan dalam pakej Akses Penuh
                </span>
              </li>
            </ul>

            <CallToAction color="#7c3aed" />
          </section>
        </div>

        {/* Jadual perbandingan penuh */}
        <section className="card overflow-hidden p-0">
          <h2 className="border-b border-line px-5 py-4 text-base font-bold text-ink sm:text-lg">
            Perbandingan penuh
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-canvas">
                  <th className="px-5 py-3 text-xs font-bold text-muted uppercase">
                    Kandungan
                  </th>
                  {TIER_COLUMNS.map((column) => (
                    <th
                      key={column.id}
                      className={`w-24 px-3 py-3 text-center text-xs font-bold uppercase ${column.accent}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURES.map((feature) => (
                  <tr
                    key={feature.label}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-5 py-3">
                      <span className="block text-sm font-semibold text-ink">
                        {feature.label}
                      </span>
                      {feature.detail ? (
                        <span className="mt-0.5 block text-xs text-muted">
                          {feature.detail}
                        </span>
                      ) : null}
                    </td>
                    {TIER_COLUMNS.map((column) => (
                      <td key={column.id} className="px-3 py-3 text-center">
                        {feature.tiers.includes(column.id) ? (
                          <Check
                            className={`mx-auto h-5 w-5 ${
                              column.id === 'free'
                                ? 'text-screw-3'
                                : column.id === 'full'
                                  ? 'text-[#e07514]'
                                  : 'text-[#7c3aed]'
                            }`}
                            aria-label="Termasuk"
                          />
                        ) : (
                          <Minus
                            className="mx-auto h-5 w-5 text-line"
                            aria-label="Tidak termasuk"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Soalan lazim */}
        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-base font-bold text-ink sm:text-lg">
            Soalan lazim
          </h2>
          <dl className="flex flex-col gap-4">
            {PLAN_FAQ.map((item) => (
              <div key={item.question}>
                <dt className="text-sm font-bold text-ink">{item.question}</dt>
                <dd className="mt-1 text-sm text-muted">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="pb-4 text-center text-xs text-muted">
          Harga dalam Ringgit Malaysia. WhatsApp kami untuk urusan pembayaran
          dan naik taraf akaun.
        </p>
      </div>
    </div>
  )
}
