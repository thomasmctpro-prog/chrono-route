/**
 * Rappels de pause — ChronoRoute
 * Utilise l'API Web Notifications pour afficher des alertes de pause.
 *
 * Limitations :
 * - Les notifications sont programmées avec setTimeout → elles ne survivent
 *   pas si l'onglet est fermé ou le téléphone verrouillé.
 * - Pour des notifications persistantes (écran de verrouillage / barre de
 *   notification), un Service Worker + Push API est nécessaire (PWA).
 */

// IDs des timeouts actifs (pour pouvoir les annuler)
const _timers = new Set()

/**
 * Demande la permission d'envoyer des notifications.
 * @returns {Promise<'granted'|'denied'|'default'>}
 */
export async function requestPermission() {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result
}

/**
 * Retourne true si les notifications sont disponibles et accordées.
 */
export function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted'
}

/**
 * Affiche immédiatement une notification.
 */
function showNotif(title, body, icon = '🚛') {
  if (!canNotify()) return
  try {
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `chrono-${Date.now()}`,
    })
    // Fermer automatiquement après 12 secondes
    setTimeout(() => n.close(), 12_000)
  } catch (e) {
    console.warn('[Notifications] Erreur :', e)
  }
}

/**
 * Programme les rappels de pause pour un trajet.
 *
 * @param {Array} timeline  - segments du trajet (avec startTime, type, reason)
 * @param {number} leadMinutes - minutes d'avance pour l'alerte
 */
export function scheduleBreakNotifications(timeline, leadMinutes = 10) {
  // Annuler les rappels précédents
  cancelAllNotifications()

  if (!canNotify()) return 0

  const now = Date.now()
  let count = 0

  for (const seg of timeline) {
    // Rappels uniquement pour les pauses et repos
    if (seg.type !== 'break' && seg.type !== 'overnight_rest') continue
    if (!seg.startTime) continue

    const startMs = new Date(seg.startTime).getTime()
    const alertMs = startMs - leadMinutes * 60_000

    if (alertMs <= now) continue // Déjà passé

    const delay = alertMs - now

    let title, body
    if (seg.type === 'overnight_rest') {
      title = '🌙 Repos journalier — ChronoRoute'
      body = `Repos obligatoire dans ${leadMinutes} min — Préparez-vous à vous arrêter.`
    } else {
      const isS1 = seg.reason?.includes('1/2')
      const isS2 = seg.reason?.includes('2/2')
      const dur = seg.duration || 0
      if (isS1) {
        title = `☕ Pause fractionnée 1/2 (${dur} min) — ChronoRoute`
        body = `Dans ${leadMinutes} min : pause de ${dur} min. La 2e partie (30 min) viendra plus tard.`
      } else if (isS2) {
        title = `☕ Pause fractionnée 2/2 (${dur} min) — ChronoRoute`
        body = `Dans ${leadMinutes} min : pause finale de ${dur} min. Ceinture de sécurité et bon repos !`
      } else {
        title = `☕ Pause réglementaire (${dur} min) — ChronoRoute`
        body = `Dans ${leadMinutes} min : ${seg.reason || `pause de ${dur} min`}.`
      }
    }

    const tid = setTimeout(() => {
      showNotif(title, body)
      _timers.delete(tid)
    }, delay)

    _timers.add(tid)
    count++
  }

  return count
}

/**
 * Annule tous les rappels programmés.
 */
export function cancelAllNotifications() {
  for (const tid of _timers) {
    clearTimeout(tid)
  }
  _timers.clear()
}
