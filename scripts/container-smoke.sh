#!/usr/bin/env bash
# Smoke test for the production image. Builds the image, starts it with a config volume and
# SESSION_SECRET, and asserts the delivery behaviours users depend on.
#
#   scripts/container-smoke.sh            run the image directly
#   scripts/container-smoke.sh --compose  run the same checks through compose.yaml
#   SMOKE_SKIP_BUILD=1 reuses an existing $IMAGE
#   SMOKE_BUILD_FLAGS passes extra flags to `docker build` (e.g. "--network host" where the
#   daemon cannot resolve DNS inside build containers)
set -euo pipefail

IMAGE="${IMAGE:-warden:smoke}"
MODE=image
[[ "${1:-}" == "--compose" ]] && MODE=compose

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
NAME="warden-smoke-$$"
SECRET="smoke-secret-$$"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
STOP_BUDGET_SECONDS=10

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm -f "$NAME-config" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

start_container() {
  docker run -d --name "$NAME" -e SESSION_SECRET="$SECRET" \
    -v "$NAME-config:/app/config" -p 127.0.0.1::5057 "$IMAGE" >/dev/null
}

host_port() { docker port "$NAME" 5057/tcp | head -n1 | sed 's/.*://'; }

health_status() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$NAME"
}

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) status=""
  while ((SECONDS < deadline)); do
    status="$(health_status)"
    [[ "$status" == "healthy" ]] && return 0
    sleep 2
  done
  fail "container health is '$status' after ${HEALTH_TIMEOUT}s"
}

if [[ -z "${SMOKE_SKIP_BUILD:-}" ]]; then
  # shellcheck disable=SC2086 # flags are intentionally word-split
  docker build ${SMOKE_BUILD_FLAGS:-} -t "$IMAGE" "$ROOT"
fi

check_healthy_and_serves_login() {
  wait_healthy
  pass "container reports healthy"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$(host_port)/login")"
  [[ "$code" == "200" ]] || fail "GET /login returned $code"
  pass "login page served"
}

start_container
check_healthy_and_serves_login
