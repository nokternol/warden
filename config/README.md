# Config

Runtime configuration directory for databases, logs, and other persistent data.

## Purpose

Store runtime data that should not be in the repository:
- SQLite database files
- Winston log files
- Other runtime-generated files

## Structure

```
config/
  db/             # SQLite database files
    warden.db
  logs/           # Winston log files (JSON + human-readable)
    warden-YYYY-MM-DD.log
    warden-YYYY-MM-DD.json.log
```

## Database

SQLite database location is configured via `DB_PATH` environment variable:

```bash
# Default
DB_PATH=./config/db/warden.db

# Custom location
DB_PATH=/var/lib/warden/data.db

# In-memory (tests only)
DB_PATH=:memory:
```

## Logs

Winston logs are written to `config/logs/` with daily rotation:
- Human-readable: `warden-YYYY-MM-DD.log`
- JSON (machine-readable): `warden-YYYY-MM-DD.json.log`
- Retention: 14 days
- Max size: 20MB per file

## .gitignore

All runtime files in `config/` are ignored by git:

```gitignore
config/db/*.db
config/db/*.sqlite*
config/logs/*.log
```

Only `.gitkeep` files are tracked to preserve directory structure.
