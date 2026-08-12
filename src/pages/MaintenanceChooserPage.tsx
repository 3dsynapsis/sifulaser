import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  Snowflake,
  Wifi,
  Wrench,
} from 'lucide-react'

const OPTIONS = [
  {
    href: '#/weekly',
    title: 'Weekly Maintenance',
    description: 'Senarai semak mingguan untuk prestasi mesin sentiasa optimum.',
    meta: 'Setiap Sabtu · ±5 minit',
    color: '#20a04a',
    softBg: '#edf9f1',
    border: '#c9ecd6',
    Icon: ClipboardCheck,
  },
  {
    href: '#/yearly',
    title: 'Yearly Maintenance',
    description:
      'Panduan penyelenggaraan berkala untuk jangka hayat mesin yang lebih lama.',
    meta: 'Ikut jadual kalendar · 1 jam / 1 mesin',
    color: '#e07514',
    softBg: '#fdf3e8',
    border: '#f6ddc0',
    Icon: CalendarClock,
  },
  {
    href: '#/wifi',
    title: 'Cara Setup WiFi',
    description:
      'Sambungkan mesin laser (board Trocen) ke WiFi office dengan TP-Link Range Extender.',
    meta: 'Sekali setup · ±15 minit',
    color: '#2f6fe4',
    softBg: '#edf3fd',
    border: '#c9dcf6',
    Icon: Wifi,
  },
  {
    href: '#/chiller',
    title: 'Cara Setting Chiller CW5000',
    description:
      'Setting terbaik CW-5000 untuk negara lembap seperti Malaysia — dengan video panduan.',
    meta: 'Sekali setup · ±5 minit',
    color: '#0891b2',
    softBg: '#e8f7fb',
    border: '#c4e9f2',
    Icon: Snowflake,
  },
]

export const MaintenanceChooserPage = () => (
  <div className="min-h-screen bg-canvas">
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
      <a
        href="#/"
        className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Utama
      </a>

      <header className="card flex items-center gap-4 p-4 sm:p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#edf9f1]">
          <Wrench className="h-7 w-7 text-screw-3" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-ink sm:text-xl">Maintenance</h1>
          <p className="text-sm text-muted">
            Pilih jenis penyelenggaraan yang anda mahu lakukan.
          </p>
        </div>
      </header>

      <nav className="flex flex-col gap-4" aria-label="Pilihan maintenance">
        {OPTIONS.map(
          ({ href, title, description, meta, color, softBg, border, Icon }) => (
            <a
              key={href}
              href={href}
              className="card group flex items-center gap-4 p-4 transition-transform hover:-translate-y-0.5 sm:p-5"
              style={{ borderColor: border }}
            >
              <span
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: softBg }}
                aria-hidden="true"
              >
                <Icon className="h-10 w-10" style={{ color }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-ink sm:text-lg">
                  {title}
                </span>
                <span className="mt-0.5 block text-xs text-muted sm:text-sm">
                  {description}
                </span>
                <span
                  className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {meta}
                </span>
              </span>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform group-hover:translate-x-0.5"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              >
                <ArrowRight className="h-5 w-5" />
              </span>
            </a>
          ),
        )}
      </nav>
    </div>
  </div>
)
