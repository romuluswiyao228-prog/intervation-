-- ============================================================
-- Phase 4 : messagerie anonyme, signalement, blocage, notifications.
-- Confidentialité : jamais de téléphone ni de coordonnées dans la
-- messagerie ; les participants ne voient que nom public, photo,
-- quartier.
-- ============================================================

-- ---------- Types ----------

do $$
begin
  create type public.conversation_statut as enum ('ouverte', 'fermee');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.report_cible as enum ('profil', 'message', 'conversation');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.report_motif as enum (
    'faux_profil', 'harcelement', 'injures', 'fraude', 'contenu_interdit', 'autre'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.report_statut as enum ('nouveau', 'en_cours', 'traite');
exception when duplicate_object then null;
end $$;

-- ---------- blocks ----------
-- Créé tôt : can_client_message et les gardes l'utilisent.

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

comment on table public.blocks is
  'Blocages unilatéraux : chacun ne gère que ses propres blocages.';

alter table public.blocks enable row level security;

drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = auth.uid());

-- Vrai si l'utilisateur courant (client actif) peut ouvrir une
-- conversation avec le professionnel donné (visible, non bloqué).
-- Définie avant les policies qui l'utilisent.
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
      and me.status = 'actif'
      and pr.role = 'professionnel'
      and pr.status = 'actif'
      and pp.est_visible
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me.id and b.blocked_id = pr.id)
           or (b.blocker_id = pr.id and b.blocked_id = me.id)
      )
  );
$$;

grant execute on function public.can_client_message(uuid) to authenticated;

-- ---------- conversations ----------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users (id) on delete cascade,
  professional_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  statut public.conversation_statut not null default 'ouverte',
  unique (client_id, professional_id)
);

comment on table public.conversations is
  'Conversation privée client ↔ professionnel (créée par le client uniquement).';

create index if not exists conversations_client_idx
  on public.conversations (client_id);
create index if not exists conversations_pro_idx
  on public.conversations (professional_id);

alter table public.conversations enable row level security;

-- Lecture : participants uniquement.
drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant on public.conversations
  for select to authenticated
  using (auth.uid() in (client_id, professional_id));

-- Création : uniquement par un client actif vers un pro visible.
drop policy if exists conversations_insert_client on public.conversations;
create policy conversations_insert_client on public.conversations
  for insert to authenticated
  with check (client_id = auth.uid() and public.can_client_message(professional_id));

-- Mise à jour (statut, last_message_at) : participants.
drop policy if exists conversations_update_participant on public.conversations;
create policy conversations_update_participant on public.conversations
  for update to authenticated
  using (auth.uid() in (client_id, professional_id))
  with check (auth.uid() in (client_id, professional_id));

-- Pas de suppression par les utilisateurs.

-- ---------- messages ----------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id),
  body text not null default '',
  image_path text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint messages_body_length check (char_length(body) <= 2000),
  constraint messages_content check (
    btrim(body) <> '' or image_path is not null
  )
);

comment on table public.messages is
  'Messages texte ou photo des conversations (jamais modifiables).';

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_sender_idx
  on public.messages (sender_id);

alter table public.messages enable row level security;

-- Lecture : participants de la conversation.
drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and auth.uid() in (c.client_id, c.professional_id)
  ));

-- Envoi : soi-même, participant (le trigger guard_message_send
-- vérifie blocage, suspension, fermeture et limite de débit).
drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and auth.uid() in (c.client_id, c.professional_id)
    )
  );

-- Modification : uniquement read_at sur les messages reçus
-- (appliqué par le trigger guard_message_update).
drop policy if exists messages_update_read on public.messages;
create policy messages_update_read on public.messages
  for update to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and auth.uid() in (c.client_id, c.professional_id)
  ))
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and auth.uid() in (c.client_id, c.professional_id)
  ));

-- Pas de suppression ni de lecture hors participants.

-- ---------- reports ----------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id),
  cible_type public.report_cible not null,
  cible_id uuid not null,
  motif public.report_motif not null,
  description text,
  statut public.report_statut not null default 'nouveau',
  traite_par uuid references auth.users (id),
  traite_le timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.reports is
  'Signalements (profil, message, conversation) traités par le staff.';

create index if not exists reports_statut_idx
  on public.reports (statut);
create index if not exists reports_reporter_idx
  on public.reports (reporter_id);

alter table public.reports enable row level security;

-- Lecture : auteur + staff.
drop policy if exists reports_select_own_or_staff on public.reports;
create policy reports_select_own_or_staff on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_staff());

-- Création : soi-même.
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- Traitement : staff uniquement (phase 5 utilisera ces colonnes).
drop policy if exists reports_update_staff on public.reports;
create policy reports_update_staff on public.reports
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- notifications ----------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'nouveau_message'
    check (type in ('nouveau_message')),
  conversation_id uuid references public.conversations (id) on delete cascade,
  lue boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'Notifications internes (créées uniquement par trigger).';

create index if not exists notifications_user_idx
  on public.notifications (user_id, lue);

alter table public.notifications enable row level security;

-- Lecture : soi-même.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Marquage lu : soi-même (le trigger limite au champ lue).
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Pas d'insertion utilisateur ni de suppression : trigger uniquement.

-- ============================================================
-- Triggers
-- ============================================================

-- Garde à l'envoi d'un message : blocage, suspension, fermeture,
-- participation et limite de 20 messages/minute.
create or replace function public.guard_message_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_status public.account_status;
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

  select status into v_status from public.profiles where id = auth.uid();
  if v_status = 'suspendu' then
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

drop trigger if exists guard_message_send_trg on public.messages;
create trigger guard_message_send_trg
  before insert on public.messages
  for each row execute function public.guard_message_send();

-- Après chaque message : maj last_message_at + notification destinataire.
create or replace function public.handle_new_message()
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

  update public.conversations
    set last_message_at = new.created_at
    where id = new.conversation_id;

  insert into public.notifications (user_id, type, conversation_id)
  values (
    case when v_conv.client_id = new.sender_id
         then v_conv.professional_id
         else v_conv.client_id end,
    'nouveau_message',
    new.conversation_id
  );

  return new;
end;
$$;

drop trigger if exists handle_new_message_trg on public.messages;
create trigger handle_new_message_trg
  after insert on public.messages
  for each row execute function public.handle_new_message();

-- Garde à la création de conversation : rôle client actif,
-- pro visible, pas de blocage, 30 conversations/jour max.
create or replace function public.guard_conversation_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.can_client_message(new.professional_id) then
    raise exception 'Conversation impossible avec ce professionnel.';
  end if;

  select count(*) into v_count
    from public.conversations
    where client_id = auth.uid()
      and created_at > now() - interval '1 day';
  if v_count >= 30 then
    raise exception 'Limite de nouvelles conversations atteinte pour aujourd''hui.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_conversation_create_trg on public.conversations;
create trigger guard_conversation_create_trg
  before insert on public.conversations
  for each row execute function public.guard_conversation_create();

-- Messages : pas d'édition/suppression ; seul read_at peut passer
-- de null à une date, sur un message reçu.
create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.sender_id = auth.uid() then
    raise exception 'Vous ne pouvez pas modifier vos propres messages.';
  end if;
  if new.body is distinct from old.body
     or new.image_path is distinct from old.image_path
     or new.sender_id is distinct from old.sender_id
     or new.conversation_id is distinct from old.conversation_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Seul le marquage « lu » est autorisé.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_message_update_trg on public.messages;
create trigger guard_message_update_trg
  before update on public.messages
  for each row execute function public.guard_message_update();

-- Notifications : seul le champ lue peut changer.
create or replace function public.guard_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.type is distinct from old.type
     or new.conversation_id is distinct from old.conversation_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Modification non autorisée.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_notification_update_trg on public.notifications;
create trigger guard_notification_update_trg
  before update on public.notifications
  for each row execute function public.guard_notification_update();

-- ============================================================
-- Fonctions de lecture sécurisées (SECURITY DEFINER)
-- ============================================================

-- Conversations de l'utilisateur courant avec infos publiques
-- du participant adverse (nom, photo, quartier) — jamais de
-- téléphone ni coordonnées.
create or replace function public.my_conversations()
returns table (
  conversation_id uuid,
  other_id uuid,
  other_name text,
  other_photo text,
  other_quartier text,
  statut text,
  last_message_at timestamptz,
  last_body text,
  last_sender_id uuid,
  is_blocked boolean,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as conversation_id,
    o.id as other_id,
    coalesce(nullif(pp.nom_commercial, ''), o.display_name) as other_name,
    pp.photo_url as other_photo,
    coalesce(pp.quartier, o.neighborhood) as other_quartier,
    c.statut::text as statut,
    c.last_message_at,
    lm.body as last_body,
    lm.sender_id as last_sender_id,
    exists (
      select 1 from public.blocks b
      where (b.blocker_id = c.client_id and b.blocked_id = c.professional_id)
         or (b.blocker_id = c.professional_id and b.blocked_id = c.client_id)
    ) as is_blocked,
    (select count(*) from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.read_at is null) as unread_count
  from public.conversations c
  join public.profiles o
    on o.id = case when c.client_id = auth.uid()
                   then c.professional_id else c.client_id end
  left join public.professional_profiles pp on pp.id = o.id
  left join lateral (
    select m.body, m.sender_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where auth.uid() in (c.client_id, c.professional_id)
  order by c.last_message_at desc nulls last, c.created_at desc;
$$;

grant execute on function public.my_conversations() to authenticated;

-- Utilisateurs bloqués par l'utilisateur courant (noms publics).
create or replace function public.my_blocks()
returns table (
  blocked_id uuid,
  blocked_name text,
  blocked_photo text,
  blocked_quartier text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.blocked_id,
    coalesce(nullif(pp.nom_commercial, ''), o.display_name) as blocked_name,
    pp.photo_url as blocked_photo,
    coalesce(pp.quartier, o.neighborhood) as blocked_quartier,
    b.created_at
  from public.blocks b
  join public.profiles o on o.id = b.blocked_id
  left join public.professional_profiles pp on pp.id = o.id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.my_blocks() to authenticated;

-- Accès staff au contenu d'une conversation faisant l'objet
-- d'un signalement (phase 5). Refuse sinon.
create or replace function public.staff_get_reported_messages(
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

  return query
    select m.id, m.sender_id, m.body, m.image_path, m.created_at, m.read_at
    from public.messages m
    where m.conversation_id = p_conversation_id
    order by m.created_at;
end;
$$;

grant execute on function public.staff_get_reported_messages(uuid) to authenticated;

-- ============================================================
-- Realtime : messages et notifications (RLS appliquées)
-- ============================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;

-- ============================================================
-- Stockage : bucket privé « messages » (photos des conversations)
-- Convention de chemin : {conversation_id}/{fichier}
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messages', 'messages', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Lecture : participants de la conversation (chemin = 1er segment).
drop policy if exists messages_bucket_select on storage.objects;
create policy messages_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'messages'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and auth.uid() in (c.client_id, c.professional_id)
    )
  );

-- Écriture : participants d'une conversation ouverte, sans blocage.
drop policy if exists messages_bucket_insert on storage.objects;
create policy messages_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'messages'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and c.statut = 'ouverte'
        and auth.uid() in (c.client_id, c.professional_id)
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = c.client_id and b.blocked_id = c.professional_id)
             or (b.blocker_id = c.professional_id and b.blocked_id = c.client_id)
        )
    )
  );
