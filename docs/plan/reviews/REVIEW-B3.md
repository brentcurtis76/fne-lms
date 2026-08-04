# CODEX REVIEW — B3 round 1

VERDICT: FAIL

B3's migration itself implements the frozen five-table schema correctly: all five
tables have RLS, the current ACL is anon=`{}`, authenticated=`{SELECT}` without
grant option, both send foreign keys are `ON DELETE RESTRICT`, the identity CHECK
contains every D-06 field, and the webhook ledger has no raw-payload column. A clean
`supabase db reset` followed by an independent `npm run test:db` passes **8 files /
313 tests**. The phase is not ready to lock those contracts, however, because two
targeted security mutations leave the same **313/313** gate green: the purported
exact ACL pins discard grantability and inherited `PUBLIC` grants, and the
two-shape CHECK tests do not pin each identity field independently.

BLOCKING:

- [B1] `supabase/tests/040-email-marketing-rls.sql:122-157` does not fully pin the
  effective grant-list posture claimed by the suite and required by D-04. The
  `aclexplode` queries filter only the direct `anon` or `authenticated` grantee and
  aggregate only `privilege_type`; they discard `is_grantable` and ignore ACL rows
  granted to `PUBLIC`, which both roles inherit. I applied two independent local
  mutations after a clean reset: (1) `GRANT SELECT ON public.email_contacts TO
  authenticated WITH GRANT OPTION`, and (2) `GRANT REFERENCES ON
  public.email_contacts TO PUBLIC`. Each mutation left the full database gate green
  at **8 files / 313 tests**. The first lets any authenticated session re-grant the
  table's SELECT privilege; the second means anon/authenticated effectively hold a
  privilege while their direct ACL rows still look exact. The checked-in migration
  at `supabase/migrations/20260803170000_add_email_marketing_tables.sql:332-350`
  currently creates neither exposure, but B3 [A4] and the dispatch's ACL-level pin
  requirement are about proving that posture against regression, not merely
  observing one clean installation. Required closure: make the grant-list explicit
  for `PUBLIC` as well (or otherwise prove it has no ACL entry on every table), make
  the `aclexplode` expectation include grantee + privilege + `is_grantable`, require
  authenticated's sole row to be non-grantable SELECT, and add both surviving
  mutations to fail-on-mutant evidence. Preserve the PostgreSQL-version-safe
  MAINTAIN branch.

- [B2] `supabase/tests/040-email-marketing-rls.sql:498-535` proves that the whole
  identity CHECK exists, but not that its anonymized arm continues to null every
  D-06 identity field. The only partial-anonymization rejection at lines 524-529
  retains both `email` and `email_normalized`; the valid anonymized fixture supplies
  no name, organization, or basis note. I replaced the constraint with the exact
  checked-in expression except for removing `basis_note IS NULL`; the full gate
  again passed **313/313**. Equivalent one-term regressions for `first_name`,
  `last_name`, `organization`, `email`, `email_normalized`, or
  `unsubscribe_token` are not independently killed either. That makes the submitted
  M2 (drop the entire constraint) too coarse to support the claim that partial
  anonymization cannot commit. The production DDL at
  `supabase/migrations/20260803170000_add_email_marketing_tables.sql:105-125` is
  correct today, but D-06 and B3 [A4] require a durable two-shape contract. Required
  closure: add a negative case for an anonymized row retaining each named identity
  field independently (including a non-null token), keep the fully anonymized
  positive case, and record a fail-on-mutant probe that removes one otherwise
  optional-looking term such as `basis_note IS NULL`.

SHOULD-FIX:

- None.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- **The five ratified assumptions are accepted.** Applying `ON DELETE RESTRICT` to
  both `email_campaign_sends` foreign keys is the coherent reading of D-04's
  unqualified no-delete rule. It does not obstruct B9a's draft-only delete under
  D-07: the queue operation inserts sends and leaves `draft` atomically only when it
  inserted zero rows. Requiring a non-null `unsubscribe_token` on every live contact
  is the right strengthening for D-08; B6 must omit that column and let its UUID
  default fire rather than send explicit NULL. Keeping `subscribed_at` nullable and
  default-free is also correct under D-12: the authoritative subscription predicate
  is `unsubscribed_at IS NULL`, combined in B4a with its separate unsuppressed,
  untombstoned, and non-anonymized eligibility predicates. The inherited source and
  campaign-content columns are consistent with the v1/v2 schema lineage, and
  `detail jsonb NOT NULL DEFAULT '{}'` is a sound ledger shape.
- **The PII-free webhook boundary is correctly scoped for B3.**
  `supabase/migrations/20260803170000_add_email_marketing_tables.sql:258-273`
  stores only `svix_id`, event type, provider message id, timestamps, and `detail`;
  lines 398-402 document the allowlist and explicitly ban addresses, subject, HTML,
  and raw payloads. B3 has no writer, so enforcement properly lands inside B4b's
  `process_webhook_event`; B4b must still prove that a hostile raw payload cannot
  reach this column.
- **The present access boundary is sound despite [B1]'s false-green tests.** The
  migration uses the required `REVOKE ALL` then `GRANT SELECT` form on all five
  tables. Independent `aclexplode` inspection after the final reset found, per
  table, no anon or PUBLIC entry, exactly one non-grantable authenticated SELECT,
  and full owner/service-role privileges including PostgreSQL 17 MAINTAIN. The
  one-policy-per-table design and behavioral matrix correctly deny admin DELETE and
  TRUNCATE on both contacts and suppression tombstones; the use of `WHERE false` in
  DELETE probes is valid because the invariant is denial at statement privilege
  checking, before row matching.
- **The clean-stack result is independently reproduced.** I ran `supabase db reset`
  before the baseline gate, restored the database with a second reset after the
  mutation probes, and reran `npm run test:db`: **Files=8, Tests=313, Result: PASS**,
  including 142/142 in `040-email-marketing-rls.sql`. This confirms the PM's stale-
  stack diagnosis and its 313/313 result; it does not cure the two mutation-surviving
  proof gaps above.
- **Scope is faithful.** Implementation commit `0df19ad` adds one migration, one
  pgTAP suite, evidence, the review request, and its ledger entry; `71fb1b6` adds only
  the PM verification ledger entry. No function, route, UI, middleware, dependency,
  deployment, or unrelated schema work entered B3. No real PII appears in the
  fixtures.
- **PR #41's checks are green at branch head `71fb1b6`.** The migration guard,
  type-check, zero-warning lint, Vitest, pgTAP, Playwright, and both Vercel contexts
  report success. GitHub currently reports the PR as `DIRTY` only because `main`
  gained later planning/ledger commits; reconciliation must preserve both histories
  before re-review and merge.

There is no owner-arbitration residue: both blockers are test-proof defects with
surgical closures inside the existing B3 scope.
