-- =============================================================================
-- Le parcours financier, avec les droits de l'application
--
-- Toutes les autres batteries tournent avec les droits du propriétaire, qui
-- contourne la RLM. C'est normal pour tester des contraintes, et c'est
-- exactement ce qui les rend incapables de voir le plus grave des défauts :
-- un déclencheur qui n'arrive pas à écrire parce que la session n'a pas le
-- droit.
--
-- Ce fichier fait donc le contraire. Il crée le rôle applicatif, s'en sert
-- pour confirmer un dépôt, activer un investissement, décaisser un prêt et
-- terminer un retrait — et exige que le grand livre reçoive chaque fois la
-- ligne attendue.
--
-- Un échec ici signifie que la plateforme ne fonctionne pas, quel que soit le
-- nombre de contrôles qui passent ailleurs.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- Outillage, avec les droits du propriétaire
-- -----------------------------------------------------------------------------

INSERT INTO users (id, email, password_hash, role, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@test.ma',  'h', 'CLIENT', 'VERIFIED'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.ma',    'h', 'CLIENT', 'VERIFIED'),
  ('33333333-3333-3333-3333-333333333333', 'sofia@test.ma',  'h', 'ADMIN',  'VERIFIED'),
  ('44444444-4444-4444-4444-444444444444', 'mehdi@test.ma',  'h', 'ADMIN',  'VERIFIED')
ON CONFLICT (email) DO NOTHING;

-- Le premier administrateur ne peut pas être créé par l'application : il n'y a
-- personne pour l'attribuer. C'est une étape d'amorçage, faite par le
-- propriétaire, et c'est.normal.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN');
  IF n = 0 THEN RAISE EXCEPTION 'ECHEC: aucun administrateur pour la suite'; END IF;
  RAISE NOTICE 'OK  % administrateur(s) prets', n;
END $$;

-- `SET ROLE`, et non `SET LOCAL ROLE`.
--
-- `SET LOCAL` ne vit que le temps de la transaction courante. Ce fichier n'est
-- pas enveloppé dans un `BEGIN` : hors transaction, un `SET LOCAL` ne s'applique
-- qu'à l'instruction qui suit, et tout le reste du fichier s'exécute avec le
-- rôle propriétaire — donc sans RLM du tout. Le fichier passerait au vert en
-- testant exactement le contraire de ce qu'il prétend tester.
--
-- L'assertion ci-dessous existe pour que cette erreur ne puisse pas revenir
-- silencieusement.
SET ROLE invest_api;

DO $$
BEGIN
  IF current_user <> 'invest_api' THEN
    RAISE EXCEPTION
      'Ce fichier doit tourner avec les droits de invest_api, il tourne avec %',
      current_user;
  END IF;
  RAISE NOTICE 'OK  la session est bien invest_api, donc soumise a la RLM';
END $$;

\echo ''
\echo '=== 1. inscription, sans session ==='

DO $$
DECLARE n int;
BEGIN
  -- L'identifiant est produit par l'appelant : ni RETURNING ni SELECT ne
  -- fonctionnent ici, la RLM refusant de relire une ligne dont le porteur n'a
  -- pas de session.
  INSERT INTO users (id, email, password_hash, role, status)
  VALUES ('55555555-5555-5555-5555-555555555555',
          'nouveau@test.ma', 'h', 'CLIENT', 'PENDING');

  INSERT INTO profiles (user_id, first_name, last_name, phone, date_of_birth,
                        nationality, line1, city, postal_code, country)
  VALUES ('55555555-5555-5555-5555-555555555555',
          'Nouveau', 'Client', '+212600000000', DATE '1995-03-04',
          'MA', '1 rue test', 'Casablanca', '20000', 'MA');


  -- Le nombre de lignes affectées, et non un SELECT : le compte vient d'être
  -- créé sans session, il est donc — à raison — invisible. Le relire
  -- ramènerait zéro et ferait conclure à tort que la création a échoué.
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'ECHEC: profil non cree (% lignes)', n; END IF;

  RAISE NOTICE 'OK  compte et profil crees par un visiteur sans session';
END $$;

\echo ''
\echo '=== 2. Depot : la confirmation doit ecrire dans le grand livre ==='

DO $$
DECLARE n int;
BEGIN
  SET LOCAL app.user_id   = '33333333-3333-3333-3333-333333333333';
  SET LOCAL app.user_role = 'ADMIN';

  INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency,
                             assigned_by, assignment_note)
  VALUES ('11111111-1111-1111-1111-111111111111',
          'MA120015000001234567890123', 'Attijariwafa', 'Alice', 'MAD',
          '33333333-3333-3333-3333-333333333333', 'releve bancaire');

  INSERT INTO deposits (user_id, amount, currency, method, status,
                        payment_reference, bank_account_id)
  VALUES ('11111111-1111-1111-1111-111111111111', 50000, 'MAD',
          'BANK_TRANSFER', 'UNDER_REVIEW', 'VIR-APP-1',
          (SELECT id FROM bank_accounts
            WHERE iban = 'MA120015000001234567890123'));

  SELECT count(*) INTO n FROM transactions;
  IF n <> 0 THEN
    RAISE EXCEPTION 'ECHEC: % lignes avant confirmation, attendu 0', n;
  END IF;

  -- C'est ici que tout cassait. Le déclencheur écrit dans `transactions` avec
  -- les droits de la session ; la RLM n'autorise aucune écriture ; le dépôt ne
  -- pouvait donc jamais être confirmé.
  UPDATE deposits SET status = 'CONFIRMED', reviewed_at = now(),
                       confirmed_at = now()
   WHERE payment_reference = 'VIR-APP-1';

  SELECT count(*) INTO n FROM transactions
   WHERE type = 'DEPOSIT' AND amount = 50000;
  IF n <> 1 THEN
    RAISE EXCEPTION 'ECHEC: le grand livre n a pas recu le depot (% lignes)', n;
  END IF;

  RAISE NOTICE 'OK  depot confirme, grand livre ecrit';
END $$;

\echo ''
\echo '=== 3. Retrait : l argent ne part qu a la completion ==='

DO $$
DECLARE n int;
BEGIN
  SET LOCAL app.user_id   = '33333333-3333-3333-3333-333333333333';
  SET LOCAL app.user_role = 'ADMIN';

  INSERT INTO withdrawals (user_id, amount, currency, method, status, destination,
                           review_note, reviewed_at)
  VALUES ('11111111-1111-1111-1111-111111111111', 5000, 'MAD',
          'BANK_TRANSFER', 'UNDER_REVIEW', 'MA120015000001234567890123',
          'conforme', now());

  UPDATE withdrawals SET status = 'PROCESSING'
   WHERE destination = 'MA120015000001234567890123';

  SELECT count(*) INTO n FROM transactions WHERE type = 'WITHDRAWAL';
  IF n <> 0 THEN
    RAISE EXCEPTION 'ECHEC: le retrait ecrit avant la completion';
  END IF;

  UPDATE withdrawals SET status = 'COMPLETED', completed_at = now(),
                         transaction_reference = 'VIR-WDR-1'
   WHERE destination = 'MA120015000001234567890123';

  SELECT count(*) INTO n FROM transactions
   WHERE type = 'WITHDRAWAL' AND amount = 5000;
  IF n <> 1 THEN
    RAISE EXCEPTION 'ECHEC: le retrait n a pas ete ecrit (% lignes)', n;
  END IF;

  RAISE NOTICE 'OK  retrait ecrit a la completion, et pas avant';
END $$;

\echo ''
\echo '=== 4. Investissement et pret : les deux entrees et les deux sorties ==='

DO $$
DECLARE n int; p uuid;
BEGIN
  SET LOCAL app.user_id   = '33333333-3333-3333-3333-333333333333';
  SET LOCAL app.user_role = 'ADMIN';

  INSERT INTO investment_products (name, description, minimum_amount, currency,
                                   duration_months, target_annual_rate,
                                   rate_guaranteed, risk_level, sector, risks,
                                   status, created_by)
  VALUES ('Test', 'x', 1000, 'MAD', 6, 4.5, false, 'LOW', 'Banque',
          ARRAY['Perte en capital possible', 'Rendement indicatif non garanti'],
          'PUBLISHED', '33333333-3333-3333-3333-333333333333')
  RETURNING id INTO p;

  INSERT INTO investments (user_id, product_id, product_name, initial_amount,
                           currency, status, payment_method, payment_status,
                           payment_reference)
  VALUES ('11111111-1111-1111-1111-111111111111', p, 'Test', 20000, 'MAD',
          'PAYMENT_REVIEW', 'BANK_TRANSFER', 'DECLARED', 'INV-APP-1');

  -- Sans paiement vérifié, l'activation est refusée par une contrainte : on
  -- cherche ici à vérifier l'écriture du grand livre, pas la contrainte.
  UPDATE investments
     SET status = 'ACTIVE', payment_status = 'VERIFIED', payment_verified_at = now(),
         activated_at = now(), matures_at = now() + interval '6 months'
   WHERE payment_reference = 'INV-APP-1';

  SELECT count(*) INTO n FROM transactions
   WHERE type = 'INVESTMENT' AND amount = 20000;
  IF n <> 1 THEN
    RAISE EXCEPTION 'ECHEC: l investissement actif n a pas ete ecrit (% lignes)', n;
  END IF;

  -- Une augmentation vérifiée est un mouvement distinct.
  INSERT INTO investment_topups (investment_id, user_id, amount, currency,
                                 status, payment_status, payment_reference,
                                 payment_verified_at)
  SELECT id, user_id, 5000, 'MAD', 'ACTIVE', 'VERIFIED', 'TOP-APP-1', now()
    FROM investments WHERE payment_reference = 'INV-APP-1';

  SELECT count(*) INTO n FROM transactions
   WHERE type = 'INVESTMENT_TOPUP' AND amount = 5000;
  IF n <> 1 THEN
    RAISE EXCEPTION 'ECHEC: l augmentation n a pas ete ecrite (% lignes)', n;
  END IF;

  -- Et le cumul doit s'en déduire, sans saisie.
  SELECT topup_total INTO n FROM investments
   WHERE payment_reference = 'INV-APP-1';
  IF n <> 5000 THEN
    RAISE EXCEPTION 'ECHEC: cumul d''augmentations = %, attendu 5000', n;
  END IF;

  RAISE NOTICE 'OK  investissement et augmentation ecrits, cumul deduit';
END $$;

DO $$
DECLARE n int; l uuid;
BEGIN
  SET LOCAL app.user_id   = '33333333-3333-3333-3333-333333333333';
  SET LOCAL app.user_role = 'ADMIN';

  INSERT INTO loans (user_id, requested_amount, currency,
                     requested_duration_months, purpose, status)
  VALUES ('11111111-1111-1111-1111-111111111111', 30000, 'MAD', 6,
          'Test', 'UNDER_REVIEW')
  RETURNING id INTO l;

  UPDATE loans SET status = 'APPROVED', approved_amount = 30000,
                   approved_duration_months = 6, annual_rate = 6.0,
                   conditions = ARRAY['piece d identite'], approved_at = now()
   WHERE id = l;

  -- L'alias ne s'appelle pas `n` : il masquerait la variable plpgsql du même
  -- nom, et PostgreSQL.signalera « column reference n is ambiguous » sans
  -- dire où.
  INSERT INTO loan_schedule_items (loan_id, position, due_date, principal,
                                   interest, installment)
  SELECT l, rang, current_date + (rang || ' months')::interval, 5000, 0, 5000
    FROM generate_series(1, 6) AS rangs(rang);

  UPDATE loans SET status = 'ACTIVE', disbursed_at = now(),
                   disbursement_reference = 'VIR-LOA-APP-1'
   WHERE id = l;

  SELECT count(*) INTO n FROM transactions
   WHERE type = 'LOAN' AND amount = 30000;
  IF n <> 1 THEN
    RAISE EXCEPTION 'ECHEC: le decaissement n a pas ete ecrit (% lignes)', n;
  END IF;

  RAISE NOTICE 'OK  pret decai ecrit dans le grand livre';
END $$;

\echo ''
\echo '=== 5. Le solde se deduit, et il est juste ==='

DO $$
DECLARE attendu numeric; calcule numeric;
BEGIN
  SET LOCAL app.user_id   = '11111111-1111-1111-1111-111111111111';
  SET LOCAL app.user_role = 'CLIENT';

  -- 50 000 + 30 000 (prêt) - 20 000 (investissement) - 5 000 (augmentation)
  -- - 5 000 (retrait) = 50 000
  SELECT COALESCE(sum(amount) FILTER (
           WHERE type IN ('DEPOSIT', 'LOAN', 'RETURN')), 0)
       - COALESCE(sum(amount) FILTER (
           WHERE type IN ('WITHDRAWAL', 'INVESTMENT', 'INVESTMENT_TOPUP',
                          'CARD_PAYMENT', 'FEE')), 0)
    INTO attendu
    FROM transactions WHERE status IN ('COMPLETED', 'CONFIRMED');

  SELECT available INTO calcule FROM client_balances
   WHERE user_id = '11111111-1111-1111-1111-111111111111';

  IF attendu <> 50000 THEN
    RAISE EXCEPTION 'ECHEC: total attendu 50000, obtenu %', attendu;
  END IF;
  IF calcule IS DISTINCT FROM attendu THEN
    RAISE EXCEPTION 'ECHEC: vue = %, grand livre = %', calcule, attendu;
  END IF;

  RAISE NOTICE 'OK  solde = % = somme du grand livre', calcule;
END $$;

\echo ''
\echo '=== 6. Aucune de ces écritures n etait possible directement ==='

DO $$
DECLARE refus_rls int := 0; touche int;
        lignes int; total_avant numeric; total_apres numeric;
BEGIN
  -- Session d'Alice : c'est elle qui tente la modification, et c'est la seule
  -- dont la ligne soit visible. C'est ce qui rend la vérification ci-dessous
  -- lisible : sans elle, le test passerait quand même, pour une raison sans
  -- rapport avec ce qu'il prétend contrôler.
  SET LOCAL app.user_id   = '11111111-1111-1111-1111-111111111111';
  SET LOCAL app.user_role = 'CLIENT';

  -- Le grand livre reste fermé en écriture directe, par deux portes qui ne se
  -- ressemblent pas.
  --
  -- L'INSERT est refusé par la RLM : aucune policy permissive ne s'y applique.
  -- C'est un refus de droits, bruyant.
  BEGIN
    INSERT INTO transactions (user_id, type, amount, currency, status, reference,
                             description)
    VALUES ('11111111-1111-1111-1111-111111111111', 'DEPOSIT', 1, 'MAD',
            'CONFIRMED', 'FORGE-1', 'forge directe');
  EXCEPTION WHEN insufficient_privilege THEN refus_rls := refus_rls + 1;
  END;

  -- L'UPDATE et le DELETE ne lèvent rien, et ne changent rien : la seule
  -- policy du grand livre est `FOR SELECT`, elle ne s'applique pas à ces
  -- commandes, et PostgreSQL considère alors qu'aucune ligne n'est candidate.
  -- Zéro ligne touchée, silencieusement.
  --
  -- C'est moins spectaculaire qu'un refus, et c'est tout aussi fermé. Le
  -- déclencheur d'ajout-seul ne se déclenche pas non plus — il n'a aucune
  -- ligne à protéger. Il reste la seconde barrière, celle qui compte pour un
  -- rôle propriétaire ou pour un droit d'écriture accordé par erreur ;
  -- c'est `schema_check.sql` qui le vérifie, avec les droits du propriétaire.
  UPDATE transactions SET amount = 999999;
  GET DIAGNOSTICS touche = ROW_COUNT;
  IF touche <> 0 THEN
    RAISE EXCEPTION 'ECHEC: l UPDATE a touche % lignes du grand livre', touche;
  END IF;

  DELETE FROM transactions;
  GET DIAGNOSTICS touche = ROW_COUNT;
  IF touche <> 0 THEN
    RAISE EXCEPTION 'ECHEC: le DELETE a touche % lignes du grand livre', touche;
  END IF;

  -- Et surtout : le grand livre est bit pour bit ce qu'il était.
  SELECT sum(amount) INTO total_avant FROM transactions;

  UPDATE transactions SET amount = 999999 WHERE user_id =
    '11111111-1111-1111-1111-111111111111';
  DELETE FROM transactions WHERE user_id =
    '11111111-1111-1111-1111-111111111111';

  SELECT count(*), COALESCE(sum(amount), 0)
    INTO lignes, total_apres FROM transactions;

  IF lignes <> 5 OR total_apres <> total_avant THEN
    RAISE EXCEPTION 'ECHEC: le grand livre a bouge (% lignes / %, attendu 5 / %)',
      lignes, total_apres, total_avant;
  END IF;

  IF refus_rls <> 1 THEN
    RAISE EXCEPTION 'ECHEC: % refus RLM sur 1 attendu', refus_rls;
  END IF;

  RAISE NOTICE 'OK  ecriture directe fermee : insertion refusee, % lignes intactes',
    lignes;
END $$;

\echo ''
\echo '=== 7. La configuration des declencheurs est correcte ==='

DO $$
DECLARE total int; correctes int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE correctement_configuree)
    INTO total, correctes
    FROM trigger_security_audit;

  IF total <> 6 THEN
    RAISE EXCEPTION 'ECHEC: % declencheurs audites, attendu 6', total;
  END IF;
  IF correctes <> total THEN
    RAISE EXCEPTION 'ECHEC: % declencheurs sur % mal configures',
      total - correctes, total;
  END IF;

  RAISE NOTICE 'OK  % declencheurs, tous SECURITY DEFINER et proprietaires', total;
END $$;

\echo ''
\echo '=== LES PARCOURS FINANCIERS MARCHENT AVEC LES DROITS DE L APPLICATION ==='

RESET ROLE;
