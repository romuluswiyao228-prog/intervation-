import { useCallback, useEffect, useState } from 'react'
import { Card, EmptyState } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { supabaseConfigured } from '../../lib/env'
import type { Category, Metier, Review } from '../../lib/types'

const TABS = [
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'legal', label: 'Pages légales' },
  { id: 'stats', label: 'Statistiques' },
  { id: 'journal', label: 'Journal' },
  { id: 'avis', label: 'Avis signalés' },
] as const

const inputClass =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none'

interface AdminStats {
  activity_30j: {
    jour: string
    inscriptions: number
    conversations: number
    messages: number
    signalements: number
  }[]
  pros_par_categorie: { nom: string; total: number }[]
  pros_par_ville: { ville: string; total: number }[]
  completude: { total: number; complets: number }
  verification: { total: number; verifies: number }
}

interface JournalRow {
  id: number
  admin_id: string
  action: string
  cible_type: string | null
  cible_id: string | null
  motif: string | null
  created_at: string
  admin_name?: string | null
}

// Section « Contenus » : catalogue, pages légales, stats, journal, avis.
export default function AdminContenus() {
  const { profile: me } = useAuth()
  const isAdmin = me?.role === 'administrateur'
  const [tab, setTab] = useState<string>('catalogue')

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-gray-900">Contenus</h2>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
        {TABS.filter((t) => isAdmin || t.id !== 'legal').map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-blue-700 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'catalogue' && <CatalogueTab isAdmin={isAdmin} />}
      {tab === 'legal' && isAdmin && <LegalTab />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'journal' && <JournalTab />}
      {tab === 'avis' && <AvisTab />}
    </div>
  )
}

// ---------- Avis signalés : file des signalements sur les avis ----------
interface ReportedReview {
  report_id: string
  report_statut: string
  motif: string
  created_at: string
  review: Review | null
}

function AvisTab() {
  const [items, setItems] = useState<ReportedReview[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabaseConfigured) return
    const { data: reps, error } = await supabase
      .from('reports')
      .select('id, statut, motif, cible_id, created_at')
      .eq('cible_type', 'avis')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) console.error('Signalements avis :', error.message)
    const reports = (reps ?? []) as {
      id: string
      statut: string
      motif: string
      cible_id: string
      created_at: string
    }[]
    const ids = reports.map((r) => r.cible_id)
    const { data: revs } = ids.length
      ? await supabase
          .from('reviews')
          .select(
            'id, intervention_id, client_id, professional_id, note_qualite, note_ponctualite, note_professionnalisme, note_rapport_prix, note_globale, commentaire, statut, created_at',
          )
          .in('id', ids)
      : { data: [] }
    const byId = new Map(((revs ?? []) as Review[]).map((r) => [r.id, r]))
    setItems(
      reports.map((r) => ({
        report_id: r.id,
        report_statut: r.statut,
        motif: r.motif,
        created_at: r.created_at,
        review: byId.get(r.cible_id) ?? null,
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setVisibility(reviewId: string, visible: boolean) {
    const motif = window.prompt(
      visible
        ? 'Motif du retour à la visibilité (obligatoire) :'
        : 'Motif du masquage (obligatoire) :',
    )
    if (!motif?.trim()) return
    setBusy(reviewId)
    const { error } = await supabase.rpc('admin_set_review_visibility', {
      p_review_id: reviewId,
      p_visible: visible,
      p_motif: motif.trim(),
    })
    setBusy(null)
    if (error) {
      setMsg(error.message)
    } else {
      setMsg(null)
      load()
    }
  }

  if (loading) return <p className="text-gray-500">Chargement…</p>
  if (items.length === 0) {
    return <EmptyState title="Aucun avis signalé" />
  }

  return (
    <div className="space-y-3">
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {items.map((it) => (
        <Card key={it.report_id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {it.review
                  ? `Avis ${Number(it.review.note_globale).toFixed(1)}/5 — ${it.review.commentaire ?? 'sans commentaire'}`
                  : 'Avis introuvable ou supprimé'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Signalement {it.report_statut} · motif : {it.motif} ·{' '}
                {new Date(it.created_at).toLocaleDateString('fr-FR')}
              </p>
              {it.review && (
                <p className="mt-1 text-xs text-gray-500">
                  Avis {it.review.statut === 'masque' ? 'masqué' : 'visible'}
                </p>
              )}
            </div>
            {it.review && (
              <button
                type="button"
                disabled={busy === it.review.id}
                onClick={() =>
                  void setVisibility(
                    it.review!.id,
                    it.review!.statut !== 'visible',
                  )
                }
                className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === it.review.id
                  ? '…'
                  : it.review.statut === 'visible'
                    ? 'Masquer'
                    : 'Rendre visible'}
              </button>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---------- Catalogue : catégories + métiers (admin : CRUD) ----------
function CatalogueTab({ isAdmin }: { isAdmin: boolean }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [metiers, setMetiers] = useState<Metier[]>([])
  const [newCat, setNewCat] = useState('')
  const [newMetier, setNewMetier] = useState('')
  const [metierCat, setMetierCat] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabaseConfigured) return
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from('categories').select('*').order('position'),
      supabase.from('metiers').select('*').order('position'),
    ])
    setCategories((c ?? []) as Category[])
    setMetiers((m ?? []) as Metier[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function addCategory() {
    if (!newCat.trim()) return
    const { error } = await supabase.from('categories').insert({
      name: newCat.trim(),
      position: categories.length,
    })
    if (error) setMsg(error.message)
    else {
      setNewCat('')
      load()
    }
  }

  async function addMetier() {
    if (!newMetier.trim() || !metierCat) return
    const { error } = await supabase.from('metiers').insert({
      name: newMetier.trim(),
      category_id: metierCat,
      position: metiers.length,
    })
    if (error) setMsg(error.message)
    else {
      setNewMetier('')
      load()
    }
  }

  async function toggleActive(table: 'categories' | 'metiers', id: string, active: boolean) {
    await supabase.from(table).update({ is_active: !active }).eq('id', id)
    load()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h3 className="text-sm font-bold text-gray-900">Catégories</h3>
        {isAdmin && (
          <div className="mt-2 flex gap-2">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="Nouvelle catégorie"
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={addCategory}
              className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white"
            >
              Ajouter
            </button>
          </div>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span className={c.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}>
                {c.name}
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => toggleActive('categories', c.id, c.is_active)}
                  className="text-xs text-blue-700 hover:underline"
                >
                  {c.is_active ? 'Désactiver' : 'Activer'}
                </button>
              )}
            </li>
          ))}
          {categories.length === 0 && (
            <li className="text-gray-500">Aucune catégorie.</li>
          )}
        </ul>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-bold text-gray-900">Métiers</h3>
        {isAdmin && (
          <div className="mt-2 flex gap-2">
            <select
              value={metierCat}
              onChange={(e) => setMetierCat(e.target.value)}
              className={inputClass}
            >
              <option value="">Catégorie…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={newMetier}
              onChange={(e) => setNewMetier(e.target.value)}
              placeholder="Nouveau métier"
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={addMetier}
              className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white"
            >
              Ajouter
            </button>
          </div>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {metiers.map((m) => {
            const cat = categories.find((c) => c.id === m.category_id)
            return (
              <li key={m.id} className="flex items-center justify-between">
                <span className={m.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}>
                  {m.name}
                  <span className="ml-1 text-xs text-gray-400">
                    ({cat?.name ?? '—'})
                  </span>
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => toggleActive('metiers', m.id, m.is_active)}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    {m.is_active ? 'Désactiver' : 'Activer'}
                  </button>
                )}
              </li>
            )
          })}
          {metiers.length === 0 && <li className="text-gray-500">Aucun métier.</li>}
        </ul>
      </Card>
      {msg && <p className="text-sm text-red-600 lg:col-span-2">{msg}</p>}
    </div>
  )
}

const LEGAL_PAGES = [
  { slug: 'conditions', label: 'Conditions d’utilisation' },
  { slug: 'confidentialite', label: 'Politique de confidentialité' },
]

// ---------- Pages légales : éditeur texte brut + aperçu ----------
function LegalTab() {
  const [slug, setSlug] = useState(LEGAL_PAGES[0].slug)
  const [titre, setTitre] = useState('')
  const [contenu, setContenu] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('legal_pages')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        setTitre(data?.titre ?? LEGAL_PAGES.find((p) => p.slug === slug)?.label ?? '')
        setContenu(data?.contenu ?? '')
        setLoading(false)
      })
  }, [slug])

  async function save() {
    setMsg(null)
    const { error } = await supabase.rpc('admin_update_legal_page', {
      p_slug: slug,
      p_titre: titre,
      p_contenu: contenu,
    })
    setMsg(error ? error.message : 'Page enregistrée.')
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex gap-2">
        {LEGAL_PAGES.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => setSlug(p.slug)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              slug === p.slug
                ? 'bg-blue-700 text-white'
                : 'border border-gray-300 text-gray-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-gray-500">Chargement…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <input
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Titre"
              className={`${inputClass} mb-2 w-full`}
            />
            <textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={14}
              placeholder="Contenu en texte brut (pas de HTML)…"
              className={`${inputClass} w-full font-mono text-xs`}
            />
            <button
              type="button"
              onClick={save}
              className="mt-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Enregistrer
            </button>
            {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">
              Aperçu
            </p>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-lg font-bold text-gray-900">{titre}</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                {contenu || 'Aucun contenu.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------- Statistiques : admin_stats() ----------
function StatsTab() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseConfigured) return
    supabase.rpc('admin_stats').then(({ data }) => {
      setStats(data as unknown as AdminStats)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-gray-500">Chargement…</p>
  if (!stats) return <EmptyState title="Statistiques indisponibles" />

  const maxAct = Math.max(
    1,
    ...stats.activity_30j.map((d) =>
      Math.max(d.inscriptions, d.conversations, d.messages, d.signalements),
    ),
  )
  const pct = (part: number, total: number) =>
    total === 0 ? '0 %' : `${Math.round((part / total) * 100)} %`

  function Bar({ label, value, max }: { label: string; value: number; max: number }) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="w-40 truncate text-gray-600">{label}</span>
        <div className="h-4 flex-1 rounded bg-gray-100">
          <div
            className="h-4 rounded bg-blue-600"
            style={{ width: `${(value / max) * 100}%` }}
          />
        </div>
        <span className="w-8 text-right text-gray-500">{value}</span>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-gray-900">
          Activité des 30 derniers jours
        </h3>
        <div className="space-y-1">
          {stats.activity_30j.map((d) => (
            <div key={d.jour} className="text-xs">
              <span className="text-gray-500">
                {new Date(d.jour).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>{' '}
              {d.inscriptions} insc. · {d.conversations} conv. ·{' '}
              {d.messages} msg. · {d.signalements} sign.
              <div className="h-1.5 rounded bg-gray-100">
                <div
                  className="h-1.5 rounded bg-blue-500"
                  style={{
                    width: `${
                      (Math.max(
                        d.inscriptions,
                        d.conversations,
                        d.messages,
                        d.signalements,
                      ) /
                        maxAct) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">
            Professionnels par catégorie
          </h3>
          {stats.pros_par_categorie.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune donnée.</p>
          ) : (
            <div className="space-y-1.5">
              {stats.pros_par_categorie.map((c) => (
                <Bar key={c.nom} label={c.nom} value={c.total} max={Math.max(1, ...stats.pros_par_categorie.map((x) => x.total))} />
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">
            Professionnels par ville
          </h3>
          {stats.pros_par_ville.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune donnée.</p>
          ) : (
            <div className="space-y-1.5">
              {stats.pros_par_ville.map((v) => (
                <Bar key={v.ville} label={v.ville} value={v.total} max={Math.max(1, ...stats.pros_par_ville.map((x) => x.total))} />
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-900">Qualité</h3>
          <p className="text-sm text-gray-700">
            Profils complets : {stats.completude.complets} /{' '}
            {stats.completude.total} (
            {pct(stats.completude.complets, stats.completude.total)})
          </p>
          <p className="mt-1 text-sm text-gray-700">
            Pros vérifiés : {stats.verification.verifies} /{' '}
            {stats.verification.total} (
            {pct(stats.verification.verifies, stats.verification.total)})
          </p>
        </Card>
      </div>
    </div>
  )
}

// ---------- Journal des actions (lecture seule) ----------
function JournalTab() {
  const [rows, setRows] = useState<JournalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [actionFilter, setActionFilter] = useState('')

  const load = useCallback(async () => {
    if (!supabaseConfigured) return
    let q = supabase
      .from('admin_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + 49)
    if (actionFilter) q = q.ilike('action', `%${actionFilter}%`)
    const { data, error } = await q
    if (error) console.error(error.message)
    const list = (data ?? []) as JournalRow[]
    const ids = [...new Set(list.map((r) => r.admin_id))]
    const { data: profs } = ids.length
      ? await supabase.from('profiles').select('id,display_name').in('id', ids)
      : { data: [] }
    const names = new Map(
      ((profs ?? []) as { id: string; display_name: string | null }[]).map(
        (p) => [p.id, p.display_name],
      ),
    )
    setRows(list.map((r) => ({ ...r, admin_name: names.get(r.admin_id) })))
    setLoading(false)
  }, [offset, actionFilter])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  return (
    <Card className="p-4">
      <div className="mb-3 flex gap-2">
        <input
          value={actionFilter}
          onChange={(e) => {
            setOffset(0)
            setActionFilter(e.target.value)
          }}
          placeholder="Filtrer par action…"
          className={`${inputClass} flex-1`}
        />
      </div>
      {loading && <p className="text-gray-500">Chargement…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-gray-500">Aucune action enregistrée.</p>
      )}
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-gray-100 py-1.5">
            <span className="font-medium text-gray-800">{r.action}</span>
            <span className="text-gray-500">
              {' '}
              par {r.admin_name ?? 'admin'} ·{' '}
              {new Date(r.created_at).toLocaleString('fr-FR')}
            </span>
            {r.motif && (
              <p className="text-xs text-gray-500">Motif : {r.motif}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between text-sm">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 50))}
          className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
        >
          ← Précédent
        </button>
        <button
          type="button"
          disabled={rows.length < 50}
          onClick={() => setOffset(offset + 50)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
        >
          Suivant →
        </button>
      </div>
    </Card>
  )
}
