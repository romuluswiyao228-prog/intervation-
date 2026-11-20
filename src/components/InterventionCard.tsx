import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Card } from './ui'
import { Stars } from './Reviews'
import { supabase } from '../lib/supabase'
import type {
  ConversationIntervention,
  InterventionContact,
  InterventionStatut,
  MyIntervention,
} from '../lib/types'

const STATUT_LABELS: Record<InterventionStatut, string> = {
  proposee: 'Proposée',
  confirmee: 'Confirmée',
  terminee: 'Terminée',
  annulee: 'Annulée',
  refusee: 'Refusée',
}

const STATUT_STYLES: Record<InterventionStatut, string> = {
  proposee: 'bg-amber-50 text-amber-800',
  confirmee: 'bg-blue-50 text-blue-800',
  terminee: 'bg-green-50 text-green-800',
  annulee: 'bg-gray-100 text-gray-600',
  refusee: 'bg-gray-100 text-gray-600',
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none'

// Carte d'une intervention : statut, actions selon le rôle et
// l'étape du cycle de vie. Toutes les actions passent par les
// fonctions SQL (jamais d'écriture directe).
export default function InterventionCard({
  intervention: i,
  meId,
  myRole,
  professionalId,
  onChanged,
}: {
  // MyIntervention (page Mes interventions) ou
  // ConversationIntervention (page discussion).
  intervention: MyIntervention | (ConversationIntervention & {
    my_role?: 'client' | 'professionnel'
    other_name?: string | null
    metier_nom?: string | null
    motif_annulation?: string | null
    a_avis?: boolean
  })
  meId: string
  // Rôle du visiteur dans cette intervention (client/pro).
  // Prioritaire sur my_role quand fourni.
  myRole?: 'client' | 'professionnel' | null
  // Id du professionnel (pour l'avis) quand other_id est absent
  // (interventions issues de conversation_interventions).
  professionalId?: string
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contact, setContact] = useState<InterventionContact | null>(null)
  const [showAddress, setShowAddress] = useState(false)
  const [adresse, setAdresse] = useState(i.adresse_exacte ?? '')
  const [showCancel, setShowCancel] = useState(false)
  const [motif, setMotif] = useState('')
  const [showReview, setShowReview] = useState(false)
  const [notes, setNotes] = useState({ qualite: 0, ponctualite: 0, professionnalisme: 0, rapport_prix: 0 })
  const [commentaire, setCommentaire] = useState('')

  // Rôle dans l'intervention : prop explicite prioritaire,
  // sinon my_role renvoyé par my_interventions.
  const role: 'client' | 'professionnel' | null =
    myRole ?? ('my_role' in i && i.my_role ? i.my_role : null)

  async function call(fn: string, params: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc(fn, params)
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return false
    }
    onChanged?.()
    return true
  }

  async function revealContact() {
    setBusy(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc(
      'get_intervention_contact',
      { p_intervention_id: i.intervention_id },
    )
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    if (row) setContact(row as InterventionContact)
  }

  async function submitReview() {
    if (Object.values(notes).some((n) => n < 1)) {
      setError('Merci de noter les 4 critères.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.from('reviews').insert({
      intervention_id: i.intervention_id,
      client_id: meId,
      professional_id:
        professionalId ?? ('other_id' in i ? i.other_id : ''),
      note_qualite: notes.qualite,
      note_ponctualite: notes.ponctualite,
      note_professionnalisme: notes.professionnalisme,
      note_rapport_prix: notes.rapport_prix,
      commentaire: commentaire.trim() || null,
    })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setShowReview(false)
    onChanged?.()
  }

  const canRespond =
    i.statut === 'proposee' && i.proposee_par !== meId
  const canCancel = ['proposee', 'confirmee'].includes(i.statut)
  const showContact =
    (i.statut === 'confirmee' || i.statut === 'terminee') && !contact
  const contactVisible =
    (i.statut === 'confirmee' || i.statut === 'terminee') && contact

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {i.metier_nom ?? 'Intervention'}
            {' · '}
            {'other_name' in i && i.other_name
              ? i.other_name
              : ''}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">
            {i.description}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {i.date_prevue &&
              `Prévue le ${new Date(i.date_prevue + 'T12:00:00').toLocaleDateString('fr-FR')} · `}
            {new Date(i.created_at).toLocaleDateString('fr-FR')}
          </p>
          {i.statut === 'annulee' && i.motif_annulation && (
            <p className="mt-1 text-xs text-gray-500">
              Motif : {i.motif_annulation}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUT_STYLES[i.statut]}`}
        >
          {STATUT_LABELS[i.statut]}
        </span>
      </div>

      {error && (
        <div className="mt-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {/* Réponse à une proposition (proposeur ≠ moi) */}
      {i.statut === 'proposee' && canRespond && (
        <div className="mt-3 space-y-2">
          {role === 'client' && (
            <button
              type="button"
              onClick={() => setShowAddress((v) => !v)}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              {showAddress
                ? 'Masquer l\'adresse'
                : 'Ajouter une adresse exacte (facultatif)'}
            </button>
          )}
          {showAddress && role === 'client' && (
            <input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="Adresse précise du chantier / domicile"
              className={inputClass}
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void call('respond_intervention', {
                  p_intervention_id: i.intervention_id,
                  p_accepter: true,
                  p_adresse_exacte: role === 'client' ? adresse : null,
                })
              }
              className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              Accepter
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void call('respond_intervention', {
                  p_intervention_id: i.intervention_id,
                  p_accepter: false,
                })
              }
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Refuser
            </button>
          </div>
        </div>
      )}

      {/* Attente de réponse pour le proposeur */}
      {i.statut === 'proposee' && !canRespond && (
        <p className="mt-3 text-xs text-gray-500">
          En attente de la réponse de {i.other_name ?? 'l\'autre partie'}.
        </p>
      )}

      {/* Adresse du client (visible par le pro et le client) */}
      {i.adresse_exacte && i.statut !== 'annulee' && i.statut !== 'refusee' && (
        <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
          Adresse : {i.adresse_exacte}
        </p>
      )}

      {/* Actions selon le rôle et l'étape */}
      <div className="mt-3 flex flex-wrap gap-2">
        {showContact && (
          <button
            type="button"
            disabled={busy}
            onClick={revealContact}
            className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            Voir le téléphone
          </button>
        )}
        {role === 'professionnel' &&
          i.statut === 'confirmee' &&
          !i.pro_terminee_le && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void call('pro_mark_intervention_done', {
                  p_intervention_id: i.intervention_id,
                })
              }
              className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              Marquer terminée
            </button>
          )}
        {role === 'client' &&
          i.statut === 'confirmee' &&
          i.pro_terminee_le && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void call('client_confirm_intervention_done', {
                  p_intervention_id: i.intervention_id,
                })
              }
              className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              Confirmer la fin
            </button>
          )}
        {role === 'client' &&
          i.statut === 'confirmee' &&
          !i.pro_terminee_le && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void call('set_intervention_address', {
                  p_intervention_id: i.intervention_id,
                  p_adresse: adresse,
                })
              }
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Enregistrer l'adresse
            </button>
          )}
        {canCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowCancel((v) => !v)}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Annuler
          </button>
        )}
        {role === 'client' &&
          i.statut === 'terminee' &&
          'a_avis' in i &&
          !i.a_avis &&
          !showReview && (
            <button
              type="button"
              onClick={() => setShowReview(true)}
              className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
            >
              Laisser un avis
            </button>
          )}
      </div>

      {/* Coordonnées révélées (journalisées côté base) */}
      {contactVisible && contact && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-medium text-green-800">
            Coordonnées de {contact.other_name ?? 'l\'autre partie'}
          </p>
          {contact.other_phone && (
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {contact.other_phone}
            </p>
          )}
          {contact.adresse_exacte && (
            <p className="mt-1 text-xs text-gray-600">
              Adresse : {contact.adresse_exacte}
            </p>
          )}
        </div>
      )}

      {/* Annulation avec motif */}
      {showCancel && (
        <div className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif de l'annulation (obligatoire)"
            className={inputClass}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !motif.trim()}
              onClick={() =>
                void call('cancel_intervention', {
                  p_intervention_id: i.intervention_id,
                  p_motif: motif,
                }).then((ok) => ok && setShowCancel(false))
              }
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirmer l'annulation
            </button>
            <button
              type="button"
              onClick={() => setShowCancel(false)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600"
            >
              Retour
            </button>
          </div>
        </div>
      )}

      {/* Formulaire d'avis (client, intervention terminée) */}
      {showReview && (
        <div className="mt-3 space-y-3 rounded-lg border border-gray-200 p-3">
          <p className="text-sm font-semibold text-gray-900">
            Votre avis sur {i.other_name ?? 'ce professionnel'}
          </p>
          {(
            [
              ['qualite', 'Qualité du travail'],
              ['ponctualite', 'Ponctualité'],
              ['professionnalisme', 'Professionnalisme'],
              ['rapport_prix', 'Rapport qualité-prix'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700">{label}</span>
              <Stars
                value={notes[key]}
                onChange={(v) => setNotes((n) => ({ ...n, [key]: v }))}
              />
            </div>
          ))}
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder="Commentaire (facultatif, texte brut)"
            className={inputClass}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={submitReview}
              className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              Publier l'avis
            </button>
            <button
              type="button"
              onClick={() => setShowReview(false)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {'other_name' in i && i.other_name && 'conversation_id' in i &&
        i.conversation_id && (
        <p className="mt-2 text-xs">
          <Link
            to={`/conversation/${i.conversation_id}`}
            className="font-medium text-blue-700 hover:underline"
          >
            Ouvrir la conversation →
          </Link>
        </p>
      )}
    </Card>
  )
}
