#!/bin/sh
# Create the two databases the repository expects on a fresh Postgres volume.
#
# `ffos_dev` is what the running application uses. `ffos_test` is what the test
# suite uses, and nothing else ever writes to it. Keeping them apart is what
# stops a dev API or worker from mutating state a deterministic test is
# asserting on (RT2-005), and the `_dev` / `_test` suffixes are what the
# db:reset guard recognises as disposable (RT2-006).
#
# POSTGRES_DB already created the first one; this only adds the missing ones.
set -eu

for db in ffos_dev ffos_test; do
  if [ "$db" != "${POSTGRES_DB:-}" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
      -c "CREATE DATABASE \"$db\";"
  fi
done
