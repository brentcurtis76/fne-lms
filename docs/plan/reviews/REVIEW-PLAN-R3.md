# CODEX REVIEW — INSPIRA Comms plan v3 closure confirmation

VERDICT: FAIL

Six of the eight round-2 BLOCKING findings are closed, all four arbitrated decisions are represented in v3, and all five round-2 SHOULD-FIX items have valid dispositions. Two residues remain. Both arise from the v3 remediations themselves, so they are within this confirmation review's narrow scope.

This is not a request for another Codex round. Per SOP §1.5 and Brent's instruction, the two numbered residues under **NOTES ON THE PLAN ITSELF** are now for Brent to accept, re-plan, or backlog individually.

## BLOCKING

### R3-B-01 — The atomic-webhook fix adds a permanent PII copy that anonymization does not scrub

R2-B-03's retry-loss defect is fixed correctly: D-08 and B4b put dedup insertion and the event effect in one transaction, B7b calls only that RPC, and the tests cover rollback followed by successful reprocessing (`PLAN.md:40,230-238,255-261`).

However, v3 adds the full webhook `payload jsonb` to `email_webhook_events`, while D-04 makes webhook history non-deletable and D-06 anonymizes only the contact identity columns and the send email snapshot (`PLAN.md:36,38,212,235-236`). Resend's email-event payload includes the recipient addresses in `data.to` and the subject ([official delivered-event schema](https://resend.com/docs/webhooks/emails/delivered)). After `anonymize_email_contact`, the same person's address can therefore remain indefinitely in the webhook ledger. That reopens R2-B-02's anonymize-only erasure guarantee through a column introduced to fix R2-B-03.

Required closure: specify a non-PII event ledger payload, such as an allowlisted operational subset that excludes `to`, `cc`, `bcc`, subject, and other identity-bearing fields, or extend anonymization to scrub every webhook row linked by Resend email ID. Add pgTAP proving that anonymization leaves no recipient email in contacts, sends, **or webhook events**, while preserving the dedup key and metrics.

### R3-B-02 — The non-blocking price warning still has no coherent client/server boundary

The arbitration itself is recorded faithfully: D-02 is narrowed to repository-authored surfaces and campaign content is explicitly outside the structural prohibition (`PLAN.md:25,34`). B8/B9b also require a non-blocking warning and a test (`PLAN.md:263-284`).

The proposed implementation is not yet executable without risking D-01. B8 says `detectProtectedAmounts(text)` uses the protected literals from a server-held list, but also drives a live client preview while the client receives only a “boolean/regex-safe derivative” (`PLAN.md:265-267`). A derivative containing the protected numbers ships those commercial values into `.next/static` and fails the D-01 guard. A Boolean requires an authenticated server-check endpoint, but no such route or request contract is in scope. Hashes are not a sound confidentiality boundary for a tiny, guessable set of prices.

Required closure: choose one boundary explicitly:

- use a generic client-side currency/amount pattern containing no protected values, accepting broader warnings; or
- add an authenticated server-side warning endpoint that imports the commercial data server-only and returns only a Boolean.

The leak assertion and a warning-path test must cover the chosen design.

## SHOULD-FIX

None remain from round 2. See the disposition table below.

## NITS

### R3-N-01 — D-12 contradicts itself about safe defaults

D-12 says there are “no DB defaults on any consent/basis column” and then correctly specifies `marketing_opt_in ... DEFAULT false` (`PLAN.md:44,127`). A false default cannot manufacture consent and is the safe choice. Rewrite the broader sentence as “no default may assert consent or a legal basis.”

### R3-N-02 — The arbitration record says seven phases were split, but lists eight

The ledger and resulting index show eight splits: A6, A7, B1, B4, B7, B9, B10, and B11 (`LEDGER.md:42`; `PLAN.md:53-86`). The resulting count of 30 executable phases is correct; only “7 phases pre-split” in the Decision Log (`PLAN.md:333`) is wrong.

## NOTES ON THE PLAN ITSELF

### Round-2 BLOCKING closure matrix

| Round-2 finding | Closure result | Verification |
|---|---|---|
| R2-B-01 — bundled consent | **CLOSED** | D-12 defines required processing consent separately from optional, unchecked marketing opt-in, with separate timestamps/versions. A2 supplies the two-shape CHECK; A5 persists server-stamped evidence; A6b tests submission without marketing opt-in (`PLAN.md:44,123-130,141-166`). |
| R2-B-02 — suppression/anonymization not structural | **STILL OPEN: residue 1** | Per-operation SELECT-only RLS, no authenticated writes/deletes, `anonymized_at`, two-shape identity CHECK, idempotent RPC, and delete-denial pgTAP are all present (`PLAN.md:36,38,208-242`). The new webhook payload remains outside that anonymization surface; see R3-B-01. |
| R2-B-03 — lossy webhook dedup | **CLOSED** | `process_webhook_event` makes ledger insert + effect atomic; failure rolls both back; B7b maps each event into one RPC; `sent` and `delivery_delayed` are defined ledger-only effects (`PLAN.md:40,230-238,255-261`). |
| R2-B-04 — contradictory/racy sending | **CLOSED** | Zero queue stays draft and returns 422; repeated send returns 409; `failed` campaign status is removed; completion requires zero pending and zero sending; two-worker refusal is tested; drain work is bounded (`PLAN.md:39,218-228,286-301`). |
| R2-B-05 — relay misses browser callers | **CLOSED** | The unchanged code still has the exact caller chain identified in R2 (`utils/emailUtils.ts:9-17`; `pages/expense-reports.tsx:303,361,423`). B1a now migrates those sites to server-derived recipients and tests all three flows; B1b deletes both relay routes only afterward (`PLAN.md:187-202`). |
| R2-B-06 — nonexistent CI fixture assumption | **CLOSED** | V3 now states the real current CI condition and makes T2 build an isolated local Supabase topology, seed admin+docente, create both storage states, enforce a mandatory non-skipping list, and run the fixture spec (`PLAN.md:48,107-117`). |
| R2-B-07 — unenforceable absolute D-02 | **STILL OPEN: residue 2** | Brent's narrowing is faithfully recorded, but the required warning's data boundary remains contradictory; see R3-B-02. |
| R2-B-08 — sizing contract | **CLOSED BY ARBITRATION IMPLEMENTATION** | The index contains exactly 30 executable phases. A6, A7, B1, B4, B7, B9, B10, and B11 are pre-split into independently ordered `a`/`b` phases (`PLAN.md:53-89`). All listed branch names remain within the 20-character convention. |

### Four arbitrated decisions

1. **Separate marketing opt-in — faithfully implemented.** Separate controls, columns, evidence shapes, optionality test, import restriction, and resubmission semantics are explicit.
2. **SELECT-only RLS/no authenticated DELETE — faithfully implemented, subject to residue 1.** The operation matrix itself is correct; the residue is incomplete PII coverage, not an RLS bypass.
3. **Narrowed D-02/non-blocking warning — product decision recorded faithfully, implementation boundary still open as residue 2.**
4. **Thirty-phase pre-split index — faithfully implemented.** There are 30 executable phase rows and the eight targeted large/multi-concern phases are split.

### Round-2 SHOULD-FIX dispositions

| Finding | Disposition |
|---|---|
| R2-S-01 — A9 mail assertion through uniform response | **CLOSED.** A9 checks consent and `brochure_sent_at` through the authenticated admin API; the public response remains uniform (`PLAN.md:183-185`). |
| R2-S-02 — platform import legal conclusion | **CLOSED.** B6 adds selectable per-row exclusion, explicit attestation, actor/time/source/note evidence, server allowlisting, and a test proving no RPC call without attestation (`PLAN.md:244-249`). |
| R2-S-03 — lead helper bypassable through direct DB update | **CLOSED.** D-04/A2 deny all authenticated writes; A8 uses guarded service-role routes and the transition helper (`PLAN.md:35-36,123-130,179-181`). |
| R2-S-04 — no disallowed-role fixture | **CLOSED.** T2 seeds admin and docente and creates storage state for both; dependent e2e phases use both (`PLAN.md:107-117`). |
| R2-S-05 — evidence existed only in reports/chat | **CLOSED.** The shared contract and A3/A9/B11b use committed `docs/plan/evidence/<phase>/` paths linked from the ledger (`PLAN.md:9,93-95,133-135,183-185,307-309`). |

### Numbered residue for Brent's §1.5 decision

1. **Webhook payload PII after erasure (R3-B-01):** accept the residual retention, re-plan B3/B4b to store only a sanitized payload, or explicitly backlog it with an owner/privacy exception. Codex recommends re-planning before schema execution.
2. **Composer-warning boundary (R3-B-02):** accept an underspecified implementation, re-plan B8 as generic client detection or a server Boolean check, or backlog the warning while retaining the narrowed D-02 contract. Codex recommends choosing the generic client pattern or explicit server endpoint now.

No other new findings were sought or raised.
