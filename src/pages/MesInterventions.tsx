import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import InterventionCard from '../components/InterventionCard'
import { EmptyState } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { MyIntervention } from '../lib/types'

// Page « Mes interventions » (client et professionnel) : liste par
// statut avec historique, actions selon le rôle.
export default function MesInterventions() {
  const { session, profile } = useAuth()
  const me = session?.user.id ?? ''

  const [items, setItems] = useState<MyIntervention[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    if (!supabaseConfigured) return
    const { data, error } = await supabase.rpc('my_interventions')
    if (error) console.error('Interventions :', error.message)
    setItems((data ?? []) as MyIntervention[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = filter ? items.filter((i) => i.statut === filter) : items
  const isPro = profile?.role === 'professionnel'

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Mes interventions</h1>
      <p className="mt-1 text-sm text-gray-500">
        {isPro
          ? 'Propositions reçues, interventions en cours et historique.'
          : 'Vos demandes de service et leur suivi.'}
      </p>

      {/* Filtres par statut */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {[
          { v: '', label: 'Toutes' },
          { v: 'proposee', label: 'Proposées' },
          { v: 'confirmee', label: 'Confirmées' },
          { v: 'terminee', label: 'Terminées' },
          { v: 'annulee', label: 'Annulées' },
          { v: 'refusee', label: 'Refusées' },
        ].map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => setFilter(f.v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f.v
                ? 'bg-blue-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="py-10 text-center text-gray-500">Chargement…</p>
      )}
      {!loading && visible.length === 0 && (
        <div className="mt-6">
          <EmptyState title="Aucune intervention">
            {isPro
              ? 'Les propositions de vos clients apparaîtront ici.'
              : 'Parlez à un professionnel depuis sa fiche pour proposer une intervention.'}
            {!isPro && (
              <p className="mt-2">
                <Link
                  to="/recherche"
                  className="font-medium text-blue-700 hover:underline"
                >
                  Rechercher un professionnel →
                </Link>
              </p>
            )}
          </EmptyState>
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {visible.map((i) => (
          <li key={i.intervention_id}>
            <InterventionCard
              intervention={i}
              meId={me}
              onChanged={load}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
