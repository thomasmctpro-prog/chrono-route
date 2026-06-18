import React, { useState, useEffect } from 'react'
import { Truck, BarChart3, Settings, Map, GaugeCircle } from 'lucide-react'
import PlannerPage from './pages/PlannerPage.jsx'
import VehiclesPage from './pages/VehiclesPage.jsx'
import WeeklyLogPage from './pages/WeeklyLogPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import TachographPage from './pages/TachographPage.jsx'
import { getSettings } from './lib/storage.js'

const PAGES = [
  { id: 'planner', label: 'Planifier', icon: Map },
  { id: 'tacho', label: 'Tachy', icon: GaugeCircle },
  { id: 'weekly', label: 'Mon solde', icon: BarChart3 },
  { id: 'vehicles', label: 'Véhicules', icon: Truck },
  { id: 'settings', label: 'Réglages', icon: Settings },
]

export default function App() {
  const [page, setPage] = useState('planner')
  const [settings, setSettings] = useState(getSettings())

  useEffect(() => {
    // Recharger les settings quand on revient sur la page settings
  }, [page])

  function refreshSettings() {
    setSettings(getSettings())
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg-base">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg-deep/95 backdrop-blur border-b border-bg-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🚛</span>
            <div>
              <span className="font-bold text-bright text-base tracking-tight">ChronoRoute</span>
              <span className="text-muted text-xs ml-2 hidden sm:inline">Planificateur PL</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted">
            <span className="w-2 h-2 rounded-full bg-drive pulse-dot inline-block" />
            <span className="hidden sm:inline">EU 561/2006</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 pb-24">
        {page === 'planner' && <PlannerPage settings={settings} />}
        {page === 'tacho' && <TachographPage />}
        {page === 'weekly' && <WeeklyLogPage settings={settings} />}
        {page === 'vehicles' && <VehiclesPage settings={settings} />}
        {page === 'settings' && <SettingsPage settings={settings} onSave={refreshSettings} />}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg-deep/95 backdrop-blur border-t border-bg-border">
        <div className="max-w-2xl mx-auto px-2 h-16 flex items-center justify-around">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`nav-item ${page === id ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
