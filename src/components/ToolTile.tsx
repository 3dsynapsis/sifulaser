import { ArrowRight, LockKeyhole } from 'lucide-react'
import type { ToolEntry } from '../data/tools'

/**
 * Satu tile alat. Dua varian yang berbeza HANYA pada apa yang mengisi well:
 * gambar hasil alat, atau glif lucide untuk enam benda yang tidak menghasilkan
 * apa-apa untuk digambarkan.
 *
 * Komponen ini tidak memiliki sebarang warna. Panel di atasnya menetapkan
 * --g-accent / --g-soft / --g-line dan semuanya diwarisi, jadi satu tile
 * berkhidmat untuk keempat-empat kumpulan tanpa satu pun prop warna.
 */
export const ToolTile = ({
  tool,
  locked,
}: {
  tool: ToolEntry
  locked: boolean
}) => {
  const lockId = locked ? `lock-${tool.href.replace(/\W+/g, '')}` : undefined

  return (
    <a
      href={tool.href}
      className="tile"
      data-locked={locked ? 'true' : undefined}
      aria-describedby={lockId}
    >
      <span className="tile-well">
        {tool.variant === 'art' && tool.art ? (
          <img src={tool.art} alt="" className="tile-art" loading="lazy" />
        ) : (
          <tool.Icon size={40} strokeWidth={1.75} aria-hidden="true" />
        )}
        {locked ? (
          <span className="tile-lock">
            <LockKeyhole size={12} aria-hidden="true" />
          </span>
        ) : null}
      </span>
      <span className="tile-body">
        <span className="tile-title">{tool.title}</span>
        <span className="tile-desc">{tool.shortDescription}</span>
      </span>
      {/* Tile penuh ialah pautan itu sendiri, jadi anak panah ini tidak boleh
          sesekali menjadi kawalan bersarang. */}
      <span className="tile-arrow" aria-hidden="true">
        <ArrowRight size={15} strokeWidth={2.5} />
      </span>
      {lockId ? (
        <span id={lockId} className="sr-only">
          Perlukan Akses Penuh
        </span>
      ) : null}
    </a>
  )
}
