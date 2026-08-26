#!/bin/sh
set -eu

if [ "${FANZOOM_LOCAL_DOCKER:-}" = "true" ]; then
  : "${FANZOOM_LOCAL_PB_PORT:?FANZOOM_LOCAL_PB_PORT is required}"
  case "${NEXT_PUBLIC_POCKETBASE_URL:-}" in
    "http://127.0.0.1:${FANZOOM_LOCAL_PB_PORT}"|"http://localhost:${FANZOOM_LOCAL_PB_PORT}") ;;
    *)
      echo "Refusing to start local Docker with a non-local public PocketBase URL." >&2
      exit 1
      ;;
  esac

  if [ "${POCKETBASE_INTERNAL_URL:-}" != "http://pocketbase:8090" ]; then
    echo "Refusing to start local Docker with a non-local internal PocketBase URL." >&2
    exit 1
  fi
fi

exec "$@"
