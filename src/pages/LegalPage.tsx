import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'

// Page légale : contenu texte brut depuis legal_pages (publié par
// l'administrateur). Aucun HTML n'est interprété.
export default function LegalPage({
  title,
  slug,
}: {
  title: string
  slug: string
}) {
  const [page, setPage] = useState<{
    titre: string
    contenu: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    let active = true
    supabase
      .from('legal_pages')
      .select('titre,contenu')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setPage(data)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [slug])

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-bold text-teal-900">
        {page?.titre ?? title}
      </h1>
      {loading ? (
        <p className="mt-4 text-gray-500">Chargement…</p>
      ) : page?.contenu ? (
        <p className="mt-4 whitespace-pre-wrap text-gray-700">
          {page.contenu}
        </p>
      ) : (
        <p className="mt-4 text-gray-500 italic">
          Ce contenu n'est pas encore publié.
        </p>
      )}
    </article>
  )
}
