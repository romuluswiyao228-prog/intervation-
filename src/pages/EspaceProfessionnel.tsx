import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SpaceLayout from '../components/SpaceLayout'
import { Stars } from '../components/Reviews'
import { Card, EmptyState } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { MyIntervention, Review, ReviewReply } from '../lib/types'

// Espace professionnel : interventions reçues, avis et réponses.
export default function EspaceProfessionnel() {
  const { session } = useAuth()
  const me = session?.user.id ?? ''

  const [interventions, setInterventions] = useState<MyIntervention[]>([])
  const [avis, setAvis] = useState<Review[]>([])
  const [replies, setReplies] = useState<Record<string, ReviewReply>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabaseConfigured || !me) return
    const [{ data: ints }, { data: revs }] = await Promise.all([
      supabase.rpc('my_interventions'),
      supabase
        .from('reviews')
        .select(
          'id, intervention_id, client_id, professional_id, note_qualite, note_ponctualite, note_professionnalisme, note_rapport_prix, note_globale, commentaire, statut, created_at',
        )
        .eq('professional_id', me)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    const list = (ints ?? []) as MyIntervention[]
    setInterventions(list.filter((i) => i.my_role === 'professionnel'))
    const reviews = (revs ?? []) as Review[]
    setAvis(reviews)
    if (reviews.length) {
      const { data: reps } = await supabase
        .from('review_replies')
        .select('*')
        .eq('professional_id', me)
      const map: Record<string, ReviewReply> = {}
      for (const r of (reps ?? []) as ReviewReply[]) map[r.review_id] = r
      setReplies(map)
    }
    setLoading(false)
  }, [me])

  useEffect(() => {
    void load()
  }, [load])

  // Taux de réponse réel : propositions d'intervention reçues
  // ayant reçu une réponse (tout statut sauf 'proposee').
  const recues = interventions.filter((i) => i.proposee_par !== me)
  const repondues = recues.filter((i) => i.statut !== 'proposee')
  const tauxReponse =
    recues.length > 0 ? Math.round((repondues.length / recues.length) * 100) : null

  return (
    <SpaceLayout title="Espace professionnel">
      {loading ? (
        <p className="text-gray-500">Chargement…</p>
      ) : (
        <div className="space-y-8">
          {/* Résumé */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <Card className="p-3">
              <p className="text-2xl font-bold text-gray-900">
                {interventions.length}
              </p>
              <p className="text-xs text-gray-500">Interventions</p>
            </Card>
            <Card className="p-3">
              <p className="text-2xl font-bold text-gray-900">{avis.length}</p>
              <p className="text-xs text-gray-500">Avis reçus</p>
            </Card>
            <Card className="p-3">
              <p className="text-2xl font-bold text-gray-900">
                {tauxReponse === null ? '—' : `${tauxReponse} %`}
              </p>
              <p className="text-xs text-gray-500">Taux de réponse</p>
            </Card>
          </div>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Interventions reçues
              </h2>
              <Link
                to="/interventions"
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                Tout voir →
              </Link>
            </div>
            {interventions.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="Aucune intervention pour le moment" />
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {interventions.slice(0, 5).map((i) => (
                  <li key={i.intervention_id}>
                    <Link to="/interventions">
                      <Card className="p-3 text-sm">
                        <span className="font-medium text-gray-900">
                          {i.metier_nom ?? 'Intervention'}
                        </span>
                        <span className="text-gray-500">
                          {' '}
                          — {i.statut}
                        </span>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900">Avis reçus</h2>
            {avis.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Pas encore d'avis.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {avis.map((r) => (
                  <AvisRecu
                    key={r.id}
                    review={r}
                    reply={replies[r.id]}
                    meId={me}
                    onReplied={load}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </SpaceLayout>
  )
}

// Un avis reçu + formulaire de réponse (une seule fois).
function AvisRecu({
  review,
  reply,
  meId,
  onReplied,
}: {
  review: Review
  reply?: ReviewReply
  meId: string
  onReplied: () => void
}) {
  const [texte, setTexte] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!texte.trim()) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase
      .from('review_replies')
      .insert({
        review_id: review.id,
        professional_id: meId,
        texte: texte.trim(),
      })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onReplied()
  }

  return (
    <li>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <Stars value={Number(review.note_globale)} size="h-4 w-4" />
          <span className="text-xs text-gray-400">
            {new Date(review.created_at).toLocaleDateString('fr-FR')}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Qualité {review.note_qualite}/5 · Ponctualité{' '}
          {review.note_ponctualite}/5 · Professionnalisme{' '}
          {review.note_professionnalisme}/5 · Rapport qualité-prix{' '}
          {review.note_rapport_prix}/5
        </p>
        {review.commentaire && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
            {review.commentaire}
          </p>
        )}
        {reply ? (
          <div className="mt-3 rounded-lg bg-blue-50 p-3">
            <p className="text-xs font-semibold text-blue-800">
              Votre réponse
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
              {reply.texte}
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value.slice(0, 1000))}
              rows={2}
              placeholder="Répondre à cet avis (une seule fois)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            <button
              type="button"
              disabled={busy || !texte.trim()}
              onClick={send}
              className="mt-2 rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              Publier la réponse
            </button>
          </div>
        )}
      </Card>
    </li>
  )
}
