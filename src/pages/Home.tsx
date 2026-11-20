import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CategoryCard from '../components/CategoryCard'
import { Icon } from '../components/icons'
import { Card, EmptyState, SectionTitle } from '../components/ui'
import { useCategories } from '../hooks/useCategories'
import { useHomepageData } from '../hooks/useHomepageData'
import { APP_NAME } from '../lib/constants'
import type { ProjectType } from '../lib/types'

// Onglets « Explorer par type de projet » (miroir de l'enum project_type).
const PROJECT_TABS: { type: ProjectType; label: string }[] = [
  { type: 'reparation', label: 'Réparation' },
  { type: 'construction_renovation', label: 'Construction et rénovation' },
  { type: 'entretien', label: 'Entretien' },
  { type: 'services_domicile', label: 'Services à domicile' },
]

// Villes desservies — liens inactifs en attendant les pages villes.
const CITIES = [
  'Lomé',
  'Kara',
  'Sokodé',
  'Atakpamé',
  'Kpalimé',
  'Dapaong',
  'Tsévié',
  'Aného',
]

// Positions du collage photo autour du hero (classes responsives) :
// 6 emplacements max, les 3 premiers seulement sur mobile.
const PHOTO_SLOTS: {
  dir: 'left' | 'right'
  pos: string
  rotate: string
  mobile: boolean
}[] = [
  {
    dir: 'left',
    pos: 'left-[2%] top-[4%] sm:left-[3%] sm:top-[8%]',
    rotate: '-rotate-6',
    mobile: true,
  },
  {
    dir: 'right',
    pos: 'right-[3%] top-[3%] sm:right-[4%] sm:top-[5%]',
    rotate: 'rotate-6',
    mobile: true,
  },
  {
    dir: 'left',
    pos: 'left-[4%] bottom-[4%] sm:left-[6%] sm:bottom-[12%]',
    rotate: 'rotate-3',
    mobile: true,
  },
  {
    dir: 'right',
    pos: 'right-[5%] bottom-[5%] sm:right-[7%] sm:bottom-[8%]',
    rotate: '-rotate-3',
    mobile: false,
  },
  {
    dir: 'left',
    pos: 'left-[10%] top-[42%] sm:left-[11%] sm:top-[45%]',
    rotate: 'rotate-6',
    mobile: false,
  },
  {
    dir: 'right',
    pos: 'right-[11%] top-[40%] sm:right-[12%] sm:top-[42%]',
    rotate: '-rotate-6',
    mobile: false,
  },
]

// « Pourquoi nous choisir » — 3 blocs avec icônes, sans promesse commerciale.
const WHY_US = [
  {
    icon: 'search',
    title: 'Trouvez plus vite',
    text: 'Décrivez votre besoin avec vos mots, sans jargon technique.',
  },
  {
    icon: 'shield',
    title: 'Des professionnels proches et vérifiés',
    text: 'Numéro et identité contrôlés avant la mise en relation.',
  },
  {
    icon: 'lock',
    title: 'Vos coordonnées protégées',
    text: 'Une discussion privée sur la plateforme, sans partage de vos coordonnées.',
  },
]

// Événement navigateur pour l'installation PWA.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Bloc « Installez l'application » : affiché uniquement si le navigateur
// propose l'installation (beforeinstallprompt) et que l'app n'est pas déjà
// installée. Aucun badge App Store / Play Store.
function InstallSection() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [hidden, setHidden] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  )

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden || !deferred) return null

  const install = async () => {
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    if (outcome === 'accepted') setHidden(true)
  }

  return (
    <section className="mt-16">
      <Card className="mx-auto flex max-w-2xl flex-col items-center gap-4 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <Icon name="download" className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Installez l'application
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Ajoutez {APP_NAME} à l'écran d'accueil de votre téléphone pour un
            accès rapide.
          </p>
        </div>
        <button
          type="button"
          onClick={install}
          className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
        >
          Installer l'application
        </button>
      </Card>
    </section>
  )
}

// Page d'accueil publique : hero + recherche (bientôt), catégories,
// arguments, projets par type, villes, bandeau pro, installation PWA.
export default function Home() {
  const navigate = useNavigate()
  const { categories, loading } = useCategories()
  const { banners, animationsEnabled } = useHomepageData()
  const [activeTab, setActiveTab] = useState<ProjectType | null>(null)
  const [besoin, setBesoin] = useState('')
  const [quartier, setQuartier] = useState('')
  const [geoMessage, setGeoMessage] = useState<string | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)

  // Collage photo : uniquement s'il y a au moins 2 bannières actives.
  const collageBanners = banners.slice(0, PHOTO_SLOTS.length)

  const hasCategories = categories.length > 0
  // Onglet actif : choix utilisateur, sinon le premier onglet qui a
  // au moins une catégorie (pour ne pas ouvrir sur un onglet vide).
  const effectiveTab =
    activeTab ??
    PROJECT_TABS.find((t) =>
      categories.some((c) => c.project_type === t.type),
    )?.type ??
    PROJECT_TABS[0].type
  const tabCategories = categories.filter(
    (c) => c.project_type === effectiveTab,
  )

  // Géolocalisation : la position sert uniquement de paramètre de
  // recherche (arrondie à ~100 m), jamais stockée ni journalisée.
  function useMyPosition() {
    if (!('geolocation' in navigator)) {
      setGeoMessage(
        "La géolocalisation n'est pas disponible sur cet appareil : saisissez votre ville et votre quartier.",
      )
      return
    }
    setGeoMessage(null)
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false)
        const sp = new URLSearchParams()
        if (besoin.trim()) sp.set('q', besoin.trim())
        if (quartier.trim()) sp.set('quartier', quartier.trim())
        sp.set('lat', pos.coords.latitude.toFixed(3))
        sp.set('lng', pos.coords.longitude.toFixed(3))
        navigate(`/recherche?${sp.toString()}`)
      },
      () => {
        setGeoBusy(false)
        setGeoMessage(
          'Localisation refusée ou indisponible : saisissez votre ville et votre quartier.',
        )
      },
      { timeout: 10000, maximumAge: 300000 },
    )
  }

  return (
    <div>
      {/* ---------- Hero + recherche (désactivée) ---------- */}
      <section className="relative">
        {/* Collage photo : arrive des bords écran, se pose autour du contenu.
            Masqué s'il y a moins de 2 bannières actives. */}
        {collageBanners.length >= 2 && (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            {collageBanners.map((banner, i) => {
              const slot = PHOTO_SLOTS[i]
              const animate = animationsEnabled
              return (
                <div
                  key={banner.id}
                  className={`absolute ${slot.pos} ${slot.mobile ? '' : 'hidden sm:block'}`}
                >
                  <div
                    className={animate ? `hero-photo-anim-${slot.dir}` : undefined}
                    style={
                      animate ? { animationDelay: `${i * 120}ms` } : undefined
                    }
                  >
                    <div
                      className={`h-16 w-16 overflow-hidden rounded-xl border-4 border-white shadow-lg sm:h-24 sm:w-24 ${slot.rotate}`}
                    >
                      <img
                        src={banner.image_url}
                        alt=""
                        width={96}
                        height={96}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="relative mx-auto max-w-3xl pt-8 text-center sm:pt-14">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Trouvez un professionnel de confiance près de chez vous
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            Réparations, entretien, construction et services du quotidien, au
            même endroit.
          </p>

          <Card className="mt-8 p-4 text-left sm:p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const sp = new URLSearchParams()
                if (besoin.trim()) sp.set('q', besoin.trim())
                if (quartier.trim()) sp.set('quartier', quartier.trim())
                navigate(`/recherche?${sp.toString()}`)
              }}
              className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
            >
              <label className="block">
                <span className="sr-only">Décrivez votre besoin</span>
                <input
                  type="search"
                  value={besoin}
                  onChange={(e) => setBesoin(e.target.value)}
                  placeholder="Décrivez votre besoin ou votre problème"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
              <label className="block">
                <span className="sr-only">Quartier</span>
                <input
                  type="text"
                  value={quartier}
                  onChange={(e) => setQuartier(e.target.value)}
                  placeholder="Quartier"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-lg bg-blue-700 px-5 py-2.5 text-base font-semibold text-white transition hover:bg-blue-800 sm:w-auto"
              >
                Rechercher
              </button>
            </form>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={geoBusy}
                onClick={useMyPosition}
                className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {geoBusy
                  ? 'Localisation en cours…'
                  : 'Utiliser ma position'}
              </button>
              {geoMessage && (
                <span className="text-xs text-amber-700">{geoMessage}</span>
              )}
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <Icon name="lock" className="h-3.5 w-3.5" />
              Vos coordonnées restent privées tant que vous n'avez pas donné
              votre accord.
            </p>
          </Card>
        </div>
      </section>

      {/* ---------- Pastilles de catégories ---------- */}
      {!loading && hasCategories && (
        <section className="mt-10">
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((c) => (
              <a
                key={c.id}
                href="#categories"
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-400 hover:text-blue-700"
              >
                <Icon
                  name={c.icon ?? 'grid'}
                  className="h-4 w-4 text-blue-600"
                />
                {c.name}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Grille des catégories ---------- */}
      {!loading && (
        <section id="categories" className="mt-14 scroll-mt-20">
          <SectionTitle title="Des professionnels pour chaque besoin" />
          {hasCategories ? (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {categories.map((c) => (
                <CategoryCard key={c.id} category={c} />
              ))}
            </div>
          ) : (
            <div className="mt-8">
              <EmptyState title="Aucune catégorie disponible pour le moment.">
                Revenez bientôt : de nouveaux services arrivent.
              </EmptyState>
            </div>
          )}
        </section>
      )}

      {/* ---------- Pourquoi nous choisir ---------- */}
      <section id="pourquoi" className="mt-16 scroll-mt-20">
        <SectionTitle title="Pourquoi nous choisir" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {WHY_US.map((item) => (
            <Card key={item.title} className="p-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                <Icon name={item.icon} className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{item.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- Explorer par type de projet ---------- */}
      {hasCategories && (
        <section className="mt-16">
          <SectionTitle title="Explorer par type de projet" />
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {PROJECT_TABS.map((tab) => {
              const active = tab.type === effectiveTab
              return (
                <button
                  key={tab.type}
                  type="button"
                  onClick={() => setActiveTab(tab.type)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-700'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
          <div className="mt-6">
            {tabCategories.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {tabCategories.map((c) => (
                  <CategoryCard key={c.id} category={c} />
                ))}
              </div>
            ) : (
              <EmptyState title="Aucune catégorie dans cette rubrique pour le moment." />
            )}
          </div>
        </section>
      )}

      {/* ---------- Villes ---------- */}
      <section id="villes" className="mt-16 scroll-mt-20">
        <SectionTitle title="Professionnels de confiance partout au Togo" />
        <ul className="mt-8 flex flex-wrap justify-center gap-2">
          {CITIES.map((city) => (
            <li
              key={city}
              className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600"
            >
              <Icon name="map-pin" className="h-4 w-4 text-blue-600" />
              {city}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Bandeau professionnel ---------- */}
      <section className="mt-16">
        <div className="rounded-2xl bg-blue-700 px-6 py-10 text-center text-white sm:px-10">
          <h2 className="text-2xl font-bold">Vous êtes professionnel ?</h2>
          <p className="mx-auto mt-2 max-w-md text-blue-100">
            Rejoignez {APP_NAME} et recevez des demandes de clients près de
            chez vous.
          </p>
          <Link
            to="/inscription?role=professionnel"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-blue-800 transition hover:bg-blue-50"
          >
            Inscription professionnelle
          </Link>
        </div>
      </section>

      {/* ---------- Installation PWA ---------- */}
      <InstallSection />
    </div>
  )
}
