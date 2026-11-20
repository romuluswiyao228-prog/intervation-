-- ============================================================
-- Alignement avec le correctif appliqué manuellement dans le SQL Editor :
-- la fonction sync_phone_verified a été remplacée par une version
-- neutre (ne fait plus rien). Ce fichier fait correspondre le dépôt
-- à l'état réel de la base. Le trigger on_auth_user_phone_confirmed
-- reste en place mais n'a plus d'effet.
-- ============================================================

create or replace function public.sync_phone_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;
