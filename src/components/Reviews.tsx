import { Icon } from './icons'

// Note en étoiles (1 à 5). Affichage seul si `value` fourni,
// sinon la note est arrondie à l'affichage.
export function Stars({
  value,
  onChange,
  size = 'h-5 w-5',
}: {
  value: number
  onChange?: (v: number) => void
  size?: string
}) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Note : ${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
        >
          <Icon
            name="star"
            className={`${size} ${
              n <= Math.round(value)
                ? 'fill-amber-400 text-amber-400'
                : 'text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

// Ajoute l'icône étoile au set SVG.
