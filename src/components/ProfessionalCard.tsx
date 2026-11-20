import { Link } from 'react-router-dom'
import { useDiscuss } from '../hooks/useDiscuss'
import type { ProfessionalResult } from '../lib/types'
import { Icon } from './icons'

const NIVEAU_LABELS: Record<string, string> = {
  debutant: 'Débutant',
  confirme: 'Confirmé',
  expert: 'Expert',
}

const DISPONIBILITE_LABELS: Record<string, string> = {
  immediat: 'Disponible immédiatement',
  sur_rdv: 'Sur rendez-vous',
}

// Distance affichée : palier arrondi, jamais exacte.
function distanceLabel(km: number | null): string | null {
  if (km === null) return null
  if (km === 0) return 'moins de 1 km'
  return `environ ${km} km`
}

// Carte de résultat de recherche : photo, métier, badges, distance
// approximative, disponibilité, tarif indicatif.
export default function ProfessionalCard({
  pro,
}: {
  pro: ProfessionalResult
}) {
  const metierPrincipal = pro.metiers?.split(',')[0]?.trim() ?? null
  const distance = distanceLabel(pro.distance_approxe_km)
  const { discuss, busy, error } = useDiscuss(pro.profile_id)

  return (
    <article className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Photo ou placeholder neutre (jamais de fausse photo) */}
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-blue-50">
        {pro.photo_url ? (
          <img
            src={pro.photo_url}
            alt=""
            width={80}
            height={80}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-blue-300">
            <Icon name="briefcase" className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="truncate font-semibold text-gray-900">
            {pro.nom_affiche ?? 'Professionnel'}
          </h3>
          {pro.niveau && (
            <span className="text-xs font-medium text-gray-500">
              {NIVEAU_LABELS[pro.niveau] ?? pro.niveau}
            </span>
          )}
        </div>

        {metierPrincipal && (
          <p className="mt-0.5 text-sm text-gray-700">{metierPrincipal}</p>
        )}

        <p className="mt-0.5 text-xs text-gray-500">
          {[pro.quartier, pro.ville].filter(Boolean).join(', ') ||
            'Localisation non renseignée'}
          {distance && <span> · {distance}</span>}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {pro.nombre_avis > 0 && pro.note_moyenne !== null ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              ★ {Number(pro.note_moyenne).toFixed(1)} ({pro.nombre_avis}{' '}
              avis)
            </span>
          ) : (
            <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500">
              Pas encore d'avis
            </span>
          )}
          {pro.numero_verifie && (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800">
              Numéro vérifié
            </span>
          )}
          {pro.identite_verifiee && (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800">
              Identité vérifiée
            </span>
          )}
          {pro.disponibilite && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                pro.disponibilite === 'immediat'
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {DISPONIBILITE_LABELS[pro.disponibilite] ??
                pro.disponibilite}
            </span>
          )}
        </div>

        {pro.tarif_indicatif && (
          <p className="mt-1.5 text-xs text-gray-500">
            Tarif indicatif : {pro.tarif_indicatif}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <Link
            to={`/professionnel/${pro.profile_id}`}
            className="rounded-lg border border-blue-700 px-3 py-1.5 text-sm font-medium text-blue-800 transition hover:bg-blue-50"
          >
            Voir le profil
          </Link>
          <button
            type="button"
            onClick={discuss}
            disabled={busy}
            className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-800 disabled:opacity-50"
          >
            {busy ? '…' : 'Discuter'}
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    </article>
  )
}
