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
  docker rm -f "$NAME-id" >/dev/null 2>&1 || true
  docker volume rm -f "$NAME-config" "$NAME-id-config" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# Compose mode runs the repo's compose.yaml unmodified, overriding only the image (the local build
# instead of the published one) and the port (an ephemeral host port instead of 5057).
COMPOSE_DIR="$WORK/compose"
# compose.yaml reads these from the environment, as a user would supply them.
export SESSION_SECRET="$SECRET" TZ="$ZONE"
if [[ "$MODE" == compose ]]; then
  export PUID=1026 PGID=100
  EXPECT_IDENTITY="1026:100"
else
  EXPECT_IDENTITY="1000:1000" # the default when PUID/PGID are unset
fi

# Gives a host directory or named volume an existing db/ folder owned by $2 (uid:gid), from inside a
# throwaway container, because under rootless Docker a host-owned directory appears as root. The
# folder is created so a named volume is non-empty: Docker re-applies the image directory's
# ownership to an empty volume on every mount.
chown_as_root() {
  docker run --rm --user root --entrypoint sh -v "$1:/app/config" "$IMAGE" \
    -c 'mkdir -p /app/config/db && chown "$0" /app/config /app/config/db' "$2"
}

compose() {
  docker compose -p "$NAME" --project-directory "$COMPOSE_DIR" \
    -f "$ROOT/compose.yaml" -f "$COMPOSE_DIR/override.yaml" "$@"
}

start_compose() {
  mkdir -p "$COMPOSE_DIR/config"
  # The config folder belongs to PUID:PGID, as a user's would; the container adapts to it.
  chown_as_root "$COMPOSE_DIR/config" "$PUID:$PGID"
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

# The image optimiser reads images.remotePatterns from next.config.js at runtime. Without that file
# every remote poster is refused with 400 "url" parameter is not allowed. Reachability of the remote
# host does not matter here, only that the URL is permitted.
check_image_optimiser_allows_poster_hosts() {
  local url body
  url="http://127.0.0.1:$(host_port)/_next/image?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw500%2Fx.png&w=640&q=75"
  body="$(curl -s "$url")"
  [[ "$body" != *"not allowed"* ]] || fail "image optimiser refused a TMDB poster URL: $body"
  pass "image optimiser permits configured poster hosts"
}

# Prints "uid:gid" of the node server process in container $1.
app_identity() {
  docker exec "$1" sh -c '
    pid=$(ps -o pid,args | awk "/ node dist\\/server\\/index.js\$/ && !/dumb-init/ {print \$1; exit}")
    uid=$(awk "/^Uid:/ {print \$2}" /proc/$pid/status)
    gid=$(awk "/^Gid:/ {print \$2}" /proc/$pid/status)
    printf "%s:%s" "$uid" "$gid"'
}

# Asserts container $1 runs the server as $2 (uid:gid) and that the files it created in the config
# volume are owned by that identity.
assert_identity_and_ownership() {
  local cid="$1" expected="$2" identity owner
  identity="$(app_identity "$cid")"
  [[ "$identity" == "$expected" ]] || fail "server runs as $identity, expected $expected"
  owner="$(docker exec "$cid" stat -c '%u:%g' /app/config/db/warden.db)" \
    || fail "database file was not created in the config volume"
  [[ "$owner" == "$expected" ]] || fail "database file is owned by $owner, expected $expected"
}

check_runs_as_configured_identity() {
  assert_identity_and_ownership "$CID" "$EXPECT_IDENTITY"
  pass "server runs as $EXPECT_IDENTITY and owns what it writes to the config volume"
}

# Starts a separate container on a volume owned by $2 (uid:gid) with extra docker run flags $3 and
# asserts it adapts to that owner.
check_adapts_to_volume_owner() {
  local label="$1" owner="$2" flags="$3" name="$NAME-id" cid
  docker volume create "$name-config" >/dev/null
  chown_as_root "$name-config" "$owner"
  # shellcheck disable=SC2086 # flags are intentionally word-split
  docker run -d --name "$name" -e SESSION_SECRET="$SECRET" $flags \
    -v "$name-config:/app/config" "$IMAGE" >/dev/null
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) status=""
  while ((SECONDS < deadline)); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name")"
    [[ "$status" == "healthy" ]] && break
    sleep 2
  done
  [[ "$status" == "healthy" ]] || fail "$label: container health is '$status'"
  assert_identity_and_ownership "$name" "$owner"
  docker rm -f "$name" >/dev/null
  docker volume rm -f "$name-config" >/dev/null
  pass "$label"
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

  # A server source edit (unique per run, so an earlier run's cache cannot satisfy it) reuses both dependency installs and the Next.js build.
  echo "// smoke edit $NAME $(date +%s%N)" >>"$CONTEXT/server/index.ts"
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
check_image_optimiser_allows_poster_hosts
check_runs_as_configured_identity
check_honours_tz
check_restart_keeps_data
check_stops_within_budget
if [[ "$MODE" == image ]]; then
  check_adapts_to_volume_owner "PUID/PGID select the runtime identity" "1026:100" "-e PUID=1026 -e PGID=100"
  check_adapts_to_volume_owner "an already non-root container skips the privilege drop" "1234:1234" "--user 1234:1234"
fi
