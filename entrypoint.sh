#!/usr/bin/env sh
set -eu

echo "[entrypoint] Starting container for urlshort..."

# Optionally skip migrations (useful for debugging)
if [ "${SKIP_MIGRATIONS:-}" = "1" ]; then
  echo "[entrypoint] SKIP_MIGRATIONS=1 → skipping Prisma migrations"
else
  # Ensure DATABASE_URL is set
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[entrypoint] ERROR: DATABASE_URL is not set. Cannot run Prisma migrations." >&2
    exit 1
  fi

  echo "[entrypoint] Running Prisma migrations (migrate deploy)"

  # Simple retry loop in case DB is not ready yet
  ATTEMPTS=${MIGRATE_RETRIES:-30}
  SLEEP_SECS=${MIGRATE_RETRY_DELAY_SECS:-2}
  i=1
  until [ "$i" -gt "$ATTEMPTS" ]; do
    if command -v prisma >/dev/null 2>&1; then
      if prisma migrate deploy; then
        echo "[entrypoint] Prisma migrations applied."
        break
      fi
    else
      # Fallback to npx if prisma CLI not present
      if npx --yes prisma migrate deploy; then
        echo "[entrypoint] Prisma migrations applied (via npx)."
        break
      fi
    fi

    echo "[entrypoint] Migrate attempt $i/$ATTEMPTS failed; retrying in ${SLEEP_SECS}s..."
    i=$((i+1))
    sleep "$SLEEP_SECS"
  done

  if [ "$i" -gt "$ATTEMPTS" ]; then
    echo "[entrypoint] ERROR: Failed to apply Prisma migrations after $ATTEMPTS attempts." >&2
    exit 1
  fi
fi

echo "[entrypoint] Launching application: $*"
exec "$@"

