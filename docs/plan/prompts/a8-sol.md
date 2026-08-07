SESSION: INSPIRA · A8 · Codex round 1 · REVIEW

Final review of phase **A8 — Admin leads triage** for **INSPIRA Comms (fne-lms)**.

Read `docs/plan/PLAN.md` (§ Phase A8) for the acceptance criteria and the frozen decisions,
then review branch **`phase/a8-leads-ui`**, head **`fd33706c`** (two commits: `2448322a` r1,
`fd33706c` r2). Base is local `main` @ `5190344c`.

You have final say on BLOCKING items. The phase does not close until you pass it.

---

## What this phase is

An admin-only triage surface over `public.pasantias_leads`. `POST /api/pasantias/lead` (A5) is
live and `/pasantias` posts to it, so the table fills up while nothing in the platform could
read it. A8 is the reader: list, filter, triage through the D-03 status graph, notes, CSV.

New: `pages/api/admin/pasantia-leads/index.ts` (GET + PATCH) · `pages/admin/pasantia-leads.tsx`
· `components/admin/PasantiaLeadCard.tsx` · two unit suites · `tests/e2e/pasantias-leads-admin.spec.ts`.
Edited: `components/layout/Sidebar.tsx` (one nav child) · `scripts/ci/e2e-mandatory.mjs` ·
`scripts/ci/e2e-fixtures.json` · `scripts/ci/seed-e2e.mjs`.

Criteria: [A1]–[A4] plus [A-new-1] (escape `source_path`, never linkify), [A-new-2] (don't
present `source_path` and `utm_*` as independent evidence), [A-new-3] (CSV through
`lib/exportUtils`), [A-new-4] (no raw search term in a PostgREST `.or()`).

---

## What I have already done, so you can spend your round elsewhere

**Re-run by me, not read from a report** — targeted suites **43/43**; full suite **265 files /
6242 tests**; `type-check`, `lint` (zero warnings) and `lint:testid` all clean. Final run from
a verified-pristine tree.

**Adversarial pass on r1: 25 agents, six dimensions, ~1.7M tokens.** Ten mutants against the
API route (denied transition returning 200; `canTransitionLead` hardcoded true; counts computed
from the filtered set; admin check removed; update whitelist replaced by a body spread; search
sanitizer no-op'd; `updated_at` written; 404 turned into 200; and more), three against the card
(linkify `source_path`, `dangerouslySetInnerHTML`), plus mutating the D-03 graph inside the
frozen `lib/pasantias/leads.ts` to prove the UI moves with it. **Every mutant matching a
behaviour the tests name was killed.** Nineteen candidate findings were raised and all nineteen
died under independent refutation.

**Two more mutants by me on r2, both killed:** `dom()` made to ignore `domPrefix` → 1 failed;
and the table header alone reverted to the old label, leaving the other two sites correct → 1
failed.

**Checked against the code by hand:** scope is exactly 10 code/test files + 2 docs, with
`middleware.ts`, `lib/pasantias/leads.ts`, `supabase/**` and `pages/api/admin/users.ts`
provably untouched. The dropdown derives from `canTransitionLead` (`allowedLeadTransitions`) —
no second copy of the graph. Zero `<a>`, `href` or `dangerouslySetInnerHTML` in page or card.
All nine [A2] columns present. `headers = Object.keys(exportRows[0] ?? EMPTY_EXPORT_ROW)`, so
`ReportExporter`'s headers-double-as-keys trap is handled by construction.

**The one BLOCKING defect I found in r1, now fixed in r2:** the table header, CSV row key and
empty-export template labelled `brochure_sent_at` as *"Ficha enviada"*. In this codebase the
**ficha** is the price-free document a visitor downloads themselves (`pages/pasantias.tsx:709`
"Descarga la ficha" → `/api/pasantias/ficha`), while `brochure_sent_at` is stamped only when
the auto-reply mails **"el programa completo"** → `/api/pasantias/brochure`, the priced one. The
surface asserted the wrong document on the D-02 axis and exported that claim into staff
spreadsheets. Now `Programa enviado`, byte-identical in all three places.

---

## The two things I cannot settle from here — please spend your round on these

**1. The e2e has never executed. Not by the executor, not by me.**
Both rounds declined to race the concurrent A7a session for the shared local Supabase stack,
which was the correct call under the process rule — but it means [A3]'s e2e half rests entirely
on CI gate 4, which has not run either. The spec collects (3 tests), every selector it uses
provably exists in the page source, and `middleware.ts` genuinely bounces an anonymous caller
to `/login?next=`. **What has never met a live Postgres is the seeder INSERT** in
`ensurePasantiasLead` (`scripts/ci/seed-e2e.mjs`). Please check it against the migration
yourself: the `email_normalized = lower(btrim(email))` CHECK, the `num_people` range, the status
set, the all-or-nothing marketing tuple, the two NOT NULLs, and the `(email_normalized, cohort)`
UNIQUE — plus whether its look-before-insert is genuinely idempotent and whether it is ordered
safely within `main()`. If that INSERT throws, gate 4 fails and the phase is not done.

**2. Is `domPrefix` the right shape, or a duplicate-id class merely deferred?**
The page keeps **both** layouts mounted (Tailwind hides one with CSS; it does not unmount), so
an expanded lead renders `PasantiaLeadCard` twice. r1 shipped that with duplicate DOM `id`s, so
`htmlFor` bound to the hidden desktop control and a phone user's labels focused nothing. r2
namespaces every `id`/`data-testid` through a `domPrefix` prop (`desktop-` / `mobile-`). I
prefered a single mount; the executor argued in-place expansion makes that land offscreen below
the list, and I accepted the reasoning. **But `domPrefix` defaults to `''`** — a future second
call site that forgets it re-opens the class, and the guard pins today's two call sites by
source text rather than pinning the invariant. Your call on whether that is acceptable or should
be a required prop.

Lower stakes, also worth your eye: whether `sourcePathRepeatsUtm`'s `String.includes` against a
possibly percent-encoded path makes [A-new-2]'s caveat unreliable; and whether the [A-new-3] CSV
guard being four negative source greps is enough, or wants a behavioural assertion.

---

## Check

1. Does the code meet **every** acceptance criterion? Verify — do not take the ledger's word.
2. Run the tests yourself. Do they test behaviour, or merely execute code?
3. Any violation of the frozen decisions (D-03, D-04, D-10, D-12, Ley 21.719)?
4. Correctness, error handling, security, edge cases.
5. Anything that makes A9 harder than it needs to be.
6. Scope creep — anything changed that was out of scope?

Review against the plan's contract, not against your own preferences. Taste disagreements are
NITs. Only correctness, contract violations, security and architectural violations are BLOCKING.

Output using the CODEX REVIEW format, and please write it to
`docs/plan/reviews/REVIEW-A8.md` — A6b's r2 verdict was reported inline only and that gap is
still in the record.
