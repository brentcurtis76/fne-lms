# Review Request — Contract Activation Without Signed Document

| | |
|---|---|
| **Branch** | `feat/ctr-activate` |
| **Base** | `main` @ `8a71c89` |
| **Commits** | 2 — `ffd8552` (feature), `3479219` (review fixes) |
| **Files** | `pages/contracts.tsx`, `components/contracts/ContractDetailsModal.tsx`, `components/contracts/ContractForm.tsx`, `lib/utils/contract-status.ts` (new), `lib/utils/__tests__/contract-status.test.ts` (new) |
| **Net diff** | 5 files, +374 / −128 |
| **Date** | 2026-07-30 |
| **Author** | Claude (Fable 5) with Brent Curtis; product decisions confirmed interactively with Brent |

---

## 1. Problem and goal

Clients frequently execute the engagement without ever returning the signed contract PDF. FNE performs the work, invoices, and gets paid — but in the app the contract can never leave `borrador`/`pendiente`, because **the only code path to `estado='activo'` was uploading the signed document** (`handleUploadContract` set `estado` + `contrato_url` in one write). Accounting therefore could not see these contracts as active even though they were operating in reality.

Two aggravating factors discovered during exploration:

1. The upload UI was hidden once a contract was active, so "activate now, attach the signed doc later" was structurally impossible.
2. Accounting's cash-flow view (`CashFlowView`) keys off a separate manual flag `incluir_en_flujo` that **no** activation path set — even the signed-doc upload didn't make accounting see the contract.

**Goal:** allow an admin to activate a contract without the signed document, keep the ability to attach the signed document later, make activation actually visible to accounting, and keep visibility of which active contracts still owe a signature.

## 2. Product decisions (confirmed with Brent before implementation)

1. **Any activation auto-includes the contract in the cash flow** (`incluir_en_flujo=true`). The manual "En Flujo" toggle remains as the opt-out.
2. **Guardrail = confirmation dialog only.** No reason capture, no new audit columns, **no schema migration**. (An audit-trail finding surfaced later in review was deliberately not acted on for this reason — see §7.)
3. After review, "fix all findings" was ordered explicitly: *"a deferred fix is a bug in production."* All 15 findings were fixed in `3479219`.

## 3. Plan (as approved)

- New "Activar sin documento firmado" action in the contract detail modal, behind a styled confirmation dialog.
- Late-upload path: the signed-doc upload UI stays available for active contracts that still lack a confirmed signature.
- Derived "Firma pendiente" state with a list badge, a modal pill, and a "Firma pendiente (N)" filter chip for chasing signatures.
- Both activation paths set `incluir_en_flujo=true`.
- No new endpoints, no RLS changes, no migrations — all writes go through the page's existing admin-only client-side Supabase update pattern (`contratos_update_admin_only` RLS).
- es-CL UI copy, English code/comments, `data-testid` on all new interactive elements, feature branch ≤20 chars.

The original plan derived "firma pendiente" from `estado==='activo' && !contrato_url`. **The code review proved this derivation wrong** (imported contracts carry a source PDF in `contrato_url` from creation) and the final implementation derives it from the `firmado` column instead — see finding F4.

## 4. Execution — commit `ffd8552` (feature)

- `pages/contracts.tsx`: `handleActivateWithoutDocument` (client-side update `estado='activo', incluir_en_flujo=true` + list/modal refresh); upload handler extended with `incluir_en_flujo=true`; FIRMA PENDIENTE list badge; filter chip; new modal prop.
- `components/contracts/ContractDetailsModal.tsx`: "Firma pendiente" pill; upload section split into pending vs. active-without-doc variants; activate button + hand-rolled confirmation dialog (the shared `components/common/ConfirmModal` was evaluated and rejected — its `isLoading` prop is declared but not implemented, it auto-closes on confirm, and it has no warning variant or testid pass-through).
- Gates at this commit: type-check, lint (zero warnings), Vitest 3351/3351, build, Playwright e2e 52 passed / 27 skipped.

## 5. Code review — process

Adversarial multi-agent review of the branch diff at extra-high effort:

- **10 independent finder angles** (line-by-line, removed-behavior, cross-file tracer, JS/React pitfalls, wrapper correctness, reuse, simplification, efficiency, altitude, CLAUDE.md conventions).
- **14 deduplicated candidates**, each checked by an independent adversarial verifier → 12 survived (CONFIRMED), **2 refuted** (dialog-closes-on-error matches the page-wide failure convention; "reuse ConfirmModal" fails because the component cannot serve the case).
- **Gap sweep** by a fresh reviewer with the confirmed list → 4 additional findings survived (one sweep item re-derived a refuted candidate and was dropped; one — `activating` stuck after an indefinitely hung request — was judged below the reporting bar).
- Final report: **15 findings (13 CONFIRMED, 2 PLAUSIBLE)**. The sweep also disproved an assumption from planning: normally-created contracts carry the DB default `estado='vigente'`, not an explicit value.

## 6. Findings and fixes — commit `3479219`

Severity order as reported. "Pre-existing" = the defect predates the branch but sits in touched code or is made consequential by the feature.

| # | Finding (file) | Fix |
|---|---|---|
| F1 | Late upload unconditionally re-set `incluir_en_flujo=true`, silently reverting a deliberate cash-flow opt-out (`pages/contracts.tsx`) | Upload payload is now conditional: `firmado` + `contrato_url` always; `estado`/`incluir_en_flujo` only when the contract was not yet active |
| F2 | "Firma pendiente (N)" chip unmounted at count 0 while the filter stayed on → list stuck empty with a misleading message | Chip renders while `count > 0 \|\| filter on`; empty state names the active filter instead of blaming the search box |
| F3 | `borrador` drafts (only `numero_contrato` validated at draft save) could be one-click activated into the cash flow | Activate button hidden for borradores (guidance text instead); **completing a draft via the validated full save now promotes `borrador → 'pendiente'`** (previously drafts stayed borrador forever — there was no promotion path) |
| F4 | Deriving "firma pendiente" from `!contrato_url` conflates *document on file* with *signature received*: imported contracts get `contrato_url` at creation, so after no-doc activation they could never show the badge nor attach the signed version; the confirmation dialog's promises were false for that class | Derivation switched to the `firmado` column via new shared `lib/utils/contract-status.ts` (unit-tested). Uploads set `firmado=true`; new **"Marcar como firmado"** action confirms an already-on-file document without re-uploading; late-upload section gates on `estado==='activo' && !firmado` |
| F5 | Stale-closure refresh could resurrect a modal the user closed mid-request, or swap it back from another contract | `refreshContratos()` uses a functional update (`prev && prev.id === id ? refreshed : prev`) |
| F6 | `estado` union omitted `'vigente'` — the DB default carried by every normally-created contract (create insert omitted `estado`) | Union widened to include `'vigente'`; create-mode insert now sets `estado:'pendiente'` explicitly (grep confirmed zero code consumers of `'vigente'`) |
| F7 | Pre-existing: cash-flow toggle never refreshed the open modal → stale label, un-flippable from the modal (now the advertised opt-out path) | Toggle uses `refreshContratos(contrato.id)` |
| F8 | Escape closed the entire details modal while a confirmation overlay was open (pre-existing pattern, replicated) | Escape now dismisses only the topmost layer (activate-confirm → invoice-delete → modal) and is ignored mid-activation |
| F9 | Pre-existing: file inputs never reset, so re-selecting the same file after a failed upload was a silent no-op — mainline for the new retry flow | Both upload handlers clear `input.value` in `finally` |
| F10 | Pre-existing: modal pill labeled borradores "Pendiente", directly above the new activate button | Three-way label/colors mirroring the list (Activo / Borrador / Pendiente) |
| F11 | PLAUSIBLE: success toast fired and dialog closed even when the post-update refresh silently failed | Toast fires immediately after the (successful) update; `loadContratos` failures now raise their own error toast |
| F12 | PLAUSIBLE: confirm dialog had no dialog semantics or focus management — keyboard focus could reach hidden destructive buttons behind the overlay | `role="dialog"`, `aria-modal`, labelled title, initial focus on Cancel, two-button Tab trap |
| F13 | 5th verbatim copy of the refresh-selected-contract block, plus a redundant sequential single-row refetch after fetching the full list | All 5 sites converged on `refreshContratos()`; `loadContratos` returns its rows and the refresh derives from them (one query fewer per action) |
| F14 | The firma-pendiente business rule was defined in two files three ways | Single exported predicate `isFirmaPendiente` in `lib/utils/contract-status.ts`, imported by both files, unit-tested |
| F15 | The two upload-section branches were near-verbatim copies (already diverging in testids) | One parameterized block (full literal Tailwind class strings per variant; per-variant testid preserved) |

## 7. Findings deliberately NOT fixed (with reasons)

- **No audit trail / who-when for no-document activation** (surfaced by the altitude reviewer). Dropped because Brent explicitly chose "confirmation dialog only, no schema change" during planning. If compliance later requires it, the right shape already exists in-repo: the `licitacionService` pattern (`VALID_TRANSITIONS` + historial table + server route).
- **`activating` flag could stick if a Supabase request hangs forever** — requires an indefinitely unsettled promise; judged below the reporting bar.
- **Refuted:** dialog-closes-on-failure (matches the page-wide toast-only failure convention, and no optimistic state is written); reuse of `components/common/ConfirmModal` (structurally unable to serve the case — dead `isLoading` prop, auto-close on confirm, no warning variant).

## 8. Test evidence

Both commits ran the full gate set; final state:

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` (`--max-warnings=0`) | clean; all new interactive elements have `data-testid` (advisory testid baseline improved, not regressed) |
| `npm test` (Vitest) | **3355 passed / 3355** (223 files; includes 4 new `contract-status` tests) |
| `npm run build` | success |
| `npm run e2e` (Playwright) | **52 passed, 27 skipped** (no contract-page e2e specs exist; the suite guards against regressions elsewhere) |

Manual verification checklist for the reviewer (as admin on `/contracts`):

1. Pending contract → "Activar sin documento firmado" → confirm → badge `Activo` + `Firma pendiente`, `En Flujo` set, cuotas visible in Flujo de Caja.
2. Same contract → late-upload section visible → upload PDF → `Firma pendiente` clears (`firmado=true`).
3. Active contract → toggle out of Flujo → late-upload the signed doc → **contract stays out of Flujo** (F1).
4. Imported contract (has `contrato_url`) → activate without doc → badge still shows; "Marcar como firmado" clears it without re-upload (F4).
5. Borrador → no activate button, guidance shown; complete + full save → becomes `pendiente` → activate button appears (F3).
6. Filter chip on with one pending contract → clear that contract → chip remains, list recovers when toggled off (F2).
7. Escape inside the confirm dialog closes only the dialog (F8); Tab cycles between its two buttons (F12).

## 9. Rollout and data implications (IMPORTANT)

- **Legacy active contracts will show FIRMA PENDIENTE on day one.** Every `contratos` row has `firmado=false` (the column existed but was dead — no UI ever set it). Contracts activated under the old flow (signed doc uploaded) therefore read as signature-pending until someone clicks **"Marcar como firmado"** in the modal (one click each; the doc is already on file so the button is offered). This is intentional truth-finding — the original complaint was that nobody knows which signed contracts actually exist — but expect a non-zero chip count immediately after deploy. No DB backfill was performed (hard rule: no direct production DB writes; a backfill `UPDATE contratos SET firmado=true WHERE estado='activo' AND contrato_url IS NOT NULL` could be run through the DB-agent flow if the noise is unacceptable, at the cost of asserting signatures nobody verified).
- **Legacy `'vigente'` rows** (every normally-created contract to date) behave exactly as before — rendered "Pendiente", activatable; they are now representable in the types and new rows are created as `'pendiente'` explicitly.
- No migrations, no RLS changes, no new endpoints. All writes remain client-side Supabase updates behind `contratos_update_admin_only`.

## 10. Areas to scrutinize hardest

1. **The `firmado` semantics switch (F4)** — biggest judgment call of the branch; review §9's rollout consequence and whether "Marcar como firmado" needs stronger confirmation copy.
2. **Conditional upload payload (F1)** — `activating = contrato.estado !== 'activo'` treats `'vigente'`/`'pendiente'`/`'borrador'` alike; confirm that uploading a signed doc to a `vigente` legacy row *should* activate + include it in flujo (we believe yes — that is the old behavior plus the agreed auto-include).
3. **Draft promotion (F3)** — relies on `handleSaveContract` being reachable only through `isStepValid()`-gated UI. Also note the pre-existing (untouched) quirk that "Guardar como borrador" on a non-draft contract demotes it to borrador.
4. **`refreshContratos` functional update (F5/F13)** — concurrency semantics under rapid successive mutations.
5. **Escape-handler dependency array (F8)** — listener re-registers on overlay-state changes; verify no missed/duplicate listener edge on fast open/close.

## 11. Known limitations / deferred

- The pre-existing invoice-delete confirmation overlay received the Escape scoping fix but was **not** upgraded to full dialog semantics/focus-trap (only the new activate dialog was). Same for extracting a genuinely shared confirm-dialog component — `ConfirmModal` would need `isLoading` implemented, a warning variant, ReactNode body, and testid pass-through first.
- No contract-page e2e specs were added (none existed; seeded tenant coverage for contracts is an open gap).
- `firmado=false` history is not reconstructible for legacy rows (see §9).
- Branch not yet pushed at time of writing (GitHub credentials unavailable on the machine); all evidence is local at `feat/ctr-activate` @ `3479219`.
