import { Link } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE } from '../lib/constants'

// Page d'accueil publique : nom, slogan, recherche (bientôt), deux accès.
export default function Home() {
  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-3xl font-bold text-teal-900 sm:text-4xl">
          {APP_NAME}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-gray-600">{APP_TAGLINE}</p>
      </section>

      {/* Barre de recherche désactivée : la recherche arrivera dans une phase suivante. */}
      <section>
        <div className="relative">
          <input
            type="search"
            disabled
            placeholder="Que recherchez-vous ? (électricien, plombier…)"
            className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-base text-gray-400"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-500">
            Bientôt
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/inscription?role=client"
          className="rounded-xl border border-teal-700 bg-teal-700 px-6 py-5 text-center text-lg font-semibold text-white transition hover:bg-teal-800"
        >
          Trouver un professionnel
        </Link>
        <Link
          to="/inscription?role=professionnel"
          className="rounded-xl border border-teal-700 bg-white px-6 py-5 text-center text-lg font-semibold text-teal-800 transition hover:bg-teal-50"
        >
          Je suis professionnel
        </Link>
      </section>
    </div>
  )
}
