import React, { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle, CheckCircle2, Clock, RotateCcw, ChevronDown, ChevronUp, Info,
  Pencil, Plus, Check,
} from 'lucide-react'
import {
  ACTIVITIES, WORK_RULES, getSession, switchActivity, resetSession,
  computeLiveState, formatElapsed, formatElapsedFull, getActivityById,
  addManualEntry,
} from '../lib/activityStorage.js'

// Calcule l'heure de fin à partir d'une heure de début et d'une durée
function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + Math.round(minutes)
  const endH = Math.floor(total / 60) % 24
  const endM = total % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

// Retourne l'heure actuelle au format HH:MM
function nowTimeStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function TachographPage() {
  const [session, setSession] = useState(() => getSession())
  const [liveState, setLiveState] = useState(() => computeLiveState(getSession()))
  const [showHistory, setShowHistory] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const tickRef = useRef(null)

  // --- Saisie manuelle ---
  const [manualOpen, setManualOpen] = useState(false)
  const [manualActivity, setManualActivity] = useState('drive')
  const [manualStart, setManualStart] = useState(nowTimeStr)
  const [manualDuration, setManualDuration] = useState(60)
  const [manualSuccess, setManualSuccess] = useState(false)
  const [manualError, setManualError] = useState(null)

  const manualEndPreview = addMinutesToTime(manualStart, manualDuration)
  const manualAct = getActivityById(manualActivity)

  // Tick toutes les secondes pour mettre à jour les compteurs
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setLiveState(computeLiveState(session))
    }, 1000)
    return () => clearInterval(tickRef.current)
  }, [session])

  function handleSwitch(activityId) {
    if (activityId === session.currentActivity) return
    const updated = switchActivity(session, activityId)
    setSession(updated)
    setLiveState(computeLiveState(updated))
  }

  function handleStop() {
    const updated = switchActivity(session, null)
    setSession(updated)
    setLiveState(computeLiveState(updated))
  }

  function handleReset() {
    if (!confirmReset) { setConfirmReset(true); return }
    const fresh = resetSession()
    setSession(fresh)
    setLiveState(computeLiveState(fresh))
    setConfirmReset(false)
  }

  function handleManualAdd() {
    setManualError(null)
    if (!manualActivity) { setManualError('Sélectionnez une activité.'); return }
    if (!manualStart) { setManualError('Indiquez une heure de début.'); return }
    if (!manualDuration || manualDuration <= 0) { setManualError('La durée doit être > 0.'); return }

    try {
      const updated = addManualEntry(session, manualActivity, manualStart, manualDuration)
      setSession(updated)
      setLiveState(computeLiveState(updated))
      setManualSuccess(true)
      // Faire avancer l'heure de début pour la prochaine saisie
      setManualStart(addMinutesToTime(manualStart, manualDuration))
      setTimeout(() => setManualSuccess(false), 2500)
    } catch (e) {
      setManualError(e.message || 'Erreur lors de l\'ajout.')
    }
  }

  const { breakAlert, nextAlertIn, effectiveTotals, effectiveWorkSince,
          effectiveBreakCredit, effectivePendingBreak, totalWorkToday, elapsedMinutes } = liveState

  const currentAct = getActivityById(session.currentActivity)
  const totalWork = effectiveTotals.drive + effectiveTotals.work
  const totalRest = effectiveTotals.rest + effectiveTotals.availability

  // Progression vers le prochain seuil de pause travail
  const { firstThreshold, firstBreak, secondThreshold, secondBreak } = WORK_RULES
  let workProgressMax = firstThreshold
  let workProgressLabel = '6h'
  let breakRequiredNow = 0
  if (effectiveWorkSince >= firstThreshold) {
    workProgressMax = secondThreshold
    workProgressLabel = '9h'
    breakRequiredNow = firstBreak
  }
  if (effectiveWorkSince >= secondThreshold) {
    workProgressMax = secondThreshold
    workProgressLabel = '9h MAX'
    breakRequiredNow = secondBreak
  }
  const workProgressPct = Math.min(100, (effectiveWorkSince / workProgressMax) * 100)
  const breakCreditPct = Math.min(100, (effectiveBreakCredit / Math.max(breakRequiredNow, 1)) * 100)

  return (
    <div className="space-y-4 slide-up">
      {/* Titre */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Tachygraphe</h1>
          <p className="text-muted text-sm mt-0.5">Directive UE 2002/15/CE • Temps de travail</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Affichage activité en cours — style tachygraphe                    */}
      {/* ------------------------------------------------------------------ */}
      <div className={`card p-5 border-2 transition-colors ${
        !currentAct
          ? 'border-bg-border'
          : currentAct.id === 'drive' ? 'border-drive/50'
          : currentAct.id === 'work' ? 'border-pause/50'
          : currentAct.id === 'availability' ? 'border-blue-500/50'
          : 'border-slate-500/50'
      }`}>
        {/* Icône tachygraphe */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-xs text-muted uppercase tracking-widest mb-1">Activité en cours</div>
            {currentAct ? (
              <div className="flex items-center gap-2">
                <span className="text-2xl">{currentAct.icon}</span>
                <div>
                  <span className={`font-bold text-lg ${currentAct.textClass}`}>{currentAct.label}</span>
                  <div className="text-muted text-xs">{currentAct.description}</div>
                </div>
              </div>
            ) : (
              <div className="text-sub font-medium">— Aucune activité —</div>
            )}
          </div>

          {/* Chrono */}
          {currentAct && (
            <div className="text-right">
              <div className={`font-mono text-3xl font-bold tabular-nums ${currentAct.textClass}`}>
                {formatElapsed(elapsedMinutes)}
              </div>
              <div className="text-muted text-xs">
                depuis {session.activityStartTime
                  ? new Date(session.activityStartTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                  : '--'}
              </div>
            </div>
          )}
        </div>

        {/* Boutons d'activité — style tachygraphe */}
        <div className="grid grid-cols-4 gap-2">
          {ACTIVITIES.map(act => {
            const isActive = session.currentActivity === act.id
            return (
              <button
                key={act.id}
                onClick={() => handleSwitch(act.id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-150 active:scale-95 ${
                  isActive ? act.activeClass : act.bgClass + ' hover:opacity-80'
                }`}
              >
                <span className="text-2xl leading-none">{act.icon}</span>
                <span className={`text-xs font-bold ${isActive ? 'text-white' : act.textClass}`}>
                  {act.shortLabel}
                </span>
                {/* Symbole tachygraphe */}
                <span className={`text-xs opacity-60 font-mono ${isActive ? 'text-white' : 'text-muted'}`}>
                  {act.tachIcon}
                </span>
              </button>
            )
          })}
        </div>

        {currentAct && (
          <button
            onClick={handleStop}
            className="mt-3 w-full text-sm text-muted hover:text-sub transition-colors py-1.5 border border-bg-border rounded-lg hover:bg-bg-elevated"
          >
            Arrêter l'activité
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Saisie manuelle                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="card">
        {/* En-tête toggle */}
        <button
          onClick={() => setManualOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-elevated transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Pencil size={14} className="text-accent" />
            <span className="font-semibold text-bright text-sm">Saisie manuelle</span>
            <span className="text-xs text-muted">— Ajouter une activité passée</span>
          </div>
          {manualOpen
            ? <ChevronUp size={14} className="text-muted" />
            : <ChevronDown size={14} className="text-muted" />}
        </button>

        {manualOpen && (
          <div className="px-4 pb-4 space-y-4 slide-up">
            {/* Sélection activité */}
            <div>
              <label className="label text-xs">Activité</label>
              <div className="grid grid-cols-4 gap-2">
                {ACTIVITIES.map(act => {
                  const isSelected = manualActivity === act.id
                  return (
                    <button
                      key={act.id}
                      onClick={() => setManualActivity(act.id)}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all active:scale-95 ${
                        isSelected ? act.activeClass : act.bgClass + ' hover:opacity-80'
                      }`}
                    >
                      <span className="text-xl leading-none">{act.icon}</span>
                      <span className={`text-xs font-bold leading-tight text-center ${
                        isSelected ? 'text-white' : act.textClass
                      }`}>
                        {act.shortLabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Heure de début + durée */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Heure de début</label>
                <input
                  type="time"
                  value={manualStart}
                  onChange={e => setManualStart(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label text-xs">Durée (minutes)</label>
                <input
                  type="number"
                  min={1} max={900} step={5}
                  value={manualDuration}
                  onChange={e => setManualDuration(Math.max(1, +e.target.value || 1))}
                  className="input-field"
                />
              </div>
            </div>

            {/* Raccourcis durée */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted self-center mr-1">Durée :</span>
              {[15, 30, 45, 60, 90, 120, 180, 240].map(v => (
                <button
                  key={v}
                  onClick={() => setManualDuration(v)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    manualDuration === v
                      ? 'border-accent bg-accent/15 text-accent font-bold'
                      : 'border-bg-border bg-bg-elevated text-muted hover:text-sub'
                  }`}
                >
                  {v < 60 ? `${v}min` : v === 60 ? '1h' : v < 120 ? `${v/60}h` : v === 120 ? '2h' : v === 180 ? '3h' : '4h'}
                </button>
              ))}
            </div>

            {/* Aperçu de l'entrée */}
            {manualAct && manualStart && manualDuration > 0 && (
              <div className={`rounded-lg px-3 py-2.5 border flex items-center gap-3 ${manualAct.bgClass}`}>
                <span className="text-xl">{manualAct.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${manualAct.textClass}`}>{manualAct.label}</div>
                  <div className="text-muted text-xs font-mono">
                    {manualStart} → {manualEndPreview}
                    <span className="ml-2 text-sub">({formatElapsedFull(manualDuration)})</span>
                  </div>
                </div>
              </div>
            )}

            {/* Erreur */}
            {manualError && (
              <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="shrink-0" />
                {manualError}
              </div>
            )}

            {/* Bouton ajouter */}
            <button
              onClick={handleManualAdd}
              disabled={!manualActivity || !manualStart || !manualDuration}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all
                disabled:opacity-40 ${
                  manualSuccess
                    ? 'bg-drive/20 border border-drive/40 text-drive'
                    : 'btn-primary'
                }`}
            >
              {manualSuccess ? (
                <><Check size={15} /> Activité ajoutée au journal</>
              ) : (
                <><Plus size={15} /> Ajouter au journal</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Alerte pause travail                                               */}
      {/* ------------------------------------------------------------------ */}
      {breakAlert && (
        <div className={`card px-4 py-3 border-2 ${
          breakAlert.level === 'critical'
            ? 'border-danger/50 bg-danger/5'
            : 'border-pause/50 bg-pause/5'
        } slide-up`}>
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={breakAlert.level === 'critical' ? 'text-danger' : 'text-pause'}
              size={20}
            />
            <div className="flex-1">
              <div className={`font-bold text-sm ${
                breakAlert.level === 'critical' ? 'text-danger' : 'text-pause'
              }`}>
                {breakAlert.message}
              </div>
              <div className="text-sub text-xs mt-1">{breakAlert.detail}</div>

              {/* Options de fractionnement */}
              {breakAlert.splitOptions?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs text-muted">Fractionnement possible :</span>
                  {breakAlert.splitOptions.map((part, i) => (
                    <span key={i} className="badge bg-danger/15 text-danger">
                      {part} min {i < breakAlert.splitOptions.length - 1 ? '→' : ''}
                    </span>
                  ))}
                </div>
              )}

              {/* Bouton pause rapide */}
              {breakAlert.level === 'critical' && (
                <button
                  onClick={() => handleSwitch('rest')}
                  className="mt-2 btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5"
                >
                  🛏️ Démarrer la pause maintenant
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Jauges temps de travail                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="card p-4 space-y-4">
        <h3 className="font-semibold text-bright text-sm flex items-center gap-2">
          <Clock size={14} className="text-accent" />
          Compteurs de travail
        </h3>

        {/* Travail continu depuis dernière pause */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <span className="text-sm text-text font-medium">Travail continu</span>
              <span className="text-muted text-xs ml-2">(conduite + autre travail)</span>
            </div>
            <span className={`font-mono text-sm font-bold ${
              effectiveWorkSince >= secondThreshold ? 'text-danger'
              : effectiveWorkSince >= firstThreshold ? 'text-pause'
              : 'text-text'
            }`}>
              {formatElapsedFull(effectiveWorkSince)}
              <span className="text-muted font-normal"> / {workProgressLabel}</span>
            </span>
          </div>

          {/* Barre de progression */}
          <div className="h-3 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                effectiveWorkSince >= secondThreshold ? 'bg-danger'
                : effectiveWorkSince >= firstThreshold ? 'bg-pause'
                : workProgressPct > 75 ? 'bg-pause'
                : 'bg-drive'
              }`}
              style={{ width: `${workProgressPct}%` }}
            />
          </div>

          {/* Marqueurs de seuil */}
          <div className="relative h-4 mt-1">
            <div className="absolute left-0 text-muted text-xs">0h</div>
            <div className="absolute text-muted text-xs" style={{ left: `${(firstThreshold / workProgressMax) * 100}%`, transform: 'translateX(-50%)' }}>
              {workProgressLabel === '9h' ? '6h ✓' : '6h'}
            </div>
            <div className="absolute right-0 text-muted text-xs">{workProgressLabel}</div>
          </div>

          {/* Prochain seuil */}
          {nextAlertIn !== null && nextAlertIn > 0 && (
            <div className="text-muted text-xs mt-1">
              Prochain seuil dans{' '}
              <span className="text-text font-medium">{formatElapsedFull(nextAlertIn)}</span>
            </div>
          )}
        </div>

        {/* Crédit de pause accumulé */}
        {(effectiveBreakCredit > 0 || effectivePendingBreak > 0) && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-sm text-text font-medium">Crédit pause</span>
                {effectivePendingBreak > 0 && effectivePendingBreak < WORK_RULES.minBreakPart && (
                  <span className="text-muted text-xs ml-2">
                    (pause de {Math.floor(effectivePendingBreak)} min en cours — pas encore validée)
                  </span>
                )}
              </div>
              <span className="font-mono text-sm font-bold text-drive">
                {formatElapsedFull(effectiveBreakCredit)}
                {breakRequiredNow > 0 && (
                  <span className="text-muted font-normal"> / {breakRequiredNow} min</span>
                )}
              </span>
            </div>
            {breakRequiredNow > 0 && (
              <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-drive rounded-full transition-all"
                  style={{ width: `${Math.min(100, breakCreditPct)}%` }}
                />
              </div>
            )}
            <div className="text-muted text-xs mt-1">
              Une pause ne compte que si elle dure ≥ 15 min (Directive 2002/15/CE Art. 5)
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Totaux journaliers                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="card p-4">
        <h3 className="font-semibold text-bright text-sm mb-3">Bilan de la journée</h3>
        <div className="grid grid-cols-2 gap-3">
          {ACTIVITIES.map(act => {
            const mins = effectiveTotals[act.id] || 0
            return (
              <div
                key={act.id}
                className={`rounded-xl p-3 border ${
                  session.currentActivity === act.id
                    ? act.bgClass.replace('/10', '/20')
                    : 'bg-bg-elevated border-bg-border'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{act.icon}</span>
                  <span className={`text-xs font-medium ${act.textClass}`}>{act.shortLabel}</span>
                  {session.currentActivity === act.id && (
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse ml-auto" />
                  )}
                </div>
                <div className={`font-mono text-xl font-bold ${act.textClass}`}>
                  {formatElapsed(mins)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Totaux synthèse */}
        <div className="mt-3 pt-3 border-t border-bg-border grid grid-cols-2 gap-3">
          <div className="bg-bg-elevated rounded-lg px-3 py-2">
            <div className="text-xs text-muted mb-0.5">Total travail</div>
            <div className={`font-mono font-bold ${
              totalWork > WORK_RULES.maxDailyWork ? 'text-danger' : 'text-pause'
            }`}>
              {formatElapsed(totalWork)}
              <span className="text-muted text-xs font-normal"> / {WORK_RULES.maxDailyWork / 60}h</span>
            </div>
          </div>
          <div className="bg-bg-elevated rounded-lg px-3 py-2">
            <div className="text-xs text-muted mb-0.5">Total repos</div>
            <div className="font-mono font-bold text-sub">
              {formatElapsed(totalRest)}
            </div>
          </div>
        </div>

        {/* Alerte max journalier */}
        {totalWork > WORK_RULES.maxDailyWork * 0.9 && (
          <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
            totalWork > WORK_RULES.maxDailyWork
              ? 'bg-danger/10 border-danger/30 text-danger'
              : 'bg-pause/10 border-pause/30 text-pause'
          }`}>
            <AlertTriangle size={13} />
            {totalWork > WORK_RULES.maxDailyWork
              ? `Temps de travail journalier dépassé (max 10h — Art. 4 Directive 2002/15/CE)`
              : `Proche de la limite journalière : ${formatElapsedFull(WORK_RULES.maxDailyWork - totalWork)} restantes`
            }
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Historique de la journée                                           */}
      {/* ------------------------------------------------------------------ */}
      {session.history?.length > 0 && (
        <div className="card p-4">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center justify-between w-full"
          >
            <h3 className="font-semibold text-bright text-sm">
              Historique du jour ({session.history.length} activités)
            </h3>
            {showHistory ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-1.5">
              {[...session.history].reverse().map((entry, i) => {
                const act = getActivityById(entry.activity)
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-bg-border last:border-0">
                    <span className="text-base w-5 text-center">{act?.icon || '?'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-medium ${act?.textClass || 'text-sub'}`}>
                          {entry.label}
                        </span>
                        {entry.manual && (
                          <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">
                            <Pencil size={9} />
                            Manuel
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono text-xs text-muted">
                        {new Date(entry.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {' → '}
                        {new Date(entry.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className={`text-xs font-semibold ${act?.textClass || 'text-sub'}`}>
                        {formatElapsedFull(entry.durationMinutes)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Rappel réglementaire                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="card p-4">
        <h3 className="font-semibold text-bright text-sm mb-3 flex items-center gap-2">
          <Info size={14} className="text-blue-400" />
          Règles pauses travail (Art. 5 — Directive 2002/15/CE)
        </h3>
        <div className="space-y-2 text-xs text-sub">
          <RuleRow icon="🔨+🚗" rule="6h de travail continu" consequence="→ 30 min de pause obligatoire (2×15 min autorisé)" />
          <RuleRow icon="🔨+🚗" rule="9h de travail continu" consequence="→ 45 min de pause obligatoire (3×15 min autorisé)" />
          <RuleRow icon="⌛" rule="Disponibilité" consequence="Ni travail, ni pause valide — n'interrompt pas le compteur" />
          <RuleRow icon="🛏️" rule="Repos ≥ 15 min" consequence="Compte comme crédit de pause valide" />
          <RuleRow icon="🛏️" rule="Repos < 15 min" consequence="Ne compte pas (trop court pour valider une pause)" />
          <div className="pt-2 mt-1 border-t border-bg-border text-muted">
            Ces règles s'appliquent en plus des règles de conduite EU 561/2006 (pause après 4h30 de conduite).
          </div>
        </div>
      </div>

      {/* Reset */}
      <div className="flex gap-2">
        <button
          onClick={handleReset}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-colors text-sm font-medium ${
            confirmReset
              ? 'bg-danger/10 border-danger/40 text-danger'
              : 'bg-bg-elevated border-bg-border text-muted hover:text-sub'
          }`}
        >
          <RotateCcw size={14} />
          {confirmReset ? 'Confirmer la remise à zéro ?' : 'Remise à zéro journée'}
        </button>
        {confirmReset && (
          <button
            onClick={() => setConfirmReset(false)}
            className="px-4 py-2.5 rounded-lg border border-bg-border bg-bg-elevated text-sub text-sm"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  )
}

function RuleRow({ icon, rule, consequence }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0">{icon}</span>
      <div>
        <span className="text-text font-medium">{rule} </span>
        <span className="text-muted">{consequence}</span>
      </div>
    </div>
  )
}
