-- =============================================================================
-- File d'envoi : ce que la base garantit
--
-- Trois propriétés, dans l'ordre d'importance :
--
--   1. Un mouvement d'argent ne dépend jamais d'un envoi.
--   2. L'état du monde et l'intention d'envoyer s'écrivent ensemble.
--   3. Un message ne peut pas contenir un code d'authentification ou un
--      numéro de carte.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- -----------------------------------------------------------------------------
-- Outillage
-- -----------------------------------------------------------------------------

INSERT INTO users (id, email, password_hash, role, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@test.ma',  'h', 'CLIENT', 'VERIFIED'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.ma',    'h', 'CLIENT', 'VERIFIED'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.ma',  'h', 'ADMIN',  'VERIFIED')
ON CONFLICT (email) DO NOTHING;

\echo ''
\echo '=== 1. Un message de service passe ==='

DO $$
DECLARE q uuid;
BEGIN
  q := enqueue_email(
    '11111111-1111-1111-1111-111111111111', 'DEPOSIT_CONFIRMED',
    'Depot confirme',
    'Votre depot a ete confirme. Il est consultable depuis votre espace.',
    '{"amount": "50000.00"}'::jsonb,
    '/deposits'
  );

  IF q IS NULL THEN RAISE EXCEPTION 'ECHEC: rien n a ete mis en file'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM notification_outbox
     WHERE id = q AND status = 'PENDING' AND template = 'DEPOSIT_CONFIRMED'
  ) THEN
    RAISE EXCEPTION 'ECHEC: la ligne de file est absente ou mal etat';
  END IF;

  RAISE NOTICE 'OK  depot confirme mis en file pour alice';
END $$;

-- -----------------------------------------------------------------------------
-- 2. Un destinataire absent n'empêche pas l'opération métier
--
-- C'est la propriété la plus importante. Elle se donne en passant un
-- identifiant qui ne correspond à aucun compte — le seul cas réellement
-- possible, puisque `users.email` est NOT NULL depuis 0001 : un compte
-- enregistré n'a pas d'adresse vide.
--
-- Le cas à surveiller n'est donc pas « pas d'adresse » mais « le compte a
-- disparu entre le changement d'état et la mise en file ». C'est pour cela que
-- la fonction rend la main sans lever : le dépôt reste confirmé.
-- -----------------------------------------------------------------------------

\echo ''
\echo '=== 2. Un destinataire introuvable n interrompt rien ==='

DO $$
DECLARE q uuid;
BEGIN
  q := enqueue_email(
    '99999999-9999-9999-9999-999999999999', 'DEPOSIT_CONFIRMED',
    'Depot confirme', 'Votre depot est confirme.', '{}'::jsonb, '/deposits'
  );

  IF q IS NOT NULL THEN
    RAISE EXCEPTION 'ECHEC: une ligne de file a ete creee sans destinataire';
  END IF;
  RAISE NOTICE 'OK  aucun destinataire : rendu sans lever';
END $$;

DO $$
DECLARE q uuid;
BEGIN
  -- Un client NULL, c'est-à-dire une migration ou un script qui passe une
  -- valeur absente : cela ne doit pas non plus interrompre l'opération.
  q := enqueue_email(NULL, 'DEPOSIT_CONFIRMED', 'Objet', 'Corps', '{}'::jsonb);
  IF q IS NOT NULL THEN
    RAISE EXCEPTION 'ECHEC: une ligne de file a ete creee pour un client NULL';
  END IF;
  RAISE NOTICE 'OK  client NULL : rendu sans lever';
END $$;

-- -----------------------------------------------------------------------------
-- 3. Le même événement ne part pas deux fois
-- -----------------------------------------------------------------------------

\echo ''
\echo '=== 3. Un evenement en double ne double pas l envoi ==='

DO $$
DECLARE n int;
BEGIN
  -- Mêmes variables de modèle : c'est le même événement, donc un seul mail.
  FOR _ IN 1..5 LOOP
    PERFORM enqueue_email(
      '11111111-1111-1111-1111-111111111111', 'DEPOSIT_CONFIRMED',
      'Depot confirme', 'Votre depot a ete confirme.',
      '{"ref": "DEP-2026-0001"}'::jsonb, '/deposits'
    );
  END LOOP;

  SELECT count(*) INTO n FROM notification_outbox
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND template = 'DEPOSIT_CONFIRMED'
     AND template_vars = '{"ref": "DEP-2026-0001"}'::jsonb;

  IF n <> 1 THEN
    RAISE EXCEPTION 'ECHEC: % lignes en file pour un seul evenement', n;
  END IF;
  RAISE NOTICE 'OK  5 appels, 1 seule ligne en file';
END $$;

-- Trois événements réellement différents passent tous les trois : le test 1 en
-- a mis un en file, celui-ci deux de plus.
DO $$
DECLARE n int;
BEGIN
  PERFORM enqueue_email(
    '11111111-1111-1111-1111-111111111111', 'DEPOSIT_CONFIRMED',
    'Depot confirme', 'Votre depot est confirme.',
    '{"ref": "DEP-2026-0002"}'::jsonb, '/deposits'
  );

  SELECT count(*) INTO n FROM notification_outbox
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND template = 'DEPOSIT_CONFIRMED';

  IF n <> 3 THEN
    RAISE EXCEPTION 'ECHEC: % lignes pour 3 depots distincts, attendu 3', n;
  END IF;
  RAISE NOTICE 'OK  trois depots distincts, trois messages';
END $$;

-- -----------------------------------------------------------------------------
-- 4. Le corps ne peut pas porter un code d'authentification
--
-- §20 fait du second facteur une obligation. Transmettre un code par email
-- revient à l'annuler : le canal qui reçoit le code est le même que celui qui
-- reçoit le message, donc il n'est plus un second facteur mais le premier, en
-- deux exemplaires.
-- -----------------------------------------------------------------------------

\echo ''
\echo '=== 4. Un code d authentification dans le corps : doit echouer ==='

DO $$
DECLARE n int := 0;
BEGIN
  -- La garde est testée directement : ce qu'on vérifie ici est sa capacité à
  -- refuser un corps, pas le cheminement d'une mise en file.
  BEGIN
    PERFORM assert_email_body_is_safe(
      'Votre code', 'Votre code de connexion est 123 456. Validez dans 5 minutes.'
    );
  EXCEPTION WHEN restrict_violation THEN n := n + 1;
  END;

  BEGIN
    PERFORM assert_email_body_is_safe(
      'Votre code', 'Entrez le code 987654 pour vous connecter.'
    );
  EXCEPTION WHEN restrict_violation THEN n := n + 1;
  END;

  IF n <> 2 THEN
    RAISE EXCEPTION 'ECHEC: % refus sur 2 attendus, un code est passe', n;
  END IF;

  RAISE NOTICE 'OK  deux codes a six chiffres refuses';
END $$;

-- Et la vérification structurelle qui compte le plus : aucun modèle ne sert à
-- envoyer un code. Ajouter plus tard un 'LOGIN_CODE' à l'énumération serait
-- possible en une ligne — cette vérification le rend visible immédiatement.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'email_template'
     AND e.enumlabel ~* '(CODE|OTP|2FA|TWO_FACTOR|VERIF|PIN)';

  IF n <> 0 THEN
    RAISE EXCEPTION
      'ECHEC: % modeles d email servent a envoyer un code. Un code par email '
      'annule le second facteur de §20.', n;
  END IF;

  RAISE NOTICE 'OK  aucun modele d email ne sert a envoyer un code';
END $$;

-- Un jeton long, lui, doit passer : c'est un jeton opaque, à usage unique — pas
-- un code que l'on recopie. Les variables de modèle portent l'identifiant du
-- jeton, comme en production : deux demandes de réinitialisation sont deux
-- événements distincts, même si le texte du message est identique.
DO $$
DECLARE q uuid;
BEGIN
  q := enqueue_email(
    '11111111-1111-1111-1111-111111111111', 'PASSWORD_RESET',
    'Reinitialisation du mot de passe',
    'Vous avez demande une reinitialisation. Le lien ci-dessous expire dans une heure.',
    '{"token": "req-0001"}'::jsonb, '/reset'
  );
  IF q IS NULL THEN RAISE EXCEPTION 'ECHEC: un message legitime a ete refuse'; END IF;
  RAISE NOTICE 'OK  un message sans code passe';
END $$;

-- -----------------------------------------------------------------------------
-- 5. Un numéro de carte ne transite pas par un message
-- -----------------------------------------------------------------------------

\echo ''
\echo '=== 5. Un numero de carte dans le corps : doit echouer ==='

DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    PERFORM enqueue_email(
      '11111111-1111-1111-1111-111111111111', 'CARD_ISSUED',
      'Carte attribuee', 'Votre carte 4539 1488 0343 6467 est disponible.',
      '{}'::jsonb, '/cards'
    );
  EXCEPTION WHEN restrict_violation THEN n := n + 1;
  END;

  BEGIN
    PERFORM enqueue_email(
      '11111111-1111-1111-1111-111111111111', 'CARD_ISSUED',
      'Carte attribuee', 'Carte 4539148803436467, a retirer au guichet.',
      '{}'::jsonb, '/cards'
    );
  EXCEPTION WHEN restrict_violation THEN n := n + 1;
  END;

  IF n <> 2 THEN
    RAISE EXCEPTION 'ECHEC: % refus sur 2 attendus, un PAN est passe', n;
  END IF;
  RAISE NOTICE 'OK  deux numeros de carte refuses';
END $$;

-- Les quatre derniers chiffres, eux, passent : ils identifient la carte sans
-- rien reveler.
DO $$
DECLARE q uuid;
BEGIN
  q := enqueue_email(
    '11111111-1111-1111-1111-111111111111', 'CARD_ISSUED',
    'Carte attribuee', 'Votre carte se terminant par 4242 est disponible.',
    '{}'::jsonb, '/cards'
  );
  IF q IS NULL THEN RAISE EXCEPTION 'ECHEC: les quatre derniers chiffres sont refuses'; END IF;
  RAISE NOTICE 'OK  les quatre derniers chiffres passent';
END $$;

-- -----------------------------------------------------------------------------
-- 5b. Et surtout : les messages légitimes doivent passer
--
-- Une garde testée uniquement sur ce qu'elle doit bloquer n'est pas une garde,
-- c'est un embargo. Le jour où elle refuse un message réel, ce n'est pas la
-- garde qu'on corrige, c'est qu'on la contourne — et elle ne protège plus rien.
-- C'est le test le plus important du fichier.
-- -----------------------------------------------------------------------------

\echo ''
\echo '=== 5b. Les messages de service ordinaires passent ==='

DO $$
DECLARE
  n_ok   integer := 0;
  n_total integer := 0;
  corps text;
BEGIN
  -- Les nombres courts d'un message normal : durée, âge, plafond, année.
  FOREACH corps IN ARRAY ARRAY[
    'Votre investissement arrive a echeance dans 6 mois.',
    'Votre compte est verifie depuis 24 heures.',
    'Votre pret court sur 36 mois, au taux de 6,5 %.',
    'Le retrait expire dans 72 heures.',
    'Le plafond de votre carte est de 20000 par jour.',
    'Votre depot de 2026 a ete confirme.',
    'Vous avez 3 demandes en attente de validation.',
    'Votre second facteur est actif.',
    'Votre portefeuille est connecte depuis 2026-01-15.'
  ]
  LOOP
    n_total := n_total + 1;
    BEGIN
      PERFORM assert_email_body_is_safe('Objet de test', corps);
      n_ok := n_ok + 1;
    EXCEPTION WHEN restrict_violation THEN
      RAISE EXCEPTION 'ECHEC: un message legitime a ete refuse — « % »', corps;
    END;
  END LOOP;

  RAISE NOTICE 'OK  % messages de service ordinaires acceptes sur %', n_ok, n_total;
END $$;

-- Un jeton long doit passer : c'est un jeton opaque, pas un code à recopier.
DO $$
DECLARE q uuid;
BEGIN
  q := enqueue_email(
    '11111111-1111-1111-1111-111111111111', 'PASSWORD_RESET',
    'Reinitialisation du mot de passe',
    'Votre jeton : Kf7xQ2mZ9pL4vR8tY3nB6wC1dH5jK0aG7eN2qR4. Valable une heure.',
    '{"token": "req-0002"}'::jsonb, '/reset'
  );
  IF q IS NULL THEN RAISE EXCEPTION 'ECHEC: un jeton opaque est refuse'; END IF;
  RAISE NOTICE 'OK  un jeton opaque passe';
END $$;

-- Un IBAN complet ne doit pas passer non plus : c'est une donnée de compte,
-- et il en existe une dans le dépôt.
DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    PERFORM enqueue_email(
      '11111111-1111-1111-1111-111111111111', 'DEPOSIT_RECEIVED',
      'Depot recu', 'Virement recu sur MA120015000001234567890123.',
      '{}'::jsonb, '/deposits'
    );
  EXCEPTION WHEN restrict_violation THEN n := n + 1;
  END;
  IF n <> 1 THEN RAISE EXCEPTION 'ECHEC: un IBAN complet est passe'; END IF;
  RAISE NOTICE 'OK  un IBAN complet refuse';
END $$;

-- Un numéro de carte collé, sans espaces, doit être refusé aussi : c'est la
-- forme que produit un copier-coller depuis un formulaire.
DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    PERFORM enqueue_email(
      '11111111-1111-1111-1111-111111111111', 'CARD_ISSUED',
      'Carte attribuee', 'Votre carte 4539148803436467 est prete.',
      '{}'::jsonb, '/cards'
    );
  EXCEPTION WHEN restrict_violation THEN n := n + 1;
  END;

  IF n <> 1 THEN RAISE EXCEPTION 'ECHEC: un PAN colle sans espaces est passe'; END IF;
  RAISE NOTICE 'OK  un PAN colle sans espaces refuse';
END $$;

-- -----------------------------------------------------------------------------
-- 6. Les reprises, et l'arrêt
-- -----------------------------------------------------------------------------

\echo ''
\echo '=== 6. Les reprises doublent, puis s arretent ==='

DO $$
DECLARE
  q uuid;
  n_attempts smallint;
  n_tentatives integer := 0;
  statut email_status;
BEGIN
  q := enqueue_email(
    '11111111-1111-1111-1111-111111111111', 'WITHDRAWAL_APPROVED',
    'Retrait approuve', 'Votre retrait est approuve.',
    '{"ref": "WDR-X"}'::jsonb, '/withdrawals'
  );
  UPDATE notification_outbox SET max_attempts = 3 WHERE id = q;

  -- On échoue jusqu'à épuisement.
  LOOP
    statut := (SELECT status FROM notification_outbox WHERE id = q);
    EXIT WHEN statut = 'FAILED';

    n_tentatives := n_tentatives + 1;
    EXIT WHEN n_tentatives > 5;   -- garde-fou : la boucle ne doit pas être infinie

    PERFORM mark_email_failed(q, 'connexion SMTP refusee');

    SELECT attempts, status INTO n_attempts, statut FROM notification_outbox WHERE id = q;
  END LOOP;

  IF statut <> 'FAILED' THEN
    RAISE EXCEPTION 'ECHEC: apres 3 echecs le statut est %, attendu FAILED', statut;
  END IF;

  IF n_attempts <> 3 THEN
    RAISE EXCEPTION 'ECHEC: % tentatives enregistrees, attendu 3', n_attempts;
  END IF;

  -- Une ligne FAILED ne doit plus repartir toute seule.
  PERFORM mark_email_failed(q, 'encore une tentative');
  IF (SELECT attempts FROM notification_outbox WHERE id = q) <> 3 THEN
    RAISE EXCEPTION 'ECHEC: une ligne FAILED continue de compter des tentatives';
  END IF;

  RAISE NOTICE 'OK  3 tentatives, arret definitif, % total', n_attempts;
END $$;

-- Le délai croît : un service SMTP qui refuse n'est pas forcément mort.
DO $$
DECLARE q uuid; d1 interval; d2 interval;
BEGIN
  q := enqueue_email(
    '11111111-1111-1111-1111-111111111111', 'LOAN_APPROVED',
    'Pret approuve', 'Votre pret est approuve.', '{"a":1}'::jsonb, '/loans'
  );

  PERFORM mark_email_failed(q, 'erreur 1');
  SELECT next_attempt_at - now() INTO d1 FROM notification_outbox WHERE id = q;
  PERFORM mark_email_failed(q, 'erreur 2');
  SELECT next_attempt_at - now() INTO d2 FROM notification_outbox WHERE id = q;

  IF d2 <= d1 THEN
    RAISE EXCEPTION 'ECHEC: le delai ne croit pas (%, puis %)', d1, d2;
  END IF;
  RAISE NOTICE 'OK  delai croissant : % puis %',
    date_trunc('minute', d1), date_trunc('minute', d2);
END $$;

-- -----------------------------------------------------------------------------
-- 7. Envoyé veut dire accepté, pas lu
-- -----------------------------------------------------------------------------

\echo ''
\echo '=== 7. SENT signifie accepte par le serveur ==='

DO $$
DECLARE q uuid; s timestamptz;
BEGIN
  q := enqueue_email(
    '11111111-1111-1111-1111-111111111111', 'DEPOSIT_CONFIRMED',
    'Depot confirme', 'Votre depot est confirme.', '{"b":1}'::jsonb, '/deposits'
  );

  -- Impossible de marquer envoyé sans horodatage : le statut ne peut pas
  -- precéder la preuve.
  BEGIN
    UPDATE notification_outbox SET status = 'SENT' WHERE id = q;
    RAISE EXCEPTION 'ECHEC: SENT sans horodatage accepte';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK  SENT refuse sans horodatage';
  END;

  PERFORM mark_email_sent(q, '250 2.0.0 Ok: queued');
  SELECT sent_at INTO s FROM notification_outbox WHERE id = q;
  IF s IS NULL THEN RAISE EXCEPTION 'ECHEC: SENT sans horodatage enregistre'; END IF;

  RAISE NOTICE 'OK  SENT porte son horodatage (%s)', s;
END $$;

-- -----------------------------------------------------------------------------
-- 8. Le rappel de file
-- -----------------------------------------------------------------------------

\echo ''
\echo '=== 8. La file se surveille ==='

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM outbox_backlog_report();
  IF r.pending IS NULL THEN
    RAISE EXCEPTION 'ECHEC: le rappel ne compte rien';
  END IF;
  RAISE NOTICE 'OK  en attente : %, le plus vieux a % , envoyes sur 24 h : %, echecs : %',
    r.pending, r.oldest_age, r.sent_24h, r.failed_24h;
END $$;

ROLLBACK;

\echo ''
\echo '=== LA FILE TIENT SES PROMESSES ==='
