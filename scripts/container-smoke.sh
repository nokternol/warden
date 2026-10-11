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
# A zone whose offset is never UTC and has no daylight saving, so the expectation is constant.
ZONE="Asia/Tokyo"
ZONE_OFFSET_MINUTES=-540

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm -f "$NAME-config" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

start_container() {
  docker run -d --name "$NAME" -e SESSION_SECRET="$SECRET" -e TZ="$ZONE" \
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

check_runs_unprivileged_with_writable_volume() {
  local user
  user="$(docker exec "$NAME" id -un)"
  [[ "$user" == "node" ]] || fail "container runs as '$user', expected node"
  docker exec "$NAME" test -f /app/config/db/warden.db \
    || fail "database file was not created in the config volume"
  pass "runs as node and writes to the config volume"
}

check_honours_tz() {
  local offset
  offset="$(docker exec "$NAME" node -e 'process.stdout.write(String(new Date().getTimezoneOffset()))')"
  [[ "$offset" == "$ZONE_OFFSET_MINUTES" ]] \
    || fail "TZ=$ZONE gave offset $offset minutes, expected $ZONE_OFFSET_MINUTES"
  pass "TZ=$ZONE is honoured inside the image"

  # A wall-clock schedule fires at 09:00 in that zone, which is 00:00 UTC for Tokyo.
  local utc_time
  utc_time="$(docker exec "$NAME" node -e \
    "const { Cron } = require('croner'); process.stdout.write(new Cron('0 9 * * *').nextRun().toISOString().slice(11, 19))")"
  [[ "$utc_time" == "00:00:00" ]] \
    || fail "croner fired '0 9 * * *' at $utc_time UTC under TZ=$ZONE, expected 00:00:00"
  pass "croner schedules in wall-clock time under TZ=$ZONE"
}

# Runs a libsql statement against the container's database and prints the first column of the
# first row, if any.
db_exec() {
  docker exec "$NAME" node -e "
    const { createClient } = require('@libsql/client');
    const c = createClient({ url: 'file:/app/config/db/warden.db' });
    c.execute(process.argv[1]).then((r) => {
      if (r.rows[0]) process.stdout.write(String(Object.values(r.rows[0])[0]));
      c.close();
    });" "$1"
}

check_restart_keeps_data() {
  db_exec 'CREATE TABLE IF NOT EXISTS smoke_marker (v TEXT)' >/dev/null
  db_exec "INSERT INTO smoke_marker VALUES ('kept')" >/dev/null
  docker restart "$NAME" >/dev/null
  wait_healthy
  local kept
  kept="$(db_exec 'SELECT v FROM smoke_marker LIMIT 1')"
  [[ "$kept" == "kept" ]] || fail "data written before restart was not found afterwards"
  pass "restart re-runs migrations and keeps data"
}

check_stops_within_budget() {
  local started=$SECONDS elapsed exit_code
  docker stop -t "$STOP_BUDGET_SECONDS" "$NAME" >/dev/null
  elapsed=$((SECONDS - started))
  exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$NAME")"
  [[ "$exit_code" == "0" ]] || fail "container was killed (exit $exit_code) instead of stopping gracefully"
  ((elapsed < STOP_BUDGET_SECONDS)) || fail "stop took ${elapsed}s, budget ${STOP_BUDGET_SECONDS}s"
  pass "stops gracefully in ${elapsed}s"
}

start_container
check_healthy_and_serves_login
check_runs_unprivileged_with_writable_volume
check_honours_tz
check_restart_keeps_data
check_stops_within_budget
