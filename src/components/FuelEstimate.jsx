import React from 'react'
import { Fuel, Info } from 'lucide-react'

export default function FuelEstimate({ distanceKm, fuelConsumption, fuelPrice }) {
  if (!distanceKm || !fuelConsumption || !fuelPrice) return null

  const liters = Math.round((distanceKm * fuelConsumption / 100) * 10) / 10
  const cost = Math.round(liters * fuelPrice * 100) / 100

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Fuel size={14} className="text-accent" />
        <h3 className="font-semibold text-bright text-sm">Estimation carburant</h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg-elevated rounded-lg p-3 text-center">
          <div className="text-xl mb-1">🛣️</div>
          <div className="font-bold text-sm text-text">{distanceKm} km</div>
          <div className="text-muted text-xs mt-0.5">Distance totale</div>
        </div>
        <div className="bg-bg-elevated rounded-lg p-3 text-center">
          <div className="text-xl mb-1">⛽</div>
          <div className="font-bold text-sm text-text">{liters} L</div>
          <div className="text-muted text-xs mt-0.5">à {fuelConsumption} L/100km</div>
        </div>
        <div className="bg-bg-elevated rounded-lg p-3 text-center">
          <div className="text-xl mb-1">💶</div>
          <div className="font-bold text-base text-accent">{cost.toFixed(2)} €</div>
          <div className="text-muted text-xs mt-0.5">à {fuelPrice.toFixed(2)} €/L</div>
        </div>
      </div>

      <p className="text-muted text-xs mt-2.5 flex items-start gap-1.5">
        <Info size={10} className="mt-0.5 shrink-0 text-muted" />
        Estimation indicative — variations selon la charge, le relief, le trafic et le style de conduite.
        Modifiable dans Réglages (prix) et Véhicules (consommation).
      </p>
    </div>
  )
}
