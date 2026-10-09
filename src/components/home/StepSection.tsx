import { m } from 'motion/react'
import type { ReactNode } from 'react'
import type { ToolGroup } from '../../data/tools'
import { stepAnchor } from './StepChips'

// Pudar sahaja, tanpa anjakan y. Cip lompat menggulung ke tepi atas bahagian
// ini; kalau bahagian itu masih dianjak 28 px ke bawah semasa jarak dikira,
// tajuknya mendarat di bawah cip sebaik animasi selesai. Gerak datang dari
// tile di dalamnya.
const rise = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.45, ease: 'easeOut' as const },
  },
}

/**
 * Satu langkah bernombor: kad krim dengan tajuk, dan kandungannya.
 *
 * `reveal={false}` untuk langkah yang sudah kelihatan semasa halaman dibuka
 * (langkah 1 pada telefon). Ciri motion dimuat secara malas, jadi langkah
 * yang bermula `initial="hidden"` kekal tersorok sehingga chunk itu tiba -
 * dan sebut harga ialah perkara pertama yang orang datang cari.
 */
export const StepSection = ({
  group,
  children,
  reveal = true,
}: {
  group: ToolGroup
  children: ReactNode
  reveal?: boolean
}) => {
  const titleId = `${stepAnchor(group.id)}-tajuk`
  return (
    <m.section
      id={stepAnchor(group.id)}
      className="step"
      style={group.vars}
      aria-labelledby={titleId}
      variants={rise}
      initial={reveal ? 'hidden' : false}
      whileInView="show"
      viewport={{ once: true, amount: 0.12 }}
    >
      <header className="step-head">
        <span className="step-num" aria-hidden="true">
          {group.step}
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="step-title">
            <span className="sr-only">Langkah {group.step}: </span>
            {group.title}
          </h2>
          <p className="step-sub">{group.subtitle}</p>
        </div>
      </header>
      {children}
    </m.section>
  )
}
