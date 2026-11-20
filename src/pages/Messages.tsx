import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/icons'
import { EmptyState } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { MyConversation } from '../lib/types'

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

// Liste des conversations de l'utilisateur (client ou pro).
export default function Messages() {
  const { session } = useAuth()
  const [conversations, setConversations] = useState<MyConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigured || !session) return
    let active = true

    async function load() {
      const { data, error: rpcError } = await supabase.rpc(
        'my_conversations',
      )
      if (!active) return
      if (rpcError) {
        setError('Impossible de charger les conversations.')
        console.error(rpcError)
      } else {
        setConversations((data ?? []) as MyConversation[])
      }
      setLoading(false)
    }
    void load()

    // Realtime : nouveau message ou notification → recharger la liste.
    const channel = supabase
      .channel(`messages-list-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => void load(),
      )
      .subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [session])

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <Link
          to="/bloques"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          Utilisateurs bloqués
        </Link>
      </div>

      {loading && (
        <p className="py-10 text-center text-gray-500">
          Chargement des conversations…
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!loading && !error && conversations.length === 0 && (
        <div className="mt-6">
          <EmptyState title="Aucune conversation pour le moment">
            Contactez un professionnel depuis son profil pour démarrer
            une discussion.
          </EmptyState>
        </div>
      )}

      {!loading && conversations.length > 0 && (
        <ul className="mt-4 space-y-2">
          {conversations.map((c) => (
            <li key={c.conversation_id}>
              <Link
                to={`/conversation/${c.conversation_id}`}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-blue-300"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-300">
                  {c.other_photo ? (
                    <img
                      src={c.other_photo}
                      alt=""
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Icon name="user" className="h-6 w-6" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {c.other_name ?? 'Utilisateur'}
                    </p>
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {timeAgo(c.last_message_at)}
                    </span>
                  </div>
                  <p className="truncate text-sm text-gray-500">
                    {c.last_body ||
                      (c.last_sender_id ? 'Photo' : 'Aucun message')}
                    {c.statut === 'fermee' && ' · fermée'}
                  </p>
                </div>
                {c.unread_count > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[11px] font-bold text-white">
                    {c.unread_count}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
