-- ============================================================
-- Phase 2 : catalogue des métiers et profils professionnels.
-- AUCUNE donnée insérée : le contenu est géré via le SQL.
-- ============================================================

-- ---------- Types ----------

do $$
begin
  create type public.disponibilite_pro as enum ('immediat', 'sur_rdv');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.niveau_experience as enum ('debutant', 'confirme', 'expert');
exception when duplicate_object then null;
end $$;

-- ---------- Table metiers ----------

create table if not exists public.metiers (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.metiers is
  'Métiers rattachés à une catégorie (ex. dépannage électrique).';

create unique index if not exists metiers_category_name_key
  on public.metiers (category_id, name);
create index if not exists metiers_category_idx
  on public.metiers (category_id) where is_active;

alter table public.metiers enable row level security;

drop policy if exists metiers_select_public on public.metiers;
create policy metiers_select_public on public.metiers
  for select to anon, authenticated
  using (is_active);

drop policy if exists metiers_write_admin on public.metiers;
create policy metiers_write_admin on public.metiers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Table professional_profiles ----------
-- Profil pro 1:1 avec profiles (role = 'professionnel').
-- est_visible = false par défaut : invisible tant que l'admin ne l'active pas.
-- latitude/longitude : JAMAIS exposées au navigateur (pas dans la vue
-- publique ni dans les résultats de recherche).

create table if not exists public.professional_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  nom_commercial text,
  bio text,
  photo_url text,
  ville text,
  quartier text,
  latitude double precision,
  longitude double precision,
  rayon_km numeric(6, 1) check (rayon_km is null or rayon_km > 0),
  tarif_indicatif text,
  disponibilite public.disponibilite_pro,
  niveau public.niveau_experience,
  identite_verifiee boolean not null default false,
  est_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.professional_profiles is
  'Profil professionnel public (visibilité admin, coordonnées confidentielles).';

create index if not exists professional_profiles_visible_idx
  on public.professional_profiles (est_visible) where est_visible;
create index if not exists professional_profiles_ville_idx
  on public.professional_profiles (ville);

alter table public.professional_profiles enable row level security;

-- Lecture : son propre profil.
drop policy if exists professional_profiles_select_own on public.professional_profiles;
create policy professional_profiles_select_own on public.professional_profiles
  for select to authenticated
  using (id = auth.uid());

-- Lecture : staff.
drop policy if exists professional_profiles_select_staff on public.professional_profiles;
create policy professional_profiles_select_staff on public.professional_profiles
  for select to authenticated
  using (public.is_staff());

-- Création / modification : soi-même (champs sensibles protégés par trigger).
drop policy if exists professional_profiles_insert_own on public.professional_profiles;
create policy professional_profiles_insert_own on public.professional_profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists professional_profiles_update_own on public.professional_profiles;
create policy professional_profiles_update_own on public.professional_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Administration complète.
drop policy if exists professional_profiles_admin on public.professional_profiles;
create policy professional_profiles_admin on public.professional_profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Champs réservés à l'admin : est_visible, identite_verifiee.
create or replace function public.protect_professional_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.est_visible is distinct from old.est_visible
      or new.identite_verifiee is distinct from old.identite_verifiee)
     and not public.is_admin() then
    raise exception 'Modification interdite des champs est_visible ou identite_verifiee';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_professional_fields_trg on public.professional_profiles;
create trigger protect_professional_fields_trg
  before update on public.professional_profiles
  for each row execute function public.protect_professional_fields();

-- ---------- Table professional_metiers ----------
-- Métiers exercés par un professionnel (le profil garde un métier
-- principal implicite via le premier lien, l'affichage utilise la liste).

create table if not exists public.professional_metiers (
  professional_id uuid not null
    references public.professional_profiles (id) on delete cascade,
  metier_id uuid not null references public.metiers (id) on delete cascade,
  primary key (professional_id, metier_id)
);

comment on table public.professional_metiers is
  'Métiers exercés par chaque professionnel (plusieurs possibles).';

create index if not exists professional_metiers_metier_idx
  on public.professional_metiers (metier_id);

alter table public.professional_metiers enable row level security;

-- Lecture publique (noms de métiers, pas de donnée sensible).
drop policy if exists professional_metiers_select_public on public.professional_metiers;
create policy professional_metiers_select_public on public.professional_metiers
  for select to anon, authenticated
  using (true);

-- Gestion par le professionnel concerné ou un admin.
drop policy if exists professional_metiers_write on public.professional_metiers;
create policy professional_metiers_write on public.professional_metiers
  for all to authenticated
  using (professional_id = auth.uid() or public.is_admin())
  with check (professional_id = auth.uid() or public.is_admin());

-- ---------- Vue publique ----------
-- Expose uniquement les champs publics : AUCUNE coordonnée.

create or replace view public.professionals_public as
select
  pp.id,
  coalesce(nullif(pp.nom_commercial, ''), p.display_name) as nom_affiche,
  pp.photo_url,
  coalesce(pp.ville, p.city) as ville,
  coalesce(pp.quartier, p.neighborhood) as quartier,
  pp.rayon_km,
  pp.tarif_indicatif,
  pp.disponibilite::text as disponibilite,
  pp.niveau::text as niveau,
  p.phone_verified as numero_verifie,
  pp.identite_verifiee,
  (select string_agg(m.name, ', ' order by m.position, m.name)
     from public.professional_metiers pm
     join public.metiers m on m.id = pm.metier_id
    where pm.professional_id = pp.id and m.is_active) as metiers
from public.professional_profiles pp
join public.profiles p on p.id = pp.id
where pp.est_visible
  and p.status = 'actif'
  and p.role = 'professionnel';

comment on view public.professionals_public is
  'Vue publique des professionnels visibles : aucune coordonnée exposée.';

grant select on public.professionals_public to anon, authenticated;
