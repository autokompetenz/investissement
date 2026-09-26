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
