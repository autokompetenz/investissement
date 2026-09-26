-- =============================================================================
-- Jeu de démonstration
--
-- Ce que voit quelqu'un qui ouvre la plateforme pour la première fois : deux
-- clients, deux administration, des produits, des comptes bancaires, des
-- adresses crypto, un portefeuille Trust Wallet, des cartes, et de quoi voir
-- une demande de prêt et une déclaration de paiement en attente de revue.
--
-- Trois choses à savoir avant de s'en servir :
--
--   1. Les mots de passe sont des hachages factices, lisibles en clair dans le
--      fichier. C'est un jeu de démonstration : ces comptes n'ont aucune valeur
--      et ne doivent jamais être déployés. Un hachage produit par l'application
--      (Argon2id) n'est pas comparable à une chaîne lisible.
--
--   2. Aucune ligne n'est écrite directement dans `transactions`. Le grand livre
--      est alimenté par les déclencheurs des opérations, donc ce script passe
--      par les mêmes transitions qu'un vrai usage : il déclare un dépôt, l'administration
--      le confirme. C'est ce qui garantit que le solde de démonstration est
--      reproductible au lieu d'être inventé.
--
--   3. Le script est idempotent : on peut le relancer sans dupliquer.
--
-- Usage : psql "$DATABASE_URL" -f db/seed.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- -----------------------------------------------------------------------------
-- Comptes
--
-- Les rôles suivent §20 : un client ne peut pas s'auto-attribuer un rôle
-- d'administration, ici non plus. Les deux comptes admin sont posés par le
-- propriétaire de la base, comme le ferait le bootstrap réel.
-- -----------------------------------------------------------------------------

INSERT INTO users (email, password_hash, role, status) VALUES
  ('client@invest.ma',  'demo:Client123!', 'CLIENT', 'VERIFIED'),
  ('client2@invest.ma', 'demo:Client123!', 'CLIENT', 'VERIFIED'),
  ('admin@invest.ma',   'demo:Admin123!',  'ADMIN',  'VERIFIED'),
  ('admin2@invest.ma',  'demo:Admin123!',  'ADMIN',  'VERIFIED'),
  ('superadmin@invest.ma', 'demo:Root123!', 'SUPER_ADMIN', 'VERIFIED')
ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (user_id, first_name, last_name, phone, date_of_birth,
                      nationality, line1, city, postal_code, country, region)
SELECT u.id, p.first_name, p.last_name, p.phone, p.date_of_birth,
       'MA', p.line1, p.city, p.postal_code, 'MA', 'Casablanca-Settat'
FROM users u
-- `date_of_birth` est un DATE explicite : la contrainte `profile_is_adult` de
-- 0001 refuse un mineur, et un casting tardif la laisserait passer en texte.
JOIN (VALUES
  ('client@invest.ma',    'Yasmine', 'Berrada',   '+212661234567', DATE '1991-04-17', '12 rue des Orangers',   'Casablanca', '20250'),
  ('client2@invest.ma',   'Karim',   'El Amrani', '+212669876543', DATE '1988-11-02', '45 boulevard Zerktouni', 'Casablanca', '20000'),
  ('admin@invest.ma',     'Sofia',   'Naciri',    '+212661112233', DATE '1985-02-20', '8 rue de Fès',         'Rabat',      '10000'),
  ('admin2@invest.ma',    'Mehdi',   'Tazi',      '+212664445566', DATE '1990-07-08', '3 avenue Hassan II',   'Marrakech',  '40000'),
  ('superadmin@invest.ma','Nadia',   'Belkacem',  '+212667778899', DATE '1982-09-30', '1 rue Al Massalik',    'Casablanca', '20100')
) AS p(email, first_name, last_name, phone, date_of_birth, line1, city, postal_code)
  ON p.email = u.email
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Produit d'investissement (§6)
--
-- `rate_guaranteed` est à false pour tous : le rendement affiché est indicatif,
-- et la contrainte `rate_is_qualified` de 0001 exige que le risque correspondant
-- soit écrit. Un produit « rendement garanti » ne peut pas exister tant que
-- l'établissement n'a pas la base juridique pour le promettre (§24).
-- -----------------------------------------------------------------------------

INSERT INTO investment_products (name, description, minimum_amount, maximum_amount,
                                 currency, duration_months, target_annual_rate,
                                 rate_guaranteed, risk_level, sector, conditions,
                                 documents, risks, status, created_by)
SELECT
  'Livret Terme 6 mois',
  'Placement à échéance fixe. Le capital est engagé pour la durée choisie ; '
    'un retrait anticipé est possible mais ne bénéficie pas du taux.',
  1000, 500000, 'MAD', 6, 4.500, false, 'LOW', 'Banque',
  ARRAY[
    'Durée minimale de 6 mois, pas de remboursement anticipé sans penalty',
    'Le rendement annoncé est indicatif et non garanti',
    'Le capital investi peut être perdu en cas de défaillance de l''émetteur'
  ],
  '["Conditions générales.pdf", "Fiche d''information.pdf"]'::jsonb,
  ARRAY['Perte en capital possible', 'Rendement indicatif non garanti',
        'Risque de défaillance de l''établissement émetteur'],
  'PUBLISHED',
  (SELECT id FROM users WHERE email = 'admin@invest.ma')
WHERE NOT EXISTS (SELECT 1 FROM investment_products WHERE name = 'Livret Terme 6 mois');

INSERT INTO investment_products (name, description, minimum_amount, maximum_amount,
                                 currency, duration_months, target_annual_rate,
                                 rate_guaranteed, risk_level, sector, conditions,
                                 documents, risks, status, created_by)
SELECT
  'Pondéré Immobilier',
  'Portefeuille de créances immobilières réparties. Durée longue, '
    'liquidité faible : le produit n''est pas un substitut à un compte courant.',
  5000, 1000000, 'MAD', 24, 7.200, false, 'MEDIUM', 'Immobilier',
  ARRAY[
    'Durée de 24 mois, sortie possible uniquement au terme',
    'Le rendement annoncé est indicatif et non garanti',
    'Valeur du portefeuille exposée au risque de marché immobilier'
  ],
  '["Rapport annuel.pdf", "Documentation juridique.pdf"]'::jsonb,
  ARRAY['Perte en capital possible', 'Rendement indicatif non garanti',
        'Risque de liquidité', 'Risque de marché immobilier'],
  'PUBLISHED',
  (SELECT id FROM users WHERE email = 'admin@invest.ma')
WHERE NOT EXISTS (SELECT 1 FROM investment_products WHERE name = 'Pondéré Immobilier');

INSERT INTO investment_products (name, description, minimum_amount, maximum_amount,
                                 currency, duration_months, target_annual_rate,
                                 rate_guaranteed, risk_level, sector, conditions,
                                 documents, risks, status, created_by)
SELECT
  'Marché Émergents',
  'Exposition actions sur les marchés émergents. Produit à risque élevé, '
    'réservé à un investisseur qui accepte de perdre une part de son capital.',
  10000, 2000000, 'MAD', 36, 9.000, false, 'HIGH', 'Actions',
  ARRAY[
    'Durée de 36 mois, aucune sortie anticipée',
    'Le rendement annoncé est indicatif et non garanti',
    'Perte totale du capital possible'
  ],
  '["Prospectus.pdf"]'::jsonb,
  ARRAY['Perte en capital possible', 'Rendement indicatif non garanti',
        'Risque de change', 'Perte totale du capital possible',
        'Marchés émergents : liquidité et régulation variables'],
  'PUBLISHED',
  (SELECT id FROM users WHERE email = 'admin@invest.ma')
WHERE NOT EXISTS (SELECT 1 FROM investment_products WHERE name = 'Marché Émergents');

-- Un produit en brouillon, pour que l'écran de gestion d'offre ait autre chose
-- qu'une liste homogeneous.
INSERT INTO investment_products (name, description, minimum_amount, currency,
                                 duration_months, target_annual_rate,
                                 rate_guaranteed, risk_level, sector, risks,
                                 status, created_by)
SELECT 'Opportunités 2027', 'Produit en préparation, non vendu.',
       20000, 'MAD', 12, 6.500, false, 'HIGH', 'Divers',
       ARRAY['Perte en capital possible', 'Rendement indicatif non garanti'],
       'DRAFT', (SELECT id FROM users WHERE email = 'admin@invest.ma')
WHERE NOT EXISTS (SELECT 1 FROM investment_products WHERE name = 'Opportunités 2027');

-- -----------------------------------------------------------------------------
-- Comptes bancaires (§4)
--
-- Ces IBAN passent le mod 97 — ils ont été calculés pour cela, pas recopiés
-- d'un exemple. Ils ne correspondent à aucun compte réel et ne doivent jamais
-- servir à un virement : un IBAN valide ne veut pas dire un IBAN existant.
--
-- Un IBAN réel est attribué par l'établissement qui le client, l'administration
-- le saisit, et `assignment_note` dit sur quoi elle s'est appuyée. C'est ce qui
-- rend l'attribution opposable plus tard.
-- -----------------------------------------------------------------------------

INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency, status,
                           assigned_by, assignment_note)
SELECT u.id, v.iban, v.bank_name, v.holder, 'MAD', v.status,
       (SELECT id FROM users WHERE email = 'admin@invest.ma'),
       v.note
FROM users u
JOIN (VALUES
  ('client@invest.ma',  'MA120015000001234567890123', 'Attijariwafa Bank', 'Yasmine Berrada', 'ACTIVE',
   'IBAN saisi d''après le relevé bancaire du client'),
  ('client2@invest.ma', 'MA820015000001234567890124', 'Attijariwafa Bank', 'Karim El Amrani', 'ACTIVE',
   'IBAN saisi d''après le relevé bancaire du client'),
  ('client@invest.ma',  'MA550015000001234567890125', 'BMCE Bank',         'Yasmine Berrada', 'BLOCKED',
   'Ancien compte, fermé à la demande du client')
) AS v(email, iban, bank_name, holder, status, note) ON v.email = u.email
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Adresses de dépôt crypto (§5, §27)
-- -----------------------------------------------------------------------------

-- `asset` est casté en crypto_asset : un littéral de texte ne devient pas un
-- enum tout seul, et la colonne est là pour empêcher qu'on invente un actif.
--
-- Les adresses respectent le format du réseau — la contrainte
-- `crypto_address_format` de 0003 le refuse sinon. Celle en BTC est le vecteur
-- de test canonique de BIP-173 : l'alphabet bech32 exclut 1, b, i et o, et
-- une adresse qui en contient un est illisible même quand elle a l'air
-- correcte. Aucune de ces adresses n'existe sur la chaîne : un dépôt réel
-- envoyé à l'une d'elles serait perdu sans retour.
INSERT INTO crypto_addresses (user_id, asset, network, address, status,
                               assigned_by, assignment_note)
SELECT u.id, v.asset::crypto_asset, v.network, v.address, 'ACTIVE',
       (SELECT id FROM users WHERE email = 'admin@invest.ma'),
       'Adresse de démonstration, saisie manuellement'
FROM users u
JOIN (VALUES
  ('client@invest.ma',  'BTC',        'Bitcoin',  'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080'),
  ('client@invest.ma',  'USDT_TRC20', 'Tron',     'TqRsDBoPDju5bT9fVyMjsF7VfVRbqMKuDb'),
  ('client2@invest.ma', 'ETH',        'Ethereum', '0x8f2a5c9e1b4d7f0a3c6e9b2d5f8a1c4e7b0d3f6a')
) AS v(email, asset, network, address) ON v.email = u.email
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Portefeuille Trust Wallet (§27)
--
-- Aucun mot de 12 mots, aucune clé privée, à aucun moment. La preuve de
-- propriété est une signature de message : le client signe avec son
-- portefeuille, et l'application ne reçoit que la signature.
-- -----------------------------------------------------------------------------

INSERT INTO user_wallets (user_id, provider, address, network, status, connected_at)
SELECT u.id, 'trust-wallet',
       '0x7a1b3c5d9e2f4a6b8c0d1e3f5a7b9c2d4e6f8a1b', 'ERC20', 'CONNECTED', now()
FROM users u WHERE u.email = 'client@invest.ma'
  AND NOT EXISTS (SELECT 1 FROM user_wallets w WHERE w.user_id = u.id);

INSERT INTO user_wallets (user_id, provider, address, network, status, connected_at)
SELECT u.id, 'trust-wallet',
       '0x3c5e7a9b1d4f6a8c0e2b4d6f8a1c3e5b7d9f1a3c', 'ERC20', 'VERIFIED',
       now() - interval '40 days'
FROM users u WHERE u.email = 'client2@invest.ma'
  AND NOT EXISTS (SELECT 1 FROM user_wallets w WHERE w.user_id = u.id);

-- -----------------------------------------------------------------------------
-- Cartes (§10)
--
-- `last4` : quatre chiffres, et c'est tout. Aucun numéro de carte n'existe
-- dans ce fichier, ni nulle part dans le système : la carte est émise par un
-- prestataire habilité et seules les quatre derniers chiffres reviennent.
-- -----------------------------------------------------------------------------

INSERT INTO card_products (name, network, tier, description, annual_fee, currency,
                           spending_limit, benefits, status)
SELECT 'Carte Classique', 'VISA', 'STANDARD',
       'Carte de paiement courante, rattachée au compte disponible.',
       0, 'MAD', 20000,
       ARRAY['Paiement dans le réseau', 'Retraits dans les DAB', 'Paiements en ligne'],
       'PUBLISHED'
WHERE NOT EXISTS (SELECT 1 FROM card_products WHERE name = 'Carte Classique');

INSERT INTO card_products (name, network, tier, description, annual_fee, currency,
                           spending_limit, benefits, status)
SELECT 'Carte Gold', 'MASTERCARD', 'PREMIUM',
       'Plafond de dépense plus élevé, assurance voyage incluse.',
       300, 'MAD', 100000,
       ARRAY['Assurance voyage', 'Conciergerie', 'Paiements sans contact',
              'Plafond de dépense élevé'],
       'PUBLISHED'
WHERE NOT EXISTS (SELECT 1 FROM card_products WHERE name = 'Carte Gold');

INSERT INTO card_requests (user_id, product_id, product_name, status, created_at)
SELECT u.id, cp.id, cp.name, 'PENDING', now()
FROM users u, card_products cp
WHERE u.email = 'client@invest.ma' AND cp.name = 'Carte Gold'
  AND NOT EXISTS (
    SELECT 1 FROM card_requests r
     WHERE r.user_id = u.id AND r.product_id = cp.id
  );

-- `issued_by` est renseigné : la contrainte `active_card_is_issued` de 0003
-- refuse une carte active dont on ne sait pas qui l'a émise. Une carte est
-- plastique — elle est fabriquée et distribuée hors de ce système, et il n'y
-- entre que quatre chiffres.
INSERT INTO cards (user_id, product_id, product_name, network, tier, last4,
                   issuer_reference, expiry, status, holder_name,
                   issued_at, activated_at, issued_by, issuance_note)
SELECT u.id, cp.id, cp.name, 'VISA', 'STANDARD', '4242', 'ISS-DEMO-0001', '08/29',
       'ACTIVE', 'YASMINE BERRADA', now() - interval '30 days',
       now() - interval '28 days',
       (SELECT id FROM users WHERE email = 'admin@invest.ma'),
       'Lot FAB-2026-001, bureau émetteur Al Watania'
FROM users u, card_products cp
WHERE u.email = 'client@invest.ma' AND cp.name = 'Carte Classique'
  AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.user_id = u.id);

INSERT INTO cards (user_id, product_id, product_name, network, tier, last4,
                   issuer_reference, expiry, status, holder_name, issued_at,
                   issued_by, issuance_note)
SELECT u.id, cp.id, cp.name, 'MASTERCARD', 'PREMIUM', '8831', 'ISS-DEMO-0002', '03/30',
       'ISSUED', 'KARIM EL AMRANI', now() - interval '3 days',
       (SELECT id FROM users WHERE email = 'admin2@invest.ma'),
       'Lot FAB-2026-002, bureau émetteur Al Watania'
FROM users u, card_products cp
WHERE u.email = 'client2@invest.ma' AND cp.name = 'Carte Gold'
  AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.user_id = u.id);

-- -----------------------------------------------------------------------------
-- Opérations
--
-- Tout passe par les transitions réelles. Le grand livre se remplit donc par
-- les déclencheurs, et le solde de démonstration est reproductible : il n'est
-- écrit nulle part, il se déduit.
-- -----------------------------------------------------------------------------

-- Dépôts déclarés, puis confirmés : c'est la confirmation qui crédite.
INSERT INTO deposits (user_id, amount, currency, method, status, payment_reference,
                      proof, bank_account_id, created_at)
SELECT u.id, v.amount, 'MAD', 'BANK_TRANSFER', 'UNDER_REVIEW', v.ref, v.proof,
       (SELECT id FROM bank_accounts
         WHERE user_id = u.id AND status = 'ACTIVE' LIMIT 1),
       now() - (v.days || ' days')::interval
FROM users u
JOIN (VALUES
  ('client@invest.ma',  50000.00, 'VIR-2026-0001', 'VIR-2026-0001', '25'),
  ('client@invest.ma',  25000.00, 'VIR-2026-0002', 'VIR-2026-0002', '18'),
  ('client2@invest.ma', 80000.00, 'VIR-2026-0003', 'VIR-2026-0003', '20')
) AS v(email, amount, ref, proof, days) ON v.email = u.email
WHERE NOT EXISTS (
  SELECT 1 FROM deposits d
   WHERE d.user_id = u.id AND d.payment_reference = v.ref
);

-- Le délai de traitement est la réalité d'une administration : on ne crédite
-- pas ce qui vient d'arriver.
UPDATE deposits SET status = 'CONFIRMED', review_note = 'Virement reçu et rapproché',
                    reviewed_at = created_at + interval '1 day',
                    confirmed_at = created_at + interval '1 day'
WHERE status = 'UNDER_REVIEW'
  AND created_at < now() - interval '10 days';

-- Un dépôt encore en revue : il donne du travail à l'administration.
INSERT INTO deposits (user_id, amount, currency, method, status, payment_reference,
                      proof, bank_account_id)
SELECT u.id, 15000.00, 'MAD', 'BANK_TRANSFER', 'PENDING', 'VIR-2026-0004',
       'VIR-2026-0004',
       (SELECT id FROM bank_accounts
         WHERE user_id = u.id AND status = 'ACTIVE' LIMIT 1)
FROM users u WHERE u.email = 'client2@invest.ma'
  AND NOT EXISTS (SELECT 1 FROM deposits d WHERE d.payment_reference = 'VIR-2026-0004');

-- Un dépôt crypto, avec son adresse et sa transaction observée.
INSERT INTO deposits (user_id, amount, currency, method, status, payment_reference,
                      proof, crypto_address_id)
SELECT u.id, 5000.00, 'MAD', 'CRYPTO', 'PENDING', 'BTC-DEP-0001',
       'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
       (SELECT id FROM crypto_addresses
         WHERE user_id = u.id AND asset = 'BTC' LIMIT 1)
FROM users u WHERE u.email = 'client@invest.ma'
  AND NOT EXISTS (SELECT 1 FROM deposits d WHERE d.payment_reference = 'BTC-DEP-0001');

INSERT INTO crypto_transactions (address_id, user_id, tx_hash, amount, asset,
                                 network, confirmations, required_confirmations,
                                 status, created_at)
SELECT ca.id, u.id,
       'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
       5000.00, 'BTC', 'Bitcoin', 2, 6, 'CONFIRMING', now() - interval '2 hours'
FROM crypto_addresses ca, users u
WHERE ca.user_id = u.id AND u.email = 'client@invest.ma' AND ca.asset = 'BTC'
  AND NOT EXISTS (SELECT 1 FROM crypto_transactions t WHERE t.tx_hash = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2');

-- Investissements : l'un actif, l'autre en attente de vérification de paiement.
-- Le montant initial ne s'écrit qu'une fois (§7) ; les augmentations passent par
-- `investment_topups`.
INSERT INTO investments (user_id, product_id, product_name, initial_amount, currency,
                         status, payment_method, payment_status, payment_reference,
                         payment_declared_at, payment_verified_at,
                         activated_at, matures_at, created_at)
-- `status` et `payment_status` sont castés en enum, et `amount` en `amount` :
-- le domaine des montants refuse le négatif, donc un cast manquant laisserait
-- passer une saisie fausse jusqu'au moment de l'écriture.
SELECT u.id, p.id, p.name, v.amount::amount, 'MAD', v.status::investment_status,
       'BANK_TRANSFER', v.payment_status::payment_status,
       v.payment_ref, v.declared_at, v.verified_at, v.activated_at, v.matures_at,
       now() - (v.age || ' days')::interval
FROM (VALUES
  ('client@invest.ma',  'Livret Terme 6 mois', 20000.00, 'ACTIVE', 'VERIFIED',
   'INV-2026-PAY-0001', now() - interval '20 days', now() - interval '20 days',
   now() - interval '19 days', now() + interval '161 days', '19'),
  ('client2@invest.ma', 'Pondéré Immobilier',  50000.00, 'ACTIVE', 'VERIFIED',
   'INV-2026-PAY-0002', now() - interval '15 days', now() - interval '15 days',
   now() - interval '14 days', now() + interval '706 days', '14')
) AS v(email, product, amount, status, payment_status, payment_ref,
       declared_at, verified_at, activated_at, matures_at, age)
JOIN users u ON u.email = v.email
JOIN investment_products p ON p.name = v.product
WHERE NOT EXISTS (
  SELECT 1 FROM investments i WHERE i.payment_reference = v.payment_ref
);

-- Une déclaration de paiement en attente de revue : l'écran de l'administration
-- n'est pas vide.
INSERT INTO investments (user_id, product_id, product_name, initial_amount, currency,
                         status, payment_method, payment_status, payment_reference,
                         payment_declared_at, payment_deadline, created_at)
SELECT u.id, p.id, p.name, 10000.00, 'MAD', 'PAYMENT_REVIEW', 'BANK_TRANSFER',
       'DECLARED', 'INV-2026-PAY-0003', now() - interval '2 days',
       now() + interval '5 days', now() - interval '2 days'
FROM users u, investment_products p
WHERE u.email = 'client@invest.ma' AND p.name = 'Marché Émergents'
  AND NOT EXISTS (
    SELECT 1 FROM investments i WHERE i.payment_reference = 'INV-2026-PAY-0003'
  );

-- Une augmentation sur l'investissement actif (§7) : c'est un mouvement
-- distinct, pas une réécriture du montant initial.
INSERT INTO investment_topups (investment_id, user_id, amount, currency, status,
                               payment_status, payment_reference,
                               payment_declared_at, payment_verified_at, created_at)
SELECT i.id, i.user_id, 5000.00, 'MAD', 'ACTIVE', 'VERIFIED', 'TOP-2026-0001',
       now() - interval '5 days', now() - interval '5 days',
       now() - interval '6 days'
FROM investments i
WHERE i.payment_reference = 'INV-2026-PAY-0001'
  AND NOT EXISTS (
    SELECT 1 FROM investment_topups t WHERE t.payment_reference = 'TOP-2026-0001'
  );

-- Prêts (§9) : un dossier en revue, un dossier approuvé et décaissé.
INSERT INTO loans (user_id, requested_amount, currency, requested_duration_months,
                   purpose, additional_info, status, created_at)
SELECT u.id, 40000.00, 'MAD', 12,
       'Consolidation de crédits existants',
       'Trois emprunts en cours, à taux moyen 5,2 %. Sollicité pour un seul '
         'prêt plus long.',
       'UNDER_REVIEW', now() - interval '3 days'
FROM users u WHERE u.email = 'client2@invest.ma'
  AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.purpose LIKE 'Consolidation%');

INSERT INTO loans (user_id, requested_amount, approved_amount, currency,
                   requested_duration_months, approved_duration_months, purpose,
                   status, annual_rate, conditions, review_note,
                   reviewed_at, approved_at, disbursed_at, disbursement_reference,
                   created_at)
SELECT u.id, 30000.00, 25000.00, 'MAD', 12, 12,
       'Aménagement de local professionnel',
       'ACTIVE', 6.500,
       ARRAY[
         'Revenu fiscal stable sur 24 mois',
         'Apport de 30 % du montant',
         'Garantie acceptée sur le fonds de commerce'
       ],
       'Dossier complet, risque accepté après entretien',
       now() - interval '20 days', now() - interval '19 days',
       now() - interval '18 days', 'LOA-DEMO-2026-0001',
       now() - interval '22 days'
FROM users u WHERE u.email = 'client@invest.ma'
  AND NOT EXISTS (
    SELECT 1 FROM loans l WHERE l.disbursement_reference = 'LOA-DEMO-2026-0001'
  );

-- L'échéancier d'un prêt à capital constant : chaque échéance rembourse la
-- même part du capital, l'intérêt se calcule sur le capital restant.
--
-- La dernière part absorbe l'écart d'arrondi. Diviser 25 000 sur 12 donne
-- 2083,33 et un reste de 0,04 : c'est exactement le genre d'écart que la
-- contrainte `check_schedule_total` de 0001 existe pour attraper. LeAbsorber
-- ici, c'est reconnaître que l'arrondi est légitime ; l'ignorer, ce serait
-- mettre un prêt en défaut pour quatre centimes.
--
-- L'intérêt est illustratif — 0,54 % par mois, soit 6,48 % l'an, dégressif
-- sur le capital restant. Le taux contractuel reste celui de `loans.annual_rate` :
-- celui de la ligne d'échéance ne fait qu'expliciter l'application du taux.
INSERT INTO loan_schedule_items (loan_id, position, due_date, principal, interest,
                                 installment, status, paid_at, transaction_reference)
SELECT
  l.id,
  n,
  (date_trunc('month', now()) + (n || ' months')::interval)::date,
  CASE
    WHEN n = l.approved_duration_months THEN
      l.approved_amount
      - round(l.approved_amount / l.approved_duration_months, 2)
        * (l.approved_duration_months - 1)
    ELSE round(l.approved_amount / l.approved_duration_months, 2)
  END AS principal,
  round(
    l.approved_amount
    - round(l.approved_amount / l.approved_duration_months, 2) * (n - 1),
    2
  ) * (l.annual_rate / 100) / 12 AS interest,
  round(l.approved_amount / l.approved_duration_months, 2)
    + round(
        l.approved_amount
        - round(l.approved_amount / l.approved_duration_months, 2) * (n - 1),
        2
      ) * (l.annual_rate / 100) / 12 AS installment,
  'SCHEDULED'::installment_status, NULL, NULL
FROM loans l
CROSS JOIN generate_series(1, l.approved_duration_months) AS n
WHERE l.disbursement_reference = 'LOA-DEMO-2026-0001'
  AND NOT EXISTS (
    SELECT 1 FROM loan_schedule_items s WHERE s.loan_id = l.id
  );

-- La première échéance est payée : le capital restant descend, et la vue de
-- solde le suit sans qu'aucune colonne ne soit mise à jour.
UPDATE loan_schedule_items s
   SET status = 'PAID', paid_at = now() - interval '1 month',
       transaction_reference = 'ECH-DEMO-2026-0001'
FROM loans l
WHERE s.loan_id = l.id
  AND l.disbursement_reference = 'LOA-DEMO-2026-0001'
  AND s.position = 1;

-- Un retrait en vol : il est approuvé, pas encore traité. L'argent n'est pas
-- encore parti, et le grand livre ne le montre donc pas.
INSERT INTO withdrawals (user_id, amount, currency, method, status, destination,
                         review_note, reviewed_at, created_at)
SELECT u.id, 10000.00, 'MAD', 'BANK_TRANSFER', 'PROCESSING',
       'MA120015000001234567890123',
       'Demande conforme, virement en cours d''émission',
       now() - interval '1 day', now() - interval '2 days'
FROM users u WHERE u.email = 'client@invest.ma'
  AND NOT EXISTS (SELECT 1 FROM withdrawals w WHERE w.status = 'PROCESSING');

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------

INSERT INTO notifications (user_id, type, title, message, link, read_at, created_at)
SELECT u.id, 'DEPOSIT_CONFIRMED', 'Dépôt confirmé',
       'Votre dépôt de 50 000,00 MAD a été rapproché et crédité.',
       '/deposits', now() - interval '24 days', now() - interval '25 days'
FROM users u WHERE u.email = 'client@invest.ma'
  AND NOT EXISTS (
    SELECT 1 FROM notifications n
     WHERE n.user_id = u.id AND n.title = 'Dépôt confirmé'
  );

INSERT INTO notifications (user_id, type, title, message, link, created_at)
SELECT u.id, 'LOAN_ACTIVE', 'Prêt décaissé',
       'Votre prêt de 25 000,00 MAD a été versé. Le premier échéancier est disponible.',
       '/loans', now() - interval '18 days'
FROM users u WHERE u.email = 'client@invest.ma'
  AND NOT EXISTS (
    SELECT 1 FROM notifications n
     WHERE n.user_id = u.id AND n.title = 'Prêt décaissé'
  );

INSERT INTO notifications (user_id, type, title, message, link, created_at)
SELECT u.id, 'CRYPTO_CONFIRMING', 'Dépôt crypto en attente de confirmations',
       'Votre transaction reçoit 2 confirmations sur 6 requises.',
       '/deposits', now() - interval '2 hours'
FROM users u WHERE u.email = 'client@invest.ma'
  AND NOT EXISTS (
    SELECT 1 FROM notifications n
     WHERE n.user_id = u.id AND n.title LIKE 'Dépôt crypto en attente%'
  );

-- -----------------------------------------------------------------------------
-- Pièces KYC
--
-- `storage_key` fait référence à un stockage objet ; le fichier lui-même n'est
-- pas dans la base. Une pièce d'identité en base de données est une pièce
-- d'identité dans un fichier de sauvegarde que personne n'a prévu de chiffrer.
-- -----------------------------------------------------------------------------

INSERT INTO kyc_documents (user_id, type, status, storage_key, file_name, mime_type,
                           file_size, uploaded_at, reviewed_at, review_note)
SELECT u.id, 'ID_CARD', 'APPROVED', 'kyc/client/id_card.pdf', 'id_card.pdf',
       'application/pdf', 245000, now() - interval '40 days',
       now() - interval '39 days', 'Pièce lisible, concordance vérifiée'
FROM users u WHERE u.email = 'client@invest.ma'
  AND NOT EXISTS (SELECT 1 FROM kyc_documents k WHERE k.user_id = u.id AND k.type = 'ID_CARD');

INSERT INTO kyc_documents (user_id, type, status, uploaded_at)
SELECT u.id, 'PROOF_OF_ADDRESS', 'PENDING', now() - interval '1 day'
FROM users u WHERE u.email = 'client2@invest.ma'
  AND NOT EXISTS (
    SELECT 1 FROM kyc_documents k WHERE k.user_id = u.id AND k.type = 'PROOF_OF_ADDRESS'
  );

-- -----------------------------------------------------------------------------
-- Journal d'audit (§22)
--
-- Écrit ici parce que c'est un jeu de démonstration. En service, ces lignes
-- naissent des actions du backend, pas d'un script.
-- -----------------------------------------------------------------------------

INSERT INTO audit_logs (action, actor_id, actor_email, target_user_id, result, details, created_at)
SELECT 'LOGIN', u.id, u.email, u.id, 'SUCCESS', 'Session ouverte', now() - interval '2 days'
FROM users u WHERE u.email = 'client@invest.ma'
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs a
     WHERE a.action = 'LOGIN' AND a.target_user_id = u.id
  );

INSERT INTO audit_logs (action, actor_id, actor_email, target_user_id, result, details, created_at)
SELECT 'APPROVE_LOAN', a.id, a.email, u.id, 'SUCCESS',
       'Prêt de 25 000,00 MAD approuvé sur 12 mois', now() - interval '19 days'
FROM users a, users u
WHERE a.email = 'admin@invest.ma' AND u.email = 'client@invest.ma'
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs l WHERE l.action = 'APPROVE_LOAN'
  );

INSERT INTO audit_logs (action, actor_id, actor_email, target_user_id, result, details, created_at)
SELECT 'CONFIRM_DEPOSIT', a.id, a.email, u.id, 'SUCCESS',
       'Dépôt de 50 000,00 MAD confirmé', now() - interval '24 days'
FROM users a, users u
WHERE a.email = 'admin@invest.ma' AND u.email = 'client@invest.ma'
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs l WHERE l.action = 'CONFIRM_DEPOSIT'
  );

COMMIT;

-- -----------------------------------------------------------------------------
-- Contrôle final : le seed est-il cohérent avec lui-même ?
-- -----------------------------------------------------------------------------

\echo ''
\echo '=== COMPTES DE DÉMONSTRATION ==='
\echo '  client@invest.ma     / Client123!   (CLIENT,       VERIFIED)'
\echo '  client2@invest.ma    / Client123!   (CLIENT,       VERIFIED)'
\echo '  admin@invest.ma      / Admin123!    (ADMIN,        VERIFIED)'
\echo '  admin2@invest.ma     / Admin123!    (ADMIN,        VERIFIED)'
\echo '  superadmin@invest.ma / Root123!     (SUPER_ADMIN,  VERIFIED)'
\echo ''
\echo '  Ces mots de passe sont des exemples lisibles en clair dans ce fichier.'
\echo '  Ils n’ont aucune valeur et ce jeu ne doit jamais être déployé.'

\echo ''
\echo '=== SOLDES, REJOUÉS DEPUIS LE GRAND LIVRE ==='
SELECT
  u.email,
  b.available AS disponible,
  b.invested  AS investi,
  b.pending   AS en_cours,
  b.currency
FROM client_balances b
JOIN users u ON u.id = b.user_id
WHERE b.available <> 0 OR b.invested <> 0 OR b.pending <> 0
ORDER BY u.email;

\echo ''
\echo '=== GRAND LIVRE ==='
SELECT t.reference, t.type, t.amount, t.status
FROM transactions t
ORDER BY t.created_at;

\echo ''
\echo '=== FILE D''ATTENTE DE L''ADMINISTRATION ==='
SELECT * FROM admin_pending_review;

\echo ''
\echo '=== CE QUE L''ADMINISTRATION A ATTRIBUÉ À LA MAIN ==='
\echo '    IBAN, adresses de dépôt et cartes sont saisis par un humain.'
\echo '    Chaque ligne porte son auteur : une attribution sans auteur ne'
\echo '    prouve rien et se voit immédiatement.'
SELECT object_type, holder_email, detail, assigned_by, assigned_at
FROM admin_assignments
ORDER BY assigned_at;
