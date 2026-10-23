#!/bin/sh
# Database migrations. Runs in the "migrate" service before the backend starts, as the database
# owner (DB_USER), so the backend's own account never needs schema rights.
#
# Applies every sql/migrations/*.sql that has not run yet, in name order, and records it in
# schema_migrations. A migration runs in one transaction (all or nothing) unless its first line is
# "-- migrate:no-transaction". Never edit an applied migration: add a new numbered file instead.
# Afterwards app-user.sql (re)creates the backend's limited account.
set -eu

run() { psql -v ON_ERROR_STOP=1 --quiet "$@"; }

run -c "CREATE TABLE IF NOT EXISTS schema_migrations (
          name       TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"

for file in /sql/migrations/*.sql; do
  name=$(basename "$file")
  # psql variables (:'name' = safely quoted) are only expanded in input, not in -c
  applied=$(echo "SELECT 1 FROM schema_migrations WHERE name = :'name'" | run -tA -v name="$name")
  if [ -n "$applied" ]; then
    continue
  fi

  echo "Applying $name"
  record="INSERT INTO schema_migrations (name) VALUES (:'name')"
  if head -n 1 "$file" | grep -q 'migrate:no-transaction'; then
    run -o /dev/null -f "$file"
    echo "$record" | run -v name="$name"
  else
    # The script and its record commit together ("-f -" reads the INSERT from stdin)
    echo "$record" | run -o /dev/null --single-transaction -v name="$name" -f "$file" -f -
  fi
done

run -f /sql/app-user.sql
echo "Database is up to date"
