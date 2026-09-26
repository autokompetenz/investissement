# Plateforme d'investissement

Frontend React de la plateforme d'investissement décrite dans `cahier-des-charges.txt`.
Construit sur le template TailAdmin React (React 19, TypeScript, Vite, Tailwind v4).

## Démarrer

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc + build Vite
npm run lint
npm test         # tests du domaine (node:test, aucune dépendance)
```

Node 22.6 ou plus récent est requis : en dessous, `npm test` compile les tests
avec le TypeScript du projet puis les exécute, ce qui reste possible mais plus
lent.

> Si `npm` n'est pas installé sur la machine, `corepack pnpm install` fonctionne aussi.

## Base de données

Le schéma PostgreSQL est dans [`db/`](db/README.md), écrit pour Neon. Il est
indépendant du front : l'application parle aujourd'hui à une couche de services
simulée, et ce dépôt décrit la base sur laquelle elle s'appuiera.

```bash
# Vérifier tout : schéma, saisie manuelle, file d'envoi, cloisonnement,
# parcours avec les droits de l'application. 90 contrôles, conteneur jetable.
./db/test/run-schema-check.sh

# Appliquer sur Neon : un seul fichier, à coller dans l'éditeur SQL
# (db/neon-setup.sql est généré, ne pas l'éditer à la main)
psql "$DATABASE_URL" -f db/neon-setup.sql
```

**L'application ne lit pas encore la base.** `src/services/` travaille en
localStorage et aucun fichier n'appelle `import.meta.env`. Le schéma est en
place et vérifié, la bascule ne l'est pas. Voir les limites connues.

## Comptes de démonstration

Les données vivent dans `localStorage` via la couche de services mock.
Les comptes ci-dessous sont créés au premier chargement.

| Rôle   | Email             | Mot de passe |
| ------ | ----------------- | ------------ |
| Client | client@invest.ma  | Client123!   |
| Admin  | admin@invest.ma   | Admin123!    |

Les autres comptes (`omar@`, `sara@`, `karim@`, `nadia@`, `hicham@`, `leila@` avec `Client123!`)
couvrent les statuts `PENDING`, `REJECTED` et `SUSPENDED` pour tester le portail de vérification.

Pour repartir du jeu de données initial : effacer les clés `invest.*` du `localStorage`.

## État d'avancement

Le cahier des charges est découpé en 6 phases (§25). L'avancement suit cet ordre.

### Phase 1 — livrée

- Authentification : connexion, inscription en 6 étapes, mot de passe oublié, session persistante
- Espaces séparés par rôle : `CLIENT` et `ADMIN` / `SUPER_ADMIN`, redirection selon le rôle
- Portail de vérification : un compte `PENDING` voit son avancement au lieu du dashboard
- Dashboard client : solde, total investi, dépôts, retraits, dernières transactions, actions rapides
- Dashboard admin : statistiques de la plateforme, journal d'activité
- Gestion des utilisateurs : recherche, filtres statut/rôle, revue de dossier KYC
- Actions admin sensibles : valider, rejeter, suspendre, réactiver, demander des informations,
  approuver un document, ajouter une note interne — chaque action est journalisée
- Profil client : informations personnelles, documents KYC
- Internationalisation `en` / `fr`

### Phase 2 — livrée

- **Upload KYC** : 5 documents (CIN, passeport, permis, justificatif de domicile, selfie),
  PDF/JPG/PNG/WEBP, 2 Mo max par fichier, contrôle du type MIME et de la taille.
  Le contenu est stocké en base64 dans une clé `localStorage` dédiée, séparé de la
  fiche utilisateur. Remplacer un document déjà revu le remet en `PENDING`.
- **Revue KYC côté admin** : ouverture du document dans la modale de dossier,
  note de revue, approbation / demande d'informations / rejet.
- **IBAN** : l'admin attribue un IBAN par client et par devise, validation mod 97
  (ISO 7064) contre les fautes de saisie, bouton de copie, blocage/activation.
  Un seul compte actif par devise : le précédent passe en `BLOCKED`, il n'est pas supprimé.
- **Adresses crypto** : 4 réseaux (BTC, ETH, USDT TRC20, USDT ERC20), validation du format
  par réseau, refus des doublons, avertissement réseau obligatoire côté client.
- **Suivi blockchain** : hash/TxID, montant, confirmations, seuil requis par réseau,
  statuts `DETECTED` / `CONFIRMING` / `CONFIRMED` / `REJECTED`, confirmation ou refus par l'admin.

Nouvelles pages : `client/wallet`, `admin/bank-accounts`, `admin/crypto-addresses`.

### Phase 3 — livrée

- **Produits d'investissement** : nom, description, montant min/max, durée, secteur,
  niveau de risque, conditions, documents, risques. Création, publication, clôture des
  souscriptions et archivage côté admin.
- **Parcours de souscription** : liste des opportunités → fiche détaillée (conditions,
  documents, risques) → montant → récapitulatif → acceptation des conditions → confirmation.
  L'inscription crée une opération `PENDING_PAYMENT` avec ses instructions de paiement.
- **Flux de paiement (§8)** : en attente de paiement → le client déclare → vérification admin
  → actif. La déclaration ne crédite rien et n'active rien : seul l'admin vérifie.
  Un paiement refusé repasse en attente pour que le client puisse réessayer, et le refus
  reste dans le journal.
- **Augmentation d'investissement (§7)** : opération `INVESTMENT_TOPUP` liée à
  l'investissement d'origine. Le montant initial n'est jamais réécrit, chaque ajout est
  daté et référencé, le total est la somme des deux.
- **Statuts** : `PENDING_PAYMENT`, `PAYMENT_REVIEW`, `ACTIVE`, `MATURED`, `CANCELLED`
  appliqués par le service, avec les transitions contrôlées.
- **Espace admin** : revue des paiements, passage en `MATURED`, annulation, gestion
  des opportunités.

Nouvelles pages : `client/investments`, `client/investments/my`,
`client/investments/product/:id`, `client/investments/position/:id`,
`client/investments/topup/:id`, `admin/investments`, `admin/products`.

### Phase 4 — livrée

- **Dépôts (§11)** : demande par virement ou crypto, avec référence de paiement à
  reporter. Le client peut déclarer sa preuve de paiement (identifiant de virement ou
  TxID) après envoi, ou la fournir dès la demande. Exige un IBAN actif ou une adresse
  crypto active.
- **Retraits (§12)** : demande avec méthode, destination (IBAN ou adresse) et
  informations complémentaires. Le montant est plafonné par le solde disponible
  **moins** ce qu'une demande en attente a déjà bloqué, ce qui empêche de dépenser
  deux fois la même somme.
- **Le grand livre (§15)** : une table `transactions` en ajout seul. Chaque mouvement
  écrit une ligne ; une correction est une nouvelle ligne, jamais une édition. Les
  montants sont positifs, le sens est porté par `type`.
- **Solde dérivé du grand livre** : `getBalance` rejoue les lignes selon ce qui est
  réglé par type (`DEPOSIT` confirmé, `WITHDRAWAL`/`INVESTMENT` terminés). Un composant
  n'additionne ni ne soustrait jamais un montant.
- **Notifications (§21)** : dépôt confirmé, retrait terminé, demande de retrait
  enregistrée. Déduplication des événements non lus pour ne pas noyer la liste.
- **Espaces admin** : confirmation/refus des dépôts, cycle complet des retraits,
  grand livre transverse avec filtres.

Nouvelles pages : `client/deposits`, `client/withdrawals`, `client/transactions`,
`admin/deposits`, `admin/withdrawals`, `admin/transactions`.

#### Quand l'argent bouge

C'est le point le plus sensible de la phase, et il est encodé dans les services :

| Événement | Effet sur le solde |
| --------- | ------------------ |
| Demande de dépôt | rien |
| Déclaration de la preuve | rien |
| **Dépôt confirmé par l'admin** | **entrée** (`DEPOSIT` / `CONFIRMED`) |
| Demande de retrait | rien, mais la somme est réservée |
| Retrait approuvé / en traitement | rien de plus, toujours réservé |
| **Retrait terminé par l'admin** | **sortie** (`WITHDRAWAL` / `COMPLETED`) |

Un dépôt confirmé deux fois est refusé (`depositAlreadyConfirmed`) : la ligne du
grand livre ne peut pas être écrite en double.

#### Cycle de vie d'un retrait

```
PENDING → UNDER_REVIEW → APPROVED → PROCESSING → COMPLETED
   ↓          ↓             ↓            ↓
REJECTED / CANCELLED   (transitions autorisées uniquement)
```

La table de transitions est dans `services/withdrawals.ts` : toute autre combinaison
est refusée (`invalidTransition`). Terminer un retrait exige la référence de la
transaction réelle, sans quoi l'action est bloquée.

### Phase 5 — livrée

- **Prêts (§9)** : demande (montant, durée, motif, informations complémentaires).
  Le client ne voit aucun taux avant la décision : les conditions d'un prêt font
  partie de l'approbation.
- **Approbation** : l'administration fixe le montant accordé, la durée, le taux
  nominal et les conditions. L'échéancier est construit à ce moment, jamais avant.
  Un calendrier qui ne s'additionne pas exactement est un défaut, pas un arrondi :
  la dernière échéance absorbe le résidu.
- **Décaissement** : c'est le seul moment où l'argent arrive. Une approbation
  seule ne déplace aucun montant. La référence du virement réel est obligatoire.
- **Cycle** : `PENDING → UNDER_REVIEW → APPROVED → ACTIVE → CLOSED`, avec refus
  possible à chaque étape de revue. Le prêt se solde quand toutes les échéances
  sont payées.
- **Cartes (§10)** : 4 produits (Visa/Mastercard, Standard/Premium), demande,
  approbation, refus, attribution, activation, blocage et déblocage.
- **Aucun numéro de carte n'existe dans l'application** : seuls les quatre
  derniers chiffres, la référence émetteur et l'expiration sont conservés. Le
  formulaire d'attribution refuse tout numéro complet, par conception.
- **Espace admin** : revue des demandes de prêt, approbation avec conditions,
  décaissement ; traitement des demandes de carte, attribution, blocage.

Nouvelles pages : `client/loans`, `client/cards`, `admin/loans`, `admin/cards`.

#### Un prêt est une entrée, pas une sortie

Le grand livre classe `LOAN` comme une **entrée**, écrite au décaissement : c'est
de l'argent qui arrive chez le client. Ce que le client rend est une échéance,
suivie sur l'échéancier du prêt, pas une seconde ligne. Un client qui emprunte
100 000 voit donc son disponible augmenter de 100 000 au décaissement, et cet
montant est de nouveau réservé par le capital restant dû.

### Phase 6 — livrée

- **Second facteur (TOTP, RFC 6238)** sur les comptes d'administration (§20).
  Implémentation réelle : HMAC-SHA1 via WebCrypto, base32, fenêtre de tolérance
  d'un pas, comparaison à temps constant. Vérifiée contre les vecteurs de test
  de l'annexe B de la RFC.
- **Challenge à deux temps** : le mot de passe correct ne crée **aucune** session.
  Un challenge à durée de vie de 5 minutes est émis, consommé à l'usage, et la
  session n'existe qu'après le code.
- **Codes de secours** à usage unique, scopés à l'utilisateur pour qu'un code
  d'un autre compte ne puisse pas être dépensé.
- **Activation en trois temps** : le facteur n'est actif qu'après confirmation
  d'un code, sinon un administrateur pourrait se verrouiller avec un secret
  qu'il n'a pas stocké.
- **Limitation de débit et verrouillage** (§20) sur connexion, inscription,
  second facteur, réinitialisation et dépôt de documents. Deux protections
  distinctes parce qu'elles arrêtent deux attaques différentes : le limiteur
  arrête un tir de barrage, le verrouillage arrête une attaque lente.
- **Sessions durcies** : expiration absolue de 8 h, expiration par inactivité
  de 1 h, révocation à la déconnexion, au changement de mot de passe et par
  l'administration. La session n'est créée qu'après le second facteur.
- **Journal de sécurité** (§22) : connexions, échecs, blocages, changements de
  facteur, révocations.
- **Page Sécurité** de l'administration : état du second facteur par compte,
  sessions actives, utilisation des limites, journal.
- **Tests** : 36 tests sur `node:test`, sans dépendance ajoutée. Ils couvrent
  les vecteurs RFC du TOTP, l'exactitude de l'échéancier d'un prêt, la
  limitation de débit, les règles de l'inscription et les validateurs IBAN et
  crypto.

```bash
npm test          # compile puis exécute les tests
```

## Limites connues de la phase 6

Le mot de passe, le jeton de session et le rate limiter restent des simulacres.
`SECURITY.md` détaille ce qui est réellement protégé et ce qui doit basculer
côté serveur. En résumé : le second facteur et les règles de transition sont
réels, le stockage des secrets ne l'est pas.

## Limites connues de la phase 2

Ces points sont des limites assumées du mock, à traiter avec le vrai backend :

- **Stockage des fichiers en base64 dans `localStorage`** : le quota du navigateur
  est d'environ 5 Mo au total. Plusieurs documents volumineux saturent le stockage
  et l'écriture échoue silencieusement côté `writeJson`. En production, les fichiers
  vont dans un stockage objet (S3, Supabase Storage) et l'API renvoie une URL
  signée à durée de vie courte, jamais un lien public.
- **L'admin saisit les confirmations blockchain à la main** : utile pour la démo,
  faux en production. Le vrai système observe la chaîne et calcule les confirmations
  seul, de façon idempotente. Un hash déclaré par un client ne prouve rien.
- **Validation IBAN = contrôle de format uniquement** : la clé mod 97 détecte une
  faute de frappe, elle ne prouve pas que le compte existe. Il faut confirmer
  l'IBAN auprès de la banque partenaire avant de l'afficher comme utilisable.
- **Aucun contrôle de solde avant souscription** : la version mock vérifie le statut du
  compte, les bornes du produit et l'existence d'un IBAN actif, mais pas la capacité
  de paiement. Dans la vraie plateforme, le paiement part d'un solde disponible et le
  serveur refuse l'opération si les fonds manquent (§17). C'est aussi le serveur qui
  débite le compte à la vérification du paiement, jamais le navigateur.

## Rendements et mentions (§24)

Un taux n'est présenté comme contractuel que si le produit déclare
`rateGuaranteed: true`, ce qui suppose un engagement juridique réel. Partout
ailleurs l'interface affiche « indicatif » avec l'avertissement correspondant,
et `projectedReturn` vaut zéro : un rendement non garanti n'est jamais converti
en montant espéré. Le même traitement s'applique dans le formulaire de
souscription et sur les cartes de position.

## Cycle de vie d'un investissement

```
PENDING_PAYMENT   créée, instructions de paiement envoyées
   ↓  « j'ai effectué le paiement » (client)
PAYMENT_REVIEW    déclarée, en attente de vérification
   ↓  vérification admin
ACTIVE            actif, entre dans le total investi, avec sa date d'échéance
   ↓
MATURED           échu

PAYMENT_REVIEW ── refus admin ──→ PENDING_PAYMENT (nouvel essai possible)
```

Une transition directe vers `ACTIVE` sans paiement vérifié est refusée par le
service, et `MATURED` n'est accepté que depuis `ACTIVE`.

## Architecture

```
src/
├── components/
│   ├── admin/       # dashboard admin, table users, modale de revue
│   ├── auth/        # formulaires, inscription en étapes, garde de rôle, portail KYC
│   ├── client/      # dashboard client, profil, documents
│   ├── common/      # StatCard, EmptyState, PageLoader, métadonnées
│   ├── form/        # primitives de formulaire du template
│   ├── header/      # notifications, menu utilisateur
│   └── ui/          # primitives (button, table, modal, badge, dropdown…)
├── context/         # AuthContext, LanguageContext, SidebarContext, ThemeContext
├── hooks/
├── i18n/            # bootstrap i18next + liste des langues
├── icons/
├── layout/          # AppLayout, AppSidebar, AppHeader
├── locales/         # en/common.json, fr/common.json
├── mocks/           # jeu de données de démonstration
├── components/
│   ├── cards/       # mes cartes, demandes, panneau admin
│   ├── finance/     # dépôts, retraits, grand livre, tables admin
│   ├── investments/ # cartes produit, souscription, paiement, top-up, tables admin
│   ├── loans/       # formulaire de demande, échéancier, panneau admin
├── pages/
│   ├── Admin/       # Dashboard, Users, Investments, Products, BankAccounts,
│   │                # CryptoAddresses, Deposits, Withdrawals, Transactions,
│   │                # Loans, Cards
│   ├── AuthPages/   # SignIn, SignUp, ForgotPassword
│   ├── Client/      # Dashboard, Profile, Wallet, Investments, InvestmentDetails,
│   │                # MyInvestments, InvestmentPosition, InvestmentTopup,
│   │                # Deposits, Withdrawals, Transactions, Loans, Cards
│   └── OtherPage/   # NotFound
├── mocks/           # jeux de données de démonstration (users, investments,
│                    # finance, credit)
├── services/        # couche d'accès aux données, mockée
│   │                # api, auth, totp, rateLimit, security, users, kyc,
│   │                # bankAccounts, crypto, investments, deposits,
│   │                # withdrawals, loans, cards, ledger, dashboard
├── types/           # types du domaine
├── utils/           # routes, formatage, erreurs
tests/               # tests du domaine (node:test)
scripts/             # runner de tests
```

`SECURITY.md` décrit ce qui est réellement protégé et ce qui reste un
simulacre. À lire avant toute mise en production.

### Règle de conception

`src/services/` est la seule couche qui touche aux données. Elle simule aujourd'hui un backend
en `localStorage`, mais chaque fonction est écrite pour être remplacée par un appel REST sans
modifier les composants (§17).

**Le frontend ne calcule et ne modifie jamais un solde ni un statut financier.** Dès que le backend
existe, ces opérations doivent être calculées, validées et journalisées côté serveur. Le code mock
actuel ne doit pas servir de référence pour la logique métier.

Les IBAN, numéros de carte et adresses crypto ne doivent jamais être fabriqués par
l'application : ils proviennent d'un établissement partenaire autorisé (§4, §10, §24).

## Points réglementaires

Avant toute mise en production (§24) : licences et agréments, pays couverts, partenaires
bancaires / paiement / crypto, procédures KYC/AML, protection des données, conditions
contractuelles. Les rendements affichés ne doivent pas être présentés comme garantis s'ils ne le
sont pas juridiquement.

Trois règles que le code applique volontairement, et qu'il ne faut pas « simplifier » :

- **Aucun numéro de carte** n'est stocké ni généré. Les cartes viennent d'un prestataire
  habilité ; l'application ne conserve que les quatre derniers chiffres et une référence
  émetteur (§10).
- **Aucun IBAN** n'est fabriqué. Les IBAN sont saisis par l'administration, et la clé de
  contrôle ISO 7064 (mod 97) les vérifie à l'écriture. Elle attrape une faute de frappe —
  deux chiffres inversés, un chiffre sauté — et **pas** un IBAN réel recopié depuis le
  mauvais dossier : seul l'établissement qui le détient peut répondre à cela (§4).
- **Les conditions d'un prêt** sont fixées par l'administration au moment de l'approbation et
  doivent respecter le cadre juridique applicable. L'interface affiche un avertissement avant
  d'approuver : cette validation est juridique, pas technique (§9).

La connexion de portefeuille (§27) n'est pas implémentée. Elle devra utiliser WalletConnect ou une
méthode officielle Trust Wallet, ne jamais demander de seed phrase ni de clé privée, et passer par
une signature de message pour prouver la propriété de l'adresse.

### Ce que la base sait faire, et que le front ne peut pas

Trois règles sont appliquées **par la base**, donc contournables ni par le
navigateur ni par une requête mal construite :

- **Le grand livre est en ajout seul.** `transactions` refuse `UPDATE` et
  `DELETE`. Une correction est une nouvelle ligne, jamais une édition.
- **Un solde n'est pas stocké.** `client_balances` est une vue : il se rejoue,
  il ne se désynchronise pas.
- **Un déclencheur ne calcule rien à partir de ce que le client lui envoie.** Il
  recopie la ligne qu'il déclenche, et rien d'autre.

Et un fait d'architecture qu'il faut connaître avant d'écrire le contrôle
d'inscription : **un compte qui vient d'être créé ne peut pas relire sa propre
ligne.** `INSERT … RETURNING` est refusé, un `SELECT` aussi. Le serveur doit
produire l'uuid du compte avant l'insertion. Voir `db/README.md`.
