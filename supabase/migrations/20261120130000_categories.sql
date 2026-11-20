-- ============================================================
-- Catégories de services affichées sur l'accueil.
-- AUCUNE donnée n'est insérée : le contenu est géré via le SQL.
-- ============================================================

-- ---------- Type ----------

do $$
begin
  create type public.project_type as enum (
    'reparation',
    'construction_renovation',
    'entretien',
    'services_domicile'
  );
exception when duplicate_object then null;
end $$;

-- ---------- Table ----------

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  -- Clé d'icône reconnue par l'application (ex. 'zap', 'droplets'…).
  icon text,
  project_type public.project_type not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.categories is
  'Catégories de services affichées sur l''accueil et filtrées par type de projet.';

alter table public.categories enable row level security;

-- ---------- Politique RLS ----------
-- Lecture publique des catégories actives : la page d'accueil
-- n'est pas authentifiée.

drop policy if exists categories_select_public on public.categories;
create policy categories_select_public on public.categories
  for select to anon, authenticated
  using (is_active);
