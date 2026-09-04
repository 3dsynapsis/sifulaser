import {
  ArrowRight,
  BookOpen,
  Crosshair,
  Crown,
  ShoppingCart,
  Users,
  Wrench,
} from 'lucide-react'
import { SiteHeader } from '../components/SiteHeader'
import { ToolGroupPanel } from '../components/ToolGroupPanel'
import { ToolSearch } from '../components/ToolSearch'
import { GROUPS } from '../data/tools'
import { ACCESS_PERIOD_LABEL, PRICE_LABEL } from '../lib/access'
import { useAuth } from '../lib/auth'

/**
 * Halaman utama — direktori empat belas alat dalam empat kumpulan.
 *
 * Lima belas destinasi masih boleh dicapai dari sini. Empat belas ialah tile;
 * yang kelima belas, "Pakej & Harga", ialah pill nav dan butang CTA biru di
 * jalur kaki. Senarai itu sendiri tinggal di src/data/tools.ts.
 */

/**
 * Operator berbayar yang sudah log masuk telah membaca hero ini lima puluh
 * kali; melipatnya untuk mereka membeli lebih kurang 230 px alat di atas garis
 * lipat. Tidak dihantar — bos meminta mockup itu. Tukar ke true HANYA selepas
 * dia berkata begitu.
 */
const HERO_COMPACT_WHEN_PAID = false

const FOOTER_NOTES = [
  { Icon: BookOpen, title: 'Panduan Lengkap', sub: 'Dari asas hingga mahir' },
  { Icon: Users, title: 'Komuniti & Sokongan', sub: 'Bersama pengguna lain' },
  { Icon: Wrench, title: 'Tools Praktikal', sub: 'Terus boleh guna' },
]

/**
 * Kumpulan dipasangkan dua-dua, bukan diindeks GROUPS[0..3] dengan tangan.
 * noUncheckedIndexedAccess tidak dihidupkan dalam tsconfig, jadi GROUPS[4]
 * menaip bersih dan membuang pada masa larian — dan kumpulan kelima yang
 * ditambah ke tools.ts akan lulus `npm run typecheck` lalu hilang senyap
 * daripada halaman ini. Di sini panjang halaman mengikut data.
 */
const GROUP_ROWS = GROUPS.reduce<(typeof GROUPS)[]>((rows, group, index) => {
  if (index % 2 === 0) rows.push([group])
  else rows[rows.length - 1].push(group)
  return rows
}, [])

export const HomePage = () => {
  const { configured, loading, paid } = useAuth()
  const showHero = !(HERO_COMPACT_WHEN_PAID && paid)

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
        {/* Jalur naik taraf. Ini satu-satunya laluan jualan laman ini, jadi ia
            kekal kelihatan di sini dan tidak ditanam ke dalam menu cip akaun. */}
        {configured && !loading && !paid ? (
          <a
            href="#/bayar"
            className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-near/45 bg-[#fffaf0] px-4 py-2 text-[13px] leading-tight font-semibold text-ink no-underline transition-colors hover:bg-[#fff6e4]"
          >
            <span className="flex items-center gap-2">
              <Crown className="h-4 w-4 shrink-0 text-near" aria-hidden="true" />
              Naik taraf ke Akses Penuh — {PRICE_LABEL} / {ACCESS_PERIOD_LABEL}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </a>
        ) : null}

        {showHero ? (
          <section className="home-hero">
            <div className="home-hero-left">
              <h1 className="mid:text-[44px] text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em] text-ink sm:text-[34px]">
                Selamat datang!
              </h1>
              <p className="mt-3 max-w-[46ch] text-[15px] leading-[1.5] font-medium text-pretty text-muted sm:text-base">
                Sedia untuk alignment yang tepat dan mesin yang terbaik.
              </p>
              <div className="mt-5 max-w-[460px]">
                <ToolSearch />
              </div>
              <p className="mt-2 hidden text-[12px] leading-[1.4] font-medium text-muted sm:block">
                Tekan <kbd className="font-bold">/</kbd> untuk fokus carian
              </p>
              {/* Panel kanan hilang di bawah 900 px, jadi baris tulisan tangan
                  berpindah ke sini supaya ia tidak hilang sekali. mid:hidden dan
                  bukan sm:hidden — pada sm (640) salinan ini hilang sedangkan
                  panel kanan belum kembali, jadi baris itu lenyap sepenuhnya
                  antara 640 dan 899 px. Warna dan lebar garis sama dengan
                  salinan desktop: satu baris suara jenama, satu rupa. */}
              <p className="hand mid:hidden mt-5 text-[17px] text-ink">
                Precision hari ini, hasil terbaik esok.
                <span className="mt-1 block h-[3px] w-32 rounded-full bg-near/80" />
              </p>
            </div>

            {/* Mockup menunjukkan foto kepala laser mengukir kayu. Foto itu
                tidak wujud dalam repo ini dan tiada stok dicari sebagai ganti.
                Ini penggantinya; foto sebenar nanti hanyalah satu baris tukar. */}
            <div className="home-hero-right">
              {/* Dipusatkan menegak. Bulatan 460 px dalam panel 266 px MESTI
                  terpotong atas dan bawah — tiada susunan yang membiarkannya
                  berdarah pada satu tepi sahaja — tetapi terpotong sama rata
                  terbaca sebagai bleed yang disengajakan, bukan sebagai krop
                  yang tersasar. Ini pengganti; foto sebenar masih satu baris. */}
              <Crosshair
                className="absolute top-1/2 -right-16 h-[460px] w-[460px] -translate-y-1/2 text-screw-2/10"
                strokeWidth={1}
                aria-hidden="true"
              />
              <p className="hand absolute right-8 bottom-8 max-w-[15ch] text-right text-[22px] leading-[1.2] text-ink">
                Precision hari ini, hasil terbaik esok.
                <span className="mt-1 ml-auto block h-[3px] w-32 rounded-full bg-near/80" />
              </p>
            </div>
          </section>
        ) : null}

        {/* Dua baris, bukan satu grid 2x2: baris kedua menterbalikkan nisbah
            lajur supaya dua kumpulan bergambar duduk pada satu pepenjuru. */}
        <div className="flex flex-col gap-6">
          {GROUP_ROWS.map((row, rowIndex) => (
            <div
              key={row[0].id}
              className={`home-row ${rowIndex % 2 === 0 ? 'home-row--a' : 'home-row--b'}`}
            >
              {row.map((group, colIndex) => (
                <ToolGroupPanel
                  key={group.id}
                  group={group}
                  paid={paid}
                  loading={loading}
                  delayMs={(rowIndex * 2 + colIndex) * 60}
                />
              ))}
            </div>
          ))}
        </div>

        <footer className="home-foot">
          {/* CTA didahulukan dalam susunan DOM pada telefon melalui order-*:
              di hujung skrol yang panjang, itulah yang patut berada di atas
              blok ini. */}
          <a href="#/pakej" className="home-cta order-1 sm:order-3">
            <ShoppingCart className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-tight font-bold">
                Lihat Pakej & Harga
              </span>
              <span className="block text-[12px] leading-tight font-medium text-white/85">
                Pilih pakej yang sesuai untuk anda
              </span>
            </span>
            <ArrowRight
              className="home-cta-arrow h-5 w-5 shrink-0"
              aria-hidden="true"
            />
          </a>

          <p className="hand order-2 max-w-[22ch] text-[17px] leading-[1.25] text-ink sm:order-1">
            Jaga alignment, mesin akan jaga hasil anda.
          </p>

          {/* Tiga item ini teks statik, bukan pautan: tiada destinasi wujud
              untuknya. Bukan-pautan yang bergaya seperti pautan lebih teruk
              daripada ayat penenang yang mengaku dirinya begitu. */}
          <div className="home-foot-items order-3 sm:order-2">
            {FOOTER_NOTES.map(({ Icon, title, sub }) => (
              <div key={title} className="flex items-center gap-2.5">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-canvas">
                  <Icon className="h-4 w-4 text-screw-2" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] leading-tight font-bold text-ink">
                    {title}
                  </span>
                  <span className="block text-[11.5px] leading-tight font-medium text-muted">
                    {sub}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </footer>
      </main>
    </div>
  )
}
