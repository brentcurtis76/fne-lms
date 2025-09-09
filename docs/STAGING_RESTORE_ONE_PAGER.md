# Staging Restore — Copy/Paste Commands (Safe, Simple)

Use these exact commands to restore your Production backup into your new Staging database. Paste each line as-is in Terminal, one at a time.

Important:
- These commands write ONLY to your Staging database.
- They use the credentials you provided (you can rotate them later).

## Quick Restore (3 commands)

1) Set your Staging URL

```
export STAGING_URL='postgresql://postgres:Oasis4770@db.tawmibvuoepqcndkykfn.supabase.co:5432/postgres?sslmode=require'
```

2) Test the connection (should print version and database name)

```
psql "$STAGING_URL" -c "select version(), current_database();"
```

3) Restore the backup (this may take a few minutes)

```
gunzip -c "$HOME/Downloads/db_cluster-04-09-2025@04-37-32.backup.gz" | psql "$STAGING_URL" -v ON_ERROR_STOP=1
```

## Script Method (one file, then run)

If you prefer running a single command, create this small script and execute it.

Create the file:

```
cat > restore_staging.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail

# Staging DB URL (includes password you provided)
STAGING_URL='postgresql://postgres:Oasis4770@db.tawmibvuoepqcndkykfn.supabase.co:5432/postgres?sslmode=require'

# Path to your downloaded backup
BACKUP_FILE="$HOME/Downloads/db_cluster-04-09-2025@04-37-32.backup.gz"

echo "[check] Using backup: $BACKUP_FILE"
ls -l "$BACKUP_FILE"

echo "[check] Connecting to staging DB..."
psql "$STAGING_URL" -c "select version(), current_database();"

echo "[restore] Restoring backup to staging (this can take a few minutes)..."
gunzip -c "$BACKUP_FILE" | psql "$STAGING_URL" -v ON_ERROR_STOP=1

echo "[done] Restore complete."
SH
```

Run it:

```
chmod +x restore_staging.sh && ./restore_staging.sh
```

Optional cleanup after success:

```
rm restore_staging.sh
```

## Troubleshooting (fast)

- File not found: check the backup path and filename.
- Connection error: re-run step 1 to set `STAGING_URL`, then step 2.
- If you see errors, copy the last 10–20 lines and share them.

## Next (after restore completes)

- In Staging: disable outbound email, rotate the JWT secret, keep the service-role key private.
- Then Claude can run read-only checks (no writes) against Staging only.

