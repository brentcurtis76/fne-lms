# Review request — PASANT-PARTICIPANT-INTAKE (DB-01 + APP-01)

## Branch and base

- **Worktree:** `/home/brent/Projects/pm-workflow/worktrees/genera-pasant-intake`.
- **Branch:** owned by the PM; the app author ran no Git.
- **Base:** `bd19809c29bb01f54f757c605f811d778342c915`, as stated in the order and not verified by the author.
- **Commits:** 0, and none claimed. A local commit is pending the cumulative FINAL review.
- **Source freeze:** r5, with identical identity before and after the runtime.
- **State:**
  - local runtime PASS, except the retained pgTAP 002 CLI-history gap;
  - UI acceptance is `UI_BLOCKED_TOOL_DISABLED`;
  - the cumulative FINAL review is pending;
  - no CI run, not deployed, not ready for human acceptance.

## Objective and scope

**Objective:** a private, link-based roster intake for the January 2027 pasantía. FNE creates a link per school and
program. The school coordinator enters one ficha per traveller, edits, and sends. Nothing is mailed: "sent" means
available to the FNE admin.

**In scope:**
- the frozen DB contract (DB-01, a separate author);
- the coordinator page, the API and the admin page, plus the Sidebar entry;
- unit, API and page tests;
- the real-stack Playwright spec, added to the mandatory e2e list;
- docs.

**Out of scope:**
- participant deletion (N4);
- legal sign-off of the notice wording (N5);
- production, Publish and mail;
- middleware, auth or config changes;
- new dependencies.

## Files by risk (APP-01, all new unless marked)

**High — security boundary / data access**
- `pages/api/pasantias/participants/index.ts`, `[id].ts`, `finalize.ts`: the coordinator API, authenticated by link.
- `pages/api/admin/pasantia-participants/index.ts`, `[rosterId].ts`: the admin API (create, rotate, revoke, read).
- `lib/pasantias/participants/server.ts`: the shared preamble (method, rate limit, `Intake` header, size), roster and
  participant reads, RPC calls, and the exact refusal mapping.
- `lib/pasantias/participants/admin.ts`: the admin guard (checkIsAdmin, then the forced-password verdict) and the
  token-writing helper.
- `lib/pasantias/participants/token.ts`: token generation, SHA-256 and the strict header parser.

**Medium — validation and UI state**
- `lib/pasantias/participants/validation.ts`, `rut.ts`, `dates.ts`, `form.ts`, `client.ts`, `types.ts`, `notice.ts`.
- `pages/pasantias/nomina.tsx`: the coordinator page (save, retry, replay and stale handling, send, reopen).
- `pages/admin/pasantia-participants.tsx`: the admin page.
- `components/pasantias-intake/*.tsx`: ParticipantForm, ParticipantList, IntakeShell, RosterStatusBadge,
  AdminRosterParts.

**Low — shared files, one edit each**
- `components/layout/Sidebar.tsx` (modified): one child under "Personas".
- `scripts/ci/e2e-mandatory.mjs` (modified): one spec appended.
- `PROJECT_STATE.md` (modified): one entry prepended.
- `vercel.json` (modified): one key, `"feat/pasant-intake": false`, in `git.deploymentEnabled`.

**Tests and docs**
- `__tests__/lib/pasantias/participants/{rut,dates,validation,token,client-form}.test.ts`, plus the
  `fake-supabase.ts` helper (not a test file).
- `__tests__/api/pasantias-participants.test.ts` and `__tests__/api/admin/pasantia-participants.test.ts`.
- `__tests__/pages/pasantias-nomina.test.tsx` and `__tests__/pages/admin/pasantia-participants.test.tsx`.
- `tests/e2e/pasantias-participant-intake.spec.ts`.
- `docs/plan/pasantias-participant-intake-20261027.md` and this file.

## Test evidence

The PM ran this locally on 2026-10-28 against source freeze r5, on a synthetic, isolated local stack. The authors ran
nothing. The evidence lives in the management packet outside the repo: `evidence-index.json`, `full-unit-summary.json`,
`real-runtime-summary.json` and `run/20261028T034015Z/pgtap-pm-reconciliation.json`.

| Gate | Result |
|---|---|
| Focused unit set | 1 200 / 1 200 PASS |
| Full Vitest (`npm test`, 8 shards) | 17 869 passed, 0 failed, 0 pending, 536 files. Zero skips |
| `type-check` | PASS |
| `lint` (zero warnings) | PASS |
| `lint:testid`, the 7 new UI files | zero-warning PASS |
| `lint:testid`, full repo | **retained FAIL baseline**: 47 errors, 2 540 warnings, pre-existing; disposition in the packet's `review-testid-baseline.md`. Not a pass |
| `guard:browser` · `guard:migrations` · `guard:secrets` | PASS |
| `build` plus the price guard | PASS |
| Stubbed browser | 33 PASS |
| Real local API/DB browser | 96 expected, 0 skipped, 0 flaky, 0 failed |
| — `pasantias-participant-intake.spec.ts` | 18 (journey, revoke/rotate, isolation, 4 races, roles plus forced password plus PostgREST denial, leaks ×2, keyboard 1366/390, time zones, 8 kB plus no-store, 429) |
| — regressions | `pasantias-flow` 22, `pasantias-page` 19, `pasantias-form` 14, `pasantias-leads-admin` 3, `ci-fixture` 20 |
| pgTAP 114 (DB-01) | 176 / 176 |
| pgTAP, all 77 files | **76 complete; not a full pass.** 002 stops at 113 of 137 because it needs migration history from the normal Supabase CLI flow. No history was fabricated. Aggregate exit 1. The full CI gate is still required |
| Migration apply on a synthetic clone | PASS |
| Network audit | PASS |
| Teardown | own containers stopped, network removed, no listeners, old stack unchanged |
| CI · cumulative FINAL · UI acceptance | NOT_RUN · pending · `UI_BLOCKED_TOOL_DISABLED` |

**First failures, preserved and fixed after review (product behaviour unchanged by each)**
1. **Focused r1: 41 failures out of 1 197.** Two test files used a 45-character synthetic token, while a real token is
   43 characters. The product correctly answered 401 or "missing link". The fixtures were corrected and guarded.
   Focused r2 then passed 1 200 / 1 200.
2. **Type r1: 23 TS diagnostics.** With `strict: false`, `!x.ok` doesn't narrow the boolean-discriminant result
   types. The five routes now use explicit `=== false` / `=== true` guards. Type r2 and r3 PASSED.
3. **Unit-4 r1: 1 678 / 1 680.** The existing ledger-inventory guard refuses `.from(<imported constant>)`. The two
   admin routes now use the literal `'pasantias_intake_rosters'`. Unit-4 r2 then passed 1 680. Shards 1–3 ran before
   this change; their equivalence rests on the packet's `review-app-inventory-repair-r1.md` §5 plus focused-r4 and
   source-scanners.

**Earlier source-review rounds:**
- **NB2:** dietary control characters are refused, and lengths are counted in code points.
- **NB3:** a replay or no-op is never reported as a new save.
- **NB4:** a pinned assertion that rotate and revoke touch only link fields.
- **F-1:** labels match Brent's wording exactly.

**Portable commands**

```bash
npm run type-check && npm run lint && npm run lint:testid
npx vitest run __tests__/lib/pasantias/participants __tests__/api/pasantias-participants.test.ts \
  __tests__/api/admin/pasantia-participants.test.ts __tests__/pages/pasantias-nomina.test.tsx \
  __tests__/pages/admin/pasantia-participants.test.tsx
npm test
npm run build && npm run guard:browser && npm run guard:migrations && npm run guard:secrets
npm run test:db          # Supabase CLI + Docker; 114-pasantias-participant-intake.sql
npx playwright test tests/e2e/pasantias-participant-intake.spec.ts   # seeded local stack, next start
node scripts/ci/e2e-mandatory.mjs --list
```

## Scrutinize hardest

1. **Replay and STALE semantics in `pages/pasantias/nomina.tsx`.** After a replayed create, or a STALE edit, whose
   stored values differ from the draft, the page converts the editor into an edit of the stored row and keeps the typed
   values. Check that intent is never silently lost and never silently applied.
2. **The roster lookup versus the RPC lock.** The API resolves the roster on the app clock to learn the program. The
   write is still decided by the RPC under its lock on the DB clock. The post-write read uses `findRosterByHash` with
   no liveness filter, so a revoke that lands just after a committed write still reports the stored state. Confirm
   that is the right trade.
3. **The admin participant count embed.** `participants:pasantias_intake_participants(count)` is PostgREST
   embedded-count syntax. A fake cannot verify it; only the e2e journey asserts `participantCount`. That journey passed
   locally, but CI hasn't run it.
4. **The keyboard e2e.** It depends on Chromium/Linux ArrowDown changing a closed `<select>`, and on an exact tab order
   (fields, then the five dietary boxes, then cancel, then save). Both viewports passed locally. It is brittle by
   nature, but deliberate.
5. **The 8 kB limit is enforced twice.** The route `config` makes Next answer a plain 413 before the handler runs; the
   in-handler check covers mocked tests and any parser bypass. Confirm Next's 413 body (not JSON with our code) is
   acceptable.

## Known limitations

- The notice wording needs human or legal review (N5) and makes no claim of legal sufficiency.
- No participant removal (N4).
- `X-Forwarded-For` is honoured by the existing limiter. The e2e uses that to model distinct clients, which also shows
  the limiter can be bypassed by spoofing the header. That weakness already existed and isn't changed here.
- `\s` in the admin's ROSTER_EXISTS lookup can differ from Postgres `[[:space:]]` for exotic whitespace. The 409 is
  still returned, without an id.
- Name validation uses explicit Latin ranges, not `\p{L}`, so older browsers work. Non-Latin scripts are refused.
- **pgTAP 002** isn't a local pass: it needs migration history from the normal Supabase CLI. The full CI gate (gate 3)
  is still required.
- **Full-repo `lint:testid`** keeps its pre-existing baseline of 47 errors and 2 540 warnings. Only the 7 new UI files
  were held to zero.
- **UI acceptance** at 390 and 1366 px hasn't been done (`UI_BLOCKED_TOOL_DISABLED`). Passing Playwright doesn't count
  as UI acceptance.
- **Optional review notes left as is:** F-2 (Next's own 413 has no `no-store`) and F-3 (admin client creation outside
  `try`). Both are Low and optional.
