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

## Action-runtime maintenance

`CI-MAINT-01` was authorized by Brent on 2026-08-29 after PR #62 and its
post-merge run emitted GitHub's Node 20 action-runtime deprecation annotation.
The task is implemented on branch `ci/actions-node24` from base
`060703071399e035c3ba124971b21b11f2b0275e`; it is not merged until independent
review, a pull request, and all seven live CI jobs pass.

The workflow keeps two different Node concepts explicit:

- GitHub Action implementations use supported Node 24 releases:
  `actions/checkout@v7`, `actions/setup-node@v7`, and
  `actions/upload-artifact@v7`. `supabase/setup-cli@v3` is composite and uses
  its reviewed current installation path. These major lines were the official
  current releases when this task was scoped: checkout 7.0.1, setup-node 7.0.0,
  upload-artifact 7.0.1, and setup-cli 3.0.0.
- GENERA commands run on Node 22 in every job. This is the `node-version`
  selected by setup-node and is independent of the action implementation's
  own Node 24 runtime.

Both Supabase jobs pin CLI `2.110.0`. Gate 4 already required that exact
version because it names excluded services; Gate 3 previously selected
`latest`, allowing an unrelated CLI release to change a pull-request gate.
`setup-cli@v3` installs fixed versions from npm, and `2.110.0` was confirmed
present before the workflow change.

`npm run guard:actions` scans every YAML file under `.github/workflows` and
fails when:

- a reviewed action falls below its minimum supported major;
- a workflow selects Node 20;
- a new external action appears without being added deliberately to the
  reviewed policy; or
- one of the four reviewed action families disappears without a policy update.

The guard is itself part of `Migration safety guard`, and its Vitest negative
controls prove all four retired refs and the common Node-20 version and LTS
alias spellings fail.
Completing `CI-MAINT-01` requires a PR run with the same seven exact context
names, all seven successful, and no Node 20 action-runtime annotation. Product
code, migrations, Supabase production, Vercel configuration, branch-protection
settings, and manual deployment are out of scope.

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
  different IPs create one durable candidate job, two outbox workers claim once,
  and two password workers obtain one grant lease. The proof also enqueues a
  known and an unknown candidate concurrently (both must return `queued` — the
  public transaction resolves no account existence), proves a held candidate
  lock delays only its own candidate, and drives the worker's canonical
  case-insensitive account resolution. Every assertion is scoped to the proof's
  own synthetic fingerprints, so it passes repeatedly without a reset and on a
  database holding unrelated queued recovery work — it seeds such a bystander
  job itself and proves it comes through untouched.

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
npm run guard:actions
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
