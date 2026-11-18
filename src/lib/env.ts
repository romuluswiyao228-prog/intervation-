// Variables d'environnement de l'application.
// Toutes les valeurs sensibles sont dans .env (jamais commitées).

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

// Si true (défaut), un code SMS est exigé pour vérifier le téléphone.
// Mettre false UNIQUEMENT en développement : les comptes créés auront
// phone_verified = false.
export const PHONE_VERIFICATION_REQUIRED: boolean =
  import.meta.env.VITE_PHONE_VERIFICATION_REQUIRED !== 'false'

export const supabaseConfigured: boolean =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
