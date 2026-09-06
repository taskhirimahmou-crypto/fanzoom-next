#!/bin/sh
set -eu

: "${PB_SUPERUSER_EMAIL:?PB_SUPERUSER_EMAIL is required}"
: "${PB_SUPERUSER_PASSWORD:?PB_SUPERUSER_PASSWORD is required}"

mode="${PB_REHEARSAL_MODE:-legacy}"
migrations_dir="/rehearsal/empty_migrations"
hooks_dir="/rehearsal/empty_hooks"

mkdir -p "$migrations_dir" "$hooks_dir"

if [ "$mode" = "upgraded" ]; then
  : "${VIEW_RATE_LIMIT_SECRET:?VIEW_RATE_LIMIT_SECRET is required in upgraded mode}"
  : "${SHARED_RATE_LIMIT_HOOK_SECRET:?SHARED_RATE_LIMIT_HOOK_SECRET is required in upgraded mode}"
  migrations_dir="/pb/pb_migrations"
  hooks_dir="/pb/pb_hooks"
elif [ "$mode" != "legacy" ]; then
  echo "Unsupported PB_REHEARSAL_MODE: $mode" >&2
  exit 1
fi

/pb/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=/pb/pb_data

exec /pb/pocketbase serve \
  --http=0.0.0.0:8090 \
  --dir=/pb/pb_data \
  --migrationsDir="$migrations_dir" \
  --hooksDir="$hooks_dir"
