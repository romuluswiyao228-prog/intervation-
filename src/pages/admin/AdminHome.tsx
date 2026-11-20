import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { supabaseConfigured } from '../../lib/env'

interface Stats {
  clients: number
  professionals: number
  pros_visibles: number
  documents_en_attente: number
  reports_nouveaux: number
  conversations_ouvertes: number
  inscriptions_7j: number
  inscriptions_30j: number
  interventions_confirmees: number
  avis_deposes: number
}

const COUNTERS: { key: keyof Stats; label: string; to?: string }[] = [
  { key: 'clients', label: 'Comptes clients' },
  { key: 'professionals', label: 'Professionnels' },
  { key: 'pros_visibles', label: 'Pros visibles' },
  { key: 'documents_en_attente', label: 'Pièces en attente', to: '/espace/administration/professionnels' },
  { key: 'reports_nouveaux', label: 'Signalements nouveaux', to: '/espace/administration/signalements' },
  { key: 'conversations_ouvertes', label: 'Conversations ouvertes' },
  { key: 'inscriptions_7j', label: 'Inscriptions (7 j)' },
  { key: 'inscriptions_30j', label: 'Inscriptions (30 j)' },
  { key: 'interventions_confirmees', label: 'Interventions confirmées' },
  { key: 'avis_deposes', label: 'Avis déposés' },
]

// Tableau de bord admin : compteurs réels via admin_stats().
export default function AdminHome() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseConfigured) return
    let active = true
    supabase.rpc('admin_stats').then(({ data, error }) => {
      if (!active) return
      if (error) console.error('Stats indisponibles :', error.message)
      else setStats(data as unknown as Stats)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <p className="text-gray-500">Chargement des statistiques…</p>
  }
  if (!stats) {
    return <EmptyState title="Statistiques indisponibles" />
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-gray-900">
        Tableau de bord
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COUNTERS.map((c) => {
          const inner = (
            <Card className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">
                {stats[c.key]}
              </p>
              <p className="mt-1 text-xs text-gray-500">{c.label}</p>
            </Card>
          )
          return c.to ? (
            <Link key={c.key} to={c.to} className="transition hover:opacity-80">
              {inner}
            </Link>
          ) : (
            <div key={c.key}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}
