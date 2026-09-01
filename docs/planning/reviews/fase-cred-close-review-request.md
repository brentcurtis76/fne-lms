# Review request — CRED-02B closeout: recovery-crypto cutover recorded ACTIVE (documentation only)

- **Branch:** `docs/cred-close` (worktree `/Users/brentcurtis/dev/wt/cred-close`, outside iCloud)
- **Base:** `593b7df62234b18eb3dba5c1f508541590a5d381` — the PR #67 merge commit,
  confirmed byte-equal to `origin/main` by a read-only fetch at task start on
  2026-09-01. The task's hard precondition was to stop if `origin/main`
  differed; it did not.
- **Commits:** exactly **one** — `docs(cred): record recovery crypto cutover`.
  The diff against the base must be exactly the three files in §4, nothing else.
- **Nothing pushed, no PR opened, no provider modified.** This closeout ran
  read-only verification (GitHub reads, one names/scopes-only Vercel listing,
  and exactly one Brent-authorized read-only aggregate database query) and then
  wrote documentation. No credential value was read, displayed, or pulled.

## 1. Objective

Close CRED-02B by recording the externally verified post-merge state:

1. PR [#67](https://github.com/brentcurtis76/fne-lms/pull/67) merged approved
   head `b530d8771adcc38af77028207a3eb31657ab346d` as merge commit
   `593b7df62234b18eb3dba5c1f508541590a5d381`.
2. All seven PR CI jobs
   ([33531107841](https://github.com/brentcurtis76/fne-lms/actions/runs/33531107841),
   on the approved head) and all seven post-merge CI jobs
   ([33531965740](https://github.com/brentcurtis76/fne-lms/actions/runs/33531965740),
   on the merge commit) succeeded.
3. Automatic Vercel Production deployment `6205672170` succeeded for
   `593b7df6` — the first Production deployment carrying
   `RECOVERY_CRYPTO_SECRET`.
4. Therefore CRED-02 moves from **STAGED, NOT ACTIVE** to **configuration
   cutover ACTIVE** — stated precisely as deployment/configuration evidence,
   **not** proof of a real recovery-e-mail and redemption flow, which remains
   unexercised.
5. The post-merge aggregate check returned all-zero counts with pre-merge-only
   outbox timestamps, and the record states honestly that the
   immediately-before-merge zero check is **not evidenced and was not
   retroactively satisfied** — the post-merge check only bounds the risk.
6. Credential state is restated without drift: `fne_lms_vercel_prod_20260831`
   held by Brent, NOT installed; no Supabase key rotated, revoked, disabled, or
   replaced; the service-role-key migration stays separately BLOCKED and
   UNAUTHORIZED.

## 2. Verification performed before any edit (all read-only)

| Step | Method | Result |
| ---- | ------ | ------ |
| `origin/main` = `593b7df6…` | `git fetch` + `rev-parse` | confirmed exact |
| PR #67 merged head→merge | `gh pr view` | MERGED; head `b530d877…`; merge `593b7df6…`; merged by `brentcurtis76` 2026-09-01T16:28:16Z |
| PR CI 33531107841 | `gh api …/runs/…/jobs` | completed/success on `b530d877…`; all seven jobs success (Migration safety guard, Browser/server boundary guard, Gate 1 Typecheck, Gate 1b Lint, Gate 2 Vitest, Gate 3 pgTAP, Gate 4 E2E) |
| Post-merge CI 33531965740 | `gh api …/runs/…/jobs` | completed/success on `593b7df6…`; the same seven jobs all success |
| Production deployment 6205672170 | `gh api …/deployments/…` + statuses | sha `593b7df6…`, environment Production, latest status **success — "Deployment has completed"** (2026-09-01T16:31:44Z) |
| Vercel variable scopes | `vercel env ls` (names/scopes only; values render only as "Encrypted") | `RECOVERY_CRYPTO_SECRET` → **Production** only; `SUPABASE_SERVICE_ROLE_KEY` → **Production** only. No value displayed or pulled |

### The single authorized database query

Brent authorized exactly **one** read-only production call returning one
aggregate-only row. It was executed once, after the deployment's success status
was read, through the already-linked read-only Supabase Management API wrapper
(the `supabase-genera` MCP `execute_sql`, configured `--read-only`) as one
single-statement `SELECT` of six scalar subquery aggregates over
`auth_security.password_recovery_outbox` and
`auth_security.recovery_attempt_grants`. No row contents, identifiers,
credential values, e-mails, names, tokens, or envelopes were requested or
returned; no mutation was possible or attempted; no second query was run.

**Definitions** (stated explicitly because the CRED-02A preflight's exact SQL
text is not recorded in the repository; these are derived from migration
`20260819120300_recovery_security_ceremonies.sql` and are consistent with the
CRED-02A recorded outputs — same categories, same 2026-08-28 latest activity):

- `envelope_rows_total` — outbox rows where `request_envelope IS NOT NULL OR
  message_envelope IS NOT NULL` (terminal transitions scrub both to NULL);
- `nonterminal_rows_total` — outbox rows with `state IN ('queued','processing')`
  (the only nonterminal states in the CHECK constraint);
- `active_unexpired_grants` — grants with `state = 'active' AND expires_at >
  clock_timestamp()`;
- `latest_queued_at` / `latest_completed_at` / `latest_scrubbed_at` —
  `max()` of the corresponding outbox timestamp columns.

**Results (2026-09-01):**

| Aggregate | Value |
| --------- | ----- |
| envelope_rows_total | **0** |
| nonterminal_rows_total (queued/processing) | **0** |
| active_unexpired_grants | **0** |
| latest_queued_at | 2026-08-28 12:57:33.221618+00 |
| latest_completed_at | 2026-08-28 12:57:49.403743+00 |
| latest_scrubbed_at | 2026-08-28 12:57:45.210488+00 |

All three counts were zero when queried, and every recorded outbox timestamp
predates the merge (2026-09-01T16:28Z), so neither hard stop fired. This bounds
the risk after the fact; it does not reconstruct every transient grant state
during the cutover window, and **it does not substitute for the
immediately-before-merge check** — see §5.

## 3. Scope

### In scope

- `PROJECT_STATE.md` — new authoritative closure entry at the top of `## Meta`;
  the 2026-09-01 staged entry's heading gains a historical-supersession marker
  (body untouched; repo convention — supersede without deleting).
- `docs/runbooks/auth-security.md` — a dated 2026-09-01 **post-merge** state
  update blockquote appended after the staged one (the staged blockquote is
  preserved verbatim as historical evidence), and row **0.19** reconciled to
  ACTIVE-with-caveats. Rows 0.16–0.18 untouched this round.
- this file.

### Explicitly out of scope (verified untouched by the diff)

Application code, tests, workflows, package files, migrations, Supabase
configuration, secret-guard code, credential values, and every provider
setting. No push, PR, merge, deployment, Vercel modification, key
installation/rotation/revocation, functional production test, or additional
database call.

## 4. Files changed

| File | Change | Risk |
| ---- | ------ | ---- |
| `PROJECT_STATE.md` | +1 closure Meta entry; historical marker on the staged entry's heading | Governed state record — transcription errors mislead future sessions |
| `docs/runbooks/auth-security.md` | +1 post-merge blockquote; row 0.19 → ACTIVE (configuration cutover, functionally unproven) | Row 0.19 wording gates how "done" this reads; overclaim here is the main hazard |
| `docs/planning/reviews/fase-cred-close-review-request.md` | new file | LOW |

## 5. The honest gap this record preserves

The CRED-02B review request mandated a fresh zero-count check **immediately
before** merge. No such check is evidenced in this record, and this closeout
does not claim one happened; the requirement was **not retroactively
satisfied**. What exists instead is the post-merge check above, and what it
proves is exactly this: the envelope, nonterminal and active-unexpired-grant
counts were zero when queried, and the three max outbox timestamps remained on
2026-08-28. That **bounds** the risk after the fact; it does not reconstruct
every transient grant state during the cutover window. Bounding after the fact
is weaker than the mandated pre-merge gate, and both edited documents say so in
those terms. A reviewer should verify neither document softens this.

## 6. Gate evidence

Run in the worktree on this branch's tree, dependencies from a fresh `npm ci`;
the production build used command-scoped synthetic localhost
`NEXT_PUBLIC_SUPABASE_*` values (never the production env file).

| Gate | Command | Result |
| ---- | ------- | ------ |
| Secret guard | `npm run guard:secrets` | PASS — 2,457 tracked paths (this file staged), content scanned from the Git index only, 0 findings |
| Types | `npm run type-check` | PASS — exit 0 |
| Lint | `npm run lint -- --max-warnings=0` | PASS — exit 0, zero warnings |
| Unit/integration | `npm test` | PASS — 371 files, 8,515 passed, 11 skipped, 0 failures |
| Build | `npm run build` | PASS — exit 0 (Next 14.2.35; compiled successfully, 149 static pages) |
| Whitespace | `git diff --check` | clean |

Sequencing disclosure: type-check, lint, unit and build were captured on a tree
identical to the committed one except for the insertion of their numeric
results into this file; the content-dependent gates (`guard:secrets` with the
new file staged, `git diff --check`) were re-run last on the exact committed
tree. Markdown is not an input to tsc, ESLint (`.js/.jsx/.ts/.tsx` only),
Vitest, or `next build`. `test:db`/`e2e` were not run — the diff is three
Markdown files.

## 7. Where a reviewer should push hardest

1. **Transcription accuracy** — every SHA, run id, deployment id, timestamp,
   and count above appears again in `PROJECT_STATE.md` and the runbook; the
   three copies must agree exactly.
2. **Overclaim on "ACTIVE"** — the state must read as configuration cutover
   only. If any sentence can be quoted as "recovery flow verified working" or
   as authorization to touch a Supabase key, that is a finding.
3. **Aggregate-definition fidelity** — the six definitions in §2 were derived
   from the migration, not copied from CRED-02A's (unrecorded) SQL. Check them
   against `20260819120300_recovery_security_ceremonies.sql`: state CHECK
   lists exactly `queued`/`processing` as nonterminal; envelopes scrub to NULL
   on terminal transitions; grant activity is `state='active'` plus unexpired.
4. **The honest-gap wording (§5)** — verify both edited documents state the
   pre-merge check as not evidenced and not retroactively satisfied, and that
   the post-merge check is framed as bounding, not satisfying.
5. **Authorization boundary** — exactly one database statement was run, aggregates
   only; the Vercel read was names/scopes only. Anything in the record implying
   more access than that is a finding.

## 8. Known limitations

- **The recovery flow is functionally unproven under the new root.** No
  recovery e-mail, envelope, or grant has been exercised since cutover; rows
  0.6/0.7a discipline (controlled synthetic send, separately authorized)
  still applies before anyone can claim the flow works.
- **The pre-merge zero check is unevidenced** (§5) — recorded as a gap, not
  repaired.
- **Aggregate definitions are reconstructed** (§2) — disclosed; semantically
  matched to the migration and to CRED-02A's recorded outputs.
- **The counts are a snapshot** taken shortly after the deployment succeeded on
  2026-09-01; they are not a standing guarantee.
- **The next credential steps remain fully open**: legacy keys still treated as
  disclosed; `fne_lms_vercel_prod_20260831` held by Brent, NOT installed; the
  service-role-key migration BLOCKED and UNAUTHORIZED pending its own explicit
  authorization and independent review.

## 9. Independent review — round 1 (two findings, both corrected)

Reviewed head: `dc7ff69e8bf8168260bc96a440c8d58da46888c2`. Because the branch
is unpushed and must stay exactly one commit over the base, the corrections
were amended into that single commit (`--amend --no-edit`); the reviewed head
is superseded by the amended head. No external fact, SHA, run id, deployment
id, aggregate value, timestamp, the configuration-only ACTIVE boundary, or any
key-authorization state was changed by this round — only the two findings
below.

### R1-1 (overclaim) — the snapshot cannot see transient grants

The record asserted that the post-merge snapshot showed "no envelope or grant
was in flight across the cutover window" / "nothing was queued, in flight, or
grant-active across the cutover window". That is more than the evidence
supports: the single query counted grants only in their state **at query
time** and took `max()` only over **outbox** timestamp columns, so a transient
grant created after the merge and closed (expired, exhausted, invalidated,
interrupted, succeeded) before the query would be invisible to it. What the
evidence supports is exactly: the envelope, nonterminal and
active-unexpired-grant counts were zero when queried; the three max outbox
timestamps remained on 2026-08-28; and this bounds the risk after the fact
without reconstructing every transient grant state during the cutover window.

**Correction:** every absolute across-the-window claim was removed and replaced
with the bounded statement above, in all three places it appeared —
`PROJECT_STATE.md` (closure entry), this file (§1.5, §2, §5), and the
post-merge runbook blockquote; "all activity predates the merge" is now
qualified as "all recorded outbox timestamp activity predates the merge"
wherever it occurs. The honest statement that the immediately-before-merge
check is not evidenced and was not retroactively satisfied is preserved
unchanged.

### R1-2 (audit trail) — the superseded row 0.19 wording had been deleted

Replacing row 0.19 in place removed the STAGED-state wording from the visible
document, leaving it recoverable only through Git history — weaker than this
workstream's supersede-without-deleting convention.

**Correction:** the exact row 0.19 text as it stood at base `593b7df6`
(retrieved with `git show 593b7df6…:docs/runbooks/auth-security.md`) is now
present **verbatim** in a clearly labeled "Historical — superseded row 0.19"
fenced block immediately below the state table, explicitly marked as not the
current state; the ACTIVE row remains row 0.19. The staged-state blockquote
and the staged `PROJECT_STATE.md` entry body were already preserved and remain
byte-identical.
