# Z7 independent review — remediation round 2

## Control record

- Immutable cumulative review base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `dd7836eb9d6c2a2d4d46c7ba43205bc694450578`
- Independent decision: `REVISE`; the rejected SHA is not accepted
- Governing contracts remain PLAN §11 and §15.3 plus `Z7-review-1.md`
- Required builder state: `REVIEW READY`, never `COMPLETE`

Resolve all findings below in one bounded round. The final reviewer will again inspect
the cumulative `43999499..HEAD`, not only this repair diff.

## Findings

### Z7-R2.1 — Established occurrence UUID is overwritten (`BLOCKER`)

`supabase/migrations/20260811130100_zoom_meeting_actual_instants.sql` uses
`COALESCE(p_occurrence_uuid, m.zoom_meeting_uuid)`, which prefers the incoming UUID.
A rollback-only real-SQL probe changed `Established/Occurrence==` to
`Different/Occurrence==`. The TypeScript test double uses existing-first semantics and
therefore gives false assurance.

**Required:** use existing-first fill semantics and align SQL comments and doubles.

**Acceptance:** real pgTAP proves ended-before-started fills a missing UUID, a
later/refused start preserves it, any replay with a different UUID cannot overwrite it,
and candidate selection includes the ended-before-started occurrence.

### Z7-R2.2 — Complete report batches are not terminal (`BLOCKER`)

`20260813120100_zoom_attendance_report_batches.sql`, `attendance-report-store.ts`, and
`attendance-reconcile.ts` allow an unconditional rejection update. A service-role probe
changed `complete` to `rejected`. A promotion can commit, lose its response, then be
demoted by the catch path while report rows remain, reverting effective authority.

**Required:** enforce only `pending → complete | rejected` at the database boundary;
make rejection conditional; reconcile ambiguous promotion outcomes by reading durable
batch state. Complete and rejected are terminal.

**Acceptance:** a simulated post-commit transport failure leaves a complete batch
complete and effective; pending fetch/validation failures become rejected; every further
transition from complete/rejected is refused. Use real DB assertions for the boundary.

### Z7-R2.3 — Override replay trusts a caller-supplied hash (`MAJOR`)

`apply_session_hour_override` compares only `p_payload_hash`. A caller can change
session, minutes, reason, category, or reversal target, reuse the original hash, and get
`replay: true` rather than `P0409`. The current concurrency proof always changes hash
with payload and misses the forged-hash case.

**Required:** derive/validate a canonical payload inside PostgreSQL or compare every
normalized payload field under the request-ID lock. Do not make caller-supplied hash the
security boundary.

**Acceptance:** changing each payload field individually while reusing a forged hash
yields `P0409`, sequentially and concurrently; identical actual payload replays; no path
emits `23505`.

### Z7-R2.4 — Malformed report pagination is treated as complete (`MAJOR`)

`lib/zoom/api.ts` coerces missing/null/non-string `next_page_token` to `''`, although an
explicit empty string is the only valid end-of-data signal. Malformed response metadata
can therefore become authoritative.

**Required:** require `next_page_token` to be a string and reject malformed metadata.

**Acceptance:** absent, null, numeric, and other non-string tokens reject the candidate,
promote no rows, and preserve the previous complete batch; explicit `''` remains valid.

### Z7-R2.5 — Two financial dependencies still fail open (`MAJOR`)

- `pages/api/consultant-earnings/[consultant_id].ts` ignores `hour_types` errors and can
  return zero executed/penalized breakdown.
- `pages/api/contracts/[id]/hours/ledger/csv.ts` ignores facilitator lookup errors and
  can return a successful header-only consultant CSV.

**Required:** check both errors and return a generic 500 without financial data/export.

**Acceptance:** independently fail each dependency and require 500/no successful CSV or
earnings payload; override/reversal values remain 0.75/7.50 and 1.00/10.00.

### Z7-R2.6 — Required billing-isolation tests are not executable (`MAJOR`)

`billable-hours.test.ts` uses one no-override helper test plus comments to claim the
planned-60/Zoom-45, Zoom-90, and no-Zoom scenarios. The review request substitutes grep
evidence for the required Z7-A6 mutation-sensitive proof. This does not show comparison
data cannot mutate billing.

**Required:** add named executable scenarios for all three cases and a mutation-sensitive
assertion covering every comparison write/RPC path.

**Acceptance:** all three named scenarios bill 60 under UTC, America/Santiago, and
Europe/Madrid; deliberately adding a comparison-triggered ledger mutation makes the
isolation test fail. Record honest fail-on-old/mutation evidence.

### Z7-R2.7 — Override input failures escape validation taxonomy (`MINOR`)

`pages/api/admin/sessions/[id]/hour-override.ts` lets nonempty invalid session/reversal
UUIDs and values outside PostgreSQL integer range reach RPC coercion and become 500s.

**Required/acceptance:** validate both UUIDs and the supported minute range before the
RPC; invalid identifiers/overflow return 400 and never call the RPC; unknown database
failures remain generic 500.

### Z7-R2.8 — Page-cap failures are rejected twice (`MINOR`)

`attendance-reconcile.ts` rejects `page_cap_exceeded`, then its catch overwrites the
reason with `page_fetch_failed`.

**Required/acceptance:** resolve the batch once; a nonterminating token sequence causes
exactly one `page_cap_exceeded` rejection and no promotion.

### Z7-R2.9 — Phase review request is not canonical or internally consistent (`MINOR`)

The header still names `8ccc64b3`/19 commits; the appendix does not record canonical
`dd7836eb…`, falsely claims SQL preserves UUID identity, and contains conflicting
concurrency/chain evidence.

**Required/acceptance:** at the eventual canonical repair HEAD, reconcile the entire
artifact to one authoritative full SHA, exact `git rev-list --count`, gate table, and
finding disposition. Remove stale contradictory claims rather than appending another
conflicting layer. Because cherry-pick changes commit IDs, the builder should leave a
clearly marked `CANONICAL_HEAD_PENDING_INTEGRATION` field for the orchestrator to replace
after integration, then the orchestrator will commit that exact canonical SHA/count
before final review.

## Boundaries and gates

No merge, push, deploy, Vercel call, production/remote DB access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Amend only unapplied Z7
migrations; preserve additive schema rules. A newly found contract conflict returns
`FINDINGS`.

Run focused fail-on-old/direct-SQL/mutation probes, type-check, zero-warning lint, full
Vitest, build, full pgTAP, real override concurrency, mandatory 117-test Chromium gate,
and the three-timezone matrix. Record inherited advisory/broad-suite failures without
calling them green. Commit code/tests/evidence and return `REVIEW READY` with exact
detached SHAs for cherry-pick.
