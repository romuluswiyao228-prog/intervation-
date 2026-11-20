import { useCallback, useEffect, useState } from 'react'
import { Card, EmptyState } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { supabaseConfigured } from '../../lib/env'

interface ProRow {
  id: string
  nom_commercial: string | null
  ville: string | null
  quartier: string | null
  est_visible: boolean
  identite_verifiee: boolean
  photo_url: string | null
  display_name: string | null
  phone_verified: boolean
}

interface DocRow {
  id: string
  user_id: string
  type: string
  storage_path: string
  statut: string
  motif: string | null
  created_at: string
  display_name: string | null
}

const inputClass =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none'

// Professionnels : visibilité, badges de vérification,
// file des pièces d'identité.
export default function AdminProfessionals() {
  const { profile: me } = useAuth()
  const isAdmin = me?.role === 'administrateur'

  const [pros, setPros] = useState<ProRow[]>([])
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleFilter, setVisibleFilter] = useState('')
  const [verifiedFilter, setVerifiedFilter] = useState('')
  const [motif, setMotif] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabaseConfigured) return
    let q = supabase
      .from('professional_profiles')
      .select(
        'id,nom_commercial,ville,quartier,est_visible,identite_verifiee,photo_url,profiles(display_name,phone_verified)',
      )
      .order('created_at', { ascending: false })
      .limit(200)
    if (visibleFilter === 'visible') q = q.eq('est_visible', true)
    if (visibleFilter === 'cache') q = q.eq('est_visible', false)
    const { data, error } = await q
    if (error) console.error(error.message)
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const p = r.profiles as Record<string, unknown> | null
      return {
        ...(r as unknown as ProRow),
        display_name: (p?.display_name as string) ?? null,
        phone_verified: !!p?.phone_verified,
      }
    })
    setPros(rows)

    const { data: d } = await supabase
      .from('identity_documents')
      .select('id,user_id,type,storage_path,statut,motif,created_at,profiles(display_name)')
      .eq('statut', 'en_attente')
      .order('created_at')
    setDocs(
      ((d ?? []) as Record<string, unknown>[]).map((r) => ({
        ...(r as unknown as DocRow),
        display_name:
          ((r.profiles as Record<string, unknown> | null)?.display_name as
            | string
            | null) ?? null,
      })),
    )
    setLoading(false)
  }, [visibleFilter])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const filtered = verifiedFilter
    ? pros.filter((p) =>
        verifiedFilter === 'verifie'
          ? p.identite_verifiee || p.phone_verified
          : !p.identite_verifiee && !p.phone_verified,
      )
    : pros

  async function setVisibility(p: ProRow, visible: boolean) {
    if (!motif.trim()) {
      setMsg('Le motif est obligatoire.')
      return
    }
    if (
      !window.confirm(
        `${visible ? 'Rendre visible' : 'Masquer'} ${p.nom_commercial ?? p.display_name ?? 'ce profil'} ?`,
      )
    )
      return
    setBusy(p.id)
    setMsg(null)
    const { error } = await supabase.rpc('admin_set_visibility', {
      p_user_id: p.id,
      p_visible: visible,
      p_motif: motif.trim(),
    })
    setBusy(null)
    if (error) setMsg(error.message)
    else {
      setMotif('')
      load()
    }
  }

  async function toggleBadge(p: ProRow, field: 'identite_verifiee' | 'phone_verified', value: boolean) {
    setBusy(p.id)
    if (field === 'identite_verifiee') {
      await supabase
        .from('professional_profiles')
        .update({ identite_verifiee: value })
        .eq('id', p.id)
    } else {
      await supabase
        .from('profiles')
        .update({ phone_verified: value })
        .eq('id', p.id)
    }
    setBusy(null)
    load()
  }

  async function reviewDoc(id: string, statut: 'valide' | 'rejete') {
    const m = statut === 'rejete' ? window.prompt('Motif du rejet :') : null
    if (statut === 'rejete' && !m) return
    setBusy(id)
    const { error } = await supabase.rpc('admin_review_document', {
      p_document_id: id,
      p_statut: statut,
      p_motif: m,
    })
    setBusy(null)
    if (error) setMsg(error.message)
    else load()
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-gray-900">Professionnels</h2>

      {/* Pièces d'identité en attente */}
      {docs.length > 0 && (
        <Card className="mb-6 p-4">
          <h3 className="text-sm font-bold text-gray-900">
            Pièces d'identité en attente ({docs.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2 text-sm"
              >
                <span className="font-medium text-gray-800">
                  {d.display_name ?? 'Utilisateur'}
                </span>
                <span className="text-xs text-gray-500">
                  {d.type} · {new Date(d.created_at).toLocaleDateString('fr-FR')}
                </span>
                {isAdmin && (
                  <span className="ml-auto flex gap-2">
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => reviewDoc(d.id, 'valide')}
                      className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => reviewDoc(d.id, 'rejete')}
                      className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Rejeter
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={visibleFilter}
          onChange={(e) => setVisibleFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">Visibilité : toutes</option>
          <option value="visible">Visibles</option>
          <option value="cache">Masqués</option>
        </select>
        <select
          value={verifiedFilter}
          onChange={(e) => setVerifiedFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">Vérification : toutes</option>
          <option value="verifie">Vérifiés</option>
          <option value="non_verifie">Non vérifiés</option>
        </select>
        <input
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Motif (obligatoire pour visibilité)"
          className={`${inputClass} min-w-48 flex-1`}
        />
      </div>
      {msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}

      {loading && <p className="text-gray-500">Chargement…</p>}
      {!loading && filtered.length === 0 && (
        <EmptyState title="Aucun professionnel" />
      )}

      <ul className="space-y-2">
        {filtered.map((p) => (
          <li key={p.id}>
            <Card className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {p.nom_commercial ?? p.display_name ?? 'Professionnel'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[p.quartier, p.ville].filter(Boolean).join(', ') ||
                      '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.identite_verifiee && (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800">
                      Identité vérifiée
                    </span>
                  )}
                  {p.phone_verified && (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800">
                      Numéro vérifié
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      p.est_visible
                        ? 'bg-blue-50 text-blue-800'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {p.est_visible ? 'Visible' : 'Masqué'}
                  </span>
                </div>
              </div>
              {isAdmin && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-gray-100 pt-2">
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => setVisibility(p, !p.est_visible)}
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {p.est_visible ? 'Masquer' : 'Rendre visible'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() =>
                      toggleBadge(p, 'identite_verifiee', !p.identite_verifiee)
                    }
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {p.identite_verifiee
                      ? 'Retirer identité'
                      : 'Badge identité'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() =>
                      toggleBadge(p, 'phone_verified', !p.phone_verified)
                    }
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {p.phone_verified
                      ? 'Retirer numéro'
                      : 'Badge numéro'}
                  </button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
