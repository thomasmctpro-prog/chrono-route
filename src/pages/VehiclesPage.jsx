import React, { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, CheckCircle2, X, Truck, Star } from 'lucide-react'
import { getVehicles, addVehicle, updateVehicle, deleteVehicle } from '../lib/storage.js'
import { VEHICLE_TYPES } from '../lib/regulations.js'

const EMPTY_FORM = {
  name: '',
  type: 'pl',
  licensePlate: '',
  height: 4.0,
  totalWeight: 26,
  length: 12,
  fuelConsumption: 30,
  isDefault: false,
}

const FUEL_DEFAULTS = { pl: 30, vul: 10, bus: 25 }

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([])
  const [editId, setEditId] = useState(null) // null = pas d'édition, 'new' = nouveau
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  function reload() { setVehicles(getVehicles()) }
  useEffect(() => { reload() }, [])

  function openNew() {
    setEditId('new')
    setForm(EMPTY_FORM)
    setErrors({})
  }

  function openEdit(v) {
    setEditId(v.id)
    setForm({ ...v })
    setErrors({})
  }

  function closeForm() {
    setEditId(null)
    setErrors({})
  }

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Nom requis'
    if (form.type === 'pl' || form.type === 'bus') {
      if (!form.height || form.height < 2 || form.height > 5) e.height = 'Hauteur invalide (2–5 m)'
      if (!form.totalWeight || form.totalWeight < 1 || form.totalWeight > 60) e.totalWeight = 'Poids invalide (1–60 t)'
    }
    return e
  }

  function handleSave() {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }

    if (editId === 'new') {
      addVehicle(form)
    } else {
      updateVehicle(editId, form)
    }
    reload()
    closeForm()
  }

  function handleDelete(id) {
    if (vehicles.length <= 1) {
      alert('Vous devez conserver au moins un véhicule.')
      return
    }
    if (!confirm('Supprimer ce véhicule ?')) return
    deleteVehicle(id)
    reload()
  }

  function handleSetDefault(id) {
    updateVehicle(id, { isDefault: true })
    reload()
  }

  const vTypeInfo = VEHICLE_TYPES.find(vt => vt.id === form.type)

  return (
    <div className="space-y-5 slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Mes véhicules</h1>
          <p className="text-muted text-sm mt-1">Profils pour le calcul d'itinéraire</p>
        </div>
        {editId === null && (
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Ajouter
          </button>
        )}
      </div>

      {/* Formulaire */}
      {editId !== null && (
        <div className="card p-4 space-y-4 slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-bright">{editId === 'new' ? 'Nouveau véhicule' : 'Modifier'}</h3>
            <button onClick={closeForm} className="btn-ghost p-1.5"><X size={16} /></button>
          </div>

          {/* Type */}
          <div>
            <label className="label">Type de véhicule</label>
            <div className="grid grid-cols-3 gap-2">
              {VEHICLE_TYPES.map(vt => (
                <button
                  key={vt.id}
                  onClick={() => setForm(f => ({
                    ...f,
                    type: vt.id,
                    fuelConsumption: FUEL_DEFAULTS[vt.id] ?? 30,
                  }))}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    form.type === vt.id
                      ? 'border-accent bg-accent/10'
                      : 'border-bg-border bg-bg-elevated hover:bg-bg-border'
                  }`}
                >
                  <div className="text-xl mb-1">{vt.emoji}</div>
                  <div className="text-xs font-medium text-text">{vt.label}</div>
                  <div className="text-xs text-muted mt-0.5 hidden sm:block">{vt.regulation}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Nom et immatriculation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nom</label>
              <input
                type="text"
                placeholder="Mon camion…"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={`input-field ${errors.name ? 'border-danger' : ''}`}
              />
              {errors.name && <p className="text-danger text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="label">Immatriculation</label>
              <input
                type="text"
                placeholder="AB-123-CD"
                value={form.licensePlate}
                onChange={e => setForm(f => ({ ...f, licensePlate: e.target.value.toUpperCase() }))}
                className="input-field font-mono"
              />
            </div>
          </div>

          {/* Dimensions (PL / Bus) */}
          {(form.type === 'pl' || form.type === 'bus') && (
            <div>
              <label className="label text-sub">Caractéristiques techniques</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label text-xs">Hauteur (m)</label>
                  <input
                    type="number"
                    min="2" max="5" step="0.1"
                    value={form.height}
                    onChange={e => setForm(f => ({ ...f, height: parseFloat(e.target.value) }))}
                    className={`input-field ${errors.height ? 'border-danger' : ''}`}
                  />
                  {errors.height && <p className="text-danger text-xs mt-1">{errors.height}</p>}
                </div>
                <div>
                  <label className="label text-xs">PTAC (t)</label>
                  <input
                    type="number"
                    min="3.5" max="60" step="0.5"
                    value={form.totalWeight}
                    onChange={e => setForm(f => ({ ...f, totalWeight: parseFloat(e.target.value) }))}
                    className={`input-field ${errors.totalWeight ? 'border-danger' : ''}`}
                  />
                  {errors.totalWeight && <p className="text-danger text-xs mt-1">{errors.totalWeight}</p>}
                </div>
                <div>
                  <label className="label text-xs">Longueur (m)</label>
                  <input
                    type="number"
                    min="4" max="25" step="0.5"
                    value={form.length}
                    onChange={e => setForm(f => ({ ...f, length: parseFloat(e.target.value) }))}
                    className="input-field"
                  />
                </div>
              </div>
              <p className="text-muted text-xs mt-2">
                Utilisé pour les restrictions de routes (limitation de hauteur, de tonnage)
              </p>
            </div>
          )}

          {/* Consommation carburant */}
          <div>
            <label className="label text-sub">Carburant</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="label text-xs">Consommation (L/100km)</label>
                <input
                  type="number"
                  min="3" max="60" step="0.5"
                  value={form.fuelConsumption ?? FUEL_DEFAULTS[form.type] ?? 30}
                  onChange={e => setForm(f => ({ ...f, fuelConsumption: parseFloat(e.target.value) }))}
                  className="input-field"
                />
              </div>
            </div>
            <p className="text-muted text-xs mt-1.5">
              Typique : PL 28–35 L/100km · VUL 9–12 L/100km · Bus 23–28 L/100km
            </p>
          </div>

          {/* Par défaut */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
              className="w-4 h-4 accent-orange-500"
            />
            <div>
              <div className="text-sm text-text font-medium">Véhicule par défaut</div>
              <div className="text-xs text-muted">Sélectionné automatiquement dans le planificateur</div>
            </div>
          </label>

          {/* Règlement applicable */}
          {vTypeInfo && (
            <div className="bg-bg-elevated rounded-lg px-3 py-2.5 flex items-center gap-2">
              <span className="text-lg">{vTypeInfo.emoji}</span>
              <div>
                <div className="text-xs text-text font-medium">{vTypeInfo.label}</div>
                <div className="text-xs text-muted">Règlement : {vTypeInfo.regulation}</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary flex-1">
              {editId === 'new' ? 'Ajouter' : 'Enregistrer'}
            </button>
            <button onClick={closeForm} className="btn-secondary">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Liste des véhicules */}
      <div className="space-y-3">
        {vehicles.length === 0 && (
          <div className="card p-6 text-center text-muted">
            <Truck size={32} className="mx-auto mb-2 opacity-30" />
            <p>Aucun véhicule enregistré.</p>
          </div>
        )}

        {vehicles.map(v => {
          const vt = VEHICLE_TYPES.find(t => t.id === v.type)
          return (
            <div
              key={v.id}
              className={`card p-4 flex items-center gap-3 ${v.isDefault ? 'border-accent/40' : ''}`}
            >
              <span className="text-3xl">{vt?.emoji || '🚛'}</span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-bright font-semibold text-sm truncate">{v.name}</span>
                  {v.isDefault && (
                    <span className="badge bg-accent/15 text-accent flex items-center gap-1">
                      <Star size={10} fill="currentColor" />
                      Défaut
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {v.licensePlate && (
                    <span className="font-mono text-xs text-muted bg-bg-elevated px-1.5 py-0.5 rounded">
                      {v.licensePlate}
                    </span>
                  )}
                  <span className="text-muted text-xs">{vt?.regulation}</span>
                  {v.totalWeight && (
                    <span className="text-muted text-xs">{v.totalWeight}t</span>
                  )}
                  {v.height && (
                    <span className="text-muted text-xs">{v.height}m haut.</span>
                  )}
                  {v.fuelConsumption && (
                    <span className="text-muted text-xs">⛽ {v.fuelConsumption} L/100</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!v.isDefault && (
                  <button
                    onClick={() => handleSetDefault(v.id)}
                    className="btn-ghost p-1.5"
                    title="Définir par défaut"
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  onClick={() => openEdit(v)}
                  className="btn-ghost p-1.5"
                  title="Modifier"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(v.id)}
                  className="btn-ghost p-1.5 text-danger/60 hover:text-danger"
                  title="Supprimer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Info restrictions */}
      <div className="card p-4">
        <h3 className="font-semibold text-bright text-sm mb-2">Limites de vitesse réglementaires</h3>
        <div className="space-y-2">
          {[
            { type: 'pl', label: '🚛 PL > 3,5t', autoroute: '90', route: '80', agglo: '50' },
            { type: 'vul', label: '🚐 VUL ≤ 3,5t', autoroute: '110', route: '80', agglo: '50' },
            { type: 'bus', label: '🚌 Bus / Autocar', autoroute: '100', route: '80', agglo: '50' },
          ].map(row => (
            <div key={row.type} className="flex items-center justify-between bg-bg-elevated rounded-lg px-3 py-2">
              <span className="text-sm text-text">{row.label}</span>
              <div className="flex gap-3 text-xs">
                <span className="text-drive">{row.autoroute} <span className="text-muted">km/h A</span></span>
                <span className="text-pause">{row.route} <span className="text-muted">km/h RN</span></span>
                <span className="text-sub">{row.agglo} <span className="text-muted">km/h agglo</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
