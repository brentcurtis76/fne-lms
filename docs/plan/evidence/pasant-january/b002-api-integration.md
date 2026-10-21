# PASANT-B002b — January registration API on the accepted program-interest RPCs

Status: PROVISIONAL CODE, NOT VALIDATED (PASANT-B002b-local-r1, 2026-10-15). Authored against the B002a database contract
([b002-database-contract.md](b002-database-contract.md)) without changing it. No SQL, schema, policy or grant was written.
No test, type-check, lint, build, pgTAP, PostgREST or browser gate has run on this code. C008 stays open until those gates and
independent review pass.

## 1. Request contract (`POST /api/pasantias/lead`)

- `cohort: "enero-2027"` needs `program`: exactly one of `"inspira"`, `"mirada-profunda"` (contract §2), as that exact string.
  An array of any length, an unknown, re-cased, padded or non-string value is refused with 400 `fields.program`. A missing or
  empty value is also refused with 400. Interest in both programs means two POSTs with the same address; the database keeps
  one contact with two interests.
- The public cohort (`COHORT_ID`, still `octubre-2026`) is single-track. It accepts no `program`: absent, `null` or `""` are
  accepted, and anything else is a 400, never silently dropped. The October form posts no `program`, so its request, writes,
  brochure reply and response are unchanged.
- Other fields, caps, the strict-`true` processing consent and the strict-`true` marketing opt-in are the shared
  `validateLeadSubmission` rules. Method check, the 5-per-minute IP rate limit and the honeypot run first, as before.
- Every success answers the same `200 {"success":true}`: new contact, repeat, second program, October. Nothing in the body says
  whether a contact existed or whether mail was sent.

## 2. Write path (January)

Exactly one `supabase.rpc('pasantias_submit_program_interest', …)` call per POST, through the service-role client. All 18
argument keys of the accepted signature are always sent, with absent optional values as `null`. The values are the validated
ones: `p_processing_consent: true`, the server's `PRIVACY_NOTICE_VERSION` as the consent version, and the marketing version only
when `p_marketing_opt_in` is true. The function writes the contact and the interest in one transaction. The contact rules (no
marketing withdrawal, `source_path` kept when absent, `dismissed → new`, `notes`/`brochure_sent_at` untouched) belong to the SQL.
The route issues no `pasantias_leads` read or write for January. There is no second write, so there is no partial-success state.

Error mapping: `22023` → 400 "Revisa los datos del formulario." (the two validators drifted; nothing written);
`PGRST202`/`42883`/`42P01` → 503 (objects not deployed); any other error, or no returned row → 500. No reply or notification
is sent on any of these paths.

## 3. Reply suppression (January)

The submitted interest's own claim owns suppression. `pasantias_claim_program_reply(interest_id)` runs only for the interest this
POST returned. If it is not won, nothing is sent. If it is won, one acknowledgement for that program is sent and the claim is
settled with the token that claim returned:

| Send result | `p_outcome` | Effect (SQL) |
|---|---|---|
| provider accepted | `provider_accepted` | claim kept, `reply_provider_accepted_at` stamped (never "delivered") |
| `not_configured`, `rejected` | `not_sent` | pre-claim value restored; the next submission may retry |
| transport threw / anything else | `ambiguous` | claim kept for its 24 h |

The mapping is `programReplyOutcome`. It releases only on the same known failures as October's `canReleaseAutoReplyClaim`. A
result without a failure kind counts as ambiguous. A settle that returns `false` (stale token) or errors is only logged. Claim
errors skip the acknowledgement. The internal FNE notification is independent and sent for every stored submission.

Mail goes through the real `deliverOutboundEmail` with `PUBLIC_OUTBOUND_EMAIL`. The three senders take an optional second
argument, `{ transport?: EmailTransport }` (`LeadEmailDependencies`), which is passed to the provider's existing injection
seam only when it is supplied. The route passes nothing, so production still builds the Resend transport from
`RESEND_API_KEY`. `lib/email/**` is unchanged.

## 4. January acknowledgement — bounded until B003

The only brochure this app serves (`/api/pasantias/brochure`) is October's, and B003 owns January documents. So the January
acknowledgement has **no document link**. It names one program and the cohort label, verbatim from the contract (`cohort.label`
p.1, `<program>.name` p.3). It contains no dates, schools or prices. Its subject is `Recibimos tu solicitud · <program> · Cohorte
Enero 2027`. The FNE notification adds a `Programa` row and the January label. October messages render byte-identically.

Pending interface for B003: a per-program January document URL (or equivalent) passed to `renderLeadProgramAutoReplyHtml` /
`sendLeadProgramAutoReply`, resolved before the claim the way `buildBrochureUrl` is for October. Until then, no link is sent.
PM decision (2026-10-15, review r1): this provisional no-link acknowledgement is allowed within local B002b authorship. B003's
correct documents and the cumulative release gates are still mandatory before any release. No deployment or real mail is
authorized.

## 5. Evidence status

- Authored focused tests (NOT RUN):
  - `__tests__/api/pasantias-lead.test.ts`: January cases against an evaluated in-memory model of the three RPCs. A forced
    override replaces the model's answer without mutating it. It includes the delayed stale-owner case: A's acknowledgement
    stalls past 24 h, B claims anew, then A settles `not_sent` with its own captured token. That settle is refused, and B's
    open claim stays unchanged until B settles.
  - `__tests__/lib/pasantias-leads.test.ts`: IDs pinned to the contract JSON, single-program validation, October single-track.
  - `__tests__/lib/pasantias-emails.test.ts`: settlement mapping, contract-verbatim copy, no document link, October
    notification unchanged. It also runs the senders through the real provider with an injected transport (accepted,
    rejected and thrown), plus missing configuration without a transport, the sender rule under injection, and the
    default Resend path. Sender and key are synthetic, and a mocked `Resend` refuses construction.
- The model checks how the route uses the RPCs. It is not evidence for the SQL. SQL behavior is pgTAP 112 (historical B002a
  acceptance, original state). Real-PostgREST argument resolution, actual concurrency and browser journeys are still open
  gates: January program choice, same-email both programs, repeat, invalid consent, no enumeration, and October A9 4/4.
- Not changed: `cohort-public.ts` (January is not publicly switched on), the October brochure, B003 page/form/documents, B004
  admin, auth/RLS, migrations.
