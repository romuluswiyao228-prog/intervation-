import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { pathForRole } from '../lib/constants'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../lib/types'
import { Alert, LoadingScreen } from './ui'

// Protège une route selon la session, le profil et le rôle.
// - Non connecté → /connexion
// - Compte suspendu → écran dédié
// - Mauvais rôle → redirection vers son propre espace
export default function ProtectedRoute({
  roles,
  children,
}: {
  roles?: UserRole[]
  children: ReactNode
}) {
  const { session, profile, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (!session) return <Navigate to="/connexion" replace />

  if (!profile) {
    return (
      <LoadingScreen label="Chargement du profil…" />
    )
  }

  if (profile.status === 'suspendu') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md">
          <Alert kind="error">
            Votre compte est suspendu. Vous ne pouvez pas accéder aux espaces.
            Contactez le support pour plus d'informations.
          </Alert>
        </div>
      </div>
    )
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={pathForRole(profile.role)} replace />
  }

  return <>{children}</>
}

// Garde utilitaire : si déjà connecté, renvoie vers son espace.
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (session && profile) {
    return <Navigate to={pathForRole(profile.role)} replace />
  }
  return <>{children}</>
}

// Lien discret vers la page d'accueil utilisé dans les écrans d'erreur.
export function BackHome() {
  return (
    <p className="mt-4 text-center text-sm">
      <Link to="/" className="text-teal-700 hover:underline">
        Retour à l'accueil
      </Link>
    </p>
  )
}
