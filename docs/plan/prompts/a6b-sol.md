# CODEX SOL — FINAL REVIEW, INSPIRA phase A6b (LeadForm)

Branch **`phase/a6b-form`**, head **`b0eaafd2`**, base `main` @ `6a69e673`.
Checkout `~/dev/fne-lms` (the branch is checked out there; **not pushed** — no remote copy).

Final review of phase **A6b — LeadForm (split consent) + wiring + e2e + a11y**.
`docs/plan/PLAN.md` §"Phase A6b" holds the acceptance criteria and the frozen
decisions; `docs/plan/LEDGER.md` ends with the executor's r1 entry and the PM's
verification of it. The executor's own review-request is at
`docs/planning/reviews/fase-a6b-review-request.md`.

**You have final say on BLOCKING items. The phase does not close until you pass it.**
Round caps are retired (PLAN Decision Log, 2026-08-06) — classify honestly rather than
sparing a round.

---

## What the phase had to do

`/pasantias` shipped finished in A6r with one hole: `#programa` was an interim mailto
panel. A6b replaces it with the real lead form. **The backend was frozen going in** —
`pages/api/pasantias/lead.ts`, `lib/pasantias/leads.ts`, `lib/pasantias/consent.ts`,
`lib/pasantias/emails.ts` all shipped in A5 and were explicitly out of scope. This phase
is a client for a contract it may not change.

PLAN's criteria are [A1]–[A5]. The executor prompt
(`docs/plan/prompts/a6b-1.md`, committed) decomposed them into [A1]–[A9]; the PLAN text
is the contract, the prompt is only how it was handed over. Note **[A5] was added to the
plan at A6r's close**: the A6r hardcoding guard scans `components/pasantias/**`, so this
form's copy falls inside it.

## What landed

Two implementation commits, `c9425d29` and `5613df78`:

- `components/pasantias/LeadForm.tsx` — new, 577 lines. The first file that directory has
  ever contained.
- `pages/pasantias.tsx` — +14/−23. Right column of `#programa` swapped for `<LeadForm />`;
  the mailto CTA deleted; the ficha CTA moved into the left column.
- `__tests__/components/PasantiasLeadForm.test.tsx` — new, 11 RTL tests.
- `tests/e2e/pasantias-form.spec.ts` — new, 6 Playwright tests, registered in
  `scripts/ci/e2e-mandatory.mjs`.
- `tests/e2e/pasantias-page.spec.ts` — the mailto assertion replaced by three (form
  visible, `pasantias-cta-mailto` count 0, ficha href).

Design choices worth your attention because they were judgment calls, not defaults:

- **Client validation calls `validateLeadSubmission`** — the route's own validator — on
  the exact body it is about to post, rather than restating any rule. Consequence: a
  server-side module is now in the client bundle.
- **`consent` is posted as `form.consent === true`**, a strict boolean, because
  `lib/pasantias/leads.ts:253` refuses anything else and a bare HTML checkbox would post
  `'on'`.
- **The processing-consent label is split on `PRIVACY_POLICY_LINK_LABEL` at render time**
  so a copy change in `consent.ts` moves the link with it.
- **The ficha CTA moved to the left column** so it survives the success-panel swap.

## What the PM verified independently — so you can spend your effort elsewhere

Gates re-run by the PM, not read off the report: `type-check` clean · `lint` clean at
`--max-warnings=0` · `npm test` **four times** · `build` · `check-price-leak` OK over 267
files · `CI=1 npx playwright test` over `pasantias-form`, `pasantias-page`,
`footer-heading-order` — **20 passed, axe green with the form present**. Full diff read,
not the summary.

**The guard was attacked, not trusted.** The report's central claim is that A6r's guard
stayed 42/42 with **no declaration edited** — `EXPECTED_RESTATEMENTS` still reads
`lodgingArea` / `'Barcelona'` / `sites: 9` — because the form's copy names no cohort fact.
A guard blind to the new file would pass identically, so the PM planted
`components/pasantias/__pm_probe.tsx` containing a school name, the city and "9 días": the
guard went red and named the file and both leaves it hit. Probe deleted. The PM also
traced `publishedSurface` → `renderToStaticMarkup(PasantiasPage)` and confirmed
`<LeadForm />` renders its form branch under SSR, so the form's labels and consent
sentences really are on the surface the restatement counter reads.

**One full-suite run out of four reported `1 failed | 262 passed` with 6174 of 6180 tests
and zero assertion failures** — a suite-level worker crash, not a red. Three subsequent
runs matched the executor exactly (263 / 6180). Unexplained; recorded so it is not
rediscovered as a mystery.

## The thing the PM most wants your ruling on

**S1 — the `1000` collision moved rather than closed.** `LEAD_FIELD_LIMITS.message` is
1000. A `maxlength="1000"` attribute on the message textarea put that digit string into
the rendered HTML, where D-02's pattern for the **retired €1.000 programme fee**
(`/(?<![\d.,])1[.,\s]?000(?![\d])/`, `tests/e2e/pasantias-page.spec.ts`) found it and
failed the price scan. The executor **dropped the attribute rather than relax the
pattern** — the right instinct, and it said so.

But the same digit string returns through `LEAD_VALIDATION_MESSAGES.tooLong(1000)` →
**"Máximo 1000 caracteres."**, rendered against that field — and removing the attribute is
exactly what makes that path reachable, because a person can now type past the cap. The
executor's own unit test (`PasantiasLeadForm.test.tsx:246`) asserts that string into the
DOM. The report presents the collision as resolved.

The PM's reading, offered as a position to be overruled: this is **not an executor error
but a plan-level tension**. D-02's pattern was written for a price that no longer exists
and collides with an unrelated frozen constant; no arrangement of this form keeps `1000`
off the page while the cap is 1000 and the message says so. The PM considered BLOCKING and
classified **SHOULD-FIX** on the grounds that D-02 protects against *prices* on public
surfaces, a character count is not a price, nothing harmful ships, and the D-02 scan runs
on a clean load and is green. **If you think that reasoning is too comfortable, say so —
you have overruled this PM on this file's guards before and were right each time.**

## The other open item, which is not a code finding

**S2 — a foreign commit is on this branch.** `43218fcb` "docs(z2): r21 approved" sits
between the base and the executor's first commit: a concurrent ZOOM session committed into
this shared checkout while `phase/a6b-form` was checked out. Docs-only, touching nothing
A6b touches, and **not on `main`**. The executor left it alone rather than rewrite another
session's work. It is a merge-hygiene problem for Brent and the ZOOM PM, not a
remediation item — flagged here only so you are not surprised by it in the log. You do not
need to rule on it.

---

## Check

1. Does the code actually meet every acceptance criterion in PLAN §A6b, **[A5] included**?
   Verify against the code; the ledger is a claim.
2. Run the tests yourself. Do they test behaviour, or do they execute code? The 11 RTL
   tests and 6 e2e tests are where this phase's evidence lives.
3. **D-12** — are the two consents genuinely separate purposes with separate evidence, in
   the DOM and in what is posted, or only in appearance? Is there any path where the
   required acknowledgement produces a marketing opt-in, or where the optional box arrives
   pre-checked?
4. **D-02 / D-01** — no price, no commercial import, leak scan green. And S1 above.
5. **The client bundle.** `validateLeadSubmission` is now client code, which drags
   `lib/pasantias/leads.ts` → `lib/signups.ts` → `lib/types/api-auth.types.ts` into the
   browser. The PM checked for secrets and found none (no `process.env` on that path), but
   did **not** measure the bundle-size cost or audit that whole import chain. If reusing
   the server validator on the client is the wrong trade, this is the round to say so —
   the alternative is duplicated rules and drifting messages, which is why it was done.
6. **A11y for real, not just axe-green.** The honeypot is a focusable input inside an
   `aria-hidden="true"` container with `tabIndex={-1}`; focus moves to the success panel
   (`role="status"`, `tabIndex={-1}`) after submit. Both are defensible and both are the
   kind of thing axe passes and a screen reader hates.
7. **Error handling.** `setFormError(payload.error || GENERIC_ERROR)` renders a
   server-supplied string. Every current server message on that path is es-CL and
   PII-free — is that a property, or an accident that a future route change breaks?
8. Anything that makes **A7a** (site link rewiring) or **A8** (admin leads triage) harder.
   Known and logged: `sourcePath` posts `pathname + search`, so UTM values land in
   `source_path` as well as the three `utm_*` columns, and A8 renders `source_path`.
9. Scope creep — anything touched that was out of scope, particularly any edit to a frozen
   A5 file or any weakening of the A6r guard.

**Known limit, stated rather than discovered:** neither executor nor PM could run the full
`MANDATORY_SPECS` list locally — `ci-fixture`, `zoom-*` and `session-*` need the seeded
ephemeral Supabase stack CI builds. Same limit A6r r7–r9 ran under. Nothing about those
specs was verified on this machine.

Review against the plan's contract, not your own preferences. Taste disagreements are
NITs. Only correctness, contract violations, security and architectural violations are
BLOCKING.

Output using the CODEX REVIEW format, and write it to
`docs/plan/reviews/REVIEW-A6B.md`:

```markdown
## CODEX REVIEW — A6b round 1
VERDICT: PASS | FAIL
BLOCKING:
- [B1] <finding> — <file:line> — <why it blocks>
SHOULD-FIX:
- [S1] ...
NITS:
- [N1] ...
NOTES ON THE PLAN ITSELF: <if the plan, not the code, is the problem>
```
