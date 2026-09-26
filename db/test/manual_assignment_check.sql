-- =============================================================================
-- Saisie manuelle : ce que la base refuse quand un humain se trompe
--
-- Une saisie manuelle n'a pas d	call à un fournisseur pour rattraper une
-- faute de frappe. Un IBAN erroné, c'est de l'argent chez quelqu'un d'autre ;
-- une adresse erronée, c'est de l'argent perdu. Ces vérifications sont donc
-- faites à l'écriture, par la base, et non à l'usage, par un humain.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- -----------------------------------------------------------------------------
-- Outillage
-- -----------------------------------------------------------------------------

INSERT INTO users (id, email, password_hash, role, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@test.ma',  'h', 'CLIENT', 'VERIFIED'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.ma',    'h', 'CLIENT', 'VERIFIED'),
  ('33333333-3333-3333-3333-333333333333', 'sofia@test.ma',  'h', 'ADMIN',  'VERIFIED'),
  ('44444444-4444-4444-4444-444444444444', 'mehdi@test.ma',  'h', 'ADMIN',  'VERIFIED')
ON CONFLICT (email) DO NOTHING;

\echo ''
\echo '=== 1. IBAN : la clé de contrôle ISO 7064 ==='

-- Contre-vérification de la fonction sur des IBAN de référence bien connus.
-- Sans cela, un test qui passe ne prouve rien : il prouverait seulement que la
-- fonction accepte ce qu'on lui donne.
DO $$
DECLARE attendu text; obtenu text;
BEGIN
  FOREACH attendu IN ARRAY ARRAY[
    'DE89370400440532013000',     -- exemple ISO 13616, Allemagne
    'GB82WEST12345698765432',     -- exemple ISO 13616, Royaume-Uni
    'FR1420041010050500013M02606' -- exemple ISO 13616, France
  ] LOOP
    IF NOT iban_is_valid(attendu) THEN
      RAISE EXCEPTION 'ECHEC: l IBAN de reference % devrait etre valide', attendu;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK  3 IBAN de reference acceptes';
END $$;

DO $$
DECLARE obtenu text; n int := 0;
BEGIN
  -- IBAN bien formés dont la clé de contrôle est fausse : une inversion de
  -- chiffres, un chiffre sauté, une lettre confondue avec la précédente.
  FOREACH obtenu IN ARRAY ARRAY[
    'MA120015000001234567890124', -- deux chiffres inversés
    'MA120015000001234567890125', -- dernier chiffre erroné
    'MA12001500000123456789123',  -- un chiffre sauté
    'MA12001500000123456789012X'   -- lettre changée
  ] LOOP
    IF iban_is_valid(obtenu) THEN
      RAISE EXCEPTION 'ECHEC: % passe alors que sa clé est fausse', obtenu;
    END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'OK  % IBAN de controle faux refuses', n;
END $$;

DO $$
BEGIN
  IF iban_is_valid('12345') THEN
    RAISE EXCEPTION 'ECHEC: une chaine courte est acceptee';
  END IF;
  IF iban_is_valid('') THEN
    RAISE EXCEPTION 'ECHEC: une chaine vide est acceptee';
  END IF;
  IF iban_is_valid('MA12001500000123456789012') THEN
    -- 24 caracteres : trop court, un IBAN vaut au minimum 15 et au maximum 34,
    -- mais un corps de banque marocain fait 23 chiffres. On vérifie la borne,
    -- pas une règle de pays.
    RAISE EXCEPTION 'ECHEC: longueur hors bornes acceptee';
  END IF;
  RAISE NOTICE 'OK  formes hors bornes refusees';
END $$;

-- Les espaces de présentation ne doivent pas invalider un IBAN valide : c'est
-- la forme que l'administration recopie d'un relevé.
DO $$
BEGIN
  IF NOT iban_is_valid('MA12 0015 0000 0123 4567 8901 23') THEN
    RAISE EXCEPTION 'ECHEC: un IBAN espace est refuse alors qu il est valide';
  END IF;
  RAISE NOTICE 'OK  les espaces de presentation sont tolere';
END $$;

\echo ''
\echo '=== 2. La base refuse un IBAN dont la clé est fausse ==='

DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency,
                               assigned_by, assignment_note)
    VALUES ('11111111-1111-1111-1111-111111111111',
            'MA64011515000001234567890123', 'Attijariwafa', 'Alice', 'MAD',
            '33333333-3333-3333-3333-333333333333', 'relevé bancaire');
    RAISE EXCEPTION 'ECHEC: un IBAN a clé fausse a ete accepte';
  EXCEPTION WHEN check_violation THEN
    n := n + 1;
  END;

  BEGIN
    INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency)
    VALUES ('11111111-1111-1111-1111-111111111111',
            'DE89370400440532013001', 'Deutsche Bank', 'Alice', 'MAD');
    RAISE EXCEPTION 'ECHEC: un IBAN allemand falsifie a ete accepte';
  EXCEPTION WHEN check_violation THEN
    n := n + 1;
  END;

  IF n <> 2 THEN RAISE EXCEPTION 'ECHEC: % refus sur 2 attendus', n; END IF;
  RAISE NOTICE 'OK  la base refuse % IBAN dont la cle est fausse', n;
END $$;

\echo ''
\echo '=== 3. Un IBAN valide passe, avec son auteur ==='

INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency,
                           assigned_by, assignment_note)
VALUES ('11111111-1111-1111-1111-111111111111',
        'MA120015000001234567890123', 'Attijariwafa Bank', 'Alice', 'MAD',
        '33333333-3333-3333-3333-333333333333',
        'IBAN confirmé sur relevé du 12/01, correspondance demandée au client')
ON CONFLICT DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM bank_accounts WHERE iban = 'MA120015000001234567890123';
  IF n <> 1 THEN RAISE EXCEPTION 'ECHEC: l IBAN valide n a pas ete enregistre'; END IF;
  RAISE NOTICE 'OK  IBAN valide enregistre avec son auteur';
END $$;

\echo ''
\echo '=== 4. Un client ne peut pas s attribuer un IBAN ==='

DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency,
                               assigned_by, assignment_note)
    VALUES ('22222222-2222-2222-2222-222222222222',
            'MA820015000001234567890124', 'X', 'Bob', 'MAD',
            '22222222-2222-2222-2222-222222222222', 'fait main');
    RAISE EXCEPTION 'ECHEC: un client s est attribue son propre IBAN';
  EXCEPTION WHEN restrict_violation THEN
    n := n + 1;
  END;

  -- Et il ne peut pas non plus reprendre la main sur l'IBAN d'un autre.
  BEGIN
    UPDATE bank_accounts
       SET assigned_by = '22222222-2222-2222-2222-222222222222'
     WHERE user_id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'ECHEC: un client a repris la main sur l IBAN d autrui';
  EXCEPTION WHEN restrict_violation THEN
    n := n + 1;
  END;

  IF n <> 2 THEN RAISE EXCEPTION 'ECHEC: % refus sur 2 attendus', n; END IF;

  IF (SELECT assigned_by FROM bank_accounts
       WHERE user_id = '11111111-1111-1111-1111-111111111111')
     IS DISTINCT FROM '33333333-3333-3333-3333-333333333333' THEN
    RAISE EXCEPTION 'ECHEC: l auteur de l IBAN a ete modifie';
  END IF;

  RAISE NOTICE 'OK  auto-attribution et reprise refusees, auteur intact';
END $$;

\echo ''
\echo '=== 5. Adresses crypto : le format depend du reseau ==='

-- Un actif mal orthographié est refusé avant même la forme de l'adresse.
DO $$
BEGIN
  BEGIN
    INSERT INTO crypto_addresses (user_id, asset, network, address, assigned_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'XRP', 'Ripple',
            'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH', '33333333-3333-3333-3333-333333333333');
    RAISE EXCEPTION 'ECHEC: un actif inconnu est accepte';
  EXCEPTION WHEN check_violation OR invalid_text_representation THEN
    RAISE NOTICE 'OK  actif inconnu refuse';
  END;
END $$;

-- Une adresse Ethereum dans un champ BTC : la forme est bonne, le réseau faux.
-- C'est la faute la plus coûteuse en crypto — les fonds partent et rien ne les
-- rend. Le contrôle par réseau existe pour elle.
DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    INSERT INTO crypto_addresses (user_id, asset, network, address, assigned_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'BTC', 'Bitcoin',
            '0x8f2a5c9e1b4d7f0a3c6e9b2d5f8a1c4e7b0d3f6a', '33333333-3333-3333-3333-333333333333');
    RAISE EXCEPTION 'ECHEC: une adresse ETH est acceptee comme BTC';
  EXCEPTION WHEN check_violation THEN n := n + 1; END;

  BEGIN
    INSERT INTO crypto_addresses (user_id, asset, network, address, assigned_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'USDT_TRC20', 'Tron',
            'TQm9kL2pN4rS7tU1vX5zB8cD3fG6hJ9kL3mN7pQ', '33333333-3333-3333-3333-333333333333');
    RAISE EXCEPTION 'ECHEC: une adresse TRON trop longue est acceptee';
  EXCEPTION WHEN check_violation THEN n := n + 1; END;

  -- Une adresse qui a l'air correcte mais contient un caractère hors
  -- alphabet : le bech32 exclut 1, b, i et o. C'est le genre de faute que
  -- l'œil ne voit pas, et qui rend l'adresse inatteignable.
  BEGIN
    INSERT INTO crypto_addresses (user_id, asset, network, address, assigned_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'BTC', 'Bitcoin',
            'bc1q9d8k2m4p7x3n5v8w1z6y0b2c4d6f8h2j4l6n8', '33333333-3333-3333-3333-333333333333');
    RAISE EXCEPTION 'ECHEC: une adresse bech32 hors alphabet est acceptee';
  EXCEPTION WHEN check_violation THEN n := n + 1; END;

  IF n <> 3 THEN RAISE EXCEPTION 'ECHEC: % refus sur 3 attendus', n; END IF;
  RAISE NOTICE 'OK  reseau errone, longueur TRC20 invalide et alphabet bech32 : % refus', n;
END $$;

\echo ''
\echo '=== 6. Les adresses valides passent, par reseau ==='

DO $$
DECLARE n int := 0;
BEGIN
  -- Vecteur de test canonique de BIP-173, et non une adresse inventée : une
  -- adresse valide qu'on a écrite soi-même ne prouve que soi-même.
  IF NOT crypto_address_is_valid('BTC',
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080') THEN n := n + 1; END IF;
  IF NOT crypto_address_is_valid('ETH',
        '0x3a18f6d4b2907e5c3a18f6d4b2907e5c3a18f6d4') THEN n := n + 1; END IF;
  IF NOT crypto_address_is_valid('USDT_TRC20',
        'TqRsDBoPDju5bT9fVyMjsF7VfVRbqMKuDb') THEN n := n + 1; END IF;
  IF NOT crypto_address_is_valid('USDT_ERC20',
        '0x7b2f9a4c6e1d3b5a8c0e2f4d6b1a3c5e7f9d1b3a') THEN n := n + 1; END IF;

  IF n <> 0 THEN RAISE EXCEPTION 'ECHEC: % adresses valides refusees', n; END IF;
  RAISE NOTICE 'OK  une adresse valide par reseau acceptee';
END $$;

-- Bitcoin hérité (1… et 3…) : le format est plus ancien mais toujours utilisé.
DO $$
BEGIN
  IF NOT crypto_address_is_valid('BTC', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2') THEN
    RAISE EXCEPTION 'ECHEC: une adresse BTC heritee est refusee';
  END IF;
  RAISE NOTICE 'OK  adresse BTC heritee acceptee';
END $$;

\echo ''
\echo '=== 7. Une adresse ne sert qu a un client ==='

DO $$
DECLARE n int := 0;
BEGIN
  INSERT INTO crypto_addresses (user_id, asset, network, address, assigned_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'BTC', 'Bitcoin',
          'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080', '33333333-3333-3333-3333-333333333333');

  BEGIN
    INSERT INTO crypto_addresses (user_id, asset, network, address, assigned_by)
    VALUES ('22222222-2222-2222-2222-222222222222', 'BTC', 'Bitcoin',
            'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080', '33333333-3333-3333-3333-333333333333');
    RAISE EXCEPTION 'ECHEC: une adresse a ete attribuee a deux clients';
  EXCEPTION WHEN unique_violation THEN
    n := n + 1;
  END;

  IF n <> 1 THEN RAISE EXCEPTION 'ECHEC: le doublon d adresse a ete accepte'; END IF;
  RAISE NOTICE 'OK  une adresse ne sert qu a un client';
END $$;

\echo ''
\echo '=== 8. Cartes : l emetteur est un administrateur ==='

INSERT INTO card_products (name, network, tier, description, currency, status)
VALUES ('Carte Test', 'VISA', 'STANDARD', 'Carte de test', 'MAD', 'PUBLISHED')
ON CONFLICT DO NOTHING;

DO $$
DECLARE n int := 0;
BEGIN
  -- Une carte active sans émetteur : on ne sait pas qui l'a fabriquée, donc
  -- personne n'en répond.
  BEGIN
    INSERT INTO cards (user_id, product_id, product_name, network, tier, last4,
                       issuer_reference, holder_name, status, activated_at, issued_at)
    SELECT '11111111-1111-1111-1111-111111111111', id, name, 'VISA', 'STANDARD',
           '4242', 'ISS-1', 'ALICE', 'ACTIVE', now(), now()
      FROM card_products WHERE name = 'Carte Test';
    RAISE EXCEPTION 'ECHEC: une carte active sans emetteur est acceptee';
  EXCEPTION WHEN check_violation THEN n := n + 1; END;

  -- Une carte émise par un client.
  BEGIN
    INSERT INTO cards (user_id, product_id, product_name, network, tier, last4,
                       issuer_reference, holder_name, status, issued_at, issued_by)
    SELECT '11111111-1111-1111-1111-111111111111', id, name, 'VISA', 'STANDARD',
           '4242', 'ISS-1', 'ALICE', 'ISSUED', now(),
           '11111111-1111-1111-1111-111111111111'
      FROM card_products WHERE name = 'Carte Test';
    RAISE EXCEPTION 'ECHEC: un client a emis sa propre carte';
  EXCEPTION WHEN restrict_violation THEN n := n + 1; END;

  IF n <> 2 THEN RAISE EXCEPTION 'ECHEC: % refus sur 2 attendus', n; END IF;
  RAISE NOTICE 'OK  carte sans emetteur refusee, emission par un client refusee';
END $$;

DO $$
DECLARE n int;
BEGIN
  INSERT INTO cards (user_id, product_id, product_name, network, tier, last4,
                     issuer_reference, expiry, holder_name, status,
                     issued_at, activated_at, issued_by, issuance_note)
  SELECT '11111111-1111-1111-1111-111111111111', id, name, 'VISA', 'STANDARD',
         '4242', 'ISS-2026-0001', '08/29', 'ALICE', 'ACTIVE',
         now(), now(), '33333333-3333-3333-3333-333333333333',
         'Lot FAB-2026-014, bureau émetteur Al Watania'
    FROM card_products WHERE name = 'Carte Test';

  SELECT count(*) INTO n FROM cards
   WHERE status = 'ACTIVE' AND issued_by IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'ECHEC: l emission legitime est refusee'; END IF;
  RAISE NOTICE 'OK  emission par un administrateur acceptee';
END $$;

\echo ''
\echo '=== 9. Le numero de carte complet reste impossible ==='

DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    INSERT INTO cards (user_id, product_id, product_name, network, tier, last4,
                       issuer_reference, holder_name, status, issued_at, issued_by)
    SELECT '22222222-2222-2222-2222-222222222222', id, name, 'VISA', 'STANDARD',
           '4242424242424242', 'ISS-2', 'BOB', 'ISSUED', now(),
           '33333333-3333-3333-3333-333333333333'
      FROM card_products WHERE name = 'Carte Test';
    RAISE EXCEPTION 'ECHEC: un numero complet est accepte';
  EXCEPTION WHEN check_violation THEN n := n + 1; END;

  BEGIN
    INSERT INTO cards (user_id, product_id, product_name, network, tier, last4,
                       issuer_reference, holder_name, status, issued_at, issued_by)
    SELECT '22222222-2222-2222-2222-222222222222', id, name, 'VISA', 'STANDARD',
           '123', 'ISS-3', 'BOB', 'ISSUED', now(),
           '33333333-3333-3333-3333-333333333333'
      FROM card_products WHERE name = 'Carte Test';
    RAISE EXCEPTION 'ECHEC: trois chiffres sont acceptes';
  EXCEPTION WHEN check_violation THEN n := n + 1; END;

  IF n <> 2 THEN RAISE EXCEPTION 'ECHEC: % refus sur 2 attendus', n; END IF;
  RAISE NOTICE 'OK  seuls quatre chiffres sont acceptes';
END $$;

\echo ''
\echo '=== 10. Le registre des attributions manuelles ==='

DO $$
DECLARE n int; sans_auteur int;
BEGIN
  SELECT count(*) INTO n FROM admin_assignments;
  IF n < 3 THEN
    RAISE EXCEPTION 'ECHEC: le registre ne recense que % attributions', n;
  END IF;

  -- Une attribution sans auteur est comptée comme telle : elle n'est pas
  -- régularisée en silence, elle apparaît.
  SELECT count(*) INTO sans_auteur
    FROM admin_assignments WHERE assigned_by IS NULL;
  RAISE NOTICE 'OK  % attributions au registre, dont % sans auteur', n, sans_auteur;

  IF NOT EXISTS (
    SELECT 1 FROM admin_assignments
     WHERE object_type = 'IBAN' AND assigned_by = 'sofia@test.ma'
  ) THEN
    RAISE EXCEPTION 'ECHEC: l IBAN de Sofia n est pas au registre avec son auteur';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM admin_assignments
     WHERE object_type = 'CARD' AND detail LIKE '%4242'
  ) THEN
    RAISE EXCEPTION 'ECHEC: la carte n est pas au registre';
  END IF;

  RAISE NOTICE 'OK  IBAN et carte retrouvables avec leur auteur';
END $$;

ROLLBACK;

\echo ''
\echo '=== LA SAISIE MANUELLE EST VERIFIEE A L ECRITURE ==='
