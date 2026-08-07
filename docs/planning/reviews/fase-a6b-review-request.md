# Fase A6b — review request

**Branch:** `phase/a6b-form`
**Base SHA:** `9f6756c6` (`main`, "docs(a6b): r1 executor prompt + ledger entry")
**Commits:** 2 (implementation + this document)
**Round:** r1 — first round of the phase

---

## Objective

`/pasantias` shipped in A6a/A6r with an **interim mailto panel** at `#programa`.
This phase replaces it with the real lead form: `components/pasantias/LeadForm.tsx`,
the client for the frozen A5 contract at `POST /api/pasantias/lead`.

### Scope in

1. `components/pasantias/LeadForm.tsx` (new) — the form.
2. `pages/pasantias.tsx` — right-hand column of `#programa` swapped for the form;
   the interim mailto block removed.
3. `__tests__/components/PasantiasLeadForm.test.tsx` (new) — 10 RTL tests.
4. `tests/e2e/pasantias-form.spec.ts` (new) — 6 Playwright tests.
5. `scripts/ci/e2e-mandatory.mjs` — the new spec added to `MANDATORY_SPECS`.
6. `tests/e2e/pasantias-page.spec.ts` — the one assertion that expected
   `pasantias-cta-mailto`.

### Scope out (untouched)

`pages/api/pasantias/lead.ts`, `lib/pasantias/leads.ts`, `lib/pasantias/emails.ts`,
`lib/pasantias/consent.ts`, `lib/legal/privacy-notice.ts`, both cohort modules —
all frozen and byte-identical on this branch. Every other section of
`pages/pasantias.tsx`. Links to `/pasantias` from elsewhere (A7a). Admin triage (A8).
The hardcoded-cohort guard was **not** edited: no declaration changed.

---

## Files by risk

| Risk | File | Why |
|---|---|---|
| **High** | `components/pasantias/LeadForm.tsx` (new, 567 lines) | All new behaviour: consent evidence (D-12), what the browser posts, error and success handling. |
| Medium | `pages/pasantias.tsx` (+14/−23) | Touches a page under a nine-round adversarial guard; moves a CTA. |
| Medium | `tests/e2e/pasantias-page.spec.ts` (+9/−3) | An existing assertion was **changed**, not added — see below. |
| Low | `scripts/ci/e2e-mandatory.mjs` (+4) | One list entry plus its comment. |
| Low | new test files | Additive. |

---

## Test evidence

- `npm run type-check` — clean
- `npm run lint` — clean at `--max-warnings=0`
- `npm test` — **263 files / 6180 tests passed** (was 262/6169 on `main`; +1 file,
  +11 tests, all from `PasantiasLeadForm.test.tsx`)
- `npm run build` — compiled
- `node scripts/check-price-leak.mjs` — OK over 267 files under `.next/static`
- `CI=1 npx playwright test tests/e2e/pasantias-form.spec.ts tests/e2e/pasantias-page.spec.ts
  tests/e2e/footer-heading-order.spec.ts tests/e2e/smoke.spec.ts` — **22 passed**,
  including the axe spec with the form present and the D-02 price scan.
  **The full `MANDATORY_SPECS` list was attempted first and abandoned**: the
  auth-fixture specs (`ci-fixture`, `zoom-*`, `session-*`) need the seeded
  ephemeral Supabase stack CI builds (`scripts/ci/seed-e2e.mjs`), and without it
  they time out on the login form. That is environment, not this branch — the
  same four specs are what A6r r7–r9 ran locally. CI is the surface that runs the
  whole list; this branch adds one spec to it.
- `npx vitest run __tests__/pages/pasantias-hardcoded-cohort.test.ts` — **42/42**,
  unchanged from `main`. The guard saw `components/pasantias/` for the first time
  and stayed green with no declaration edited.

---

## Scrutinise these hardest

1. **Client validation calls the server's own validator.** `handleSubmit` builds the
   exact request body and runs `validateLeadSubmission` on it before any `fetch`.
   That is why a client-caught and a server-caught problem read identically, and it
   means a cap change in `leads.ts` moves both sides at once. The judgment call to
   check: this couples the client to a module the phase calls frozen, and it means
   the form will refuse to submit anything the server would refuse — including
   `cohort`, which the visitor cannot fix. `COHORT_ID` is imported, so the only way
   that branch fires is if the module and the route disagree, which is a bug I would
   rather surface as a stuck form than as a silent 400. Say if you disagree.

2. **The honeypot's accessibility treatment.** It is `aria-hidden` + `tabIndex={-1}`
   + positioned off-screen, per the prompt. axe's `aria-hidden-focus` rule can flag
   a natively focusable control inside an `aria-hidden` subtree even at
   `tabindex="-1"`; the existing axe spec on `/pasantias` was run with the form
   present and is green, so this is empirically fine on axe-core's current rules,
   but it is the assertion most likely to move under an axe upgrade.

3. **The changed assertion in `pasantias-page.spec.ts`.** The old test asserted the
   mailto's `href`. I replaced it with three assertions rather than deleting it: the
   form is present, `pasantias-cta-mailto` has count **0** (so the interim CTA cannot
   quietly come back), and `pasantias-cta-ficha-programa` still points at
   `/api/pasantias/ficha`. Check that this is a fair replacement and not a weakening.

4. **Where the ficha CTA went.** It moved into the **left column**, under the intro
   paragraph. The prompt allowed "below the form or in the left column"; the left
   column wins because the right column is replaced wholesale by the success panel,
   and a CTA that disappears the moment someone submits is a CTA that stops working
   exactly when interest is highest. Its `data-testid` is unchanged.

5. **The message textarea carries no `maxLength`, and that is deliberate.** The
   first e2e run failed the D-02 price scan in `pasantias-page.spec.ts`: the
   attribute `maxlength="1000"` (from `LEAD_FIELD_LIMITS.message`) is the retired
   €1.000 programme fee as far as that pattern is concerned. Two exits existed —
   relax the pattern to ignore attribute values, or drop the attribute. I dropped
   the attribute, because relaxing a D-02 pattern to fit new code is exactly the
   move the guard exists to prevent, and the cap is not lost: the validator
   enforces it on both sides and renders the imported `tooLong(1000)` message.
   The cost is that a very long message is refused on submit rather than blocked
   at the keystroke. `caps the message on submit even though the textarea carries
   no maxlength attribute` pins both halves so nobody re-adds the attribute
   silently. If the reviewer prefers the other exit, it is a one-line change to
   the pattern plus a re-added attribute — but it should be an explicit decision.

6. **What the success panel does and does not say.** The API answers `200` identically
   for a new lead, a resubmission and a honeypot hit (anti-enumeration), so the panel
   says nothing address-specific — it does not echo the email back. It also takes
   focus (`tabIndex={-1}` + `role="status"`), because the form it replaced held the
   focused control. Check the focus move is not a surprise for screen-reader users.

---

## Known limitations / deferred

- **The success panel is not persisted.** A reload puts the form back, empty. Nothing
  in the contract asks for a "you already asked us" state, and the endpoint's
  anti-enumeration answer means the client cannot know.
- **`sourcePath` includes the query string**, so UTM parameters are stored twice: once
  in `source_path` and once in the `utm_*` columns. `sanitizeSourcePath` accepts it,
  and A8's triage surface may prefer the bare pathname. Flagging rather than deciding.
- **No client-side rate-limit feedback beyond the generic sentence.** A `429` renders
  the route's own `error` string when it sends one, and the generic es-CL sentence
  otherwise. A dedicated "espera un momento" state was not in scope.
- **No analytics event on submit.** Out of scope for this phase.
