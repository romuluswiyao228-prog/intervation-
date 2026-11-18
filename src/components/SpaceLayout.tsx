import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { APP_NAME } from '../lib/constants'
import { useAuth } from '../hooks/useAuth'
import { formatTogoPhone } from '../lib/phone'
// Année courante pour le pied de page (calculée une fois).
const YEAR = new Date().getFullYear()

// Coquille commune des espaces privés (client, professionnel, admin) :
// en-tête avec nom, menu minimal et bouton de déconnexion.
export default function SpaceLayout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <Link to="/" className="block truncate text-base font-bold text-teal-800">
              {APP_NAME}
            </Link>
            <p className="truncate text-sm text-gray-500">{title}</p>
          </div>
          <button
            onClick={signOut}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Menu minimal : les vraies entrées arriveront dans les phases suivantes. */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 py-2 text-sm">
          <span className="rounded-md bg-teal-50 px-3 py-1.5 font-medium text-teal-800">
            Tableau de bord
          </span>
          <span className="rounded-md px-3 py-1.5 text-gray-400">
            Profil (bientôt)
          </span>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {profile && (
          <p className="mb-4 text-sm text-gray-500">
            Bonjour {profile.display_name ?? ''}
            {profile.phone ? ` — ${formatTogoPhone(profile.phone)}` : ''}
          </p>
        )}
        {children}
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 text-sm text-gray-500">
          <span>© {YEAR} {APP_NAME}</span>
          <Link to="/" className="hover:underline">
            Accueil
          </Link>
        </div>
      </footer>
    </div>
  )
}
