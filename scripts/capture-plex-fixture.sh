#!/usr/bin/env bash
# Records real Plex responses as test fixtures, so provider code is tested against the
# shapes a real server returns rather than shapes written by hand.
#
# Read-only: every request is a GET. The token is read from the PLEX_TOKEN environment
# variable (or prompted for), is never written to disk, and is scrubbed from the output.
# Each library listing is capped to a few items to keep fixtures small.
#
# Usage: PLEX_URL=http://host:32400 scripts/capture-plex-fixture.sh
set -euo pipefail

PLEX_URL="${PLEX_URL:?set PLEX_URL, e.g. http://192.168.1.8:32400}"
if [[ -z "${PLEX_TOKEN:-}" ]]; then
  if [[ ! -t 0 ]]; then
    echo "No terminal to prompt for the token: run this in an interactive shell, or set PLEX_TOKEN." >&2
    exit 1
  fi
  read -rsp "Plex token: " PLEX_TOKEN
  echo
fi
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/tests/fixtures/plex"
LIMIT="${LIMIT:-3}"
mkdir -p "$OUT_DIR"

get() {
  curl -fsS -G "$PLEX_URL/$1" \
    -H "Accept: application/json" \
    -H "X-Plex-Token: $PLEX_TOKEN" \
    -H "X-Plex-Container-Start: 0" \
    -H "X-Plex-Container-Size: $LIMIT" \
    "${@:2}"
}

# Removes the token, server and library identifiers, and watch times from a response before
# it is saved. Field names and structure are kept exactly as the server sent them; only these
# values are replaced, with fixed placeholders so re-captures diff cleanly.
scrub() {
  sed -e "s/$PLEX_TOKEN/REDACTED/g" | jq '
    walk(if type == "object" then
      with_entries(
        if (.key | test("^(machineIdentifier|token|accessToken)$")) then .value = "REDACTED"
        elif (.key | test("^(uuid|librarySectionUUID)$")) then .value = "00000000-0000-0000-0000-000000000000"
        elif .key == "lastViewedAt" then .value = 1700000000
        else . end)
    else . end)'
}

get library/sections | scrub > "$OUT_DIR/library-sections.json"
for key in $(jq -r '.MediaContainer.Directory[].key' "$OUT_DIR/library-sections.json"); do
  type=$(jq -r --arg k "$key" '.MediaContainer.Directory[] | select(.key == $k) | .type' "$OUT_DIR/library-sections.json")
  get "library/sections/$key/all" | scrub > "$OUT_DIR/section-$type-all.json"
  get "library/sections/$key/all" --data-urlencode includeGuids=1 | scrub > "$OUT_DIR/section-$type-all-includeGuids.json"
done

echo "Saved to $OUT_DIR:"
ls -1 "$OUT_DIR"
