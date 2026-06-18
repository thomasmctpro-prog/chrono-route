import React, { useState } from 'react'
import { Save, Trash2, Info, AlertTriangle, Download, RotateCcw } from 'lucide-react'
import { getSettings, saveSettings, clearAllData, getTripHistory } from '../lib/storage.js'
import { RULES } from '../lib/regulations.js'

export default function SettingsPage({ settings: initSettings, onSave }) {
  const [settings, setSettings] = useState(initSettings || getSettings())
  const [saved, setSaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  function update(key, value) {
    setSettings(s => ({ ...s, [key]: value }))
    setSaved(false)
  }

  function handleSave() {
    saveSettings(settings)
    if (onSave) onSave()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleExport() {
    const data = {
      exportedAt: new Date().toISOString(),
      settings,
      history: getTripHistory(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chrono-route-export-${new Date().toISOString().substring(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleClearAll() {
    if (!confirmClear) { setConfirmClear(true); return }
    clearAllData()
    setConfirmClear(false)
    alert('Toutes les données ont été effacées. Rechargez la page.')
    window.location.reload()
  }

  return (
    <div className="space-y-5 slide-up">
      <div>
        <h1 className="section-title">Réglages</h1>
        <p className="text-muted text-sm mt-1">Préférences et configuration</p>
      </div>

      {/* Valeurs par défaut */}
      <div className="card p-4 space-y-4">
        <h3 className="font-semibold text-bright text-sm">Valeurs par défaut</h3>

        <div>
          <div className="flex justify-between mb-2">
            <label className="label mb-0">Marge de sécurité par défaut</label>
            <span className="text-accent font-semibold text-sm">{settings.defaultBufferMinutes} min</span>
          </div>
          <input
            type="range"
            min={0} max={60} step={5}
            value={settings.defaultBufferMinutes}
            onChange={e => update('defaultBufferMinutes', +e.target.value)}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-muted text-xs mt-1">
            <span>0 min (sans marge)</span>
            <span>60 min</span>
          </div>
        </div>

        <div>
          <label className="label">Stratégie de pause par défaut</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'single', label: 'Pause unique 45 min', desc: 'Une seule pause après 4h30' },
              { id: 'split', label: 'Fractionnée 15+30', desc: 'Arrêt à mi-chemin + fin' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => update('defaultBreakStrategy', opt.id)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  settings.defaultBreakStrategy === opt.id
                    ? 'border-accent bg-accent/10'
                    : 'border-bg-border bg-bg-elevated hover:bg-bg-border'
                }`}
              >
                <div className="text-sm font-medium text-bright">{opt.label}</div>
                <div className="text-xs text-muted mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Prix du carburant */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Prix du carburant (gazole)</label>
            <span className="text-accent font-semibold text-sm">
              {(settings.fuelPrice ?? 1.65).toFixed(2)} €/L
            </span>
          </div>
          <input
            type="number"
            min={0.5} max={4} step={0.01}
            value={settings.fuelPrice ?? 1.65}
            onChange={e => update('fuelPrice', parseFloat(e.target.value) || 1.65)}
            className="input-field"
          />
          <p className="text-muted text-xs mt-1">
            Utilisé pour l'estimation du coût carburant dans le planificateur
          </p>
        </div>

        <div className="space-y-3">
          <ToggleSetting
            label="Autoriser les dérogations"
            description="Dérogation 10h/jour et repos réduit à 9h autorisés par défaut"
            value={settings.useDerogations}
            onChange={v => update('useDerogations', v)}
          />
          <ToggleSetting
            label="Afficher le scénario alternatif"
            description="Proposer une stratégie alternative de pause"
            value={settings.showAlternatives}
            onChange={v => update('showAlternatives', v)}
          />
        </div>
      </div>

      {/* Bouton enregistrer */}
      <button
        onClick={handleSave}
        className={`btn-primary w-full flex items-center justify-center gap-2 ${saved ? 'bg-drive hover:bg-drive' : ''}`}
      >
        <Save size={16} />
        {saved ? '✓ Paramètres sauvegardés' : 'Enregistrer les réglages'}
      </button>

      {/* Référence réglementaire */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-bright text-sm flex items-center gap-2">
          <Info size={14} className="text-blue-400" />
          Référence réglementaire
        </h3>

        <div className="space-y-2 text-xs text-sub">
          <p className="font-medium text-text">Règlement UE n° 561/2006 (PL & Bus)</p>
          {[
            ['Art. 6', 'Temps de conduite journalier : 9h (dérogation 10h, 2×/semaine)'],
            ['Art. 6', 'Temps de conduite hebdo : 56h — Bihebdo : 90h'],
            ['Art. 7', 'Pause après 4h30 de conduite : 45 min (ou 15+30 min)'],
            ['Art. 8', 'Repos journalier : 11h (réduit à 9h, 3×/semaine)'],
            ['Art. 8', 'Repos hebdomadaire : 45h (réduit à 24h, alternativement)'],
          ].map(([art, desc]) => (
            <div key={desc} className="flex gap-2">
              <span className="text-accent font-medium shrink-0 w-12">{art}</span>
              <span>{desc}</span>
            </div>
          ))}

          <div className="pt-2 border-t border-bg-border">
            <p className="font-medium text-text">Code des Transports FR (VUL ≤ 3,5t)</p>
            <div className="mt-1 space-y-1">
              <div className="flex gap-2">
                <span className="text-blue-400 shrink-0 w-12">L3312</span>
                <span>Pause obligatoire après 4h30 — mêmes principes que 561/2006</span>
              </div>
              <div className="flex gap-2">
                <span className="text-blue-400 shrink-0 w-12">Dir. UE</span>
                <span>Temps de travail max 48h/semaine (directive 2002/15/CE)</span>
              </div>
            </div>
          </div>

          <div className="pt-2 mt-2 border-t border-bg-border">
            <p className="text-muted flex items-start gap-1">
              <AlertTriangle size={11} className="mt-0.5 shrink-0 text-pause" />
              Cette application est un outil d'aide à la planification. En cas de doute, consultez votre
              employeur ou les textes officiels. Les calculs sont fournis à titre indicatif.
            </p>
          </div>
        </div>
      </div>

      {/* Données & export */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-bright text-sm">Données</h3>

        <button
          onClick={handleExport}
          className="btn-secondary w-full flex items-center justify-center gap-2"
        >
          <Download size={16} />
          Exporter mes données (JSON)
        </button>

        <button
          onClick={handleClearAll}
          className={`w-full flex items-center justify-center gap-2 ${
            confirmClear
              ? 'btn-danger'
              : 'btn-ghost text-danger/70 border border-danger/30 hover:bg-danger/10'
          }`}
        >
          {confirmClear ? <><AlertTriangle size={16} /> Confirmer la suppression ?</> : <><Trash2 size={16} /> Effacer toutes les données</>}
        </button>
        {confirmClear && (
          <button onClick={() => setConfirmClear(false)} className="btn-secondary w-full text-sm">
            Annuler
          </button>
        )}
      </div>

      {/* À propos */}
      <div className="text-center space-y-1 pb-2">
        <div className="text-2xl">🚛</div>
        <div className="text-bright font-bold">ChronoRoute</div>
        <div className="text-muted text-xs">v1.0 — Planificateur de trajets professionnels</div>
        <div className="text-muted text-xs">
          Routing : OSRM / OpenStreetMap — 100% gratuit, aucune donnée envoyée
        </div>
      </div>
    </div>
  )
}

function ToggleSetting({ label, description, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-text font-medium">{label}</div>
        {description && <div className="text-xs text-muted mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${
          value ? 'bg-accent' : 'bg-bg-border'
        }`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          value ? 'left-6' : 'left-1'
        }`} />
      </button>
    </div>
  )
}
