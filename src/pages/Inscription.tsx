import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import { normalizeTogoPhone } from '../lib/phone'
import { pathForRole } from '../lib/constants'
import type { SignupRole } from '../lib/types'
import { RedirectIfAuthenticated } from '../components/ProtectedRoute'
import { Alert, Button, Field } from '../components/ui'

// Étapes de l'inscription : choix du rôle → formulaire → code SMS (si requis).
type Step = 'role' | 'form' | 'otp'

interface FormData {
  phone: string // format E.164 (+228XXXXXXXX)
  password: string
  displayName: string
  city: string
  neighborhood: string
  role: SignupRole
}

// Enregistre l'acceptation des conditions dans le profil.
// Le rôle et le statut ne sont JAMAIS envoyés ici (protégés par la RLS + trigger).
async function finalizeProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase
    .from('profiles')
    .update({ accepted_terms_at: new Date().toISOString() })
    .eq('id', user.id)
}

export default function Inscription() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const preselected = searchParams.get('role')
  const [step, setStep] = useState<Step>(
    preselected === 'client' || preselected === 'professionnel'
      ? 'form'
      : 'role',
  )
  const [role, setRole] = useState<SignupRole | null>(
    preselected === 'professionnel'
      ? 'professionnel'
      : preselected === 'client'
        ? 'client'
        : null,
  )
  const [form, setForm] = useState({
    phone: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    city: '',
    neighborhood: '',
    acceptTerms: false,
  })
  const [otp, setOtp] = useState('')
  const [pending, setPending] = useState<FormData | null>(null)
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

  // ---------- Étape 1 : choix du rôle ----------
  if (step === 'role' || !role) {
    return (
      <RedirectIfAuthenticated>
        <div className="mx-auto max-w-md">
          <h1 className="mb-2 text-2xl font-bold text-teal-900">
            Créer un compte
          </h1>
          <p className="mb-6 text-gray-600">Je suis…</p>
          <div className="space-y-4">
            <button
              onClick={() => {
                setRole('client')
                setStep('form')
              }}
              className="w-full rounded-xl border-2 border-teal-700 bg-white px-6 py-5 text-left transition hover:bg-teal-50"
            >
              <span className="block text-lg font-semibold text-teal-900">
                Je cherche un professionnel
              </span>
              <span className="mt-1 block text-sm text-gray-500">
                Client : électricité, plomberie, froid, maçonnerie…
              </span>
            </button>
            <button
              onClick={() => {
                setRole('professionnel')
                setStep('form')
              }}
              className="w-full rounded-xl border-2 border-teal-700 bg-teal-700 px-6 py-5 text-left transition hover:bg-teal-800"
            >
              <span className="block text-lg font-semibold text-white">
                Je suis professionnel
              </span>
              <span className="mt-1 block text-sm text-teal-100">
                Proposez vos services dans votre région
              </span>
            </button>
          </div>
          <p className="mt-6 text-center text-sm text-gray-500">
            Déjà inscrit ?{' '}
            <Link to="/connexion" className="text-teal-700 hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </RedirectIfAuthenticated>
    )
  }

  // ---------- Étape 3 : saisie du code SMS ----------
  if (step === 'otp' && pending) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-2xl font-bold text-teal-900">
          Vérifiez votre téléphone
        </h1>
        <p className="mb-6 text-gray-600">
          Un code SMS a été envoyé au <strong>{pending.phone}</strong>. Saisissez-le
          ci-dessous.
        </p>
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field
            label="Code de vérification"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            required
          />
          <Button type="submit" disabled={busy || otp.length < 4}>
            {busy ? 'Vérification…' : 'Vérifier'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          <button
            type="button"
            className="text-teal-700 hover:underline"
            onClick={() => {
              setStep('form')
              setError(null)
            }}
          >
            Modifier mon numéro
          </button>
        </p>
      </div>
    )
  }

  // ---------- Étape 2 : formulaire ----------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const e164 = normalizeTogoPhone(form.phone)
    if (!e164) {
      setError('Numéro invalide. Format attendu : 8 chiffres (ex. 90 00 00 00).')
      return
    }
    if (form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    if (!form.displayName.trim()) {
      setError('Veuillez indiquer votre nom ou pseudo.')
      return
    }
    if (!form.city.trim() || !form.neighborhood.trim()) {
      setError('Veuillez indiquer votre ville et votre quartier.')
      return
    }
    if (!form.acceptTerms) {
      setError(
        "Vous devez accepter les conditions d'utilisation et la politique de confidentialité.",
      )
      return
    }

    const data: FormData = {
      phone: e164,
      password: form.password,
      displayName: form.displayName.trim(),
      city: form.city.trim(),
      neighborhood: form.neighborhood.trim(),
      role: role!,
    }

    setBusy(true)
    // signUp envoie les métadonnées : le trigger SQL crée le profil avec
    // le bon rôle (whitelist client/professionnel uniquement).
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      phone: e164,
      password: form.password,
      options: {
        data: {
          role: data.role,
          display_name: data.displayName,
          city: data.city,
          neighborhood: data.neighborhood,
        },
      },
    })

    if (signUpError) {
      setBusy(false)
      setError(
        signUpError.message.toLowerCase().includes('already')
          ? 'Ce numéro est déjà associé à un compte.'
          : 'Inscription impossible : ' + signUpError.message,
      )
      return
    }

    // Si Supabase renvoie une session directement (confirmation téléphone
    // désactivée côté projet), on finalise sans code SMS.
    if (signUpData.session) {
      await finalizeProfile()
      setBusy(false)
      navigate(pathForRole(data.role), { replace: true })
      return
    }

    // Sinon, une session n'existe qu'après vérification du code SMS.
    setPending(data)
    setBusy(false)
    setStep('otp')
  }

  // ---------- Étape 3 : vérification du code SMS ----------
  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    if (!pending) return
    setError(null)
    setBusy(true)

    const { error: otpError } = await supabase.auth.verifyOtp({
      phone: pending.phone,
      token: otp,
      type: 'sms',
    })

    if (otpError) {
      setBusy(false)
      setError('Code invalide ou expiré. Réessayez.')
      return
    }

    await finalizeProfile()
    setBusy(false)
    navigate(pathForRole(pending.role), { replace: true })
  }

  return (
    <RedirectIfAuthenticated>
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-2xl font-bold text-teal-900">Créer un compte</h1>
        <p className="mb-6 text-gray-600">
          {role === 'professionnel'
            ? 'Inscription professionnel'
            : 'Inscription client'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <Field
            label="Numéro de téléphone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="90 00 00 00"
            hint="Format togolais : 8 chiffres, l'indicatif +228 est ajouté automatiquement."
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
          />
          <Field
            label="Mot de passe"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <Field
            label="Confirmer le mot de passe"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) =>
              setForm({ ...form, confirmPassword: e.target.value })
            }
            required
          />
          <Field
            label="Prénom / nom ou pseudo"
            type="text"
            autoComplete="name"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Ville"
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              required
            />
            <Field
              label="Quartier"
              type="text"
              value={form.neighborhood}
              onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
              required
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
              checked={form.acceptTerms}
              onChange={(e) =>
                setForm({ ...form, acceptTerms: e.target.checked })
              }
              required
            />
            <span>
              J'accepte les{' '}
              <Link to="/conditions" className="text-teal-700 underline">
                conditions d'utilisation
              </Link>{' '}
              et la{' '}
              <Link to="/confidentialite" className="text-teal-700 underline">
                politique de confidentialité
              </Link>
              .
            </span>
          </label>

          <Button type="submit" disabled={busy}>
            {busy ? 'Création…' : 'Créer mon compte'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Déjà inscrit ?{' '}
          <Link to="/connexion" className="text-teal-700 hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </RedirectIfAuthenticated>
  )
}
