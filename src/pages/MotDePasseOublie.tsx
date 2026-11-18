import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import { normalizeTogoPhone, formatTogoPhone } from '../lib/phone'
import { Alert, Button, Field } from '../components/ui'

// Récupération de compte par SMS :
// 1. envoi d'un code OTP sur le numéro (sans créer de compte) ;
// 2. vérification du code → session temporaire ;
// 3. définition d'un nouveau mot de passe.
type Step = 'phone' | 'otp' | 'password'

export default function MotDePasseOublie() {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('') // E.164 une fois validé
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-md">
        <Alert kind="info">
          La configuration Supabase n'est pas encore renseignée.
        </Alert>
      </div>
    )
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const e164 = normalizeTogoPhone(phone)
    if (!e164) {
      setError('Numéro invalide. Format attendu : 8 chiffres.')
      return
    }
    setBusy(true)
    // shouldCreateUser: false → erreur si le numéro n'a pas de compte.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: false },
    })
    setBusy(false)
    if (otpError) {
      setError('Envoi impossible : ' + otpError.message)
      return
    }
    setPhone(e164)
    setStep('otp')
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error: otpError } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    })
    setBusy(false)
    if (otpError) {
      setError('Code invalide ou expiré. Réessayez.')
      return
    }
    setStep('password')
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })
    setBusy(false)
    if (updateError) {
      setError('Impossible de modifier le mot de passe : ' + updateError.message)
      return
    }
    // On ferme la session de récupération : l'utilisateur se reconnectera.
    await supabase.auth.signOut()
    setDone(true)
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md text-center">
        <Alert kind="success">
          Votre mot de passe a été modifié. Vous pouvez maintenant vous
          connecter.
        </Alert>
        <p className="mt-4">
          <Link to="/connexion" className="text-teal-700 hover:underline">
            Aller à la connexion
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-bold text-teal-900">
        Mot de passe oublié
      </h1>

      {step === 'phone' && (
        <form onSubmit={sendCode} className="mt-6 space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field
            label="Numéro de téléphone"
            type="tel"
            inputMode="tel"
            placeholder="90 00 00 00"
            hint="Un code SMS sera envoyé pour vérifier votre identité."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            {busy ? 'Envoi…' : 'Recevoir un code'}
          </Button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={verifyCode} className="mt-6 space-y-4">
          {error && <Alert>{error}</Alert>}
          <p className="text-sm text-gray-600">
            Code envoyé au <strong>{formatTogoPhone(phone)}</strong>
          </p>
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
          <button
            type="button"
            className="w-full text-center text-sm text-teal-700 hover:underline"
            onClick={() => {
              setStep('phone')
              setError(null)
            }}
          >
            Changer de numéro
          </button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={savePassword} className="mt-6 space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Field
            label="Confirmer le mot de passe"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link to="/connexion" className="text-teal-700 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  )
}
