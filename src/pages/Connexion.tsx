import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import { normalizeTogoPhone } from '../lib/phone'
import { pathForRole } from '../lib/constants'
import type { UserRole } from '../lib/types'
import { RedirectIfAuthenticated } from '../components/ProtectedRoute'
import { Alert, Button, Field } from '../components/ui'

// Écran de connexion : numéro de téléphone togolais + mot de passe.
export default function Connexion() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-md">
        <Alert kind="info">
          La configuration Supabase n'est pas encore renseignée. Copiez{' '}
          <code>.env.example</code> vers <code>.env</code> et renseignez{' '}
          <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>.
        </Alert>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const e164 = normalizeTogoPhone(phone)
    if (!e164) {
      setError('Numéro invalide. Format attendu : 8 chiffres (ex. 90 00 00 00).')
      return
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }

    setBusy(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      phone: e164,
      password,
    })
    setBusy(false)

    if (authError) {
      setError(
        'Connexion impossible. Vérifiez votre numéro et votre mot de passe.',
      )
      return
    }

    // Redirection vers l'espace selon le rôle (le profil est rechargé
    // automatiquement par AuthProvider, mais on le relit pour être sûr).
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      navigate(prof ? pathForRole(prof.role as UserRole) : '/', { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <RedirectIfAuthenticated>
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-2xl font-bold text-teal-900">Connexion</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <Field
            label="Numéro de téléphone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="90 00 00 00"
            hint="Format togolais : 8 chiffres, l'indicatif +228 est ajouté automatiquement."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <Field
            label="Mot de passe"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button type="submit" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm">
          <p>
            <Link to="/mot-de-passe-oublie" className="text-teal-700 hover:underline">
              Mot de passe oublié ?
            </Link>
          </p>
          <p className="text-gray-500">
            Pas encore de compte ?{' '}
            <Link to="/inscription" className="text-teal-700 hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>
      </div>
    </RedirectIfAuthenticated>
  )
}
