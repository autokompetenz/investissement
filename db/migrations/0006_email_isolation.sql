-- =============================================================================
-- 0006 — Un message ne peut pas annuler une opération financière
-- =============================================================================
--
-- Le problème.
--
-- `enqueue_email` lève. C'est justifié sur ses propres termes : une garde doit
-- mordre, et `assert_email_body_is_safe` refuse un corps qui porte un code, un
-- numéro de carte ou un IBAN. Mais on l'appelle dans la MÊME transaction que le
-- changement d'état — c'est la garantie de 0004, et c'est la bonne garantie —
-- donc une garde qui mord annule aussi le dépôt.
--
-- Concrètement : une administration écrit « VIR 123456 » dans son motif de
-- relecture. Le corps du message cite ce motif. La garde refuse. La fonction
-- lève. Le UPDATE est annulé. Le dépôt n'est pas confirmé, alors que
-- l'administration vient de le faire, et le client ne le saura jamais.
--
-- Un mot qu'un humain a tapé décide de l'argent du client.
--
-- Ce que ce fichier corrige.
--
-- `enqueue_email_isolated` enveloppe l'appel et absorbe l'exception. Le dépôt
-- reste confirmé, l'écriture au grand livre reste faite, et l'échec part dans
-- les journaux de la base avec son motif. Le message est perdu ; l'argent ne
-- l'est pas. C'est le seul ordre acceptable quand les deux sont en cause.
--
-- Ce que ça ne fait pas.
--
-- La garde n'est pas désactivée. Elle est toujours évaluée, toujours refusée,
-- et le refus est journalisé au lieu d'être propagé. Un corps qui porte un
-- code ne partira jamais ; il fera du bruit.
--
-- Pourquoi une fonction et non un drapeau sur `enqueue_email`. Un drapeau est
-- une décision que l'appelant prend à chaque site d'appel, et un site d'appel
-- écrit dans l'urgence est précisément l'endroit où « propager » serait
-- choisi. Ici l'isolation est le seul comportement disponible, et la version
-- stricte reste joignable par son nom pour l'appelant qui veut qu'elle soit
-- fatale.
-- =============================================================================

CREATE OR REPLACE FUNCTION enqueue_email_isolated(
  target_user_id uuid,
  template       email_template,
  subject        text,
  body           text,
  vars           jsonb DEFAULT '{}'::jsonb,
  action_url     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  queued_id uuid;
BEGIN
  BEGIN
    queued_id := enqueue_email(target_user_id, template, subject, body, vars, action_url);
  EXCEPTION
    WHEN OTHERS THEN
      -- L'opération métier est déjà acquise : le grand livre est écrit, le
      -- dépôt est confirmé. Un message qui ne part pas est un incident, pas un
      -- échec — et il doit se voir, sinon personne ne saura qu'il a eu lieu.
      RAISE WARNING
        'Message % non mis en file pour % : % — l''opération reste valide',
        template, target_user_id, SQLERRM;
      RETURN NULL;
  END;

  RETURN queued_id;
END;
$$;

COMMENT ON FUNCTION enqueue_email_isolated(uuid, email_template, text, text, jsonb, text) IS
  'Comme enqueue_email, mais une garde qui refuse, une file pleine ou une ligne
  en double n''annulent pas l''opération qui a appelé la fonction. C''est la
  forme à utiliser dans une transaction qui porte de l''argent ou un changement
  d''état : la confirmation d''un dépôt ne peut pas dépendre de la rédaction
  d''un message. Retourne l''identifiant de la ligne mise en file, ou NULL si
  le message n''a pas pu l''être. L''échec est journalisé en WARNING.';

-- Même traitement que `enqueue_email` : défaut pour PUBLIC, rôle applicatif seul.
REVOKE ALL ON FUNCTION enqueue_email_isolated(uuid, email_template, text, text, jsonb, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_email_isolated(uuid, email_template, text, text, jsonb, text)
  TO invest_api;

-- -----------------------------------------------------------------------------
-- Vérification de la transition, une seule fois et dans un seul endroit
-- -----------------------------------------------------------------------------
--
-- La table de transitions du dépôt, en SQL. Elle existait déjà en TypeScript,
-- dans `src/services/deposits.ts`, où elle n'était qu'une convention : rien ne
-- l'empêchait d'écrire `deposits.status = 'CONFIRMED'` directement en SQL, et
-- la fonction qui l'applique est celle qui décide si l'argent bouge.
--
-- Elle est appliquée ici par un UPDATE conditionnel plutôt que par un trigger :
-- un trigger qui lèverait annulerait l'UPDATE, ce qui est le comportement
-- voulu, mais il ne pourrait pas dire *quelle* transition a été tentée. La
-- forme conditionnelle renvoie zéro ligne, et l'appelant distingue alors
-- « déjà confirmé » de « rejeté » de « annulé » par la valeur qu'il vient de
-- lire — sans que la décision dépende d'un message d'erreur à traduire.
--
-- Un dépôt est PENDING à la création, ou UNDER_REVIEW si une preuve est déjà
-- fournie ; `declareDepositProof` le passe en UNDER_REVIEW. CONFIRMED,
-- REJECTED et CANCELLED sont des dossiers clos, et aucun n'est réouvrable.
CREATE OR REPLACE FUNCTION deposit_may_transition(from_status deposit_status, to_status deposit_status)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE from_status
    WHEN 'PENDING'      THEN to_status IN ('UNDER_REVIEW', 'CONFIRMED', 'REJECTED', 'CANCELLED')
    WHEN 'UNDER_REVIEW' THEN to_status IN ('CONFIRMED', 'REJECTED', 'CANCELLED')
    ELSE false
  END;
$$;

COMMENT ON FUNCTION deposit_may_transition(deposit_status, deposit_status) IS
  'La table de transitions d''un dépôt. Les trois états terminaux sont clos : un
  dépôt rejeté ne peut pas être confirmé après coup, et c''est le cas qui
  manquait — seuls CONFIRMED et CANCELLED étaient vérifiés.';

REVOKE ALL ON FUNCTION deposit_may_transition(deposit_status, deposit_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deposit_may_transition(deposit_status, deposit_status) TO invest_api;
