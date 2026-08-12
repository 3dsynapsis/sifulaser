import { useEffect, useState } from 'react'

export type Route =
  | 'home'
  | 'simulator'
  | 'maintenance'
  | 'weekly'
  | 'yearly'
  | 'wifi'
  | 'chiller'
  | 'kedai'
  | 'pakej'
  | 'about'

const parseRoute = (hash: string): Route => {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '')
  switch (path) {
    case 'simulator':
      return 'simulator'
    case 'maintenance':
      return 'maintenance'
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
    case 'about':
      return 'about'
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
