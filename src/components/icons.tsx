import type { ReactNode } from 'react'

// Icônes SVG inline (stroke, style heroicons) — aucune image externe,
// léger en faible connexion. `name` vient de categories.icon ;
// toute clé inconnue retombe sur 'grid'.

const PATHS: Record<string, ReactNode> = {
  // Catégories de services
  zap: <path d="M13 2 3 14h9l-1 8 11-13h-9l1-7z" />,
  droplets: <path d="M12 2.7s6.5 7 6.5 11.3a6.5 6.5 0 1 1-13 0C5.5 9.7 12 2.7 12 2.7z" />,
  snowflake: (
    <>
      <path d="M12 2v20" />
      <path d="m3.3 7 17.4 10" />
      <path d="M20.7 7 3.3 17" />
    </>
  ),
  hammer: (
    <>
      <path d="m14 4 6 6" />
      <path d="m11.5 6.5 6 6" />
      <path d="m9 13-5.5 5.5a1.4 1.4 0 0 0 2 2L13 15" />
      <path d="m13 11 3 3" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L4 16.6 7.4 20l4.7-4.7a4.5 4.5 0 0 0 5.6-6l-3 3-2.5-.5-.5-2.5 3-3z" />
  ),
  'paint-roller': (
    <>
      <rect x="3" y="4" width="7" height="5" rx="1" />
      <path d="M10 6.5h11v3H10z" />
      <path d="M16.5 9.5v4a3 3 0 0 1-3 3H12" />
    </>
  ),
  home: (
    <>
      <path d="m3 10.5 9-7.5 9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 9.5 10.5 4.5 20 4.5 20 14 14.5 19.5 5 19z" />
      <path d="M5 19c2.5-4.5 6-7.5 10-9" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="4.5" />
      <path d="m11 12.5 8.5-8.5M17 6l2.5 2.5M14.5 8.5 17 11" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 6.5h12V17h-12z" />
      <path d="M14.5 10h4l3 3v4h-7" />
      <circle cx="6.5" cy="18.5" r="1.8" />
      <circle cx="17.5" cy="18.5" r="1.8" />
    </>
  ),
  smartphone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  // Interface
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.8 19.5 6v5.7c0 4.7-3.2 8-7.5 9.5-4.3-1.5-7.5-4.8-7.5-9.5V6L12 2.8z" />
      <path d="m9 11.8 2.2 2.2 4-4.2" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="10" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" />
      <path d="M4.5 17v2.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V17" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'map-pin': (
    <>
      <path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  'arrow-right': <path d="M4 12h15m0 0-6-6m6 6-6 6" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4.5 18.5 5-5 3.5 3.5 3-3 4 4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </>
  ),
  star: (
    <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
  ),
}

export function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.grid}
    </svg>
  )
}
