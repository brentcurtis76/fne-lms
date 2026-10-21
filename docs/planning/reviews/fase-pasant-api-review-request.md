# Review request — PASANT-B002b January registration API (local r1, provisional)

Status: PARTIAL_CODE_READY_FOR_INDEPENDENT_REVIEW. This is not acceptance, and no gate has run on this code.

## State

- Root `/home/brent/Projects/pm-workflow/worktrees/genera-p02b-r1`, branch `fix/p02b-r1`, base/HEAD
  `85838af02a03a5289ad71852aab007fa62edbbf7` (accepted PASANT-02 r1 parent). There are 0 commits on top; everything below is
  uncommitted.
- **Inherited overlay (not authored here; hashes in the PM's `baseline.json`):** `PROJECT_STATE.md` (its prior B002a
  entry, unchanged), `docs/plan/evidence/pasant-january/b002-database-contract.md`,
  `docs/plan/evidence/pasant-january/b005-flight-deck-verification.md`, `docs/planning/reviews/fase-pasant-area-review-request.md`,
  `docs/planning/reviews/fase-pasant-db-review-request.md`,
  `supabase/migrations/20261013020000_pasantias_january_program_interests.sql`,
  `supabase/tests/112-pasantias-program-interests-rls.sql`. These are frozen. Historical B002a APPROVED_WITH_NOTES applies to its
  original state.
- **New in B002b:** product files `pages/api/pasantias/lead.ts`, `lib/pasantias/leads.ts` and `lib/pasantias/emails.ts`; tests
  `__tests__/api/pasantias-lead.test.ts`, `__tests__/lib/pasantias-leads.test.ts` and `__tests__/lib/pasantias-emails.test.ts`;
  docs `docs/plan/evidence/pasant-january/b002-api-integration.md` and this file; and a new top entry in `PROJECT_STATE.md`.

## Objective and scope

Connect January registration to the accepted atomic RPC and the program-scoped reply claim (PASANT-C008 child B002b). Each
January POST carries exactly one `program` and makes one submit RPC call. The same email keeps both interests across separate
submissions, and repeats are safe. Consent is split, triage stays with the SQL, and anti-enumeration, the rate limit and the
honeypot are kept. October stays unchanged.
Out of scope: B003 (page/form/documents, public cohort switch), B004 (admin), any SQL, auth/RLS, and runtime/production work.
Behavior details: [b002-api-integration.md](../../plan/evidence/pasant-january/b002-api-integration.md).

Design correction applied during authorship: B002b-DESIGN-01 (PM/independent reviewer). The first `programs[]` draft (several
RPC calls per POST, so a later failure could leave a partial commit) was replaced before any route or test code. The correct
design is a singular `program` and one RPC call. Arrays are refused.

Review r1 (`CHANGES_REQUIRED`, freeze `375e6440…`) is remediated in this delivery:
- **B002b-R1-01:** the API fake's `settleData`/`submitData` overrides now replace the model's answer without running it, so a
  forced `false` refusal changes no row. The forced-refusal test asserts the claim is still open, with the same token and no
  stamp. A new route-level counterexample covers a delayed owner A and a newer claim B: A settles `not_sent` with its own
  captured token, gets `false`, and B's token, claim time and previous value are unchanged until B settles itself. This models
  how the client handles the refusal. It does not prove database concurrency; that is pgTAP 112 (c).
- **B002b-R1-02:** `lib/pasantias/emails.ts` gained an optional `LeadEmailDependencies { transport?: EmailTransport }` as the
  senders' second argument. It is forwarded to the provider's existing seam only when given. The production default, the
  `PUBLIC_OUTBOUND_EMAIL` authorization and `lib/email/**` are unchanged, and the route is unchanged. New email tests run the
  real `deliverOutboundEmail` with an injected transport (accepted, rejected, thrown), missing configuration without a
  transport, the sender rule under injection and the default Resend path. They use a synthetic sender and key, a refusing
  `Resend` mock, and restored env and mocks.

Counters (PM cumulative): initial execution 1, remediation 2 (B002b-DESIGN-01 + review r1). The remediation cap is reached;
another round needs REPLAN_REQUIRED.

## Files by risk

- High (personal data, consent, public endpoint): `pages/api/pasantias/lead.ts`, `lib/pasantias/leads.ts`.
- Medium (outbound mail content and claim settlement): `lib/pasantias/emails.ts`.
- Tests and docs: the three test files, the two docs, and `PROJECT_STATE.md`.

## Test evidence

NOT RUN. The executor's grant excluded every test, type, lint, build, DB and server command. The authored focused suites are the
three files above. Required, all pending: focused suites, `npm run type-check`, zero-warning `npm run lint`, full `npm test`
(baseline recovered unit gate: 525 files / 13519 passed / 12 inherited skips, independently passed before this change),
`npm run build`, pgTAP including 112, a real-PostgREST call of the 18-key body, real concurrency, the browser journeys (January
choice of either program, same-email both programs, repeat, invalid consent, no enumeration, October A9 4/4) and CI.

## Scrutinize hardest

1. **The 400 for SQL `22023`** (`handleProgramSubmission`): this treats validator drift as a form error. Check that no
   accepted-by-JS / refused-by-SQL case is realistic. Example: `normalizeText` collapses internal whitespace and the SQL only
   btrims, so the result should be equal. Also check that the logged message carries no PII.
2. **Settlement mapping** (`programReplyOutcome`): only `not_configured`/`rejected` release. `sendSoft` maps `refused` and
   `suppressed_qa` to `unknown`, so they settle `ambiguous` and suppress for 24 h. That is conservative, and it is inherited
   October behavior.
3. **January acknowledgement copy** (`renderLeadProgramAutoReplyHtml`): it has no link and only contract-verbatim names. The PM
   decided in review r1 that this provisional acknowledgement is allowed locally. Check that the copy stays within that bound;
   B003 documents and the release gates are still mandatory before any release.
4. **Validation widening in shared `validateLeadSubmission`**: the October client form reuses it. `enero-2027` is now an accepted
   cohort for hand-crafted POSTs, so once deployed with the migration the endpoint accepts January interests before the B003
   page exists. `cohort-public` is unchanged.
5. **Test model fidelity** (`createSupabase` RPC model and the delayed A/B case): the January cases are only as good as the
   model's match with the SQL, including the claim window boundary, the token check and the `not_sent` restore. The A/B case
   also depends on `vi.waitFor` sequencing two in-flight requests. Compare the model with the migration; mocks prove no DB
   behavior. The transport seam is the one place production code changed for testability. Check that its absent path is
   byte-for-byte the old provider call.

## Known limitations and deferred work

- No January document link until B003 supplies a per-program document interface.
- The route does not use `interest_created` (it is not exposed, for anti-enumeration). `lead_created` only selects the internal
  notification heading.
- A settle error leaves the claim token open until the 24 h window expires. This is the conservative side.
- Remaining after review: the gates above; B003/B004/B006; the `UNIQUE (id, cohort)` count-check manifest; and the Brent-owned
  R-08/R-17 releases.
