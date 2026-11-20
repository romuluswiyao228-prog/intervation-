-- ============================================================
-- Phase 6 : interventions, confirmation, coordonnées, avis.
-- Téléphone/adresse révélés uniquement via fonction SECURITY DEFINER
-- aux participants d'une intervention confirmée ou terminée,
-- chaque révélation journalisée dans contact_reveals.
-- ============================================================

-- ---------- Types ----------

do $$
begin
  create type public.intervention_statut as enum (
    'proposee', 'confirmee', 'terminee', 'annulee', 'refusee'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.review_statut as enum ('visible', 'masque');
exception when duplicate_object then null;
end $$;

-- Les signalements acceptent désormais un avis comme cible.
alter type public.report_cible add value if not exists 'avis';

-- ---------- Tables ----------

create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  client_id uuid not null references auth.users (id),
  professional_id uuid not null references auth.users (id),
  metier_id uuid references public.metiers (id),
  description text not null,
  date_prevue date,
  statut public.intervention_statut not null default 'proposee',
  proposee_par uuid not null references auth.users (id),
  -- Saisie par le client à la confirmation ; visible par le
  -- professionnel concerné et le client (jamais publiquement).
  adresse_exacte text,
  pro_terminee_le timestamptz,
  created_at timestamptz not null default now(),
  confirmee_le timestamptz,
  terminee_le timestamptz,
  annulee_le timestamptz,
  motif_annulation text
);

comment on table public.interventions is
  'Interventions proposées en conversation ; aucune écriture directe.';

create index if not exists interventions_conv_idx
  on public.interventions (conversation_id);
create index if not exists interventions_client_idx
  on public.interventions (client_id);
create index if not exists interventions_pro_idx
  on public.interventions (professional_id);

alter table public.interventions enable row level security;

-- Lecture : participants + staff. Aucune policy d'écriture :
-- tout passe par les fonctions SECURITY DEFINER ci-dessous.
drop policy if exists interventions_select on public.interventions;
create policy interventions_select on public.interventions
  for select to authenticated
  using (auth.uid() in (client_id, professional_id) or public.is_staff());

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null unique
    references public.interventions (id) on delete cascade,
  client_id uuid not null references auth.users (id),
  professional_id uuid not null references auth.users (id),
  note_qualite smallint not null check (note_qualite between 1 and 5),
  note_ponctualite smallint not null check (note_ponctualite between 1 and 5),
  note_professionnalisme smallint not null check (note_professionnalisme between 1 and 5),
  note_rapport_prix smallint not null check (note_rapport_prix between 1 and 5),
  note_globale numeric generated always as (
    (note_qualite + note_ponctualite + note_professionnalisme
     + note_rapport_prix) / 4.0
  ) stored,
  commentaire text check (commentaire is null or char_length(commentaire) <= 1000),
  statut public.review_statut not null default 'visible',
  masque_par uuid references auth.users (id),
  motif_masque text,
  created_at timestamptz not null default now()
);

comment on table public.reviews is
  'Un seul avis par intervention terminée ; immuable hors masquage staff.';

create index if not exists reviews_pro_idx on public.reviews (professional_id);
create index if not exists reviews_statut_idx on public.reviews (statut);

alter table public.reviews enable row level security;

-- Lecture : avis visibles pour tous, masqués pour le staff uniquement.
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select to anon, authenticated
  using (statut = 'visible' or public.is_staff());

-- Création : uniquement le client d'une intervention terminée,
-- une seule fois (contrainte unique sur intervention_id).
drop policy if exists reviews_insert_client on public.reviews;
create policy reviews_insert_client on public.reviews
  for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.interventions i
      where i.id = intervention_id
        and i.client_id = auth.uid()
        and i.statut = 'terminee'
        and i.professional_id = professional_id
    )
  );

-- Pas de modification ni suppression directe : le masquage passe
-- par admin_set_review_visibility (SECURITY DEFINER).

create table if not exists public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique
    references public.reviews (id) on delete cascade,
  professional_id uuid not null references auth.users (id),
  texte text not null check (char_length(texte) <= 1000),
  created_at timestamptz not null default now()
);

comment on table public.review_replies is
  'Une seule réponse du professionnel par avis.';

alter table public.review_replies enable row level security;

-- Lecture publique si l'avis est visible ; staff voit tout.
drop policy if exists review_replies_select on public.review_replies;
create policy review_replies_select on public.review_replies
  for select to anon, authenticated
  using (exists (
    select 1 from public.reviews r
    where r.id = review_id
      and (r.statut = 'visible' or public.is_staff())
  ));

-- Création : uniquement le professionnel concerné par l'avis.
drop policy if exists review_replies_insert_pro on public.review_replies;
create policy review_replies_insert_pro on public.review_replies
  for insert to authenticated
  with check (
    professional_id = auth.uid()
    and exists (
      select 1 from public.reviews r
      where r.id = review_id
        and r.professional_id = auth.uid()
        and r.statut = 'visible'
    )
  );

create table if not exists public.contact_reveals (
  id bigint generated always as identity primary key,
  intervention_id uuid not null
    references public.interventions (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.contact_reveals is
  'Journal des révélations de coordonnées (staff uniquement).';

create index if not exists contact_reveals_idx
  on public.contact_reveals (intervention_id);

alter table public.contact_reveals enable row level security;

-- Lecture : staff uniquement. Aucune écriture directe :
-- la fonction get_intervention_contact journalise.
drop policy if exists contact_reveals_select_staff on public.contact_reveals;
create policy contact_reveals_select_staff on public.contact_reveals
  for select to authenticated
  using (public.is_staff());

-- Note moyenne et nombre d'avis sur le profil professionnel
-- (mis à jour par trigger à partir des avis visibles uniquement).
alter table public.professional_profiles
  add column if not exists note_moyenne numeric,
  add column if not exists nombre_avis integer not null default 0;

-- ============================================================
-- Fonctions du cycle de vie des interventions
-- ============================================================

-- Propose une intervention dans une conversation ouverte.
create or replace function public.propose_intervention(
  p_conversation_id uuid,
  p_metier_id uuid,
  p_description text,
  p_date_prevue date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_id uuid;
  v_count integer;
  v_other uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.';
  end if;
  if p_description is null or btrim(p_description) = '' then
    raise exception 'La description est obligatoire.';
  end if;
  if char_length(p_description) > 2000 then
    raise exception 'Description trop longue (2000 caractères max).';
  end if;

  select * into v_conv from public.conversations
    where id = p_conversation_id;
  if not found then
    raise exception 'Conversation introuvable.';
  end if;
  if auth.uid() <> v_conv.client_id and auth.uid() <> v_conv.professional_id then
    raise exception 'Vous n''êtes pas participant à cette conversation.';
  end if;
  if v_conv.statut <> 'ouverte' then
    raise exception 'Cette conversation est fermée.';
  end if;
  if auth.uid() = v_conv.client_id then
    v_other := v_conv.professional_id;
  else
    v_other := v_conv.client_id;
  end if;
  if public.is_account_suspended(auth.uid())
     or public.is_account_suspended(v_other) then
    raise exception 'Un des comptes est suspendu : proposition impossible.';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_conv.client_id and b.blocked_id = v_conv.professional_id)
       or (b.blocker_id = v_conv.professional_id and b.blocked_id = v_conv.client_id)
  ) then
    raise exception 'Un des participants a bloqué l''autre.';
  end if;
  -- Une seule intervention en cours par conversation.
  if exists (
    select 1 from public.interventions i
    where i.conversation_id = p_conversation_id
      and i.statut in ('proposee', 'confirmee')
  ) then
    raise exception 'Une intervention est déjà en cours dans cette conversation.';
  end if;
  -- Limite : 10 propositions par jour et par utilisateur.
  select count(*) into v_count from public.interventions i
    where i.proposee_par = auth.uid()
      and i.created_at > now() - interval '1 day';
  if v_count >= 10 then
    raise exception 'Limite de propositions atteinte pour aujourd''hui.';
  end if;

  insert into public.interventions
    (conversation_id, client_id, professional_id, metier_id,
     description, date_prevue, proposee_par)
  values (
    p_conversation_id, v_conv.client_id, v_conv.professional_id,
    p_metier_id, btrim(p_description), p_date_prevue, auth.uid()
  )
  returning id into v_id;

  -- Notification à l'autre partie.
  insert into public.notifications (user_id, type, conversation_id)
  values (v_other, 'intervention_proposee', p_conversation_id);

  return v_id;
end;
$$;

grant execute on function public.propose_intervention(uuid, uuid, text, date)
  to authenticated;

-- Accepte ou refuse une proposition : seule l'autre partie peut répondre.
-- À l'acceptation, le client peut fournir l'adresse exacte.
create or replace function public.respond_intervention(
  p_intervention_id uuid,
  p_accepter boolean,
  p_adresse_exacte text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.interventions%rowtype;
  v_other uuid;
begin
  select * into v_i from public.interventions where id = p_intervention_id;
  if not found then
    raise exception 'Intervention introuvable.';
  end if;
  if auth.uid() not in (v_i.client_id, v_i.professional_id) then
    raise exception 'Vous n''êtesz pas concerné par cette intervention.';
  end if;
  if auth.uid() = v_i.proposee_par then
    raise exception 'Seule l''autre partie peut répondre à la proposition.';
  end if;
  if v_i.statut <> 'proposee' then
    raise exception 'Cette proposition a déjà reçu une réponse.';
  end if;
  if public.is_account_suspended(auth.uid()) then
    raise exception 'Votre compte est suspendu.';
  end if;

  if p_accepter then
    update public.interventions
      set statut = 'confirmee',
          confirmee_le = now(),
          adresse_exacte = case
            when auth.uid() = client_id and p_adresse_exacte is not null
              then btrim(p_adresse_exacte)
            else adresse_exacte end
      where id = p_intervention_id;
    v_other := v_i.proposee_par;
    insert into public.notifications (user_id, type, conversation_id)
    values (v_other, 'intervention_confirmee', v_i.conversation_id);
  else
    update public.interventions
      set statut = 'refusee'
      where id = p_intervention_id;
    v_other := v_i.proposee_par;
    insert into public.notifications (user_id, type, conversation_id)
    values (v_other, 'intervention_refusee', v_i.conversation_id);
  end if;
end;
$$;

grant execute on function public.respond_intervention(uuid, boolean, text)
  to authenticated;

-- Le client peut compléter/corriger l'adresse exacte tant que
-- l'intervention n'est pas terminée ni annulée.
create or replace function public.set_intervention_address(
  p_intervention_id uuid,
  p_adresse text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.interventions%rowtype;
begin
  select * into v_i from public.interventions where id = p_intervention_id;
  if not found or auth.uid() <> v_i.client_id then
    raise exception 'Action non autorisée.';
  end if;
  if v_i.statut not in ('confirmee', 'proposee') then
    raise exception 'Adresse modifiable uniquement avant la fin de l''intervention.';
  end if;
  update public.interventions
    set adresse_exacte = nullif(btrim(coalesce(p_adresse, '')), '')
    where id = p_intervention_id;
end;
$$;

grant execute on function public.set_intervention_address(uuid, text)
  to authenticated;

-- Le professionnel marque l'intervention comme effectuée :
-- le client doit ensuite confirmer pour passer à 'terminee'.
create or replace function public.pro_mark_intervention_done(
  p_intervention_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.interventions%rowtype;
begin
  select * into v_i from public.interventions where id = p_intervention_id;
  if not found or auth.uid() <> v_i.professional_id then
    raise exception 'Action non autorisée.';
  end if;
  if v_i.statut <> 'confirmee' or v_i.pro_terminee_le is not null then
    raise exception 'Action impossible dans l''état actuel.';
  end if;

  update public.interventions
    set pro_terminee_le = now()
    where id = p_intervention_id;

  insert into public.notifications (user_id, type, conversation_id)
  values (v_i.client_id, 'intervention_a_confirmer', v_i.conversation_id);
end;
$$;

grant execute on function public.pro_mark_intervention_done(uuid)
  to authenticated;

-- Le client confirme la fin : passage à 'terminee' (avis possible).
create or replace function public.client_confirm_intervention_done(
  p_intervention_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.interventions%rowtype;
begin
  select * into v_i from public.interventions where id = p_intervention_id;
  if not found or auth.uid() <> v_i.client_id then
    raise exception 'Action non autorisée.';
  end if;
  if v_i.statut <> 'confirmee' or v_i.pro_terminee_le is null then
    raise exception 'Le professionnel doit d''abord marquer l''intervention terminée.';
  end if;

  update public.interventions
    set statut = 'terminee', terminee_le = now()
    where id = p_intervention_id;

  insert into public.notifications (user_id, type, conversation_id)
  values (v_i.professional_id, 'intervention_terminee', v_i.conversation_id);
end;
$$;

grant execute on function public.client_confirm_intervention_done(uuid)
  to authenticated;

-- Annulation par l'une des parties avant 'terminee', motif obligatoire.
create or replace function public.cancel_intervention(
  p_intervention_id uuid,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.interventions%rowtype;
  v_other uuid;
begin
  select * into v_i from public.interventions where id = p_intervention_id;
  if not found then
    raise exception 'Intervention introuvable.';
  end if;
  if auth.uid() not in (v_i.client_id, v_i.professional_id) then
    raise exception 'Vous n''êtes pas concerné par cette intervention.';
  end if;
  if v_i.statut in ('terminee', 'annulee', 'refusee') then
    raise exception 'Cette intervention ne peut plus être annulée.';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Le motif d''annulation est obligatoire.';
  end if;

  update public.interventions
    set statut = 'annulee',
        annulee_le = now(),
        motif_annulation = btrim(p_motif)
    where id = p_intervention_id;

  v_other := case when auth.uid() = v_i.client_id
                  then v_i.professional_id else v_i.client_id end;
  insert into public.notifications (user_id, type, conversation_id)
  values (v_other, 'intervention_annulee', v_i.conversation_id);
end;
$$;

grant execute on function public.cancel_intervention(uuid, text)
  to authenticated;

-- Révèle le téléphone de l'autre partie (et l'adresse au pro et au
-- client) pour une intervention confirmée ou terminée.
-- Chaque appel est journalisé dans contact_reveals.
create or replace function public.get_intervention_contact(
  p_intervention_id uuid
)
returns table (
  other_id uuid,
  other_name text,
  other_phone text,
  adresse_exacte text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.interventions%rowtype;
  v_other uuid;
  v_phone text;
  v_name text;
begin
  select * into v_i from public.interventions where id = p_intervention_id;
  if not found then
    raise exception 'Intervention introuvable.';
  end if;
  if auth.uid() not in (v_i.client_id, v_i.professional_id) then
    raise exception 'Vous n''êtes pas concerné par cette intervention.';
  end if;
  if v_i.statut not in ('confirmee', 'terminee') then
    raise exception 'Les coordonnées ne sont disponibles qu''après confirmation.';
  end if;

  v_other := case when auth.uid() = v_i.client_id
                  then v_i.professional_id else v_i.client_id end;

  -- Le téléphone vient de auth.users, jamais de la messagerie.
  select u.phone into v_phone from auth.users u where u.id = v_other;
  select coalesce(nullif(pp.nom_commercial, ''), p.display_name)
    into v_name
    from public.profiles p
    left join public.professional_profiles pp on pp.id = p.id
    where p.id = v_other;

  insert into public.contact_reveals (intervention_id, user_id)
  values (p_intervention_id, auth.uid());

  return query select v_other, v_name, v_phone, v_i.adresse_exacte;
end;
$$;

grant execute on function public.get_intervention_contact(uuid)
  to authenticated;

-- Liste des interventions de l'utilisateur courant (les deux rôles).
create or replace function public.my_interventions()
returns table (
  intervention_id uuid,
  conversation_id uuid,
  other_id uuid,
  other_name text,
  my_role text,
  metier_id uuid,
  metier_nom text,
  description text,
  date_prevue date,
  statut text,
  adresse_exacte text,
  pro_terminee_le timestamptz,
  created_at timestamptz,
  confirmee_le timestamptz,
  terminee_le timestamptz,
  annulee_le timestamptz,
  motif_annulation text,
  a_avis boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id as intervention_id,
    i.conversation_id,
    o.id as other_id,
    coalesce(nullif(pp.nom_commercial, ''), o.display_name) as other_name,
    case when i.client_id = auth.uid() then 'client' else 'professionnel' end
      as my_role,
    i.metier_id,
    m.name as metier_nom,
    i.description,
    i.date_prevue,
    i.statut::text as statut,
    i.adresse_exacte,
    i.pro_terminee_le,
    i.created_at,
    i.confirmee_le,
    i.terminee_le,
    i.annulee_le,
    i.motif_annulation,
    exists (select 1 from public.reviews r where r.intervention_id = i.id)
      as a_avis
  from public.interventions i
  join public.profiles o
    on o.id = case when i.client_id = auth.uid()
                   then i.professional_id else i.client_id end
  left join public.professional_profiles pp on pp.id = o.id
  left join public.metiers m on m.id = i.metier_id
  where auth.uid() in (i.client_id, i.professional_id)
  order by i.created_at desc;
$$;

grant execute on function public.my_interventions() to authenticated;

-- Interventions d'une conversation (pour la page discussion).
create or replace function public.conversation_interventions(
  p_conversation_id uuid
)
returns table (
  intervention_id uuid,
  statut text,
  description text,
  date_prevue date,
  proposee_par uuid,
  adresse_exacte text,
  pro_terminee_le timestamptz,
  created_at timestamptz,
  terminee_le timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and auth.uid() in (c.client_id, c.professional_id)
  ) then
    raise exception 'Conversation introuvable.';
  end if;

  return query
    select i.id, i.statut::text, i.description, i.date_prevue,
           i.proposee_par, i.adresse_exacte, i.pro_terminee_le,
           i.created_at, i.terminee_le
    from public.interventions i
    where i.conversation_id = p_conversation_id
    order by i.created_at desc;
end;
$$;

grant execute on function public.conversation_interventions(uuid)
  to authenticated;

-- ============================================================
-- Avis : déclencheurs (note pro + notifications)
-- ============================================================

-- Recalcule note_moyenne / nombre_avis depuis les avis visibles.
create or replace function public.sync_professional_notes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pro uuid;
begin
  v_pro := coalesce(new.professional_id, old.professional_id);
  update public.professional_profiles pp
    set nombre_avis = agg.n,
        note_moyenne = case when agg.n > 0 then agg.avg end
    from (
      select count(*)::int as n, avg(r.note_globale) as avg
      from public.reviews r
      where r.professional_id = v_pro and r.statut = 'visible'
    ) agg
    where pp.id = v_pro;
  return new;
end;
$$;

drop trigger if exists sync_professional_notes_trg on public.reviews;
create trigger sync_professional_notes_trg
  after insert or update of statut on public.reviews
  for each row execute function public.sync_professional_notes();

-- Notification « nouvel avis » au professionnel.
create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type)
  values (new.professional_id, 'nouvel_avis');
  return new;
end;
$$;

drop trigger if exists notify_new_review_trg on public.reviews;
create trigger notify_new_review_trg
  after insert on public.reviews
  for each row execute function public.notify_new_review();

-- Notification « réponse à un avis » au client.
create or replace function public.notify_review_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
begin
  select r.client_id into v_client from public.reviews r
    where r.id = new.review_id;
  insert into public.notifications (user_id, type)
  values (v_client, 'reponse_avis');
  return new;
end;
$$;

drop trigger if exists notify_review_reply_trg on public.review_replies;
create trigger notify_review_reply_trg
  after insert on public.review_replies
  for each row execute function public.notify_review_reply();

-- ============================================================
-- Masquage d'un avis (staff : admin + modérateur, motif requis,
-- journalisé dans admin_actions).
-- ============================================================

create or replace function public.admin_set_review_visibility(
  p_review_id uuid,
  p_visible boolean,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut public.review_statut;
begin
  if not public.is_staff() then
    raise exception 'Accès réservé au staff.';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Le motif est obligatoire.';
  end if;

  v_statut := case when p_visible then 'visible'::public.review_statut
                   else 'masque'::public.review_statut end;

  update public.reviews
    set statut = v_statut,
        masque_par = case when p_visible then null else auth.uid() end,
        motif_masque = case when p_visible then null else btrim(p_motif) end
    where id = p_review_id;
  if not found then
    raise exception 'Avis introuvable.';
  end if;

  perform public.admin_log(
    case when p_visible then 'avis_rendu_visible' else 'avis_masque' end,
    'review', p_review_id, p_motif
  );
end;
$$;

grant execute on function public.admin_set_review_visibility(uuid, boolean, text)
  to authenticated;

-- ============================================================
-- notifications : nouveaux types autorisés
-- ============================================================

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'nouveau_message',
    'intervention_proposee',
    'intervention_confirmee',
    'intervention_refusee',
    'intervention_annulee',
    'intervention_a_confirmer',
    'intervention_terminee',
    'nouvel_avis',
    'reponse_avis'
  ));

-- ============================================================
-- professionals_public : note et nombre d'avis
-- ============================================================

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
    where pm.professional_id = pp.id and m.is_active) as metiers,
  pp.note_moyenne,
  pp.nombre_avis
from public.professional_profiles pp
join public.profiles p on p.id = pp.id
where pp.est_visible
  and p.role = 'professionnel'
  and not public.is_account_suspended(p.id);

grant select on public.professionals_public to anon, authenticated;

-- ============================================================
-- search_professionals : + note_moyenne/nombre_avis et moyenne
-- bayésienne (poids prudent) après la proximité.
-- Le type de retour change → DROP puis recréation.
-- ============================================================

drop function if exists public.search_professionals(
  text, uuid, uuid, double precision, double precision,
  text, text, text, text, integer, text, integer, integer, boolean
);

create function public.search_professionals(
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
  note_moyenne numeric,
  nombre_avis integer,
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
      pp.note_moyenne,
      pp.nombre_avis,
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
      and p.role = 'professionnel'
      and not public.is_account_suspended(p.id)
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
      (case
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
      end)::numeric as distance_approxe_km,
      (e.distance_km is null
       or e.rayon_km is null
       or e.distance_km <= e.rayon_km) as dans_rayon,
      -- Moyenne bayésienne : prior 3.0 avec poids 5 avis,
      -- un seul avis ne propulse pas le professionnel.
      case when e.nombre_avis > 0
        then (e.note_moyenne * e.nombre_avis + 3.0 * 5)
             / (e.nombre_avis + 5)
      end as note_bayes,
      -- Visibilité réduite : sanction active → relégué en fin de liste.
      public.has_active_sanction(e.profile_id, 'visibilite_reduite')
        as visibilite_reduite
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
    s.note_moyenne,
    s.nombre_avis,
    s.distance_approxe_km,
    s.dans_rayon,
    count(*) over () as total_count
  from scores s
  order by
    -- Les profils à visibilité réduite passent toujours en dernier.
    s.visibilite_reduite,
    case when p_tri = 'proximite'
         then coalesce(s.distance_km, 'Infinity'::float8) else 0 end,
    case when p_tri = 'proximite'
         then case s.disponibilite
                when 'immediat' then 0
                when 'sur_rdv' then 1
                else 2 end
         else -1 end,
    -- Avis : départage après la proximité (tous tris).
    -coalesce(s.note_bayes, 0),
    case when p_tri = 'verification'
         then -(case when s.identite_verifiee then 2
                     when s.numero_verifie then 1
                     else 0 end)
         else 0 end,
    case when p_tri = 'verification' then -s.completude else 0 end,
    case when p_tri = 'profil' then -s.completude else 0 end,
    case when p_tri = 'profil'
         then -(case when s.identite_verifiee then 2
                     when s.numero_verifie then 1
                     else 0 end)
         else 0 end,
    coalesce(s.distance_km, 'Infinity'::float8),
    -(case when s.identite_verifiee then 2
           when s.numero_verifie then 1
           else 0 end),
    -s.completude,
    s.nom_affiche
  limit v_limit offset v_offset;
end;
$$;

grant execute on function public.search_professionals(
  text, uuid, uuid, double precision, double precision,
  text, text, text, text, integer, text, integer, integer, boolean
) to anon, authenticated;

-- ============================================================
-- admin_stats : + interventions confirmées et avis déposés
-- ============================================================

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_staff() then
    raise exception 'Accès réservé au staff.';
  end if;

  select jsonb_build_object(
    'clients', (select count(*) from profiles where role = 'client'),
    'professionals', (select count(*) from profiles where role = 'professionnel'),
    'pros_visibles', (select count(*) from professional_profiles where est_visible),
    'documents_en_attente', (select count(*) from identity_documents where statut = 'en_attente'),
    'reports_nouveaux', (select count(*) from reports where statut = 'nouveau'),
    'conversations_ouvertes', (select count(*) from conversations where statut = 'ouverte'),
    'inscriptions_7j', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'inscriptions_30j', (select count(*) from profiles where created_at > now() - interval '30 days'),
    'interventions_confirmees', (select count(*) from interventions where statut in ('confirmee', 'terminee')),
    'avis_deposes', (select count(*) from reviews),
    'activity_30j', (
      select jsonb_agg(jsonb_build_object(
        'jour', d.jour,
        'inscriptions', d.inscriptions,
        'conversations', d.conversations,
        'messages', d.messages,
        'signalements', d.signalements
      ) order by d.jour)
      from (
        select
          gs::date as jour,
          (select count(*) from profiles p
            where p.created_at::date = gs::date) as inscriptions,
          (select count(*) from conversations c
            where c.created_at::date = gs::date) as conversations,
          (select count(*) from messages m
            where m.created_at::date = gs::date) as messages,
          (select count(*) from reports r
            where r.created_at::date = gs::date) as signalements
        from generate_series(
          (now() - interval '29 days')::date, now()::date, '1 day') gs
      ) d
    ),
    'pros_par_categorie', (
      select coalesce(jsonb_agg(jsonb_build_object('nom', x.nom, 'total', x.total)
               order by x.total desc), '[]'::jsonb)
      from (
        select c.name as nom, count(distinct pm.professional_id) as total
        from professional_metiers pm
        join metiers m on m.id = pm.metier_id
        join categories c on c.id = m.category_id
        join professional_profiles pp on pp.id = pm.professional_id
        where pp.est_visible
        group by c.name
      ) x
    ),
    'pros_par_ville', (
      select coalesce(jsonb_agg(jsonb_build_object('ville', x.ville, 'total', x.total)
               order by x.total desc), '[]'::jsonb)
      from (
        select coalesce(pp.ville, p.city, 'Non renseigné') as ville, count(*) as total
        from professional_profiles pp
        join profiles p on p.id = pp.id
        where pp.est_visible
        group by 1
      ) x
    ),
    'completude', (
      select jsonb_build_object(
        'total', count(*),
        'complets', count(*) filter (
          where pp.photo_url is not null
            and pp.bio is not null
            and pp.tarif_indicatif is not null
            and pp.rayon_km is not null
            and exists (select 1 from professional_metiers pm
                        where pm.professional_id = pp.id))
      )
      from professional_profiles pp
      join profiles p on p.id = pp.id
      where pp.est_visible and p.role = 'professionnel'
    ),
    'verification', (
      select jsonb_build_object(
        'total', count(*),
        'verifies', count(*) filter (where pp.identite_verifiee or p.phone_verified)
      )
      from professional_profiles pp
      join profiles p on p.id = pp.id
      where pp.est_visible and p.role = 'professionnel'
    )
  ) into v;

  return v;
end;
$$;

grant execute on function public.admin_stats() to authenticated;

-- ============================================================
-- Signalements sur un avis : la cible sanctionnable est le
-- professionnel noté.
-- ============================================================

create or replace function public.admin_report_action(
  p_report_id uuid,
  p_action text,
  p_motif text,
  p_fin timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports%rowtype;
  v_target uuid;
  v_sanction uuid;
  v_new_statut public.report_statut;
begin
  if not public.is_staff() then
    raise exception 'Accès réservé au staff.';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Le motif est obligatoire.';
  end if;

  select * into v_report from public.reports where id = p_report_id;
  if not found then raise exception 'Signalement introuvable.'; end if;

  -- Cible de la sanction : auteur du profil/avis signalé,
  -- expéditeur du message, ou participant adverse pour une conversation.
  v_target := case v_report.cible_type::text
    when 'profil' then v_report.cible_id
    when 'avis' then (
      select r.professional_id from public.reviews r
      where r.id = v_report.cible_id)
    when 'message' then (
      select m.sender_id from public.messages m
      where m.id = v_report.cible_id)
    else (
      select case when c.client_id = v_report.reporter_id
                  then c.professional_id else c.client_id end
      from public.conversations c where c.id = v_report.cible_id)
  end;

  v_new_statut := case p_action
    when 'en_cours' then 'en_cours'::public.report_statut
    when 'reouvrir' then 'nouveau'::public.report_statut
    else 'traite'::public.report_statut
  end;

  if p_action in ('avertir', 'visibilite_reduite',
                  'suspension_temporaire', 'suspension_definitive') then
    if v_target is null then
      raise exception 'Cible du signalement introuvable.';
    end if;
    v_sanction := public.admin_apply_sanction(
      v_target,
      case p_action
        when 'avertir' then 'avertissement'::public.sanction_type
        else p_action::public.sanction_type
      end,
      p_motif,
      case when p_action = 'suspension_temporaire' then p_fin else null end,
      p_report_id
    );
  elsif p_action not in ('en_cours', 'sans_suite', 'reouvrir') then
    raise exception 'Action inconnue.';
  end if;

  update public.reports
    set statut = v_new_statut,
        sanction_id = coalesce(v_sanction, sanction_id)
    where id = p_report_id;

  if p_action not in ('avertir', 'visibilite_reduite',
                      'suspension_temporaire', 'suspension_definitive') then
    perform public.admin_log(
      'signalement_' || p_action, 'report', p_report_id, p_motif
    );
  end if;
end;
$$;

grant execute on function public.admin_report_action(uuid, text, text, timestamptz)
  to authenticated;
