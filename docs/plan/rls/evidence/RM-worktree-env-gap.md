# RM evidence — worktree environment gap

Date: 2026-08-13  
Worktree: `/Users/brentcurtis/dev/wt/rls-public`  
Branch: `fix/rls-public`  
Merge base tested: `4399949942bfcf49dfa8de40cbf7edbf40f0490e` (`43999499`)

## What failed

RM round 1 ran the required chain:

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Type-check, lint, and Vitest passed. The Next.js build compiled successfully and then failed
during page generation with:

```text
unhandledRejection Error: either NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env variables or supabaseUrl and supabaseKey are required!
```

The executor reproduced the error at merge base `43999499` in another detached worktree and
classified it as a base failure. That control was not discriminating: a newly created worktree
also omits ignored environment files, so both checkouts shared the same missing prerequisite.
Identical failure under identical environment absence did not distinguish a code regression from
a worktree setup gap.

## Root cause

- `/Users/brentcurtis/dev/fne-lms/.env.local` exists and is 2,289 bytes.
- The RLS worktree had no `.env*` file when the first gate chain ran.
- `.gitignore:16` ignores `.env.local`, so `git worktree add` does not populate it in a new
  worktree.
- No environment-file contents were inspected, copied into this artifact, logged, or committed.

## Local fix

Brent linked the existing ignored file into the RLS worktree:

```text
/Users/brentcurtis/dev/wt/rls-public/.env.local
  -> /Users/brentcurtis/dev/fne-lms/.env.local
```

The symlink is itself ignored, remains local setup, and must not be committed or removed by the
executor. With it present, `npm run build` completes and emits the full route table.

## Verification and reusable rule

PM verification after the symlink:

- `npm run build`: PASS; middleware reported at 73.7 kB.
- No stabilization phase was needed because no code defect caused the red gate.

RM round 2 reruns the complete required chain with the environment present. Its raw final output
and counts are recorded in `docs/planning/reviews/fase-RM-review-request.md` and the RLS ledger.

For later worktree phases, verify required ignored local prerequisites before classifying a red
gate. A merge-base comparison is meaningful only when the control differs in the dimension under
test; reproducing both revisions with the same missing environment cannot isolate a regression.
