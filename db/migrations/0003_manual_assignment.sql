-- =============================================================================
-- Saisie manuelle : ce que l'administration fait à la main doit être vérifiable
--
-- L'administration attribue elle-même les IBAN, les adresses de dépôt et les
-- cartes. C'est un choix : il retire une dépendance contractuelle, et il
-- transfère la responsabilité de la saisie sur un humain.
--
-- Ce que cela change, et que cette migration prend en charge :
--
--   1. Une faute de frappe devient irréversible. Un IBAN erroné, c'est de
--      l'argent parti chez quelqu'un d'autre ; une adresse erronée, c'est de
--      l'argent perdu. Aucun appel à un fournisseur ne rattrape une saisie
--      manuelle : la vérification doit avoir lieu à l'écriture, pas à l'usage.
--
--   2. Une attribution doit être attribuée. Le schéma sait désormais QUI a
--      écrit quoi, et refuse qu'un client se l'attribue lui-même — la
--      contrainte est dans la base, donc un client ne peut pas la contourner
--      depuis le navigateur.
--
-- Ce que cette migration ne fait pas, et qu'aucune contrainte ne peut faire :
-- vérifier qu'un IBAN appartient réellement à la personne qui le réclame. Seul
-- un appel à l'établissement émetteur le peut. C'est dit ici parce que la
-- saisie manuelle donne l'illusion du contrôle, alors qu'elle le déplace.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- IBAN : la clé de contrôle ISO 7064 (mod 97)
--
-- Une IBAN valide se reconnaît à ce que son reste modulo 97 vaut 1, après
-- déplacement des quatre premiers caractères en fin de chaîne et conversion des
-- lettres en nombres (A = 10 … Z = 35).
--
-- Ce contrôle n'attrape pas tout : un IBAN bien formé peut appartenir à
-- quelqu'un d'autre. Il attrape ce qui est le plus probable et le plus grave,
-- c'est-à-dire la faute de frappe — une inversion de deux chiffres, un chiffre
-- sauté, une lettre confondue avec la précédente. C'est exactement ce que
-- détecte le mod 97, et c'est ce que l'œil ne voit pas.
-- -----------------------------------------------------------------------------

-- La conversion lettres → chiffres se fait caractère par caractère, et
-- volontairement pas avec `translate` : passé 26 lettres source pour 10 chiffres
-- cible, PostgreSQL supprime les caractères au-delà de la position 10 au lieu
-- de les convertir. `translate('MA', 'A..Z', '0123456789')` rend donc « 0 »,
-- alors qu'un IBAN commence par MA et devrait donner « 2210 ». L'erreur est
-- silencieuse et rendrait la fonction capable de valider n'importe quoi.
CREATE OR REPLACE FUNCTION iban_to_digits(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT string_agg(
           CASE WHEN c ~ '[A-Z]' THEN (ascii(c) - 55)::text
                ELSE c
           END,
           '' ORDER BY position
         )
    FROM regexp_split_to_table(upper($1), '') WITH ORDINALITY AS chars(c, position);
$$;

COMMENT ON FUNCTION iban_to_digits(text) IS
  'Convertit un IBAN en chaîne de chiffres selon ISO 7064 : A = 10 … Z = 35. '
  'Ne pas réécrire avec translate, qui tronque au dixième caractère.';

CREATE OR REPLACE FUNCTION iban_mod_97(iban text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT mod(CAST(iban_to_digits(substr(v, 5) || substr(v, 1, 4)) AS numeric), 97)
    FROM (SELECT upper(regexp_replace(iban, '\s', '', 'g')) AS v) cleaned;
$$;

CREATE OR REPLACE FUNCTION iban_is_valid(iban text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT
    -- Longueur IBAN : 15 à 34 caractères. Les pays nordiques et l'Allemagne
    -- sont les plus longs, l'Islande le plus court.
    length(v) BETWEEN 15 AND 34
    -- Forme : deux lettres de pays, deux chiffres, puis alphanumériques.
    AND v ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$'
    -- La clé de contrôle doit valoir 1.
    AND iban_mod_97(v) = 1
  FROM (SELECT upper(regexp_replace(iban, '\s', '', 'g')) AS v) cleaned;
$$;

COMMENT ON FUNCTION iban_is_valid(text) IS
  'Clé de contrôle ISO 7064 (mod 97) d''un IBAN. Vérifie la forme et la clé, '
  'pas l''appartenance du compte : seule la banque détentrice le peut.';


-- -----------------------------------------------------------------------------
-- Adresses de dépôt : le format dépend du réseau
--
-- Une adresse mal formée ne peut rien recevoir, et l'argent envoyé vers une
-- adresse inexistante est perdu sans retour. Le contrôle est fait à
-- l'écriture, par réseau.
--
-- Les motifs reprennent ceux du front (`src/services/crypto.ts`). Ils sont
-- volontairement rejoués ici : une validation qui n'existe que dans le
-- navigateur disparaît avec lui, et la base accepterait alors n'importe quoi.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION crypto_address_is_valid(asset crypto_asset, address text)
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE asset
    -- Bitcoin : bech32 (bc1…) ou hérité (1… ou 3…). L'alphabet bech32 exclut
    -- 1, b, i et o : une adresse qui en contient un est illisible, même quand
    -- elle a l'air correcte. Et comme ces caractères sont précisément ceux que
    -- deux opérateurs confondent, la même adresse pourrait être enregistrée
    -- sous deux orthographes, avec un dépôt compté une fois sur deux.
    WHEN 'BTC' THEN
      address ~ '^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$'

    -- Ethereum : 20 octets en hexadécimal, préfixe 0x.
    WHEN 'ETH'        THEN address ~ '^0x[a-fA-F0-9]{40}$'
    WHEN 'USDT_ERC20' THEN address ~ '^0x[a-fA-F0-9]{40}$'

    -- Tron : base58, préfixe T, 33 caractères après le T — 34 en tout.
    -- Un T suivi de 38 caractères, comme on le rencontre dans les exemples
    -- ajoutés à la main, n'est pas une adresse : personne ne peut y déposer.
    WHEN 'USDT_TRC20' THEN address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'

    ELSE false
  END;
$$;

COMMENT ON FUNCTION crypto_address_is_valid(crypto_asset, text) IS
  'Format d''une adresse de dépôt pour le réseau concerné. Ne garantit pas '
  'que l''adresse existe sur la chaîne, seulement qu''elle est recevable.';


-- -----------------------------------------------------------------------------
-- Qui a attribué
--
-- Trois colonnes, une par objet attribué à la main, pointant toutes vers
-- `users`. Le déclencheur plus bas refuse une attribution par quelqu'un qui
-- n'est pas administrateur : sans lui, un client pourrait s'écrire son propre
-- IBAN en manipulant la requête, puisque la RLS ne l'interdit que si l'écriture
-- passe par le service — et une API mal écrite passe souvent par l'autre.
-- -----------------------------------------------------------------------------

ALTER TABLE bank_accounts
  ADD COLUMN assigned_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN assigned_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN assignment_note text;

ALTER TABLE crypto_addresses
  ADD COLUMN assigned_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN assigned_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN assignment_note text;

-- `issued_at` existe déjà sur `cards` depuis 0001 : c'est la date d'émission,
-- et il ne fallait pas en créer une seconde. Cette migration y ajoute
-- l'auteur de l'émission, qui manquait — sans lui, on savait qu'une carte
-- avait été émise, mais pas par qui.
ALTER TABLE cards
  ADD COLUMN issued_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN issuance_note text;

COMMENT ON COLUMN bank_accounts.assignment_note IS
  'Origine de l''IBAN saisi : correspondance bancaire, pièce justificative, '
  'demande du client. Une saisie sans note n''est pas opposable.';
COMMENT ON COLUMN cards.issuance_note IS
  'Lot de carte physique, bureau émetteur, référence de fabrication. La carte '
  'est plastique : elle est fabriquée et distribuée hors de ce système.';


-- -----------------------------------------------------------------------------
-- Vérification à l'écriture
--
-- Un contrôle en base et non en application. La raison est simple : une
-- contrainte SQL ne peut pas être contournée par un client, quelle que soit la
-- requête qu'il parvienne à envoyer.
-- -----------------------------------------------------------------------------

ALTER TABLE bank_accounts
  ADD CONSTRAINT bank_account_iban_checksum
  CHECK (iban_is_valid(iban));

ALTER TABLE crypto_addresses
  ADD CONSTRAINT crypto_address_format
  CHECK (crypto_address_is_valid(asset, address));

-- Une carte activée porte une date d'émission et un émetteur : une carte
-- activée dont on ne sait pas qui l'a émise n'a pas de provenance.
ALTER TABLE cards
  ADD CONSTRAINT active_card_is_issued
  CHECK (status <> 'ACTIVE' OR (issued_at IS NOT NULL AND issued_by IS NOT NULL));


-- -----------------------------------------------------------------------------
-- Seuls des administrateurs attribuent
--
-- Le déclencheur interroge `users`, ce qu'une contrainte ne peut pas faire :
-- les sous-requêtes sont interdites dans un CHECK. Il est donc côté
-- déclencheur, mais il reste en base — donc du côté du serveur, jamais du
-- navigateur.
--
-- `assigned_by` reste nullable : une attribution faite avant cette migration,
-- ou par un script d'import, n'a pas d'auteur connu. Renseigner NULL est
-- possible ;inventer un auteur ne l'est pas.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION require_admin_assignee() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  assignee_role user_role;
BEGIN
  IF NEW.assigned_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO assignee_role FROM users WHERE id = NEW.assigned_by;

  IF assignee_role IS NULL OR assignee_role = 'CLIENT' THEN
    RAISE EXCEPTION
      'Seul un administrateur peut attribuer % : le compte % ne l''est pas',
      TG_TABLE_NAME, NEW.assigned_by
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bank_accounts_require_admin_assignee
  BEFORE INSERT OR UPDATE OF assigned_by ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION require_admin_assignee();

CREATE TRIGGER crypto_addresses_require_admin_assignee
  BEFORE INSERT OR UPDATE OF assigned_by ON crypto_addresses
  FOR EACH ROW EXECUTE FUNCTION require_admin_assignee();

-- `cards` nomme l'émetteur `issued_by` : le même contrôle, un autre nom de
-- colonne. Une fonction par colonne, plutôt qu'un paramètre : un paramètre
-- aurait pu recevoir le nom d'une colonne que la fonction ne vérifie pas.
CREATE OR REPLACE FUNCTION require_admin_issuer() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  issuer_role user_role;
BEGIN
  IF NEW.issued_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO issuer_role FROM users WHERE id = NEW.issued_by;

  IF issuer_role IS NULL OR issuer_role = 'CLIENT' THEN
    RAISE EXCEPTION
      'Seul un administrateur peut emettre une carte : le compte % ne l''est pas',
      NEW.issued_by
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cards_require_admin_issuer
  BEFORE INSERT OR UPDATE OF issued_by ON cards
  FOR EACH ROW EXECUTE FUNCTION require_admin_issuer();


-- -----------------------------------------------------------------------------
-- Journal : l'attribution manuelle est une action journalisée
--
-- §22 exige déjà que l'affectation d'IBAN, l'émission de carte et
-- l'attribution d'adresse soient tracées — `audit_logs` a les trois actions.
--
-- Ce qu'apporte cette migration, c'est que la trace est désormais reconstituable
-- depuis la donnée elle-même : `assigned_by` et `assigned_at` sont sur la ligne,
-- pas seulement dans un journal qu'une purge effacerait. Les deux se
-- recoupent, et c'est leur concordance qui fait la preuve.
-- -----------------------------------------------------------------------------

-- `security_invoker` est explicite même si c'est le défaut : la vue ne doit rien
-- accorder que la RLS n'accorde pas. Un `SECURITY DEFINER` ici elevated les
-- droits du propriétaire et ferait voir à un client toutes les attributions
-- qu'il n'a pas le droit de connaître.
CREATE VIEW admin_assignments WITH (security_invoker = true) AS
  SELECT 'IBAN'::text AS object_type, b.id AS object_id,
         u.email::text AS holder_email, b.iban::text AS detail,
         a.email::text AS assigned_by, b.assigned_at AS assigned_at
    FROM bank_accounts b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN users a ON a.id = b.assigned_by

  UNION ALL

  SELECT 'CRYPTO_ADDRESS', c.id,
         u.email::text,
         c.asset::text || ' ' || c.address,
         a.email::text, c.assigned_at
    FROM crypto_addresses c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN users a ON a.id = c.assigned_by

  UNION ALL

  SELECT 'CARD', d.id,
         u.email::text,
         d.network::text || ' •••• ' || d.last4,
         a.email::text, d.issued_at
    FROM cards d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN users a ON a.id = d.issued_by;

COMMENT ON VIEW admin_assignments IS
  'Tout ce que l''administration a attribué à la main, avec son auteur. Une '
  'attribution sans auteur (NULL) est signalée telle quelle : elle ne prouve '
  'rien et doit être régularisée.';

-- La vue est en `security_invoker`, donc la RLS des tables sous-jacentes
-- s'applique ligne à ligne : un client n'y voit que ses propres attributions,
-- l'administration les voit toutes. C'est ce qu'on veut d'un registre — la
-- page d'audit d'un client ne doit pas recenser ce qui a été attribué aux
-- autres.
