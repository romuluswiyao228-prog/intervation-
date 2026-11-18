// Rôles possibles d'un utilisateur (miroir de l'enum SQL user_role).
export type UserRole =
  | 'client'
  | 'professionnel'
  | 'administrateur'
  | 'moderateur'

// Statut du compte (miroir de l'enum SQL account_status).
export type AccountStatus = 'actif' | 'suspendu'

// Ligne de la table public.profiles.
export interface Profile {
  id: string
  role: UserRole
  phone: string | null
  phone_verified: boolean
  display_name: string | null
  city: string | null
  neighborhood: string | null
  status: AccountStatus
  accepted_terms_at: string | null
  created_at: string
}

// Rôle proposé à l'inscription (jamais admin/moderateur côté public).
export type SignupRole = 'client' | 'professionnel'
