# Fase A5 — review request

**Branch:** `phase/a5-lead-api`
**Base:** `origin/main` @ `fb61b69`
**Commits:** 1 — lead API + transition helper + auto-reply/notification + tests + docs
**Executor round:** r1

---

## Objective and scope (copied from prompt `a5-1.md`)

> **Scope:** `lib/pasantias/leads.ts` (transition helper + validation),
> `pages/api/pasantias/lead.ts`, `lib/pasantias/emails.ts`,
> `__tests__/api/pasantias-lead.test.ts`, `__tests__/lib/pasantias-leads.test.ts`.
> **NOT in scope:** the landing page/form (A6a/A6b), admin triage (A8), PDF
> routes (A4).
>
> **Acceptance criteria:** [A1] POST-only, rate-limited 5/min, honeypot `website`
> → fake success without insert; [A2] validation → 400 es-CL field errors, cohort
> pinned to the public module, length caps; [A3] split consent per D-12, never a
> half-set marketing shape; [A4] dedup on `(email_normalized, cohort)` with
> identical 200s and 23505 handled as the duplicate path; [A5] resubmission may
> set the marketing opt-in but never clears an earlier true; [A6] `canTransitionLead`
> with the D-03 graph, every allowed edge and every denied pair tested;
> [A7] best-effort auto-reply + internal notification, escaped, price-free,
> 24h-deduped, `brochure_sent_at` only on success, missing key → soft-fail;
> [A8] tests + gates green.

Untouched, as required: both cohort modules, `scripts/check-price-leak.mjs`, the
A2 migration, `middleware.ts`, every existing route, page and email template.
No migration in this phase (`npm run test:db` not run — zero SQL changed).

## Design, in one paragraph

Three files, split by what they are allowed to know. `lib/pasantias/leads.ts` is
pure: the D-03 transition graph as a `Record` over every status, plus the
submission validator, and it touches neither the database nor the network.
`lib/pasantias/emails.ts` owns both messages and the Resend call; it imports
`cohort-public` only, so "the auto-reply carries no price" is a property of its
import reach rather than of anyone's care (D-01/D-02), and it soft-fails on every
path — missing key, provider error, thrown transport — returning a result object
instead of raising. `pages/api/pasantias/lead.ts` is the only piece that talks to
Supabase, always through `createServiceRoleClient()`, because the live table
grants `anon` no privilege at all and `authenticated` SELECT only (D-04). The
route reads by `(email_normalized, cohort)`, inserts or updates, asks
`canTransitionLead(existing.status, 'new')` before it will re-open a dismissed
lead, and only then sends mail — so no mail outcome can change what the visitor
sees. Both the new-lead and the already-known paths end in the same
`200 {success:true}`, and so does the honeypot.

## Files created

| File | Risk | Why |
|---|---|---|
| `pages/api/pasantias/lead.ts` (+268) | **High** — public, unauthenticated, service-role writes | The only write path to a live production table |
| `lib/pasantias/leads.ts` (+279) | Medium — the transition graph is a compliance boundary | D-03 is enforced here or nowhere |
| `lib/pasantias/emails.ts` (+303) | Medium — hostile input reaches HTML; D-02 boundary | Escaping and price-freedom both live here |
| `__tests__/api/pasantias-lead.test.ts` (+588) | Low | 33 cases |
| `__tests__/lib/pasantias-leads.test.ts` (+253) | Low | 42 cases |
| `docs/planning/reviews/fase-a5-review-request.md` (+129) | Low | This file |

## Test evidence

`npm run type-check` exit 0 · `npm run lint` exit 0 (`--max-warnings=0`) ·
`npm test` → **255 files / 4067 tests passed** (+75 from this phase) ·
`npm run build` exit 0, route registered as `ƒ /api/pasantias/lead` ·
`node scripts/check-price-leak.mjs` → OK, 266 files scanned.

`npm run test:db` not run: no migration, no SQL. E2E belongs to A6b.

## The five things to scrutinise hardest

1. **The Supabase mock is a hand-rolled fake, not the real client.** Every
   assertion about column payloads is an assertion about what the route *hands*
   to supabase-js, not about what Postgres would accept. The two shapes that
   matter — the marketing all-or-nothing CHECK and
   `email_normalized = lower(btrim(email))` — are asserted at the payload level
   only. If the real client rewrites a payload (it does not, but I did not prove
   it), these tests would not notice. The first real end-to-end write happens in
   A6b/A9; treat that as the actual proof.

2. **"Never clears an earlier opt-in" is implemented as an absent key, not a
   preserved value.** `marketingColumns()` returns `{}` when the person did not
   opt in and the row already has `marketing_opt_in = true`, so the three columns
   are simply not in the UPDATE. That is correct for a partial update and is
   tested with `not.toHaveProperty`, but it depends on the route never switching
   to an upsert or a full-row write. If a later phase changes that call, the
   guarantee silently dies and the test still passes.

3. **`canTransitionLead` denies `from === to`.** I chose that deliberately — a
   no-op is not a transition, and a caller that wants "leave the status alone"
   must not write the column — and the route relies on it: for a `new` lead,
   `canTransitionLead('new','new')` is false, so no `status` key is written. If
   A8's triage UI expects `canTransitionLead(s, s) === true` as an idempotency
   convenience, it will get a surprise. Worth an explicit ruling.

4. **The auto-reply dedup is a read-then-write with no lock.** `brochure_sent_at`
   is read in the dedup SELECT and written after a successful send. Two
   submissions racing inside the same second both see `null` and both send. The
   24h window makes this bounded and cheap (worst case: a duplicate auto-reply),
   and the alternative — a conditional update or an advisory lock — seemed out of
   proportion for a best-effort courtesy mail. Flagging it because I made that
   call, not the plan.

5. **Two field caps are mine, not the prompt's.** The criteria name six caps
   (80/80/140/140/40/1000) for what reads as first name, last name, email,
   institution, phone and message. `roleTitle` and the three `utm_*` fields are
   not in that list, and leaving unbounded strings on a public endpoint is a real
   hole, so I capped them at 140 (the institution cap). If the intended reading
   was `roleTitle = 40` rather than `phone = 40`, that is a one-constant change in
   `LEAD_FIELD_LIMITS` — but it is a change, so it should be ruled on.

## Known limitations / deferred

- **`source_path` is never written.** The column exists on the table, but the
  criteria's optional-field list is `phone, role_title, num_people, message,
  utm_*` and does not include it, so the route neither accepts nor derives it.
  A6b will need it accepted here (or the column stays permanently null).
- **`notes` is untouched** — admin-authored, belongs to A8.
- **Consent evidence is re-stamped on every submission**, overwriting the prior
  `consent_accepted_at`. The criteria say "always persist", and the table holds
  one row per `(email, cohort)`, so there is nowhere to keep a history. If an
  audit needs the first acceptance as well as the latest, that is a schema
  question, not an API one.
- **`reply_to` (snake case) is used** on the internal notification — correct for
  the installed Resend 3.5.0 and consistent with `pages/api/contact.ts`. B2's
  finding is that a 4.5.x upgrade renames it to `replyTo`; `tsc` catches it, and
  this becomes a second call site for that upgrade.
- **No e2e.** The form does not exist yet (A6b).

---

# Round r2 — `source_path`

**Prompt:** `docs/plan/prompts/a5-2.md`
**Base for this round:** `phase/a5-lead-api` @ `45c08fc` (r1 head + PM ledger entry)
**Commits:** 1

Closes the r1 limitation recorded above ("**`source_path` is never written**").
The column exists on the live table; the r1 criteria's optional-field list
omitted it, so it would have stayed permanently null and A6b could not attribute
where a lead came from.

## Scope

- `lib/pasantias/leads.ts` — `sanitizeSourcePath()`, `LEAD_FIELD_LIMITS.sourcePath`,
  `sourcePath` on `LeadSubmissionBody` and `ValidatedLead`.
- `pages/api/pasantias/lead.ts` — `source_path` on INSERT, `sourcePathColumns()`
  on UPDATE.
- Both test files.

Nothing else touched. No schema change, no migration, no new dependency.

## The decision the prompt asked me to make: drop, not reject

An invalid `sourcePath` is **dropped to null** and the submission still succeeds.
It is never a 400. Three reasons:

1. **Nobody typed it.** It is browser-reported telemetry, so there is no form
   field to render an error against — a `fields.sourcePath` error would arrive at
   a form with nowhere to display it.
2. **The failure modes are asymmetric.** Dropping costs one lead's attribution.
   Rejecting costs the lead — a real school that filled the form correctly, told
   they made a mistake in a field they cannot see.
3. **It makes the field uniform.** Over-cap is dropped for the same reason as
   `https://evil.example`, so there is exactly one rule for the column instead of
   a 400 for length and a silent null for shape.

This is why `sourcePath` has no entry in `LEAD_VALIDATION_MESSAGES` — it cannot
produce an error by construction.

## What counts as valid

Accepted: starts with `/`, second character is neither `/` nor `\`, no
whitespace and no C0/DEL control character, ≤200 characters after trim.
Everything else → null.

Requiring the leading `/` is what rejects every scheme (`https:`, `javascript:`,
`data:`) without a scheme denylist to keep current. The `//` and `/\` checks
cover protocol-relative forms, which browsers resolve against another host.

The check runs on the **raw** string, deliberately: `normalizeText` (used for
every other optional field) collapses `\s+` to a single space, which would turn
`/pasantias\r\nX-Injected: 1` into the innocuous-looking `/pasantias X-Injected: 1`
and store it, instead of refusing it.

## Insert vs update

- **INSERT** always writes the column, null included — there is nothing to lose
  on a brand-new row.
- **UPDATE** writes it only when this submission supplied an accepted path
  (`sourcePathColumns` returns `{}` otherwise, the same idiom as
  `marketingColumns`). A resubmission from a page that sends no `sourcePath` — or
  sends one that was refused — must not erase where the lead first came from.

## Test evidence

`npx vitest run __tests__/lib/pasantias-leads.test.ts __tests__/api/pasantias-lead.test.ts`
→ **92 passed** (75 in r1, +17 this round). All r1 tests unchanged and still green.

New coverage: accepted shapes incl. query/fragment; the cap boundary (200 accepted,
201 dropped); the full refused set (`https://`, `http://`, `javascript:`, `data:`,
`//host`, `/\host`, CRLF, LF, tab, NUL, internal space, unrooted, `../`, empty,
whitespace-only); non-strings; trim; persisted on insert; null on insert when
absent; dropped-but-still-200 at the route; refreshed on update; **and the two
cases that must leave the column unwritten on update** (field absent, value
refused).

## What to scrutinise

1. **The drop-vs-reject call itself** — argued above; it is a judgement call the
   prompt explicitly delegated, so it is the thing to overrule if you disagree.
2. **`sanitizeSourcePath` is an allowlist, not a sanitiser.** It never rewrites a
   value — it returns it verbatim or returns null. That means a stored path is
   byte-identical to what the browser reported, which is what makes the A6b
   admin surface's rendering obligation simple (escape it like any other stored
   string) rather than "trust it, it was cleaned".
3. **`source_path` sits outside `contactColumns`.** It is the only contact-ish
   column with different insert and update behaviour, so it is written at the two
   call sites instead. If a later phase adds a third write path to this table, it
   will not get this behaviour for free.
