import { ArrowRight, GraduationCap, LockKeyhole } from 'lucide-react'
import { m } from 'motion/react'
import { BLOG_POSTS } from '../../data/blog'
import { machineShelf } from '../../data/tools'
import { gridStagger, pop } from './ToolCards'

const TAP = { scale: 0.97 }

/**
 * Langkah 4. Tidak memakai grid tile seperti langkah lain kerana isinya bukan
 * alat: tips terkini Sifu Hisham dengan tajuk sebenar episodnya (inilah
 * "tips design" yang menjadi sebab revamp ini), kelas, dan rak mesin kecil di
 * bawah sekali - mesin kini perkara terakhir, bukan wajah laman.
 */
export const LearnStep = ({ paid, loading }: { paid: boolean; loading: boolean }) => {
  // Episod terbaharu ialah nombor terbesar, bukan entri terakhir: tatasusunan
  // itu disusun tangan dan tiada apa-apa yang menjamin urutannya.
  const latest = BLOG_POSTS.reduce((a, b) => (b.episode > a.episode ? b : a))
  const shelf = machineShelf()

  return (
    <m.div
      className="learn"
      variants={gridStagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
    >
      <m.a href={`#/blog/${latest.slug}`} className="ecard" variants={pop} whileTap={TAP}>
        <span className="ecard-shot">
          <img src={latest.image} alt="" loading="lazy" decoding="async" />
        </span>
        <span className="ecard-body">
          <span className="ecard-tag">Tips terkini · Episod {latest.episode}</span>
          <span className="ecard-title">{latest.title}</span>
          <span className="ecard-cta">
            Baca tips
            <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
          </span>
        </span>
      </m.a>

      <m.a href="#/pakej" className="kcard" variants={pop} whileTap={TAP}>
        <span className="kcard-icon">
          <GraduationCap size={26} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="kcard-title">Kelas & Training</span>
          <span className="kcard-desc">Belajar terus dengan Sifu Hisham. Lihat pakej dan harga.</span>
        </span>
        <ArrowRight className="kcard-arrow" size={18} strokeWidth={2.5} aria-hidden="true" />
      </m.a>

      <m.a href="#/blog" className="learn-all" variants={pop}>
        Semua episod Sifu Hisham
        <ArrowRight size={15} strokeWidth={2.5} aria-hidden="true" />
      </m.a>

      <m.div className="shelf" variants={pop}>
        <p className="shelf-label">Mesin buat hal?</p>
        <div className="shelf-row">
          {shelf.map((tool) => {
            const locked = Boolean(tool.premium) && !paid && !loading
            return (
              <m.a key={tool.href} href={tool.href} className="shelf-item" whileTap={TAP}>
                <tool.Icon size={20} strokeWidth={2} aria-hidden="true" />
                <span className="shelf-name">{tool.title}</span>
                {locked ? (
                  <>
                    <LockKeyhole className="shelf-lock" size={12} aria-hidden="true" />
                    <span className="sr-only">Perlukan Akses Penuh</span>
                  </>
                ) : null}
              </m.a>
            )
          })}
        </div>
      </m.div>
    </m.div>
  )
}
