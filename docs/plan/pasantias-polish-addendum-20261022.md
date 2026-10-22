# Pasantías January 2027 — polish addendum (2026-10-22)

Status: **user-approved additive correction, implementation authored; validation pending the PM.**
Unit: PASANT-DESIGN-POLISH-01, order revision 2; §4 amended by order revision 3 (remediation 1, same day).

This document sits beside the ratified contract, `docs/plan/pasantias-january-contract.md`, and does not change it.
The contract file, its machine-readable block, its ratification record and its `decided` entries are left byte for byte
as they were. Where this document and the contract both speak, the contract's facts stand; this document only adds the
two display items below, which the contract never ruled on.

## 1. Authority

- Brent, 2026-10-22, correcting the public page's "Quién te recibe" section: it "should also include Sandra", verified
  against the brochure, pages 4 and 12.
- Brent, 2026-10-22, on the polish proposal that followed: "implement all your proposed changes".
- Scope of that approval: the nine polish requirements P1–P9 of PASANT-DESIGN-POLISH-01. Local implementation, tests and
  a reviewed local commit only; no push, PR, deploy or merge in this unit.

## 2. Evidence

- The designed brochure the contract is built from: sha256
  `84d83e153ee794a95d7a9e019359fc637237842ae0a7128f98cae332ff4efdb5`, 17 pages, version `2027-01-V1`
  (contract §1). Pages 4 and 12 name Sandra Entrena as Encargada de Innovación, Escola Virolai, and as host.
- The October content pack and design brief carry the same title for her
  (`docs/plan/design/brochure-content-pack.md`, `docs/plan/design/a6r-design-brief.md`).
- Her portrait already ships: `public/images/pasantias/equipo/sandra-entrena.jpg`, listed in
  `lib/pasantias/image-manifest.ts`. No image is added, generated or edited.

## 3. Additions

### 3.1 Second host (P2)

Appended to `COHORT_HOSTS` in `lib/pasantias/cohort-public.ts`, **after** Jordi Musons:

| Field | Value |
|---|---|
| name | Sandra Entrena |
| role | Encargada de Innovación |
| school | Escola Virolai |
| note | Anfitriona |

- Jordi Musons stays first and stays the contract's P-01 host (DEC-01, BD-01), with the ratified spelling "Musons"; the
  brochure's "Mussons" stays prohibited.
- No other host is added. Every other October expert stays out of the public module, and October's "semana 1" host notes
  stay out too.
- The note is "Anfitriona", without October's "semana 1": January's brochure does not limit her role to one week.

### 3.2 Program CTA short names (P6)

A `shortName` per program, used only for the page's program CTAs ("Me interesa …"):

| Program ID | name (contract) | shortName (this addendum) | CTA label |
|---|---|---|---|
| `inspira` | Pasantía INSPIRA | INSPIRA | Me interesa INSPIRA |
| `mirada-profunda` | INSPIRA Mirada Profunda | Mirada Profunda | Me interesa Mirada Profunda |

These are display labels, not contract facts. They live in the public module rather than in the page so that the page
keeps its rule of writing no cohort string by hand: "Mirada Profunda" is also the contract's routing label, and the
hardcoded-cohort guard rejects it as a literal anywhere in `pages/pasantias.tsx`.

## 4. Consequences, stated so none of them is a surprise

- `/pasantias` shows both hosts with equally sized portraits, side by side from 640 px and stacked on a phone.
- The ficha and brochure PDFs (`lib/pasantias/ficha.tsx`, `lib/pasantias/brochure.tsx`) map `COHORT_HOSTS`, so each gains
  one "Quién te recibe" row for Sandra Entrena. Neither file was edited.
- The generated-PDF regression `lib/pasantias/__tests__/pdf.test.ts` listed "Sandra Entrena" as October-only content.
  It now requires, in both PDFs, her name and the exact row "Encargada de Innovación, Escola Virolai · Anfitriona", citing
  this document. Every other October prohibition stays, including "Coral Regí", "Boris Mir", "Pepe Menéndez" and
  "Mussons", and October's "Anfitriona semana 1" is added to it.
- Ficha cache key: `FICHA_VERSION` (`lib/pasantias/pdf/filenames.ts`) moves from `2027-01-v1` to `2027-01-v2`. Its
  documented invariant is to bump whenever the ficha's rendered text changes, because the `propuestas` bucket serves
  whatever sits at `pasantias/ficha-<FICHA_VERSION>.pdf`. PM decision, 2026-10-22: the January ficha is already deployed
  in production, so a generated `ficha-2027-01-v1` object may exist and would keep serving a ficha without Sandra. The
  production endpoint was not probed, and no bucket object was written or deleted. Consequences:
  - The ficha's download name becomes `Ficha-Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v2.pdf`.
  - The ficha prints "Versión 2027-01-v2".
  - The exact expectations in `lib/pasantias/__tests__/pdf.test.ts`, `__tests__/api/pasantias-pdf.test.ts`,
    `tests/e2e/pasantias-flow.spec.ts` and `__tests__/scripts/price-leak-corpus.mjs` move with it.
  - The first production ficha request after deployment renders and stores the v2 object, as with every earlier bump.
- `BROCHURE_VERSION` stays `2027-01-v1`. `pasantias/brochure-2027-01-v1.pdf` is the designed brochure (R-08), which
  already names Sandra, and bumping the version would orphan it. The renderers and the download APIs are unchanged.
- The hardcoded-cohort guard's `EXPECTED_LEAF_COUNT` moves from 106 to 112: four host fields and two short names. Its
  collection count stays 14. No gap, unprintable, uniform, fragment or restatement declaration is added for them.
- `__tests__/lib/pasantias-cohort.test.ts` pins two hosts, Jordi first, and the program oracles carry the short names.
  Its "no unratified October expert" check excludes Sandra Entrena by citing this document and nothing else.
- No price, currency, commercial term, auth, admin, database, migration, dependency or service changes. API behaviour is
  unchanged; only the ficha's existing version discriminator moves, as above.

## 5. Status

Implementation is authored. Tests, build, price guard, browser specs and the PM's UI checks are **pending the PM**. Until
they run on the final state and an independent review approves it, nothing in this document is "done". R17/A9 human
obligations remain open and are not affected by this addendum.
