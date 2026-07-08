#!/usr/bin/env bash
# GENERA hard rule: no migration may disable ROW LEVEL SECURITY (Fase 0 guard).
# Scans ALL migrations (verified 2026-07-07: zero legacy offenders, so strict full scan is safe).
# Companion enforcement at author-time: scripts/hooks/block-rls-disable.sh (Claude Code hook).
set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"
PATTERN='disable[[:space:]]+row[[:space:]]+level[[:space:]]+security'

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "No migrations directory found at $MIGRATIONS_DIR — nothing to check."
  exit 0
fi

matches=$(grep -rniE "$PATTERN" "$MIGRATIONS_DIR" || true)

if [ -n "$matches" ]; then
  echo "::error::FORBIDDEN: migration(s) disable ROW LEVEL SECURITY (GENERA hard rule — see CLAUDE.md)."
  echo "$matches"
  exit 1
fi

echo "OK: no migration disables ROW LEVEL SECURITY."
