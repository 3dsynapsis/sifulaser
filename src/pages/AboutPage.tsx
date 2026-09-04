import {
  Award,
  Crosshair,
  ExternalLink,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  Star,
  UserRound,
  Wrench,
} from 'lucide-react'
import {
  SHOP_NAME,
  SHOP_PRODUCTS,
  SHOP_URL,
  WHATSAPP_NUMBER_DISPLAY,
  whatsappUrlFor,
} from '../data/shop'
import { SiteHeader } from '../components/SiteHeader'

export const AboutPage = () => (
  <div className="min-h-screen bg-canvas">
    {/* Bar yang sama seperti halaman utama. Empat pill nav menjanjikan empat
        destinasi; tanpa bar di sini janji itu bertahan tepat satu klik, dan
        dari About tiada jalan ke Blog tanpa balik ke halaman utama dahulu.
        Pautan "Utama" lama digugurkan — Home kini pill dalam bar itu. */}
    <SiteHeader />
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 sm:py-8">
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
          <li>Rutin weekly &amp; yearly maintenance yang betul</li>
          <li>Setup WiFi mesin laser board Trocen dengan TP-Link extender</li>
          <li>Setting terbaik chiller CW-5000 untuk iklim lembap Malaysia</li>
        </ul>
      </section>

      {/* Kedai Laser */}
      <section className="card flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fdf3e8]">
            <ShoppingBag className="h-5 w-5 text-[#e07514]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink sm:text-lg">
              Kedai {SHOP_NAME}
            </h2>
            <p className="text-sm text-muted">
              Barang keperluan kerja laser yang kami guna sendiri untuk
              production.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {SHOP_PRODUCTS.map((product) => (
            <a
              key={product.name}
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-2 rounded-xl border border-line p-2 transition-transform hover:-translate-y-0.5"
            >
              <span className="relative block">
                <img
                  src={`${import.meta.env.BASE_URL}${product.image}`}
                  alt={product.imageAlt}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg border border-line bg-white object-cover"
                />
                {product.soldOut ? (
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Stok Habis
                  </span>
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-ink sm:text-sm">
                  {product.name}
                </span>
                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-xs font-bold text-[#e07514] sm:text-sm">
                    {product.price}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted">
                    <Star
                      className="h-2.5 w-2.5 fill-[#f5a623] text-[#f5a623]"
                      aria-hidden="true"
                    />
                    {product.rating} · {product.sold}
                  </span>
                </span>
              </span>
            </a>
          ))}
        </div>

        <a
          href={SHOP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#e07514] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c76409]"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          Lawati kedai penuh di Shopee
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>

        <a
          href={whatsappUrlFor()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#c9ecd6] bg-[#edf9f1] px-4 py-2.5 text-sm font-semibold text-[#147a37] transition-colors hover:bg-[#def3e6]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          WhatsApp kami: {WHATSAPP_NUMBER_DISPLAY}
        </a>
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
