import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/icons'
import { Stars } from '../components/Reviews'
import { Card, EmptyState } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useDiscuss } from '../hooks/useDiscuss'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { PublicProfessional, Review, ReviewReply } from '../lib/types'

const NIVEAU_LABELS: Record<string, string> = {
  debutant: 'Débutant',
  confirme: 'Confirmé',
  expert: 'Expert',
}

const DISPONIBILITE_LABELS: Record<string, string> = {
  immediat: 'Disponible immédiatement',
  sur_rdv: 'Sur rendez-vous',
}

const MOTIFS = [
  { value: 'faux_profil', label: 'Faux profil' },
  { value: 'harcelement', label: 'Harcèlement' },
  { value: 'injures', label: 'Injures' },
  { value: 'fraude', label: 'Fraude' },
  { value: 'contenu_interdit', label: 'Contenu interdit' },
  { value: 'autre', label: 'Autre' },
]

// Page profil public d'un professionnel (vue professionals_public :
// aucune coordonnée n'est exposée).
export default function Professionnel() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const { discuss, busy: discussBusy, error: discussError } = useDiscuss(
    id ?? '',
  )
  const [blocked, setBlocked] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [motif, setMotif] = useState('faux_profil')
  const [description, setDescription] = useState('')
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [pro, setPro] = useState<PublicProfessional | null>(null)
  const [avis, setAvis] = useState<Review[]>([])
  const [replies, setReplies] = useState<Record<string, ReviewReply>>({})
  const [avisReported, setAvisReported] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(
    () => supabaseConfigured && !!id,
  )
  const [notFound, setNotFound] = useState(
    () => !supabaseConfigured || !id,
  )

  useEffect(() => {
    if (!supabaseConfigured || !id) return
    let active = true
    supabase
      .from('professionals_public')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return
        if (error) console.error('Profil introuvable :', error.message)
        setPro((data as PublicProfessional | null) ?? null)
        setNotFound(!data)
        setLoading(false)
        // Avis visibles du professionnel (+ réponses).
        if (data) {
          const { data: revs } = await supabase
            .from('reviews')
            .select(
              'id, intervention_id, client_id, professional_id, note_qualite, note_ponctualite, note_professionnalisme, note_rapport_prix, note_globale, commentaire, statut, created_at',
            )
            .eq('professional_id', data.id)
            .eq('statut', 'visible')
            .order('created_at', { ascending: false })
            .limit(50)
          const list = (revs ?? []) as Review[]
          setAvis(list)
          if (list.length) {
            const { data: reps } = await supabase
              .from('review_replies')
              .select('*')
              .in(
                'review_id',
                list.map((r) => r.id),
              )
            const map: Record<string, ReviewReply> = {}
            for (const r of (reps ?? []) as ReviewReply[]) map[r.review_id] = r
            setReplies(map)
          }
        }
        // Vérifie si cet utilisateur est déjà bloqué par moi.
        if (data && session) {
          const { data: b } = await supabase
            .from('blocks')
            .select('blocked_id')
            .eq('blocker_id', session.user.id)
            .eq('blocked_id', data.id)
            .maybeSingle()
          if (active && b) setBlocked(true)
        }
      })
    return () => {
      active = false
    }
  }, [id, session])

  if (loading) {
    return (
      <p className="py-16 text-center text-gray-500">Chargement du profil…</p>
    )
  }

  if (notFound || !pro) {
    return (
      <div className="mx-auto max-w-md">
        <EmptyState title="Professionnel introuvable.">
          Ce profil n'existe pas ou n'est plus visible.
        </EmptyState>
        <p className="mt-4 text-center">
          <Link
            to="/recherche"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            ← Retour à la recherche
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4">
        <Link
          to="/recherche"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          ← Retour à la recherche
        </Link>
      </p>

      <Card className="p-6">
        <div className="flex items-start gap-5">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-blue-50">
            {pro.photo_url ? (
              <img
                src={pro.photo_url}
                alt=""
                width={96}
                height={96}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-blue-300">
                <Icon name="briefcase" className="h-10 w-10" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">
              {pro.nom_affiche ?? 'Professionnel'}
            </h1>
            {pro.metiers && (
              <p className="mt-1 text-gray-700">{pro.metiers}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              {[pro.quartier, pro.ville].filter(Boolean).join(', ') ||
                'Localisation non renseignée'}
              {pro.rayon_km ? ` · rayon d'intervention : ${pro.rayon_km} km` : ''}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {pro.nombre_avis > 0 && pro.note_moyenne !== null ? (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                  <Stars value={Number(pro.note_moyenne)} size="h-3.5 w-3.5" />
                  {Number(pro.note_moyenne).toFixed(1)} ({pro.nombre_avis}{' '}
                  avis)
                </span>
              ) : (
                <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
                  Pas encore d'avis
                </span>
              )}
              {pro.numero_verifie && (
                <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800">
                  Numéro vérifié
                </span>
              )}
              {pro.identite_verifiee && (
                <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800">
                  Identité vérifiée
                </span>
              )}
              {pro.disponibilite && (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    pro.disponibilite === 'immediat'
                      ? 'bg-blue-50 text-blue-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {DISPONIBILITE_LABELS[pro.disponibilite] ??
                    pro.disponibilite}
                </span>
              )}
              {pro.niveau && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {NIVEAU_LABELS[pro.niveau] ?? pro.niveau}
                </span>
              )}
            </div>
          </div>
        </div>

        <dl className="mt-6 grid gap-3 border-t border-gray-100 pt-5 text-sm sm:grid-cols-2">
          {pro.tarif_indicatif && (
            <div>
              <dt className="text-gray-500">Tarif indicatif</dt>
              <dd className="font-medium text-gray-900">
                {pro.tarif_indicatif}
              </dd>
            </div>
          )}
          {pro.rayon_km && (
            <div>
              <dt className="text-gray-500">Rayon d'intervention</dt>
              <dd className="font-medium text-gray-900">
                environ {pro.rayon_km} km
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6 border-t border-gray-100 pt-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={discuss}
              disabled={discussBusy}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {discussBusy ? '…' : 'Discuter'}
            </button>
            {session && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    if (blocked) {
                      await supabase
                        .from('blocks')
                        .delete()
                        .eq('blocker_id', session.user.id)
                        .eq('blocked_id', pro.id)
                      setBlocked(false)
                    } else if (
                      window.confirm(
                        `Bloquer ${pro.nom_affiche ?? 'cet utilisateur'} ?`,
                      )
                    ) {
                      await supabase
                        .from('blocks')
                        .insert({
                          blocker_id: session.user.id,
                          blocked_id: pro.id,
                        })
                      setBlocked(true)
                    }
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  {blocked ? 'Débloquer' : 'Bloquer'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowReport((v) => !v)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Signaler ce profil
                </button>
              </>
            )}
          </div>
          {discussError && (
            <p className="mt-2 text-xs text-red-600">{discussError}</p>
          )}
          {actionMsg && (
            <p className="mt-2 text-xs text-green-700">{actionMsg}</p>
          )}

          {showReport && session && (
            <div className="mt-4 rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-900">
                Signaler ce profil
              </h2>
              <label className="mt-2 block text-sm">
                <span className="mb-1 block font-medium text-gray-700">
                  Motif
                </span>
                <select
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {MOTIFS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-2 block text-sm">
                <span className="mb-1 block font-medium text-gray-700">
                  Description (facultatif)
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={async () => {
                  const { error } = await supabase.from('reports').insert({
                    reporter_id: session.user.id,
                    cible_type: 'profil',
                    cible_id: pro.id,
                    motif,
                    description: description.trim() || null,
                  })
                  if (error) {
                    setActionMsg(error.message)
                    return
                  }
                  setShowReport(false)
                  setActionMsg('Signalement envoyé. Merci.')
                }}
                className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Envoyer le signalement
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Avis clients (visibles uniquement) */}
      <section className="mt-6">
        <h2 className="text-lg font-bold text-gray-900">Avis clients</h2>
        {avis.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Pas encore d'avis.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {avis.map((r) => (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <Stars value={Number(r.note_globale)} size="h-4 w-4" />
                    <span className="text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Qualité {r.note_qualite}/5 · Ponctualité{' '}
                    {r.note_ponctualite}/5 · Professionnalisme{' '}
                    {r.note_professionnalisme}/5 · Rapport qualité-prix{' '}
                    {r.note_rapport_prix}/5
                  </p>
                  {r.commentaire && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                      {r.commentaire}
                    </p>
                  )}
                  {replies[r.id] && (
                    <div className="mt-3 rounded-lg bg-blue-50 p-3">
                      <p className="text-xs font-semibold text-blue-800">
                        Réponse du professionnel
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                        {replies[r.id].texte}
                      </p>
                    </div>
                  )}
                  {session && !avisReported.has(r.id) && (
                    <button
                      type="button"
                      onClick={async () => {
                        const { error } = await supabase
                          .from('reports')
                          .insert({
                            reporter_id: session.user.id,
                            cible_type: 'avis',
                            cible_id: r.id,
                            motif: 'contenu_interdit',
                          })
                        if (error) {
                          setActionMsg(error.message)
                        } else {
                          setAvisReported((s) => new Set(s).add(r.id))
                          setActionMsg('Avis signalé. Merci.')
                        }
                      }}
                      className="mt-2 text-xs font-medium text-gray-400 hover:text-red-600"
                    >
                      Signaler cet avis
                    </button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
