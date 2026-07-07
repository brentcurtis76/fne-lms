# CI Setup — Fase 0 (GENERA)

Operating manual for the four-gate CI, the RLS guard, and the two manual steps
that only Brent can perform (branch protection + secrets). Written 2026-07-07.

## The four gates (`.github/workflows/ci.yml`)

| Check name (for branch protection) | What it runs |
|---|---|
| `RLS migration guard` | `scripts/ci/check-rls-migrations.sh` — PR fails if any migration contains `DISABLE ROW LEVEL SECURITY` |
| `Gate 1 — Typecheck` | `npm run type-check` |
| `Gate 2 — Unit (Vitest)` | `npm test` |
| `Gate 3 — RLS pgTAP (supabase test db)` | `supabase db start` + `supabase test db` over `supabase/tests/*.sql` |
| `Gate 4 — E2E smoke (Playwright)` | prod `npm run build` + `tests/e2e/smoke.spec.ts` (chromium) |

E2E runs ONLY the smoke spec until the seeded synthetic tenant exists (Fase 1).
Author-time enforcement of the RLS rule: `scripts/hooks/block-rls-disable.sh`
(Claude Code PreToolUse hook registered in `.claude/settings.json`; self-tested
against Write/Edit/Bash payloads).

## Manual step 1 — Branch protection (requires repo admin)

GitHub → `brentcurtis76/fne-lms` → Settings → Branches → Add branch ruleset/rule for `main`:

1. Require a pull request before merging
2. Require status checks to pass before merging, **require branches up to date**, and select exactly these checks (they appear after the first PR run):
   `RLS migration guard` · `Gate 1 — Typecheck` · `Gate 2 — Unit (Vitest)` · `Gate 3 — RLS pgTAP (supabase test db)` · `Gate 4 — E2E smoke (Playwright)`
3. Block force pushes

Or via CLI:

```bash
gh api -X PUT repos/brentcurtis76/fne-lms/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": [
    "RLS migration guard", "Gate 1 — Typecheck", "Gate 2 — Unit (Vitest)",
    "Gate 3 — RLS pgTAP (supabase test db)", "Gate 4 — E2E smoke (Playwright)" ] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

## Manual step 2 — Secrets (optional for smoke, required later)

Settings → Secrets and variables → Actions: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Without them, Gate 4 builds with placeholders — fine for the smoke spec, not
for authenticated e2e (Fase 1+). Never put production service-role keys in CI;
use the dedicated test project when Fase 1 adds authenticated fixtures.

## Known caveat — pgTAP shadow DB baseline

`supabase db start` rebuilds the schema from `supabase/migrations/`, but this
repo's migrations start at 2026-02 (the schema predates them). If the first CI
run shows migration errors in Gate 3, generate a baseline snapshot **from a
trusted non-production copy** and commit it as the earliest migration:

```bash
supabase db dump --local -f supabase/migrations/00000000000000_baseline.sql
```

Track this in PROJECT_STATE.md → Open decisions until resolved.

## DoD Fase 0 — the world-readable table demo

The committed suite (`supabase/tests/001-rls-enabled.sql`) creates a table
without RLS inside a rolled-back transaction and asserts it is *detected*
(plus asserts the whole `public` schema is clean, empty allowlist). To see the
raw failure live against a local stack:

```bash
supabase db start
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" <<'SQL'
\i supabase/tests/000-setup.sql
create table public.demo_leak(id int);
select tests.rls_enabled('public');
SQL
# Expected:
#   not ok 3 - Todas las tablas del schema public deben tener RLS habilitado
drop: the demo table afterwards (local stack only).
```

Any `not ok` from `rls_enabled` in Gate 3 must be treated as a release blocker.

## First-PR checklist (Brent)

1. `git push origin feat/fase0-ci` (from the Mac; the sandbox has no GitHub credentials)
2. Open PR → watch the five checks execute (this is the DoD "CI runs the four gates on PR")
3. If Gate 3 fails on legacy migrations → apply the baseline procedure above
4. Enable branch protection (Manual step 1) now that check names exist
5. Merge. From here on, every PR needs green gates.
