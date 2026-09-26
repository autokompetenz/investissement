# Sécurité

Ce document décrit ce que la plateforme **réellement** protège aujourd'hui, et ce
qui reste un simulacre. La distinction est volontaire : tout ce qui touche à
l'argent ou à l'identité doit être lisible sans ambiguïté.

> **La plateforme n'est pas sécurisée en production, et ce dépôt ne prétend pas
> l'être.** L'application parle à une couche de services simulée dans
> `localStorage`. La base de données de `db/` est réelle et applique des
> contraintes réelles, mais **rien ne la branche encore**. Ce qui suit décrit
> l'application, qui est la seule chose qui tourne.

## Conforme à la spécification

Implémenté dans le code, testé dans `tests/`, vérifiable :

| Exigence | Où |
| --- | --- |
| Second facteur sur les comptes d'administration (§20) | `services/totp.ts`, `services/auth.ts` |
| Algorithme TOTP conforme (RFC 6238) | vecteurs de test de l'annexe B |
| Codes de secours à usage unique | `verifySecondFactor` |
| Challenge à durée de vie, consommé à l'usage | `verifyTwoFactor` |
| Limitation de débit sur les actions sensibles (§20) | `services/rateLimit.ts` |
| Verrouillage après N échecs | `RateLimitError("lockout")` |
| Expiration absolue de session (8 h) | `ABSOLUTE_TIMEOUT_MS` |
| Expiration par inactivité (1 h) | `IDLE_TIMEOUT_MS` |
| Révocation de session (déconnexion, changement de mot de passe, action admin) | `api.sessions.revokeAll` |
| Message de refus identique que le mot de passe ou l'adresse soit fautif | `login` renvoie `invalidCredentials` dans les deux cas |
| Journalisation des échecs et des changements de facteur (§22) | `LOGIN_FAILED`, `RATE_LIMITED`, `TWO_FACTOR_*` |
| Aucun numéro de carte stocké (§10) | type `Card` |
| Aucun IBAN fabriqué (§4) | l'application n'en génère pas |
| Comparaison à temps constant des codes TOTP | `safeEqual` |

## Reste un simulacre

À déplacer côté serveur, sans quoi la sécurité est fictive :

- **Le mot de passe.** La comparaison est un `===` sur une chaîne réversible
  (`mock$${password}$${length}`). Le serveur doit hacher avec une KDF lente
  (Argon2id ou bcrypt) et un sel par compte.
- **Le jeton de session.** Un identifiant en clair dans le `localStorage`. Il
  faut un cookie `httpOnly`, `Secure`, `SameSite`, avec rotation.
- **Les sessions.** Vivent dans le `localStorage` : les effacer ne déconnecte
  personne d'un coup, et un attaquant controls both. Elles doivent être en base,
  avec un magasin partagé (Redis) pour la révocation en temps réel.
- **Le rate limiter.** Compteurs en mémoire dans l'onglet : effacer l'onglet
  remet les compteurs à zéro, et plusieurs onglets ont chacun les leurs. Il
  faut un compteur global, par IP et par compte.
- **Le verrouillage.** Identique : changer de navigateur et le compteur repart
  à zéro.
- **Le secret TOTP.** Généré et stocké dans le navigateur. Le serveur doit le
  générer, le chiffrer au repos et ne jamais le renvoyer après l'activation.
- **L'absence de seed phrase.** Rien ne la demande, mais aucune vérification
  automatique ne l'interdit : c'est une contrainte de conception à maintenir.

## Ce que la base de données garantit déjà

`db/` n'est pas une maquette. Ce sont des contraintes PostgreSQL, vérifiées par
90 contrôles sur un conteneur jetable (`db/test/run-schema-check.sh`). Elles ne
sont contournables ni par le navigateur, ni par une requête mal construite.

Mais **rien ne les applique tant que l'application n'est pas reliée**. C'est la
raison pour laquelle ce document commence par « n'est pas sécurisée ».

| Propriété | Où |
| --- | --- |
| Le grand livre refuse `UPDATE` et `DELETE` | `forbid_mutation()` |
| Un solde est rejoué, jamais stocké | vue `client_balances` |
| Un dépôt confirmé ne se rouvre pas | `forbid_leaving_terminal_state()` |
| Un IBAN est vérifié par sa clé ISO 7064 à l'écriture | `iban_is_valid()` |
| Une adresse crypto est vérifiée par réseau | `crypto_address_is_valid()` |
| Un client ne voit que son propre dossier | RLS, `0002_rls.sql` |
| Un client ne peut ni se promouvoir ni s'auto-valider | RLS, `users_self_register` |
| Le second facteur n'est lisible que par le service | RLS, `two_factor_settings` |
| Les déclencheurs du grand livre écrivent avec les droits de la base | `SECURITY DEFINER`, `0005` |
| Un dépôt KYC ne contient qu'une clé, jamais le fichier | `kyc_documents.storage_key` |

### Deux pièges que ce dépôt documente parce qu'ils se rencontrent

**Un compte qui vient d'être créé ne peut pas relire sa propre ligne.**
`INSERT … RETURNING` est refusé : la RLM évalue la clause avec la policy de
lecture, et le compte n'a pas encore de session. Un `SELECT` derrière non plus.
Le serveur doit donc produire l'uuid avant l'insertion.

**Un `SECURITY DEFINER` sans `REVOKE … FROM PUBLIC` est une invitation.** Par
défaut `PUBLIC` peut exécuter une fonction ; n'importe quel rôle connecté
pourrait alors appeler les déclencheurs du grand livre et se faire accorder
leurs pouvoirs. C'est la raison du `REVOKE` dans `0005`.

## Ce que la plateforme ne fait pas encore

- **Protection CSRF.** Sans cookie de session, le risque n'existe pas encore. Il
  reviendra avec le passage au cookie et devra être traité.
- **CSP et en-têtes.** À poser au niveau du serveur qui sert le front.
- **2FA sur les comptes clients.** Le §20 ne l'exige que pour l'administration.
  À décider selon le profil de risque.
- **Révocation à distance du secret.** Une fuite du secret TOTP n'invalide rien
  tant que les sessions existent.
- **Tests d'intégration.** Les tests actuels couvrent le domaine pur (calculs,
  règles, transitions). Rien ne vérifie les composants dans un navigateur.

## Avant toute mise en production

Cette liste n'est pas une check-list exhaustive, c'est le minimum que ce dépôt
refuse de contourner :

1. Remplacer `src/services/api.ts` par un vrai client HTTP : **aucune** fonction
   de ce dépôt ne décide seule d'un solde, d'un statut ou d'un montant.
2. Relier l'application à la base, avec un rôle **non propriétaire** : un rôle
   propriétaire contourne la RLM, et toutes les garanties ci-dessus deviennent
   décoratives. Voir `db/README.md`.
3. Hachage des mots de passe serveur, avec KDF lente.
4. Sessions serveur, cookie `httpOnly`, stockage partagé.
5. Rate limiting distribué, par IP et par compte.
6. Secret TOTP généré et chiffré côté serveur.
7. Journal d'audit envoyé vers un stockage en écriture seule.
8. Prestataires bancaires, de paiement et d'émission de cartes réels (§24).
9. Procédures KYC/AML validées par un responsable compliance.
