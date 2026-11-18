-- ============================================================
-- Togo Intervention — Phase 1 : profils et rôles
-- Crée les enums, la table profiles, les triggers et les politiques RLS.
-- AUCUNE donnée n'est insérée par cette migration.
-- ============================================================

-- ---------- Types ----------

create type public.user_role as enum (
  'client',
  'professionnel',
  'administrateur',
  'moderateur'
);

create type public.account_status as enum ('actif', 'suspendu');

-- ---------- Table profiles ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  phone text,
  phone_verified boolean not null default false,
  display_name text,
  city text,
  neighborhood text,
  status public.account_status not null default 'actif',
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Profil public de chaque utilisateur, lié 1:1 à auth.users.';

alter table public.profiles enable row level security;

-- ---------- Fonctions utilitaires (SECURITY DEFINER pour éviter la
-- récursion RLS sur la table profiles) ----------

-- Vrai si l'utilisateur courant est administrateur.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrateur'
  );
$$;

-- Vrai si l'utilisateur courant est admin ou modérateur.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('administrateur', 'moderateur')
  );
$$;

-- ---------- Trigger : création du profil à l'inscription ----------
-- Lit les métadonnées envoyées par supabase.auth.signUp() :
--   role : whitelist 'client' | 'professionnel' (tout le reste → client)
--   display_name, city, neighborhood
-- Le rôle administrateur/moderateur ne peut PAS être créé par ce chemin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  v_role := case
    when new.raw_user_meta_data ->> 'role' = 'professionnel'
      then 'professionnel'::public.user_role
    else 'client'::public.user_role
  end;

  insert into public.profiles (
    id, role, phone, display_name, city, neighborhood
  ) values (
    new.id,
    v_role,
    new.phone,
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'city',
    new.raw_user_meta_data ->> 'neighborhood'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Trigger : synchronise phone_verified ----------
-- Quand Supabase confirme le téléphone (auth.users.phone_confirmed_at),
-- on reflète la vérification dans le profil.
create or replace function public.sync_phone_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone_confirmed_at is not null
     and old.phone_confirmed_at is null then
    update public.profiles
      set phone_verified = true
      where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_phone_confirmed
  after update of phone_confirmed_at on auth.users
  for each row execute function public.sync_phone_verified();

-- ---------- Trigger : champs protégés ----------
-- Un utilisateur ne peut JAMAIS modifier lui-même :
-- role, status, phone_verified (seul un admin peut le faire).
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.phone_verified is distinct from old.phone_verified)
     and not public.is_admin() then
    raise exception 'Modification interdite des champs role, status ou phone_verified';
  end if;
  return new;
end;
$$;

create trigger protect_profile_fields_trg
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------- Politiques RLS ----------

-- Lecture : son propre profil.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- Lecture : tous les profils pour admin et modérateur.
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (public.is_staff());

-- Modification : son propre profil (les champs sensibles restent
-- protégés par le trigger protect_profile_fields).
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Modification complète (role, status…) : administrateur uniquement.
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
