import { LazyMotion, MotionConfig, m } from 'motion/react'
import { SiteHeader } from '../components/SiteHeader'
import { HomeHero } from '../components/home/HomeHero'
import { LearnStep } from '../components/home/LearnStep'
import { StepChips } from '../components/home/StepChips'
import { StepSection } from '../components/home/StepSection'
import {
  PriceCard,
  ToolCard,
  gridStagger,
} from '../components/home/ToolCards'
import { GROUPS, toolsInGroup, type GroupId } from '../data/tools'
import { useAuth } from '../lib/auth'

/**
 * Halaman utama - "One Stop Centre", reka bentuk telefon dahulu.
 *
 * Empat langkah mengikut perjalanan satu kerja laser (lihat
 * src/data/tools.ts): harga, idea, fail, belajar. 95% pelawat datang dari
 * telefon, jadi setiap keputusan susun atur diambil pada 375 px dahulu.
 *
 * LazyMotion dengan `m` dan bukan `motion`: domAnimation membawa animasi,
 * varian, whileInView dan whileTap sahaja - kira-kira separuh saiz motion
 * penuh - dan ia dimuat sebagai chunk berasingan selepas halaman dicat
 * (src/lib/motionFeatures.ts). `strict` membuang ralat jika `motion.*`
 * tersusup masuk.
 */

const loadFeatures = () => import('../lib/motionFeatures').then((mod) => mod.default)

const GRID_CLASS: Record<Exclude<GroupId, 'harga' | 'belajar'>, string> = {
  idea: 'tgrid tgrid--idea',
  fail: 'tgrid tgrid--fail',
}

export const HomePage = () => {
  const { loading, paid } = useAuth()

  const body = (id: GroupId) => {
    if (id === 'belajar') return <LearnStep paid={paid} loading={loading} />
    const tools = toolsInGroup(id)
    if (id === 'harga') {
      return (
        <m.div
          className="pgrid"
          variants={gridStagger}
          initial={false}
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          {tools.map((tool) => (
            <PriceCard key={tool.href} tool={tool} />
          ))}
        </m.div>
      )
    }
    return (
      <m.div
        className={GRID_CLASS[id]}
        variants={gridStagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
      >
        {tools.map((tool) => (
          <ToolCard
            key={tool.href}
            tool={tool}
            locked={Boolean(tool.premium) && !paid && !loading}
          />
        ))}
      </m.div>
    )
  }

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <div className="home min-h-screen">
          <SiteHeader />
          <HomeHero />
          <StepChips groups={GROUPS} />

          <main className="home-main">
            {/* Tiada jalur naik taraf di sini (Boss, 9 Okt 2026): halaman utama
                ialah One Stop Centre, bukan halaman jualan. Akses Penuh
                ditawarkan di tempat ia diperlukan - LockedNotice bila pengguna
                cuba buka Level 2 simulator ke atas atau panduan berbayar - dan
                di langkah 4 / #/pakej. */}
            {GROUPS.map((group) => (
              <StepSection
                key={group.id}
                group={group}
                reveal={group.id !== 'harga'}
              >
                {body(group.id)}
              </StepSection>
            ))}

            <footer className="home-sign">
              <p className="hand">Satu tempat, semua kerja laser anda.</p>
              <p className="home-sign-by">SifuLaser by Mahligai Seni</p>
            </footer>
          </main>
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
