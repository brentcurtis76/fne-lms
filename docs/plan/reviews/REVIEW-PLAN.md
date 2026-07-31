# CODEX REVIEW — INSPIRA Comms plan

VERDICT: FAIL

I would not authorize execution against this plan. The direction is useful, but the current plan freezes several unsafe or internally contradictory decisions, depends on code that does not exist or behaves differently from the description, and does not test the highest-risk behavior. A green implementation of the stated acceptance criteria could still expose prices, import people without marketing consent, leave campaigns stalled or falsely completed, lose suppression history, and merge UI links that 404.

## BLOCKING

### B-01 — D-01 and D-02 would ship the supposedly brochure-only prices to every browser

P1 puts public cohort copy and prices in one `CURRENT_COHORT` object (`PLAN.md:35-36,80`) and then imports that object into `pages/index.tsx`; P5 does the same in `/pasantias`. Pages Router page dependencies are bundled for the browser. “Not rendered” is not the same as “not shipped”: the price fields can appear in client JavaScript even if JSX never displays them. That directly contradicts “prices live only in the full brochure PDF.”

Required plan change: split browser-safe cohort data from server-only commercial data. For example, keep public dates/schools/copy in a client-safe module and pricing/payment terms in a server-only module imported only by the brochure generator. Add a production-build assertion that the protected price values/field names do not occur in the public page chunks. D-01 must be rewritten; a single client-importable object is the wrong boundary.

### B-02 — The consent and contact model does not satisfy the repo's privacy invariants

The plan treats consent as a timestamp rather than evidence:

- P2 gives `consent_accepted_at` a `default now()`. The database can therefore manufacture “consent” for callers that never collected it.
- The linked privacy policy renders “Última actualización” from the current date on every request (`components/PrivacyPolicyContent.tsx:11-13`). There is no stable notice version to record.
- P8 gives contacts `subscribed_at default now()`. P10 then imports every approved `profiles` row and every `tractor_signups` row. `approval_status='approved'` is platform access, not marketing consent.
- P10 has no role/age exclusion, consent-basis field, notice version, purpose, acquisition time, or evidence reference. The owner checklist cannot repair a schema that cannot represent the answer.
- The three email tables and `pasantias_leads` omit `school_id`, contrary to the current invariant “`school_id` en cada fila” (`PROJECT_STATE.md:27-35`). If global comms data is a legitimate exception, that exception needs an explicit owner decision and a replacement tenancy/access rule before schema work.
- The repo explicitly gates new minor data on consent plus an EIPD reference (`PROJECT_STATE.md:31`). A blanket `profiles` import is not future-safe once student/family identities exist.

Required plan change: add a privacy/data-governance phase before P2/P8. It must decide the tenant model, define a versioned consent/legal-basis record, distinguish lead-response consent from broadcast-marketing permission, document the minor-role exclusion and EIPD position, and state retention/erasure behavior. `consent_accepted_at` must be explicitly supplied, not defaulted. Imports must be allowlisted by a provable marketing basis, not by account approval.

### B-03 — D-06's exact three-table model loses compliance state and campaign history

P9 hard-deletes `email_contacts`, while P8 defines `email_campaign_sends.contact_id ON DELETE CASCADE`. Deleting a contact therefore deletes send history and changes past campaign metrics. Re-importing the same address creates a fresh subscribed contact and forgets the previous unsubscribe/suppression. That is both an audit problem and a practical way to mail someone who opted out.

The same arbitrary “exactly 3 tables + exactly 3 functions” freeze prevents a clean webhook-delivery/idempotency record, even though [Resend documents webhooks as at-least-once and identifies `svix-id` as the deduplication key](https://resend.com/docs/webhooks/introduction).

Required plan change: reject the exact-cardinality constraint. Specify erasure semantics that preserve non-PII campaign accounting and durable do-not-contact state (for example anonymized sends plus a lawful suppression tombstone/hash, subject to owner/privacy review). Define whether contact deletion is anonymization, restricted hard deletion, or another explicit workflow. Metrics must not change when a contact exercises erasure.

### B-04 — The SECURITY DEFINER functions are both under-specified and effectively untested

The baseline grants all future functions to `anon` and `authenticated` by default (`supabase/migrations/00000000000000_baseline.sql:26097-26100`), in addition to PostgreSQL's normal `PUBLIC` execute posture. P8 says only “EXECUTE revoked from anon+authenticated.” The migration must revoke from `PUBLIC` as well and explicitly grant only the intended execution role. `SET search_path = public` is also weaker than an empty search path with fully qualified references for SECURITY DEFINER code.

More importantly, P8's pgTAP plan tests only RLS/privileges. It never executes the three functions' business contracts. P10 “tests” non-resurrection by checking that an API mock received rows, and P14 “proves” queue/claim concurrency by mocking the RPC contract. Those tests cannot detect a broken `ON CONFLICT`, tag predicate, stale claim, subscription re-check, `SKIP LOCKED`, or import update.

Required plan change: P8 needs real database tests for:

- empty-tag and overlapping-tag audience selection;
- double queue and concurrent claim behavior;
- stale versus non-stale claims;
- unsubscribe/suppression changes between queue and claim;
- skipped-row behavior;
- import insert/update/tag union;
- no resurrection of unsubscribed or suppressed contacts;
- function privilege denial through `PUBLIC`, `anon`, and `authenticated`;
- service-role execution success.

The migration must be dispatched through the repo's DB-agent flow, not treated as ordinary executor-written SQL (`PROJECT_STATE.md:34`).

### B-05 — D-07 is not a reliable sender and P14 has no coherent terminal-state model

The plan calls browser-driven ticks “reliable,” but closing the tab leaves a campaign in `sending` until a human happens to revisit it. At the owner-checklist scale of up to 50k recipients, 200 claims per tick means roughly 250 browser round trips. Background-tab throttling, network loss, logout, or a closed laptop can stall it indefinitely. “Resume is possible” is not the same as “delivery resumes.”

P14 also leaves critical behavior undefined or impossible within scope:

- claimed rows become `failed`, but `claim_campaign_sends` only claims `pending` or stale `sending`;
- the UI allegedly flips failed rows back to pending, but no authorized retry API is in scope;
- “no rows left” flips the campaign to `sent`, which can mark an all-failed campaign complete;
- the schema has campaign status `failed`, but no transition to it is specified;
- “sent” versus “completed with failures” is not defined;
- P14 promises one SQL `GROUP BY` for metrics, but adds neither a metrics RPC/view nor a metrics API route. Supabase's normal query builder cannot express the proposed arbitrary grouped aggregate;
- pre-send “exact count” can change before queueing, yet the confirmation calls it exact.

Required plan change: revise D-07 to a server-driven, durable worker/tick mechanism (a scheduled invoker is sufficient; it need not be a mega-function), with the UI observing status rather than owning liveness. Define a complete campaign/send state machine, retry authorization, partial-failure terminal state, stale recovery, and operational alerting. Split P14 into backend state machine/database behavior, worker, and UI/metrics phases.

### B-06 — The known open relay is a prerequisite, not backlog

`pages/api/send-email.ts` accepts arbitrary `to`, `subject`, and HTML without authentication. Track B proposes to share its Resend key/domain/quota with that route. An attacker can consume the daily quota, send abuse through FNE's domain, or damage sender reputation immediately before campaigns depend on it. Deferring this as a SHOULD-FIX makes the stated “reliable batch sending” goal unachievable.

Required plan change: add a Track-B prerequisite that authenticates/removes the relay, migrates its legitimate callers, removes `pages/api/test-email.ts`, and verifies there is no unauthenticated arbitrary-recipient path. Do this before any campaign test-send or production marketing configuration.

### B-07 — P11's webhook and unsubscribe contract is unsafe and incomplete

The hand-written signature criterion does not specify parsing the versioned/multi-value `svix-signature` header, rejecting timestamps too far in the future, or deduplicating `svix-id`. It disables Next's body parser without adding a raw-body size limit. The installed Resend SDK is 3.5.0 and has no webhook verifier (`node_modules/resend/dist/index.d.ts:510-519`), so “verify against current docs at implementation time” is not enough; the dependency strategy must be decided in the plan.

The event set also omits `email.failed` and `email.suppressed`, so an API-accepted message that later fails/suppresses can remain counted as sent. [Resend's current official event model includes both](https://resend.com/docs/webhooks/event-types). Finally, “always generic 200” conflicts with rate-limit 429 and would acknowledge a real database failure, preventing provider retry and falsely telling the user they were unsubscribed.

Required plan change: use a maintained verifier (upgrade Resend to a version with verification support or add `svix`), cap raw-body bytes, enforce past and future timestamp tolerance, persist/deduplicate `svix-id`, and test replay/multiple signatures. Handle at least `sent`, `delivered`, `failed`, `suppressed`, `bounced`, `complained`, `opened`, and `clicked` according to an explicit state table. Return generic 200 for unknown/invalid tokens, but 5xx on internal failure so unsubscribe/webhook callers can retry. Do not let a shared-IP rate limiter block standards-based one-click unsubscribe.

### B-08 — The “form-gated brochure” is actually a public, cacheable URL

The goal and decision log say the full brochure is form-gated. P4 creates a stable unauthenticated `/api/pasantias/brochure` route with `Cache-Control: public`; P3 emails that URL directly; P5 places the same URL in the success panel. Anyone who knows or receives the URL can bypass the form, and shared caches may retain it. This is obscurity, not gating.

Required plan change: either explicitly redefine the product decision as “UI-gated but publicly shareable” and get owner sign-off, or implement a short-lived signed download grant issued after successful lead persistence. The acceptance criteria and cache policy must match the chosen meaning.

### B-09 — The phase graph knowingly merges broken intermediate states

- P3 can send `/api/pasantias/brochure` before P4 exists because it depends only on P1/P2. Calling the otherwise-public P3 route after merge can send a 404 link.
- P9 deliberately adds `/admin/email/campaigns` to the live sidebar before P13 creates the page. `PLAN.md:271` says a pre-merge 404 is not allowed, while `PLAN.md:272` accepts that exact 404 “for a few days.”
- P4 says it may ship only the brochure and report the ficha as NOT DONE, even though P5 depends on both endpoints. A phase cannot be simultaneously DONE/mergeable and knowingly omit an acceptance criterion.
- P13 intentionally merges non-draft state stubs even though P14 is the implementation. This is acceptable only if campaigns cannot enter those states before P14; the plan does not state or test that invariant.

Required plan change: make P3 depend on P4 or defer all brochure mail until the integration phase; move the campaigns sidebar link to P13; split P4 before execution; and prevent queue/send state transitions until the real send phase is live. Every merged phase must leave all visible links and reachable routes coherent.

### B-10 — P6 does not match the actual site and cannot satisfy its own criteria

P6 expects `grep -rn "heyzine" pages/` to leave only the Directivos flipbook, but `pages/programas.tsx` has its own INSPIRA `showFlipbook` state and Heyzine iframe (`pages/programas.tsx:149-153,651-675`) plus a Directivos iframe. P6 scopes that page only for navigation/card work, so its acceptance criterion is impossible without expanding scope.

P6 also says to retain `trackFormSubmission` while removing Formspree. In reality that helper writes to the known-unmigrated `form_submissions` table and still contains a Formspree warning sender (`lib/formSubmissionTracker.ts:24-76,85-98`). On a clean schema, it logs the missing-table error and returns zero; at count 45 it still calls Formspree. “Retained for stats” is false.

Required plan change: inventory and remove/rewire both INSPIRA flipbooks across `index.tsx` and `programas.tsx`. Remove or redesign the Formspree-specific tracker; if stats are still required, the missing table/migration is no longer backlog and must be brought into scope with RLS/privacy tests.

### B-11 — The test plan does not put the new behavior behind a real gate

CI runs only `tests/e2e/smoke.spec.ts` (`.github/workflows/ci.yml:85-112`). None of the proposed Pasantías or email-admin specs will run on a PR unless CI changes. Authenticated existing specs commonly skip when credentials are absent, and the plan supplies no non-skipping seeded admin/community-manager fixture for P13/P14. A targeted local run that reports skipped tests can therefore be called green.

The proposed coverage also misses the behavior that matters:

- P5 mocks the lead API, so it does not prove form → API → DB → mail-state integration.
- P8 does not test SQL function semantics.
- P9 tests only an unauthenticated redirect, not the middleware role matrix.
- P13 tests draft navigation, not dirty-state protection, preview safety, or a real authenticated role.
- P14's only E2E assertion is “send disabled on empty draft”; it does not exercise progress, interruption, resume, retry, partial failure, completion, or metrics.
- P4 allows a component-tree assertion instead of verifying the generated PDF.

Required plan change: add a CI/test-infrastructure phase. Make the relevant targeted specs mandatory and non-skipping with synthetic fixtures. Add real DB contract tests and at least one end-to-end synthetic flow for each track. Middleware changes require explicit admin, community_manager, disallowed-role, multi-role, and revoked-role/session-invalidation cases, per the repo warning—not “if a matrix exists.”

### B-12 — D-03 does not define the state machine it claims

D-03 freezes `new → contacted → converted | dismissed`. P3 then reopens `dismissed → new`, and P7 permits PATCH to any enumerated status from any current status. A CHECK constraint on allowed values is not a transition machine.

Required plan change: define the allowed transition graph, including whether resubmission reopens a dismissed lead, enforce it in one authoritative layer, and test every allowed and denied edge. Do not call a four-value enum a state machine.

### B-13 — Migration/rollback/process instructions conflict with repo hard rules

The repo requires migrations through the DB-agent flow and never permits `DROP` (`PROJECT_STATE.md:34`). The plan assigns migrations to generic phase executors and P2's rollback explicitly proposes a follow-up table drop after production. D-10 also gives a review-request naming convention different from CLAUDE.md, while the plan's own review artifacts live under `docs/plan/reviews`.

Required plan change: state the DB-agent handoff for P2/P8, replace destructive rollback language with forward-only disable/deprecation behavior, and choose one review-request path/naming rule that actually matches the governing repo instructions.

## SHOULD-FIX

### S-01 — Several phases are materially under-sized

P4 (two designed PDFs, cache/fallback endpoints, tests and visual QA), P5 (full marketing page, accessible form and E2E), P8 (three tables plus concurrency-sensitive SQL), P13 (five API routes, two pages, two large components, upload, preview, auth and tests), and P14 (worker, state machine, progress, retries, failure list, metrics and tests) are not single-session phases at the quality bar stated. P13's “~650 lines” estimate is not credible for the listed surface. P4's and P13's “drop work if tight” clauses are permission to miss scope, not sizing controls.

Split these before dispatch. In particular, separate PDF generator from public delivery/cache, campaign API from composer UI, and sending backend from progress/metrics UI.

### S-02 — The rate-limit acceptance criteria overstate what `lib/rateLimit.ts` provides

The existing limiter is an in-memory LRU per Node process. On Vercel it is neither shared across instances nor durable across cold starts, so “5/min per IP” is not a guaranteed production control. It can still be used as best-effort protection, but anti-abuse acceptance must not rely on it. Lead mail amplification and expensive PDF generation need a distributed or database-backed control if the limit is security-relevant.

### S-03 — HTML and preview safety criteria are incomplete

P3 and P6 interpolate user-controlled lead/contact fields into email HTML but never require escaping. The existing `contact.ts` template is unsafe to reuse verbatim. P12 tests a TipTap text node and one link, but does not require escaping/safe URL handling for subject, preheader, hero URL, CTA label/URL, unsubscribe URL, image alt/src, or attribute quotes. P13's `iframe srcDoc` should be sandboxed so a renderer regression cannot execute in the admin origin.

Add hostile-string tests for every interpolation boundary and require a sandboxed preview with no scripts/forms/top navigation.

### S-04 — The TipTap reuse assumption is wrong

The shared editor only configures headings 2–3, lists, underline and StarterKit (`lib/tiptap/extensions.ts:13-30`). It has no Link or Image extension/UI and no heading 1. The news converter supports code/hard break and has an unsafe unescaped link path (`pages/api/admin/news.ts:20-99`); it does not support the exact image/horizontal-rule set P12 claims. “Supports the node/mark set the news converter supports” and the enumerated set are different requirements, while the proposed composer cannot author several of those nodes.

Define the actual campaign editor schema first. Either extend the shared editor deliberately with regression tests or narrow the renderer to the authorable schema plus the separate hero/CTA fields.

### S-05 — P9/P14 assume SQL query shapes the current API layer cannot express

“`DISTINCT unnest(tags)`” and “one GROUP BY over sends” are SQL, not ordinary PostgREST select expressions. No view/RPC for either is in P8, and P14 does not add a metrics API route. Specify the actual query boundary and include it in scope/tests rather than leaving the executor to improvise around D-06.

### S-06 — Resend dependency/response compatibility needs an explicit spike

The repo pins Resend 3.5.0. Its batch type is nested as `{ data: { data: [{id}] }, error }` (`node_modules/resend/dist/index.d.ts:248-265`), while current examples use a different-looking response shape, and this installed SDK has no webhook verifier. Mocked unit tests can easily encode the wrong version and pass.

Add a short dependency spike or explicit SDK upgrade phase that locks the batch result shape, custom header support, idempotency-key behavior, error-return (not only throw) handling, and webhook verification API. Tests must cover resolved `{error}` results as well as thrown errors.

### S-07 — The generated-downloadable acceptance criteria do not establish “better”

“Starts with `%PDF`,” page count, and presence of a price string do not catch clipped text, overflow, missing glyphs, bad page breaks, unreadable type, or a broken CTA. Allowing a component-tree assertion instead of output extraction weakens the criterion further. The repo already has a real React-PDF stack; the plan should require rendering every page to images and human/visual inspection at a named viewport/DPI, plus actual PDF text extraction for price leakage.

Manual cache overrides also undermine D-01/D-02 unless the override is separately reviewed. A manually uploaded ficha could contain prices while all generator tests pass.

### S-08 — Content correctness is self-graded against the plan, not an approved source

No source brochure/PPTX or signed content artifact exists in this branch. P1's tests merely assert that constants equal the same counts/numbers written in PLAN.md. Day 1 is explicitly unresolved even though 12 October is a school holiday, and testimonials/WhatsApp may ship empty. Before P1 freezes public copy, the owner needs to approve a versioned content brief covering itinerary, school list/count, experts/titles, prices/payment terms, claims such as “400+,” address, CTA contact details, and day-one shape.

### S-09 — Audience/tag semantics and send snapshot timing are unspecified

P8's array-overlap predicate means multiple selected tags are OR, not AND. The UI never tells the user. Audience count is live until queueing, so the modal cannot promise an exact recipient count before the transactional queue result. Specify OR/AND semantics and show the queued snapshot count as authoritative.

### S-10 — P11 should scope campaign unsubscribe updates to the resolved contact

When `c` is supplied, the send-row update must match both `campaign_id` and the contact resolved by the token. The current wording could be implemented as a campaign-wide update. Add this to the criterion and test a token paired with another campaign/contact.

### S-11 — Operational readiness is a checklist, not a gate

Domain authentication, marketing sender configuration, Resend quota, webhook registration, tracking configuration, privacy basis, and an internal canary audience are all required for Track B to work. Convert the owner checklist into a preflight gate with pass/fail evidence before real sending is enabled. “Soft-success” is appropriate for a persisted lead when mail is unavailable, but a campaign test-send must visibly report “not sent,” not success.

## NITS

- P1 accepts “at least 6 schools,” while P4 requires 7. Use one exact approved list.
- P9's middleware prefix should match `/admin/email` and `/admin/email/`, not arbitrary strings beginning `/admin/email...`.
- The plan references `AGENT-WORKFLOW.md`, but no such file exists in the repository. If it is external, name its authoritative location/version.
- “Santiago address” is not a postal address. The legal footer needs owner-approved organization identity and physical address.
- P4 should use RFC 5987-compatible `Content-Disposition` for accented filenames.
- P5's “inviting” and P7/P9's “house style” are subjective. Add concrete visual/accessibility checks or remove them as acceptance criteria.
- WhatsApp unfurl cannot be proven by a local DOM test. Keep it as a named post-deploy owner check with a specific debugger/device and recorded result.
- P8 defines campaign status `failed` without using it; either specify it or remove it.
- P9's send-history “placeholder” adds dead UI. Prefer omitting the detail until it can show real data.
- The 4–6 day estimate for 14 phases plus independent review loops is not a planning estimate I would schedule against.

## NOTES ON THE PLAN ITSELF

### Frozen-decision disposition

| Decision | Disposition | Review |
|---|---|---|
| D-01 | REJECT AS WRITTEN | One client-importable object leaks brochure-only prices. Split public and server-only commercial data. |
| D-02 | KEEP THE INTENT | Enforce it at bundle/output boundaries, not only JSX. |
| D-03 | REVISE | Dedicated leads table is reasonable; the transition graph and consent evidence are not. |
| D-04 | REVISE | Server-side service-role writes plus no anon table policy are sound, but tenancy, distributed abuse controls, audit, and DB-agent execution are missing. |
| D-05 | REVISE | Generation/cache is reasonable; public cache contradicts form gating, and unvalidated manual overrides break content/privacy invariants. |
| D-06 | REJECT | Exact table/function counts are arbitrary and obstruct consent, erasure, webhook idempotency, metrics, and durable suppression. |
| D-07 | REJECT | Browser-owned liveness is not reliable sending. Use a durable server-driven tick/worker with explicit states. |
| D-08 | KEEP THE INTENT, REBUILD THE MECHANICS | Structural unsubscribe/suppression is correct, but consent proof, replay handling, failure events, and unsubscribe failure semantics are missing. |
| D-09 | REVISE | Reuse is good, but the actual TipTap schema and installed Resend SDK do not match the assumptions. |
| D-10 | KEEP, CORRECT THE PROCESS | Apply the real DB-agent, migration, rollback, middleware-test, and review-request rules. |

### Missing phases

At minimum, the replanned index needs explicit phases/gates for:

1. Owner-approved content brief plus day-one decision and legal footer data.
2. Privacy/consent/tenancy/EIPD and erasure/suppression design.
3. Open-relay remediation before Track B.
4. Resend SDK/webhook/batch compatibility spike.
5. CI synthetic fixtures and mandatory non-skipping product E2E.
6. Durable send worker/state machine and operational monitoring.
7. Visual/output QA for both PDFs and email HTML.
8. End-to-end release verification before the feature is considered complete—not an unowned “PM-run after merges” note.

### Suggested sequencing correction

Track A should begin only after content/privacy decisions. Build browser-safe cohort data, then the lead schema/API and PDF output, then integrate the landing page with a real gated-download decision, then rewire all site links/flipbooks, then add admin triage.

Track B should begin with relay remediation and the Resend compatibility spike, followed by the consent/tenant-aware schema plus real SQL contract tests. Renderer/editor work can run independently. Contacts/imports must follow the approved consent model. Webhook/unsubscribe infrastructure must be operational before sending. The durable sender backend should land before its UI, and no sidebar/send control should become visible until its target is functional.

The plan has good instincts—Pages Router consistency, es-CL copy, no anon table policies, additive migrations, a sends ledger, scanner-safe GET, and per-recipient unsubscribe are all directionally sound. They are not enough to offset the blockers above. This plan should remain unfrozen.
