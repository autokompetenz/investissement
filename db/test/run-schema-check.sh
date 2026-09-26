#!/usr/bin/env bash
# =============================================================================
# Vérifie le schéma sur un vrai PostgreSQL, dans un conteneur jetable.
#
#   ./db/test/run-schema-check.sh
#
# Applique db/migrations/0001_init.sql sur une base vierge, puis exécute
# db/test/schema_check.sql : 27 cas où la base doit refuser, et une
# réconciliation du solde rejoué depuis le grand livre.
#
# Aucune donnée n'est conservée, aucun port n'est laissé ouvert.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="invest-schema-check"
PORT="55432"
IMAGE="docker.io/library/postgres:16-alpine"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "→ démarrage d'un PostgreSQL jetable"
cleanup
docker run -d --rm \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=check \
  -e POSTGRES_DB=invest \
  -p "$PORT:5432" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d invest >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$CONTAINER" pg_isready -U postgres -d invest >/dev/null 2>&1; then
  echo "✗ le conteneur PostgreSQL n'a pas démarré" >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# Rôle applicatif, commun à toutes les bases
#
# Idempotent, et volontairement sans `DROP ROLE` : dès qu'une base lui a accordé
# des droits, le rôle devient dépendant de ces objets et PostgreSQL refuse de le
# supprimer. Un `DROP ROLE IF EXISTS` semble inoffensif et casse tout ce qui
# suit, avec un message qui parle de la mauvaise ligne.
#
# Il est créé avant toute migration, parce que 0005 lui accorde des droits
# d'exécution : l'appliquer sans rôle échoue.
# -----------------------------------------------------------------------------
cat > /tmp/invest_api.sql <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'invest_api') THEN
    CREATE ROLE invest_api LOGIN;
    RAISE NOTICE 'rôle invest_api créé';
  END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO invest_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO invest_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO invest_api;
SQL
docker cp /tmp/invest_api.sql "$CONTAINER:/tmp/invest_api.sql" >/dev/null


echo "→ application de db/migrations/0001_init.sql"
docker cp "$ROOT/db/migrations/0001_init.sql" "$CONTAINER:/tmp/0001.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d invest -q \
  -v ON_ERROR_STOP=1 -f /tmp/0001.sql

echo "→ exécution de db/test/schema_check.sql"
docker cp "$ROOT/db/test/schema_check.sql" "$CONTAINER:/tmp/check.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d invest -q \
  -v ON_ERROR_STOP=1 -f /tmp/check.sql 2>&1 | grep -v '^Emulate Docker CLI'

# -----------------------------------------------------------------------------
# Saisie manuelle
#
# Sur une base neuve : les migrations 0002 et 0003 modifient les politiques et
# les colonnes, et 0001 ne les contient pas encore. Réutiliser la base
# précédent ferait échouer la vérification sur l'état laissé par la précédente.
# -----------------------------------------------------------------------------
echo "→ préparation d'une base dédiée à la saisie manuelle"
cat > /tmp/invest_manual_setup.sql <<'SQL'
DROP DATABASE IF EXISTS invest_manual;
CREATE DATABASE invest_manual;
SQL
docker cp /tmp/invest_manual_setup.sql "$CONTAINER:/tmp/manual_setup.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/manual_setup.sql
for f in 0001_init 0002_rls 0003_manual_assignment; do
  docker cp "$ROOT/db/migrations/$f.sql" "$CONTAINER:/tmp/$(echo "$f" | cut -c1-4).sql" >/dev/null
done
docker exec "$CONTAINER" psql -U postgres -d invest_manual -q -v ON_ERROR_STOP=1 -f /tmp/0001.sql
docker exec "$CONTAINER" psql -U postgres -d invest_manual -q -v ON_ERROR_STOP=1 -f /tmp/0002.sql
docker exec "$CONTAINER" psql -U postgres -d invest_manual -q -v ON_ERROR_STOP=1 -f /tmp/0003.sql

echo "→ exécution de db/test/manual_assignment_check.sql"
docker cp "$ROOT/db/test/manual_assignment_check.sql" "$CONTAINER:/tmp/manual.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d invest_manual -q \
  -v ON_ERROR_STOP=1 -f /tmp/manual.sql 2>&1 | grep -v '^Emulate Docker CLI'

# -----------------------------------------------------------------------------
# File d'envoi
#
# Migration 0004 : elle ajoute des valeurs à un type énuméré, ce qui ne peut pas
# se faire dans un bloc de transaction sur les anciennes versions de PostgreSQL.
# Elle tourne sur une base neuve, à part, pour que la suite reste réexécutable.
# -----------------------------------------------------------------------------
echo "→ préparation d'une base dédiée à la file d'envoi"
cat > /tmp/invest_email_setup.sql <<'SQL'
DROP DATABASE IF EXISTS invest_email;
CREATE DATABASE invest_email;
SQL
docker cp /tmp/invest_email_setup.sql "$CONTAINER:/tmp/email_setup.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/email_setup.sql
docker exec "$CONTAINER" psql -U postgres -d invest_email -q -v ON_ERROR_STOP=1 -f /tmp/invest_api.sql
for f in "$ROOT"/db/migrations/000*.sql; do
  base="$(basename "$f")"
  docker cp "$f" "$CONTAINER:/tmp/$base" >/dev/null
  docker exec "$CONTAINER" psql -U postgres -d invest_email -q \
    -v ON_ERROR_STOP=1 -f "/tmp/$base"
done

echo "→ exécution de db/test/email_outbox_check.sql"
docker cp "$ROOT/db/test/email_outbox_check.sql" "$CONTAINER:/tmp/email.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d invest_email -q \
  -v ON_ERROR_STOP=1 -f /tmp/email.sql 2>&1 | grep -v '^Emulate Docker CLI'

# -----------------------------------------------------------------------------
echo "→ préparation d'une base dédiée aux parcours applicatifs"
cat > /tmp/invest_app_setup.sql <<'SQL'
DROP DATABASE IF EXISTS invest_app;
CREATE DATABASE invest_app;
SQL
docker cp /tmp/invest_app_setup.sql "$CONTAINER:/tmp/app_setup.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/app_setup.sql

for f in 0001_init 0002_rls 0003_manual_assignment 0004_email_outbox; do
  docker cp "$ROOT/db/migrations/$f.sql" "$CONTAINER:/tmp/$(echo "$f" | cut -c1-4).sql" >/dev/null
  docker exec "$CONTAINER" psql -U postgres -d invest_app -q \
    -v ON_ERROR_STOP=1 -f "/tmp/$(echo "$f" | cut -c1-4).sql"
done

# Le rôle doit exister avant 0005, qui lui accorde des droits d'exécution. Le
# créer avant 0001 échouerait, faute de tables sur lesquelles accorder des
# droits ; ne pas le créer du tout ferait échouer 0005.
docker exec "$CONTAINER" psql -U postgres -d invest_app -q \
  -v ON_ERROR_STOP=1 -f /tmp/invest_api.sql

docker cp "$ROOT/db/migrations/0005_ledger_trigger_security.sql" \
  "$CONTAINER:/tmp/0005.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d invest_app -q \
  -v ON_ERROR_STOP=1 -f /tmp/0005.sql

echo "→ exécution de db/test/app_role_flow_check.sql"
docker cp "$ROOT/db/test/app_role_flow_check.sql" "$CONTAINER:/tmp/appflow.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d invest_app -q \
  -v ON_ERROR_STOP=1 -f /tmp/appflow.sql 2>&1 | grep -v '^Emulate Docker CLI'

echo ""
# Le RLS se teste sur une base neuve, pas sur celle du schéma : les deux
# fichiers utilisent les mêmes adresses de test, et les mélanger ferait échouer
# la seconde vérification sur les données de la première.
echo "→ préparation d'une base dédiée au cloisonnement"
# Un fichier plutôt qu'un heredoc : `docker exec` ne relaie stdin que si on lui
# passe -i, et un rôle se crée hors de toute transaction.
cat > /tmp/invest_rls_setup.sql <<'SQL'
DROP DATABASE IF EXISTS invest_rls;
CREATE DATABASE invest_rls;
SQL
docker cp /tmp/invest_rls_setup.sql "$CONTAINER:/tmp/setup.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/setup.sql
docker exec "$CONTAINER" psql -U postgres -d invest_rls -q -v ON_ERROR_STOP=1 -f /tmp/0001.sql
docker exec "$CONTAINER" psql -U postgres -d invest_rls -q -v ON_ERROR_STOP=1 -f /tmp/invest_api.sql

echo "→ application de db/migrations/0002_rls.sql"
docker cp "$ROOT/db/migrations/0002_rls.sql" "$CONTAINER:/tmp/0002.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d invest_rls -q \
  -v ON_ERROR_STOP=1 -f /tmp/0002.sql

echo "→ exécution de db/test/rls_check.sql"
docker cp "$ROOT/db/test/rls_check.sql" "$CONTAINER:/tmp/rls.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d invest_rls -q \
  -v ON_ERROR_STOP=1 -f /tmp/rls.sql 2>&1 | grep -v '^Emulate Docker CLI'

# -----------------------------------------------------------------------------
# Le jeu de démonstration
#
# Il tourne sur une troisième base, après RLS, dans les conditions réelles : le
# propriétaire écrit, et le rôle de service ne voit que ce qui le concerne. C'est
# la seule façon de vérifier que le seed produit un jeu cohérent — et pas un
# jeu qui n'existerait que parce qu'il a été écrit avec des droits de
# propriétaire.
# -----------------------------------------------------------------------------
echo "→ préparation d'une base dédiée au jeu de démonstration"
cat > /tmp/invest_seed_setup.sql <<'SQL'
DROP DATABASE IF EXISTS invest_seed;
CREATE DATABASE invest_seed;
SQL
docker cp /tmp/invest_seed_setup.sql "$CONTAINER:/tmp/seed_setup.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/seed_setup.sql
docker exec "$CONTAINER" psql -U postgres -d invest_seed -q -v ON_ERROR_STOP=1 -f /tmp/0001.sql
docker exec "$CONTAINER" psql -U postgres -d invest_seed -q -v ON_ERROR_STOP=1 -f /tmp/0002.sql
docker exec "$CONTAINER" psql -U postgres -d invest_seed -q -v ON_ERROR_STOP=1 -f /tmp/0003.sql
docker exec "$CONTAINER" psql -U postgres -d invest_seed -q -v ON_ERROR_STOP=1 -f /tmp/0004_email_outbox.sql

echo "→ exécution de db/seed.sql"
docker cp "$ROOT/db/seed.sql" "$CONTAINER:/tmp/seed.sql" >/dev/null
docker exec "$CONTAINER" psql -U postgres -d invest_seed -q \
  -v ON_ERROR_STOP=1 -f /tmp/seed.sql 2>&1 | grep -v '^Emulate Docker CLI'

echo "→ le jeu est-il reproductible ? (second passage)"
docker exec "$CONTAINER" psql -U postgres -d invest_seed -q \
  -v ON_ERROR_STOP=1 -f /tmp/seed.sql >/dev/null 2>&1
docker exec "$CONTAINER" psql -U postgres -d invest_seed -t -A -F' ' -c "
  SELECT 'lignes du grand livre apres deux passages : ' || count(*)
  FROM transactions;
  SELECT 'deposits : ' || count(*) FROM deposits;
  SELECT 'investissements : ' || count(*) FROM investments;
  SELECT 'comptes : ' || count(*) FROM users;
" 2>&1 | grep -v '^Emulate Docker CLI'

echo ""
echo "✓ le schéma tient, il ne fuit pas, et le jeu de démonstration est reproductible"
