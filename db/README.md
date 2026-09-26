# Base de données

Schéma PostgreSQL de la plateforme, écrit pour Neon. Il est indépendant du
front : l'application parle aujourd'hui à une couche de service simulée dans
`src/services/`, et ce dépôt décrit la base sur laquelle cette couche
s'appuiera.

## Fichiers

| Fichier | Rôle |
|---|---|
| `migrations/0001_init.sql` | Tables, types, contraintes, déclencheurs, grand livre, soldes |
| `migrations/0002_rls.sql` | Cloisonnement par ligne : qui voit quoi, et qui s'inscrit |
| `migrations/0003_manual_assignment.sql` | Saisie manuelle : vérification à l'écriture, auteur de l'attribution |
| `migrations/0004_email_outbox.sql` | File d'envoi : l'email part ailleurs, jamais au passage d'un mouvement |
| `seed.sql` | Jeu de démonstration, idempotent |
| `neon-setup.mjs` | Génère `neon-setup.sql`, le fichier à coller dans Neon |
| `test/schema_check.sql` | 27 cas où la base doit refuser, et une réconciliation |
| `test/rls_check.sql` | 17 cas de cloisonnement, dont l'inscription, en CLIENT, ADMIN et sans session |
| `test/manual_assignment_check.sql` | 15 cas de saisie manuelle, dont 3 IBAN de référence |
| `test/email_outbox_check.sql` | 20 cas sur la file d'envoi, dont 9 messages légitimes qui doivent passer |
| `test/run-schema-check.sh` | Exécute le tout sur un PostgreSQL jetable |

## Vérifier

```bash
./db/test/run-schema-check.sh
```

Le script démarre un conteneur PostgreSQL 16, applique les migrations sur
cinq bases neuves — schéma, saisie manuelle, file d'envoi, cloisonnement,
démonstration — exécute les vérifications, applique le jeu de démonstration
deux fois pour prouver qu'il est reproductible, puis supprime tout. Aucune donnée n'est
conservée et aucun port n'est laissé ouvert. Il lui faut Docker ou Podman.

Sortie attendue : 80 contrôles au vert, 7 lignes dans le grand livre de
démonstration, et la phrase `✓ le schéma tient, il ne fuit pas, et le jeu de
démonstration est reproductible`.

## Appliquer sur Neon

Le fichier à coller dans l'éditeur SQL de Neon est **`db/neon-setup.sql`** : les
quatre migrations, le rôle applicatif, et une vérification de fin. Il est
généré, ne pas l'éditer à la main — pour changer le contenu, changer une
migration et relancer `node db/neon-setup.mjs`.

Le fichier s'applique d'un seul trait, dans l'éditeur SQL, avec le rôle
propriétaire. Il a été vérifié des deux côtés : en une seule transaction, et
instruction par instruction. Le jeu de démonstration n'est pas inclus — c'est
`db/seed.sql`, à part, et seulement sur une base de recette.

L'URL de connexion contient le mot de passe. Elle ne va jamais dans le dépôt.

```bash
# 1. Créer la base sur neon.tech, puis copier l'URL de connexion
# 2. Appliquer le schéma, dans l'ordre
psql "$DATABASE_URL" -f db/migrations/0001_init.sql
psql "$DATABASE_URL" -f db/migrations/0002_rls.sql
psql "$DATABASE_URL" -f db/migrations/0003_manual_assignment.sql
psql "$DATABASE_URL" -f db/migrations/0004_email_outbox.sql

# 3. Créer le rôle de service
psql "$DATABASE_URL" -c "CREATE ROLE invest_api LOGIN PASSWORD '…';"
psql "$DATABASE_URL" -c "GRANT USAGE ON SCHEMA public TO invest_api;"
psql "$DATABASE_URL" -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO invest_api;"
psql "$DATABASE_URL" -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO invest_api;"

# 4. Jeu de démonstration, facultatif
psql "$DATABASE_URL" -f db/seed.sql
```

Ne pas appliquer `seed.sql` sur une base qui contient des données réelles. Les
mots de passe y sont des exemples lisibles en clair.

## Trois règles que le schéma tient

**Aucun montant en flottant.** Le domaine `amount` est un `NUMERIC(20,4)`, et
les colonnes de montant interdisent le négatif. Le sens d'un mouvement est
porté par le type, jamais par le signe : un retrait de 5 000 est un `WITHDRAWAL`
de 5 000, pas un `DEPOSIT` de -5 000. Un flottant sur de l'argent finit par
créer un centime qui n'existait pas.

**Le grand livre est en ajout seul.** La table `transactions` refuse `UPDATE`
et `DELETE` par déclencheur. Une correction est une nouvelle ligne, jamais une
édition. C'est ce qui rend un solde toujours reconstituable : il se rejoue, il
ne se corrige pas.

**Un solde n'est pas stocké.** `client_balances` est une vue. Un solde en colonne
se désynchronise de son grand livre le premier jour où une transaction échoue à
moitié ; une vue ne peut pas mentir, elle se recalcule.

## Ce que la base refuse

Chaque ligne de `test/schema_check.sql` est un cas où la base doit dire non.

| Refus | Raison |
|---|---|
| Un mineur ouvre un compte | §3.3 |
| Un produit publie un taux non qualifie | §24 |
| Un IBAN mal forme, ou partage entre deux comptes | §4 |
| Un IBAN dont la clé de contrôle est fausse | §4, 0003 |
| Une adresse crypto du mauvais réseau, ou hors alphabet | §5, 0003 |
| Un IBAN ou une adresse attribué par un client | §20, 0003 |
| Une carte émise par un client, ou sans émetteur | §10, 0003 |
| Un depot confirme est rouvre | §19 |
| Le grand livre est modifie ou supprime | §15 |
| Le journal d'audit est modifie | §22 |
| Un investissement s'active sans paiement verifie | §6, §8 |
| Un pret est approuve sans taux ni conditions | §9 |
| Un pret accorde plus que la demande | §9 |
| Un echeancier qui ne tombe pas juste | §9 |
| Un pret actif sans reference de decaissement | §9 |
| Un retrait termine sans reference de transaction | §12 |
| Un numero de carte complet | §10 |
| Une carte active sans date, une carte bloquee reactivee | §10, §19 |
| Une echeance payee qui se rembourse | §19 |
| Deux demandes de carte ouvertes pour le meme produit | §10 |
| Un montant negatif ou nul | §17 |

## Ce que la base laisse passer, et qui ne devrait pas

Quatre choses méritent d'être dites avant la mise en service.

**L'identité est à faire.** `password_hash` reçoit une chaîne. Que ce soit
Argon2id ou bcrypt, le hachage se fait côté serveur, jamais dans le navigateur.
Aucune ligne du schéma n'oblige le format : c'est une contrainte applicative,
et c'est un point de vérification à assurer.

**Le second facteur est chiffré, pas implémenté.** `two_factor_settings` a une
colonne `secret_ciphertext`. Ce qui la remplit — une clé de chiffrement gérée
par l'application, un KMS, rien du tout — n'est pas dans ce dépôt. Une colonne
`bytea` n'est pas un chiffrement.

**L'argent n'arrive pas tout seul.** Le schéma sait qu'un dépôt existe, il sait
qu'il a été confirmé. Il ne sait pas s'il est réellement arrivé sur le compte.
Voir « ce que la saisie manuelle ne règle pas », plus bas.

**L'appartenance d'un IBAN n'est pas vérifiable ici.** Voir la section suivante.

## Saisie manuelle : ce que ça change vraiment

L'administration attribue elle-même les IBAN, les adresses de dépôt et les
cartes. C'est un choix : cela retire quatre dépendances contractuelles — banque,
paiement, émetteur de cartes, nœud blockchain — et cela veut dire qu'aucun appel
automatique ne rattrape une faute de frappe.

`0003_manual_assignment.sql` prend ce transfert en charge. Ce qu'il vérifie, à
l'écriture et dans la base — donc pas seulement dans le navigateur :

| Objet | Vérification |
|---|---|
| IBAN | clé de contrôle ISO 7064 (mod 97), longueur 15–34, forme |
| Adresse crypto | format du réseau, alphabet bech32 pour le BTC, longueur exacte pour le TRON |
| Attribution | `assigned_by` doit être un compte `ADMIN` ou `SUPER_ADMIN` |
| Carte | `issued_by` obligatoire dès qu'elle est active, et doit être un administrateur |
| Tous | un IBAN ou une adresse ne sert qu'à un client |

`admin_assignments` récapitule le tout avec l'auteur et la date. Une attribution
sans auteur n'est pas régularisée en silence : elle apparaît, et ne prouve rien.

### Ce que la saisie manuelle ne règle pas

Un IBAN peut être parfaitement valide et appartenir à quelqu'un d'autre. Le mod 97
détecte une inversion de deux chiffres, un chiffre sauté, une lettre confondue
avec la précédente — c'est-à-dire la faute de frappe, celle que l'œil ne voit
pas. Il ne détecte pas un IBAN réel recopié depuis le mauvais dossier.

Seul l'établissement qui détient le compte peut répondre à cette question. Tant
qu'aucun appel automatique ne le fait, cette vérification repose sur l'administrateur,
et le système ne peut que tracer qu'il l'a affirmée.

C'est un arbitrage, pas un défaut : un contrôle manuel avec une trace de l'auteur
vaut mieux qu'un contrôle automatique sur un IBAN qu'un attaquant a lui-même
saisi. Mais il faut le savoir, parce que l'erreur se paie en fonds perdus et non
en message d'erreur.

Le cas le plus coûteux reste le crypto : une adresse mal saisie est un envoi
vers le vide, sans banque pour contester le virement. C'est pourquoi le contrôle
de format est par réseau, et pourquoi l'alphabet bech32 est vérifié — un `1`, un
`b`, un `i` ou un `o` dans une adresse BTC la rend inatteignable alors qu'elle a
l'air correcte.

Pour les dépôts crypto, la saisie manuelle de l'adresse ne remplace pas la
surveillance de la chaîne. Sans accès à un nœud, personne ne sait qu'une
transaction a eu lieu : les confirmations se comptent sur la blockchain, elles
ne se déclarent pas. Si `BLOCKCHAIN_RPC_URL` reste vide, l'administration engage
sa responsabilité sur ce qu'elle déclare avoir vu.

## Le rôle qui compte

`0002_rls.sql` n'a d'effet que si l'application se connecte avec un rôle **non
propriétaire**. Le propriétaire d'une table contourne toujours sa RLS, sans
exception possible. Sur Neon, `neon_admin` contourne : c'est lui qui applique les
migrations, et c'est prévu. Si l'application se connectait avec lui, la moitié de
ce dépôt ne servirait à rien.

C'est le seul réglage qui fasse tenir l'ensemble, et il n'est pas vérifiable
depuis le dépôt. Il se vérifie en production, au moment de la première
requête : ouvrir une session en `CLIENT` et vérifier qu'elle ne voit pas le
grand livre d'un autre. `test/rls_check.sql` fait exactement cela.

## L'inscription, et ce qu'elle ne peut pas faire

Une policy qui exige un rôle d'administration bloque l'inscription : à cet
instant précis, personne n'est encore administrateur. Chacune des policies est
correcte isolément, et leur ensemble interdit de créer un compte — le parcours
de §3.2 ne démarrait pas. `users_self_register` autorise l'insertion, mais
seulement avec `role = 'CLIENT'` et `status = 'PENDING'` : on peut créer un
compte, pas créer un compte déjà élevé.

Reste une contrainte d'écriture, découverte en exécutant :

```sql
INSERT INTO users (email, password_hash) VALUES (...) RETURNING id;
-- ERROR: new row violates row-level security policy for table "users"
```

RLM évalue la clause `RETURNING` avec la policy de **lecture**. Le compte qui
vient d'être créé n'a pas encore de session, `users_read` rend `false`, et la
ligne ne peut pas être relue. Ni un `SELECT` derrière, ni un
`WITH … INSERT … RETURNING` : la clause `RETURNING` y est évaluée de la même
façon, et l'ensemble échoue.

La forme qui marche impose que **le serveur produise l'identifiant du compte
avant l'insertion** — un uuidv4 applicatif — et le passe aux deux tables :

```sql
INSERT INTO users (id, email, password_hash) VALUES (:id, :email, :hash);
INSERT INTO profiles (user_id, ...) VALUES (:id, ...);
```

C'est de toute façon la pratique habituelle, et ce n'est pas une gêne : un
compte en attente de validation ne doit rien pouvoir lire, pas même la ligne qui
le décrit. Mais il faut le savoir avant d'écrire le contrôle d'inscription, pas
le découvrir en production.


## Courriel

§21 prévoit l'email comme canal, à côté de la notification interne, pour seize
événements — création et validation de compte, dépôts, investissements,
retraits, prêts, cartes, changement important. La migration `0004` prépare où
ils partent. Elle ne les envoie pas.

**Un courriel ne décide de rien.** Un dépôt confirmé ne dépend pas de la
réussite d'un envoi. Si la boîte SMTP est pleine, si le réseau tombe, si le
message part en spam, l'argent reste crédité et le grand livre reste juste.
L'inverse ferait de la messagerie un point de défaillance financier : il
suffirait de saturer la boîte pour geler les dépôts de toute la plateforme.

D'où la file. `enqueue_email()` s'appelle dans la **même transaction** que le
changement d'état : le confirmateur de dépôt et la ligne « dépôt confirmé »
valident ensemble, ou pas du tout. L'envoi se fait ensuite, par un autre
processus, et échoue seul. `notification_outbox` est distincte de
`notifications` : une notification interne existe dès qu'un événement s'est
produit et ne demande aucun envoi, alors qu'un courriel est une tentative de
livraison, avec ses reprises et ses échecs.

**Ce qu'un message ne doit pas contenir.** Ce n'est pas une politique, c'est une
contrainte, appliquée par `assert_email_body_is_safe()` :

- **Aucun code d'authentification.** §20 fait du second facteur une obligation.
  Un code transmis par email arrive par le même canal que le message : ce n'est
  plus un second facteur, c'est le premier en deux exemplaires. Un test vérifie
  qu'aucun gabarit de l'énumération `email_template` ne sert à cela — un
  `LOGIN_CODE` ajouté plus tard se verrait immédiatement.
- **Aucun numéro de carte, aucun IBAN complet.** Au mieux les quatre derniers
  chiffres. Un corps de message finit dans une boîte, un transfert, une
  sauvegarde, parfois une capture d'écran.
- **Aucun solde dans le corps.** Le message dit « votre dépôt est confirmé » et
  renvoie à l'écran. La garde refuse aussi les objets non ASCII, dont le
  traitement varie d'un client mail à l'autre.

Une garde testée uniquement sur ce qu'elle doit bloquer n'est pas une garde :
le jour où elle refuse un message réel, ce n'est pas elle qu'on corrige, c'est
qu'on la contourne. `email_outbox_check.sql` teste donc aussi neuf messages de
service ordinaires — « dans 6 mois », « depuis 24 heures », « plafond de
20000 » — qui doivent passer.

**Les reprises doublent** à chaque tentative, jusqu'à `max_attempts`, puis la
ligne passe `FAILED` et sort de la file : un échec définitif ne bloque pas ce
qui suit. `SENT` signifie « le serveur SMTP a accepté », pas « le client a lu ».
`outbox_backlog_report()` donne le volume en attente et l'âge du plus ancien —
une file non vidée est un incident, et rien d'autre ne le signalerait.

### Ce qui manque pour que ça parte

Rien ne partira tant qu'il n'y a pas de serveur. L'application est une page
unique qui travaille en localStorage : elle n'a pas d'où envoyer. Ce qui reste
à écrire :

- le **worker** qui vide la file, sur un déclencheur planifié (cron Vercel) ou
  une file de travaux ;
- la **connexion SMTP**, en code applicatif, avec un délai d'attente court — une
  fonction serverless ne doit pas ouvrir une connexion qui traîne ;
- les **gabarits** de chaque événement, relus avant d'être écrits ;
- la réinitialisation de mot de passe, aujourd'hui un bouchon :
  `requestPasswordReset` (`src/services/auth.ts:611`) écrit une trace d'audit et
  ne génère aucun jeton.

### Délivrabilité

Ce que la base ne fera pas. Une adresse d'envoi sur IP mutualisée sort avec le
réputation de tous les autres clients de l'hébergeur, et pour des messages de
service financier cela se paie : un mail de réinitialisation en spam, c'est un
client qui suit le premier lien qu'il trouve, pas le vôtre.

Ce qui aide, et ne dépend d'aucun réglage applicatif :

| Enregistrement | Rôle |
|---|---|
| SPF | déclare quels serveurs peuvent émettre pour le domaine |
| DKIM | signature cryptographique du message, vérifiée par le destinataire |
| DMARC | dit au destinataire quoi faire d'un message qui échoue aux deux |

Les valeurs exactes sont dans hPanel → Email → Email Delivery → DNS. Sans ces
trois enregistrements, tout part en spam et aucun réglage côté application n'y
changera quoi que ce soit. `SMTP_FROM` doit être sur le domaine pour lequel
ils sont publiés : un message signé pour un domaine et émis depuis un autre
échoue pareil.



Pas de migration de version ni de table d'historique : quatre fichiers
s'appliquent dans l'ordre, ce qui suffit tant qu'il n'y a pas de déploiement en
continu. `0004` ajoute des valeurs à un type énuméré, ce qui n'est pas
annulable — c'est la première migration qui ne se réapplique pas toute seule, et
la raison pour laquelle le point suivant va se faire sentir. Pas de partitionnement du journal d'audit : il tiendra quelques
millions de lignes sans broncher, au-delà il faudra un `DECLARE` par période.

Pas non plus de prestataire de paiement, d'émetteur de carte ni
d'établissement bancaire — l'administration saisit ces objets à la main, et le
schéma est fait pour ça. Ce qu'il reste hors de portée : la surveillance de la
blockchain, sans laquelle un dépôt crypto n'est vu par personne, et la
confirmation qu'un IBAN appartient bien à son titulaire. Ce sont des accès à des
tiers, pas des lignes à écrire.

Et pas de worker d'envoi, pas de gabarits, pas de réinitialisation de mot de
passe fonctionnelle : `0004` prépare où partiraient les messages, elle n'en
envoie aucun.
