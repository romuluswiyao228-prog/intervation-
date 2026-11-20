-- ============================================================
-- Phase 5 : espace administrateur.
-- Sanctions, journal admin_actions (immuable), pages légales,
-- documents d'identité, statistiques, blocage de numéro.
-- ============================================================

-- ---------- Types ----------

do $$
begin
  create type public.sanction_type as enum (
    'avertissement', 'visibilite_reduite', 'suspension_temporaire',
    'suspension_definitive', 'suppression', 'blocage_numero'
  );
exception when duplicate_object then null;
end $$;

-- ---------- Tables ----------

create table if not exists public.sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.sanction_type not null,
  motif text not null,
  debut timestamptz not null default now(),
  fin timestamptz,
  par uuid not null references auth.users (id),
  report_id uuid,
  created_at timestamptz not null default now(),
  revoquee_le timestamptz,
  revoquee_par uuid references auth.users (id)
);

comment on table public.sanctions is
  'Sanctions utilisateurs ; l''état suspendu est calculé (pas de cron).';

create index if not exists sanctions_user_idx
  on public.sanctions (user_id) where revoquee_le is null;

alter table public.sanctions enable row level security;

drop policy if exists sanctions_select_staff on public.sanctions;
create policy sanctions_select_staff on public.sanctions
  for select to authenticated
  using (public.is_staff());

create table if not exists public.blocked_phones (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  motif text not null,
  par uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (phone)
);

alter table public.blocked_phones enable row level security;

drop policy if exists blocked_phones_select_staff on public.blocked_phones;
create policy blocked_phones_select_staff on public.blocked_phones
  for select to authenticated
  using (public.is_staff());

create table if not exists public.legal_pages (
  slug text primary key,
  titre text not null,
  contenu text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

comment on table public.legal_pages is
  'Pages légales éditables (texte brut, pas de HTML).';

alter table public.legal_pages enable row level security;

drop policy if exists legal_pages_select_public on public.legal_pages;
create policy legal_pages_select_public on public.legal_pages
  for select to anon, authenticated
  using (true);

create table if not exists public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users (id),
  action text not null,
  cible_type text,
  cible_id uuid,
  motif text,
  details jsonb,
  created_at timestamptz not null default now()
);

comment on table public.admin_actions is
  'Journal des actions admin : lecture seule, jamais modifié ni supprimé.';

create index if not exists admin_actions_admin_idx
  on public.admin_actions (admin_id);
create index if not exists admin_actions_created_idx
  on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;

drop policy if exists admin_actions_select_staff on public.admin_actions;
create policy admin_actions_select_staff on public.admin_actions
  for select to authenticated
  using (public.is_staff());

-- ---------- Documents d'identité (file de validation) ----------

create table if not exists public.identity_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null default 'carte_identite',
  storage_path text not null,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'valide', 'rejete')),
  motif text,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz
);

comment on table public.identity_documents is
  'Pièces d''identité déposées par les professionnels (validation admin).';

create index if not exists identity_documents_statut_idx
  on public.identity_documents (statut) where statut = 'en_attente';

alter table public.identity_documents enable row level security;

drop policy if exists identity_documents_select_own_or_staff on public.identity_documents;
create policy identity_documents_select_own_or_staff on public.identity_documents
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists identity_documents_insert_own on public.identity_documents;
create policy identity_documents_insert_own on public.identity_documents
  for insert to authenticated
  with check (user_id = auth.uid());

alter table public.reports
  add column if not exists sanction_id uuid references public.sanctions (id);

-- Permissions d'écriture catalogue : admin uniquement.
drop policy if exists categories_write_admin on public.categories;
create policy categories_write_admin on public.categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Helpers : sanction active, compte suspendu, rôle courant
-- ============================================================

-- Vrai si une sanction du type donné est active pour l'utilisateur.
create or replace function public.has_active_sanction(
  p_user_id uuid,
  p_type public.sanction_type
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sanctions s
    where s.user_id = p_user_id
      and s.type = p_type
      and s.revoquee_le is null
      and s.debut <= now()
      and (s.fin is null or s.fin > now())
  );
$$;

grant execute on function public.has_active_sanction(uuid, public.sanction_type)
  to authenticated;

-- Compte suspendu = statut manuel OU sanction de suspension/suppression
-- en cours (la suspension temporaire expire sans tâche planifiée).
create or replace function public.is_account_suspended(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.status = 'suspendu'
    )
    or exists (
      select 1 from public.sanctions s
      where s.user_id = p_user_id
        and s.revoquee_le is null
        and s.type in (
          'suspension_temporaire', 'suspension_definitive', 'suppression'
        )
        and s.debut <= now()
        and (s.fin is null or s.fin > now())
    );
$$;

grant execute on function public.is_account_suspended(uuid) to authenticated;

-- Statut effectif du compte courant (pour l'interface).
create or replace function public.my_effective_status()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status public.account_status;
begin
  select status into v_status from public.profiles where id = auth.uid();
  if v_status is null then return null; end if;
  if public.is_account_suspended(auth.uid()) then return 'suspendu'; end if;
  return v_status::text;
end;
$$;

grant execute on function public.my_effective_status() to authenticated;

-- ============================================================
-- Journal admin_actions : écriture interne uniquement,
-- modification/suppression interdites à tous.
-- ============================================================

create or replace function public.admin_log(
  p_action text,
  p_cible_type text,
  p_cible_id uuid,
  p_motif text,
  p_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_actions
    (admin_id, action, cible_type, cible_id, motif, details)
  values (auth.uid(), p_action, p_cible_type, p_cible_id, p_motif, p_details);
end;
$$;

revoke execute on function public.admin_log(text, text, uuid, text, jsonb)
  from public, anon, authenticated;

create or replace function public.prevent_admin_actions_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Le journal des actions est en lecture seule.';
end;
$$;

drop trigger if exists admin_actions_immutable on public.admin_actions;
create trigger admin_actions_immutable
  before update or delete on public.admin_actions
  for each row execute function public.prevent_admin_actions_change();

-- ============================================================
-- Actions admin (SECURITY DEFINER, rôle vérifié en base)
-- ============================================================

-- Applique une sanction. Admin : tous types ; modérateur :
-- avertissement et visibilite_reduite uniquement.
create or replace function public.admin_apply_sanction(
  p_user_id uuid,
  p_type public.sanction_type,
  p_motif text,
  p_fin timestamptz default null,
  p_report_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_id uuid;
  v_phone text;
begin
  if not public.is_staff() then
    raise exception 'Accès réservé au staff.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas vous sanctionner vous-même.';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Le motif est obligatoire.';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'moderateur'
     and p_type not in ('avertissement', 'visibilite_reduite') then
    raise exception 'Les modérateurs ne peuvent appliquer que des avertissements ou une visibilité réduite.';
  end if;

  -- blocage_numero : enregistre aussi le numéro dans blocked_phones.
  if p_type = 'blocage_numero' then
    select phone into v_phone from public.profiles where id = p_user_id;
    if v_phone is null then
      raise exception 'Aucun numéro à bloquer pour cet utilisateur.';
    end if;
    insert into public.blocked_phones (phone, motif, par)
    values (v_phone, p_motif, auth.uid())
    on conflict (phone) do nothing;
  end if;

  -- suspension temporaire : la fin est obligatoire.
  if p_type = 'suspension_temporaire' and p_fin is null then
    raise exception 'Une date de fin est requise pour une suspension temporaire.';
  end if;

  insert into public.sanctions
    (user_id, type, motif, fin, par, report_id)
  values (p_user_id, p_type, p_motif, p_fin, auth.uid(), p_report_id)
  returning id into v_id;

  -- Suppression : anonymisation du compte, effacement des photos
  -- et documents d'identité, conservation des signalements/journal.
  if p_type = 'suppression' then
    update public.profiles
      set display_name = 'Utilisateur supprimé',
          city = null,
          neighborhood = null
      where id = p_user_id;
    update public.professional_profiles
      set photo_url = null
      where id = p_user_id;
    delete from storage.objects
      where bucket_id = 'documents'
        and name like p_user_id::text || '/%';
    delete from public.identity_documents where user_id = p_user_id;
  end if;

  perform public.admin_log(
    'sanction_' || p_type::text, 'user', p_user_id, p_motif,
    jsonb_build_object('sanction_id', v_id, 'fin', p_fin, 'report_id', p_report_id)
  );
  return v_id;
end;
$$;

grant execute on function public.admin_apply_sanction(
  uuid, public.sanction_type, text, timestamptz, uuid
) to authenticated;

-- Réactive un compte : révoque ses sanctions de suspension actives.
create or replace function public.admin_reactivate(p_user_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Le motif est obligatoire.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas vous réactiver vous-même.';
  end if;

  update public.sanctions
    set revoquee_le = now(), revoquee_par = auth.uid()
    where user_id = p_user_id
      and revoquee_le is null
      and type in ('suspension_temporaire', 'suspension_definitive', 'suppression');

  perform public.admin_log('reactivation', 'user', p_user_id, p_motif);
end;
$$;

grant execute on function public.admin_reactivate(uuid, text) to authenticated;

-- Change le rôle d'un utilisateur (admin uniquement, jamais soi-même,
-- jamais le dernier administrateur).
create or replace function public.admin_change_role(
  p_user_id uuid,
  p_role public.user_role,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.user_role;
  v_admins integer;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Le motif est obligatoire.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas changer votre propre rôle.';
  end if;

  select role into v_old from public.profiles where id = p_user_id;
  if v_old is null then raise exception 'Utilisateur introuvable.'; end if;

  -- Dernier administrateur : interdit de le rétrograder.
  if v_old = 'administrateur' and p_role <> 'administrateur' then
    select count(*) into v_admins
      from public.profiles where role = 'administrateur';
    if v_admins <= 1 then
      raise exception 'Impossible de retirer le dernier administrateur.';
    end if;
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  perform public.admin_log(
    'changement_role', 'user', p_user_id, p_motif,
    jsonb_build_object('de', v_old::text, 'vers', p_role::text)
  );
end;
$$;

grant execute on function public.admin_change_role(uuid, public.user_role, text)
  to authenticated;

-- Active/désactive la visibilité publique d'un profil pro (admin).
create or replace function public.admin_set_visibility(
  p_user_id uuid,
  p_visible boolean,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Le motif est obligatoire.';
  end if;
  if not exists (
    select 1 from public.professional_profiles where id = p_user_id
  ) then
    raise exception 'Profil professionnel introuvable.';
  end if;

  update public.professional_profiles
    set est_visible = p_visible
    where id = p_user_id;

  perform public.admin_log(
    case when p_visible then 'visibilite_active' else 'visibilite_reduite' end,
    'professional', p_user_id, p_motif
  );
end;
$$;

grant execute on function public.admin_set_visibility(uuid, boolean, text)
  to authenticated;

-- Traite un signalement : changement de statut ou action sanction.
-- p_action : en_cours | sans_suite | avertir | visibilite_reduite |
--            suspension_temporaire | suspension_definitive | reouvrir
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

  -- Cible de la sanction : auteur du profil signalé, expéditeur du
  -- message, ou participant adverse pour une conversation.
  v_target := case v_report.cible_type
    when 'profil' then v_report.cible_id
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

-- Édition des pages légales (admin uniquement, texte brut).
create or replace function public.admin_update_legal_page(
  p_slug text,
  p_titre text,
  p_contenu text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if p_slug is null or btrim(p_slug) = ''
     or p_titre is null or btrim(p_titre) = '' then
    raise exception 'Slug et titre obligatoires.';
  end if;

  insert into public.legal_pages (slug, titre, contenu, updated_at, updated_by)
  values (p_slug, p_titre, coalesce(p_contenu, ''), now(), auth.uid())
  on conflict (slug) do update
    set titre = excluded.titre,
        contenu = excluded.contenu,
        updated_at = now(),
        updated_by = auth.uid();

  perform public.admin_log('legal_page', 'legal_page', null, null,
    jsonb_build_object('slug', p_slug));
end;
$$;

grant execute on function public.admin_update_legal_page(text, text, text)
  to authenticated;

-- Validation d'une pièce d'identité (admin uniquement).
create or replace function public.admin_review_document(
  p_document_id uuid,
  p_statut text,
  p_motif text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if p_statut not in ('valide', 'rejete') then
    raise exception 'Statut invalide (valide ou rejete).';
  end if;
  if p_statut = 'rejete' and (p_motif is null or btrim(p_motif) = '') then
    raise exception 'Le motif est obligatoire pour un rejet.';
  end if;

  update public.identity_documents
    set statut = p_statut,
        motif = p_motif,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_document_id and statut = 'en_attente';
  if not found then
    raise exception 'Document introuvable ou déjà traité.';
  end if;

  perform public.admin_log(
    'document_' || p_statut, 'identity_document', p_document_id, p_motif
  );
end;
$$;

grant execute on function public.admin_review_document(uuid, text, text)
  to authenticated;

-- Consultation staff d'une conversation signalée : journalisée.
create or replace function public.admin_view_reported_conversation(
  p_conversation_id uuid
)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  image_path text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Accès réservé au staff.';
  end if;
  if not exists (
    select 1 from public.reports r
    where (r.cible_type = 'conversation' and r.cible_id = p_conversation_id)
       or (r.cible_type = 'message' and r.cible_id in (
             select m.id from public.messages m
             where m.conversation_id = p_conversation_id))
  ) then
    raise exception 'Aucun signalement associé à cette conversation.';
  end if;

  -- Chaque consultation est inscrite au journal.
  insert into public.admin_actions
    (admin_id, action, cible_type, cible_id, motif)
  values (auth.uid(), 'consultation_conversation', 'conversation',
          p_conversation_id, 'Signalement');

  return query
    select m.id, m.sender_id, m.body, m.image_path, m.created_at, m.read_at
    from public.messages m
    where m.conversation_id = p_conversation_id
    order by m.created_at;
end;
$$;

grant execute on function public.admin_view_reported_conversation(uuid)
  to authenticated;

-- ============================================================
-- Statistiques staff (compteurs réels, aucun chiffre inventé)
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
-- Adaptations : suspension calculée + visibilité réduite
-- ============================================================

-- handle_new_user : refuse les numéros bloqués (sinon inchangé).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  -- Numéro bloqué : inscription refusée avec message clair.
  if new.phone is not null and exists (
    select 1 from public.blocked_phones bp
    where regexp_replace(bp.phone, '\D', '', 'g')
        = regexp_replace(new.phone, '\D', '', 'g')
  ) then
    raise exception 'Ce numéro de téléphone ne peut pas être utilisé pour créer un compte.';
  end if;

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

-- can_client_message : suspension calculée pour les deux parties.
create or replace function public.can_client_message(p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles me
    join public.profiles pr on pr.id = p_professional_id
    join public.professional_profiles pp on pp.id = pr.id
    where me.id = auth.uid()
      and me.role = 'client'
      and pr.role = 'professionnel'
      and pp.est_visible
      and not public.is_account_suspended(me.id)
      and not public.is_account_suspended(pr.id)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me.id and b.blocked_id = pr.id)
           or (b.blocker_id = pr.id and b.blocked_id = me.id)
      )
  );
$$;

grant execute on function public.can_client_message(uuid) to authenticated;

-- guard_message_send : suspension calculée.
create or replace function public.guard_message_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
begin
  select * into v_conv
    from public.conversations where id = new.conversation_id;
  if not found then
    raise exception 'Conversation introuvable.';
  end if;
  if v_conv.statut <> 'ouverte' then
    raise exception 'Cette conversation est fermée.';
  end if;
  if auth.uid() is distinct from v_conv.client_id
     and auth.uid() is distinct from v_conv.professional_id then
    raise exception 'Vous n''êtes pas participant à cette conversation.';
  end if;
  if new.sender_id is distinct from auth.uid() then
    raise exception 'sender_id invalide.';
  end if;

  if public.is_account_suspended(auth.uid()) then
    raise exception 'Votre compte est suspendu : envoi impossible.';
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_conv.client_id and b.blocked_id = v_conv.professional_id)
       or (b.blocker_id = v_conv.professional_id and b.blocked_id = v_conv.client_id)
  ) then
    raise exception 'Un des participants a bloqué l''autre : envoi impossible.';
  end if;

  if (select count(*) from public.messages m
       where m.sender_id = auth.uid()
         and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Trop de messages : réessayez dans une minute.';
  end if;

  return new;
end;
$$;

-- professionals_public : suspension calculée (vue publique).
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
  and p.role = 'professionnel'
  and not public.is_account_suspended(p.id);

grant select on public.professionals_public to anon, authenticated;

-- search_professionals : suspension calculée + visibilité réduite
-- en dernier (premier critère de tri).
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

-- ---------- Bucket documents (pièces d'identité, privé) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Convention : {user_id}/{fichier} — propriétaire ou staff en lecture.
drop policy if exists documents_bucket_select on storage.objects;
create policy documents_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or public.is_staff())
  );

drop policy if exists documents_bucket_insert on storage.objects;
create policy documents_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
