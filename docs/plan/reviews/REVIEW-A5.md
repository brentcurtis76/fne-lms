# CODEX REVIEW — A5 final (two rounds)

VERDICT: FAIL

A5 implements the public lead route, D-03 transition matrix, split-consent
tuples, anti-enumeration response, escaped transactional emails, and the r2
`source_path` write path substantially as specified. It is not mergeable
because the optional-marketing guarantee is only sequential: an unchecked
resubmission can use a stale `marketing_opt_in = false` read to overwrite a
concurrent opt-in with the CHECK-valid false tuple. That is a silent opt-out
outside the unsubscribe flow, exactly what A5 [A5] and D-12 prohibit.

BLOCKING:

- [B1] A stale unchecked resubmission can clear a concurrent marketing opt-in —
  `pages/api/pasantias/lead.ts:84-105,171-176,236-244` —
  `marketingColumns()` omits the three marketing columns only when the earlier
  SELECT already saw `marketing_opt_in = true`. If request U reads `false`,
  request O then writes the full true tuple, and U finally updates, U sends
  `{marketing_opt_in:false, marketing_opt_in_at:null,
  marketing_notice_version:null}` and erases O's consent. The live
  `pasantias_leads_marketing_consent_check` at
  `supabase/migrations/20260731140500_add_pasantias_leads.sql:90-95` accepts
  that tuple, so the database cannot prevent the lost update. The existing
  tests cover `true → unchecked` and `false → checked` sequentially but never
  assert that an unchecked UPDATE omits all three columns when its snapshot was
  false (`__tests__/api/pasantias-lead.test.ts:422-455`). This violates the
  explicit rule that resubmission may set true but must never silently clear a
  prior true; opt-out belongs only to unsubscribe. On duplicate/update paths,
  an unchecked submission must always leave all three marketing columns
  unwritten, independent of the selected snapshot. Keep the complete false
  tuple for INSERT and the complete true tuple for an active opt-in.

SHOULD-FIX:

- [S1] The r2 implementation is not the raw, verbatim allowlist its evidence
  claims — `lib/pasantias/leads.ts:174-191` and
  `__tests__/lib/pasantias-leads.test.ts:312-314` — the function calls
  `value.trim()` before its whitespace/control scan and returns that rewritten
  value. Thus `"  /pasantias  "` is accepted as `"/pasantias"`, and leading or
  trailing CR/LF is removed before the raw-input check. This does not create an
  off-site or stored-control-character exploit—the resulting stored value is
  still same-site and safe—but it contradicts the r2 record that the function
  “never rewrites” and that storage is byte-identical
  (`docs/planning/reviews/fase-a5-review-request.md:182-185,213-217`; PM ledger
  at `docs/plan/LEDGER.md:1004,1010`). Either scan/reject the exact raw string
  before any trim and add edge-whitespace/edge-CRLF cases, or amend the
  cross-phase contract and evidence to say surrounding whitespace is
  intentionally normalized. Given the dispatched raw-string requirement, the
  former is the consistent resolution.

NITS:

- None.

FIX BLOCK:

```text
A5 remediation round:

1. In pages/api/pasantias/lead.ts, separate INSERT marketing defaults from
   UPDATE behavior. INSERT may write the complete false tuple. UPDATE with
   marketingOptIn !== true must omit marketing_opt_in,
   marketing_opt_in_at, and marketing_notice_version unconditionally; UPDATE
   with true must stamp the complete true tuple.
2. Add a regression test whose selected row says false and whose unchecked
   duplicate UPDATE is asserted to omit all three marketing columns. Explain
   that omission makes a later/concurrent true write monotonic. Retain the
   existing insert-false, insert-true, existing-true/unchecked, and checked
   resubmission cases.
3. Resolve S1 by rejecting raw sourcePath strings with leading/trailing
   whitespace or control characters before trimming (preferred), with cases
   for leading/trailing space, CR, LF, and CRLF; or explicitly correct every
   verbatim/raw claim if normalization is intentionally retained.
4. Update the review request and ledger evidence, reconcile the branch with
   current main while preserving both ledgers, and rerun the focused suite,
   type-check, zero-warning lint, full Vitest, build, and price-leak scan.
5. Push the remediation/reconciliation and require all six GitHub CI jobs on
   the resulting final SHA before merge.

DoD: the stale-false unchecked UPDATE test fails on b65dfa8 and passes after
the fix; every marketing payload remains one of the live CHECK's two legal
tuples or omits the tuple entirely on UPDATE; sourcePath evidence matches code;
all local gates and all six PR checks are green on the same final head.
```

NOTES ON THE PLAN ITSELF:

- **Consent tuple shapes are otherwise correct.** INSERT without marketing
  consent writes `false/null/null`; opted-in INSERT/UPDATE writes
  `true/server-time/PRIVACY_NOTICE_VERSION`; required processing evidence is
  always server-stamped; and an unchecked update after a SELECT that already
  saw true omits all three fields. No half-set tuple reaches Supabase. [B1] is
  a monotonicity/lost-update defect that the live CHECK deliberately cannot
  express, not a malformed tuple.

- **Anti-enumeration holds at the public response contract.** First insert,
  ordinary duplicate, 23505 race recovery, and honeypot all produce
  `200 {success:true}`; the test compares the first and duplicate responses
  directly. Database failures remain 5xx and field validation remains 400,
  neither of which reveals whether a valid address was already registered.

- **The D-03 graph is exact.** `canTransitionLead` contains precisely the five
  frozen edges, denies all four no-op pairs and unknown values, and the 4×4
  product test asserts every allowed and forbidden status pair. The public
  route writes `status:'new'` only for a row observed as `dismissed`; contacted,
  converted, and new rows retain their current status. A repository-wide writer
  search found this route as the only current `pasantias_leads` consumer.

- **Email hardening is correct.** Every visitor-controlled HTML interpolation
  reaches `escapeHtml`; message newlines are inserted only after escaping; the
  configured brochure URL is attribute-escaped; and both subjects pass their
  dynamic portions through `singleLine`, while validation also collapses
  request CR/LF. The auto-reply uses the FNE frame, imports only
  `cohort-public`, links `/api/pasantias/brochure`, and contains no repository-
  authored price. The post-build scanner independently passed over 266 client
  files.

- **The 24-hour sequential dedup works, and its declared race is accepted.** A
  recent `brochure_sent_at` suppresses only the auto-reply, an older timestamp
  permits it, and the stamp is written only after provider success. Two
  concurrent submissions can both read an old/null stamp and both send before
  either stamps; the executor and both PM rounds disclose that bounded
  read-then-write race. It can duplicate a courtesy email but cannot alter
  consent or lead state, so it is not elevated here. [B1] is different because
  it silently destroys the later opt-in value.

- **r2 otherwise closes `source_path`.** Absolute schemes, protocol-relative
  `//` and `/\\`, unrooted paths, embedded whitespace/C0/DEL, non-strings, and
  over-cap values are dropped without rejecting the lead. INSERT records a safe
  value or null; UPDATE writes only a newly accepted value and never nulls prior
  attribution. [S1] concerns the truthful raw/verbatim contract, not the
  same-site property of the stored result.

- **Scope and evidence.** I reviewed the full five-commit branch from base
  `fb61b69` through final head `b65dfa8`, including r1 code `a58ada7`, r2 code
  `b7355d1`, both PM verification entries, and the review request. The diff is
  confined to the three planned source files, two planned test files, and
  phase documentation; there is no migration, dependency, middleware, page,
  or unrelated product change. `git diff --check` and the review worktree are
  clean.

- **Independent local gates on `b65dfa8`.** Focused A5 Vitest passed **2 files /
  92 tests**; `npm run type-check` passed; `npm run lint` passed with zero
  warnings; the full `npm test` run passed **255 files / 4,084 tests**;
  `npm run build` succeeded and registered `/api/pasantias/lead`; and
  `node scripts/check-price-leak.mjs` passed over **266** client files. Per the
  dispatched scope, local pgTAP was not rerun because A5 changes no SQL, and
  browser e2e belongs to A6b.

- **Final-head PR evidence is not yet complete.** GitHub run `30863286342`
  executed all six required CI jobs successfully at r1 head `45c08fc`. No
  six-gate run exists for r2/final head `b65dfa8`; PR #40 currently reports only
  the two successful Vercel contexts and is `DIRTY`/conflicting with `main`.
  Reconciliation plus the remediation push must produce the mandatory six
  green checks on the final SHA before merge.

There is one numbered BLOCKING residue for Brent under SOP §1.5.
