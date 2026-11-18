import { Navigate, Route, Routes } from 'react-router-dom'
import PublicLayout from '../components/PublicLayout'
import ProtectedRoute from '../components/ProtectedRoute'
import Home from '../pages/Home'
import LegalPage from '../pages/LegalPage'
import Connexion from '../pages/Connexion'
import Inscription from '../pages/Inscription'
import MotDePasseOublie from '../pages/MotDePasseOublie'
import {
  EspaceAdministration,
  EspaceClient,
  EspaceProfessionnel,
} from '../pages/espaces'

// Définition de toutes les routes de l'application.
export default function AppRoutes() {
  return (
    <Routes>
      {/* Pages publiques */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route
          path="/conditions"
          element={<LegalPage title="Conditions d'utilisation" />}
        />
        <Route
          path="/confidentialite"
          element={<LegalPage title="Politique de confidentialité" />}
        />
      </Route>

      {/* Authentification */}
      <Route path="/connexion" element={<Connexion />} />
      <Route path="/inscription" element={<Inscription />} />
      <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />

      {/* Espaces privés protégés par rôle */}
      <Route
        path="/espace/client"
        element={
          <ProtectedRoute roles={['client']}>
            <EspaceClient />
          </ProtectedRoute>
        }
      />
      <Route
        path="/espace/professionnel"
        element={
          <ProtectedRoute roles={['professionnel']}>
            <EspaceProfessionnel />
          </ProtectedRoute>
        }
      />
      <Route
        path="/espace/administration"
        element={
          <ProtectedRoute roles={['administrateur', 'moderateur']}>
            <EspaceAdministration />
          </ProtectedRoute>
        }
      />

      {/* Toute autre route → accueil */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
