#!/usr/bin/env bash
#
# Start, stop and inspect the pilot deployment.
#
#   scripts/ops/pilot-stack.sh up      build if needed and start
#   scripts/ops/pilot-stack.sh down    stop and remove the containers
#   scripts/ops/pilot-stack.sh stop    stop writes, leave the containers
#   scripts/ops/pilot-stack.sh ps      what is running
#   scripts/ops/pilot-stack.sh logs    follow the logs
#
# Everything runs with a sanitised environment. Docker Compose interpolates from
# the calling shell *before* --env-file, so a terminal that has sourced
# .env.test would hand the pilot a placeholder secret — which the production
# guard then correctly refuses, leaving an operator staring at a crash loop
# caused by their own shell. Clearing the environment removes the trap rather
# than documenting it.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

if [[ ! -f .env.pilot ]]; then
  echo "✗ .env.pilot is missing. Copy .env.pilot.example, fill it in, and generate" >&2
  echo "  secrets with: openssl rand -base64 48" >&2
  exit 1
fi

command="${1:-ps}"
shift || true

compose() {
  env -i PATH="$PATH" HOME="$HOME" \
    docker compose --env-file .env.pilot -p ffos-pilot -f docker-compose.pilot.yml "$@"
}

case "$command" in
  up)
    compose up -d --build "$@"
    echo
    echo "Waiting for the pilot API…"
    for _ in $(seq 1 60); do
      if curl -fsS http://localhost:3010/health >/dev/null 2>&1; then
        echo "✓ pilot API healthy"
        curl -fsS http://localhost:3010/health
        echo
        exit 0
      fi
      sleep 1
    done
    echo "✗ the pilot API did not become healthy. Its own logs say why:" >&2
    compose logs --tail 20 api >&2
    exit 1
    ;;
  down)   compose down "$@" ;;
  stop)   compose stop "$@" ;;
  start)  compose start "$@" ;;
  ps)     compose ps "$@" ;;
  logs)   compose logs -f "$@" ;;
  *)
    echo "Unknown command: $command" >&2
    echo "Use: up | down | stop | start | ps | logs" >&2
    exit 1
    ;;
esac
