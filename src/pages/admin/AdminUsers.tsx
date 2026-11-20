import { useCallback, useEffect, useState } from 'react'
import { Card, EmptyState } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { supabaseConfigured } from '../../lib/env'
import type { Profile, UserRole } from '../../lib/types'

interface Sanction {
  id: string
  type: string
  motif: string
  debut: string
  fin: string | null
  revoquee_le: string | null
}

const inputClass =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none'

const ROLE_LABELS: Record<string, string> = {
  client: 'Client',
  professionnel: 'Professionnel',
  moderateur: 'Modérateur',
  administrateur: 'Administrateur',
}

const SANCTION_LABELS: Record<string, string> = {
  avertissement: 'Avertissement',
  visibilite_reduite: 'Visibilité réduite',
  suspension_temporaire: 'Suspension temporaire',
  suspension_definitive: 'Suspension définitive',
  suppression: 'Suppression',
  blocage_numero: 'Blocage numéro',
}

// Liste des utilisateurs + fiche + actions admin.
export default function AdminUsers() {
  const { profile: me } = useAuth()
  const isAdmin = me?.role === 'administrateur'

  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<Profile | null>(null)
  const [sanctions, setSanctions] = useState<Sanction[]>([])
  const [motif, setMotif] = useState('')
  const [fin, setFin] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabaseConfigured) return
    let q = supabase
      .from('profiles')
      .select(
        'id, role, phone, phone_verified, display_name, city, neighborhood, status, accepted_terms_at, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(200)
    if (roleFilter) q = q.eq('role', roleFilter)
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search.trim()) {
      q = q.or(
        `display_name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`,
      )
    }
    const { data, error } = await q
    if (error) console.error(error.message)
    setUsers((data ?? []) as Profile[])
    setLoading(false)
  }, [roleFilter, statusFilter, search])

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => void load(), 300)
    return () => clearTimeout(t)
  }, [load])

  async function openDetail(u: Profile) {
    setSelected(u)
    setMotif('')
    setFin('')
    setMsg(null)
    const { data } = await supabase
      .from('sanctions')
      .select('id,type,motif,debut,fin,revoquee_le')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
    setSanctions((data ?? []) as Sanction[])
  }

  async function run(
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ) {
    setBusy(true)
    setMsg(null)
    const { error } = await fn()
    setBusy(false)
    if (error) {
      setMsg(error.message)
      return false
    }
    return true
  }

  const needMotif = () => {
    if (!motif.trim()) {
      setMsg('Le motif est obligatoire.')
      return false
    }
    return true
  }

  async function suspendTemp() {
    if (!selected || !needMotif()) return
    const ok = await run(() =>
      supabase.rpc('admin_apply_sanction', {
        p_user_id: selected.id,
        p_type: 'suspension_temporaire',
        p_motif: motif.trim(),
        p_fin: fin ? new Date(`${fin}T23:59:59`).toISOString() : null,
        p_report_id: null,
      }),
    )
    if (ok) {
      setMsg('Suspension temporaire appliquée.')
      openDetail(selected)
      load()
    }
  }

  async function suspendDef() {
    if (!selected || !needMotif()) return
    if (!window.confirm('Confirmer la suspension définitive ?')) return
    const ok = await run(() =>
      supabase.rpc('admin_apply_sanction', {
        p_user_id: selected.id,
        p_type: 'suspension_definitive',
        p_motif: motif.trim(),
        p_fin: null,
        p_report_id: null,
      }),
    )
    if (ok) {
      setMsg('Suspension définitive appliquée.')
      openDetail(selected)
      load()
    }
  }

  async function reactivate() {
    if (!selected || !needMotif()) return
    const ok = await run(() =>
      supabase.rpc('admin_reactivate', {
        p_user_id: selected.id,
        p_motif: motif.trim(),
      }),
    )
    if (ok) {
      setMsg('Compte réactivé.')
      openDetail(selected)
      load()
    }
  }

  async function changeRole(role: UserRole) {
    if (!selected || !needMotif()) return
    if (
      !window.confirm(
        `Changer le rôle de ${selected.display_name ?? 'cet utilisateur'} en ${ROLE_LABELS[role]} ?`,
      )
    )
      return
    const ok = await run(() =>
      supabase.rpc('admin_change_role', {
        p_user_id: selected.id,
        p_role: role,
        p_motif: motif.trim(),
      }),
    )
    if (ok) {
      setMsg('Rôle mis à jour.')
      openDetail(selected)
      load()
    }
  }

  async function blockPhone() {
    if (!selected || !needMotif()) return
    if (!window.confirm('Bloquer définitivement ce numéro ?')) return
    const ok = await run(() =>
      supabase.rpc('admin_apply_sanction', {
        p_user_id: selected.id,
        p_type: 'blocage_numero',
        p_motif: motif.trim(),
        p_fin: null,
        p_report_id: null,
      }),
    )
    if (ok) {
      setMsg('Numéro bloqué.')
      openDetail(selected)
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-gray-900">Utilisateurs</h2>

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom ou téléphone…"
          className={`${inputClass} min-w-48 flex-1`}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">Tous rôles</option>
          {Object.entries(ROLE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">Tous statuts</option>
          <option value="actif">Actif</option>
          <option value="suspendu">Suspendu</option>
        </select>
      </div>

      {loading && <p className="text-gray-500">Chargement…</p>}
      {!loading && users.length === 0 && (
        <EmptyState title="Aucun utilisateur" />
      )}

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => openDetail(u)}
              className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition ${
                selected?.id === u.id
                  ? 'border-blue-500'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {u.display_name ?? 'Sans nom'}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    u.status === 'actif'
                      ? 'bg-green-50 text-green-800'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {u.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {ROLE_LABELS[u.role] ?? u.role}
                {u.phone ? ` · ${u.phone}` : ''}
                {u.city ? ` · ${u.city}` : ''}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {/* Fiche détail + actions */}
      {selected && (
        <Card className="mt-6 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-gray-900">
                {selected.display_name ?? 'Utilisateur'}
              </h3>
              <p className="text-sm text-gray-500">
                {ROLE_LABELS[selected.role]} · {selected.phone ?? '—'} ·{' '}
                {selected.status}
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

          <h4 className="mt-4 text-sm font-semibold text-gray-800">
            Sanctions
          </h4>
          {sanctions.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">Aucune sanction.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {sanctions.map((s) => (
                <li key={s.id} className="text-gray-600">
                  <span className="font-medium">
                    {SANCTION_LABELS[s.type] ?? s.type}
                  </span>{' '}
                  — {s.motif}
                  {s.fin ? ` (jusqu'au ${new Date(s.fin).toLocaleDateString('fr-FR')})` : ''}
                  {s.revoquee_le ? ' · révoquée' : ''}
                </li>
              ))}
            </ul>
          )}

          {/* Motif commun */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Motif (obligatoire)"
              className={`${inputClass} sm:col-span-2`}
            />
            <input
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              className={inputClass}
              title="Date de fin (suspension temporaire)"
            />
          </div>
          {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={suspendTemp}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Suspension temporaire
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={suspendDef}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Suspension définitive
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={reactivate}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Réactiver
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={blockPhone}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Bloquer le numéro
                </button>
              </>
            )}
          </div>

          {isAdmin && selected.id !== me?.id && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                Changer le rôle
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={busy || r === selected.role}
                    onClick={() => changeRole(r)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
