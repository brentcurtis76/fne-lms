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

---

# Round r3 — Sol remediation (BLOCKING ×2 + SHOULD-FIX)

Branch `phase/a5-lead-api`. Closes both BLOCKING findings and the SHOULD-FIX in
`docs/plan/prompts/a5-3.md`. Both blockers are the **same defect shape** in the
same file — a decision computed in application memory from a row read earlier,
then written unconditionally — so both are closed by removing the dependency on
the stale read rather than by narrowing the window.

## BLOCKING 1 — a stale submission could clear a concurrent marketing opt-in

`marketingColumns()` used to consult `existing.marketing_opt_in`: when that
snapshot said false and this submission did not opt in, it wrote the complete
false tuple. Interleave two requests — U reads false, O writes the true tuple, U
then updates — and U erases O's consent. The table's CHECK accepts that tuple, so
the database could not stop it, and it is a consent regression rather than an
ordinary lost update.

The parameter is now `mode: 'insert' | 'update'`; **the snapshot is not an input
at all.** On `update` the three columns are absent unless this submission is
itself the opt-in — not false, not NULL. `insert` still writes the complete false
tuple, because a brand-new row has no prior state to lose and `false/null/null` is
the safe non-assertion D-12 asks for.

`marketing_opt_in` was also dropped from `EXISTING_COLUMNS`, so the route no
longer even fetches it. The cheapest way to guarantee nothing decides a marketing
write from a stale snapshot is to never hold the value: a future edit would have
to deliberately add the column back before it could reintroduce this bug.

Structural, not probabilistic: with no snapshot in scope, no interleaving can
produce a clearing payload. Two tests pin it — one drives the exact interleaving,
one asserts the update payload is byte-identical whichever value the snapshot
held.

## BLOCKING 2 — the 24h auto-reply dedup is now an atomic claim

Was: read `brochure_sent_at`, decide with `shouldSendAutoReply`, send, then stamp
unconditionally. Two requests read the same null, both passed, both sent; a send
whose stamp then failed made the next request send again. N concurrent requests
could produce N messages.

Now **claim-then-act**. A conditional UPDATE takes the window, and PostgreSQL
evaluates the predicate against the row it has locked — so the second of two
simultaneous statements re-checks against the first's committed value and matches
nothing. A returned row is the right to send; no row means another request owns
the window, and this one skips silently. A claim that *errors* is also treated as
lost: "we could not tell" must not read as "go ahead".

**The window is claimed with two single-predicate statements, not one `or`
filter.** This is the round's one non-obvious implementation choice and the thing
most worth checking. The natural expression is

```
WHERE id = $1 AND (brochure_sent_at IS NULL OR brochure_sent_at < $cutoff)
```

but PostgREST **rejects `or` filters on UPDATE** for non-PK columns — it accepts
them on SELECT, so the query passes every fake and unit test and fails only
against the live database. This repo has already paid for exactly that once; the
incident note lives on `lib/bots/store.ts:claimSessionTransition` (2026-06-12
stranded-session). The first draft of this round had the `or` form and would have
shipped the same bug.

So the claim is `.is('brochure_sent_at', null)` first, then
`.lt('brochure_sent_at', cutoff)` — the `.eq`/`.is`/`.lt`-on-UPDATE form that
incident proved works. Splitting the disjunction costs nothing in correctness:
each statement is atomic on its own, and whichever one wins sets the column to
`now`, which satisfies **neither** predicate, so any concurrent request reaching
either statement afterwards matches no row. Exactly one caller can win.

`shouldSendAutoReply` is **deleted**, replaced by `autoReplyClaimCutoff(now)`.
That is deliberate: an exported predicate over `brochure_sent_at` is the
check-then-act shape itself, and leaving it in the module invites a future caller
to reintroduce the race. The window is now only expressible as a value inside the
claim's WHERE clause.

### A failed send does NOT always roll the claim back

The prompt asked which and why. **Released when nothing can have left this
process; kept when the outcome is unknown.** `sendSoft` now classifies its
failure: `not_configured` (no API key — the request was never built), `rejected`
(Resend answered and refused — the call completed, nothing queued), `unknown`
(the call threw — a timeout can follow an accepted request).

`canReleaseAutoReplyClaim` releases on the first two and keeps on the third.
Reasoning: [A7] is an **upper bound on messages**, so the one failure this
endpoint refuses to risk is a second copy — that rules out releasing on a throw.
But holding the claim on a missing key would be worse than useless: nothing was
sent, nobody can be mailed twice, and the lead would carry a `brochure_sent_at`
that is simply a lie for 24 hours — including on every local and misconfigured
environment, where `.env.local` has no `RESEND_API_KEY` at all.

The release is guarded on `brochure_sent_at` still equalling our own stamp, so it
can never stomp a claim taken in the meantime, and it restores what the row held
before (null or an already-expired value — either way claimable again).

## Also fixed while restructuring that block (REVIEW-A5 [S1])

`buildBrochureUrl()` was evaluated inside the same `try` as
`sendLeadNotification`, so a thrown URL — `lib/utils/app-url.ts` throws with no
configured production origin — skipped FNE's internal notification entirely.
Ordinary Resend failures did not, because `sendSoft` absorbs them; this
preparation path did. The two messages now get one `try/catch` each, and the URL
is resolved **before** the claim, so the throw also costs no window. Tested.

This is beyond the prompt's literal list — it is a reviewer SHOULD-FIX in the
same seven lines the blocker rewrites, and leaving it would have meant touching
this block twice.

## SHOULD-FIX — `sourcePath`: the trim is gone, the contract stands

**Chose: stop trimming.** r2's ledger, this document and the function's own
comment all promised the value is judged raw and stored byte-identical, while the
code called `value.trim()` first — so `"  /pasantias  "` was accepted as
`"/pasantias"`, and a wrapping CR/LF was silently laundered into a valid path.

Correcting the code rather than the prose, because the verbatim contract is the
one worth having: a browser reporting `location.pathname` never sends surrounding
whitespace, so its presence says the value was hand-crafted, and *refusing* is
strictly safer than *cleaning*. The cap now applies to the raw length too, so
padding cannot smuggle an over-length value under the limit. A6b's obligation is
unchanged and now actually true: what is stored is what arrived, escape it on
render like any other stored string.

No documentation needed correcting — the wording was already right; only the code
disagreed with it.

## Test evidence

See the ledger entry for this round for the verbatim gate output; every count
below was produced from the final commit, not carried over from an earlier round
(REVIEW-A5 [S2]).

New this round: the marketing interleaving pair; two simultaneous submissions →
exactly one auto-reply; claim released on `not_configured` and on `rejected`,
kept on a thrown transport; a lost claim writes nothing further; notification
still sent when auto-reply preparation throws; `sourcePath` refuses leading and
trailing CR, LF, tab and space; accepted values byte-identical; raw-length cap;
and direct unit coverage of `autoReplyClaimCutoff` (nothing previously pinned the
24h arithmetic) and `canReleaseAutoReplyClaim`.

Both blockers were mutation-checked: reverting `marketingColumns` to consult the
snapshot, and ignoring the claim result, each turn the relevant new tests red.

## What to scrutinise

1. **The two-statement claim, against a live PostgREST.** The argument that it
   is equivalent to the disjunction is above and I believe it holds, but it is
   the round's real risk surface, and the `or`-on-UPDATE trap it avoids is
   invisible to every test in this repo. The test fake now *evaluates* the
   predicate against stored state rather than replaying a scripted result, and it
   has no `.or()` at all, so a regression to that form fails loudly — but a fake
   agreeing with me is not a live database agreeing with me.
2. **The keep-on-`unknown` rule.** A thrown transport now burns the window with
   nothing sent, which is the deliberate cost of never mailing twice. If FNE
   would rather risk a duplicate than lose a brochure, that is a one-line change
   in `canReleaseAutoReplyClaim` — and the argument to have with the owner, not
   with the code.
3. **Deleting `shouldSendAutoReply`.** It removes a tested export. The claim
   covers its behaviour, but if any later phase wants "is this lead due?" as a
   read-only question, it must not come back in this shape.
4. **The route tests assert against a fake.** The atomicity claim rests on
   PostgreSQL's re-check under READ COMMITTED, which no Vitest fake proves. The
   fake does hold real per-row `brochure_sent_at` state and apply each
   statement's own predicate to it, so the two-simultaneous-submissions test
   fails if the route ignores a lost claim — but that is the route obeying the
   database, not the database being proven. A6b's e2e is where a real two-writer
   run could exist.
5. **`insert` still writes the false tuple, `update` writes nothing.** The two
   paths now differ on purpose. A third writer to this table would not inherit
   either behaviour for free — same caveat r2 recorded for `source_path`.
