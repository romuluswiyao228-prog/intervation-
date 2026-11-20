import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { Category } from '../lib/types'

// Charge les catégories actives une seule fois puis les met en cache
// (partagé entre l'en-tête et la page d'accueil).
let cache: Promise<Category[]> | null = null

async function fetchCategories(): Promise<Category[]> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name,slug,description,icon,project_type,position,is_active')
        .eq('is_active', true)
        .order('position')
        .order('name')
      if (error) {
        console.error('Impossible de charger les catégories :', error.message)
        return []
      }
      return (data ?? []) as Category[]
    })()
  }
  return cache
}

// Renvoie les catégories actives et l'état de chargement.
// categories est vide tant que le chargement n'est pas terminé.
export function useCategories(): { categories: Category[]; loading: boolean } {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(supabaseConfigured)

  useEffect(() => {
    if (!supabaseConfigured) return
    let active = true
    fetchCategories().then((data) => {
      if (!active) return
      setCategories(data)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return { categories, loading }
}
