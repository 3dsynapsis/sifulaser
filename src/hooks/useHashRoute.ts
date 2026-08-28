import { useEffect, useState } from 'react'

export type Route =
  | 'home'
  | 'simulator'
  | 'boxmaker'
  | 'puzzle'
  | 'maintenance'
  | 'troubleshoot'
  | 'weekly'
  | 'yearly'
  | 'wifi'
  | 'chiller'
  | 'kedai'
  | 'pakej'
  | 'bayar'
  | 'about'
  | 'admin'

const parseRoute = (hash: string): Route => {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '')
  switch (path) {
    case 'simulator':
      return 'simulator'
    case 'boxmaker':
      return 'boxmaker'
    case 'puzzle':
      return 'puzzle'
    case 'maintenance':
      return 'maintenance'
    case 'troubleshoot':
      return 'troubleshoot'
    case 'kedai':
      return 'kedai'
    case 'weekly':
      return 'weekly'
    case 'yearly':
      return 'yearly'
    case 'wifi':
      return 'wifi'
    case 'chiller':
      return 'chiller'
    case 'pakej':
      return 'pakej'
    case 'bayar':
      return 'bayar'
    case 'about':
      return 'about'
    case 'admin':
      return 'admin'
    default:
      return 'home'
  }
}

export const useHashRoute = (): Route => {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route
}
