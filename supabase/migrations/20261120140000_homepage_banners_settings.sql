-- ============================================================
-- Bannières de la page d'accueil (collage animé du hero)
-- et réglages applicatifs simples (key/value).
-- ============================================================

-- ---------- Table homepage_banners ----------
-- Images envoyées par l'administrateur (URL ou chemin Storage).

create table if not exists public.homepage_banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  alt text,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.homepage_banners is
  'Bannières photos affichées en collage sur la page d''accueil.';

alter table public.homepage_banners enable row level security;

-- Lecture publique des bannières actives (accueil non authentifié).
drop policy if exists homepage_banners_select_public on public.homepage_banners;
create policy homepage_banners_select_public on public.homepage_banners
  for select to anon, authenticated
  using (is_active);

-- ---------- Table app_settings ----------
-- Réglages clé/valeur lisibles par l'application.
-- NE PAS y stocker de secret (lisible publiquement).

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is
  'Réglages applicatifs clé/valeur (lecture publique, pas de secrets).';

alter table public.app_settings enable row level security;

-- Lecture publique des réglages.
drop policy if exists app_settings_select_public on public.app_settings;
create policy app_settings_select_public on public.app_settings
  for select to anon, authenticated
  using (true);

-- Réglage animations_actives : 'true' (défaut) ou 'false'.
insert into public.app_settings (key, value)
values ('animations_actives', 'true')
on conflict (key) do nothing;
