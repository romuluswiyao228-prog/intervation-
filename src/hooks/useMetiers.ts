import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { Metier } from '../lib/types'

// Charge les métiers actifs (filtres de la page recherche), avec cache.
let cache: Promise<Metier[]> | null = null

function fetchMetiers(): Promise<Metier[]> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await supabase
        .from('metiers')
        .select('id,category_id,name,position,is_active')
        .eq('is_active', true)
        .order('position')
        .order('name')
      if (error) {
        console.error('Impossible de charger les métiers :', error.message)
        return []
      }
      return (data ?? []) as Metier[]
    })()
  }
  return cache
}

export function useMetiers(): Metier[] {
  const [metiers, setMetiers] = useState<Metier[]>([])

  useEffect(() => {
    if (!supabaseConfigured) return
    let active = true
    fetchMetiers().then((data) => {
      if (active) setMetiers(data)
    })
    return () => {
      active = false
    }
  }, [])

  return metiers
}
