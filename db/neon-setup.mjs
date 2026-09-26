#!/usr/bin/env node
/**
 * Génère db/neon-setup.sql.
 *
 * Un seul fichier à coller dans l'éditeur SQL de Neon, plutôt que cinq
 * migrations à copier une par une et dans le bon ordre. L'ordre des
 * migrations est une partie de leur sens : 0002 pose les policies sur des
 * colonnes que 0003 ajoute, et 0004 ajoute des valeurs à un type énuméré
 * créé par 0001.
 *
 * Le fichier est régénéré, jamais édité à la main. Pour changer le contenu,
 * changer une migration et relancer :
 *
 *   node db/neon-setup.mjs
 *
 * Vérification : le fichier produit est appliqué sur un PostgreSQL neuf par
 * db/test/run-schema-check.sh, qui échoue si une seule instruction est refusée.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "migrations");

// L'ordre est explicite et non alphabétique : 0010 avant 0002 n'a aucun sens,
// mais un tri de fichiers ferait exactement cela le jour où le dépôt en
// contiendra dix.
// 0005 accorde des droits au rôle applicatif : il doit exister avant, d'où la
// coupure. Voir ROLE_SECTION plus bas, appliquée entre 0004 et 0005.
const MIGRATIONS_BEFORE_ROLE = [
  "0001_init.sql",
  "0002_rls.sql",
  "0003_manual_assignment.sql",
  "0004_email_outbox.sql",
];

const MIGRATIONS_AFTER_ROLE = ["0005_ledger_trigger_security.sql"];

const header = `-- =============================================================================
-- NEON — installation complète
--
-- Fichier GÉNÉRÉ par db/neon-setup.mjs. Ne pas éditer à la main : modifier
-- une migration dans db/migrations/ et relancer le générateur.
--
-- À coller dans l'éditeur SQL de Neon, sur la base de production, avec le
-- rôle propriétaire (neondb_owner). Les migrations s'appliquent dans l'ordre,
-- une seule fois.
--
-- Ce que fait ce fichier :
--   1. crée le schéma, les contraintes, le grand livre et les soldes
--   2. active le cloisonnement par ligne
--   3. ajoute les contrôles de la saisie manuelle
--   4. crée la file d'envoi
--   5. donne aux déclencheurs du grand livre les droits de la base
--   6. crée le rôle applicatif, non propriétaire
--
-- Il ne fait PAS :
--   - créer le rôle avec un mot de passe. Un mot de passe écrit ici
--     finit dans ce fichier, donc dans le dépôt. Le rôle est créé sans
--     mot de passe ; la dernière section explique où le définir.
--   - charger le jeu de démonstration. C'est db/seed.sql, à part, et
--     seulement sur une base de recette.
-- =============================================================================

\\echo Plateforme d'investissement : installation du schéma
\\echo ''
`;

const separator = `
\\echo ''
\\echo '────────────────────────────────────────────────────────────────'
\\echo ''
`;

const roleSection = `
-- =============================================================================
-- Rôle applicatif
--
-- C'est la partie la plus importante du fichier, et la plus facile à rater.
--
-- Un rôle propriétaire contourne la RLS. Toujours, sans exception possible.
-- Si l'application se connecte avec \`neondb_owner\`, tout ce que 0002 vient
-- d'installer est inerte : un client pourrait lire le grand livre d'un autre,
-- lire les IBAN des autres, écrire dans le journal d'audit. Aucun test ne le
-- détecterait depuis l'application, parce que la base elle-même ne filtre
-- plus rien.
--
-- \`invest_api\` n'est donc PAS propriétaire. C'est lui que l'application doit
-- utiliser, et lui seul.
--
-- Il est créé ici, entre 0004 et 0005, et non à la fin : 0005 lui accorde des
-- droits d'exécution, et échouerait si le rôle n'existait pas. Les GRANT sur
-- les tables, eux, ne peuvent venir qu'après 0001 — ils sont donc dans la
-- section suivante.
-- =============================================================================

\\echo 'Création du rôle applicatif invest_api (non propriétaire)'

-- CREATE ROLE n'échoue pas si le rôle existe déjà : réexécuter le fichier
-- après la première installation doit rester possible.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'invest_api') THEN
    CREATE ROLE invest_api LOGIN;
    RAISE NOTICE 'rôle invest_api créé';
  ELSE
    RAISE NOTICE 'rôle invest_api déjà présent, inchangé';
  END IF;
END
$$;

\\echo ''
\\echo '────────────────────────────────────────────────────────────────'
\\echo ''
`;

const howToConnect = `
-- =============================================================================
-- À FAIRE ENSUITE, DANS L'ORDRE
-- =============================================================================

-- 1. Définir le mot de passe du rôle invest_api.
--
--    Pas ici : ce fichier est versionné, et un mot de passe écrit dedans
--    deviendrait un mot de passe versionné. Deux endroits possibles.
--
--    a) La console Neon — panneau « Roles », ajouter un mot de passe à
--       invest_api. C'est le plus simple, et la console affiche l'URL de
--       connexion complète.
--
--    b) En ligne, sur une seule connexion, puis fermez-la sans la partager :
--
--         ALTER ROLE invest_api PASSWORD 'votre-mot-de-passe';
--
-- 2. Remplacer DATABASE_URL par celle de invest_api, et non de neondb_owner.
--
--      L'URL donnée par la console pour invest_api contient déjà le bon nom
--      d'utilisateur. Si vous la construisez à la main :
--
--        postgresql://invest_api:MOT-DE-PASSE@ep-....aws.neon.tech/neondb?sslmode=require
--
--      Vérifiez le nom d'utilisateur dans l'URL. S'il dit encore
--      neondb_owner, la RLS est désactivée et vous ne le saurez pas.
--
-- 3. Garder l'URL de neondb_owner pour les migrations seulement.
--
--      Elle reste utile, elle ne doit juste jamais servir à l'application.
-- =============================================================================

-- =============================================================================
-- COMMENT L'APPLICATION DOIT SE CONNECTER
--
-- La RLM de 0002 se base sur deux réglages de transaction : \`app.user_id\` et
-- \`app.user_role\`. Ce ne sont pas des paramètres de connexion, ils sont posés
-- par le serveur à chaque transaction, après avoir vérifié la session.
--
-- C'est le seul endroit où la sécurité du cloisonnement repose sur le code
-- applicatif. Si \`app.user_role\` n'est pas posé, \`actor_role()\` rend NULL,
-- \`can_see()\` rend false, et la session ne voit RIEN : l'échec est fermé, pas
-- ouvert. Un client ne peut pas choisir son propre rôle en envoyant un
-- paramètre, puisque ces réglages viennent du serveur et non de la requête.
--
-- Exemple, pour la liste des dépôts d'un client :
--
--   BEGIN;
--   SET LOCAL app.user_id   = '00000000-0000-0000-0000-000000000000';
--   SET LOCAL app.user_role = 'CLIENT';
--   SELECT * FROM deposits;
--   COMMIT;
--
-- Pour l'administration, \`app.user_role = 'ADMIN'\` ou \`'SUPER_ADMIN'\`. C'est
-- le serveur qui choisit, à partir du rôle enregistré en base pour l'utilisateur
-- authentifié, jamais à partir de ce que le client demande.
-- =============================================================================

-- =============================================================================
-- VÉRIFICATION
--
-- À exécuter après avoir filled DATABASE_URL avec invest_api. Si une ligne
-- apparaît, le rôle est propriétaire et la RLS ne protège plus rien.
-- =============================================================================

\\echo ''
\\echo '=== VÉRIFICATION ==='
\\echo '--- 1. Le rôle applicatif ne doit pas être propriétaire ---'
SELECT rolname,
       rolsuper                                   AS superuser,
       rolcreatedb                                AS peut_creer_une_base,
       rolcreaterole                              AS peut_creer_des_roles,
       (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND pg_get_userbyid(c.relowner) = r.rolname) AS tables_possedees
  FROM pg_roles r
 WHERE rolname = 'invest_api';

\\echo '    La colonne tables_possedees doit valoir 0.'

\\echo ''
\\echo '--- 2. Le cloisonnement doit être actif sur les tables sensibles ---'
SELECT relname AS table,
       relrowsecurity AS rls_active
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND relname IN ('users', 'transactions', 'bank_accounts', 'crypto_addresses',
                   'cards', 'audit_logs', 'internal_notes', 'two_factor_settings',
                   'sessions', 'kyc_documents')
   AND relkind = 'r'
 ORDER BY relname;

\\echo '    rls_active doit valoir true partout.'

\\echo ''
\\echo '--- 3. Le grand livre doit être illisible sans session ---'
-- Aucune transaction ici, volontairement.
--
-- Ce contrôle se fait sans BEGIN ni ROLLBACK : une transaction explicite
-- annulerait l'installation entière si le fichier entier est exécuté dans une
-- seule transaction, ce que fait un éditeur SQL qui « applique tout d'un coup ».
-- Le ROLLBACK effacerait le schéma que les quatre migrations viennent
-- d'installer, et l'écran afficherait ensuite un compte de zéro table — sans
-- aucune erreur pour l'expliquer.
--
-- Le contrôle reste valable : hors transaction applicative, \`app.user_role\`
-- n'est pas posé, \`actor_role()\` rend NULL, \`can_see()\` rend false, et la
-- session ne voit rien. Un résultat non nul signifie que la RLS n'est pas en
-- place — ou que la connexion se fait avec un rôle propriétaire.
SELECT count(*) AS lignes_visibles_sans_session
  FROM transactions;

\\echo ''
\\echo '--- 4. Comptage du schéma installé ---'
SELECT count(*) FILTER (WHERE table_type = 'BASE TABLE')   AS tables,
       count(*) FILTER (WHERE table_type = 'VIEW')         AS vues
  FROM information_schema.tables
 WHERE table_schema = 'public';

\\echo ''
\\echo 'Installation terminée. Ne pas oublier :'
\\echo '  1. le mot de passe de invest_api (console Neon, ou ALTER ROLE) ;'
\\echo '  2. DATABASE_URL avec invest_api, et non neondb_owner ;'
\\echo '  3. les enregistrements DNS SPF, DKIM et DMARC pour le domaine d''envoi.'
`;

// L'ordre n'est pas alphabétique et n'est pas « tout puis le rôle » : 0005 a
// besoin du rôle pour accorder ses droits, et les GRANT du rôle ont besoin des
// tables de 0001. Le seul ordre qui fonctionne est donc 0001→0004, rôle, 0005,
// grants.
const grantsSection = `

-- =============================================================================
-- Droits du rôle applicatif
--
-- Ils viennent après les migrations : un GRANT sur toutes les tables porte sur
-- ce qui existe, et l'appliquer avant 0001 ne porterait sur rien.
-- =============================================================================

\\echo 'Attribution des droits à invest_api'

GRANT USAGE ON SCHEMA public TO invest_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO invest_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO invest_api;

-- Le rôle applicatif ne doit ni posséder ni supprimer. Ces deux droits lui
-- permettraient de contourner la RLM en devenant propriétaire d'une table.
REVOKE ALL ON SCHEMA public FROM invest_api;
GRANT USAGE ON SCHEMA public TO invest_api;
`;

const parts = [];
for (const name of MIGRATIONS_BEFORE_ROLE) {
  parts.push(`-- ${"-".repeat(76)}\n-- ${name}\n-- ${"-".repeat(76)}\n`);
  parts.push(await readFile(join(MIGRATIONS_DIR, name), "utf8"));
  parts.push(separator);
}
parts.push(roleSection);
for (const name of MIGRATIONS_AFTER_ROLE) {
  parts.push(`-- ${"-".repeat(76)}\n-- ${name}\n-- ${"-".repeat(76)}\n`);
  parts.push(await readFile(join(MIGRATIONS_DIR, name), "utf8"));
  parts.push(separator);
}
parts.push(grantsSection);
parts.push(howToConnect);

const output = header + parts.join("");
const target = join(here, "neon-setup.sql");
await writeFile(target, output, "utf8");

const bytes = Buffer.byteLength(output, "utf8");
const total = MIGRATIONS_BEFORE_ROLE.length + MIGRATIONS_AFTER_ROLE.length;
console.log(
  `${target} : ${total} migrations, ${output.split("\n").length} lignes, ${(bytes / 1024).toFixed(0)} Ko`,
);
