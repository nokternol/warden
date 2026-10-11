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
CID="$NAME" # container to inspect; compose mode points it at the compose-created container
SECRET="smoke-secret-$$"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
STOP_BUDGET_SECONDS=10
# A zone whose offset is never UTC and has no daylight saving, so the expectation is constant.
ZONE="Asia/Tokyo"
ZONE_OFFSET_MINUTES=-540

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

cleanup() {
  if [[ "$MODE" == compose ]]; then
    compose down -v >/dev/null 2>&1 || true
    # Files the container wrote to the bind mount belong to its mapped uid; remove them as root.
    docker run --rm --user root -v "$COMPOSE_DIR/config:/c" --entrypoint sh "$IMAGE" \
      -c 'rm -rf /c/* /c/.[!.]*' >/dev/null 2>&1 || true
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker rmi -f "$IMAGE-layering" >/dev/null 2>&1 || true
  docker volume rm -f "$NAME-config" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# Compose mode runs the repo's compose.yaml unmodified, overriding only the image (the local build
# instead of the published one) and the port (an ephemeral host port instead of 5057).
COMPOSE_DIR="$WORK/compose"
# compose.yaml reads these from the environment, as a user would supply them.
export SESSION_SECRET="$SECRET" TZ="$ZONE"
compose() {
  docker compose -p "$NAME" --project-directory "$COMPOSE_DIR" \
    -f "$ROOT/compose.yaml" -f "$COMPOSE_DIR/override.yaml" "$@"
}

start_compose() {
  mkdir -p "$COMPOSE_DIR/config"
  # Rootless Docker maps the node user to a subordinate uid, so a bind mount must be world-writable.
  chmod 777 "$COMPOSE_DIR/config"
  cat >"$COMPOSE_DIR/override.yaml" <<YAML
services:
  warden:
    image: $IMAGE
    ports: !override
      - "127.0.0.1::5057"
YAML
  compose up -d >/dev/null
  CID="$(compose ps -q warden)"
}

start_container() {
  if [[ "$MODE" == compose ]]; then start_compose; return; fi
  docker run -d --name "$NAME" -e SESSION_SECRET="$SECRET" -e TZ="$ZONE" \
    -v "$NAME-config:/app/config" -p 127.0.0.1::5057 "$IMAGE" >/dev/null
}

host_port() { docker port "$CID" 5057/tcp | head -n1 | sed 's/.*://'; }

health_status() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CID"
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
  user="$(docker exec "$CID" id -un)"
  [[ "$user" == "node" ]] || fail "container runs as '$user', expected node"
  docker exec "$CID" test -f /app/config/db/warden.db \
    || fail "database file was not created in the config volume"
  pass "runs as node and writes to the config volume"
}

check_honours_tz() {
  local offset
  offset="$(docker exec "$CID" node -e 'process.stdout.write(String(new Date().getTimezoneOffset()))')"
  [[ "$offset" == "$ZONE_OFFSET_MINUTES" ]] \
    || fail "TZ=$ZONE gave offset $offset minutes, expected $ZONE_OFFSET_MINUTES"
  pass "TZ=$ZONE is honoured inside the image"

  # A wall-clock schedule fires at 09:00 in that zone, which is 00:00 UTC for Tokyo.
  local utc_time
  utc_time="$(docker exec "$CID" node -e \
    "const { Cron } = require('croner'); process.stdout.write(new Cron('0 9 * * *').nextRun().toISOString().slice(11, 19))")"
  [[ "$utc_time" == "00:00:00" ]] \
    || fail "croner fired '0 9 * * *' at $utc_time UTC under TZ=$ZONE, expected 00:00:00"
  pass "croner schedules in wall-clock time under TZ=$ZONE"
}

# Runs a libsql statement against the container's database and prints the first column of the
# first row, if any.
db_exec() {
  docker exec "$CID" node -e "
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
  docker restart "$CID" >/dev/null
  wait_healthy
  local kept
  kept="$(db_exec 'SELECT v FROM smoke_marker LIMIT 1')"
  [[ "$kept" == "kept" ]] || fail "data written before restart was not found afterwards"
  pass "restart re-runs migrations and keeps data"
}

check_stops_within_budget() {
  local started=$SECONDS elapsed exit_code
  docker stop -t "$STOP_BUDGET_SECONDS" "$CID" >/dev/null
  elapsed=$((SECONDS - started))
  exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$CID")"
  [[ "$exit_code" == "0" ]] || fail "container was killed (exit $exit_code) instead of stopping gracefully"
  ((elapsed < STOP_BUDGET_SECONDS)) || fail "stop took ${elapsed}s, budget ${STOP_BUDGET_SECONDS}s"
  pass "stops gracefully in ${elapsed}s"
}

# Builds a copy of the build context (tracked and untracked-but-not-ignored files) with plain
# progress output, so a test can edit the copy and read which steps were served from cache.
CONTEXT="$WORK/context"
BUILD_LOG="$WORK/build.log"

snapshot_context() {
  mkdir -p "$CONTEXT"
  (cd "$ROOT" && git ls-files -z --cached --others --exclude-standard \
    | while IFS= read -r -d '' f; do [[ -e "$f" ]] && printf '%s\0' "$f"; done \
    | xargs -0 cp --parents -t "$CONTEXT")
}

build_context() {
  # shellcheck disable=SC2086 # flags are intentionally word-split
  docker build ${SMOKE_BUILD_FLAGS:-} --progress=plain -t "$IMAGE-layering" "$CONTEXT" >"$BUILD_LOG" 2>&1 \
    || { cat "$BUILD_LOG" >&2; fail "build of the context copy failed"; }
}

# True when every build step whose command matches $1 was served from cache.
step_cached() {
  local pattern="$1" ids id found=0
  ids="$(grep -E "^#[0-9]+ \[.*\] RUN .*${pattern}" "$BUILD_LOG" | sed -E 's/^#([0-9]+) .*/\1/')"
  [[ -n "$ids" ]] || fail "no build step matches '$pattern'"
  for id in $ids; do
    found=1
    grep -q "^#$id CACHED" "$BUILD_LOG" || return 1
  done
  ((found))
}

expect_cached() { step_cached "$1" || fail "'$1' was rebuilt: $2"; }
expect_rebuilt() { step_cached "$1" && fail "'$1' was served from cache but its inputs changed"; return 0; }

check_layers_follow_change_boundaries() {
  snapshot_context
  build_context # primes the cache for an unchanged context

  # A server source edit reuses both dependency installs and the Next.js build.
  echo "// smoke edit" >>"$CONTEXT/server/index.ts"
  build_context
  expect_cached "yarn install --frozen-lockfile" "a source edit must not reinstall dependencies"
  expect_cached "yarn build:next" "a server-only edit must not rebuild the Next.js app"
  expect_rebuilt "yarn build:server"
  pass "a server edit reuses dependency and Next.js layers"

  # A change outside every build input reuses every build step.
  mkdir -p "$CONTEXT/docs" && echo "unrelated" >"$CONTEXT/docs/smoke-unrelated.txt"
  echo "unrelated" >"$CONTEXT/LICENSE.smoke"
  build_context
  expect_cached "yarn install --frozen-lockfile" "an unrelated edit must not reinstall dependencies"
  expect_cached "yarn build:next" "an unrelated edit must not rebuild the Next.js app"
  expect_cached "yarn build:server" "an unrelated edit must not rebuild the server"
  pass "an edit outside the build inputs reuses every build step"
}

check_unset_secret_fails_loudly() {
  local output
  if output="$(unset SESSION_SECRET; compose config 2>&1)"; then
    fail "compose.yaml accepted an unset SESSION_SECRET"
  fi
  [[ "$output" == *SESSION_SECRET* ]] || fail "compose error does not name SESSION_SECRET: $output"
  pass "compose.yaml fails loudly without SESSION_SECRET"
}

if [[ "$MODE" == image ]]; then
  check_layers_follow_change_boundaries
else
  mkdir -p "$COMPOSE_DIR"
  printf 'services: {}\n' >"$COMPOSE_DIR/override.yaml"
  check_unset_secret_fails_loudly
fi

start_container
check_healthy_and_serves_login
check_runs_unprivileged_with_writable_volume
check_honours_tz
check_restart_keeps_data
check_stops_within_budget
