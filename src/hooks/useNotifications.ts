import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import { useAuth } from './useAuth'
import type { MyConversation } from '../lib/types'

// Nombre de conversations avec messages non lus + Realtime.
// Requête via my_conversations() (champs publics uniquement).
export function useUnreadNotifications() {
  const { session } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!supabaseConfigured || !session) return
    const { data } = await supabase.rpc('my_conversations')
    const convs = (data ?? []) as MyConversation[]
    setCount(convs.filter((c) => c.unread_count > 0).length)
  }, [session])

  useEffect(() => {
    if (!session) return
    let active = true

    async function load() {
      if (!supabaseConfigured) return
      const { data } = await supabase.rpc('my_conversations')
      if (!active) return
      const convs = (data ?? []) as MyConversation[]
      setCount(convs.filter((c) => c.unread_count > 0).length)
    }
    void load()

    // Realtime : toute notification reçue → recalcul du badge.
    const channel = supabase
      .channel(`notifications-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        () => void refresh(),
      )
      .subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [session, refresh])

  return { count, refresh }
}
