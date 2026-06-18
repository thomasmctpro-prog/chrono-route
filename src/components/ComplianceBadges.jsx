import React from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, Shield } from 'lucide-react'

export default function ComplianceBadges({ compliance }) {
  if (!compliance) return null

  const { violations, warnings, derogationsUsed, infosReglementaires, isCompliant } = compliance

  return (
    <div className="space-y-2">
      {/* Statut global */}
      <div className={`card px-4 py-3 flex items-center gap-3 ${isCompliant ? 'border-drive/30' : 'border-danger/30'}`}>
        {isCompliant
          ? <CheckCircle2 className="text-drive shrink-0" size={20} />
          : <XCircle className="text-danger shrink-0" size={20} />
        }
        <div>
          <div className={`font-semibold text-sm ${isCompliant ? 'text-drive' : 'text-danger'}`}>
            {isCompliant ? 'Trajet conforme à la réglementation' : 'Infraction(s) détectée(s)'}
          </div>
          {infosReglementaires?.map((info, i) => (
            <div key={i} className="text-sub text-xs mt-0.5">{info}</div>
          ))}
        </div>
      </div>

      {/* Violations */}
      {violations?.map((v, i) => (
        <div key={i} className="card px-4 py-3 border-danger/30 flex items-start gap-3">
          <XCircle className="text-danger shrink-0 mt-0.5" size={16} />
          <div>
            <div className="text-danger text-sm font-medium">{v.message}</div>
            {v.article && <div className="text-muted text-xs mt-0.5">{v.article}</div>}
          </div>
        </div>
      ))}

      {/* Avertissements */}
      {warnings?.map((w, i) => (
        <div key={i} className="card px-4 py-3 border-pause/30 flex items-start gap-3">
          <AlertTriangle className="text-pause shrink-0 mt-0.5" size={16} />
          <div>
            <div className="text-pause text-sm font-medium">{w.message}</div>
            {w.article && <div className="text-muted text-xs mt-0.5">{w.article}</div>}
          </div>
        </div>
      ))}

      {/* Dérogations utilisées */}
      {derogationsUsed?.map((d, i) => (
        <div key={i} className="card px-4 py-3 border-blue-500/30 flex items-start gap-3">
          <Shield className="text-blue-400 shrink-0 mt-0.5" size={16} />
          <div>
            <div className="text-blue-400 text-sm font-medium">{d.label}</div>
            {d.article && <div className="text-muted text-xs mt-0.5">{d.article}</div>}
            {d.info && <div className="text-muted text-xs">{d.info}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
