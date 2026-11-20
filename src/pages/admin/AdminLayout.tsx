import { NavLink, Outlet } from 'react-router-dom'
import SpaceLayout from '../../components/SpaceLayout'
import { useAuth } from '../../hooks/useAuth'

interface Tab {
  to: string
  label: string
  end?: boolean
}
const TABS_ADMIN: Tab[] = [
  { to: '/espace/administration', label: 'Tableau de bord', end: true },
  { to: '/espace/administration/utilisateurs', label: 'Utilisateurs' },
  { to: '/espace/administration/professionnels', label: 'Professionnels' },
  { to: '/espace/administration/signalements', label: 'Signalements' },
  { to: '/espace/administration/contenus', label: 'Contenus' },
]
const TABS_MODERATOR: Tab[] = [
  { to: '/espace/administration/signalements', label: 'Signalements' },
]

// Coquille de l'espace admin : onglets selon le rôle
// (modérateur : file des signalements uniquement).
export default function AdminLayout() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'administrateur'
  const tabs = isAdmin ? TABS_ADMIN : TABS_MODERATOR

  return (
    <SpaceLayout title="Espace administration">
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </SpaceLayout>
  )
}
