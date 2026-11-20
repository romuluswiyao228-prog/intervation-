import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Ouvre (ou crée) la conversation client ↔ professionnel puis
// redirige vers la page de discussion. Réservé au rôle client.
export function useDiscuss(professionalId: string) {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function discuss() {
    setError(null)
    if (!session) {
      navigate('/connexion')
      return
    }
    if (profile?.role !== 'client') {
      setError('Seul un client peut initier une conversation.')
      return
    }
    setBusy(true)
    try {
      // Conversation existante ?
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_id', session.user.id)
        .eq('professional_id', professionalId)
        .maybeSingle()
      if (existing) {
        navigate(`/conversation/${existing.id}`)
        return
      }
      // Sinon création (RLS + trigger vérifient visibilité/blocage).
      const { data: created, error: insertError } = await supabase
        .from('conversations')
        .insert({
          client_id: session.user.id,
          professional_id: professionalId,
        })
        .select('id')
        .single()
      if (insertError) throw insertError
      navigate(`/conversation/${created.id}`)
    } catch (e) {
      const msg =
        e instanceof Error && e.message
          ? e.message
          : 'Impossible d’ouvrir la conversation.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return { discuss, busy, error }
}
