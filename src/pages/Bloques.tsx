import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/icons'
import { Card, EmptyState } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { MyBlock } from '../lib/types'

// Liste des utilisateurs bloqués par l'utilisateur courant,
// avec possibilité de débloquer.
export default function Bloques() {
  const { session } = useAuth()
  const [blocks, setBlocks] = useState<MyBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.rpc('my_blocks')
    setBlocks((data ?? []) as MyBlock[])
    setLoading(false)
  }

  useEffect(() => {
    if (!supabaseConfigured || !session) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function unblock(id: string) {
    if (!session) return
    setBusy(id)
    await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', session.user.id)
      .eq('blocked_id', id)
    setBlocks((prev) => prev.filter((b) => b.blocked_id !== id))
    setBusy(null)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/messages"
        className="text-sm text-blue-700 hover:underline"
      >
        ← Messages
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">
        Utilisateurs bloqués
      </h1>

      {loading && (
        <p className="py-10 text-center text-gray-500">Chargement…</p>
      )}
      {!loading && blocks.length === 0 && (
        <div className="mt-6">
          <EmptyState title="Aucun utilisateur bloqué" />
        </div>
      )}
      {!loading && blocks.length > 0 && (
        <ul className="mt-4 space-y-2">
          {blocks.map((b) => (
            <li key={b.blocked_id}>
              <Card className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-300">
                  {b.blocked_photo ? (
                    <img
                      src={b.blocked_photo}
                      alt=""
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Icon name="user" className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {b.blocked_name ?? 'Utilisateur'}
                  </p>
                  {b.blocked_quartier && (
                    <p className="truncate text-xs text-gray-500">
                      {b.blocked_quartier}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => unblock(b.blocked_id)}
                  disabled={busy === b.blocked_id}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === b.blocked_id ? '…' : 'Débloquer'}
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
