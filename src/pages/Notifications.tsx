import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { AppNotification } from '../lib/types'

// Liste des notifications internes.
const TYPE_LABELS: Record<AppNotification['type'], string> = {
  nouveau_message: 'Nouveau message reçu',
  intervention_proposee: 'Nouvelle proposition d\'intervention',
  intervention_confirmee: 'Intervention confirmée',
  intervention_refusee: 'Intervention refusée',
  intervention_annulee: 'Intervention annulée',
  intervention_a_confirmer: 'Intervention terminée : à confirmer',
  intervention_terminee: 'Intervention terminée',
  nouvel_avis: 'Nouvel avis reçu',
  reponse_avis: 'Réponse à votre avis',
}

export default function Notifications() {
  const { session } = useAuth()
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseConfigured || !session) return
    let active = true
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (active) {
          setItems((data ?? []) as AppNotification[])
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [session])

  async function markAllRead() {
    if (!session) return
    await supabase
      .from('notifications')
      .update({ lue: true })
      .eq('user_id', session.user.id)
      .eq('lue', false)
    setItems((prev) => prev.map((n) => ({ ...n, lue: true })))
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        {items.some((n) => !n.lue) && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Tout marquer comme lu
          </button>
        )}
      </div>

      {loading && (
        <p className="py-10 text-center text-gray-500">Chargement…</p>
      )}
      {!loading && items.length === 0 && (
        <div className="mt-6">
          <EmptyState title="Aucune notification" />
        </div>
      )}
      {!loading && items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Card
                className={`flex items-center gap-3 p-3 ${
                  n.lue ? 'opacity-60' : ''
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    n.lue ? 'bg-gray-300' : 'bg-blue-600'
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm text-gray-800">
                    {TYPE_LABELS[n.type] ?? 'Notification'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(n.created_at).toLocaleString('fr-FR')}
                  </p>
                </div>
                {n.conversation_id && (
                  <Link
                    to={`/conversation/${n.conversation_id}`}
                    className="text-sm font-medium text-blue-700 hover:underline"
                  >
                    Voir
                  </Link>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
