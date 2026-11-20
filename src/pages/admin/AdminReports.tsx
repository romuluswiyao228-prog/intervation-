import { useCallback, useEffect, useState } from 'react'
import { Card, EmptyState } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { supabaseConfigured } from '../../lib/env'
import type { Message } from '../../lib/types'

interface Report {
  id: string
  reporter_id: string
  cible_type: 'profil' | 'message' | 'conversation'
  cible_id: string
  motif: string
  description: string | null
  statut: 'nouveau' | 'en_cours' | 'traite'
  sanction_id: string | null
  created_at: string
  reporter_name?: string | null
}

const MOTIF_LABELS: Record<string, string> = {
  faux_profil: 'Faux profil',
  harcelement: 'Harcèlement',
  injures: 'Injures',
  fraude: 'Fraude',
  contenu_interdit: 'Contenu interdit',
  autre: 'Autre',
}
const STATUT_LABELS: Record<string, string> = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  traite: 'Traité',
}
const CIBLE_LABELS: Record<string, string> = {
  profil: 'Profil',
  message: 'Message',
  conversation: 'Conversation',
}

const inputClass =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none'

// File des signalements : filtres, fiche, actions, conversation.
export default function AdminReports() {
  const { profile: me } = useAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [statutFilter, setStatutFilter] = useState('nouveau')
  const [cibleFilter, setCibleFilter] = useState('')
  const [selected, setSelected] = useState<Report | null>(null)
  const [motif, setMotif] = useState('')
  const [fin, setFin] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [convMessages, setConvMessages] = useState<Message[] | null>(null)

  const load = useCallback(async () => {
    if (!supabaseConfigured) return
    let q = supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (statutFilter) q = q.eq('statut', statutFilter)
    if (cibleFilter) q = q.eq('cible_type', cibleFilter)
    const { data, error } = await q
    if (error) console.error(error.message)
    // Noms des auteurs (staff peut lire profiles).
    const rows = (data ?? []) as Report[]
    const ids = [...new Set(rows.map((r) => r.reporter_id))]
    const { data: profs } = ids.length
      ? await supabase
          .from('profiles')
          .select('id,display_name')
          .in('id', ids)
      : { data: [] }
    const names = new Map(
      ((profs ?? []) as { id: string; display_name: string | null }[]).map(
        (p) => [p.id, p.display_name],
      ),
    )
    setReports(rows.map((r) => ({ ...r, reporter_name: names.get(r.reporter_id) })))
    setLoading(false)
  }, [statutFilter, cibleFilter])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  async function act(action: string) {
    if (!selected || !motif.trim()) {
      setMsg('Le motif est obligatoire.')
      return
    }
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('admin_report_action', {
      p_report_id: selected.id,
      p_action: action,
      p_motif: motif.trim(),
      p_fin: action === 'suspension_temporaire' && fin
        ? new Date(`${fin}T23:59:59`).toISOString()
        : null,
    })
    setBusy(false)
    if (error) {
      setMsg(error.message)
      return
    }
    setMotif('')
    setSelected(null)
    setConvMessages(null)
    load()
  }

  async function viewConversation() {
    if (!selected) return
    // Résout l'id de conversation selon le type de cible.
    let convId: string | null = null
    if (selected.cible_type === 'conversation') convId = selected.cible_id
    else if (selected.cible_type === 'message') {
      const { data } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('id', selected.cible_id)
        .single()
      convId = data?.conversation_id ?? null
    } else {
      setMsg('Ce signalement ne cible pas une conversation.')
      return
    }
    if (!convId) return
    setBusy(true)
    const { data, error } = await supabase.rpc(
      'admin_view_reported_conversation',
      { p_conversation_id: convId },
    )
    setBusy(false)
    if (error) {
      setMsg(error.message)
      return
    }
    setConvMessages((data ?? []) as Message[])
  }

  const isModerator = me?.role === 'moderateur'

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-gray-900">Signalements</h2>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={statutFilter}
          onChange={(e) => setStatutFilter(e.target.value)}
          className={inputClass}
        >
          <option value="nouveau">Nouveaux</option>
          <option value="en_cours">En cours</option>
          <option value="traite">Traités</option>
          <option value="">Tous</option>
        </select>
        <select
          value={cibleFilter}
          onChange={(e) => setCibleFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">Toutes cibles</option>
          <option value="profil">Profil</option>
          <option value="message">Message</option>
          <option value="conversation">Conversation</option>
        </select>
      </div>

      {loading && <p className="text-gray-500">Chargement…</p>}
      {!loading && reports.length === 0 && (
        <EmptyState title="Aucun signalement" />
      )}

      <ul className="space-y-2">
        {reports.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => {
                setSelected(r)
                setMotif('')
                setConvMessages(null)
                setMsg(null)
              }}
              className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition ${
                selected?.id === r.id
                  ? 'border-blue-500'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  {MOTIF_LABELS[r.motif] ?? r.motif}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    r.statut === 'nouveau'
                      ? 'bg-red-50 text-red-700'
                      : r.statut === 'en_cours'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {STATUT_LABELS[r.statut]}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {CIBLE_LABELS[r.cible_type]} · par{' '}
                {r.reporter_name ?? 'inconnu'} ·{' '}
                {new Date(r.created_at).toLocaleDateString('fr-FR')}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {/* Fiche signalement */}
      {selected && (
        <Card className="mt-6 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-gray-900">
                {MOTIF_LABELS[selected.motif] ?? selected.motif}
              </h3>
              <p className="text-sm text-gray-500">
                {CIBLE_LABELS[selected.cible_type]} ·{' '}
                {STATUT_LABELS[selected.statut]} · par{' '}
                {selected.reporter_name ?? 'inconnu'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Fermer
            </button>
          </div>
          {selected.description && (
            <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
              {selected.description}
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={viewConversation}
            className="mt-3 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Voir la conversation (journalisé)
          </button>

          {convMessages && (
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3">
              {convMessages.length === 0 && (
                <p className="text-sm text-gray-500">Aucun message.</p>
              )}
              {convMessages.map((m) => (
                <div key={m.id} className="text-sm">
                  <span className="text-xs text-gray-400">
                    {new Date(m.created_at).toLocaleString('fr-FR')}
                  </span>
                  <p className="whitespace-pre-wrap text-gray-800">
                    {m.body || '[image]'}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Motif de l'action (obligatoire)"
              className={inputClass}
            />
            {!isModerator && (
              <input
                type="date"
                value={fin}
                onChange={(e) => setFin(e.target.value)}
                className={inputClass}
                title="Date de fin (suspension temporaire)"
              />
            )}
          </div>
          {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => act('en_cours')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Prendre en charge
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act('sans_suite')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Classer sans suite
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act('avertir')}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Avertir
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act('visibilite_reduite')}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Visibilité réduite
            </button>
            {!isModerator && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act('suspension_temporaire')}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Suspendre (temporaire)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act('suspension_definitive')}
                  className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                >
                  Suspendre (définitive)
                </button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
