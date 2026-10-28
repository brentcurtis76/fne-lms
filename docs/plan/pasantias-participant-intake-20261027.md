# PASANT-PARTICIPANT-INTAKE-01 — school roster ("nómina") intake

Status: **IMPLEMENTED; local runtime PASS except a retained pgTAP 002 CLI-history gap.**
- UI acceptance: `UI_BLOCKED_TOOL_DISABLED`.
- Cumulative FINAL review: pending.
- Not deployed, no CI run, no commit, and not ready for human acceptance.

The DB unit (DB-01) is frozen in `docs/plan/evidence/pasant-intake/db-contract.md`. This document covers the app
unit (APP-01). See "Validation state" below.

## Outcome

FNE creates one private link per school and program (January 2027 cohort). A school coordinator opens the link
without a GENERA account and fills in one ficha per traveller: personal data, travel and funding, and dietary needs.
They edit as needed and press **Enviar nómina a FNE**.

- No e-mail is sent by this feature. "Sent" means the roster is marked submitted and is available on the FNE admin
  screen.
- Any later edit reopens the roster until it is sent again.

## Contract sources

- FIRST review §3–§8, adopted verbatim by plan r2. This covers FIRST-B1 to B7 and N1 to N7.
- Frozen DB contract: `docs/plan/evidence/pasant-intake/db-contract.md` (migration `20261028020000`, pgTAP 114).
- PM decisions for APP-01:
  - e2e tests use a synthetic `X-Forwarded-For` per describe block as the client identity, with no product rate-limit
    change;
  - the follow-up read of the saved row is scoped to the verified roster;
  - malformed headers are refused with no database call, while unknown, expired and revoked tokens need a lookup;
  - logs contain only safe codes;
  - headings use the existing Mont font, the body uses sans;
  - participant deletion (N4) is out of scope.

## Surfaces

| Surface | Path | Who |
|---|---|---|
| Coordinator page | `/pasantias/nomina#k=<token>` | anyone holding the link |
| Coordinator API | `GET/POST /api/pasantias/participants`, `PUT …/[id]`, `POST …/finalize` | `Authorization: Intake <token>` |
| Admin page | `/admin/pasantia-participants` (Sidebar → Personas → "Nóminas de pasantes") | global admin |
| Admin API | `GET/POST /api/admin/pasantia-participants`, `GET/PATCH …/[rosterId]` | global admin; forced-password hold |

## Fields (the coordinator's ficha)

| Group | Field | Required | Stored as |
|---|---|---|---|
| Datos personales | Nombres, Apellidos | ★ | NFC, trimmed, 1–80 letters/space/'’.- |
| | RUT | ★ | strict wrapper → `12345678-5` (FIRST-B4) |
| | N° de pasaporte | optional | `^[A-Z0-9]{5,20}$` or null |
| Viaje y financiamiento | Pasajes / Estadía (options "Costo SEP" / "Costo Colegio") | ★ (never defaulted) | `sep` \| `colegio` |
| | Llegada | optional ("Sin indicar") | real date: program start −1 or −7 days |
| | Regreso | optional | real date: the program's OWN end +1, +7 or +14 days |
| | Foco (Infantil, Primer Ciclo, Segundo Ciclo, Tercer Ciclo) | optional | `infantil` \| `primer_ciclo` \| `segundo_ciclo` \| `tercer_ciclo` |
| Alimentación | Restricciones (Vegetariano, Vegano, Sin Gluten, Sin Lactosa, Otra restricción) | optional (empty = not provided) | sorted distinct subset of `otra, sin_gluten, sin_lactosa, vegano, vegetariano` |
| | Detalle de «Otra restricción» | ★ when ticked | 1–200 code points; control characters refused; cleared when unticked |

The coordinator also ticks a page-level acknowledgement (`lib/pasantias/participants/notice.ts`). Every real save
records `acknowledged_at` and `notice_version`. The wording is a release review item, and makes no claim of legal
sufficiency.

## Design notes

- **Token (FIRST-B1).**
  - 256 random bits as base64url (43 characters). Only its SHA-256 is stored.
  - Shown once, in the admin create or rotate response, and held only in React state.
  - Travels in the URL fragment and in `Authorization: Intake`, never as `Bearer`.
  - The intake routes never call the shared auth helpers.
- **Leak posture (FIRST-B2).**
  - The page sets `<meta name="referrer" content="no-referrer">`, `X-Robots-Tag` and `private, no-store`.
  - The server HTML carries no school or participant data.
  - Every API response is `no-store` and never carries the hash.
- **Dates (FIRST-B3/B5).**
  - One module (`dates.ts`) with UTC calendar arithmetic, per-program dates and labels from `formatDayLong`.
  - Changing the offsets is a constant change, never a migration.
- **Writes (FIRST-B7).**
  - Every coordinator write is one RPC that re-checks the link under `FOR UPDATE`.
  - The API's own lookup is used only to resolve the program for validation and to answer GET.
  - After a write, the API reads the stored row within the verified roster and returns that.
- **Idempotency (plan r2).**
  - Each create attempt has one `clientRequestId`, reused by every retry of that attempt.
  - Two cases can store values that differ from what was typed: a replayed create, and a STALE edit whose response was
    lost. In both, the page shows the stored row and keeps the typed values in the form as an edit.
- **Visible state.**
  - Each ficha shows "Cambios sin guardar", "Guardando…" or "Guardado".
  - The roster shows "Borrador", "Enviada a FNE el …" or "La nómina volvió a edición; envíala nuevamente".
  - The admin sees "Abierta", "Enviada" or "Reabierta tras envío", plus Vigente, Vencido or Revocado.
- **Layout.**
  - FNE black, white and yellow tokens (`brand_primary`, `brand_accent`, `brand_accent_text`); Mont headings, sans body.
  - At 390 px everything is in one column with the ficha first. At 1366 px the saved list sits beside the ficha.

## Files

See `docs/planning/reviews/fase-pasant-intake-review-request.md` for the full list, grouped by risk.

## Validation state (local, 2026-10-28, source freeze r5)

The evidence lives in the management packet outside the repo (`evidence-index.json`, `full-unit-summary.json`,
`real-runtime-summary.json`, `run/20261028T034015Z/pgtap-pm-reconciliation.json`).

| Gate | Result |
|---|---|
| Focused unit set | 1 200 / 1 200 PASS |
| Full Vitest | 17 869 passed, 0 failed, 0 pending, 536 files, 8 shards |
| type-check · lint (zero warnings) | PASS · PASS |
| `guard:browser` · `guard:migrations` · `guard:secrets` | PASS |
| `build` plus the price guard | PASS |
| `lint:testid`, 7 new UI files | zero-warning PASS |
| `lint:testid`, full repo | **retained FAIL baseline**: 47 errors, 2 540 warnings, pre-existing; not a pass |
| Stubbed browser | 33 PASS |
| Real local API/DB browser | 96 / 96, 0 skipped, 0 flaky; `pasantias-participant-intake.spec.ts` 18, plus the pasantías and ci-fixture regressions |
| pgTAP 114 (new) | 176 / 176 |
| pgTAP, all files | 76 / 77 complete. **Not a full pass**: 002 stops at 113 of 137 without Supabase CLI migration history (none fabricated); aggregate exit 1 |
| Network audit · teardown · source identity | PASS · own services stopped, network removed, old stack unchanged · r5 before and after |
| CI · UI acceptance · cumulative FINAL · commit | NOT_RUN · `UI_BLOCKED_TOOL_DISABLED` · pending · none |

**First failures, preserved and fixed after review**
- **Focused r1, 41 failures:** both test files used a 45-character synthetic token, so the product correctly answered
  401. Fixtures fixed.
- **Type r1, 23 diagnostics:** boolean-discriminant narrowing with `strict: false`. Fixed with explicit equality guards.
- **Unit-4 r1, 2 failures:** the ledger inventory refuses an imported constant as a `.from` target. The admin routes
  now use the literal table name.

None of these changed product behaviour.

**Portable commands**

```bash
npm run type-check && npm run lint && npm run lint:testid
npx vitest run __tests__/lib/pasantias/participants __tests__/api/pasantias-participants.test.ts \
  __tests__/api/admin/pasantia-participants.test.ts __tests__/pages/pasantias-nomina.test.tsx \
  __tests__/pages/admin/pasantia-participants.test.tsx
npm test
npm run build && npm run guard:browser && npm run guard:migrations && npm run guard:secrets
npm run test:db          # needs Supabase CLI + Docker; pgTAP 114 is the intake file
npx playwright test tests/e2e/pasantias-participant-intake.spec.ts   # seeded local stack, next start
```

## Not done here

- Deleting a participant (N4).
- Legal confirmation of the notice wording (N5).
- Showing a stored date that later stops being an option, beyond a plain-date label (FIRST §6).
- Production or Publish. No mail.
