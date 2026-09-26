\set ON_ERROR_STOP on
\pset format aligned

-- ===========================================================================
-- Test du schéma : on écrit, on triche, on vérifie que la base refuse.
-- ===========================================================================

-- --- Fondations -----------------------------------------------------------
INSERT INTO users (email, password_hash) VALUES ('client@test.ma', 'argon2id$x');
INSERT INTO users (email, password_hash) VALUES ('admin@test.ma', 'argon2id$x');
INSERT INTO users (email, password_hash, role) VALUES ('boss@test.ma', 'argon2id$x', 'SUPER_ADMIN');

INSERT INTO profiles (user_id, first_name, last_name, phone, date_of_birth,
                      nationality, line1, city, postal_code, country)
SELECT id, 'Yasmine', 'Berrada', '+212600000000', '1990-05-12',
       'MA', '12 rue des Orangers', 'Casablanca', '20000', 'MA'
FROM users WHERE email = 'client@test.ma';

\echo '--- 1. profil mineur : doit echouer ---'
DO $$
BEGIN
  INSERT INTO profiles (user_id, first_name, last_name, phone, date_of_birth,
                        nationality, line1, city, postal_code, country)
  SELECT id, 'Petit', 'Enfant', '+212600000001', current_date - 1,
         'MA', 'x', 'x', '10000', 'MA'
  FROM users WHERE email = 'admin@test.ma';
  RAISE EXCEPTION 'ECHEC: un mineur a ete accepte';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  mineur refuse';
END $$;

-- --- Produit d'investissement (§6) ---------------------------------------
INSERT INTO investment_products (name, description, minimum_amount, currency, duration_months,
                                 target_annual_rate, rate_guaranteed, risk_level,
                                 sector, risks, status)
VALUES ('Livret 6 mois', 'Depot terme', 1000, 'MAD', 6, 4.5, false, 'LOW', 'Banque',
        ARRAY['Perte en capital possible', 'Rendement indicatif non garanti'], 'PUBLISHED');

\echo '--- 2. produit publie sans mention de rendement indicatif : doit echouer ---'
DO $$
BEGIN
  INSERT INTO investment_products (name, description, minimum_amount, currency, duration_months,
                                   target_annual_rate, rate_guaranteed, risk_level,
                                   sector, risks, status)
  VALUES ('Pondere', 'x', 1000, 'MAD', 6, 9.0, false, 'HIGH', 'x',
          ARRAY['Perte en capital possible'], 'PUBLISHED');
  RAISE EXCEPTION 'ECHEC: un taux non qualifie a ete publie';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  taux indicatif sans mention refuse';
END $$;

-- --- Depot (§11) ----------------------------------------------------------
INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency)
SELECT id, 'MA64011515000001234567890123', 'Attijariwafa', 'Yasmine Berrada', 'MAD'
FROM users WHERE email = 'client@test.ma';

\echo '--- 3. IBAN mal forme : doit echouer ---'
DO $$
BEGIN
  INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency)
  SELECT id, '12345', 'X', 'Y', 'MAD' FROM users WHERE email = 'client@test.ma';
  RAISE EXCEPTION 'ECHEC: IBAN invalide accepte';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  IBAN mal forme refuse';
END $$;

\echo '--- 4. meme IBAN sur deux comptes : doit echouer ---'
DO $$
BEGIN
  INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency)
  SELECT id, 'MA64011515000001234567890123', 'X', 'Z', 'MAD' FROM users WHERE email = 'admin@test.ma';
  RAISE EXCEPTION 'ECHEC: IBAN duplique accepte';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'OK  IBAN partage refuse';
END $$;

INSERT INTO deposits (user_id, amount, currency, method, status, payment_reference,
                      proof, bank_account_id)
SELECT u.id, 50000, 'MAD', 'BANK_TRANSFER', 'UNDER_REVIEW', 'VIR-001', 'VIR-2024-XYZ',
       (SELECT id FROM bank_accounts LIMIT 1)
FROM users u WHERE u.email = 'client@test.ma';

\echo '--- 5. confirmer le depot doit ecrire le grand livre ---'
UPDATE deposits SET status = 'CONFIRMED', review_note = 'recu',
                    reviewed_at = now(), confirmed_at = now()
WHERE reference LIKE 'DEP-%';
SELECT count(*) AS ledger_rows_after_confirm FROM transactions;

\echo '--- 6. un depot confirme ne se rouvre pas (§19) ---'
DO $$
BEGIN
  UPDATE deposits SET status = 'REJECTED' WHERE reference LIKE 'DEP-%';
  RAISE EXCEPTION 'ECHEC: depot confirme rouvrable';
EXCEPTION WHEN restrict_violation THEN
  RAISE NOTICE 'OK  depot confirme definitif';
END $$;

\echo '--- 6b. rejouer la meme confirmation n ecrit pas deux fois ---'
DO $$
DECLARE before_count int; after_count int;
BEGIN
  SELECT count(*) INTO before_count FROM transactions;
  UPDATE deposits SET status = 'CONFIRMED', review_note = 'recu (relance)',
                      reviewed_at = now(), confirmed_at = now()
    WHERE reference LIKE 'DEP-%';
  SELECT count(*) INTO after_count FROM transactions;
  IF before_count <> after_count THEN
    RAISE EXCEPTION 'ECHEC: double ecriture dans le grand livre';
  END IF;
  RAISE NOTICE 'OK  pas de double ecriture';
END $$;

-- --- Le grand livre est en ajout seul (§15) -------------------------------
\echo '--- 7. modifier une ligne du grand livre : doit echouer ---'
DO $$
BEGIN
  UPDATE transactions SET amount = 1;
  RAISE EXCEPTION 'ECHEC: modification du grand livre acceptee';
EXCEPTION WHEN restrict_violation THEN
  RAISE NOTICE 'OK  modification refusee';
END $$;

\echo '--- 8. supprimer une ligne du grand livre : doit echouer ---'
DO $$
BEGIN
  DELETE FROM transactions;
  RAISE EXCEPTION 'ECHEC: suppression du grand livre acceptee';
EXCEPTION WHEN restrict_violation THEN
  RAISE NOTICE 'OK  suppression refusee';
END $$;

\echo '--- 9. modifier une trace du journal : doit echouer ---'
INSERT INTO audit_logs (action, result) VALUES ('LOGIN', 'SUCCESS');
DO $$
BEGIN
  UPDATE audit_logs SET details = 'falsifie';
  RAISE EXCEPTION 'ECHEC: modification du journal acceptee';
EXCEPTION WHEN restrict_violation THEN
  RAISE NOTICE 'OK  journal en ecriture seule';
END $$;

-- --- Investissement (§6, §8) ----------------------------------------------
INSERT INTO investments (user_id, product_id, product_name, initial_amount, currency,
                         payment_method, payment_reference, status, payment_status)
SELECT u.id, p.id, p.name, 20000, 'MAD', 'BANK_TRANSFER', 'VIR-INV-001',
       'PAYMENT_REVIEW', 'DECLARED'
FROM users u, investment_products p
WHERE u.email = 'client@test.ma' AND p.name = 'Livret 6 mois';

\echo '--- 10. investissement actif sans paiement verifie : doit echouer ---'
DO $$
BEGIN
  UPDATE investments SET status = 'ACTIVE', activated_at = now(), matures_at = now() + interval '6 months';
  RAISE EXCEPTION 'ECHEC: activation sans paiement verifie acceptee';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  activation sans verification refusee';
END $$;

\echo '--- 11. le passage legitime ecrit la ligne du grand livre ---'
UPDATE investments
SET status = 'ACTIVE', payment_status = 'VERIFIED', payment_verified_at = now(),
    activated_at = now(), matures_at = now() + interval '6 months'
WHERE reference LIKE 'INV-%';
SELECT type, amount, status FROM transactions ORDER BY created_at;

\echo '--- 12. augmentation : le montant initial ne bouge pas (§7) ---'
\echo '     une augmentation non verifiee ne compte pas'
INSERT INTO investment_topups (investment_id, user_id, amount, currency, status,
                               payment_status, payment_reference)
SELECT i.id, i.user_id, 5000, 'MAD', 'PENDING_PAYMENT', 'AWAITING_PAYMENT', 'VIR-TOP-000'
FROM investments i WHERE i.reference LIKE 'INV-%';
SELECT initial_amount AS montant_initial, topup_total AS verse_en_supplement
FROM investments;

\echo '--- 12b. une augmentation verifiee est un mouvement distinct ---'
UPDATE investment_topups SET status = 'ACTIVE', payment_status = 'VERIFIED',
                             payment_verified_at = now()
WHERE reference LIKE 'TOP-%';
SELECT initial_amount AS montant_initial_toujours, topup_total AS cumul_verse
FROM investments;
SELECT reference, type, amount FROM transactions ORDER BY created_at;

-- --- Pret (§9) ------------------------------------------------------------
INSERT INTO loans (user_id, requested_amount, currency, requested_duration_months,
                   purpose, status)
SELECT u.id, 30000, 'MAD', 6, 'Consolidation', 'PENDING'
FROM users u WHERE u.email = 'client@test.ma';

\echo '--- 13. pret approuve sans taux ni conditions : doit echouer ---'
DO $$
BEGIN
  UPDATE loans SET status = 'APPROVED', approved_amount = 30000,
                   approved_duration_months = 6, approved_at = now();
  RAISE EXCEPTION 'ECHEC: approbation incomplete acceptee';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  approbation incomplete refusee';
END $$;

\echo '--- 14. pret approuve pour plus que la demande : doit echouer ---'
DO $$
BEGIN
  UPDATE loans SET status = 'APPROVED', approved_amount = 99000,
                   approved_duration_months = 6, annual_rate = 6.0,
                   conditions = ARRAY['piece d identite'], approved_at = now();
  RAISE EXCEPTION 'ECHEC: montant superieur a la demande accepte';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  octroi au dela de la demande refuse';
END $$;

UPDATE loans SET status = 'APPROVED', approved_amount = 30000,
                 approved_duration_months = 6, annual_rate = 6.0,
                 conditions = ARRAY['piece d identite', 'releve de compte'], approved_at = now()
WHERE reference LIKE 'LOA-%';

\echo '--- 15. echeancier qui ne tombe pas juste : doit echouer ---'
DO $$
DECLARE l uuid; n int := 1;
BEGIN
  SELECT id INTO l FROM loans WHERE reference LIKE 'LOA-%';
  FOR n IN 1..6 LOOP
    BEGIN
      INSERT INTO loan_schedule_items (loan_id, position, due_date, principal, interest, installment)
      VALUES (l, n, current_date + (n || ' months')::interval, 5000 - 10, 100, 5090);
    EXCEPTION WHEN raise_exception THEN
      IF n = 6 THEN
        RAISE NOTICE 'OK  echeancier hors total refuse';
        RETURN;
      END IF;
      RAISE;
    END;
  END LOOP;
  RAISE EXCEPTION 'ECHEC: echeancier faux accepte';
END $$;

DELETE FROM loan_schedule_items;

\echo '--- 16. echeancier complet exact : doit passer ---'
DO $$
DECLARE l uuid; n int;
BEGIN
  SELECT id INTO l FROM loans WHERE reference LIKE 'LOA-%';
  FOR n IN 1..6 LOOP
    INSERT INTO loan_schedule_items (loan_id, position, due_date, principal, interest, installment)
    VALUES (l, n, current_date + (n || ' months')::interval, 5000, 0, 5000);
  END LOOP;
  RAISE NOTICE 'OK  echeancier exact accepte';
END $$;

\echo '--- 17. dec compliment du pret : actif sans echeance ---- doit echouer ---'
DO $$
BEGIN
  UPDATE loans SET status = 'ACTIVE';
  RAISE EXCEPTION 'ECHEC: decaissement sans reference accepte';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  decaissement incomplet refuse';
END $$;

UPDATE loans SET status = 'ACTIVE', disbursed_at = now(), disbursement_reference = 'VIR-LOA-1'
WHERE reference LIKE 'LOA-%';

\echo '--- 18. le pret est une entree dans le grand livre ---'
SELECT type, amount FROM transactions WHERE type = 'LOAN';

-- --- Retrait (§12) --------------------------------------------------------
INSERT INTO withdrawals (user_id, amount, currency, method, status, destination)
SELECT u.id, 5000, 'MAD', 'BANK_TRANSFER', 'PENDING', 'MA64011515000001234567890123'
FROM users u WHERE u.email = 'client@test.ma';

\echo '--- 19. retrait termine sans reference : doit echouer ---'
DO $$
BEGIN
  UPDATE withdrawals SET status = 'COMPLETED', completed_at = now();
  RAISE EXCEPTION 'ECHEC: retrait sans reference accepte';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  retrait sans reference refuse';
END $$;

\echo '--- 20. l argent ne part qu a la completion ---'
SELECT count(*) AS lignes_retrait_avant FROM transactions WHERE type = 'WITHDRAWAL';
UPDATE withdrawals SET status = 'PROCESSING', reviewed_at = now() WHERE reference LIKE 'WDR-%';
SELECT count(*) AS lignes_retrait_apres_approbation FROM transactions WHERE type = 'WITHDRAWAL';
UPDATE withdrawals SET status = 'COMPLETED', completed_at = now(),
                       transaction_reference = 'VIR-WDR-001' WHERE reference LIKE 'WDR-%';
SELECT count(*) AS lignes_retrait_apres_completion FROM transactions WHERE type = 'WITHDRAWAL';

-- --- Carte (§10) ----------------------------------------------------------
INSERT INTO card_products (name, network, tier, description, currency, status)
VALUES ('Carte Silver', 'VISA', 'STANDARD', 'Carte de depense', 'MAD', 'PUBLISHED');

\echo '--- 21. numero de carte complet : doit echouer (§10) ---'
DO $$
BEGIN
  INSERT INTO cards (user_id, product_id, product_name, network, tier, last4,
                     issuer_reference, holder_name, status)
  SELECT u.id, cp.id, cp.name, 'VISA', 'STANDARD', '4242424242424242', 'ISS-1', 'Y B', 'ISSUED'
  FROM users u, card_products cp WHERE u.email = 'client@test.ma' AND cp.name = 'Carte Silver';
  RAISE EXCEPTION 'ECHEC: un PAN a ete accepte';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  PAN refuse';
END $$;

INSERT INTO cards (user_id, product_id, product_name, network, tier, last4,
                   issuer_reference, holder_name, status)
SELECT u.id, cp.id, cp.name, 'VISA', 'STANDARD', '4242', 'ISS-1', 'Yasmine Berrada', 'ISSUED'
FROM users u, card_products cp WHERE u.email = 'client@test.ma' AND cp.name = 'Carte Silver';

\echo '--- 22. carte active sans date d activation : doit echouer ---'
DO $$
BEGIN
  UPDATE cards SET status = 'ACTIVE';
  RAISE EXCEPTION 'ECHEC: carte active sans date acceptee';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  activation sans date refusee';
END $$;

-- --- Depensibilite --------------------------------------------------------
\echo '--- 23. montants negatifs et a zero : doivent echouer ---'
DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    INSERT INTO deposits (user_id, amount, currency, method, status, payment_reference, bank_account_id)
    SELECT id, -100, 'MAD', 'BANK_TRANSFER', 'PENDING', 'VIR-X', (SELECT id FROM bank_accounts LIMIT 1)
    FROM users WHERE email = 'client@test.ma';
  EXCEPTION WHEN check_violation THEN n := n + 1; END;
  BEGIN
    INSERT INTO deposits (user_id, amount, currency, method, status, payment_reference, bank_account_id)
    SELECT id, 0, 'MAD', 'BANK_TRANSFER', 'PENDING', 'VIR-Y', (SELECT id FROM bank_accounts LIMIT 1)
    FROM users WHERE email = 'client@test.ma';
  EXCEPTION WHEN check_violation THEN n := n + 1; END;
  IF n <> 2 THEN RAISE EXCEPTION 'ECHEC: montants non positifs acceptes (n=%)', n; END IF;
  RAISE NOTICE 'OK  montants negatifs et nuls refuses';
END $$;

\echo '--- 24. un montant negatif dans le grand livre : doit echouer ---'
DO $$
BEGIN
  INSERT INTO transactions (user_id, type, amount, currency, status, reference, description)
  SELECT id, 'FEE', -5, 'MAD', 'COMPLETED', 'FEE-X', 'frais negatifs'
  FROM users WHERE email = 'client@test.ma';
  RAISE EXCEPTION 'ECHEC: montant negatif accepte dans le grand livre';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OK  le sens du mouvement reste porte par le type, jamais par le signe';
END $$;

\echo '--- 25. une echeance payee ne se repaye pas ---'
UPDATE loan_schedule_items SET status = 'PAID', paid_at = now(),
                                transaction_reference = 'VIR-ECH-001'
WHERE position = 1;
DO $$
BEGIN
  UPDATE loan_schedule_items SET status = 'SCHEDULED', paid_at = NULL
  WHERE status = 'PAID';
  RAISE EXCEPTION 'ECHEC: echeance payee redeposable';
EXCEPTION WHEN restrict_violation THEN
  RAISE NOTICE 'OK  echeance payee definitive';
END $$;

\echo '--- 25b. le capital restant suit les echeances payees ---'
SELECT
  l.approved_amount AS accorde,
  COALESCE(sum(s.principal) FILTER (WHERE s.status = 'PAID'), 0) AS principal_rembourse,
  l.approved_amount - COALESCE(sum(s.principal) FILTER (WHERE s.status = 'PAID'), 0) AS restant
FROM loans l
JOIN loan_schedule_items s ON s.loan_id = l.id
GROUP BY l.approved_amount;

\echo '--- 26. une carte bloquee ne se reactive pas ---'
UPDATE cards SET status = 'BLOCKED', blocked_at = now();
DO $$
BEGIN
  UPDATE cards SET status = 'ACTIVE', activated_at = now() WHERE status = 'BLOCKED';
  RAISE EXCEPTION 'ECHEC: carte bloquee reactivee';
EXCEPTION WHEN restrict_violation THEN
  RAISE NOTICE 'OK  carte bloquee definitive';
END $$;

\echo '--- 27. deux demandes de carte ouvertes pour le meme produit : doit echouer ---'
INSERT INTO card_requests (user_id, product_id, product_name)
SELECT u.id, cp.id, cp.name FROM users u, card_products cp
WHERE u.email = 'client@test.ma' AND cp.name = 'Carte Silver';
DO $$
BEGIN
  INSERT INTO card_requests (user_id, product_id, product_name)
  SELECT u.id, cp.id, cp.name FROM users u, card_products cp
  WHERE u.email = 'client@test.ma' AND cp.name = 'Carte Silver';
  RAISE EXCEPTION 'ECHEC: double demande ouverte acceptee';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'OK  une seule demande ouverte par produit';
END $$;

-- --- Soldes ---------------------------------------------------------------
\echo ''
\echo '=== SOLDE RECALCULE DEPUIS LE GRAND LIVRE ==='
SELECT available, invested, pending, loan_outstanding, currency
FROM client_balances
WHERE user_id = (SELECT id FROM users WHERE email = 'client@test.ma');

\echo ''
\echo '=== LE GRAND LIVRE, INTEGRALITE ==='
SELECT reference, type, amount, status FROM transactions ORDER BY created_at;

\echo ''
\echo '=== RECONCILIATION : le solde se deduit-il du grand livre ? ==='
\echo '    attendu : 50000 depot + 30000 pret - 20000 invest - 5000 aug - 5000 retrait'
DO $$
DECLARE
  attendu  numeric;
  calcule  numeric;
  investi  numeric;
  bloque   numeric;
  restant  numeric;
BEGIN
  SELECT
    COALESCE(sum(amount) FILTER (
      WHERE type IN ('DEPOSIT', 'LOAN', 'RETURN')), 0)
    - COALESCE(sum(amount) FILTER (
      WHERE type IN ('WITHDRAWAL', 'INVESTMENT', 'INVESTMENT_TOPUP',
                     'CARD_PAYMENT', 'FEE')), 0)
    INTO attendu
  FROM transactions WHERE status IN ('COMPLETED', 'CONFIRMED');

  SELECT available, invested, pending
    INTO calcule, investi, bloque
  FROM client_balances
  WHERE user_id = (SELECT id FROM users WHERE email = 'client@test.ma');

  SELECT l.approved_amount
           - COALESCE(sum(s.principal) FILTER (WHERE s.status = 'PAID'), 0)
    INTO restant
  FROM loans l JOIN loan_schedule_items s ON s.loan_id = l.id
  GROUP BY l.approved_amount;

  IF calcule <> attendu THEN
    RAISE EXCEPTION 'ECHEC: solde vue (%) <> somme du grand livre (%)', calcule, attendu;
  END IF;

  -- L'argent investi n'est plus disponible mais n'est pas perdu : les deux
  -- colonnes doivent se compléter au montant total engagé.
  IF investi <> 25000 THEN
    RAISE EXCEPTION 'ECHEC: investi (%), attendu 25000', investi;
  END IF;

  -- Le montant retenu par le prêt en cours doit correspondre à son capital
  -- restant, pas à la somme versée.
  IF bloque <> restant THEN
    RAISE EXCEPTION 'ECHEC: bloque (%) <> capital restant (%)', bloque, restant;
  END IF;

  RAISE NOTICE 'OK  solde = % = grand livre ; investi = % ; bloque = % = capital restant',
    calcule, investi, bloque;
END $$;

\echo ''
\echo '=== FILE D ATTENTE DE L ADMINISTRATION ==='
SELECT * FROM admin_pending_review;

\echo ''
\echo '=== TOUT EST PASSE ==='
