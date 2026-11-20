import { Navigate, Route, Routes } from 'react-router-dom'
import PublicLayout from '../components/PublicLayout'
import ProtectedRoute from '../components/ProtectedRoute'
import Home from '../pages/Home'
import LegalPage from '../pages/LegalPage'
import Connexion from '../pages/Connexion'
import Inscription from '../pages/Inscription'
import MotDePasseOublie from '../pages/MotDePasseOublie'
import Recherche from '../pages/Recherche'
import Professionnel from '../pages/Professionnel'
import Messages from '../pages/Messages'
import Conversation from '../pages/Conversation'
import Notifications from '../pages/Notifications'
import Bloques from '../pages/Bloques'
import MesInterventions from '../pages/MesInterventions'
import AdminLayout from '../pages/admin/AdminLayout'
import AdminHome from '../pages/admin/AdminHome'
import AdminUsers from '../pages/admin/AdminUsers'
import AdminProfessionals from '../pages/admin/AdminProfessionals'
import AdminReports from '../pages/admin/AdminReports'
import AdminContenus from '../pages/admin/AdminContenus'
import EspaceProfessionnel from '../pages/EspaceProfessionnel'
import { EspaceClient } from '../pages/espaces'

// Définition de toutes les routes de l'application.
export default function AppRoutes() {
  return (
    <Routes>
      {/* Pages publiques */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/recherche" element={<Recherche />} />
        <Route path="/professionnel/:id" element={<Professionnel />} />
        {/* Messagerie : réservée aux utilisateurs connectés (tout rôle). */}
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <Messages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/conversation/:id"
          element={
            <ProtectedRoute>
              <Conversation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/interventions"
          element={
            <ProtectedRoute roles={['client', 'professionnel']}>
              <MesInterventions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bloques"
          element={
            <ProtectedRoute>
              <Bloques />
            </ProtectedRoute>
          }
        />
        <Route
          path="/conditions"
          element={<LegalPage title="Conditions d'utilisation" slug="conditions" />}
        />
        <Route
          path="/confidentialite"
          element={<LegalPage title="Politique de confidentialité" slug="confidentialite" />}
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
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="utilisateurs" element={<AdminUsers />} />
        <Route path="professionnels" element={<AdminProfessionals />} />
        <Route path="signalements" element={<AdminReports />} />
        <Route path="contenus" element={<AdminContenus />} />
      </Route>

      {/* Toute autre route → accueil */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
