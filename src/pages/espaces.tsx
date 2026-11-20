import { Link } from 'react-router-dom'
import SpaceLayout from '../components/SpaceLayout'
import { EmptyState } from '../components/ui'

// Espace client : suivi des interventions (détail sur /interventions).
export function EspaceClient() {
  return (
    <SpaceLayout title="Espace client">
      <EmptyState title="Vos demandes de service">
        <p className="mb-3">
          Retrouvez vos propositions, interventions confirmées et avis à
          laisser.
        </p>
        <Link
          to="/interventions"
          className="font-medium text-blue-700 hover:underline"
        >
          Mes interventions →
        </Link>
      </EmptyState>
    </SpaceLayout>
  )
}
