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

// Type de projet d'une catégorie (miroir de l'enum SQL project_type).
export type ProjectType =
  | 'reparation'
  | 'construction_renovation'
  | 'entretien'
  | 'services_domicile'

// Ligne de la table public.categories.
export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  project_type: ProjectType
  position: number
  is_active: boolean
  created_at: string
}

// Ligne de la table public.homepage_banners.
export interface HomepageBanner {
  id: string
  image_url: string
  alt: string | null
  position: number
  is_active: boolean
  created_at: string
}

// Ligne de la table public.metiers.
export interface Metier {
  id: string
  category_id: string
  name: string
  position: number
  is_active: boolean
}

// Ligne retournée par la fonction SQL search_professionals.
// Aucun champ de coordonnée n'y figure (confidentialité).
export interface ProfessionalResult {
  profile_id: string
  nom_affiche: string | null
  photo_url: string | null
  ville: string | null
  quartier: string | null
  metiers: string | null
  niveau: 'debutant' | 'confirme' | 'expert' | null
  disponibilite: 'immediat' | 'sur_rdv' | null
  tarif_indicatif: string | null
  rayon_km: number | null
  numero_verifie: boolean
  identite_verifiee: boolean
  note_moyenne: number | null
  nombre_avis: number
  // Palier de distance : 0 = « moins de 1 km », sinon « environ X km ».
  distance_approxe_km: number | null
  dans_rayon: boolean
  total_count: number
}

// Ligne de la vue public.professionals_public (page profil publique).
export interface PublicProfessional {
  id: string
  nom_affiche: string | null
  photo_url: string | null
  ville: string | null
  quartier: string | null
  rayon_km: number | null
  tarif_indicatif: string | null
  disponibilite: string | null
  niveau: string | null
  numero_verifie: boolean
  identite_verifiee: boolean
  metiers: string | null
  note_moyenne: number | null
  nombre_avis: number
}

// Ligne retournée par la fonction SQL my_conversations().
export interface MyConversation {
  conversation_id: string
  other_id: string
  other_name: string | null
  other_photo: string | null
  other_quartier: string | null
  statut: 'ouverte' | 'fermee'
  last_message_at: string | null
  last_body: string | null
  last_sender_id: string | null
  is_blocked: boolean
  unread_count: number
}

// Ligne de la table public.messages.
export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  image_path: string | null
  created_at: string
  read_at: string | null
}

// Ligne retournée par la fonction SQL my_blocks().
export interface MyBlock {
  blocked_id: string
  blocked_name: string | null
  blocked_photo: string | null
  blocked_quartier: string | null
  created_at: string
}

// Ligne retournée par la fonction SQL my_interventions().
export type InterventionStatut =
  | 'proposee'
  | 'confirmee'
  | 'terminee'
  | 'annulee'
  | 'refusee'

export interface MyIntervention {
  intervention_id: string
  conversation_id: string
  other_id: string
  other_name: string | null
  my_role: 'client' | 'professionnel'
  metier_id: string | null
  metier_nom: string | null
  description: string
  date_prevue: string | null
  statut: InterventionStatut
  proposee_par: string
  adresse_exacte: string | null
  pro_terminee_le: string | null
  created_at: string
  confirmee_le: string | null
  terminee_le: string | null
  annulee_le: string | null
  motif_annulation: string | null
  a_avis: boolean
}

// Ligne retournée par conversation_interventions().
export interface ConversationIntervention {
  intervention_id: string
  statut: InterventionStatut
  description: string
  date_prevue: string | null
  proposee_par: string
  adresse_exacte: string | null
  pro_terminee_le: string | null
  created_at: string
  terminee_le: string | null
}

// Contact révélé par get_intervention_contact() (journalisé en base).
export interface InterventionContact {
  other_id: string
  other_name: string | null
  other_phone: string | null
  adresse_exacte: string | null
}

// Ligne de la table public.reviews (avis visible ou masqué pour le staff).
export interface Review {
  id: string
  intervention_id: string
  client_id: string
  professional_id: string
  note_qualite: number
  note_ponctualite: number
  note_professionnalisme: number
  note_rapport_prix: number
  note_globale: number
  commentaire: string | null
  statut: 'visible' | 'masque'
  created_at: string
}

// Ligne de la table public.review_replies.
export interface ReviewReply {
  id: string
  review_id: string
  professional_id: string
  texte: string
  created_at: string
}

// Ligne de la table public.notifications.
export interface AppNotification {
  id: string
  user_id: string
  type:
    | 'nouveau_message'
    | 'intervention_proposee'
    | 'intervention_confirmee'
    | 'intervention_refusee'
    | 'intervention_annulee'
    | 'intervention_a_confirmer'
    | 'intervention_terminee'
    | 'nouvel_avis'
    | 'reponse_avis'
  conversation_id: string | null
  lue: boolean
  created_at: string
}
