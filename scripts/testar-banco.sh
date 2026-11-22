#!/usr/bin/env bash
# Valida migrations, seed e regras de RLS num Postgres local descartável.
# Uso: pnpm test:db   (precisa de um Postgres 15+ local; PGUSER/PGHOST opcionais)
set -euo pipefail

cd "$(dirname "$0")/.."

BANCO="licitacao_teste_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

createdb "$BANCO"
trap 'dropdb --if-exists "$BANCO"' EXIT

"${PSQL[@]}" -d "$BANCO" -f supabase/tests/shim_supabase.sql
for arquivo in supabase/migrations/*.sql; do
  echo "migration: $arquivo"
  "${PSQL[@]}" -d "$BANCO" -f "$arquivo"
done
echo "seed: supabase/seed.sql"
"${PSQL[@]}" -d "$BANCO" -f supabase/seed.sql
# Aplicar o seed duas vezes não pode duplicar nada.
"${PSQL[@]}" -d "$BANCO" -f supabase/seed.sql

for teste in supabase/tests/rls_*.sql; do
  echo "teste: $teste"
  "${PSQL[@]}" -d "$BANCO" -1 -o /dev/null -f "$teste" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
done

echo "Banco OK."
