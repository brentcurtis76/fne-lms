#!/bin/bash
# Fail closed before `npm run dev`: refuse to start unless the Supabase URL that
# Next.js will load in development is a local loopback address.
# See scripts/check-local-supabase.js (escape hatch: GENERA_ALLOW_REMOTE_SUPABASE=1).
set -euo pipefail

exec node "$(dirname "$0")/check-local-supabase.js"
