import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

// Bouton réutilisable, stylé mobile-first.
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}) {
  const styles = {
    primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-300',
    secondary:
      'bg-white text-teal-800 border border-teal-700 hover:bg-teal-50 disabled:text-teal-300 disabled:border-teal-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-teal-800 hover:bg-teal-50',
  }[variant]
  return (
    <button
      className={`w-full rounded-lg px-4 py-3 text-base font-medium transition disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  )
}

// Champ de formulaire avec label.
export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </span>
      <input
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  )
}

// Message d'erreur ou d'information.
export function Alert({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'info' | 'success'
  children: ReactNode
}) {
  const styles = {
    error: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    success: 'bg-green-50 text-green-800 border-green-200',
  }[kind]
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  )
}

// État vide générique quand il n'y a rien à afficher.
export function EmptyState({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
      <p className="text-lg font-medium text-gray-700">{title}</p>
      {children && <div className="mt-2 text-sm text-gray-500">{children}</div>}
    </div>
  )
}

// Écran de chargement centré.
export function LoadingScreen({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-gray-500">{label}</p>
    </div>
  )
}
