import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

// Client Supabase unique pour toute l'application.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Session persistante : l'utilisateur reste connecté entre les ouvertures.
    persistSession: true,
    autoRefreshToken: true,
  },
})
