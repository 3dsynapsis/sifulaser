import { useEffect } from 'react'
import { NAV } from '../data/tools'
import type { Route } from '../hooks/useHashRoute'

/**
 * Bar tab bawah untuk telefon - di situlah ibu jari berada. 95% pelawat
 * datang dari telefon, jadi navigasi utama tinggal di sini dan bukan di
 * barisnya sendiri di bawah bar atas.
 *
 * Bar ini tetap (fixed), jadi ia menolak kandungan dari bawah melalui kelas
 * pada <body>; tanpa itu baris terakhir setiap halaman duduk di bawahnya.
 */
export const BottomTabBar = ({ route }: { route: Route }) => {
  useEffect(() => {
    document.body.classList.add('has-tabbar')
    return () => document.body.classList.remove('has-tabbar')
  }, [])

  return (
    <nav className="tabbar" aria-label="Navigasi laman">
      {NAV.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="tab"
          aria-current={item.route === route ? 'page' : undefined}
        >
          <item.Icon size={22} strokeWidth={2} aria-hidden="true" />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  )
}
