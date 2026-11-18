import { Link, Outlet } from 'react-router-dom'
import { APP_NAME, pathForRole } from '../lib/constants'
import { useAuth } from '../hooks/useAuth'
// Année courante pour le pied de page (calculée une fois).
const YEAR = new Date().getFullYear()

// Mise en page des pages publiques : en-tête, contenu, pied de page.
export default function PublicLayout() {
  const { session, profile } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold text-teal-800">
            {APP_NAME}
          </Link>
          {session ? (
            <Link
              to={profile ? pathForRole(profile.role) : '/connexion'}
              className="text-sm text-teal-700 hover:underline"
            >
              Mon espace
            </Link>
          ) : (
            <Link to="/connexion" className="text-sm text-teal-700 hover:underline">
              Connexion
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-sm text-gray-500">
          <span>© {YEAR} {APP_NAME}</span>
          <Link to="/conditions" className="hover:underline">
            Conditions d'utilisation
          </Link>
          <Link to="/confidentialite" className="hover:underline">
            Politique de confidentialité
          </Link>
        </div>
      </footer>
    </div>
  )
}
