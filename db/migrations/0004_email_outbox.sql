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
