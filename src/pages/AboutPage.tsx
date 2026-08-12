import {
  ArrowLeft,
  Award,
  Crosshair,
  Sparkles,
  UserRound,
  Wrench,
} from 'lucide-react'

export const AboutPage = () => (
  <div className="min-h-screen bg-canvas">
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
      <a
        href="#/"
        className="inline-flex w-fit min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Utama
      </a>

      <header className="card flex flex-col items-center gap-3 p-6 text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-[#f4effd]">
          <UserRound className="h-12 w-12 text-[#7c3aed]" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-extrabold text-ink">About Me</h1>
        <p className="text-sm text-muted">
          Di sebalik <span className="font-bold text-ink">Sifu</span>
          <span className="font-bold italic text-screw-2">Laser</span> —{' '}
          ALIGN. MAINTAIN. PERFORM.
        </p>
      </header>

      <section className="card flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg">
          <Award className="h-5 w-5 text-[#7c3aed]" aria-hidden="true" />
          Founder
        </h2>
        <p className="text-sm text-muted sm:text-base">
          Founder SifuLaser ialah{' '}
          <span className="font-bold text-ink">Hisham</span> dan{' '}
          <span className="font-bold text-ink">Zahid</span> dari{' '}
          <span className="font-bold text-ink">Mahligai Seni</span> — dengan
          pengalaman lebih dari 10 tahun dalam bidang laser cut. Semua panduan
          di sini datang daripada pengalaman sebenar production harian.
        </p>
      </section>

      <section className="card flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg">
          <Sparkles className="h-5 w-5 text-near" aria-hidden="true" />
          Kenapa SifuLaser?
        </h2>
        <p className="text-sm text-muted sm:text-base">
          SifuLaser dibina untuk melatih operator mesin laser dengan cara yang
          mudah difahami — belajar alignment cermin melalui simulator interaktif,
          dan ikut senarai semak maintenance yang ringkas supaya mesin sentiasa
          dalam keadaan terbaik.
        </p>
      </section>

      <section className="card flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg">
          <Crosshair className="h-5 w-5 text-screw-2" aria-hidden="true" />
          Apa yang anda boleh belajar
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted sm:text-base">
          <li>Alignment cermin mirror mount dan head laser K40</li>
          <li>Memahami sistem koordinat dan gerakan gantry</li>
          <li>Prosedur beam lurus (test Y = 0 dan Y = 90)</li>
          <li>Rutin weekly & yearly maintenance yang betul</li>
          <li>Setup WiFi mesin laser board Trocen dengan TP-Link extender</li>
          <li>Setting terbaik chiller CW-5000 untuk iklim lembap Malaysia</li>
        </ul>
      </section>

      <section className="flex items-center gap-3 rounded-2xl border border-[#cfe0f5] bg-[#eef5fd] p-4">
        <Wrench className="h-6 w-6 shrink-0 text-screw-2" aria-hidden="true" />
        <p className="text-sm text-[#2b4d73]">
          Ada cadangan penambahbaikan? Sampaikan terus kepada team — SifuLaser
          akan terus dikemas kini dari masa ke masa.
        </p>
      </section>
    </div>
  </div>
)
