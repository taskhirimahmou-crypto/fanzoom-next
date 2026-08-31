#!/bin/sh
set -eu

: "${PB_SUPERUSER_EMAIL:?PB_SUPERUSER_EMAIL is required}"
: "${PB_SUPERUSER_PASSWORD:?PB_SUPERUSER_PASSWORD is required}"

if ! /pb/pocketbase migrate up --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations; then
  printf '{"timestamp":"%s","level":"error","eventName":"pocketbase_migration_failure","requestId":"pocketbase-startup","route":"/pocketbase/migrations","statusCode":500,"durationMs":0,"feedId":null,"algorithmVersion":null,"errorCode":"migration_up_failed"}\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" >&2
  exit 1
fi

if ! /pb/pocketbase superuser upsert "${PB_SUPERUSER_EMAIL}" "${PB_SUPERUSER_PASSWORD}" --dir=/pb/pb_data; then
  printf '{"timestamp":"%s","level":"error","eventName":"pocketbase_startup_failure","requestId":"pocketbase-startup","route":"/pocketbase/superuser","statusCode":500,"durationMs":0,"feedId":null,"algorithmVersion":null,"errorCode":"superuser_upsert_failed"}\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" >&2
  exit 1
fi

exec /pb/pocketbase serve \
  --http=0.0.0.0:8090 \
  --dir=/pb/pb_data \
  --migrationsDir=/pb/pb_migrations
