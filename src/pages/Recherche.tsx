import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProfessionalCard from '../components/ProfessionalCard'
import { Alert, Card, EmptyState } from '../components/ui'
import { useCategories } from '../hooks/useCategories'
import { useMetiers } from '../hooks/useMetiers'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { ProfessionalResult } from '../lib/types'

const PAGE_SIZE = 12

// Libellés des filtages.
const DISPONIBILITE_OPTIONS = [
  { value: '', label: 'Toutes disponibilités' },
  { value: 'immediat', label: 'Disponible immédiatement' },
  { value: 'sur_rdv', label: 'Sur rendez-vous' },
]
const NIVEAU_OPTIONS = [
  { value: '', label: 'Tous niveaux' },
  { value: 'debutant', label: 'Débutant' },
  { value: 'confirme', label: 'Confirmé' },
  { value: 'expert', label: 'Expert' },
]
const VERIFICATION_OPTIONS = [
  { value: '0', label: 'Toutes vérifications' },
  { value: '1', label: 'Numéro vérifié au minimum' },
  { value: '2', label: 'Identité vérifiée' },
]
const TRI_OPTIONS = [
  { value: 'proximite', label: 'Proximité' },
  { value: 'verification', label: 'Vérification' },
  { value: 'profil', label: 'Profil complet' },
]

const selectClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'

// Page de résultats de recherche : filtres, tri, liste, pagination.
export default function Recherche() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { categories } = useCategories()
  const metiers = useMetiers()

  // searchParams (URL) = source de vérité des paramètres appliqués.
  // Les champs texte restent modifiables sans relancer la recherche.
  const appliedQ = searchParams.get('q') ?? ''
  const appliedQuartier = searchParams.get('quartier') ?? ''
  const appliedVille = searchParams.get('ville') ?? ''
  const appliedLat = searchParams.get('lat') ?? ''
  const appliedLng = searchParams.get('lng') ?? ''

  const [query, setQuery] = useState(appliedQ)
  const [quartier, setQuartier] = useState(appliedQuartier)
  const [ville, setVille] = useState(appliedVille)

  // Resynchronise les champs si l'URL change (retour arrière, nouveau partage).
  useEffect(() => {
    setQuery(appliedQ)
    setQuartier(appliedQuartier)
    setVille(appliedVille)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedQ, appliedQuartier, appliedVille])

  const [categoryId, setCategoryId] = useState('')
  const [metierId, setMetierId] = useState('')
  const [disponibilite, setDisponibilite] = useState('')
  const [niveau, setNiveau] = useState('')
  const [verification, setVerification] = useState('0')
  const [tri, setTri] = useState('proximite')

  const [results, setResults] = useState<ProfessionalResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Vrai si la recherche a dû élargir le rayon (résultats hors rayon).
  const [elargi, setElargi] = useState(false)

  const hasGeoContext =
    appliedLat !== '' || appliedLng !== '' || appliedQuartier !== ''

  // Construit les paramètres de la fonction SQL.
  const buildParams = useCallback(
    (widen: boolean, offset: number) => ({
      p_search: appliedQ || null,
      p_metier_id: metierId || null,
      p_category_id: categoryId || null,
      p_lat: appliedLat ? Number(appliedLat) : null,
      p_lng: appliedLng ? Number(appliedLng) : null,
      p_ville: appliedVille || null,
      p_quartier: appliedQuartier || null,
      p_disponibilite: disponibilite || null,
      p_niveau: niveau || null,
      p_verification_min: Number(verification) || 0,
      p_tri: tri,
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_elargir: widen,
    }),
    [
      appliedQ,
      appliedQuartier,
      appliedVille,
      appliedLat,
      appliedLng,
      metierId,
      categoryId,
      disponibilite,
      niveau,
      verification,
      tri,
    ],
  )

  const fetchPage = useCallback(
    async (widen: boolean, offset: number) => {
      const { data, error: rpcError } = await supabase.rpc(
        'search_professionals',
        buildParams(widen, offset),
      )
      if (rpcError) throw rpcError
      const rows = (data ?? []) as ProfessionalResult[]
      return { rows, total: rows[0]?.total_count ?? 0 }
    },
    [buildParams],
  )

  // Recherche principale : si rien dans le rayon et qu'une position
  // est connue, on relance une fois avec le rayon élargi.
  const runSearch = useCallback(async () => {
    if (!supabaseConfigured) return
    setLoading(true)
    setError(null)
    setElargi(false)
    try {
      let res = await fetchPage(false, 0)
      if (res.rows.length === 0 && hasGeoContext) {
        res = await fetchPage(true, 0)
        setElargi(res.rows.length > 0)
      }
      setResults(res.rows)
      setTotal(res.total)
    } catch (e) {
      setError(
        'La recherche a échoué. Vérifiez votre connexion et réessayez.',
      )
      console.error(e)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, hasGeoContext])

  // Relance la recherche quand les paramètres ou filtres changent.
  useEffect(() => {
    void runSearch()
  }, [runSearch])

  // Soumission du formulaire : met à jour l'URL (la recherche
  // se relance automatiquement via l'effet sur searchParams).
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const sp = new URLSearchParams()
    if (query.trim()) sp.set('q', query.trim())
    if (quartier.trim()) sp.set('quartier', quartier.trim())
    if (ville.trim()) sp.set('ville', ville.trim())
    // La position navigateur (lat/lng) est conservée telle quelle.
    if (appliedLat) sp.set('lat', appliedLat)
    if (appliedLng) sp.set('lng', appliedLng)
    setSearchParams(sp, { replace: true })
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const res = await fetchPage(elargi, results.length)
      setResults((prev) => [...prev, ...res.rows])
      setTotal(res.total)
    } catch (e) {
      setError('Impossible de charger plus de résultats.')
      console.error(e)
    } finally {
      setLoadingMore(false)
    }
  }

  const metiersFiltres = categoryId
    ? metiers.filter((m) => m.category_id === categoryId)
    : metiers
  const hasResults = results.length > 0
  const horsRayon = elargi && results.some((r) => !r.dans_rayon)

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Recherche</h1>

      {/* ---------- Formulaire de recherche ---------- */}
      <Card className="mt-4 p-4">
        <form
          onSubmit={handleSubmit}
          className="grid gap-3 sm:grid-cols-[1fr_160px_160px_auto] sm:items-end"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Métier ou besoin
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ex. électricien, fuite d'eau…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Quartier
            </span>
            <input
              type="text"
              value={quartier}
              onChange={(e) => setQuartier(e.target.value)}
              placeholder="ex. Tokoin"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Ville
            </span>
            <input
              type="text"
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              placeholder="ex. Lomé"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-base font-semibold text-white transition hover:bg-blue-800"
          >
            Rechercher
          </button>
        </form>

        {(appliedLat || appliedLng) && (
          <p className="mt-3 text-xs text-gray-500">
            Recherche autour de votre position (approximative, non
            enregistrée).
          </p>
        )}
        {!appliedLat &&
          !appliedLng &&
          appliedQuartier && (
            <p className="mt-3 text-xs text-gray-500">
              Recherche autour du quartier « {appliedQuartier} ».
            </p>
          )}
      </Card>

      {/* ---------- Filtres ---------- */}
      <Card className="mt-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block">
            <span className="sr-only">Catégorie</span>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                setMetierId('')
              }}
              className={selectClass}
            >
              <option value="">Toutes catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Métier</span>
            <select
              value={metierId}
              onChange={(e) => setMetierId(e.target.value)}
              className={selectClass}
            >
              <option value="">Tous métiers</option>
              {metiersFiltres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Disponibilité</span>
            <select
              value={disponibilite}
              onChange={(e) => setDisponibilite(e.target.value)}
              className={selectClass}
            >
              {DISPONIBILITE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Niveau</span>
            <select
              value={niveau}
              onChange={(e) => setNiveau(e.target.value)}
              className={selectClass}
            >
              {NIVEAU_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Vérification</span>
            <select
              value={verification}
              onChange={(e) => setVerification(e.target.value)}
              className={selectClass}
            >
              {VERIFICATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Tri</span>
            <select
              value={tri}
              onChange={(e) => setTri(e.target.value)}
              className={selectClass}
            >
              {TRI_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {/* ---------- Résultats ---------- */}
      <div className="mt-6">
        {error && <Alert>{error}</Alert>}

        {loading && (
          <p className="py-10 text-center text-gray-500">Recherche en cours…</p>
        )}

        {!loading && !error && horsRayon && (
          <Alert kind="info">
            Aucun professionnel dans le rayon habituel : voici les plus
            proches, situés hors de leur zone d'intervention habituelle.
          </Alert>
        )}

        {!loading && !error && !hasResults && (
          <EmptyState title="Aucun professionnel disponible immédiatement dans votre zone.">
            Essayez d'élargir votre recherche ou de modifier vos filtres.
          </EmptyState>
        )}

        {!loading && hasResults && (
          <>
            <p className="mb-3 text-sm text-gray-500">
              {total} professionnel{total > 1 ? 's' : ''} trouvé
              {total > 1 ? 's' : ''}
            </p>
            <div className="space-y-3">
              {results.map((pro) => (
                <ProfessionalCard key={pro.profile_id} pro={pro} />
              ))}
            </div>
            {results.length < total && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg border border-blue-700 px-5 py-2.5 text-sm font-semibold text-blue-800 transition hover:bg-blue-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Chargement…' : 'Voir plus'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
