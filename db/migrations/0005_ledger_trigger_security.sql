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
