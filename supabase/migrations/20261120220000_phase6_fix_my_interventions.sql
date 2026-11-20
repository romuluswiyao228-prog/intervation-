-- Phase 6 (correctif) : my_interventions doit exposer proposee_par
-- pour que l'interface sache qui peut répondre à une proposition.
-- Le type de retour change → DROP puis recréation.

drop function if exists public.my_interventions();

create function public.my_interventions()
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
  proposee_par uuid,
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
    i.proposee_par,
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
