import type { Category } from '../lib/types'
import { Icon } from './icons'

// Carte catégorie : icône SVG + nom (+ description courte si renseignée).
export default function CategoryCard({ category }: { category: Category }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm transition hover:border-blue-300 hover:shadow">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
        <Icon name={category.icon ?? 'grid'} className="h-6 w-6" />
      </span>
      <span className="text-sm font-medium text-gray-900">{category.name}</span>
      {category.description && (
        <span className="line-clamp-2 text-xs text-gray-500">
          {category.description}
        </span>
      )}
    </div>
  )
}
