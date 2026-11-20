import { useState, type ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE, pathForRole } from '../lib/constants'
import { useAuth } from '../hooks/useAuth'
import { useCategories } from '../hooks/useCategories'
import { useUnreadNotifications } from '../hooks/useNotifications'
import { Icon } from './icons'
// Année courante pour le pied de page (calculée une fois).
const YEAR = new Date().getFullYear()

// Item de pied de page : lien si une route existe, sinon simple texte
// (pages pas encore créées — pas de lien mort).
function FooterItem({ label, to }: { label: string; to?: string }) {
  if (!to) {
    return (
      <li>
        <span className="text-sm text-gray-500">{label}</span>
      </li>
    )
  }
  return (
    <li>
      <Link
        to={to}
        className="text-sm text-gray-600 transition hover:text-blue-700"
      >
        {label}
      </Link>
    </li>
  )
}

function FooterColumn({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}

// Mise en page des pages publiques : en-tête marketplace, contenu, pied de page.
export default function PublicLayout() {
  const { session, profile } = useAuth()
  const { categories } = useCategories()
  const { count: unreadCount } = useUnreadNotifications()
  const [menuOpen, setMenuOpen] = useState(false)
  const [servicesOpen, setServicesOpen] = useState(false)

  const closeMenu = () => {
    setMenuOpen(false)
    setServicesOpen(false)
  }

  const spacePath = profile ? pathForRole(profile.role) : '/connexion'

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          {/* Logo */}
          <Link
            to="/"
            onClick={closeMenu}
            className="flex items-center gap-2 text-lg font-bold text-gray-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-white">
              <Icon name="briefcase" className="h-4.5 w-4.5" />
            </span>
            {APP_NAME}
          </Link>

          {/* Navigation desktop */}
          <nav className="hidden items-center gap-6 md:flex">
            <div
              className="relative"
              onMouseEnter={() => setServicesOpen(true)}
              onMouseLeave={() => setServicesOpen(false)}
            >
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium text-gray-700 transition hover:text-blue-700"
                aria-expanded={servicesOpen}
              >
                Explorer les services
                <Icon
                  name="chevron-down"
                  className={`h-4 w-4 transition-transform ${servicesOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {servicesOpen && (
                <div className="absolute left-0 top-full w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                  {categories.length === 0 ? (
                    <p className="px-4 py-2 text-sm text-gray-500">
                      Aucune catégorie pour le moment.
                    </p>
                  ) : (
                    categories.map((c) => (
                      <span
                        key={c.id}
                        className="flex cursor-default items-center gap-2 px-4 py-2 text-sm text-gray-700"
                      >
                        <Icon
                          name={c.icon ?? 'grid'}
                          className="h-4 w-4 text-blue-600"
                        />
                        {c.name}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
          </nav>

          {/* Actions desktop */}
          <div className="hidden items-center gap-4 md:flex">
            {session ? (
              <>
                <Link
                  to="/messages"
                  className="relative flex items-center gap-1.5 text-sm font-medium text-gray-700 transition hover:text-blue-700"
                >
                  Messages
                  {unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[11px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </Link>
                <Link
                  to={spacePath}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  Mon espace
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/inscription?role=professionnel"
                  className="text-sm font-medium text-gray-700 transition hover:text-blue-700"
                >
                  Je suis professionnel
                </Link>
                <Link
                  to="/connexion"
                  className="text-sm font-medium text-gray-700 transition hover:text-blue-700"
                >
                  Connexion
                </Link>
                <Link
                  to="/inscription"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  S'inscrire
                </Link>
              </>
            )}
          </div>

          {/* Bouton menu mobile */}
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 transition hover:bg-gray-100 md:hidden"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name={menuOpen ? 'x' : 'menu'} className="h-6 w-6" />
          </button>
        </div>

        {/* Menu mobile */}
        {menuOpen && (
          <nav className="border-t border-gray-200 bg-white px-4 py-4 md:hidden">
            {categories.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Explorer les services
                </p>
                <ul className="space-y-1">
                  {categories.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 py-1.5 text-sm text-gray-700"
                    >
                      <Icon
                        name={c.icon ?? 'grid'}
                        className="h-4 w-4 text-blue-600"
                      />
                      {c.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-1 border-t border-gray-100 pt-3">
              {session ? (
                <>
                  <Link
                    to="/messages"
                    onClick={closeMenu}
                    className="flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Messages
                    {unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[11px] font-bold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to={spacePath}
                    onClick={closeMenu}
                    className="block rounded-lg bg-blue-700 px-4 py-2.5 text-center text-sm font-semibold text-white"
                  >
                    Mon espace
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/inscription?role=professionnel"
                    onClick={closeMenu}
                    className="block rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Je suis professionnel
                  </Link>
                  <Link
                    to="/connexion"
                    onClick={closeMenu}
                    className="block rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Connexion
                  </Link>
                  <Link
                    to="/inscription"
                    onClick={closeMenu}
                    className="mt-2 block rounded-lg bg-blue-700 px-4 py-2.5 text-center text-sm font-semibold text-white"
                  >
                    S'inscrire
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <p className="text-lg font-bold text-gray-900">{APP_NAME}</p>
              <p className="mt-2 max-w-xs text-sm text-gray-500">
                {APP_TAGLINE}
              </p>
            </div>
            <FooterColumn title="Clients">
              <FooterItem label="Comment ça marche" to="/#pourquoi" />
              <FooterItem label="S'inscrire" to="/inscription" />
              <FooterItem label="Services près de chez moi" to="/#villes" />
            </FooterColumn>
            <FooterColumn title="Professionnels">
              <FooterItem
                label="Inscription professionnelle"
                to="/inscription?role=professionnel"
              />
              <FooterItem label="Aide aux professionnels" />
            </FooterColumn>
            <FooterColumn title="Assistance">
              <FooterItem label="Aide" />
              <FooterItem label="Sécurité" />
              <FooterItem label="Conditions d'utilisation" to="/conditions" />
              <FooterItem
                label="Politique de confidentialité"
                to="/confidentialite"
              />
            </FooterColumn>
          </div>
          <div className="mt-8 border-t border-gray-100 pt-6 text-sm text-gray-500">
            © {YEAR} {APP_NAME}
          </div>
        </div>
      </footer>
    </div>
  )
}