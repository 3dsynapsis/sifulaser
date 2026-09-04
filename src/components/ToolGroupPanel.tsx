import { ArrowRight } from 'lucide-react'
import type { CSSProperties } from 'react'
import { ToolTile } from './ToolTile'
import { toolsInGroup, type ToolGroup } from '../data/tools'

/**
 * Satu dulung berlabel. Panel itu rata dan tanpa bayang dengan sengaja: ia
 * ialah LATAR, dan tile ialah satu-satunya RAJAH yang terangkat pada halaman.
 * Kalau panel juga terangkat, mata terpaksa memilih antara lapan permukaan
 * dan bukan empat belas destinasi.
 */
export const ToolGroupPanel = ({
  group,
  paid,
  loading,
  delayMs,
}: {
  group: ToolGroup
  paid: boolean
  /**
   * useAuth bermula dengan paid:false dan kekal begitu sehingga pendengar auth
   * DAN snapshot Firestore mendarat. Tanpa bendera ini, pengguna berbayar
   * melihat dua mangga muncul lalu hilang pada setiap muat — betul-betul di
   * bawah jalur naik taraf yang sudah dijaga daripada kelipan yang sama.
   */
  loading: boolean
  delayMs: number
}) => {
  const tools = toolsInGroup(group.id)

  return (
    <section
      className="home-panel"
      style={{ ...group.vars, animationDelay: `${delayMs}ms` }}
      aria-labelledby={`grp-${group.id}`}
    >
      <div className="home-panel-head">
        <span className="home-panel-chip" aria-hidden="true">
          <group.Icon size={19} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 id={`grp-${group.id}`} className="home-panel-title">
            {group.title}
          </h2>
          <p className="home-panel-sub">{group.subtitle}</p>
        </div>
        {group.seeAll ? (
          <a className="home-panel-aside" href={group.seeAll.href}>
            {group.seeAll.label}
            <ArrowRight size={13} strokeWidth={2.5} aria-hidden="true" />
          </a>
        ) : (
          // Tiada halaman indeks untuk tiga kumpulan ini, jadi slot itu memegang
          // kiraan yang benar dan bukan pautan yang menuju ke tempat yang salah.
          <span className="home-panel-aside home-panel-count">
            {tools.length} alat
          </span>
        )}
      </div>
      <div
        className="tile-row"
        data-tile-count={tools.length}
        style={{ '--tile-count': tools.length } as CSSProperties}
      >
        {tools.map((tool) => (
          <ToolTile
            key={tool.href}
            tool={tool}
            locked={Boolean(tool.premium) && !paid && !loading}
          />
        ))}
      </div>
    </section>
  )
}
