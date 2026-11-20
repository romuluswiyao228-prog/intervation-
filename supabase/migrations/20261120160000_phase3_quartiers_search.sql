-- ============================================================
-- Phase 3 : quartiers, recherche de professionnels.
-- Les coordonnées des professionnels ne quittent JAMAIS la base :
-- search_professionals ne retourne que la distance arrondie par paliers.
-- ============================================================

-- ---------- Extension unaccent (recherche sans accents) ----------

create extension if not exists unaccent with schema public;

-- ---------- Table quartiers ----------
-- Remplie par l'administrateur. Sert à convertir un quartier saisi
-- en coordonnées pour la recherche par proximité.

create table if not exists public.quartiers (
  id uuid primary key default gen_random_uuid(),
  ville text not null,
  nom text not null,
  latitude double precision not null,
  longitude double precision not null,
  est_actif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ville, nom)
);

comment on table public.quartiers is
  'Quartiers de référence (coordonnées) pour la recherche par proximité.';

create index if not exists quartiers_actif_idx
  on public.quartiers (est_actif) where est_actif;
create index if not exists quartiers_nom_idx
  on public.quartiers (nom);

alter table public.quartiers enable row level security;

-- Lecture publique des quartiers actifs.
drop policy if exists quartiers_select_public on public.quartiers;
create policy quartiers_select_public on public.quartiers
  for select to anon, authenticated
  using (est_actif);

-- Écriture : admin uniquement.
drop policy if exists quartiers_write_admin on public.quartiers;
create policy quartiers_write_admin on public.quartiers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Index recherche ----------

create index if not exists professional_metiers_prof_idx
  on public.professional_metiers (professional_id);

-- ---------- Fonction search_professionals ----------
-- Retourne uniquement des champs publics + distance arrondie.
-- p_elargir = true : ignore le rayon d'intervention (mode « élargir »).

create or replace function public.search_professionals(
  p_search text default null,
  p_metier_id uuid default null,
  p_category_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_ville text default null,
  p_quartier text default null,
  p_disponibilite text default null,
  p_niveau text default null,
  p_verification_min integer default 0,
  p_tri text default 'proximite',
  p_limit integer default 12,
  p_offset integer default 0,
  p_elargir boolean default false
)
returns table (
  profile_id uuid,
  nom_affiche text,
  photo_url text,
  ville text,
  quartier text,
  metiers text,
  niveau text,
  disponibilite text,
  tarif_indicatif text,
  rayon_km numeric,
  numero_verifie boolean,
  identite_verifiee boolean,
  distance_approxe_km numeric,
  dans_rayon boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 20);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_q text;
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
begin
  -- Quartier saisi → coordonnées via la table quartiers
  -- (uniquement si aucune position navigateur fournie).
  if v_lat is null and v_lng is null and p_quartier is not null then
    select q.latitude, q.longitude into v_lat, v_lng
    from public.quartiers q
    where q.est_actif
      and unaccent(lower(q.nom)) = unaccent(lower(trim(p_quartier)))
      and (p_ville is null
           or unaccent(lower(q.ville)) = unaccent(lower(trim(p_ville))))
    order by case when p_ville is not null then 0 else 1 end
    limit 1;
  end if;

  v_q := case
    when p_search is null or btrim(p_search) = '' then null
    else '%' || unaccent(lower(btrim(p_search))) || '%'
  end;

  return query
  with eligibles as (
    select
      pp.id as profile_id,
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
      mets.metiers,
      mets.nb_metiers,
      (pp.photo_url is not null)::int
        + (pp.tarif_indicatif is not null)::int
        + (pp.bio is not null)::int
        + (pp.rayon_km is not null)::int
        + least(mets.nb_metiers, 1) as completude,
      case
        when v_lat is not null and v_lng is not null
             and pp.latitude is not null and pp.longitude is not null
        then 6371.0 * 2 * asin(sqrt(
          power(sin(radians(pp.latitude - v_lat) / 2), 2)
          + cos(radians(v_lat)) * cos(radians(pp.latitude))
            * power(sin(radians(pp.longitude - v_lng) / 2), 2)
        ))
      end as distance_km
    from public.professional_profiles pp
    join public.profiles p on p.id = pp.id
    left join lateral (
      select
        string_agg(m.name, ', ' order by m.position, m.name) as metiers,
        count(*) as nb_metiers
      from public.professional_metiers pm
      join public.metiers m on m.id = pm.metier_id
      where pm.professional_id = pp.id and m.is_active
    ) mets on true
    where pp.est_visible
      and p.status = 'actif'
      and p.role = 'professionnel'
      -- Recherche texte sans accents ni casse : nom commercial,
      -- nom de métier, nom de catégorie.
      and (v_q is null
           or unaccent(lower(coalesce(pp.nom_commercial, ''))) like v_q
           or unaccent(lower(coalesce(p.display_name, ''))) like v_q
           or exists (
             select 1
             from public.professional_metiers pm2
             join public.metiers m2 on m2.id = pm2.metier_id
             where pm2.professional_id = pp.id and m2.is_active
               and unaccent(lower(m2.name)) like v_q)
           or exists (
             select 1
             from public.professional_metiers pm3
             join public.metiers m3 on m3.id = pm3.metier_id
             join public.categories c3 on c3.id = m3.category_id
             where pm3.professional_id = pp.id and m3.is_active
               and unaccent(lower(c3.name)) like v_q))
      and (p_metier_id is null or exists (
            select 1 from public.professional_metiers pm4
            where pm4.professional_id = pp.id and pm4.metier_id = p_metier_id))
      and (p_category_id is null or exists (
            select 1 from public.professional_metiers pm5
            join public.metiers m5 on m5.id = pm5.metier_id
            where pm5.professional_id = pp.id
              and m5.category_id = p_category_id and m5.is_active))
      and (p_disponibilite is null
           or pp.disponibilite::text = p_disponibilite)
      and (p_niveau is null or pp.niveau::text = p_niveau)
      and (coalesce(p_verification_min, 0) <= 0
           or (case when pp.identite_verifiee then 2
                    when p.phone_verified then 1
                    else 0 end) >= p_verification_min)
      and (p_ville is null
           or unaccent(lower(coalesce(pp.ville, p.city, '')))
              like '%' || unaccent(lower(p_ville)) || '%')
      and (p_quartier is null
           or unaccent(lower(coalesce(pp.quartier, p.neighborhood, '')))
              like '%' || unaccent(lower(p_quartier)) || '%')
  ),
  scores as (
    select e.*,
      -- Distance arrondie par paliers (jamais exacte).
      case
        when e.distance_km is null then null
        when e.distance_km < 1 then 0
        when e.distance_km < 1.5 then 1
        when e.distance_km < 2.5 then 2
        when e.distance_km < 4 then 3
        when e.distance_km < 6 then 5
        when e.distance_km < 10 then 8
        when e.distance_km < 15 then 12
        when e.distance_km < 25 then 20
        when e.distance_km < 40 then 30
        when e.distance_km < 65 then 50
        when e.distance_km < 90 then 80
        else 100
      end as distance_approxe_km,
      -- Rayon respecté : sans distance calculable, considéré comme OK
      -- (le professionnel sera classé après ceux géolocalisés).
      (e.distance_km is null
       or e.rayon_km is null
       or e.distance_km <= e.rayon_km) as dans_rayon
    from eligibles e
    where p_elargir
       or e.distance_km is null
       or e.rayon_km is null
       or e.distance_km <= e.rayon_km
  )
  select
    s.profile_id,
    s.nom_affiche,
    s.photo_url,
    s.ville,
    s.quartier,
    s.metiers,
    s.niveau,
    s.disponibilite,
    s.tarif_indicatif,
    s.rayon_km,
    s.numero_verifie,
    s.identite_verifiee,
    s.distance_approxe_km,
    s.dans_rayon,
    count(*) over () as total_count
  from scores s
  order by
    -- Tri « proximite » : distance d'abord, puis disponibilité.
    case when p_tri = 'proximite'
         then coalesce(s.distance_km, 'Infinity'::float8) else 0 end,
    case when p_tri = 'proximite'
         then case s.disponibilite
                when 'immediat' then 0
                when 'sur_rdv' then 1
                else 2 end
         else -1 end,
    -- Tri « verification » : niveau de vérification puis complétude.
    case when p_tri = 'verification'
         then -(case when s.identite_verifiee then 2
                     when s.numero_verifie then 1
                     else 0 end)
         else 0 end,
    case when p_tri = 'verification' then -s.completude else 0 end,
    -- Tri « profil » : complétude puis vérification.
    case when p_tri = 'profil' then -s.completude else 0 end,
    case when p_tri = 'profil'
         then -(case when s.identite_verifiee then 2
                     when s.numero_verifie then 1
                     else 0 end)
         else 0 end,
    -- Queue commune : distance, vérification, complétude.
    coalesce(s.distance_km, 'Infinity'::float8),
    -(case when s.identite_verifiee then 2
           when s.numero_verifie then 1
           else 0 end),
    -s.completude,
    s.nom_affiche
  limit v_limit offset v_offset;
end;
$$;

comment on function public.search_professionals is
  'Recherche publique de professionnels : champs publics uniquement, '
  'distance arrondie par paliers, jamais de coordonnées exposées.';

grant execute on function public.search_professionals to anon, authenticated;
