-- Correctif : un REVOKE manuel (hors migrations) a retiré SELECT/INSERT/UPDATE/DELETE
-- à anon, authenticated et service_role sur TOUTES les tables de public
-- (constaté sur profiles, categories, messages, metiers…). L'API renvoyait
-- "permission denied for table …" partout.
--
-- On rétablit les privilèges standard Supabase sur toutes les tables
-- (la RLS reste la barrière : ces GRANT ne rouvrent que l'accès technique,
-- les policies continuent de filtrer les lignes), puis on resserre profiles :
-- pas d'INSERT/DELETE côté client et UPDATE limité aux colonnes modifiables.
-- role, status, phone et phone_verified ne sont pas modifiables en écriture
-- (les changements sensibles passent par les fonctions SECURITY DEFINER).

-- 1) Privilèges par défaut sur toutes les tables existantes.
grant all privileges on all tables in schema public
  to anon, authenticated, service_role;

-- Idem pour les tables, séquences et fonctions créées plus tard.
alter default privileges in schema public
  grant all privileges on tables
  to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage on sequences
  to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions
  to anon, authenticated, service_role;

-- Séquences et fonctions existantes (SECURITY DEFINER inclus : leurs
-- contrôles de rôle internes restent la barrière réelle).
grant usage on all sequences in schema public
  to anon, authenticated, service_role;
grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- 2) profiles : le trigger handle_new_user insère en SECURITY DEFINER,
--    le client n'a pas besoin d'INSERT/DELETE, et anon ne lit rien.
revoke insert, update, delete on public.profiles
  from anon, authenticated;
revoke select on public.profiles from anon;

-- Lecture : toutes les colonnes (les policies RLS limitent déjà les lignes).
grant select on public.profiles to authenticated;

-- Écriture : uniquement les champs de profil modifiables par l'utilisateur.
grant update (display_name, city, neighborhood, accepted_terms_at)
  on public.profiles to authenticated;

-- service_role garde tous les droits (usage backend de confiance).
grant all privileges on public.profiles to service_role;

-- Rechargement du cache PostgREST pour prendre en compte les GRANT.
notify pgrst, 'reload schema';
