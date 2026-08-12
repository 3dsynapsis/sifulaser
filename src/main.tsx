import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { HomePage } from './pages/HomePage'
import { MaintenancePage } from './pages/MaintenancePage'
import { MaintenanceChooserPage } from './pages/MaintenanceChooserPage'
import { ShopPage } from './pages/ShopPage'
import { AboutPage } from './pages/AboutPage'
import {
  WEEKLY_GUIDE,
  YEARLY_GUIDE,
  WIFI_GUIDE,
  CHILLER_GUIDE,
} from './data/maintenance'
import { useHashRoute } from './hooks/useHashRoute'
import './index.css'

const Root = () => {
  const route = useHashRoute()
  switch (route) {
    case 'simulator':
      return <App />
    case 'maintenance':
      return <MaintenanceChooserPage />
    case 'kedai':
      return <ShopPage />
    case 'weekly':
      return <MaintenancePage guide={WEEKLY_GUIDE} />
    case 'yearly':
      return <MaintenancePage guide={YEARLY_GUIDE} />
    case 'wifi':
      return <MaintenancePage guide={WIFI_GUIDE} />
    case 'chiller':
      return <MaintenancePage guide={CHILLER_GUIDE} />
    case 'about':
      return <AboutPage />
    default:
      return <HomePage />
  }
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
}
