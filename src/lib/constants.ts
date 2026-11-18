// Nom de l'application : à changer ici si besoin.
export const APP_NAME = 'Togo Intervention'

// Slogan affiché sur la page d'accueil.
export const APP_TAGLINE =
  'Trouvez facilement un professionnel de confiance pour vos travaux et dépannages au Togo.'

// Chemins des espaces privés par rôle.
export const SPACE_PATHS = {
  client: '/espace/client',
  professionnel: '/espace/professionnel',
  administration: '/espace/administration',
} as const

export function pathForRole(
  role: 'client' | 'professionnel' | 'administrateur' | 'moderateur',
): string {
  if (role === 'professionnel') return SPACE_PATHS.professionnel
  if (role === 'administrateur' || role === 'moderateur')
    return SPACE_PATHS.administration
  return SPACE_PATHS.client
}

export function spaceTitleForRole(
  role: 'client' | 'professionnel' | 'administrateur' | 'moderateur',
): string {
  if (role === 'professionnel') return 'Espace professionnel'
  if (role === 'administrateur') return 'Espace administration'
  if (role === 'moderateur') return 'Espace modération'
  return 'Espace client'
}
