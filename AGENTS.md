# Togo Intervention — notes projet

Plateforme de mise en relation clients/professionnels au Togo.
Stack : React + Vite + TS, Tailwind v4, Supabase (Auth phone + Postgres + RLS), React Router, PWA (vite-plugin-pwa).

## État (phase 1 terminée)

- Code complet : accueil, auth (inscription téléphone+SMS, connexion, reset MDP par OTP), espaces client/pro/admin, pages légales vides.
- `.env` renseigné avec le vrai projet Supabase (2026-11-18).
- **EN ATTENTE** : la migration `supabase/migrations/20261118000000_init_profiles.sql`
  n'a PAS encore été exécutée. Vérifié via REST : `PGRST205 table 'public.profiles' introuvable`.
  → L'utilisateur doit la coller dans SQL Editor → Run.
- Après migration : revérifier `GET /rest/v1/profiles` (doit renvoyer `[]`).
- Config Supabase à vérifier aussi : provider Phone activé + fournisseur SMS,
  confirmation téléphone requise à l'inscription.
- `VITE_PHONE_VERIFICATION_REQUIRED=true` dans `.env` (prod-like).

## Commandes

- Dev : `npm run dev` (port 5173)
- Build : `npm run build` — lint : `npm run lint` (oxlint)

## Règles

- AUCUNE donnée fictive (pas de seed, pas de faux comptes/avis/stats).
- `APP_NAME` dans `src/lib/constants.ts` = seul endroit pour changer le nom.
- Rôles admin/modérateur : uniquement via SQL (procédure dans README).
- Ne pas ajouter de dépendance sans demander.
