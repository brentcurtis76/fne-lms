# CI setup — GENERA

The workflow in `.github/workflows/ci.yml` publishes seven status contexts.
These names are exact and are the values branch protection must require.

| Required check | Evidence |
| --- | --- |
| `Migration safety guard` | Blocks RLS disable plus destructive `DROP`, `TRUNCATE`, and destructive `ALTER` migrations. |
| `Browser/server boundary guard` | AST/import-graph default deny for browser password writes and raw Supabase admin auth primitives. |
| `Gate 1 — Typecheck` | `npm run type-check` |
| `Gate 1b — Lint` | `npm run lint` with zero warnings |
| `Gate 2 — Unit (Vitest)` | `npm test` |
| `Gate 3 — RLS pgTAP (supabase test db)` | Fresh local database, all pgTAP suites, real Zoom queue concurrency, and real recovery cooldown/lease concurrency. |
| `Gate 4 — E2E (Playwright on seeded local Supabase)` | Production build and the mandatory Playwright manifest against an ephemeral seeded stack; the skip guard fails if a mandatory spec did not run. |

The workflow is the source of truth. When a job `name:` changes, update this
document and the live branch rule together.

## Branch protection — PENDING EXTERNAL

Live GitHub settings were not queried or changed during the remediation. A
repository administrator must verify this after the branch workflow has run at
least once:

1. GitHub → repository settings → Branches/rulesets → rule for `main`.
2. Require a pull request and require branches to be up to date.
3. Require all seven exact contexts in the table above.
4. Block force pushes and branch deletion.

Equivalent CLI request (run by a repository administrator, not by this branch):

```bash
gh api -X PUT repos/brentcurtis76/fne-lms/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Migration safety guard",
      "Browser/server boundary guard",
      "Gate 1 — Typecheck",
      "Gate 1b — Lint",
      "Gate 2 — Unit (Vitest)",
      "Gate 3 — RLS pgTAP (supabase test db)",
      "Gate 4 — E2E (Playwright on seeded local Supabase)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Do not mark this step complete from a workflow-file review. It is complete only
after a read-only GitHub settings check shows those seven live contexts.

## Gate details

Gate 3 starts local Postgres, applies all migrations, and runs
`supabase test db`. It then opens separate SQL sessions for two concurrency
proofs:

- `npm run test:queue`: overlapping Zoom tick workers partition jobs via
  `FOR UPDATE SKIP LOCKED`.
- `npm run test:recovery-concurrency`: simultaneous recovery requests from
  different IPs create one account job, two outbox workers claim once, and two
  password workers obtain one grant lease.

Gate 4 creates `.env.local` from the ephemeral Supabase stack, sets only
synthetic cron configuration, builds after the `NEXT_PUBLIC_*` values exist,
seeds synthetic fixtures, runs every path printed by
`node scripts/ci/e2e-mandatory.mjs --list`, and checks
`test-results/e2e-results.json` for skipped mandatory specs.

No production Supabase or Vercel credentials belong in CI. The runner stack and
all account data are ephemeral and synthetic.

## Local parity

Before reporting this remediation complete, run:

```bash
npm run type-check
npm run lint
npm test
npm run build
npm run guard:migrations
npm run guard:browser
npm run test:db
npm run test:recovery-concurrency
npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list)
node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json
git diff --check
```

The database/concurrency commands require the local Supabase Docker stack. The
Playwright command uses the repository's configured local web server and must
never be pointed at production.
