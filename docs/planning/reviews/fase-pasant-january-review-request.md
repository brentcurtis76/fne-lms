# Review request — PASANT-B003 January public content, program choice and shared documents

- Unit: PASANT-B003/local-part2 r1 (authorship-only), parent PASANT-B003, criteria C004–C007; continued under
  r1-continuation-1 (browser specs F1, homepage copy F5) — this request now covers the combined state.
- Branch `fix/p02b-r1`, base `85838af02a03a5289ad71852aab007fa62edbbf7`, **0 commits** — all changes uncommitted, on top of the
  uncommitted B002a/B002b overlay and the B003-part1 guard freeze (`0f447e71…`).
- Executor: Claude Code `claude-opus-5-5` (high, fallback NONE). Reviewer: Codex Sol 6.1. PM: Astra.
- Record: `docs/plan/evidence/pasant-january/b003-january-content.md`.

## Objective and scope

In: one coherent cutover of the public page, homepage card, lead form, January acknowledgement and the two shared PDFs to the
ratified January 2027 contract, with the program choice (singular per submission) and truthful success/document access.
Narrow price-guard extension (January commercial copy, escaped forms, B003-P1-N2 regression).

Out: SQL, auth, RLS, the API route (`pages/api/pasantias/lead.ts`, not allowlisted), the six inherited DB/B005 artifacts,
`lib/pasantias/consent.ts`, the non-allowlisted e2e specs, production storage, real mail, deployment, R-08 and R-17.

Continuation (r1-continuation-1): `tests/e2e/pasantias-page.spec.ts` and `tests/e2e/pasantias-form.spec.ts` retargeted to
January (F1, per Sol's browser-scope review), and three homepage teaser claims corrected as text only (F5, per Sol's copy
review), with expectations in `__tests__/pages/pasantias-site-links.test.ts`. Still out: `consent.ts` (F4 preserved, no
amendment), DB/API code (F6 routed to B004/B006).

## Files by risk

- High — data boundary and money: `lib/pasantias/cohort-commercial.ts`, `lib/pasantias/brochure.tsx`,
  `scripts/check-price-leak.mjs`, `__tests__/scripts/check-price-leak.test.ts`, `__tests__/scripts/price-leak-corpus.mjs`.
- High — personal data flow and copy promises: `components/pasantias/LeadForm.tsx`, `lib/pasantias/emails.ts`,
  `lib/pasantias/leads.ts` (comments only), `__tests__/api/pasantias-lead.test.ts`, `__tests__/lib/pasantias-emails.test.ts`,
  `__tests__/lib/pasantias-leads.test.ts`, `__tests__/components/PasantiasLeadForm.test.tsx`, `tests/e2e/pasantias-flow.spec.ts`,
  `tests/e2e/pasantias-form.spec.ts` (continuation).
- Medium — public facts and price boundary at the rendered page: `tests/e2e/pasantias-page.spec.ts` (continuation).
- Medium — public facts: `lib/pasantias/cohort-public.ts`, `pages/pasantias.tsx`, `pages/index.tsx`, `lib/pasantias/ficha.tsx`,
  `lib/pasantias/pdf/format.ts`, `lib/pasantias/pdf/filenames.ts`, `__tests__/lib/pasantias-cohort.test.ts`,
  `__tests__/pages/pasantias-hardcoded-cohort.test.ts`, `__tests__/pages/pasantias-site-links.test.ts`,
  `lib/pasantias/__tests__/pdf.test.ts`, `__tests__/api/pasantias-pdf.test.ts`.
- Docs: `docs/plan/evidence/pasant-january/b003-january-content.md` (new), this file (new), `PROJECT_STATE.md`.

## Test evidence

**None executed.** Authorship-only order: no tests, scanner, build, services or browser were run. All suites above are authored
and NOT RUN; counts unknown. The continuation ran nothing either: the two retargeted specs and the new F5 block are NOT RUN.

## Scrutinize hardest

1. `__tests__/pages/pasantias-hardcoded-cohort.test.ts` — the declarations (106 leaves, 14 collections, gaps, uncounted
   collections, seven fragments, two restatements, the city-wired-sites count of 3) were derived by reading the page, not by
   running it; the number shift moved to +7.3 (rounded) with the reason recorded. Most likely to need a data-only correction.
2. `__tests__/api/pasantias-lead.test.ts` — `useLegacySingleTrack()` keeps the unreachable single-track branch's tests alive by
   overriding `COHORT_ID` in a test-only module mock. Judge whether that seam is acceptable versus retiring those cases.
3. `lib/pasantias/emails.ts` — document URLs are resolved inside `sendLeadProgramAutoReply`; a missing production origin now
   yields `not_configured`/`not_sent` rather than a throw/`ambiguous`. This changes the settle outcome for that case without
   touching the route.
4. Leak boundary — the ficha and every public surface must stay free of commercial facts (arrival 17 Jan and the 30 Jan
   return are commercial and appear only in the brochure); the guard's new fragments and the D-01 importer allowlist.
5. Form semantics — success requires `{success: true}`; the "other program" path resets both consents; CTA preselection
   re-applies only on a new nonce.
6. `tests/e2e/pasantias-page.spec.ts` (continuation) — that every superseded October assertion has a January replacement
   (mapping in its header) and no behaviour test lost coverage; the D-02 change: the lost "Europa" page control replaced by a
   pattern self-test, January CLP/commercial patterns added, nights/teams/dates/bare lodging deliberately allowed; the
   assumption that es-CL prints "18 de enero" (same `Intl` form the page and the hardcoded-cohort guard use).
7. `tests/e2e/pasantias-form.spec.ts` (continuation) — browser-behaviour scope stated, not persistence/mail proof; the
   keyboard path assumes Chromium's native radio-group behaviour (one Tab stop, Space checks, ArrowRight moves and checks).

## Known limitations and deferred items

- F1: `tests/e2e/pasantias-page.spec.ts` and `tests/e2e/pasantias-form.spec.ts` pin October and will fail until the PM extends
  the allowlist to retarget them. F4 (A-14 consent wording), F5 (generic homepage cards), F6 (admin API does not expose
  interests) — see the record.
  Update (continuation): F1 and F5 resolved by code, not yet run; F4 preserved without change (PM/Sol, no human decision);
  F6 routed to B004/B006. Record §5 and §8.
- Generated PDF layout was inspected by tests only as text and A4 geometry; no human visual check was made. R-08 designed file
  and R-17 real mail remain Brent-owned release obligations.
- UI journeys (both CTAs, keyboard choice/change/focus/errors, consent combinations, success/documents, failure/retry, 1366×768
  and 390×844) are owned by the UI actor (Astra) and have not been performed.
