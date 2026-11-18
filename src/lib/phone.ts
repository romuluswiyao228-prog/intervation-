// Utilitaires pour les numéros de téléphone togolais (+228).

const TOGO_PREFIX = '+228'

/**
 * Normalise une saisie en numéro E.164 togolais.
 * Accepte : 8 chiffres locaux, 228XXXXXXXX, +228XXXXXXXX, avec ou sans espaces/tirets.
 * Retourne null si le format est invalide.
 */
export function normalizeTogoPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '')
  let national: string

  if (digits.startsWith(TOGO_PREFIX)) {
    national = digits.slice(TOGO_PREFIX.length)
  } else if (digits.startsWith('228')) {
    national = digits.slice(3)
  } else {
    national = digits
  }

  // Un numéro togolais national fait exactement 8 chiffres.
  if (!/^\d{8}$/.test(national)) return null
  return TOGO_PREFIX + national
}

/** true si la saisie correspond à un numéro togolais valide. */
export function isValidTogoPhone(input: string): boolean {
  return normalizeTogoPhone(input) !== null
}

/** Affiche un numéro de façon lisible : +228 90 00 00 00 */
export function formatTogoPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (!digits.startsWith('228') || digits.length !== 11) return e164
  const n = digits.slice(3)
  return `+228 ${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)}`
}
