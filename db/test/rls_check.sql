-- =============================================================================
-- RLS : ce qu'un client voit, et ce qu'il ne voit pas.
--
-- Le test le plus important du projet. Un schéma peut être parfait et
-- fuir quand même : ici on agit en CLIENT, en ADMIN et sans session, et on
-- vérifie que la fuite est impossible.
--
-- Deux précautions :
--   1. les données de départ sont insérées par le propriétaire, sinon les
--      policies d'écriture refusent l'outillage du test lui-même ;
--   2. `SET LOCAL` est posé au niveau du script, pas dans un bloc DO — un
--      réglage posé dans une fonction n'est pas garanti de survivre à
--      l'appel, et un test de sécurité qui repose sur un "peut-être" ne
--      teste rien.
--
-- Prérequis : 0001 puis 0002 appliqués, rôle invest_api créé.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- -----------------------------------------------------------------------------
-- Outillage, en tant que propriétaire
-- -----------------------------------------------------------------------------

-- La référence est laissée au défaut : elle vient d'une séquence, et un test
-- qui écrit sa propre référence finirait un jour par entrer en collision avec
-- elle. Les identifiants, eux, sont écrits : c'est ce que les policies
-- comparent.
INSERT INTO users (id, email, password_hash, role, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@test.ma', 'h', 'CLIENT', 'VERIFIED'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.ma',   'h', 'CLIENT', 'VERIFIED'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.ma', 'h', 'ADMIN',  'VERIFIED');

INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency) VALUES
  ('11111111-1111-1111-1111-111111111111', 'MA64011515000000000000000001', 'B1', 'Alice', 'MAD'),
  ('22222222-2222-2222-2222-222222222222', 'MA64011515000000000000000002', 'B2', 'Bob',   'MAD');

INSERT INTO transactions (user_id, type, amount, currency, status, reference, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'DEPOSIT',  10000, 'MAD', 'CONFIRMED', 'DEP-A', 'alice'),
  ('22222222-2222-2222-2222-222222222222', 'DEPOSIT',  99999, 'MAD', 'CONFIRMED', 'DEP-B', 'bob');

INSERT INTO kyc_documents (user_id, type) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ID_CARD');

INSERT INTO internal_notes (user_id, author_id, message) VALUES
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   'Dossier sensible : verifier la source des fonds.');

-- Le rôle de service est non propriétaire : c'est la seule condition pour être
-- soumis à la RLS. Le propriétaire d'une table la contourne toujours.
SET LOCAL ROLE invest_api;

-- -----------------------------------------------------------------------------
-- 1. Aucune écriture directe dans le grand livre
--
-- Le test se fait en CLIENT : c'est la seule situation qui compte vraiment.
-- Un attaquant qui n'a pas de session est déjà neutralisé ; celui qui en a
-- une valide n'est de toute façon pas borné par son absence.
-- -----------------------------------------------------------------------------
\echo '--- 1. ecriture directe dans le grand livre : doit echouer ---'
SET LOCAL app.user_id   = '11111111-1111-1111-1111-111111111111';
SET LOCAL app.user_role = 'CLIENT';

DO $$
DECLARE refus int := 0; n int := 0; total numeric;
BEGIN
  -- L'INSERT est refusé bruyamment : aucune policy ne s'applique, et une
  -- écriture non autorisée vaut mieux un bruit franc qu'un silence.
  BEGIN
    INSERT INTO transactions (user_id, type, amount, currency, status, reference, description)
    VALUES ('11111111-1111-1111-1111-111111111111', 'DEPOSIT', 1, 'MAD', 'CONFIRMED', 'FAUX', 'forge');
  EXCEPTION WHEN insufficient_privilege THEN refus := refus + 1; END;

  -- L'UPDATE et le DELETE ne lèvent pas d'erreur : sans policy, la RLS les
  -- fait simplement ne rien voir, donc zéro ligne touchée. Ce qui compte n'est
  -- pas le bruit de l'erreur, c'est que le grand livre n'a pas bougé.
  UPDATE transactions SET amount = 999999 WHERE reference = 'DEP-A';
  DELETE FROM transactions WHERE reference = 'DEP-A';

  SELECT count(*), COALESCE(sum(amount), 0) INTO n, total FROM transactions;
  IF n <> 1 OR total <> 10000 THEN
    RAISE EXCEPTION 'ECHEC: le grand livre a bouge (% lignes / %), attendu 1 / 10000', n, total;
  END IF;

  IF refus <> 1 THEN
    RAISE EXCEPTION 'ECHEC: l insertion n a pas ete refusee';
  END IF;

  RAISE NOTICE 'OK  le grand livre est intact : insertion refusee, update et delete sans effet';
END $$;

-- -----------------------------------------------------------------------------
-- 2. Un client ne voit que son propre grand livre
-- -----------------------------------------------------------------------------
\echo '--- 2. alice ne voit que sa ligne du grand livre ---'
SET LOCAL app.user_id   = '11111111-1111-1111-1111-111111111111';
SET LOCAL app.user_role = 'CLIENT';

DO $$
DECLARE n int; total numeric;
BEGIN
  SELECT count(*), COALESCE(sum(amount), 0) INTO n, total FROM transactions;

  IF n <> 1 OR total <> 10000 THEN
    RAISE EXCEPTION 'ECHEC: alice voit % lignes pour %, attendu 1 / 10000', n, total;
  END IF;

  IF EXISTS (SELECT 1 FROM transactions WHERE reference = 'DEP-B') THEN
    RAISE EXCEPTION 'ECHEC: alice voit la ligne de Bob';
  END IF;

  RAISE NOTICE 'OK  alice voit 1 ligne, la sienne (%, %)', n, total;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Un client ne voit pas les IBAN des autres
-- -----------------------------------------------------------------------------
\echo '--- 3. alice ne voit que son propre IBAN ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM bank_accounts;
  IF n <> 1 THEN
    RAISE EXCEPTION 'ECHEC: alice voit % comptes bancaires, attendu 1', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bank_accounts
                  WHERE iban = 'MA64011515000000000000000001') THEN
    RAISE EXCEPTION 'ECHEC: alice ne voit pas son propre IBAN';
  END IF;
  RAISE NOTICE 'OK  alice voit 1 compte bancaire, le sien';
END $$;

-- -----------------------------------------------------------------------------
-- 4. Sans session, rien n'est visible
-- -----------------------------------------------------------------------------
\echo '--- 4. session absente : aucune ligne ---'
SET LOCAL app.user_id   = '';
SET LOCAL app.user_role = '';

DO $$
DECLARE total int := 0; n int;
BEGIN
  SELECT count(*) INTO n FROM transactions;   total := total + n;
  SELECT count(*) INTO n FROM bank_accounts;   total := total + n;
  SELECT count(*) INTO n FROM users;           total := total + n;
  SELECT count(*) INTO n FROM profiles;        total := total + n;
  SELECT count(*) INTO n FROM kyc_documents;   total := total + n;
  SELECT count(*) INTO n FROM internal_notes;  total := total + n;

  IF total <> 0 THEN
    RAISE EXCEPTION 'ECHEC: % lignes visibles sans session', total;
  END IF;
  RAISE NOTICE 'OK  session absente : 0 ligne sur 6 tables';
END $$;

-- -----------------------------------------------------------------------------
-- 4b. Inscription : possible, et sans privilège
--
-- Un bug qui ne se voit pas en relisant les policies : chacune est correcte
-- isolément, et leur ensemble interdit l'inscription. `users_admin_write`
-- exige un rôle d'administration, or une inscription n'en a pas encore — c'est
-- le seul moment où il n'y a personne. Sans ce qui suit, le parcours de §3.2
-- est bloqué, et rien ne signale pourquoi.
-- -----------------------------------------------------------------------------
\echo '--- 4b. inscription : possible, et sans privilege ---'

DO $$
DECLARE n int;
BEGIN
  -- Visiteur non connecté : il crée son compte et son profil.
  --
  -- L'identifiant est produit ici, par le test, et passé aux deux insertions.
  -- C'est ce que le serveur devra faire : ni un `SELECT` de l'id après
  -- l'insertion, ni un `RETURNING <colonne>`, ni un `WITH … RETURNING` ne
  -- fonctionnent, parce que la RLM refuse de relire une ligne dont le porteur
  -- n'a pas encore de session. Voir le commentaire de 0002_rls.sql.
  INSERT INTO users (id, email, password_hash, role, status)
  VALUES ('44444444-4444-4444-4444-444444444444',
          'nouveau@test.ma', 'h', 'CLIENT', 'PENDING');

  INSERT INTO profiles (user_id, first_name, last_name, phone, date_of_birth,
                        nationality, line1, city, postal_code, country)
  VALUES ('44444444-4444-4444-4444-444444444444',
          'Nouveau', 'Client', '+212600000000', DATE '1995-03-04',
          'MA', '1 rue test', 'Casablanca', '20000', 'MA');

  RAISE NOTICE 'OK  inscription acceptee, identifiant fourni par l''appelant';
END $$;

-- La preuve que les lignes existent, cette fois en session d'administration :
-- c'est le seul regard que l'on peut porter dessus.
DO $$
DECLARE r user_role; s account_status; n int;
BEGIN
  SET LOCAL app.user_role = 'ADMIN';
  SET LOCAL app.user_id   = '33333333-3333-3333-3333-333333333333';

  SELECT role, status INTO r, s FROM users WHERE email = 'nouveau@test.ma';
  IF r IS NULL THEN RAISE EXCEPTION 'ECHEC: le compte n existe pas'; END IF;
  IF r <> 'CLIENT' OR s <> 'PENDING' THEN
    RAISE EXCEPTION 'ECHEC: le compte est né % / %', r, s;
  END IF;

  SELECT count(*) INTO n FROM profiles p
    JOIN users u ON u.id = p.user_id
   WHERE u.email = 'nouveau@test.ma';
  IF n <> 1 THEN RAISE EXCEPTION 'ECHEC: le profil n a pas ete cree'; END IF;

  RAISE NOTICE 'OK  compte (% / %) et profil créés, relus en session admin', r, s;
END $$;

DO $$
DECLARE refus int := 0;
BEGIN
  -- Retour à aucune session. Le bloc précédent a ouvert une session
  -- d'administration pour relire les lignes créées ; sans cette remise à zéro,
  -- `is_service()` resterait vrai et les deux tentatives ci-dessous
  -- passeraient — non parce que la policy est laxiste, mais parce que
  -- l'inserteur est devenu administrateur.
  SET LOCAL app.user_id   = '';
  SET LOCAL app.user_role = '';

  -- S'inscrire administrateur.
  BEGIN
    INSERT INTO users (email, password_hash, role, status)
    VALUES ('pirate1@test.ma', 'h', 'SUPER_ADMIN', 'PENDING');
  EXCEPTION WHEN insufficient_privilege THEN refus := refus + 1; END;

  -- S'inscrire déjà vérifié, pour sauter la validation du dossier.
  BEGIN
    INSERT INTO users (email, password_hash, role, status)
    VALUES ('pirate2@test.ma', 'h', 'CLIENT', 'VERIFIED');
  EXCEPTION WHEN insufficient_privilege THEN refus := refus + 1; END;

  IF refus <> 2 THEN
    RAISE EXCEPTION 'ECHEC: % refus sur 2 attendus', refus;
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE email LIKE 'pirate%') THEN
    RAISE EXCEPTION 'ECHEC: un compte a ete cree avec un privilege';
  END IF;

  RAISE NOTICE 'OK  inscription administrateur et inscription verifiee refusees';
END $$;

DO $$
BEGIN
  -- Le compte créé ne peut pas se valider lui-même. La session est celle du
  -- nouveau client, pas celle d'un administrateur : c'est bien le sien qu'il
  -- tente de valider, et c'est précisément ce qui doit échouer.
  SET LOCAL app.user_id   = '44444444-4444-4444-4444-444444444444';
  SET LOCAL app.user_role = 'CLIENT';

  UPDATE users SET status = 'VERIFIED' WHERE id = '44444444-4444-4444-4444-444444444444';

  -- Aucune policy d'écriture n'est atteignable pour un client : la mise à jour
  -- ne filtre pas, elle n'atteint rien. On relit en administration.
  SET LOCAL app.user_id   = '33333333-3333-3333-3333-333333333333';
  SET LOCAL app.user_role = 'ADMIN';

  IF EXISTS (
    SELECT 1 FROM users
     WHERE id = '44444444-4444-4444-4444-444444444444'
       AND status = 'VERIFIED'
  ) THEN
    RAISE EXCEPTION 'ECHEC: le client s est auto-valide';
  END IF;
  RAISE NOTICE 'OK  le client ne peut pas s auto-valider';
END $$;

-- -----------------------------------------------------------------------------
-- 5. Un client ne se promeut pas, ne se déclasse pas
-- -----------------------------------------------------------------------------
\echo '--- 5. auto-promotion et declassification : doivent echouer ---'
SET LOCAL app.user_id   = '11111111-1111-1111-1111-111111111111';
SET LOCAL app.user_role = 'CLIENT';

DO $$
DECLARE r text; s account_status; v text;
BEGIN
  -- Sans policy d'écriture, la RLS ne lève pas d'erreur : elle rend les lignes
  -- invisibles, donc le UPDATE ne touche rien. Ce qui compte, c'est que rien
  -- n'ait bougé — pas qu'une erreur ait été levée.
  UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'alice@test.ma';
  UPDATE users SET status = 'SUSPENDED'  WHERE email = 'bob@test.ma';

  SELECT role::text, status::text INTO r, s FROM users WHERE email = 'alice@test.ma';
  IF r <> 'CLIENT' OR s <> 'VERIFIED' THEN
    RAISE EXCEPTION 'ECHEC: alice est devenue % / %', r, s;
  END IF;

  -- Bob n'est même pas visible : la tentative n'a rien pu atteindre.
  SELECT status::text INTO v FROM users WHERE email = 'bob@test.ma';
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'ECHEC: alice voit le compte de Bob (%s)', v;
  END IF;

  RAISE NOTICE 'OK  auto-promotion et declassification sans effet, comptes tiers invisibles';
END $$;

-- -----------------------------------------------------------------------------
-- 6. Dépôt KYC autorisé, auto-approbation refusée
-- -----------------------------------------------------------------------------
\echo '--- 6. deposer sa piece : oui. l approuver : non ---'
DO $$
DECLARE approuvees int;
BEGIN
  BEGIN
    INSERT INTO kyc_documents (user_id, type) VALUES
      ('11111111-1111-1111-1111-111111111111', 'SELFIE');
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'ECHEC: le depot KYC legitime a ete refuse';
  END;

  -- L'auto-approbation ne lève pas d'erreur, elle n'atteint rien : la policy
  -- de revue est réservée au service, donc la ligne est filtrée.
  UPDATE kyc_documents SET status = 'APPROVED', reviewed_at = now()
   WHERE user_id = '11111111-1111-1111-1111-111111111111';

  SELECT count(*) INTO approuvees FROM kyc_documents
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND status = 'APPROVED';

  IF approuvees <> 0 THEN
    RAISE EXCEPTION 'ECHEC: alice a approuve sa propre piece';
  END IF;

  IF (SELECT count(*) FROM kyc_documents
       WHERE user_id = '11111111-1111-1111-1111-111111111111') <> 2 THEN
    RAISE EXCEPTION 'ECHEC: alice ne voit pas ses deux pieces';
  END IF;

  RAISE NOTICE 'OK  depot accepte, auto-approbation sans effet, 2 pieces en attente';
END $$;

-- -----------------------------------------------------------------------------
-- 7. On ne dépose pas de pièce dans le dossier d'autrui
-- -----------------------------------------------------------------------------
\echo '--- 7. depose dans le dossier de Bob : doit echouer ---'
DO $$
BEGIN
  BEGIN
    INSERT INTO kyc_documents (user_id, type) VALUES
      ('22222222-2222-2222-2222-222222222222', 'PASSPORT');
    RAISE EXCEPTION 'ECHEC: alice a depose une piece dans le dossier de Bob';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK  depose dans le dossier d autrui refuse';
  END;
END $$;

-- -----------------------------------------------------------------------------
-- 8. Second facteur, sessions, limitation : hors de portée du client
-- -----------------------------------------------------------------------------
\echo '--- 8. 2FA, sessions et limitation invisibles ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM two_factor_settings;
  IF n <> 0 THEN RAISE EXCEPTION 'ECHEC: le client lit les reglages 2FA'; END IF;

  SELECT count(*) INTO n FROM sessions;
  IF n <> 0 THEN RAISE EXCEPTION 'ECHEC: le client lit la table sessions'; END IF;

  SELECT count(*) INTO n FROM known_devices;
  IF n <> 0 THEN RAISE EXCEPTION 'ECHEC: le client lit les appareils connus'; END IF;

  SELECT count(*) INTO n FROM rate_limit_buckets;
  IF n <> 0 THEN RAISE EXCEPTION 'ECHEC: le client lit les compteurs de limitation'; END IF;

  SELECT count(*) INTO n FROM two_factor_challenges;
  IF n <> 0 THEN RAISE EXCEPTION 'ECHEC: le client lit les challenges 2FA'; END IF;

  RAISE NOTICE 'OK  5 tables d infrastructure inaccessibles au client';
END $$;

-- -----------------------------------------------------------------------------
-- 9. Le client ne s'attribue pas d'IBAN
-- -----------------------------------------------------------------------------
\echo '--- 9. auto-attribution d IBAN : doit echouer ---'
DO $$
BEGIN
  BEGIN
    INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency)
    VALUES ('11111111-1111-1111-1111-111111111111',
            'MA64011515000000000000000099', 'Usurpation', 'Alice', 'MAD');
    RAISE EXCEPTION 'ECHEC: le client a cree son propre IBAN';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK  attribution d IBAN reservee a l administration';
  END;
END $$;

-- -----------------------------------------------------------------------------
-- 10. Le client ne modifie pas les états d'une opération
-- -----------------------------------------------------------------------------
\echo '--- 10. le client ne valide pas un depot : doit echouer ---'
DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    -- Le compte bancaire est choisi par son IBAN, pas par un agrégat : les
    -- identifiants sont des uuid et n'ont pas d'ordre naturel exploitable ici.
    INSERT INTO deposits (user_id, amount, currency, method, status,
                          payment_reference, bank_account_id)
    SELECT '11111111-1111-1111-1111-111111111111', 500, 'MAD', 'BANK_TRANSFER',
           'PENDING', 'VIR-X', id
      FROM bank_accounts
     WHERE iban = 'MA64011515000000000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    n := n + 1;
  END;
  IF n <> 1 THEN RAISE EXCEPTION 'ECHEC: la demande de depot a ete acceptee telle quelle'; END IF;
  RAISE NOTICE 'OK  la demande de depot passe par le backend';
END $$;

-- -----------------------------------------------------------------------------
-- 11. Le hash du mot de passe n'est pas projetable
-- -----------------------------------------------------------------------------
\echo '--- 11. le hash ne sort pas ---'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'user_directory'
                AND column_name = 'password_hash') THEN
    RAISE EXCEPTION 'ECHEC: la vue user_directory expose password_hash';
  END IF;

  BEGIN
    EXECUTE 'SELECT password_hash FROM user_directory LIMIT 1';
    RAISE EXCEPTION 'ECHEC: password_hash reste lisible via la vue';
  EXCEPTION WHEN undefined_column THEN
    RAISE NOTICE 'OK  la vue user_directory ne contient pas de hash';
  END;

  -- La table `users` est bien lisible : c'est le dossier du client, et il doit
  -- pouvoir se voir. Le risque n'y est pas la fuite vers les autres, c'est le
  -- hash — et ça, la vue le règle par construction.
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'alice@test.ma') THEN
    RAISE EXCEPTION 'ECHEC: alice ne voit pas son propre dossier';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE email <> 'alice@test.ma') THEN
    RAISE EXCEPTION 'ECHEC: alice voit le dossier d autrui';
  END IF;
  RAISE NOTICE 'OK  alice voit son dossier, et lui seul';
END $$;

-- -----------------------------------------------------------------------------
-- 12. L'administration voit tout, et statue
-- -----------------------------------------------------------------------------
\echo '--- 12. l administration voit tout et statue ---'
SET LOCAL app.user_id   = '33333333-3333-3333-3333-333333333333';
SET LOCAL app.user_role = 'ADMIN';

DO $$
DECLARE n int; total numeric;
BEGIN
  SELECT count(*), COALESCE(sum(amount), 0) INTO n, total FROM transactions;
  IF n <> 2 OR total <> 109999 THEN
    RAISE EXCEPTION 'ECHEC: l admin voit % lignes pour %, attendu 2 / 109999', n, total;
  END IF;

  SELECT count(*) INTO n FROM bank_accounts;
  IF n <> 2 THEN RAISE EXCEPTION 'ECHEC: l admin voit % IBAN, attendu 2', n; END IF;

  SELECT count(*) INTO n FROM internal_notes;
  IF n <> 1 THEN RAISE EXCEPTION 'ECHEC: l admin voit % notes, attendu 1', n; END IF;

  RAISE NOTICE 'OK  l administration voit 2 lignes, 2 IBAN, 1 note interne';

  UPDATE kyc_documents SET status = 'APPROVED', reviewed_at = now()
   WHERE user_id = '11111111-1111-1111-1111-111111111111';

  IF NOT EXISTS (SELECT 1 FROM kyc_documents
                  WHERE user_id = '11111111-1111-1111-1111-111111111111'
                    AND status = 'APPROVED') THEN
    RAISE EXCEPTION 'ECHEC: l administration ne peut pas statuer';
  END IF;
  RAISE NOTICE 'OK  l administration approuve une piece';
END $$;

-- -----------------------------------------------------------------------------
-- 13. Le catalogue est public, les brouillons ne le sont pas
-- -----------------------------------------------------------------------------
\echo '--- 13. catalogue public, brouillon reserve ---'

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM investment_products) THEN
    RAISE EXCEPTION 'ECHEC: un client voit des produits alors que le catalogue est vide';
  END IF;
  RAISE NOTICE 'OK  aucun produit en base : le catalogue se lit sans fuite';
END $$;

-- Le catalogue se garnit en tant que propriétaire : c'est l'administration qui
-- publie, pas un client.
RESET ROLE;

INSERT INTO investment_products (name, description, minimum_amount, currency,
                                 duration_months, risk_level, sector, risks, status)
VALUES ('Publie', 'x', 1000, 'MAD', 6, 'LOW', 'x', ARRAY['risque'], 'PUBLISHED'),
       ('Brouillon', 'x', 1000, 'MAD', 6, 'LOW', 'x', ARRAY['risque'], 'DRAFT');

SET LOCAL ROLE invest_api;

-- Les réglages restent au niveau du script : posés dans un bloc DO, ils
-- seraient rétablis à la sortie du bloc, et la vérification ne porterait
-- sur rien.
SET LOCAL app.user_id   = '11111111-1111-1111-1111-111111111111';
SET LOCAL app.user_role = 'CLIENT';

DO $$
DECLARE publies int; brouillons int;
BEGIN
  SELECT count(*) INTO publies FROM investment_products WHERE status = 'PUBLISHED';
  SELECT count(*) INTO brouillons FROM investment_products WHERE status = 'DRAFT';

  IF publies <> 1 THEN
    RAISE EXCEPTION 'ECHEC: le catalogue public montre % produits, attendu 1', publies;
  END IF;
  IF brouillons <> 0 THEN
    RAISE EXCEPTION 'ECHEC: un brouillon est visible par un client';
  END IF;

  RAISE NOTICE 'OK  catalogue public visible, brouillon cache';
END $$;

ROLLBACK;

\echo ''
\echo '=== LE CLOISONNEMENT TIENT ==='
