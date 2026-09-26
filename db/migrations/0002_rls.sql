-- =============================================================================
-- Cloisonnement par ligne (RLS)
--
-- Le schéma 0001 garantit que les données sont justes. Celui-ci garantit
-- qu'elles ne sont pas vues par quelqu'un qui n'a rien à y faire.
--
-- Une seule porte d'entrée, `can_see()` : la décision « cette ligne est-elle
-- la tienne » est écrite une fois, pas réécrite policy par policy. Une policy
-- nouvelle qui l'oublierait laisserait fuiter le compte d'un autre.
--
-- À appliquer APRÈS 0001, une fois le rôle de service créé :
--
--   CREATE ROLE invest_api LOGIN;
--   GRANT USAGE ON SCHEMA public TO invest_api;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO invest_api;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO invest_api;
--
-- Sur Neon, « neon_admin » possède la base et contourne la RLS : c'est
-- wanted, c'est lui qui applique les migrations. Les sessions applicatives,
-- elles, passent par invest_api. Si l'application se connecte avec le
-- propriétaire, cette migration n'a servi à rien : c'est le seul réglage qui
-- compte ici.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Qui parle
--
-- Le rôle est porté par un réglage de transaction posé par le backend après
-- avoir vérifié la session. Il n'est jamais déduit d'un paramètre envoyé par
-- le client, et il retombe à « personne » si le backend oublie de le poser :
-- l'échec doit être fermé, pas ouvert.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_actor() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- Le nom ne peut pas être `current_role` : c'est un mot réservé en SQL pour
-- le rôle PostgreSQL courant, et le redéfinir casse l'une des deux lectures.
CREATE OR REPLACE FUNCTION actor_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_role', true), '');
$$;

-- Un client, c'est lui. Un administrateur, c'est tout le monde. Absent de
-- session, c'est personne : la ligne est alors invisible.
CREATE OR REPLACE FUNCTION can_see(target_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE actor_role()
    WHEN 'CLIENT'      THEN target_user_id = current_actor()
    WHEN 'ADMIN'       THEN true
    WHEN 'SUPER_ADMIN' THEN true
    ELSE false
  END;
$$;

-- Qui décide : l'administration seule. Un client ne valide ni ne rejette rien,
-- pas même sa propre pièce KYC.
CREATE OR REPLACE FUNCTION is_service() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT actor_role() IN ('ADMIN', 'SUPER_ADMIN');
$$;

-- -----------------------------------------------------------------------------
-- Le grand livre
--
-- La table la plus sensible du schéma : elle reconstitue le patrimoine d'un
-- client ligne par ligne. Lecture pour le seul concerné, aucune écriture
-- directe : les lignes y entrent par les déclencheurs des opérations, jamais
-- par une requête applicative. Une écriture directe fausserait un solde sans
-- laisser de trace, ce qui est précisément ce que le grand livre interdit.
-- -----------------------------------------------------------------------------

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_read ON transactions
  FOR SELECT USING (can_see(user_id));

-- Aucune policy d'écriture : l'absence de policy est déjà le refus, puisque
-- seule une policy permissive peut autoriser une commande. Les lignes
-- entrent ici par les déclencheurs des opérations, jamais par une requête
-- applicative.
--
-- `FORCE ROW LEVEL SECURITY` est volontairement absent. Il assujettirait le
-- propriétaire lui-même, donc ces déclencheurs — qui écrivent avec ses droits
-- — seraient refusés, et personne ne pourrait plus confirmer un dépôt. La
-- protection réelle est ailleurs : l'application se connecte avec un rôle non
-- propriétaire, et seule cette migration s'exécute avec les droits du
-- propriétaire. C'est ce réglage de connexion qu'il faut vérifier avant de
-- mettre en service, pas un verrou de plus ici.

-- -----------------------------------------------------------------------------
-- Opérations : le client lit son propre dossier
-- -----------------------------------------------------------------------------

ALTER TABLE deposits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;

CREATE POLICY deposits_read ON deposits
  FOR SELECT USING (can_see(user_id));

CREATE POLICY withdrawals_read ON withdrawals
  FOR SELECT USING (can_see(user_id));

CREATE POLICY investments_read ON investments
  FOR SELECT USING (can_see(user_id));

CREATE POLICY investment_topups_read ON investment_topups
  FOR SELECT USING (can_see(user_id));

CREATE POLICY cards_read ON cards
  FOR SELECT USING (can_see(user_id));

CREATE POLICY card_requests_read ON card_requests
  FOR SELECT USING (can_see(user_id));

CREATE POLICY notifications_read ON notifications
  FOR SELECT USING (can_see(user_id));

-- `loan_schedule_items` n'a pas de colonne user_id : l'échéance se rattache à
-- son prêteur par le prêt. La sous-requête fait ce lien.
CREATE POLICY loan_schedule_read ON loan_schedule_items
  FOR SELECT USING (
    can_see((SELECT user_id FROM loans WHERE id = loan_id))
  );

-- Écriture : l'administration seule, et toujours par le backend. C'est lui
-- qui contrôle le montant et le solde, et qui applique les transitions de §19.
--
-- Il ne faut pas ajouter ici un `AS RESTRICTIVE FOR ALL USING (false)` pour
-- être explicite : une policy restrictive s'applique aussi à SELECT, et
-- rendrait ces lignes illisibles — y compris pour le client dont c'est le
-- propre dossier. Une policy d'écriture qui exige le rôle de service est
-- plus claire et fait le même travail.
CREATE POLICY deposits_service_write ON deposits
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY withdrawals_service_write ON withdrawals
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY investments_service_write ON investments
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY investment_topups_service_write ON investment_topups
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY loan_schedule_service_write ON loan_schedule_items
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY cards_service_write ON cards
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY card_requests_service_write ON card_requests
  FOR ALL USING (is_service()) WITH CHECK (is_service());

-- Une notification est un message du service : le client la lit, il n'en
-- fabrique pas.
CREATE POLICY notifications_service_write ON notifications
  FOR ALL USING (is_service()) WITH CHECK (is_service());

-- -----------------------------------------------------------------------------
-- Journal d'audit (§22)
--
-- Un client lit ses propres traces, pour voir ce que l'administration a fait
-- sur son dossier. Il n'en écrit aucune : une trace qu'un client peut
-- fabriquer n'a plus de valeur de preuve.
-- -----------------------------------------------------------------------------

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_read ON audit_logs
  FOR SELECT USING (target_user_id IS NOT NULL AND can_see(target_user_id));

-- Écriture : le service la seule. Un journal dont un client peut ajouter une
-- trace ne prouve plus rien — il faut pouvoir dire que ce qui est écrit est
-- écrit, et que seul le serveur écrit.
CREATE POLICY audit_logs_service_write ON audit_logs
  FOR INSERT WITH CHECK (is_service());

-- -----------------------------------------------------------------------------
-- Notes internes (§14)
--
-- Réservées à l'administration. Un client qui devinerait qu'une note existe
-- apprendrait déjà qu'un humain examine son dossier : l'information elle-même
-- ne lui appartient pas.
-- -----------------------------------------------------------------------------

ALTER TABLE internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY internal_notes_admin_only ON internal_notes
  FOR ALL USING (is_service()) WITH CHECK (is_service());

-- -----------------------------------------------------------------------------
-- KYC
--
-- Pièces d'identité. Le client dépose et voit les siennes ; l'administration
-- tranche. Personne ne décide à la place du client, et le client ne s'auto
-- approuve pas : la policy d'update est réservée au service, donc un client ne
-- peut pas passer son document de PENDING à APPROVED.
-- -----------------------------------------------------------------------------

ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY kyc_read ON kyc_documents
  FOR SELECT USING (can_see(user_id));

-- Le dépôt initial est la seule écriture du client, et seulement pour lui,
-- toujours à l'état PENDING : il dépose une pièce, il ne se note pas.
CREATE POLICY kyc_client_insert ON kyc_documents
  FOR INSERT WITH CHECK (user_id = current_actor() AND status = 'PENDING');

CREATE POLICY kyc_review_service_only ON kyc_documents
  FOR UPDATE USING (is_service()) WITH CHECK (is_service());

-- Remplacer une pièce hors délai reste possible : c'est un cas légitime de la
-- procédure, pas une backdoor.
CREATE POLICY kyc_client_delete ON kyc_documents
  FOR DELETE USING (can_see(user_id) AND status <> 'APPROVED');

-- -----------------------------------------------------------------------------
-- Identité
-- -----------------------------------------------------------------------------

-- Le client corrige son adresse ou son téléphone. Il ne touche ni à son rôle
-- ni à son statut : ces colonnes sont dans `users`, verrouillées plus bas.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read ON profiles
  FOR SELECT USING (can_see(user_id));

CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE USING (can_see(user_id)) WITH CHECK (user_id = current_actor());

-- `users` porte le rôle, le statut et le hash du mot de passe : c'est la table
-- qui décide de qui est administrateur. Aucune écriture applicative, donc un
-- client ne peut ni se promouvoir, ni se déclassifier, ni s'écrire un rôle.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_read ON users
  FOR SELECT USING (can_see(id));

-- Écriture : l'administration seule, et elle décide du rôle, du statut et du
-- mot de passe. Le client n'a rien à écrire ici — pas son rôle, pas son
-- statut, pas son hash. Un `WITH CHECK (false)` restreindrait aussi SELECT,
-- ce qui rendrait la table illisible : mieux vaut un refus par absence de
-- policy d'écriture, et une policy d'écriture qui exige le rôle de service.
CREATE POLICY users_admin_write ON users
  FOR INSERT WITH CHECK (is_service());

CREATE POLICY users_admin_update ON users
  FOR UPDATE USING (is_service()) WITH CHECK (is_service());

-- -----------------------------------------------------------------------------
-- Inscription
--
-- Sans cette policy, personne ne peut créer de compte.
--
-- `users_admin_write` exige un rôle d'administration, et une inscription
-- précisément n'en a pas encore : c'est le seul moment où il n'y a personne.
-- Sans ce qui suit, le parcours d'inscription de §3.2 est bloqué par la RLS.
--
-- Ce que la policy autorise n'est pas « créer un compte » mais « créer UN
-- compte, dans UN état ». La contrainte porte sur les deux seules colonnes
-- qui confèrent un privilège :
--
--   - role = 'CLIENT'      : impossible de s'inscrire administrateur ;
--   - status = 'PENDING'   : impossible de s'inscrire déjà vérifié.
--
-- Le rôle et le statut restent donc hors de portée du visiteur, qui est
-- exactement ce que §3.2 demande : le compte naît en attente de validation.
-- Une fois créé, le compte ne se modifie plus sans le rôle de service.
-- -----------------------------------------------------------------------------

CREATE POLICY users_self_register ON users
  FOR INSERT WITH CHECK (role = 'CLIENT' AND status = 'PENDING');

-- Le profil accompagne l'inscription. Il ne porte ni rôle ni statut, donc
-- aucune escalade n'y est possible : un profil orphelin ne donne accès à rien.
-- Le contrôle utile reste l'insertion de `users` ci-dessus.
CREATE POLICY profiles_self_register ON profiles
  FOR INSERT WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Ce que l'inscription ne peut pas faire
--
-- `INSERT … RETURNING <colonne>` est refusé ici, et c'est à prendre en compte
-- dans le code d'inscription. RLM évalue la clause RETURNING avec la policy de
-- LECTURE ; or le compte qui vient d'être créé n'a pas encore de session,
-- `users_read` rend false, et la ligne ne peut pas être relue. Un RETURNING
-- d'une constante passe, celui d'une colonne non. Un SELECT juste après,
-- tampoco. Pas plus un `WITH … INSERT … RETURNING` : la clause RETURNING y est
-- évaluée de la même façon, et l'ensemble échoue.
--
-- La forme qui marche, et qu'il faut donc écrire ainsi côté serveur :
--
--   1. générer l'identifiant du compte avant l'insertion — un uuidv4
--      produit par l'application, pas par la base, qui n'est pas
--      joignable pour cela ;
--   2. le passer dans `users` avec cet identifiant explicite ;
--   3. réutiliser le même identifiant pour le `profiles`.
--
-- Ce n'est pas une gêne, c'est le comportement voulu : un compte en attente de
-- validation ne doit rien pouvoir lire, pas même la ligne qui le décrit. Et
-- générer l'identifiant côté applicatif est de toute façon la pratique
-- habituelle, pour pouvoir assembler le compte et son profil en une seule
-- transaction sans avoir à relire quoi que ce soit.
-- -----------------------------------------------------------------------------

-- Le hash du mot de passe n'est jamais projeté vers le client. Il n'est pas
-- dans une policy — une policy filtre des lignes, pas des colonnes — mais
-- dans la forme que l'API lui donne : `SELECT id, email, role, status`, jamais
-- `SELECT *`. Cette vue rend l'omission impossible par construction.
CREATE VIEW user_directory AS
SELECT
  id, reference, email, role, status, last_login_at, created_at, updated_at
FROM users;

-- -----------------------------------------------------------------------------
-- Annexes du compte
--
-- Une adresse de dépôt est l'information la plus sensible d'un compte crypto :
-- celle qui la connaît peut y déposer, et son historique appartient à son
-- propriétaire. Création et activation restent des décisions d'administration
-- (§4) : le client ne s'attribue pas d'IBAN.
-- -----------------------------------------------------------------------------

ALTER TABLE bank_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallets     ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_accounts_read ON bank_accounts
  FOR SELECT USING (can_see(user_id));

CREATE POLICY bank_accounts_admin_only ON bank_accounts
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY crypto_addresses_read ON crypto_addresses
  FOR SELECT USING (can_see(user_id));

CREATE POLICY crypto_addresses_admin_only ON crypto_addresses
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY user_wallets_read ON user_wallets
  FOR SELECT USING (can_see(user_id));

CREATE POLICY user_wallets_admin_only ON user_wallets
  FOR ALL USING (is_service()) WITH CHECK (is_service());

-- Le second facteur est le secret le plus protégé du compte : ni le secret
-- chiffré ni les codes de récupération ne sortent par une session client. Le
-- backend les lit pour vérifier un code, jamais pour les renvoyer.
ALTER TABLE two_factor_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY two_factor_backend_only ON two_factor_settings
  FOR ALL USING (is_service()) WITH CHECK (is_service());

-- -----------------------------------------------------------------------------
-- Sessions et limitation de débit (§20)
-- -----------------------------------------------------------------------------

-- Un client voit ses propres sessions pour décider laquelle révoquer : c'est
-- un droit d'inspection légitime. Il ne les crée pas : le backend n'en ouvre
-- une qu'après avoir vérifié le mot de passe et le second facteur. Une session
-- auto-émise serait une session sans challenge.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_read ON sessions
  FOR SELECT USING (can_see(user_id));

-- Écriture réservée au service : c'est lui qui ouvre la session, après avoir
-- vérifié le mot de passe et le second facteur, et lui seul qui la révoque.
CREATE POLICY sessions_service_write ON sessions
  FOR INSERT WITH CHECK (is_service());

CREATE POLICY sessions_service_update ON sessions
  FOR UPDATE USING (is_service()) WITH CHECK (is_service());

CREATE POLICY known_devices_read ON known_devices
  FOR SELECT USING (can_see(user_id));

CREATE POLICY known_devices_service_write ON known_devices
  FOR ALL USING (is_service()) WITH CHECK (is_service());

ALTER TABLE rate_limit_buckets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE two_factor_challenges ENABLE ROW LEVEL SECURITY;

-- L'infrastructure n'appartient qu'au backend. Un compteur de limitation sans
-- user_id serait sinon vidable par le client qu'il est censé bloquer.
CREATE POLICY rate_limit_backend_only ON rate_limit_buckets
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY challenges_backend_only ON two_factor_challenges
  FOR ALL USING (is_service()) WITH CHECK (is_service());

-- -----------------------------------------------------------------------------
-- Référentiels publics
--
-- Le catalogue est public : c'est l'offre. Un brouillon et une archive ne le
-- sont pas — un produit archivé affiché à la vente est un produit vendu sans
-- base juridique.
-- -----------------------------------------------------------------------------

ALTER TABLE investment_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_products       ENABLE ROW LEVEL SECURITY;

CREATE POLICY investment_products_read ON investment_products
  FOR SELECT USING (status IN ('PUBLISHED', 'CLOSED') OR is_service());

CREATE POLICY investment_products_service_write ON investment_products
  FOR ALL USING (is_service()) WITH CHECK (is_service());

CREATE POLICY card_products_read ON card_products
  FOR SELECT USING (status IN ('PUBLISHED', 'CLOSED') OR is_service());

CREATE POLICY card_products_service_write ON card_products
  FOR ALL USING (is_service()) WITH CHECK (is_service());

-- Les vues de lecture héritent des policies des tables sous-jacentes, donc
-- `client_balances` et `admin_pending_review` sont déjà cloisonnées : un
-- client n'y voit que sa ligne. `client_balances` devient inutilisable côté
-- client, ce qui est le but — §17 veut le calcul serveur.
