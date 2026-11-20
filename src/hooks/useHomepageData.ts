import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import type { HomepageBanner } from '../lib/types'

export interface HomepageData {
  banners: HomepageBanner[]
  // Vrai si les animations d'entrée sont activées (réglage
  // animations_actives, absent = activé).
  animationsEnabled: boolean
  loading: boolean
}

// Charge les bannières actives et le réglage animations_actives
// (une seule fois, mis en cache pour les éventuels autres composants).
let cache: Promise<Omit<HomepageData, 'loading'>> | null = null

async function fetchHomepageData(): Promise<Omit<HomepageData, 'loading'>> {
  if (!cache) {
    cache = (async () => {
      const [bannersRes, settingRes] = await Promise.all([
        supabase
          .from('homepage_banners')
          .select('id,image_url,alt,position,is_active,created_at')
          .eq('is_active', true)
          .order('position')
          .order('created_at'),
        supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'animations_actives')
          .maybeSingle(),
      ])

      if (bannersRes.error) {
        console.error(
          'Impossible de charger les bannières :',
          bannersRes.error.message,
        )
      }
      if (settingRes.error) {
        console.error(
          'Impossible de charger les réglages :',
          settingRes.error.message,
        )
      }

      return {
        banners: bannersRes.error
          ? []
          : ((bannersRes.data ?? []) as HomepageBanner[]),
        // Réglage absent ou illisible → animations activées par défaut.
        animationsEnabled: settingRes.data?.value !== 'false',
      }
    })()
  }
  return cache
}

export function useHomepageData(): HomepageData {
  const [data, setData] = useState<HomepageData>({
    banners: [],
    animationsEnabled: true,
    loading: supabaseConfigured,
  })

  useEffect(() => {
    if (!supabaseConfigured) return
    let active = true
    fetchHomepageData().then((result) => {
      if (active) setData({ ...result, loading: false })
    })
    return () => {
      active = false
    }
  }, [])

  return data
}
