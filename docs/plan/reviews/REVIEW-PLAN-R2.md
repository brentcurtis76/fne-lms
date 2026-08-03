# CODEX REVIEW — INSPIRA Comms plan v2 (round 2 of 2)

VERDICT: FAIL

I would not agree to be held to this plan yet. Version 2 is materially better and closes much of round 1, but a conforming implementation can still lose webhook events, complete a campaign while another worker owns fresh sends, delete a supposedly permanent suppression tombstone, break the expense-report mail flow while closing the relay, and record bundled brochure/marketing consent as if it proved both purposes. Several phases also knowingly exceed the in-repo sizing contract.

This is Codex round 2 of 2. The exact remaining disagreements requiring Brent's arbitration are listed under **NOTES ON THE PLAN ITSELF**.

## BLOCKING

### R2-B-01 — Lead-response processing and later broadcast marketing are still bundled into one required consent

Round-1 B-02 required the plan to distinguish permission to answer a brochure request from permission for later broadcast marketing. D-12 instead says one lead-form consent covers “response + requested materials + related program updates,” and A0/A5/A6 make that checkbox required (`PLAN.md:44,93,177-179,194`). The one timestamp/version therefore cannot prove that the person separately and freely chose ongoing marketing rather than merely supplying the data necessary to receive the requested brochure.

This matters beyond the October cohort because the stated goal is a permanent email platform. The text of Law 21.719 taking effect on 2026-12-01 requires consent to be free, informed, and specific as to purpose, presumes consent is not freely given when collected for a service that does not need it, and places proof on the controller ([BCN, amended Law 19.628, arts. 3 and 12](https://www.bcn.cl/leychile/navegar?idNorma=141599&idParte=8642686&idVersion=2026-12-01)).

Required plan change: represent the brochure/request purpose and broadcast-marketing purpose separately. The form needs either an optional marketing opt-in with its own accepted-at/version evidence, or a documented alternative lawful basis approved by the owner/legal reviewer. A required privacy acknowledgement may not be stored as proof of an optional marketing choice.

### R2-B-02 — “Permanent” suppression and anonymize-only erasure are not structural under the specified RLS

D-06 promises suppression tombstones that survive erasure, and B5 exposes no hard-delete API. But B3 grants admin `ALL`/CRUD on all five tables (`PLAN.md:38,278-279`). An authenticated admin JWT can therefore call PostgREST directly and delete `email_suppression` rows, or delete an unsent contact, bypassing both the B5 API and `anonymize_email_contact`. `ON DELETE RESTRICT` protects only contacts that already have send rows. The owner decision “permanent tombstone” and the proposed RLS cannot both be true.

The table contract also does not fully describe a valid anonymized row. B4 nulls contact PII and send email snapshots, while B3 specifies an `email_normalized` uniqueness/check contract but no `anonymized_at` marker or explicit nullable-after-anonymization constraints (`PLAN.md:275-277,290`). B5 nevertheless promises an “Anonimizado” state (`PLAN.md:305`). An executor must invent how that state is represented and how the idempotent second anonymization call works.

Required plan change: deny direct admin `DELETE` on contacts and suppression tombstones; make suppression deletion unavailable to ordinary authenticated roles; specify the reduced operation matrix per table rather than “admin CRUD ×5.” Add an explicit anonymization marker and define which identity/snapshot columns become nullable, with constraints and pgTAP covering a valid anonymized row, a second idempotent call, direct-delete denial, and tombstone survival.

### R2-B-03 — Insert-first webhook deduplication can permanently lose the event it is meant to protect

D-08/B7 insert `svix_id` first, then update send/contact/suppression state; an internal failure returns 5xx and relies on provider retry (`PLAN.md:40,334-335`). If the insert succeeds and a later state update fails, the retry sees the existing `svix_id` and returns 200 as a duplicate. The event's effect is then permanently lost. The four-column `email_webhook_events` table has no processing status, retry state, or payload from which to recover (`PLAN.md:277`).

There is also a contract mismatch: D-08 freezes `sent` and `delivery_delayed` among the handled event set, but B7 describes state effects only for delivered/opened/clicked and failed/suppressed/bounced/complained; B3 defines no delayed-event state (`PLAN.md:40,277,334`).

Required plan change: make dedup insertion and state mutation one atomic database operation, preferably a tested SECURITY DEFINER webhook-processing RPC, or model events as pending/processed/failed and retry duplicates that are not processed. Define and test the effect of every D-08 event, including `sent` and `delivery_delayed`. A failure injected after dedup insertion must be retried to completion.

### R2-B-04 — The sending state machine remains internally contradictory and unsafe under concurrent drains

Three specified contracts disagree:

- D-07 says an empty queue causes `draft→failed`; `queue_campaign_sends` says it flips the campaign to `sending` and returns the queued count, even if a live estimate raced to zero (`PLAN.md:39,290,376`).
- B10 says non-draft send requests return 409, while its test criterion says a double POST is an idempotent no-op (`PLAN.md:376,380`).
- Completion requires “no pending AND no claimable rows.” Fresh `sending` rows are not claimable. If worker A has claimed the last rows and worker B ticks before A records results, worker B can satisfy that predicate and mark the campaign terminal while A still owns in-flight sends (`PLAN.md:39,290,377`).

Required plan change: specify one atomic zero-audience outcome; choose and test either 409 or an idempotent current-state response for repeated queue requests; and define terminality as no `pending` **and no `sending`** rows after stale recovery. Add a two-worker test in which one worker holds fresh claimed rows and the other is forbidden from completing the campaign. Also cap campaigns/batches or elapsed work per cron invocation; “for each sending campaign” is not a bounded short tick.

### R2-B-05 — The relay prerequisite omits two live callers and can break an existing feature

B1 scopes the relay migration to `pages/api/send-email.ts`, `pages/api/test-email.ts`, and `lib/bots/expense-service.ts` (`PLAN.md:243-251`). The actual browser flow also imports `sendEmail` from `utils/emailUtils.ts`, whose implementation posts directly to `/api/send-email` (`utils/emailUtils.ts:9-17`). `pages/expense-reports.tsx` invokes it for submission, approval, and rejection notifications (`pages/expense-reports.tsx:13,303,361,423`). Approval/rejection recipients are dynamic report-owner addresses, so an internal-secret/fixed-recipient version of the old route cannot preserve this browser behavior.

B1's repo-wide grep would expose the omitted calls, but satisfying it requires out-of-scope edits and a secure server-side expense-report notification boundary that the phase does not design.

Required plan change: include `utils/emailUtils.ts` and `pages/expense-reports.tsx`, move all three expense-report mail operations behind authenticated/authorized server routes or an existing server mutation, and test authorization, recipient derivation, and submission/approval/rejection notification behavior. The browser must not choose arbitrary recipient, subject, or HTML.

### R2-B-06 — T2 plans against a CI fixture mechanism that does not exist

T2 claims it will add to an “existing seeded-synthetic-tenant mechanism” (`PLAN.md:102`). In reality, the e2e job only writes Supabase secrets or placeholders and runs the public smoke spec; it never starts or seeds Supabase (`.github/workflows/ci.yml:85-112`). The smoke spec explicitly says the synthetic tenant does not yet exist (`tests/e2e/smoke.spec.ts:3-6`). Existing authenticated specs rely on QA credentials and some conditionally skip; they are not an isolated CI fixture.

The plan therefore leaves the key test architecture undecided: an isolated local Supabase stack seeded in the e2e job versus a shared remote QA project with lifecycle/cleanup. “Read the existing seeding path first” cannot resolve a path that is absent, and A6/A8/B5/B9/B11 depend on T2.

Required plan change: choose the CI topology in the plan. Prefer starting an isolated local Supabase stack in Gate 4, applying migrations, creating synthetic admin plus a disallowed role, and guaranteeing teardown/idempotency. Specify the seed command, environment wiring, auth-state creation, cleanup, and fail-on-skip implementation. Re-size T2 after that design is explicit.

### R2-B-07 — D-02 is not enforceable once the free-form campaign composer exists

D-02 and the non-goal say prices exist only in brochure PDF bytes and never in an email body (`PLAN.md:25,34`). A1 guards compiled browser chunks and A5 tests fixed lead-email copy, but B8/B9 deliberately introduce a general rich-text campaign body. Nothing in the campaign save, test-send, queue, or frozen-HTML path rejects INSPIRA price literals or monetary content (`PLAN.md:341-380`). An admin can type “€1.560” and every stated acceptance criterion can still pass.

Required plan change: Brent must choose one of two coherent contracts. Either narrow D-02 to repository-authored INSPIRA web/transactional copy and stop claiming that arbitrary campaign content is structurally price-free, or add server-side validation on save/test-send/queue for the protected INSPIRA amounts/content and test the rejection. Tests of fixed templates do not enforce a rule on user-authored content.

### R2-B-08 — The v2 phases still do not satisfy the frozen sizing contract

The SOP requires every phase to stay at approximately 600 net lines, contain exactly one architectural concern, and be executable end-to-end in one session (`AGENT-WORKFLOW.md:33-43,187-193`). V2 still contains phases that admit they are too large and defer splitting until context pressure:

- A6 combines a content-heavy seven-section landing page, an accessible stateful form, and route-mocked e2e; its risk calls the phase “genuinely large” (`PLAN.md:187-200`).
- B9 combines campaign CRUD APIs, test-send, two pages, the composer, upload, preview, sidebar wiring, unit tests, and e2e; its risk calls it the largest UI phase (`PLAN.md:356-369`).
- B4 puts seven nontrivial SECURITY DEFINER functions and about 45 behavioral assertions in one phase (`PLAN.md:285-296`).
- B10 combines queue API behavior, concurrent drain worker, manual invocation, retry API, cron configuration, batch integration, terminal-state logic, and three suites (`PLAN.md:371-384`).

There are also explicit multi-concern phases: A7 combines site-wide navigation/flipbook rewiring with replacement of a high-blast-radius contact-email transport; B7 combines public unsubscribe UX/API with signed asynchronous webhook ingestion; B11 combines send/metrics UI with production deliverability/compliance preflight (`PLAN.md:202-214,327-339,386-399`).

“Split into a round 2 if context gets tight” is not a phase split: it retains one oversized phase and discovers the contract breach after execution begins. Required plan change: pre-split these into independently green phases, or have Brent explicitly override the SOP caps for named phases and accept the review/context risk. Without one of those actions, the plan violates its own BLOCKING taxonomy.

## SHOULD-FIX

### R2-S-01 — A9 cannot assert mail disposition through the response contract it specifies

A5 requires the same 200 response for first and duplicate lead submissions and soft-fails email (`PLAN.md:178-179`). A9 says its unmocked CI flow will assert mail “soft-failed-or-sent via API response contract” (`PLAN.md:232`). No specified response field distinguishes those outcomes, and exposing one would weaken the otherwise deliberate uniform response. Assert `brochure_sent_at`/captured provider-boundary evidence instead, while keeping the public response uniform.

### R2-S-02 — Platform import still assigns a legal conclusion from account state

D-12 correctly says platform approval is not marketing permission, but B6 selects approved staff and assigns `customer_relationship` automatically (`PLAN.md:44,319`). The confirmation text is evidence only that an admin clicked, not that the relationship exists for every selected row. Require an explicit attestation recorded with actor/time/source selection, support excluding individual rows, and test that approval alone never reaches the RPC without that attestation.

### R2-S-03 — The lead transition helper is not authoritative at the database boundary

D-03 calls `canTransitionLead` authoritative and A5/A8 route all planned writers through it, but A2 grants authenticated admins direct table UPDATE (`PLAN.md:35,134-136`). A caller using the admin JWT through PostgREST can bypass the graph. Either describe the helper honestly as the application authority, or restrict direct UPDATE and enforce transitions through a server/RPC boundary.

### R2-S-04 — B5's non-admin e2e criterion needs a disallowed-role fixture

T2 requires only an admin fixture, while B5 requires an authenticated non-admin denial in e2e (`PLAN.md:102-108,306`). Add a synthetic disallowed role to T2 rather than allowing B5 to improvise credentials or downgrade this to an unauthenticated redirect.

### R2-S-05 — Visual and production checklists need named evidence locations

A3 says rendered PNGs are “attached to the executor report,” while the fixed executor-report format has no durable attachment path; A9/B11 similarly rely on ledgered external evidence (`PLAN.md:150,232-240,394-398`). Specify repo artifact paths or CI artifact names and the exact ledger links/results required. Otherwise “performed” remains partly self-graded.

## NITS

### R2-N-01 — The plan/ledger phase count is inconsistent

The ledger says the work was split into 21 phases, while the active index contains A0, T2, A1-A9, and B1-B11: 22 executable phases. This does not affect sequencing but should be corrected before estimates are treated as meaningful.

### R2-N-02 — B3's “admin CRUD ×5” wording hides materially different table semantics

Even after resolving R2-B-02, state the policy matrix per operation and table. Contacts, immutable send history, suppression tombstones, webhook ledger, and campaign drafts should not all share the same CRUD vocabulary.

## NOTES ON THE PLAN ITSELF

### Verification of all 13 round-1 BLOCKING remediations

| Round-1 finding | Round-2 result | Codebase/plan verification |
|---|---|---|
| B-01 client bundle price leak | **CLOSED** | Public/commercial modules are split and A1 adds a production-chunk assertion. |
| B-02 consent/tenancy/privacy | **PARTIAL — still blocking** | Stable notice, explicit timestamps, owner-approved FNE-global tenancy, staff-only import intent, and basis fields are present. The required lead checkbox still bundles request processing with later broadcasts; see R2-B-01. |
| B-03 erasure/suppression/history | **PARTIAL — still blocking** | Five-table model, restricted send FK, anonymization RPC, and hash tombstone are present. Admin `ALL` can delete the tombstone and anonymized-row constraints are undefined; see R2-B-02. |
| B-04 SECURITY DEFINER/tests | **CLOSED** | Empty search path, schema qualification, PUBLIC/anon/authenticated revoke, service-role grant, DB-agent phase, and real behavioral pgTAP are all specified. |
| B-05 reliable send/state/metrics | **PARTIAL — still blocking** | Cron, retry and metrics RPCs, partial-failure state, and server-owned liveness are present. Queue/idempotency/terminal concurrency contracts still conflict; see R2-B-04. |
| B-06 open relay prerequisite | **PARTIAL — still blocking** | B1 is correctly a prerequisite, but it misses the live browser expense-report caller chain; see R2-B-05. |
| B-07 webhook/unsubscribe | **PARTIAL — still blocking** | Svix, raw cap, future/past tolerance, pair-scoped unsubscribe, 5xx failures, and broader event names are present. Dedup is not atomic and two frozen events lack effects; see R2-B-03. |
| B-08 brochure gating fiction | **CLOSED BY OWNER DECISION** | D-05, cache headers, routes, and UI behavior consistently implement UI-gated but publicly shareable. |
| B-09 broken intermediate phases | **CLOSED** | A5 now depends on A4; links/sidebar land with targets; B9 keeps campaigns draft-only until B10. |
| B-10 actual-site mismatch | **CLOSED** | A7 explicitly covers both `pages/index.tsx` and the separate `pages/programas.tsx` INSPIRA flipbook and removes the broken tracker call. |
| B-11 CI/behavioral tests | **PARTIAL — still blocking** | Mandatory non-skipping specs, DB behavior tests, and track-level flows are planned. T2 assumes a seed topology the actual CI does not have; see R2-B-06. |
| B-12 lead state machine | **CLOSED** | The graph, reopen rule, common helper, and full allowed/denied matrix are now explicit. |
| B-13 migration/process conflict | **CLOSED** | DB-agent rounds, forward-only rollback, governing review-request path, and no-deployment posture now agree with repo rules. |

### Frozen-decision assessment

- D-01, D-03, D-05, D-09, D-10, and D-11 are acceptable as frozen.
- D-04 is acceptable only after replacing blanket admin `ALL` with the operation-specific policies required by R2-B-02.
- D-06 has the right table/function direction, but its “permanent” guarantee is not true until R2-B-02 and R2-B-03 are fixed.
- D-07 is not safe to freeze with the current terminal predicate and conflicting repeated-send/zero-queue contracts.
- D-08 is not safe to freeze with non-atomic insert-first deduplication.
- D-12 is not safe to freeze as evidence of later broadcast permission while the purposes remain bundled.
- D-02 requires Brent's explicit interpretation because a general campaign composer makes its current absolute wording false.

### Precise arbitration required from Brent

1. **Consent:** Does requesting a brochure force consent to later broadcasts, or must later marketing be a separate optional choice/alternative lawful basis? Codex's position is that the current single required checkbox does not close round-1 B-02.
2. **Suppression authority:** Is the tombstone truly permanent, or may an authenticated admin delete it directly? Codex's position is that owner-approved permanence requires no admin DELETE policy.
3. **Price boundary:** Does “PDF bytes only” govern admin-authored campaign bodies? If yes, add server enforcement; if no, narrow D-02/non-goal explicitly.
4. **Sizing contract:** Must the committed SOP caps be honored? Codex's position is that the named phases must be split before dispatch. The only coherent alternative is a logged owner override for each named exception.

The relay caller omission, webhook transaction hole, sender terminal race, and missing CI seed topology are implementation-plan defects rather than product preferences; they should be corrected regardless of those four owner decisions.
