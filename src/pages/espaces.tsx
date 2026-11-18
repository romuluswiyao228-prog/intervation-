import SpaceLayout from '../components/SpaceLayout'
import { EmptyState } from '../components/ui'

// Coquilles vides des trois espaces. Le contenu réel arrive dans les
// phases suivantes ; on affiche un état vide clair en attendant.

export function EspaceClient() {
  return (
    <SpaceLayout title="Espace client">
      <EmptyState title="Aucune demande pour le moment">
        Vous pourrez ici suivre vos demandes de professionnels.
      </EmptyState>
    </SpaceLayout>
  )
}

export function EspaceProfessionnel() {
  return (
    <SpaceLayout title="Espace professionnel">
      <EmptyState title="Aucune demande pour le moment">
        Vous pourrez ici gérer votre profil et vos interventions.
      </EmptyState>
    </SpaceLayout>
  )
}

export function EspaceAdministration() {
  return (
    <SpaceLayout title="Espace administration">
      <EmptyState title="Aucun élément à afficher">
        Les outils d'administration arriveront dans une prochaine phase.
      </EmptyState>
    </SpaceLayout>
  )
}
