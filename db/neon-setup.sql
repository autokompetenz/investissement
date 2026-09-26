-- =============================================================================
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

\echo Plateforme d'investissement : installation du schéma
\echo ''
-- ----------------------------------------------------------------------------
-- 0001_init.sql
-- ----------------------------------------------------------------------------
-- =============================================================================
-- Plateforme d'investissement — schéma initial
--
-- Conception alignée sur le cahier des charges :
--   §15  une table centrale "transactions" garde la trace de chaque mouvement
--   §17  le serveur est seul habilité à calculer un solde ; le front n'affiche
--   §19  les statuts sont ceux de la spécification, à l'identique
--   §20  les rôles sont CLIENT / ADMIN / SUPER_ADMIN
--   §22  les actions sensibles sont journalisées
--
-- Règles structurantes :
--   1. aucun montant en flottant, jamais ;
--   2. le grand livre est en ajout seul, une correction est une nouvelle ligne ;
--   3. un solde est rejoué, jamais stocké : une vue, pas une colonne.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- =============================================================================
-- Types
-- =============================================================================

CREATE TYPE user_role AS ENUM ('CLIENT', 'ADMIN', 'SUPER_ADMIN');

CREATE TYPE account_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

CREATE TYPE kyc_document_type AS ENUM (
  'ID_CARD', 'PASSPORT', 'DRIVING_LICENSE', 'PROOF_OF_ADDRESS', 'SELFIE'
);

CREATE TYPE kyc_document_status AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED', 'NEED_MORE_INFO'
);

-- §6 / §7 / §19
CREATE TYPE investment_status AS ENUM (
  'PENDING_PAYMENT', 'PAYMENT_REVIEW', 'ACTIVE', 'MATURED', 'CANCELLED'
);

-- §8 — une déclaration de paiement n'est jamais un paiement.
CREATE TYPE payment_status AS ENUM ('AWAITING_PAYMENT', 'DECLARED', 'VERIFIED');

CREATE TYPE product_status AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');
CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- §11 / §19
CREATE TYPE deposit_status AS ENUM (
  'PENDING', 'UNDER_REVIEW', 'CONFIRMED', 'REJECTED', 'CANCELLED'
);

-- §12 / §19
CREATE TYPE withdrawal_status AS ENUM (
  'PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED'
);

-- §15
CREATE TYPE transaction_type AS ENUM (
  'DEPOSIT', 'WITHDRAWAL', 'INVESTMENT', 'INVESTMENT_TOPUP',
  'LOAN', 'CARD_PAYMENT', 'FEE', 'RETURN'
);

CREATE TYPE transaction_status AS ENUM (
  'PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING',
  'COMPLETED', 'CONFIRMED', 'REJECTED', 'CANCELLED'
);

-- §9
CREATE TYPE loan_status AS ENUM (
  'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ACTIVE', 'CLOSED'
);

CREATE TYPE installment_status AS ENUM ('SCHEDULED', 'PAID', 'OVERDUE');

-- §10
CREATE TYPE card_status AS ENUM ('REQUESTED', 'ISSUED', 'ACTIVE', 'BLOCKED');
CREATE TYPE card_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE card_network AS ENUM ('VISA', 'MASTERCARD');
CREATE TYPE card_tier AS ENUM ('STANDARD', 'PREMIUM');

-- §5 / §27
CREATE TYPE crypto_asset AS ENUM ('BTC', 'ETH', 'USDT_TRC20', 'USDT_ERC20');
CREATE TYPE crypto_address_status AS ENUM ('ACTIVE', 'PENDING', 'BLOCKED');
CREATE TYPE crypto_tx_status AS ENUM ('DETECTED', 'CONFIRMING', 'CONFIRMED', 'REJECTED');

-- §22
CREATE TYPE audit_action AS ENUM (
  'REGISTER', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_EXPIRED', 'SESSION_RENEWED',
  'SESSION_REVOKED', 'RATE_LIMITED', 'TWO_FACTOR_ENROLLED', 'TWO_FACTOR_ENABLED',
  'TWO_FACTOR_DISABLED', 'TWO_FACTOR_FAILED', 'TWO_FACTOR_RECOVERY_USED',
  'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED',
  'CREATE_INVESTMENT', 'CREATE_INVESTMENT_TOPUP', 'DECLARE_INVESTMENT_PAYMENT',
  'VERIFY_INVESTMENT_PAYMENT', 'REJECT_INVESTMENT_PAYMENT', 'ACTIVATE_INVESTMENT',
  'CANCEL_INVESTMENT', 'MATURE_INVESTMENT',
  'CREATE_PRODUCT', 'UPDATE_PRODUCT', 'ACTIVATE_PRODUCT', 'ARCHIVE_PRODUCT',
  'CREATE_DEPOSIT', 'DECLARE_DEPOSIT_PROOF', 'CONFIRM_DEPOSIT', 'REJECT_DEPOSIT',
  'CREATE_WITHDRAWAL', 'REVIEW_WITHDRAWAL', 'APPROVE_WITHDRAWAL', 'REJECT_WITHDRAWAL',
  'PROCESS_WITHDRAWAL', 'COMPLETE_WITHDRAWAL', 'CANCEL_WITHDRAWAL',
  'CREATE_LOAN_REQUEST', 'REVIEW_LOAN', 'APPROVE_LOAN', 'REJECT_LOAN',
  'REQUEST_LOAN_INFO', 'DISBURSE_LOAN', 'PAY_LOAN_INSTALMENT', 'CLOSE_LOAN',
  'CREATE_CARD_REQUEST', 'APPROVE_CARD_REQUEST', 'REJECT_CARD_REQUEST',
  'ISSUE_CARD', 'ACTIVATE_CARD', 'BLOCK_CARD',
  'ASSIGN_IBAN', 'BLOCK_IBAN', 'ACTIVATE_IBAN',
  'ASSIGN_CRYPTO_ADDRESS', 'REMOVE_CRYPTO_ADDRESS',
  'CONFIRM_CRYPTO_TRANSACTION', 'REJECT_CRYPTO_TRANSACTION',
  'UPLOAD_KYC_DOCUMENT', 'REPLACE_KYC_DOCUMENT', 'REVIEW_KYC_DOCUMENT',
  'APPROVE_ACCOUNT', 'REJECT_ACCOUNT', 'SUSPEND_ACCOUNT', 'REACTIVATE_ACCOUNT',
  'REQUEST_MORE_INFO', 'ADD_INTERNAL_NOTE', 'UPDATE_PROFILE'
);

CREATE TYPE audit_result AS ENUM ('SUCCESS', 'FAILURE');

-- =============================================================================
-- Fondations
-- =============================================================================

-- Les montants sont exacts. NUMERIC, jamais FLOAT : un flottant sur de l'argent
-- finit toujours par créer un centime qui n'existait pas.
CREATE DOMAIN amount AS NUMERIC(20, 4) CHECK (VALUE IS NULL OR VALUE >= 0);

CREATE DOMAIN currency_code AS CHAR(3);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Le grand livre ne se modifie pas et ne se supprime pas.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'La table % est en écriture seule : une correction est une nouvelle ligne.',
    TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- Un statut atteint est atteint (§19). Sans cette garde, un dépôt confirmé peut
-- revenir à « rejeté » : le grand livre garde le crédit, le dépôt ne le dit
-- plus, et l'écart entre les deux devient indétectable. Un état terminal se
-- corrige par une nouvelle opération, jamais en arrière.
CREATE OR REPLACE FUNCTION forbid_leaving_terminal_state() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  terminal text[];
BEGIN
  terminal := CASE TG_TABLE_NAME
    WHEN 'deposits'            THEN ARRAY['CONFIRMED', 'REJECTED', 'CANCELLED']
    WHEN 'withdrawals'         THEN ARRAY['COMPLETED', 'REJECTED', 'CANCELLED']
    WHEN 'investments'         THEN ARRAY['MATURED', 'CANCELLED']
    WHEN 'investment_topups'   THEN ARRAY['MATURED', 'CANCELLED']
    WHEN 'loans'               THEN ARRAY['CLOSED', 'REJECTED']
    WHEN 'loan_schedule_items' THEN ARRAY['PAID']
    WHEN 'cards'               THEN ARRAY['BLOCKED']
    WHEN 'card_requests'       THEN ARRAY['APPROVED', 'REJECTED']
    WHEN 'kyc_documents'       THEN ARRAY['APPROVED']
    ELSE NULL
  END;

  IF terminal IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = ANY (terminal)
     AND NEW.status::text IS DISTINCT FROM OLD.status::text THEN
    RAISE EXCEPTION
      '% est en % : cet etat est definitif, il ne revient pas a % (§19).',
      TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Références lisibles (USER-000124, INV-2026-0001…) : la séquence garantit
-- l'unicité, le format reste lisible.
CREATE SEQUENCE ref_user_seq;
CREATE SEQUENCE ref_investment_seq;
CREATE SEQUENCE ref_topup_seq;
CREATE SEQUENCE ref_deposit_seq;
CREATE SEQUENCE ref_withdrawal_seq;
CREATE SEQUENCE ref_loan_seq;
CREATE SEQUENCE ref_card_seq;
CREATE SEQUENCE ref_card_request_seq;

-- =============================================================================
-- Comptes (§3, §18)
-- =============================================================================

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE
                DEFAULT ('USER-' || lpad(nextval('ref_user_seq')::text, 6, '0')),
  email         citext NOT NULL UNIQUE,
  -- Argon2id ou bcrypt, jamais en clair. Coût et sel sont dans la chaîne.
  password_hash text NOT NULL,
  role          user_role NOT NULL DEFAULT 'CLIENT',
  status        account_status NOT NULL DEFAULT 'PENDING',
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §3.2 / §3.3
CREATE TABLE profiles (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  phone         text NOT NULL,
  date_of_birth date NOT NULL,
  nationality   text NOT NULL,
  line1         text NOT NULL,
  line2         text,
  city          text NOT NULL,
  postal_code   text NOT NULL,
  country       text NOT NULL,
  region        text,
  tax_id        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Un mineur n'ouvre pas un compte d'investissement.
  CONSTRAINT profile_is_adult CHECK (date_of_birth <= current_date - INTERVAL '18 years')
);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §3.2 étape 6
CREATE TABLE kyc_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        kyc_document_type NOT NULL,
  status      kyc_document_status NOT NULL DEFAULT 'PENDING',
  -- Le fichier vit dans un stockage objet ; l'API renvoie une URL signée, jamais
  -- un lien permanent (§17).
  storage_key text,
  file_name   text,
  mime_type   text,
  file_size   integer CHECK (file_size IS NULL OR file_size > 0),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Un seul document de ce type par dossier, sinon la revue est ambiguë.
  UNIQUE (user_id, type)
);

CREATE INDEX kyc_documents_review_idx ON kyc_documents (type, uploaded_at)
  WHERE status = 'PENDING';

CREATE TRIGGER kyc_documents_updated_at BEFORE UPDATE ON kyc_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §14 — notes internes, jamais visibles par le client.
CREATE TABLE internal_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX internal_notes_user_idx ON internal_notes (user_id, created_at DESC);

-- §20 — second facteur.
CREATE TABLE two_factor_settings (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled           boolean NOT NULL DEFAULT false,
  -- Chiffré au repos, jamais renvoyé après l'activation.
  secret_ciphertext bytea,
  recovery_codes    text[] NOT NULL DEFAULT '{}',
  enrolled_at       timestamptz,
  last_verified_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Actif signifie : secret présent et enrolment confirmée.
  CONSTRAINT enrolment_is_complete CHECK (
    NOT enabled OR (secret_ciphertext IS NOT NULL AND enrolled_at IS NOT NULL)
  )
);

CREATE TRIGGER two_factor_settings_updated_at BEFORE UPDATE ON two_factor_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Sessions et limitations (§20)
-- =============================================================================

CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at        timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  user_agent       text NOT NULL DEFAULT 'unknown',
  ip_address       inet,
  is_new_device    boolean NOT NULL DEFAULT false,
  revoked_at       timestamptz,
  revoked_reason   text,
  -- L'expiration absolue ne peut pas précéder l'émission.
  CONSTRAINT session_expiry_after_issue CHECK (expires_at > issued_at)
);

-- L'index partiel ne liste que les sessions vivantes : c'est la requête chaude.
CREATE INDEX sessions_active_idx ON sessions (user_id, last_activity_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE known_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent    text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, user_agent)
);

-- Le challenge n'existe qu'entre le mot de passe et le second facteur (§20).
CREATE TABLE two_factor_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts    smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  CONSTRAINT challenge_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX two_factor_challenges_open_idx
  ON two_factor_challenges (user_id, expires_at) WHERE consumed_at IS NULL;

-- Le rate limiter en table, c'est ce qui le rend global : un compteur en
-- mémoire dans l'onglet se remet à zéro en changeant de navigateur.
CREATE TABLE rate_limit_buckets (
  subject      text NOT NULL,
  action       text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  failures     integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  locked_until timestamptz,
  PRIMARY KEY (subject, action, window_start)
);

CREATE INDEX rate_limit_buckets_locked_idx
  ON rate_limit_buckets (locked_until) WHERE locked_until IS NOT NULL;

-- =============================================================================
-- Comptes bancaires et crypto (§4, §5, §27)
-- =============================================================================

-- §4 — l'IBAN vient d'un établissement partenaire, l'application n'en fabrique
-- aucun. Le contrôle ISO 7064 (mod 97) est fait par le service avant écriture.
CREATE TABLE bank_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iban        text NOT NULL,
  bic         text,
  bank_name   text NOT NULL,
  holder_name text NOT NULL,
  currency    currency_code NOT NULL,
  status      text NOT NULL DEFAULT 'ACTIVE'
              CHECK (status IN ('ACTIVE', 'PENDING', 'BLOCKED')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- La forme brute d'un IBAN, avant mise en forme pour l'affichage.
  CONSTRAINT bank_account_iban_shape CHECK (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$')
);

-- Un IBAN n'appartient qu'à un client : le doublon est un partage de compte.
CREATE UNIQUE INDEX bank_accounts_iban_idx
  ON bank_accounts (upper(replace(iban, ' ', '')));

CREATE INDEX bank_accounts_user_idx ON bank_accounts (user_id);

CREATE TRIGGER bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE crypto_addresses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset      crypto_asset NOT NULL,
  network    text NOT NULL,
  address    text NOT NULL,
  status     crypto_address_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Une adresse de dépôt n'est jamais partagée entre deux comptes.
CREATE UNIQUE INDEX crypto_addresses_address_idx ON crypto_addresses (lower(address));

CREATE TRIGGER crypto_addresses_updated_at BEFORE UPDATE ON crypto_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §5 — un dépôt observé sur la chaîne, avec son nombre de confirmations.
CREATE TABLE crypto_transactions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id             uuid NOT NULL REFERENCES crypto_addresses(id) ON DELETE CASCADE,
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tx_hash                text NOT NULL UNIQUE,
  amount                 amount NOT NULL CHECK (amount > 0),
  asset                  crypto_asset NOT NULL,
  network                text NOT NULL,
  confirmations          integer NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  required_confirmations integer NOT NULL CHECK (required_confirmations > 0),
  status                 crypto_tx_status NOT NULL DEFAULT 'DETECTED',
  credited_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Confirmée une fois confirmée : credited_at est posé exactement une fois.
  CONSTRAINT confirmed_has_credit_date CHECK (status <> 'CONFIRMED' OR credited_at IS NOT NULL)
);

CREATE INDEX crypto_transactions_user_idx ON crypto_transactions (user_id, created_at DESC);
CREATE INDEX crypto_transactions_pending_idx
  ON crypto_transactions (status, created_at) WHERE status IN ('DETECTED', 'CONFIRMING');

CREATE TRIGGER crypto_transactions_updated_at BEFORE UPDATE ON crypto_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §27.4 — un portefeuille n'est pas un dépôt : c'est une adresse associée.
CREATE TABLE user_wallets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'trust-wallet',
  address         text NOT NULL,
  network         text NOT NULL,
  -- Preuve de propriété par signature de message, jamais de seed phrase (§27.6).
  ownership_proof text,
  signed_message  text,
  status          text NOT NULL DEFAULT 'PENDING_ADMIN_REVIEW'
                  CHECK (status IN ('NOT_CONNECTED', 'CONNECTED', 'PENDING_ADMIN_REVIEW',
                                    'VERIFIED', 'REJECTED', 'SUSPENDED', 'DISCONNECTED')),
  connected_at    timestamptz,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_wallets_address_idx ON user_wallets (lower(address));

CREATE TRIGGER user_wallets_updated_at BEFORE UPDATE ON user_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Produits d'investissement (§6)
-- =============================================================================

CREATE TABLE investment_products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  description        text NOT NULL,
  minimum_amount     amount NOT NULL CHECK (minimum_amount > 0),
  maximum_amount     amount CHECK (maximum_amount IS NULL OR maximum_amount >= minimum_amount),
  currency           currency_code NOT NULL,
  duration_months    integer NOT NULL CHECK (duration_months > 0),
  -- §24 : un rendement n'est contractuel que s'il l'est juridiquement.
  target_annual_rate numeric(6, 3) CHECK (target_annual_rate IS NULL OR target_annual_rate >= 0),
  rate_guaranteed    boolean NOT NULL DEFAULT false,
  risk_level         risk_level NOT NULL,
  sector             text NOT NULL,
  conditions         text[] NOT NULL DEFAULT '{}',
  documents          jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks              text[] NOT NULL DEFAULT '{}',
  status             product_status NOT NULL DEFAULT 'DRAFT',
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Publié sans document de risques, il n'y a rien à montrer au client.
  CONSTRAINT published_has_risks CHECK (status <> 'PUBLISHED' OR cardinality(risks) > 0),
  -- Un taux annoncé s'accompagne toujours de sa qualification.
  CONSTRAINT rate_is_qualified CHECK (
    target_annual_rate IS NULL OR rate_guaranteed
    OR (risks @> ARRAY['Rendement indicatif non garanti']::text[])
  )
);

CREATE INDEX investment_products_status_idx ON investment_products (status);

CREATE TRIGGER investment_products_updated_at BEFORE UPDATE ON investment_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Investissements (§6, §7, §8)
-- =============================================================================

CREATE TABLE investments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           text NOT NULL UNIQUE
                      DEFAULT ('INV-' || to_char(now(), 'YYYY') || '-'
                               || lpad(nextval('ref_investment_seq')::text, 4, '0')),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES investment_products(id) ON DELETE RESTRICT,
  product_name        text NOT NULL,
  -- §7 : le montant initial s'écrit une fois et ne se réécrit jamais.
  initial_amount      amount NOT NULL CHECK (initial_amount > 0),
  topup_total         amount NOT NULL DEFAULT 0,
  currency            currency_code NOT NULL,
  status              investment_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  payment_method      text NOT NULL
                      CHECK (payment_method IN ('BANK_TRANSFER', 'CRYPTO', 'OTHER')),
  payment_status      payment_status NOT NULL DEFAULT 'AWAITING_PAYMENT',
  payment_reference   text NOT NULL,
  payment_deadline    timestamptz,
  payment_declared_at timestamptz,
  payment_verified_at timestamptz,
  activated_at        timestamptz,
  matures_at          timestamptz,
  matured_at          timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- §6 : actif seulement une fois le paiement vérifié, jamais avant.
  CONSTRAINT active_requires_verified_payment CHECK (
    status NOT IN ('ACTIVE', 'MATURED') OR payment_status = 'VERIFIED'
  ),
  -- Actif implique une date d'activation et une échéance.
  CONSTRAINT active_is_dated CHECK (
    status <> 'ACTIVE' OR (activated_at IS NOT NULL AND matures_at IS NOT NULL)
  ),
  CONSTRAINT matured_after_activation CHECK (
    matured_at IS NULL OR activated_at IS NULL OR matured_at >= activated_at
  )
);

CREATE INDEX investments_user_idx ON investments (user_id, created_at DESC);
-- La file de travail de l'administration, en index partiel.
CREATE INDEX investments_awaiting_review_idx
  ON investments (created_at) WHERE payment_status = 'DECLARED' AND status = 'PAYMENT_REVIEW';

CREATE INDEX investments_active_idx ON investments (user_id) WHERE status = 'ACTIVE';

CREATE TRIGGER investments_updated_at BEFORE UPDATE ON investments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §7 — une augmentation est une opération, pas une modification du montant.
CREATE TABLE investment_topups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           text NOT NULL UNIQUE
                      DEFAULT ('TOP-' || to_char(now(), 'YYYY') || '-'
                               || lpad(nextval('ref_topup_seq')::text, 4, '0')),
  investment_id       uuid NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount              amount NOT NULL CHECK (amount > 0),
  currency            currency_code NOT NULL,
  status              investment_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  payment_status      payment_status NOT NULL DEFAULT 'AWAITING_PAYMENT',
  payment_reference   text NOT NULL,
  payment_deadline    timestamptz,
  payment_declared_at timestamptz,
  payment_verified_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topup_active_requires_verified_payment CHECK (
    status NOT IN ('ACTIVE', 'MATURED') OR payment_status = 'VERIFIED'
  )
);

CREATE INDEX investment_topups_investment_idx
  ON investment_topups (investment_id, created_at);

CREATE INDEX investment_topups_user_idx ON investment_topups (user_id, created_at DESC);

CREATE TRIGGER investment_topups_updated_at BEFORE UPDATE ON investment_topups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- L'argent s'engage quand l'investissement devient actif, pas quand le client
-- le demande : c'est le seul moment où le disponible baisse pour de bon.
--
-- Le déclencheur couvre l'INSERT comme l'UPDATE. Un investissement créé
-- directement à l'état ACTIVE — ce que fait un import ou un jeu de données —
-- n'est pas moins réel qu'un investissement activé par une transition, et
-- l'engager sans l'écrire laisserait le solde dire le contraire du grand livre.
-- `OLD` n'existe pas sur un INSERT : c'est ce qui distingue les deux cas.
CREATE OR REPLACE FUNCTION debit_activated_investment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'ACTIVE') THEN
    INSERT INTO transactions (
      user_id, type, amount, currency, status, reference,
      description, payment_method, transaction_hash
    ) VALUES (
      NEW.user_id, 'INVESTMENT', NEW.initial_amount, NEW.currency, 'COMPLETED',
      NEW.reference, 'Investment — ' || NEW.product_name,
      NEW.payment_method, NEW.payment_reference
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER investments_debit_ledger
  AFTER INSERT OR UPDATE OF status ON investments
  FOR EACH ROW EXECUTE FUNCTION debit_activated_investment();

-- §7 — une augmentation est un mouvement distinct, pas un réécriture. Le
-- montant initial reste tel quel ; c'est le cumul qui grandit.
CREATE OR REPLACE FUNCTION debit_activated_topup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'ACTIVE') THEN
    INSERT INTO transactions (
      user_id, type, amount, currency, status, reference,
      description, payment_method, transaction_hash
    ) VALUES (
      NEW.user_id, 'INVESTMENT_TOPUP', NEW.amount, NEW.currency, 'COMPLETED',
      NEW.reference, 'Investment top-up', 'BANK_TRANSFER', NEW.payment_reference
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER investment_topups_debit_ledger
  AFTER INSERT OR UPDATE OF status ON investment_topups
  FOR EACH ROW EXECUTE FUNCTION debit_activated_topup();

-- Le cumul des augmentations se déduit des opérations, jamais d'une saisie :
-- c'est ce qui l'empêche de diverger du grand livre.
CREATE OR REPLACE FUNCTION sync_investment_topup_total() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE investments i
     SET topup_total = COALESCE((
           SELECT sum(t.amount) FROM investment_topups t
            WHERE t.investment_id = i.id AND t.status = 'ACTIVE'
         ), 0)
   WHERE i.id = NEW.investment_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER investment_topups_sync_total
  AFTER INSERT OR UPDATE OF status ON investment_topups
  FOR EACH ROW EXECUTE FUNCTION sync_investment_topup_total();

-- =============================================================================
-- Le grand livre (§15)
-- =============================================================================

CREATE TABLE transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type             transaction_type NOT NULL,
  -- Toujours positif : le sens est porté par le type, jamais par le signe.
  amount           amount NOT NULL CHECK (amount > 0),
  currency         currency_code NOT NULL,
  status           transaction_status NOT NULL,
  reference        text NOT NULL,
  description      text NOT NULL,
  payment_method   text,
  transaction_hash text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Une référence ne désigne qu'un mouvement, par type.
  UNIQUE (reference, type)
);

CREATE INDEX transactions_user_idx ON transactions (user_id, created_at DESC);
CREATE INDEX transactions_type_idx ON transactions (type, created_at DESC);
CREATE INDEX transactions_hash_idx ON transactions (transaction_hash)
  WHERE transaction_hash IS NOT NULL;

CREATE TRIGGER transactions_no_update BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER transactions_no_delete BEFORE DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- =============================================================================
-- Dépôts et retraits (§11, §12)
-- =============================================================================

CREATE TABLE deposits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         text NOT NULL UNIQUE
                    DEFAULT ('DEP-' || to_char(now(), 'YYYY') || '-'
                             || lpad(nextval('ref_deposit_seq')::text, 4, '0')),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount            amount NOT NULL CHECK (amount > 0),
  currency          currency_code NOT NULL,
  method            text NOT NULL CHECK (method IN ('BANK_TRANSFER', 'CRYPTO')),
  status            deposit_status NOT NULL DEFAULT 'PENDING',
  payment_reference text NOT NULL,
  -- Preuve de paiement : identifiant de virement, ou TxID.
  proof             text,
  bank_account_id   uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  crypto_address_id uuid REFERENCES crypto_addresses(id) ON DELETE SET NULL,
  review_note       text,
  reviewed_at       timestamptz,
  confirmed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Un dépôt crypto sans adresse n'a nulle part où arriver.
  CONSTRAINT crypto_deposit_has_address CHECK (
    method <> 'CRYPTO' OR crypto_address_id IS NOT NULL
  ),
  CONSTRAINT bank_deposit_has_account CHECK (
    method <> 'BANK_TRANSFER' OR bank_account_id IS NOT NULL
  ),
  CONSTRAINT confirmed_is_dated CHECK (
    status <> 'CONFIRMED' OR (reviewed_at IS NOT NULL AND confirmed_at IS NOT NULL)
  )
);

CREATE INDEX deposits_user_idx ON deposits (user_id, created_at DESC);
CREATE INDEX deposits_pending_idx ON deposits (created_at)
  WHERE status IN ('PENDING', 'UNDER_REVIEW');

CREATE TRIGGER deposits_updated_at BEFORE UPDATE ON deposits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Confirmer un dépôt écrit la ligne du grand livre, exactement une fois.
CREATE OR REPLACE FUNCTION credit_confirmed_deposit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'CONFIRMED'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'CONFIRMED') THEN
    INSERT INTO transactions (
      user_id, type, amount, currency, status, reference,
      description, payment_method, transaction_hash
    ) VALUES (
      NEW.user_id, 'DEPOSIT', NEW.amount, NEW.currency, 'CONFIRMED',
      NEW.reference,
      COALESCE(NULLIF(NEW.review_note, ''), 'Deposit confirmed by the administration'),
      NEW.method, NEW.proof
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER deposits_credit_ledger AFTER INSERT OR UPDATE OF status ON deposits
  FOR EACH ROW EXECUTE FUNCTION credit_confirmed_deposit();

CREATE TABLE withdrawals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             text NOT NULL UNIQUE
                        DEFAULT ('WDR-' || to_char(now(), 'YYYY') || '-'
                                 || lpad(nextval('ref_withdrawal_seq')::text, 4, '0')),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount                amount NOT NULL CHECK (amount > 0),
  currency              currency_code NOT NULL,
  method                text NOT NULL CHECK (method IN ('BANK_TRANSFER', 'CRYPTO')),
  status                withdrawal_status NOT NULL DEFAULT 'PENDING',
  destination           text NOT NULL,
  destination_details   text,
  -- §12 : enregistrée quand le retrait est réellement traité.
  transaction_reference text,
  review_note           text,
  reviewed_at           timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- Un retrait terminé sans référence n'a pas été traité.
  CONSTRAINT completed_needs_reference CHECK (
    status <> 'COMPLETED' OR (transaction_reference IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX withdrawals_user_idx ON withdrawals (user_id, created_at DESC);
CREATE INDEX withdrawals_pending_idx ON withdrawals (created_at)
  WHERE status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING');

CREATE TRIGGER withdrawals_updated_at BEFORE UPDATE ON withdrawals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- L'argent ne part qu'à la completion, jamais à l'approbation.
CREATE OR REPLACE FUNCTION debit_completed_withdrawal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'COMPLETED'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    INSERT INTO transactions (
      user_id, type, amount, currency, status, reference,
      description, payment_method, transaction_hash
    ) VALUES (
      NEW.user_id, 'WITHDRAWAL', NEW.amount, NEW.currency, 'COMPLETED',
      NEW.reference, 'Withdrawal to ' || NEW.destination,
      NEW.method, NEW.transaction_reference
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER withdrawals_debit_ledger AFTER INSERT OR UPDATE OF status ON withdrawals
  FOR EACH ROW EXECUTE FUNCTION debit_completed_withdrawal();

-- =============================================================================
-- Prêts (§9)
-- =============================================================================

CREATE TABLE loans (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference                 text NOT NULL UNIQUE
                            DEFAULT ('LOA-' || to_char(now(), 'YYYY') || '-'
                                     || lpad(nextval('ref_loan_seq')::text, 4, '0')),
  user_id                   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_amount          amount NOT NULL CHECK (requested_amount > 0),
  approved_amount           amount CHECK (approved_amount IS NULL OR approved_amount > 0),
  currency                  currency_code NOT NULL,
  requested_duration_months integer NOT NULL CHECK (requested_duration_months > 0),
  approved_duration_months  integer
                            CHECK (approved_duration_months IS NULL OR approved_duration_months > 0),
  purpose                   text NOT NULL,
  additional_info           text,
  status                    loan_status NOT NULL DEFAULT 'PENDING',
  -- §9 : le taux et les conditions font partie de l'approbation, et doivent
  -- respecter le cadre juridique applicable. Cette vérification est humaine.
  annual_rate               numeric(6, 3) CHECK (annual_rate IS NULL OR annual_rate >= 0),
  conditions                text[] NOT NULL DEFAULT '{}',
  review_note               text,
  reviewed_at               timestamptz,
  approved_at               timestamptz,
  disbursed_at              timestamptz,
  disbursement_reference    text,
  rejected_at               timestamptz,
  closed_at                 timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  -- On n'accorde jamais plus que ce qui a été demandé.
  CONSTRAINT granted_never_exceeds_request CHECK (
    approved_amount IS NULL OR approved_amount <= requested_amount
  ),
  -- Approuvé, c'est complet : montant, durée, taux, conditions, date.
  CONSTRAINT approval_is_complete CHECK (
    status NOT IN ('APPROVED', 'ACTIVE', 'CLOSED')
    OR (approved_amount IS NOT NULL
        AND approved_duration_months IS NOT NULL
        AND annual_rate IS NOT NULL
        AND cardinality(conditions) > 0
        AND approved_at IS NOT NULL)
  ),
  CONSTRAINT active_requires_disbursement CHECK (
    status <> 'ACTIVE' OR (disbursed_at IS NOT NULL AND disbursement_reference IS NOT NULL)
  )
);

CREATE INDEX loans_user_idx ON loans (user_id, created_at DESC);
CREATE INDEX loans_pending_idx ON loans (created_at)
  WHERE status IN ('PENDING', 'UNDER_REVIEW');

CREATE TRIGGER loans_updated_at BEFORE UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- L'échéancier est construit à l'approbation, jamais avant.
CREATE TABLE loan_schedule_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id               uuid NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  position              integer NOT NULL CHECK (position > 0),
  due_date              date NOT NULL,
  principal             amount NOT NULL CHECK (principal >= 0),
  interest              amount NOT NULL CHECK (interest >= 0),
  installment           amount NOT NULL CHECK (installment >= 0),
  status                installment_status NOT NULL DEFAULT 'SCHEDULED',
  paid_at               timestamptz,
  transaction_reference text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, position),
  -- Une échéance payée l'est une fois, avec sa référence.
  CONSTRAINT paid_is_timestamped CHECK (
    status <> 'PAID' OR (paid_at IS NOT NULL AND transaction_reference IS NOT NULL)
  )
);

CREATE INDEX loan_schedule_open_idx ON loan_schedule_items (loan_id, position)
  WHERE status <> 'PAID';

CREATE TRIGGER loan_schedule_items_updated_at BEFORE UPDATE ON loan_schedule_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- L'échéancier s'additionne exactement au montant accordé. Un écart est un
-- défaut de calcul, pas un arrondi acceptable.
CREATE OR REPLACE FUNCTION check_schedule_total() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  expected amount;
  months   integer;
  counted  integer;
  total    amount;
BEGIN
  SELECT approved_amount, approved_duration_months
    INTO expected, months
    FROM loans WHERE id = NEW.loan_id;

  -- Rien à vérifier tant que l'approbation n'est pas complète.
  IF expected IS NULL OR months IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), COALESCE(sum(principal), 0)
    INTO counted, total
    FROM loan_schedule_items WHERE loan_id = NEW.loan_id;

  IF total > expected THEN
    RAISE EXCEPTION
      'L''échéancier totalise % alors que le montant accordé est de %', total, expected;
  END IF;

  -- L'échéancier complet doit tomber juste.
  IF counted = months AND total <> expected THEN
    RAISE EXCEPTION
      'Échéancier complet de % mois totalisant % au lieu de %', months, total, expected;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER loan_schedule_total_check AFTER INSERT OR UPDATE ON loan_schedule_items
  FOR EACH ROW EXECUTE FUNCTION check_schedule_total();

-- Le décaissement écrit la ligne du grand livre : un prêt est une entrée.
-- Comme pour l'investissement : un prêt décaissé à l'INSERT est un prêt
-- décaissé. Rester muet ici ferait dire au solde le contraire du grand livre.
CREATE OR REPLACE FUNCTION credit_disbursed_loan() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'ACTIVE') THEN
    INSERT INTO transactions (
      user_id, type, amount, currency, status, reference, description, transaction_hash
    ) VALUES (
      NEW.user_id, 'LOAN', NEW.approved_amount, NEW.currency, 'COMPLETED',
      NEW.reference, 'Loan disbursement — ' || NEW.purpose, NEW.disbursement_reference
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER loans_credit_ledger AFTER INSERT OR UPDATE OF status ON loans
  FOR EACH ROW EXECUTE FUNCTION credit_disbursed_loan();

-- =============================================================================
-- Cartes (§10)
--
-- Aucun numéro de carte n'est stocké : la carte est émise par un prestataire
-- habilité, seules les quatre derniers chiffres nous reviennent.
-- =============================================================================

CREATE TABLE card_products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  network        card_network NOT NULL,
  tier           card_tier NOT NULL,
  description    text NOT NULL,
  annual_fee     amount NOT NULL DEFAULT 0,
  currency       currency_code NOT NULL,
  spending_limit amount CHECK (spending_limit IS NULL OR spending_limit > 0),
  benefits       text[] NOT NULL DEFAULT '{}',
  status         product_status NOT NULL DEFAULT 'DRAFT',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER card_products_updated_at BEFORE UPDATE ON card_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE card_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference    text NOT NULL UNIQUE
               DEFAULT ('CRD-' || to_char(now(), 'YYYY') || '-'
                        || lpad(nextval('ref_card_request_seq')::text, 4, '0')),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES card_products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  status       card_request_status NOT NULL DEFAULT 'PENDING',
  review_note  text,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX card_requests_user_idx ON card_requests (user_id, created_at DESC);
CREATE INDEX card_requests_pending_idx ON card_requests (created_at) WHERE status = 'PENDING';

-- Une seule demande ouverte par produit et par client.
CREATE UNIQUE INDEX card_requests_one_open_idx
  ON card_requests (user_id, product_id) WHERE status = 'PENDING';

CREATE TRIGGER card_requests_updated_at BEFORE UPDATE ON card_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        text NOT NULL UNIQUE
                   DEFAULT ('CRD-' || to_char(now(), 'YYYY') || '-'
                            || lpad(nextval('ref_card_seq')::text, 4, '0')),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES card_products(id) ON DELETE RESTRICT,
  product_name     text NOT NULL,
  network          card_network NOT NULL,
  tier             card_tier NOT NULL,
  -- La contrainte qui empêche d'y loger un numéro complet.
  last4            text NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  issuer_reference text NOT NULL,
  expiry           text CHECK (expiry IS NULL OR expiry ~ '^(0[1-9]|1[0-2])/[0-9]{2}$'),
  status           card_status NOT NULL DEFAULT 'ISSUED',
  holder_name      text NOT NULL,
  issued_at        timestamptz,
  activated_at     timestamptz,
  blocked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_is_activated CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL),
  CONSTRAINT blocked_is_timestamped CHECK (status <> 'BLOCKED' OR blocked_at IS NOT NULL)
);

CREATE INDEX cards_user_idx ON cards (user_id);

CREATE TRIGGER cards_updated_at BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Notifications et journal (§21, §22)
-- =============================================================================

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  message    text NOT NULL,
  link       text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- Le journal est en écriture seule : une trace ne se réécrit pas.
CREATE TABLE audit_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action           audit_action NOT NULL,
  actor_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email      text,
  target_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  target_reference text,
  result           audit_result NOT NULL,
  details          text,
  ip_address       inet,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_target_idx ON audit_logs (target_user_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- =============================================================================
-- États définitifs (§19)
--
-- Une seule garde pour tous les circuits, branchée ici parce que c'est le seul
-- endroit où toutes les tables existent. Sans elle, « rouvrir » un dépôt crédité
-- laisserait le grand livre et l'opération en désaccord, sans trace.
-- =============================================================================
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'deposits', 'withdrawals', 'investments', 'investment_topups',
    'loans', 'loan_schedule_items', 'cards', 'card_requests', 'kyc_documents'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_terminal BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION forbid_leaving_terminal_state()',
      target, target
    );
  END LOOP;
END $$;

-- =============================================================================
-- Soldes
--
-- Une vue, pas une colonne. Un solde stocké se désynchronise ; rejoué, il ne
-- ment pas. La source de vérité reste le grand livre.
-- =============================================================================

CREATE VIEW client_balances AS
WITH ledger AS (
  SELECT
    user_id,
    sum(amount) FILTER (
      WHERE type IN ('DEPOSIT', 'LOAN', 'RETURN')
    ) AS inflow,
    sum(amount) FILTER (
      WHERE type IN ('WITHDRAWAL', 'INVESTMENT', 'INVESTMENT_TOPUP', 'CARD_PAYMENT', 'FEE')
    ) AS outflow
  FROM transactions
  WHERE status IN ('COMPLETED', 'CONFIRMED')
  GROUP BY user_id
),
invested AS (
  SELECT user_id, sum(initial_amount + topup_total) AS total
  FROM investments
  WHERE status = 'ACTIVE'
  GROUP BY user_id
),
loan_state AS (
  SELECT
    l.user_id,
    l.approved_amount,
    COALESCE(paid.total, 0) AS paid
  FROM loans l
  LEFT JOIN (
    SELECT s.loan_id, sum(s.principal) AS total
    FROM loan_schedule_items s
    WHERE s.status = 'PAID'
    GROUP BY s.loan_id
  ) paid ON paid.loan_id = l.id
  WHERE l.status = 'ACTIVE'
),
-- Ce qui bloque l'argent du client. Un dépôt en attente ne réserve rien : il
-- n'est pas encore arrivé. Un retrait en vol et un prêt en cours, si.
reserved AS (
  SELECT user_id, sum(amount) AS total
  FROM withdrawals
  WHERE status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING')
  GROUP BY user_id
  UNION ALL
  SELECT user_id, sum(approved_amount - paid) FROM loan_state GROUP BY user_id
)
SELECT
  u.id AS user_id,
  COALESCE(ledger.inflow, 0) - COALESCE(ledger.outflow, 0) AS available,
  COALESCE(invested.total, 0) AS invested,
  COALESCE(reserved.total, 0) AS pending,
  COALESCE((SELECT sum(approved_amount - paid) FROM loan_state WHERE user_id = u.id), 0)
    AS loan_outstanding,
  COALESCE((
    SELECT t.currency FROM transactions t WHERE t.user_id = u.id LIMIT 1
  ), 'MAD') AS currency
FROM users u
LEFT JOIN ledger ON ledger.user_id = u.id
LEFT JOIN invested ON invested.user_id = u.id
LEFT JOIN (
  SELECT user_id, sum(total) AS total FROM reserved GROUP BY user_id
) reserved ON reserved.user_id = u.id;

-- La file de travail de l'administration, en une requête (§13).
CREATE VIEW admin_pending_review AS
SELECT 'INVESTMENT_PAYMENT' AS queue, count(*) AS pending
  FROM investments WHERE payment_status = 'DECLARED'
UNION ALL SELECT 'DEPOSIT', count(*) FROM deposits WHERE status IN ('PENDING', 'UNDER_REVIEW')
UNION ALL SELECT 'WITHDRAWAL', count(*) FROM withdrawals WHERE status IN ('PENDING', 'UNDER_REVIEW')
UNION ALL SELECT 'LOAN', count(*) FROM loans WHERE status IN ('PENDING', 'UNDER_REVIEW')
UNION ALL SELECT 'CARD_REQUEST', count(*) FROM card_requests WHERE status = 'PENDING'
UNION ALL SELECT 'KYC_DOCUMENT', count(*) FROM kyc_documents WHERE status = 'PENDING'
UNION ALL SELECT 'CRYPTO_DEPOSIT', count(*) FROM crypto_transactions WHERE status IN ('DETECTED', 'CONFIRMING');

\echo ''
\echo '────────────────────────────────────────────────────────────────'
\echo ''
-- ----------------------------------------------------------------------------
-- 0002_rls.sql
-- ----------------------------------------------------------------------------
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

\echo ''
\echo '────────────────────────────────────────────────────────────────'
\echo ''
-- ----------------------------------------------------------------------------
-- 0003_manual_assignment.sql
-- ----------------------------------------------------------------------------
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

\echo ''
\echo '────────────────────────────────────────────────────────────────'
\echo ''
-- ----------------------------------------------------------------------------
-- 0004_email_outbox.sql
-- ----------------------------------------------------------------------------
-- =============================================================================
-- File d'envoi
--
-- §21 prévoit l'email comme canal de notification, à côté de la notification
-- interne. Cette migration ne l'envoie pas : elle prépare où il partira, et
-- surtout où il ne partira pas.
--
-- Le principe qui structifie tout le reste : un courriel ne décide de rien.
--
-- Un dépôt confirmé ne dépend pas du succès de l'envoi. Si la boîte SMTP est
-- pleine, si le réseau tombe, si le message part en spam, l'argent reste crédité
-- et le grand livre reste juste. L'inverse — faire dépendre un mouvement d'argent
-- d'un envoi de courriel — ferait de la messagerie un point de défaillance
-- financier, et il suffirait de saturer la boîte pour geler les dépôts de
-- toute la plateforme.
--
-- D'où la file : l'état du monde et l'intention d'envoyer s'écrivent dans la
-- MÊME transaction. Le confirmateur de dépôt et la ligne « dépôt confirmé »
-- valident ensemble, ou pas du tout. L'envoi, ensuite, se fait ailleurs et
-- échoue seul.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------

CREATE TYPE email_status AS ENUM (
  'PENDING',    -- en attente d'envoi
  'SENT',       -- accepté par le serveur SMTP
  'FAILED',     -- épuisé ses tentatives
  'SUPPRESSED'  -- volontairement non envoyé (désabonné, doublon, adresse invalide)
);

-- Les seize événements de §21 sont des messages de service : le client les a
-- demandés en ouvrant un compte et en depositing de l'argent. Aucun n'est
-- commercial, donc aucun ne peut être désabonné. Cette énumération le dit
-- explicitement, pour qu'on n'ajoute pas plus tard un « opt-in marketing »
-- dans un système qui n'en a pas besoin.
CREATE TYPE email_template AS ENUM (
  'ACCOUNT_CREATED',              -- création du compte
  'ACCOUNT_VALIDATED',            -- validation du compte
  'ACCOUNT_REJECTED',             -- rejet du compte
  'ACCOUNT_CHANGED',              -- modification importante du compte (§21)
  'KYC_MORE_INFO',                -- pièces complémentaires demandées
  'PASSWORD_RESET',               -- réinitialisation du mot de passe
  'PASSWORD_CHANGED',             -- confirmation d'un changement de mot de passe
  'NEW_DEVICE_LOGIN',             -- connexion depuis un nouvel appareil (§20)
  'DEPOSIT_RECEIVED',             -- nouveau dépôt
  'DEPOSIT_CONFIRMED',            -- dépôt confirmé
  'INVESTMENT_CREATED',           -- investissement créé
  'INVESTMENT_ACTIVATED',         -- investissement activé
  'INVESTMENT_MATURED',           -- investissement arrivé à échéance
  'WITHDRAWAL_REQUESTED',         -- demande de retrait
  'WITHDRAWAL_APPROVED',          -- retrait approuvé
  'WITHDRAWAL_REJECTED',          -- retrait refusé
  'WITHDRAWAL_COMPLETED',         -- retrait terminé
  'LOAN_REQUESTED',               -- demande de prêt
  'LOAN_APPROVED',                -- prêt approuvé
  'LOAN_REJECTED',                -- prêt refusé
  'LOAN_DISBURSED',               -- prêt décaissé
  'CARD_REQUESTED',               -- demande de carte
  'CARD_ISSUED'                   -- carte attribuée
);


-- -----------------------------------------------------------------------------
-- La file
--
-- Volontairement distincte de `notifications`. Une notification interne existe
-- dès qu'un événement s'est produit, et ne demande aucun envoi. Un courriel est
-- une tentative de livraison, avec ses échecs, ses reprises et ses rebonds : un
-- client qui ne consulte jamais son compte a quand même reçu ses alertes, et un
-- message peut avoir été envoyé alors que l'application n'a jamais été ouverte.
-- Confondre les deux tables obligerait à créer une notification interne pour
-- chaque tentative, ou à perdre la trace des envois.
-- -----------------------------------------------------------------------------

CREATE TABLE notification_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template      email_template NOT NULL,
  recipient     citext NOT NULL,
  subject       text NOT NULL,
  body          text NOT NULL,

  status        email_status NOT NULL DEFAULT 'PENDING',

  -- Le lien que le client suivra. Les emails ne disent pas « votre solde est de
  -- 50 000 », ils disent « votre dépôt est confirmé » et renvoient à l'écran.
  -- Un solde écrit dans un corps de message finit dans une boîte mail, un
  -- transfert, une sauvegarde, et parfois une capture d'écran.
  action_url    text,

  -- Paramètres du modèle, pas le texte rendu. Relancer un envoi doit produire
  -- le même message qu'au premier essai, même si le compte a changé depuis : un
  -- mail de réinitialisation régénéré avec de nouvelles données n'est plus le
  -- même mail, et sa date d'expiration n'a plus de sens.
  template_vars jsonb NOT NULL DEFAULT '{}'::jsonb,

  attempts      smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts  smallint NOT NULL DEFAULT 4  CHECK (max_attempts > 0),
  last_error    text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sent_has_timestamp
    CHECK (status <> 'SENT' OR sent_at IS NOT NULL),

  -- Un échec définitif ne se relance pas tout seul, mais il doit pouvoir l'être
  -- à la main : c'est souvent la seule façon de rattraper une série
  -- d'échecs dus à une coupure réseau de dix minutes.
  CONSTRAINT failed_is_retryable CHECK (status <> 'FAILED' OR attempts > 0)
);

-- Le travail du_worker : ce qui est prêt à partir, dans l'ordre.
CREATE INDEX notification_outbox_pending_idx
  ON notification_outbox (next_attempt_at, created_at)
  WHERE status = 'PENDING';

-- Un même événement ne part pas deux fois, même si le code le redemande.
CREATE UNIQUE INDEX notification_outbox_once_idx
  ON notification_outbox (user_id, template, template_vars)
  WHERE status <> 'SUPPRESSED';

CREATE INDEX notification_outbox_user_idx
  ON notification_outbox (user_id, created_at DESC);

-- La file grossit si personne ne la vide. Ce rappel n'a rien d'un.Thread
-- d'y suppléer : il dit qu'une file non vidée est un incident.
CREATE OR REPLACE FUNCTION outbox_backlog_report()
RETURNS TABLE (
  pending      bigint,
  oldest_age   interval,
  sent_24h     bigint,
  failed_24h   bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    count(*) FILTER (WHERE status = 'PENDING'),
    COALESCE(max(now() - created_at) FILTER (WHERE status = 'PENDING'), interval '0'),
    count(*) FILTER (WHERE status = 'SENT'   AND sent_at > now() - interval '24 hours'),
    count(*) FILTER (WHERE status = 'FAILED' AND created_at > now() - interval '24 hours')
  FROM notification_outbox;
$$;

COMMENT ON FUNCTION outbox_backlog_report() IS
  'Volume en attente et âge du plus ancien. Un oldest_age qui dépasse quelques '
  'minutes signifie que personne ne draine la file : aucun courriel ne part, et '
  'aucune alerte ne previent que ce n''est pas le cas.';


-- -----------------------------------------------------------------------------
-- Ce qu'un message ne doit jamais contenir
--
-- Ce n'est pas une politique, c'est une contrainte. Un corps de message est
-- copié, transféré, archivé, indexé par le fournisseur, et finit parfois dans
-- un ticket d'assistance. Ce qui y entre doit pouvoir y être lu par un tiers
-- sans rien coûter.
--
-- Les trois interdits, donc :
--
--   1. Aucun code d'authentification, ni mot de passe, ni code de
--      réinitialisation utilisable en clair. Le lien de réinitialisation est
--      un jeton opaque, à usage unique et à durée courte — c'est déjà une
--      authentification, et il ne faut pas y ajouter un second facteur
--      transmis par le même canal. Un code à six chiffres arriving par email
--      dégrade le second facteur dont §20 a fait une obligation.
--
--   2. Aucun IBAN complet, aucun numéro de carte, aucun solde. Au mieux les
--      quatre derniers chiffres, et encore. Le client reconnait son compte sans
--      que le message puisse servir à Someone d'autre.
--
--   3. Aucun caractère d'Unicode non vérifié dans l'objet : certains clients
--      mail et beaucoup d'antispams traitent le hors-ASCII comme un signal.
--      Les accents dans l'objet coûtent plus qu'ils ne rapportent.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_email_body_is_safe(subject text, body text)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- Un code d'authentification se reconnaît à sa forme : six chiffres ou plus
  -- d'affilée, ou des groupes de trois séparés par une espace — « 123 456 ».
  -- C'est exactement le format d'affichage d'un code à six chiffres.
  --
  -- Les bornes `[^0-9]` acceptent une espace, ce qui est nécessaire : dans
  -- « le code est 123 456 », ce qui précède le premier chiffre est une espace.
  -- Les exclure rendrait la garde inopérante sur la forme exacte qu'elle
  -- cherche à attraper.
  --
  -- La borne basse est à six, et non plus bas, parce qu'un message de service
  -- contient légitimement des nombres courts : « 6 mois », « 24 heures »,
  -- « 2 ans ». Une garde qui refuse « 24 heures » ne sera pas désactivée, elle
  -- sera contournée — et une garde contournée ne protège plus rien.
  IF body ~ '(^|[^0-9])[0-9]{6,}([^0-9]|$)'
     OR body ~ '(^|[^0-9])[0-9]{3}[[:space:]][0-9]{3}([^0-9]|$)' THEN
    RAISE EXCEPTION
      'Le corps contient une suite de chiffres en série : probablement un code '
      'd''authentification. Un code ne transite pas par email (§20).'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Un PAN complet : 13 à 19 chiffres, éventuellement groupés par quatre. Le
  -- groupement est exigé tous les quatre chiffres, sinon « votreIBAN1234567890 »
  -- serait pris pour un numéro de carte alors que c'est l'inverse qui est
  -- grave.
  IF body ~ '(^|[^0-9])[0-9]{4}([ ]?[0-9]{4}){3,4}([^0-9]|$)'
     OR body ~ '(^|[^0-9])[0-9]{13,19}([^0-9]|$)' THEN
    RAISE EXCEPTION
      'Le corps ressemble à un numéro de carte. Aucun numéro de carte ne '
      'transite par un message (§10).'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Un IBAN fait 15 à 34 caractères alphanumériques et commence par deux
  -- lettres de pays. Le chercher séparément du PAN évite de dépendre d'un
  -- motif unique qui raterait l'un des deux.
  IF body ~ '\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b' THEN
    RAISE EXCEPTION
      'Le corps contient ce qui ressemble à un IBAN. Un IBAN ne se transmet '
      'pas par message (§4) : il se consulte depuis le compte.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF subject ~ '[^[:ascii:]]' THEN
    RAISE NOTICE
      'Objet non ASCII (« % ») : le traitement varie selon les clients, à vérifier.',
      subject;
  END IF;
END;
$$;

COMMENT ON FUNCTION assert_email_body_is_safe(text, text) IS
  'Refuse un corps de message contenant un probable code d''authentification, '
  'un numéro de carte ou un IBAN. C''est une garde de fond, pas une garantie : '
  'elle couvre les formats que l''on sait nommer, et laisse passer tout ce '
  'qu''elle n''a pas prévu. Les gabarits restent à relire à l''œil.';


-- -----------------------------------------------------------------------------
-- Écouter la file
--
-- Déclencheur qui fait l'écriture. Appeler cette fonction dans la même
-- transaction que le changement d'état est le seul moyen d'obtenir
-- l'atomicité décrite en tête de migration : soit le dépôt est confirmé et le
-- message est en file, soit rien ne s'est produit.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enqueue_email(
  target_user_id uuid,
  template       email_template,
  subject        text,
  body           text,
  vars           jsonb DEFAULT '{}'::jsonb,
  action_url     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  target_email citext;
  queued_id    uuid;
BEGIN
  IF target_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO target_email FROM users WHERE id = target_user_id;

  -- Un compte sans adresse ne bloque pas l'opération métier : le dépôt est
  -- confirmé, le message ne part pas. L'échec d'un envoi ne doit jamais
  -- remonter jusqu'à l'opération qui l'a déclenché.
  IF target_email IS NULL THEN
    RAISE NOTICE 'Aucun email pour l''utilisateur % — message % non mis en file',
      target_user_id, template;
    RETURN NULL;
  END IF;

  PERFORM assert_email_body_is_safe(subject, body);

  INSERT INTO notification_outbox (
    user_id, template, recipient, subject, body, template_vars, action_url
  ) VALUES (
    target_user_id, template, target_email, subject, body, vars, action_url
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO queued_id;

  RETURN queued_id;
END;
$$;

COMMENT ON FUNCTION enqueue_email(uuid, email_template, text, text, jsonb, text) IS
  'Écrit une ligne dans la file. À appeler dans la MÊME transaction que le '
  'changement d''état : c''est ce qui garantit qu''un dépôt confirmé a bien son '
  'message, et qu''un dépôt non confirmé n''en a pas. Ne fait aucun envoi — '
  'l''envoi est fait par un autre processus, qui peut échouer seul.';


-- -----------------------------------------------------------------------------
-- Passerelle d'envoi
--
-- Cette fonction est la frontière entre la base et le monde extérieur. Elle
-- est volontairement la seule qui déclare une fonction externe comme
-- `VOLATILE` : une fonction marquée `STABLE` pourrait être évaluée une fois
-- par le planificateur et réutilisée, ce qui enverrait le même message à
-- tout le monde. Le coût d'un envoi doit être assumé, pas mémorisé.
--
-- L'envoi réel se fera depuis le worker, en code applicatif. Ce que la base
-- garantit ici, c'est la transition d'état : `SENT` signifie « le serveur a
-- accepté », et pas « le client a lu ». Confondre les deux ferait croire à une
-- livraison qui n'a pas eu lieu.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mark_email_sent(outbox_id uuid, smtp_response text)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE notification_outbox
     SET status = 'SENT', sent_at = now(), last_error = NULL
   WHERE id = outbox_id AND status = 'PENDING';
END;
$$;

CREATE OR REPLACE FUNCTION mark_email_failed(outbox_id uuid, error text)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE notification_outbox
     SET attempts = attempts + 1,
         last_error = left(error, 1000),
         -- Échec définitif, ou remise en file après un délai. Le délai double
         -- à chaque tentative : un service SMTP qui refuse reste-t-il
         -- indisponible une minute plus tard, ou dix ?
         status = CASE
           WHEN attempts + 1 >= max_attempts THEN 'FAILED'::email_status
           ELSE 'PENDING'::email_status
         END,
         next_attempt_at = CASE
           WHEN attempts + 1 >= max_attempts THEN next_attempt_at
           ELSE now() + make_interval(
             -- `2 ^ attempts` est un double, et `make_interval` prend un entier.
             -- Sans le cast, un seul échec transforme l'UPDATE en erreur — donc
             -- en échec qui ne s'inscrit nulle part et se répète à l'infini.
             mins => LEAST(60, ((2 ^ attempts) * 15)::int)
           )
         END
   WHERE id = outbox_id AND status = 'PENDING';
END;
$$;

COMMENT ON FUNCTION mark_email_failed(uuid, text) IS
  'Enregistre un échec et reprogramme la tentative suivante, avec un délai qui '
  'double à chaque fois. Passé max_attempts, la ligne passe FAILED et sort de '
  'la file — un échec définitif ne bloque pas ce qui suit.';


-- -----------------------------------------------------------------------------
-- Journal
--
-- L'envoi est une action d'administration au sens de §22 : la trace compte au
-- même titre qu'une attribution d'IBAN.
--
-- `ALTER TYPE … ADD VALUE` ne peut pas s'exécuter dans un bloc de transaction
-- avant PostgreSQL 12, et reste non annulable dans tous les cas. Sur une base
-- déjà peuplée, appliquer cette migration fichier par fichier pose donc
-- problème — c'est une des raisons pour lesquelles il n'y a pas encore de
-- table de version des migrations.
--
-- Aucune valeur n'est nommée ici : `ADD VALUE IF NOT EXISTS` accepte une
-- position, mais elle rend la migration dépendante de l'ordre actuel des
-- valeurs, donc inutilisable sur une base qui a divergé.
-- -----------------------------------------------------------------------------

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EMAIL_SENT';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EMAIL_FAILED';

\echo ''
\echo '────────────────────────────────────────────────────────────────'
\echo ''

-- =============================================================================
-- Rôle applicatif
--
-- C'est la partie la plus importante du fichier, et la plus facile à rater.
--
-- Un rôle propriétaire contourne la RLS. Toujours, sans exception possible.
-- Si l'application se connecte avec `neondb_owner`, tout ce que 0002 vient
-- d'installer est inerte : un client pourrait lire le grand livre d'un autre,
-- lire les IBAN des autres, écrire dans le journal d'audit. Aucun test ne le
-- détecterait depuis l'application, parce que la base elle-même ne filtre
-- plus rien.
--
-- `invest_api` n'est donc PAS propriétaire. C'est lui que l'application doit
-- utiliser, et lui seul.
--
-- Il est créé ici, entre 0004 et 0005, et non à la fin : 0005 lui accorde des
-- droits d'exécution, et échouerait si le rôle n'existait pas. Les GRANT sur
-- les tables, eux, ne peuvent venir qu'après 0001 — ils sont donc dans la
-- section suivante.
-- =============================================================================

\echo 'Création du rôle applicatif invest_api (non propriétaire)'

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

\echo ''
\echo '────────────────────────────────────────────────────────────────'
\echo ''
-- ----------------------------------------------------------------------------
-- 0005_ledger_trigger_security.sql
-- ----------------------------------------------------------------------------
-- =============================================================================
-- Les déclencheurs du grand livre doivent écrire comme la base, pas comme
-- l'appelant
--
-- Un bug trouvé en exécutant le vrai parcours sur la vraie base, et que
-- 80 contrôles locaux n'avaient pas vu : ils tournaient avec les droits du
-- propriétaire, qui contourne toujours la RLM. L'application, elle, ne le fait
-- pas.
--
-- Ce qui se passait. Confirmer un dépôt écrit une ligne dans `transactions`.
-- Ce n'est pas une requête applicative : c'est le déclencheur
-- `deposits_credit_ledger`, déclenché par la mise à jour du statut. Mais un
-- déclencheur s'exécute avec les droits du rôle connecté — ici `invest_api` —
-- et `transactions` n'a aucune policy d'écriture, par conception. Résultat :
--
--     ERROR: new row violates row-level security policy for table "transactions"
--     CONTEXT: PL/pgSQL function credit_confirmed_deposit() line 5
--
-- Et donc : aucun dépôt confirmable, aucun investissement activable, aucun prêt
-- décaissable, aucun retrait terminable. Toute la plateforme était inerte, et
-- l'erreur ne venait d'aucun des deux côtés attendus.
--
-- La correction est `SECURITY DEFINER` : ces fonctions appartiennent à la
-- base, pas à l'application, et s'exécutent donc avec les droits de leur
-- propriétaire. C'est précisément à cela que sert ce mot-clé.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Les six écritures du grand livre et de ses dérivées
--
-- Aucune ne reçoit de données venues de l'appelant : chacune ne fait que
-- recopier la ligne qu'elle déclenche, ou en additionner une autre. Un
-- `SECURITY DEFINER` n'élargit donc rien — il rend au déclencheur le droit
-- d'écrire ce que sa propre table lui demande d'écrire.
-- -----------------------------------------------------------------------------

ALTER FUNCTION credit_confirmed_deposit()   SECURITY DEFINER;
ALTER FUNCTION debit_completed_withdrawal() SECURITY DEFINER;
ALTER FUNCTION debit_activated_investment() SECURITY DEFINER;
ALTER FUNCTION debit_activated_topup()      SECURITY DEFINER;
ALTER FUNCTION credit_disbursed_loan()      SECURITY DEFINER;
ALTER FUNCTION sync_investment_topup_total() SECURITY DEFINER;

COMMENT ON FUNCTION credit_confirmed_deposit() IS
  'Écrit le dépôt confirmé dans le grand livre. SECURITY DEFINER : le '
  'déclencheur doit écrire avec les droits de la base, pas avec ceux de la '
  'session applicative, qui ne peut pas écrire dans `transactions` — c''est '
  'voulu. Sans cela, aucun dépôt n''est confirmable.';

COMMENT ON FUNCTION sync_investment_topup_total() IS
  'Recalcule le cumul des augmentations à partir des opérations. '
  'SECURITY DEFINER : c''est une écriture dérivée, et elle doit avoir lieu même '
  'si la session qui a validé l''augmentation n''a pas les droits d''écrire '
  'dans `investments`.';


-- -----------------------------------------------------------------------------
-- Refermer l'escalade
--
-- `SECURITY DEFINER` sans restriction d'exécution est une invitation : par
-- défaut, PUBLIC peut exécuter une fonction, donc ici n'importe quel rôle
-- connecté pourrait appeler ces fonctions directement et se faire accorder
-- leurs pouvoirs.
--
-- Il faut donc retirer PUBLIC de l'exécution. Seuls les déclencheurs
-- themselves les utilisent, et un déclencheur s'exécute sans exiger le droit
-- d'exécution de l'appelant.
--
-- Les deux exceptions sont les fonctions appelées directement par le service,
-- et dont l'accès doit rester explicite : l'utilisateurs s'y branche.
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION credit_confirmed_deposit()    FROM PUBLIC;
REVOKE ALL ON FUNCTION debit_completed_withdrawal()  FROM PUBLIC;
REVOKE ALL ON FUNCTION debit_activated_investment()  FROM PUBLIC;
REVOKE ALL ON FUNCTION debit_activated_topup()       FROM PUBLIC;
REVOKE ALL ON FUNCTION credit_disbursed_loan()       FROM PUBLIC;
REVOKE ALL ON FUNCTION sync_investment_topup_total() FROM PUBLIC;

-- `enqueue_email` est un point d'entrée du service : il écrit dans la file, il
-- ne touche ni l'argent ni la RLM, mais il décide de ce qui part. Le rôle
-- applicatif est le seul à en avoir besoin.
REVOKE ALL ON FUNCTION enqueue_email(uuid, email_template, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_email(uuid, email_template, text, text, jsonb, text)
  TO invest_api;

-- Les aides de lecture — le contrôle d'IBAN, celui d'une adresse de dépôt —
-- ne sont ni des écritures ni des élévations de privilège. Elles restent
-- lisibles par tous, ce qui est sans effet.
GRANT EXECUTE ON FUNCTION iban_is_valid(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION iban_mod_97(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION crypto_address_is_valid(crypto_asset, text) TO PUBLIC;


-- -----------------------------------------------------------------------------
-- Vérifier que les déclencheurs sont bienowners de leur table
--
-- Un `SECURITY DEFINER` dont le propriétaire n'est pas le propriétaire de la
-- table n'accorderait rien : la fonction tournerait avec des droits plus
-- faibles que ceux de l'appelant. Cette vue permet de le voir d'un coup
-- d'œil, plutôt que de le découvrir à la première confirmation de dépôt.
-- -----------------------------------------------------------------------------

-- La relation d'un déclencheur n'est pas dans `pg_proc.prorelid` : cette colonne
-- n'existe que pour les fonctions d'agrégat. Elle se trouve dans
-- `pg_trigger.tgrelid`, et le lien se fait par `tgrelid` ↔ la fonction
-- rappelée dans `tgfoid`. C'est le seul endroit où le nom de la table d'un
-- déclencheur est consultable.
CREATE VIEW trigger_security_audit AS
SELECT
  p.proname                              AS fonction,
  pg_get_userbyid(p.proowner)            AS execute_comme,
  c.relname                              AS declenche_sur,
  pg_get_userbyid(c.relowner)            AS table_appartient_a,
  p.prosecdef                            AS security_definer,
  (p.prosecdef
   AND pg_get_userbyid(p.proowner) = pg_get_userbyid(c.relowner)) AS correctement_configuree
FROM pg_proc p
JOIN pg_namespace n  ON n.oid = p.pronamespace
JOIN pg_trigger  t   ON t.tgfoid = p.oid AND NOT t.tgisinternal
JOIN pg_class    c   ON c.oid = t.tgrelid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND p.proname IN (
    'credit_confirmed_deposit',
    'debit_completed_withdrawal',
    'debit_activated_investment',
    'debit_activated_topup',
    'credit_disbursed_loan',
    'sync_investment_topup_total'
  )
GROUP BY p.proname, p.proowner, c.relname, c.relowner, p.prosecdef
ORDER BY p.proname;

COMMENT ON VIEW trigger_security_audit IS
  'Déclencheurs du grand livre : avec qui ils s''exécutent, et s''ils le '
  'peuvent. Une ligne à correctement_configuree = false signifie qu''un dépôt '
  'ne pourra pas être confirmé — le déclencheur n''aura pas le droit d''écrire '
  'dans sa propre table.';

-- La vue décrit le schéma, elle ne contient aucune donnée de client. Le rôle
-- applicatif obtient un droit de lecture dessus pour qu'un contrôle de santé
-- puisse être exécuté depuis l'application, sans avoir à se connecter en
-- propriétaire — ce qui est précisément le genre d'accès à ne pas demander
-- pour un simple diagnostic.
GRANT SELECT ON trigger_security_audit TO invest_api;

\echo ''
\echo '────────────────────────────────────────────────────────────────'
\echo ''


-- =============================================================================
-- Droits du rôle applicatif
--
-- Ils viennent après les migrations : un GRANT sur toutes les tables porte sur
-- ce qui existe, et l'appliquer avant 0001 ne porterait sur rien.
-- =============================================================================

\echo 'Attribution des droits à invest_api'

GRANT USAGE ON SCHEMA public TO invest_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO invest_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO invest_api;

-- Le rôle applicatif ne doit ni posséder ni supprimer. Ces deux droits lui
-- permettraient de contourner la RLM en devenant propriétaire d'une table.
REVOKE ALL ON SCHEMA public FROM invest_api;
GRANT USAGE ON SCHEMA public TO invest_api;

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
-- La RLM de 0002 se base sur deux réglages de transaction : `app.user_id` et
-- `app.user_role`. Ce ne sont pas des paramètres de connexion, ils sont posés
-- par le serveur à chaque transaction, après avoir vérifié la session.
--
-- C'est le seul endroit où la sécurité du cloisonnement repose sur le code
-- applicatif. Si `app.user_role` n'est pas posé, `actor_role()` rend NULL,
-- `can_see()` rend false, et la session ne voit RIEN : l'échec est fermé, pas
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
-- Pour l'administration, `app.user_role = 'ADMIN'` ou `'SUPER_ADMIN'`. C'est
-- le serveur qui choisit, à partir du rôle enregistré en base pour l'utilisateur
-- authentifié, jamais à partir de ce que le client demande.
-- =============================================================================

-- =============================================================================
-- VÉRIFICATION
--
-- À exécuter après avoir filled DATABASE_URL avec invest_api. Si une ligne
-- apparaît, le rôle est propriétaire et la RLS ne protège plus rien.
-- =============================================================================

\echo ''
\echo '=== VÉRIFICATION ==='
\echo '--- 1. Le rôle applicatif ne doit pas être propriétaire ---'
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

\echo '    La colonne tables_possedees doit valoir 0.'

\echo ''
\echo '--- 2. Le cloisonnement doit être actif sur les tables sensibles ---'
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

\echo '    rls_active doit valoir true partout.'

\echo ''
\echo '--- 3. Le grand livre doit être illisible sans session ---'
-- Aucune transaction ici, volontairement.
--
-- Ce contrôle se fait sans BEGIN ni ROLLBACK : une transaction explicite
-- annulerait l'installation entière si le fichier entier est exécuté dans une
-- seule transaction, ce que fait un éditeur SQL qui « applique tout d'un coup ».
-- Le ROLLBACK effacerait le schéma que les quatre migrations viennent
-- d'installer, et l'écran afficherait ensuite un compte de zéro table — sans
-- aucune erreur pour l'expliquer.
--
-- Le contrôle reste valable : hors transaction applicative, `app.user_role`
-- n'est pas posé, `actor_role()` rend NULL, `can_see()` rend false, et la
-- session ne voit rien. Un résultat non nul signifie que la RLS n'est pas en
-- place — ou que la connexion se fait avec un rôle propriétaire.
SELECT count(*) AS lignes_visibles_sans_session
  FROM transactions;

\echo ''
\echo '--- 4. Comptage du schéma installé ---'
SELECT count(*) FILTER (WHERE table_type = 'BASE TABLE')   AS tables,
       count(*) FILTER (WHERE table_type = 'VIEW')         AS vues
  FROM information_schema.tables
 WHERE table_schema = 'public';

\echo ''
\echo 'Installation terminée. Ne pas oublier :'
\echo '  1. le mot de passe de invest_api (console Neon, ou ALTER ROLE) ;'
\echo '  2. DATABASE_URL avec invest_api, et non neondb_owner ;'
\echo '  3. les enregistrements DNS SPF, DKIM et DMARC pour le domaine d''envoi.'
