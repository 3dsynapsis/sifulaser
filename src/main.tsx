import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { HomePage } from './pages/HomePage'
import { MaintenancePage } from './pages/MaintenancePage'
import { MaintenanceChooserPage } from './pages/MaintenanceChooserPage'
import { AboutPage } from './pages/AboutPage'
import { PlansPage } from './pages/PlansPage'
import { AdminPage } from './pages/AdminPage'
import { LockedNotice } from './components/LockedNotice'
import {
  WEEKLY_GUIDE,
  YEARLY_GUIDE,
  WIFI_GUIDE,
  CHILLER_GUIDE,
  type MaintenanceGuideData,
} from './data/maintenance'
import { AuthProvider, useAuth } from './lib/auth'
import { canAccessMaintenance } from './lib/access'
import { useHashRoute } from './hooks/useHashRoute'
import './index.css'

const CenteredShell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-canvas">
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-8">
      {children}
    </div>
  </div>
)

/** Panduan maintenance adalah kandungan berbayar. */
const MaintenanceRoute = ({ guide }: { guide: MaintenanceGuideData }) => {
  const { paid, loading } = useAuth()

  if (loading) {
    return (
      <CenteredShell>
        <div className="card h-40 animate-pulse" />
      </CenteredShell>
    )
  }

  if (!canAccessMaintenance(paid)) {
    return (
      <CenteredShell>
        <LockedNotice what="Panduan maintenance dibuka" />
      </CenteredShell>
    )
  }

  return <MaintenancePage guide={guide} />
}

const Root = () => {
  const route = useHashRoute()
  switch (route) {
    case 'simulator':
      return <App />
    case 'maintenance':
      return <MaintenanceChooserPage />
    // Kedai kini sebahagian daripada About Me; pautan lama dikekalkan.
    case 'kedai':
      return <AboutPage />
    case 'weekly':
      return <MaintenanceRoute guide={WEEKLY_GUIDE} />
    case 'yearly':
      return <MaintenanceRoute guide={YEARLY_GUIDE} />
    case 'wifi':
      return <MaintenanceRoute guide={WIFI_GUIDE} />
    case 'chiller':
      return <MaintenanceRoute guide={CHILLER_GUIDE} />
    case 'pakej':
      return <PlansPage />
    case 'admin':
      return <AdminPage />
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
      <AuthProvider>
        <Root />
      </AuthProvider>
    </StrictMode>,
  )
}
