// Suivi d'activité en temps réel (style tachygraphe)
// Directive UE 2002/15/CE — temps de travail des travailleurs mobiles

const KEY = 'cr_tachograph'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function persist(session) {
  try { localStorage.setItem(KEY, JSON.stringify(session)) } catch {}
}

function todayKey() {
  return new Date().toISOString().substring(0, 10)
}

// -------------------------------------------------------------------------
// Règles Directive 2002/15/CE — Art. 5
// -------------------------------------------------------------------------
export const WORK_RULES = {
  firstThreshold: 360,   // 6h de travail → pause de 30 min minimum
  firstBreak: 30,
  secondThreshold: 540,  // 9h de travail → pause de 45 min minimum
  secondBreak: 45,
  minBreakPart: 15,      // Chaque partie fractionnée ≥ 15 min
  maxBreakParts: 3,      // Maximum 3 parties (3 × 15 = 45 min)
  maxDailyWork: 600,     // 10h max de travail journalier
  maxDailyWorkExceptional: 780, // 13h exceptionnel (si moyenne ≤ 10h / 4 mois)
}

// -------------------------------------------------------------------------
// Types d'activités (symboles tachygraphe ISO 15005)
// -------------------------------------------------------------------------
export const ACTIVITIES = [
  {
    id: 'drive',
    label: 'Conduite',
    shortLabel: 'Conduite',
    icon: '🚗',
    tachIcon: '▶',
    color: 'drive',
    bgClass: 'bg-drive/10 border-drive/40',
    activeClass: 'bg-drive border-drive text-white',
    textClass: 'text-drive',
    countsAsWork: true,
    countsAsBreak: false,
    description: 'Temps de conduite',
  },
  {
    id: 'work',
    label: 'Autre travail',
    shortLabel: 'Travail',
    icon: '🔨',
    tachIcon: '✕',
    color: 'pause',
    bgClass: 'bg-pause/10 border-pause/40',
    activeClass: 'bg-pause border-pause text-white',
    textClass: 'text-pause',
    countsAsWork: true,
    countsAsBreak: false,
    description: 'Chargement, déchargement, admin, entretien…',
  },
  {
    id: 'availability',
    label: 'Disponibilité',
    shortLabel: 'Dispo',
    icon: '⌛',
    tachIcon: '◻',
    color: 'blue-400',
    bgClass: 'bg-blue-500/10 border-blue-500/40',
    activeClass: 'bg-blue-500 border-blue-500 text-white',
    textClass: 'text-blue-400',
    countsAsWork: false,
    countsAsBreak: false,
    description: 'Attente, ferry, convoi accompagné… (ni travail, ni repos)',
  },
  {
    id: 'rest',
    label: 'Repos / Pause',
    shortLabel: 'Repos',
    icon: '🛏️',
    tachIcon: '—',
    color: 'muted',
    bgClass: 'bg-muted/10 border-muted/40',
    activeClass: 'bg-slate-600 border-slate-500 text-white',
    textClass: 'text-sub',
    countsAsWork: false,
    countsAsBreak: true,
    description: 'Pause repas, repos journalier ou hebdomadaire',
  },
]

export function getActivityById(id) {
  return ACTIVITIES.find(a => a.id === id)
}

// -------------------------------------------------------------------------
// Session par défaut
// -------------------------------------------------------------------------
function defaultSession() {
  return {
    version: 1,
    date: todayKey(),
    currentActivity: null,
    activityStartTime: null,

    // Totaux journaliers (en minutes) — hors activité en cours
    totals: { drive: 0, work: 0, availability: 0, rest: 0 },

    // Compteur travail (drive + work) depuis la dernière pause valide
    workSinceLastBreak: 0,

    // Crédit de pause accumulé dans la fenêtre de travail en cours
    // Ne compte que les périodes de repos ≥ 15 min
    breakCredit: 0,

    // Minutes de la pause en cours (si currentActivity === 'rest' ou 'availability')
    // Permet de valider si la pause compte (≥ 15 min)
    pendingBreakMinutes: 0,

    // Historique des activités (50 dernières)
    history: [],
  }
}

// -------------------------------------------------------------------------
// Lecture de la session
// -------------------------------------------------------------------------
export function getSession() {
  const stored = load()
  if (!stored) return defaultSession()

  // Reset automatique si nouveau jour
  if (stored.date !== todayKey()) {
    const fresh = defaultSession()
    persist(fresh)
    return fresh
  }

  return stored
}

// -------------------------------------------------------------------------
// Calcul de l'état en temps réel (sans écrire dans le store)
// -------------------------------------------------------------------------
export function computeLiveState(session) {
  if (!session.currentActivity || !session.activityStartTime) {
    return buildState(session, 0)
  }

  const elapsedMs = Date.now() - new Date(session.activityStartTime).getTime()
  const elapsed = elapsedMs / 60_000 // minutes

  return buildState(session, elapsed)
}

function buildState(session, elapsedForCurrentActivity) {
  const act = getActivityById(session.currentActivity)

  // Totaux effectifs (stockés + en cours)
  const totals = { ...session.totals }
  if (session.currentActivity && elapsedForCurrentActivity > 0) {
    totals[session.currentActivity] = (totals[session.currentActivity] || 0) + elapsedForCurrentActivity
  }

  // Travail continu effectif
  let workSince = session.workSinceLastBreak
  let breakCredit = session.breakCredit
  let pendingBreak = session.pendingBreakMinutes

  if (act?.countsAsWork) {
    workSince += elapsedForCurrentActivity
  } else if (act?.countsAsBreak || act?.id === 'availability') {
    // Accumuler la pause courante (ne sera validée que si ≥ 15 min)
    pendingBreak += elapsedForCurrentActivity
    // Si la pause en cours est déjà ≥ 15 min, elle compte comme crédit
    if (pendingBreak >= WORK_RULES.minBreakPart) {
      breakCredit = session.breakCredit + pendingBreak
    }
  }

  // Totaux travail journalier
  const totalWork = totals.drive + totals.work

  // Déterminer l'alerte de pause
  const alert = computeBreakAlert(workSince, breakCredit)

  // Temps de travail restant avant alerte
  const nextAlertIn = computeNextAlert(workSince, breakCredit)

  return {
    ...session,
    // Live
    elapsedMinutes: elapsedForCurrentActivity,
    effectiveTotals: totals,
    effectiveWorkSince: workSince,
    effectiveBreakCredit: breakCredit,
    effectivePendingBreak: pendingBreak,
    totalWorkToday: totalWork,
    totalDriveToday: totals.drive,
    // Alertes
    breakAlert: alert,
    nextAlertIn,
  }
}

function computeBreakAlert(workSince, breakCredit) {
  const { firstThreshold, firstBreak, secondThreshold, secondBreak } = WORK_RULES

  if (workSince >= secondThreshold) {
    const needed = secondBreak - breakCredit
    if (needed > 0) {
      return {
        level: 'critical',
        message: `Pause de 45 min obligatoire ! (9h de travail atteintes)`,
        detail: `Il vous manque encore ${Math.ceil(needed)} min de pause. Fractionnement : 3×15 min autorisé.`,
        breakNeeded: Math.ceil(needed),
        splitOptions: generateSplitOptions(Math.ceil(needed), 15, 3),
      }
    }
  }

  if (workSince >= firstThreshold) {
    const needed = firstBreak - breakCredit
    if (needed > 0) {
      return {
        level: 'critical',
        message: `Pause de 30 min obligatoire ! (6h de travail atteintes)`,
        detail: `Il vous manque encore ${Math.ceil(needed)} min de pause. Fractionnement : 2×15 min autorisé.`,
        breakNeeded: Math.ceil(needed),
        splitOptions: generateSplitOptions(Math.ceil(needed), 15, 2),
      }
    }
  }

  // Alertes préventives
  const warnAt5h30 = firstThreshold - 30
  const warnAt8h30 = secondThreshold - 30

  if (workSince >= warnAt8h30 && breakCredit < secondBreak) {
    return {
      level: 'warning',
      message: `Pause de 45 min dans ${Math.ceil(secondThreshold - workSince)} min`,
      detail: `Vous approchez des 9h de travail. Planifiez votre pause.`,
      breakNeeded: 0,
      splitOptions: [],
    }
  }

  if (workSince >= warnAt5h30 && breakCredit < firstBreak) {
    return {
      level: 'warning',
      message: `Pause de 30 min dans ${Math.ceil(firstThreshold - workSince)} min`,
      detail: `Vous approchez des 6h de travail. Planifiez votre pause.`,
      breakNeeded: 0,
      splitOptions: [],
    }
  }

  return null
}

function computeNextAlert(workSince, breakCredit) {
  const { firstThreshold, firstBreak, secondThreshold, secondBreak } = WORK_RULES

  if (workSince >= secondThreshold && breakCredit < secondBreak) return 0
  if (workSince >= firstThreshold && breakCredit < firstBreak) return 0

  if (workSince < firstThreshold) return firstThreshold - workSince
  if (workSince < secondThreshold) return secondThreshold - workSince

  return null // Tout OK
}

function generateSplitOptions(needed, minPart, maxParts) {
  const parts = []
  let remaining = needed
  while (remaining > 0 && parts.length < maxParts) {
    const part = Math.min(remaining, Math.max(minPart, Math.ceil(remaining / (maxParts - parts.length))))
    parts.push(Math.ceil(part))
    remaining -= part
  }
  return parts
}

// -------------------------------------------------------------------------
// Changement d'activité
// -------------------------------------------------------------------------
export function switchActivity(session, newActivity) {
  const now = new Date()
  const elapsed = session.activityStartTime
    ? (now.getTime() - new Date(session.activityStartTime).getTime()) / 60_000
    : 0

  const prevAct = getActivityById(session.currentActivity)
  const newTotals = { ...session.totals }

  // Enregistrer le temps de l'activité précédente
  if (session.currentActivity && elapsed > 0) {
    newTotals[session.currentActivity] = (newTotals[session.currentActivity] || 0) + elapsed
  }

  // Mettre à jour le compteur de travail continu
  let newWorkSince = session.workSinceLastBreak
  let newBreakCredit = session.breakCredit
  let newPendingBreak = session.pendingBreakMinutes

  if (prevAct?.countsAsWork) {
    newWorkSince += elapsed
  } else if (prevAct?.countsAsBreak || prevAct?.id === 'availability') {
    newPendingBreak += elapsed

    // Une pause ne compte que si ≥ 15 min (valider seulement maintenant)
    if (newPendingBreak >= WORK_RULES.minBreakPart) {
      newBreakCredit += newPendingBreak
    }
    newPendingBreak = 0

    // Vérifier si les seuils sont satisfaits → reset du compteur travail
    const { firstThreshold, firstBreak, secondThreshold, secondBreak } = WORK_RULES
    if (newWorkSince >= secondThreshold && newBreakCredit >= secondBreak) {
      newWorkSince = 0
      newBreakCredit = 0
    } else if (newWorkSince >= firstThreshold && newBreakCredit >= firstBreak) {
      newWorkSince = 0
      newBreakCredit = 0
    }
  }

  // Si on reprend le travail, reset du pendingBreak
  const nextAct = getActivityById(newActivity)
  if (nextAct?.countsAsWork) {
    newPendingBreak = 0
  }

  // Historique
  const history = [...(session.history || []).slice(-49)]
  if (session.currentActivity && elapsed >= 0.1) {
    history.push({
      activity: session.currentActivity,
      label: prevAct?.label || session.currentActivity,
      start: session.activityStartTime,
      end: now.toISOString(),
      durationMinutes: Math.round(elapsed * 10) / 10,
    })
  }

  const updated = {
    ...session,
    currentActivity: newActivity,
    activityStartTime: newActivity ? now.toISOString() : null,
    totals: newTotals,
    workSinceLastBreak: newWorkSince,
    breakCredit: newBreakCredit,
    pendingBreakMinutes: newPendingBreak,
    history,
  }

  persist(updated)
  return updated
}

// -------------------------------------------------------------------------
// Ajout d'une entrée manuelle (sans minuteur)
// -------------------------------------------------------------------------

/**
 * Ajoute une activité passée directement au journal, sans démarrer de minuteur.
 * @param {object} session  Session en cours
 * @param {string} activityId  Id de l'activité (drive|work|availability|rest)
 * @param {string} startTimeStr  Heure de début "HH:MM"
 * @param {number} durationMinutes  Durée en minutes (> 0)
 */
export function addManualEntry(session, activityId, startTimeStr, durationMinutes) {
  if (!activityId || !startTimeStr || !durationMinutes || durationMinutes <= 0) {
    throw new Error('Paramètres invalides')
  }

  const act = getActivityById(activityId)
  if (!act) throw new Error('Activité inconnue')

  // Construire les timestamps ISO pour aujourd'hui
  const [h, m] = startTimeStr.split(':').map(Number)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0)
  const end = new Date(start.getTime() + durationMinutes * 60_000)

  // Mise à jour des totaux
  const newTotals = { ...session.totals }
  newTotals[activityId] = (newTotals[activityId] || 0) + durationMinutes

  // Mise à jour des compteurs travail/pause
  let newWorkSince = session.workSinceLastBreak
  let newBreakCredit = session.breakCredit

  if (act.countsAsWork) {
    // Conduite ou autre travail → incrémente le travail continu
    newWorkSince += durationMinutes
  } else if (act.countsAsBreak || act.id === 'availability') {
    // Repos ou disponibilité : ne compte comme crédit que si ≥ 15 min
    if (durationMinutes >= WORK_RULES.minBreakPart) {
      newBreakCredit += durationMinutes
    }
    // Vérifier si un seuil est satisfait → réinitialiser les compteurs
    const { firstThreshold, firstBreak, secondThreshold, secondBreak } = WORK_RULES
    if (newWorkSince >= secondThreshold && newBreakCredit >= secondBreak) {
      newWorkSince = 0
      newBreakCredit = 0
    } else if (newWorkSince >= firstThreshold && newBreakCredit >= firstBreak) {
      newWorkSince = 0
      newBreakCredit = 0
    }
  }
  // La disponibilité ne s'ajoute pas au workSince (ni travail, ni repos effectif)

  // Historique — on insère et on re-trie par heure de début
  const history = [...(session.history || []).slice(-49), {
    activity: activityId,
    label: act.label,
    start: start.toISOString(),
    end: end.toISOString(),
    durationMinutes: Math.round(durationMinutes * 10) / 10,
    manual: true, // flag pour l'affichage
  }]
  history.sort((a, b) => new Date(a.start) - new Date(b.start))

  const updated = {
    ...session,
    totals: newTotals,
    workSinceLastBreak: newWorkSince,
    breakCredit: newBreakCredit,
    history,
  }

  persist(updated)
  return updated
}

// -------------------------------------------------------------------------
// Reset de la session (fin de journée)
// -------------------------------------------------------------------------
export function resetSession() {
  const fresh = defaultSession()
  persist(fresh)
  return fresh
}

export function saveSession(session) {
  persist(session)
}

// -------------------------------------------------------------------------
// Format utilitaires
// -------------------------------------------------------------------------
export function formatElapsed(minutes) {
  if (minutes === null || minutes === undefined) return '0:00'
  const m = Math.floor(Math.max(0, minutes))
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${h}:${String(min).padStart(2, '0')}`
}

export function formatElapsedFull(minutes) {
  const m = Math.floor(Math.max(0, minutes))
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min} min`
  if (min === 0) return `${h}h`
  return `${h}h${String(min).padStart(2, '0')}`
}
