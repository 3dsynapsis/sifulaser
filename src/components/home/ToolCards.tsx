import { ArrowRight, LockKeyhole } from 'lucide-react'
import { m } from 'motion/react'
import type { ToolEntry } from '../../data/tools'

/** Anak-anak grid muncul satu demi satu bila grid itu masuk skrin. */
export const gridStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.08 } },
}

export const pop = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const },
  },
}

const TAP = { scale: 0.97 }

const Well = ({ tool, size }: { tool: ToolEntry; size: number }) =>
  tool.variant === 'art' && tool.art ? (
    <img src={tool.art} alt="" className="card-art" loading="lazy" decoding="async" />
  ) : (
    <tool.Icon size={size} strokeWidth={1.75} aria-hidden="true" />
  )

/**
 * Kad kalkulator langkah 1: lebar, satu ketik terus ke kalkulator. Tiada
 * butang "Dapatkan Harga" berasingan - dengan dua kalkulator, butang tunggal
 * tidak dapat memberitahu ke mana ia pergi. Kad itu sendiri butangnya.
 */
export const PriceCard = ({ tool }: { tool: ToolEntry }) =>
  tool.soon ? (
    <SoonPriceCard tool={tool} />
  ) : (
    <m.a href={tool.href} className="pcard" variants={pop} whileTap={TAP}>
      <span className="pcard-well">
        <Well tool={tool} size={44} />
      </span>
      <span className="pcard-body">
        <span className="pcard-title">{tool.title}</span>
        <span className="pcard-desc">{tool.shortDescription}</span>
        <span className="pcard-cta">
          Kira harga
          <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
        </span>
      </span>
    </m.a>
  )

/**
 * Kalkulator yang belum siap: kad yang sama, tetapi BUKAN pautan - satu <div>
 * tanpa href dan tanpa kesan tekan, gambar dipudarkan, dan label "Akan datang"
 * menggantikan butang. aria-disabled supaya pembaca skrin pun tahu.
 */
const SoonPriceCard = ({ tool }: { tool: ToolEntry }) => (
  <m.div className="pcard pcard-soon" variants={pop} aria-disabled="true">
    <span className="pcard-well">
      <Well tool={tool} size={44} />
    </span>
    <span className="pcard-body">
      <span className="pcard-title">{tool.title}</span>
      <span className="pcard-desc">{tool.shortDescription}</span>
      <span className="pcard-soon-tag">Akan datang</span>
    </span>
  </m.div>
)

/** Tile alat untuk langkah 2 dan 3. */
export const ToolCard = ({
  tool,
  locked,
}: {
  tool: ToolEntry
  locked: boolean
}) => {
  const lockId = locked ? `kunci-${tool.href.replace(/\W+/g, '')}` : undefined
  return (
    <m.a
      href={tool.href}
      className="tcard"
      variants={pop}
      whileTap={TAP}
      aria-describedby={lockId}
    >
      <span className="tcard-well">
        <Well tool={tool} size={36} />
        {locked ? (
          <span className="card-lock">
            <LockKeyhole size={12} aria-hidden="true" />
          </span>
        ) : null}
      </span>
      <span className="tcard-title">{tool.title}</span>
      <span className="tcard-desc">{tool.shortDescription}</span>
      {lockId ? (
        <span id={lockId} className="sr-only">
          Perlukan Akses Penuh
        </span>
      ) : null}
    </m.a>
  )
}
