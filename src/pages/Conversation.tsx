import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/icons'
import InterventionCard from '../components/InterventionCard'
import { Alert } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useMetiers } from '../hooks/useMetiers'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type {
  ConversationIntervention,
  Message,
  MyConversation,
} from '../lib/types'

const MOTIFS = [
  { value: 'faux_profil', label: 'Faux profil' },
  { value: 'harcelement', label: 'Harcèlement' },
  { value: 'injures', label: 'Injures' },
  { value: 'fraude', label: 'Fraude' },
  { value: 'contenu_interdit', label: 'Contenu interdit' },
  { value: 'autre', label: 'Autre' },
]

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Compresse une image côté client (canvas, JPEG, 1200 px max).
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Compression impossible'))),
      'image/jpeg',
      0.8,
    )
  })
}

// Affiche une image du bucket privé via URL signée courte.
function MessageImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    supabase.storage
      .from('messages')
      .createSignedUrl(path, 300)
      .then(({ data }) => {
        if (active && data?.signedUrl) setUrl(data.signedUrl)
      })
    return () => {
      active = false
    }
  }, [path])
  if (!url) return <p className="text-xs text-gray-400">Image…</p>
  return (
    <img
      src={url}
      alt="Image jointe"
      className="max-h-64 rounded-lg"
      loading="lazy"
    />
  )
}

// Page de conversation : bulles, temps réel, envoi texte/photo,
// signalement, blocage.
export default function Conversation() {
  const { id } = useParams<{ id: string }>()
  const { session, profile } = useAuth()
  const me = session?.user.id ?? ''

  const [conv, setConv] = useState<MyConversation | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockedByMe, setBlockedByMe] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportCible, setReportCible] = useState<{
    type: 'conversation' | 'message'
    id: string
  } | null>(null)
  const [motif, setMotif] = useState('harcelement')
  const [description, setDescription] = useState('')
  // Interventions liées à cette conversation.
  const [interventions, setInterventions] = useState<
    ConversationIntervention[]
  >([])
  const [showPropose, setShowPropose] = useState(false)
  const [pMetier, setPMetier] = useState('')
  const [pDescription, setPDescription] = useState('')
  const [pDate, setPDate] = useState('')
  const metiers = useMetiers()
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const suspended = profile?.status === 'suspendu'
  const cannotSend =
    suspended || conv?.statut === 'fermee' || conv?.is_blocked

  // Chargement conversation + messages.
  useEffect(() => {
    if (!supabaseConfigured || !id || !session) return
    let active = true

    async function load() {
      const { data: convs } = await supabase.rpc('my_conversations')
      const found = ((convs ?? []) as MyConversation[]).find(
        (c) => c.conversation_id === id,
      )
      if (!active) return
      if (!found) {
        setNotFound(true)
        return
      }
      setConv(found)
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true })
      if (!active) return
      setMessages((msgs ?? []) as Message[])
      // Marque comme lus les messages reçus.
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', id)
        .neq('sender_id', me)
        .is('read_at', null)
      // Vérifie si j'ai bloqué l'autre.
      const { data: blocks } = await supabase
        .from('blocks')
        .select('blocked_id')
        .eq('blocker_id', me)
        .eq('blocked_id', found.other_id)
      if (active) setBlockedByMe(!!blocks?.length)
      // Charge les interventions de la conversation.
      const { data: ints } = await supabase.rpc(
        'conversation_interventions',
        { p_conversation_id: id },
      )
      if (active) setInterventions((ints ?? []) as ConversationIntervention[])
    }
    void load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session])

  async function loadInterventions() {
    if (!id) return
    const { data } = await supabase.rpc('conversation_interventions', {
      p_conversation_id: id,
    })
    setInterventions((data ?? []) as ConversationIntervention[])
  }

  async function proposeIntervention() {
    if (!id || !pDescription.trim()) return
    const { error: rpcError } = await supabase.rpc('propose_intervention', {
      p_conversation_id: id,
      p_metier_id: pMetier || null,
      p_description: pDescription.trim(),
      p_date_prevue: pDate || null,
    })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setShowPropose(false)
    setPDescription('')
    setPDate('')
    await loadInterventions()
  }

  // Temps réel : nouveaux messages + accusés de lecture.
  useEffect(() => {
    if (!supabaseConfigured || !id) return
    const channel = supabase
      .channel(`conv-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const m = payload.new as Message
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          )
          // Marque comme lu immédiatement si le message est reçu.
          if (m.sender_id !== me) {
            void supabase
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', m.id)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const m = payload.new as Message
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
          )
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [id, me])

  // Défilement en bas à l'arrivée d'un message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = useCallback(
    async (text: string, imagePath: string | null) => {
      if (!id || cannotSend || sending) return
      setSending(true)
      setError(null)
      const { error: insertError } = await supabase.from('messages').insert({
        conversation_id: id,
        sender_id: me,
        body: text,
        image_path: imagePath,
      })
      setSending(false)
      if (insertError) {
        setError(insertError.message)
      }
    },
    [id, cannotSend, sending, me],
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setBody('')
    void send(text, null)
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !id || cannotSend) return
    setError(null)
    try {
      const blob = await compressImage(file)
      const path = `${id}/${crypto.randomUUID()}.jpg`
      const { error: upError } = await supabase.storage
        .from('messages')
        .upload(path, blob, { contentType: 'image/jpeg' })
      if (upError) throw upError
      await send('', path)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Envoi de l'image impossible.",
      )
    }
  }

  async function submitReport() {
    if (!reportCible) return
    const { error: reportError } = await supabase.from('reports').insert({
      reporter_id: me,
      cible_type: reportCible.type,
      cible_id: reportCible.id,
      motif,
      description: description.trim() || null,
    })
    if (reportError) {
      setError(reportError.message)
      return
    }
    setShowReport(false)
    setReportCible(null)
    setDescription('')
    alert('Signalement envoyé. Merci.')
  }

  async function toggleBlock() {
    if (!conv) return
    if (blockedByMe) {
      await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', me)
        .eq('blocked_id', conv.other_id)
      setBlockedByMe(false)
    } else {
      if (!window.confirm(`Bloquer ${conv.other_name ?? 'cet utilisateur'} ?`))
        return
      await supabase
        .from('blocks')
        .insert({ blocker_id: me, blocked_id: conv.other_id })
      setBlockedByMe(true)
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-gray-600">Conversation introuvable.</p>
        <Link
          to="/messages"
          className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline"
        >
          ← Retour aux messages
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ minHeight: '70vh' }}>
      {/* En-tête */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div>
          <Link
            to="/messages"
            className="text-sm text-blue-700 hover:underline"
          >
            ← Messages
          </Link>
          <h1 className="text-lg font-bold text-gray-900">
            {conv?.other_name ?? 'Conversation'}
          </h1>
          {conv?.other_quartier && (
            <p className="text-xs text-gray-500">{conv.other_quartier}</p>
          )}
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setReportCible({ type: 'conversation', id: id! })
              setShowReport(true)
            }}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-gray-600 hover:bg-gray-50"
          >
            Signaler
          </button>
          <button
            type="button"
            onClick={toggleBlock}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-gray-600 hover:bg-gray-50"
          >
            {blockedByMe ? 'Débloquer' : 'Bloquer'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {/* Interventions de cette conversation */}
      <div className="mt-3 space-y-2">
        {interventions.map((i) => (
          <InterventionCard
            key={i.intervention_id}
            intervention={i}
            meId={me}
            myRole={
              profile?.role === 'professionnel' ? 'professionnel' : 'client'
            }
            professionalId={
              profile?.role === 'client' ? conv?.other_id : undefined
            }
            onChanged={loadInterventions}
          />
        ))}
        {!cannotSend && conv?.statut === 'ouverte' && (
          <>
            {!showPropose ? (
              <button
                type="button"
                onClick={() => setShowPropose(true)}
                className="w-full rounded-xl border border-dashed border-blue-300 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                + Proposer une intervention
              </button>
            ) : (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  Proposer une intervention
                </h2>
                <select
                  value={pMetier}
                  onChange={(e) => setPMetier(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Service (facultatif)</option>
                  {metiers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <textarea
                  value={pDescription}
                  onChange={(e) => setPDescription(e.target.value.slice(0, 2000))}
                  rows={2}
                  placeholder="Décrivez le besoin (obligatoire)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={pDate}
                  onChange={(e) => setPDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!pDescription.trim() || sending}
                    onClick={proposeIntervention}
                    className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    Envoyer la proposition
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPropose(false)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {cannotSend && (
        <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600">
          {suspended
            ? 'Votre compte est suspendu : vous ne pouvez plus envoyer de messages.'
            : conv?.statut === 'fermee'
              ? 'Cette conversation est fermée.'
              : 'La messagerie est indisponible entre ces deux utilisateurs (blocage).'}
        </p>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto py-4">
        {messages.map((m) => {
          const mine = m.sender_id === me
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? 'bg-blue-700 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {m.image_path && <MessageImage path={m.image_path} />}
                {m.body && (
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 px-1 text-[10px] text-gray-400">
                <span>{formatTime(m.created_at)}</span>
                {mine && m.read_at && <span>lu</span>}
                {!mine && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportCible({ type: 'message', id: m.id })
                      setShowReport(true)
                    }}
                    className="text-gray-400 hover:text-red-600"
                  >
                    Signaler
                  </button>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Formulaire de signalement */}
      {showReport && reportCible && (
        <div className="mb-3 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Signaler {reportCible.type === 'message' ? 'ce message' : 'cette conversation'}
          </h2>
          <label className="mt-2 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Motif</span>
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
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submitReport}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Envoyer le signalement
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReport(false)
                setReportCible(null)
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Saisie */}
      {!cannotSend && (
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 border-t border-gray-200 pt-3"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePhoto}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            className="rounded-lg border border-gray-300 p-2.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            title="Envoyer une photo"
          >
            <Icon name="image" className="h-5 w-5" />
          </button>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as FormEvent)
              }
            }}
            rows={1}
            placeholder="Votre message…"
            className="max-h-32 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {sending ? '…' : 'Envoyer'}
          </button>
        </form>
      )}
    </div>
  )
}
