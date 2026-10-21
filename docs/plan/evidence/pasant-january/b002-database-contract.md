# PASANT-B002a — January program-interest database contract

Status: DORMANT FOUNDATION (PASANT-09 r0). No application caller uses these objects; B002b wires
`pages/api/pasantias/lead.ts` to them and B002 independently verifies cumulative PASANT-C008. This child does not
close C008. Written by the executor before any SQL was authored; the dedicated DB subagent authored the migration
and pgTAP suite against this contract (authorship and hashes in the PASANT-09 executor report).

Migration: `supabase/migrations/20261013020000_pasantias_january_program_interests.sql`.
pgTAP: `supabase/tests/112-pasantias-program-interests-rls.sql`.

## 1. Inputs reused (not invented)

- Identities from the ratified contract §2: cohort `enero-2027`; programs `inspira`, `mirada-profunda`.
- Contact, consent and triage semantics from `pages/api/pasantias/lead.ts` (current shipped write path) and
  `lib/pasantias/leads.ts`: field caps (`LEAD_FIELD_LIMITS`), `num_people` 1–60, required processing consent
  re-stamped on every submission with the server clock, marketing opt-in all-or-nothing and never cleared by an
  unchecked box, `source_path` written on update only when a fresh usable path arrived, `notes` never written by a
  submission, D-03 `dismissed → new` re-open on resubmission (every other status kept), `brochure_sent_at` never
  written by a submission.
- Legal fields D-12 (`consent_accepted_at`, `consent_notice_version`, `marketing_*`) and the A-13 notice version
  (`PRIVACY_NOTICE_VERSION`, today `2026-07-v1`), supplied by the caller and stored verbatim.
- Access posture D-04 (grant-list, not denylist) and D-11 (FNE-global adult-professional tenancy). Adult
  professional contact data only; no minor data, no new minor-data table.
- 24 h reply window (`AUTO_REPLY_DEDUP_WINDOW_MS`) and the release rule of `canReleaseAutoReplyClaim`: release only
  when nothing can have left the process (`not_configured`, `rejected`); a thrown transport is ambiguous and keeps
  the claim.

## 2. Schema (additive only)

`public.pasantias_leads`: one additive constraint `pasantias_leads_id_cohort_key UNIQUE (id, cohort)` so the
interest can reference the lead's cohort. No column, row, default, policy or grant of the leads table changes;
`pasantias_leads_email_cohort_key` stays the contact identity.

`public.pasantias_lead_program_interests`:

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `lead_id`, `cohort` | uuid, text NOT NULL | FK `(lead_id, cohort) → pasantias_leads(id, cohort)` ON DELETE CASCADE; the interest can only belong to a lead of the same cohort |
| `program` | text NOT NULL | — |
| `consent_accepted_at` | timestamptz NOT NULL, no default | server clock of the latest accepted submission for this program |
| `consent_notice_version` | text NOT NULL, no default | 1–64 chars, the notice version that submission accepted |
| `reply_claimed_at` | timestamptz NULL | time the current/last reply attempt was claimed — NOT a delivery stamp |
| `reply_claim_token` | uuid NULL | owner of the open claim; NULL when no claim can be settled |
| `reply_claim_previous_at` | timestamptz NULL | value `reply_claimed_at` held before the open claim; restored on known-not-sent |
| `reply_provider_accepted_at` | timestamptz NULL | the provider accepted a message for this interest; never mailbox delivery |
| `created_at`, `updated_at` | timestamptz NOT NULL | first acceptance / last change (`set_updated_at` trigger) |

Constraints: `CHECK (cohort = 'enero-2027' AND program IN ('inspira','mirada-profunda'))`;
`UNIQUE (lead_id, program)`; `reply_claim_token IS NULL OR reply_claimed_at IS NOT NULL`;
`reply_claim_previous_at IS NULL OR reply_claim_token IS NOT NULL`. Historical (October) leads have a different
cohort, so the composite FK plus the CHECK make it impossible to attach a January interest to them; the migration
inserts no interest row and updates no lead row.

## 3. Access (explicit grant-list)

| Role | Table privileges | RLS rows | RPC EXECUTE |
|---|---|---|---|
| PUBLIC, anon | none (REVOKE ALL) | — | none |
| authenticated | SELECT only | permissive `pasantias_lead_program_interests_admin_select` FOR SELECT: active literal `admin` row in `user_roles` for `auth.uid()`; everyone else 0 rows | none |
| service_role | SELECT, INSERT, UPDATE, DELETE (no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) | BYPASSRLS | all three RPCs |

RLS enabled; restrictive `forced_password_change_guard` installed with `apply_forced_password_change_guard`, so an
active admin whose profile has `must_change_password = true` reads 0 rows even though the permissive predicate
admits them. All three functions are `SECURITY INVOKER`, `SET search_path = ''`, fully schema-qualified, owned by
the migration role, EXECUTE revoked from PUBLIC/anon/authenticated and granted to service_role only. No SECURITY
DEFINER function is added.

## 4. `public.pasantias_submit_program_interest` (service_role only)

Arguments (PostgREST body keys are the names): `p_cohort text, p_program text, p_first_name text, p_last_name text,
p_email text, p_institution text, p_phone text, p_role_title text, p_num_people integer, p_message text,
p_source_path text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_processing_consent boolean,
p_consent_notice_version text, p_marketing_opt_in boolean, p_marketing_notice_version text`. All are required keys
in the PostgREST call (no defaults); optional values are passed as JSON `null`.

Validation (before any write; any failure writes nothing): text values are `btrim`-ed, optional empty → NULL;
required first/last name, email, institution non-empty; caps first/last 80, email 140, institution 140, phone 40,
role 140, message 1000, utm 140, source path 200; email matches the client pattern
`^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$` (case-insensitive); `num_people` NULL or 1–60; `p_source_path` NULL or a
same-site path (starts `/`, not `//` or `/\`, no whitespace/control); `p_processing_consent` must be `true`;
`p_consent_notice_version` 1–64 chars; `p_marketing_opt_in` NOT NULL, and when true `p_marketing_notice_version`
1–64 chars; cohort/program exactly the ratified January pair.

Errors: SQLSTATE `22023` (PostgREST HTTP 400) with message `pasantias_submit_program_interest: <reason>`, reasons
`processing_consent_required`, `invalid_identity`, `invalid_<field>`; checked in the order identity → processing
consent → consent version → fields → marketing, first failure reported. Text inputs are trimmed of surrounding
whitespace (internal whitespace is not collapsed; the caller passes `validateLeadSubmission` output). `p_source_path`
is checked raw, like `sanitizeSourcePath`: surrounding whitespace is refused, `''` → NULL. The marketing version is
ignored when `p_marketing_opt_in` is false. Observed through the real PostgREST on the owned stack (PASANT-09
`evidence/d3-postgrest-smoke.log`): anon EXECUTE → HTTP 401 `42501`; authenticated EXECUTE → 403 `42501`;
type-malformed value (`p_num_people: "abc"`) → 400 `22P02` before the function runs; a missing argument key → 404
`PGRST202` (no matching signature).

Effect, in one statement each inside the function's transaction:
1. Upsert the contact on `(email_normalized, cohort)`. Insert: status `new`, contact, consent, `source_path`, the
   complete marketing tuple (`true/now/version` or `false/NULL/NULL`). Conflict: overwrite contact columns
   (names, email casing, institution, phone, role, num_people, message, utm), re-stamp consent; marketing columns
   only when this submission opts in; `source_path` only when non-NULL; `status` becomes `new` only from
   `dismissed`; `notes`, `brochure_sent_at`, `created_at` untouched.
2. Upsert the interest on `(lead_id, program)`: insert with this submission's consent evidence, or refresh
   `consent_accepted_at/consent_notice_version`; reply columns untouched.

Result: one row `(lead_id uuid, interest_id uuid, lead_created boolean, interest_created boolean)`. Concurrent
first submissions for the same email (same or different program) serialise on the unique indexes: one contact,
one interest per program, no lost opt-in (an opt-in is only ever added), no 23505 surfaced to the caller.
B002b keeps anti-enumeration (identical HTTP response for created/updated).

## 5. Reply claim primitives (service_role only)

`public.pasantias_claim_program_reply(p_interest_id uuid)` → one row `(claimed boolean, claim_token uuid,
claimed_at timestamptz)`. A single conditional UPDATE: claimable when `reply_claimed_at IS NULL OR
reply_claimed_at < now() - interval '24 hours'`; on success sets `reply_claim_previous_at = reply_claimed_at`,
`reply_claimed_at = now()`, a new `reply_claim_token`. Otherwise `(false, NULL, NULL)`. Unknown id → `22023`.
Claims are per interest: the other program of the same contact is independently claimable. The legacy
`pasantias_leads.brochure_sent_at` is never read or written.

`public.pasantias_settle_program_reply(p_interest_id uuid, p_claim_token uuid, p_outcome text)` → boolean, true only
when `p_claim_token` is still the open token. Outcomes:
- `not_sent` (known: `not_configured`, `rejected`) — restore `reply_claimed_at = reply_claim_previous_at`, clear
  token and previous; the interest is claimable again (retry).
- `provider_accepted` — keep the claim, set `reply_provider_accepted_at = now()`, clear token/previous.
- `ambiguous` (transport threw) — keep the claim for its 24 h window, clear token/previous; nothing is labelled.
Bad outcome/NULL arguments or an unknown interest id → `22023`. Settling clears the token, so a second settle with the same token returns
false.

Counterexamples the suite and scripts prove: (a) two concurrent claims of one interest → exactly one `claimed`;
(b) claims of `inspira` and `mirada-profunda` for one contact → both succeed; (c) stale owner A whose claim expired
and was re-claimed by B calls `not_sent` with A's token → false, B's claim unchanged; (d) `not_sent` by the owner →
claimable again, and the restored value is the pre-claim one (NULL or an expired stamp); (e) `ambiguous` → next
claim inside 24 h refused; (f) `provider_accepted` never writes `brochure_sent_at` nor any "delivered" field.

## 6. Out of scope here (B002b / later)

API wiring, PostgREST call from `lead.ts`, mail sending, January runtime/form/admin cutover (B003), admin listing of
interests, exports, pagination, full January CI (B006). October history stays unclassified.
