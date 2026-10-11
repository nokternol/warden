#!/bin/sh
# Runs the container command as the user named by PUID/PGID (default 1000:1000), so files written
# to a mounted config folder belong to whoever owns that folder. The mounted folder is used as
# given and is never re-owned recursively.
#
# A container already started as a non-root user (docker run --user, compose `user:`) skips the
# drop. Either way the command is exec'd (directly, or through su-exec) so it replaces this shell
# and signals reach it.
set -eu

if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

uid="${PUID:-1000}"
gid="${PGID:-1000}"

# A fresh named volume starts root-owned; give the mount point itself (only) to the target user so
# the app can create its db/ and logs/ directories inside it.
if [ "$(stat -c %u /app/config)" = "0" ]; then
  chown "$uid:$gid" /app/config
fi

exec su-exec "$uid:$gid" "$@"
