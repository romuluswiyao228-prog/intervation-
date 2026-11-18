# Togo Intervention

Plateforme de mise en relation entre clients et professionnels de services au
Togo (électricité, plomberie, froid, maçonnerie…).

- **Stack** : React + Vite + TypeScript, Tailwind CSS, Supabase (Auth + Postgres + RLS), React Router.
- **PWA** : installable, manifest + service worker via `vite-plugin-pwa`.
- **Interface** : français, mobile-first.

## Lancement

```bash
npm install
npm run dev
```

Le site est alors disponible sur `http://localhost:5173`.

## Configuration Supabase (à faire manuellement)

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécuter la migration :
   `supabase/migrations/20261118000000_init_profiles.sql`
   (ou `supabase db push` si vous utilisez la CLI).
3. Dans **Authentication → Providers → Phone**, activer le fournisseur
   téléphone et configurer un fournisseur SMS (Twilio, MessageBird, Vonage…).
   Les identifiants du fournisseur SMS se règlent côté Supabase, pas dans ce
   dépôt : aucune clé n'est codée en dur ici.
4. Dans **Authentication → Sign In / Providers**, vérifier que
   l'authentification par téléphone est active et que la confirmation par SMS
   est requise pour les nouveaux comptes.
5. Récupérer **Project URL** et **anon public key** dans
   **Settings → API**, puis renseigner `.env` (voir `.env.example`).

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé anon publique |
| `VITE_PHONE_VERIFICATION_REQUIRED` | `true` (défaut) exige le code SMS ; `false` **uniquement en dev** crée les comptes avec `phone_verified = false` |

## Créer le premier administrateur

Aucun compte admin n'est créé par le code. Après que le propriétaire du site
s'est inscrit normalement (compte client ou professionnel) :

1. Récupérer son identifiant :

   ```sql
   select id, phone, display_name, role
   from public.profiles
   order by created_at;
   ```

2. Le passer administrateur (remplacer l'UUID par celui du compte réel) :

   ```sql
   update public.profiles
      set role = 'administrateur'
    where id = 'UUID-DU-COMPTE';
   ```

Le compte aura alors accès à `/espace/administration` à la prochaine connexion.

## Règles de données

- Aucune donnée fictive : pas de seed, pas de comptes de test, pas de
  statistiques ou témoignages inventés.
- Les rôles `administrateur` et `moderateur` ne peuvent être attribués que via
  le SQL ci-dessus (RLS + trigger côté base).
- Un utilisateur ne peut pas modifier son propre `role`, `status` ni
  `phone_verified` ; seul un administrateur peut le faire.

## Structure

```
src/
  pages/       pages (accueil, auth, espaces)
  components/  composants réutilisables
  hooks/       useAuth (session + profil)
  lib/         client Supabase, types, constantes, utilitaires téléphone
  routes/      définition des routes
supabase/
  migrations/  SQL (profiles + RLS + triggers)
```
