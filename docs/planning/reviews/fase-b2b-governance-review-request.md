# Review request — Santa Marta governance correction: B2b learning-path split

**Phase type:** governance/documentation only. No product code, no migrations, no database access, no deployment.
**Status requested:** independent **re-review** (Codex). This phase is **REVIEW READY AGAIN** — the findings of both independent review rounds are remediated in bounded correction commits; nothing is accepted, merged, or authorized by itself.

---

## 0. Second correction round — request for re-review of the round-2 diff only

**Reviewed round-1 correction head (immutable):** `ed80258fd02a3a21bc279a54df51458057cf6bf9`. The three existing commits were not amended, rebased, reset, or rewritten; round 2 lands in one additional correction commit (the fourth in `550ee347..HEAD`; it contains this file, so its own SHA is reported in the phase report and verified with `git log`).

**Requested scope:** the round-2 diff `ed80258f..HEAD` plus verification that the five round-2 findings below are resolved. **Round-2 changed files (exactly six):** `scripts/check-ledger.mjs` · `PROJECT_STATE.md` · `docs/reviews/santa-marta-work-items.csv` · `docs/reviews/santa-marta-release-protocol-2026-08-25.md` · `docs/reviews/santa-marta-ledger-normalization-report-2026-08-25.md` · this file. The combined plan, work-claim map, and every frozen artifact are untouched this round; no ledger count moved (still 160 / 36 / 106 / 151 / 58 / 27).

### Round-2 findings and dispositions

| # | Finding (second review) | Disposition |
|---|---|---|
| R2-1 | **Check 18 was presence/absence, not exact.** Arbitrary extra identifiers (e.g. `profiles`) inside a scope list passed. | **Fixed — exact set equality.** The validator now parses the scope a work item actually encodes — the union of `gate_salida`'s parenthesized, comma-separated snake_case identifier lists — and requires it to EQUAL the approved set: missing, renamed, duplicated, cross-set, and arbitrary extra entries each produce `[18 alcance]` (the cross-set token scan is retained as belt-and-braces). W-B2c-01's `gate_salida` was reformatted into the same parenthesized-list convention («exactamente las dos tablas (…)» / «exactamente las seis funciones (…)») with unchanged approved content. **Mandatory mutation, run in a disposable temp copy of the validator+inputs under the session scratchpad:** adding `profiles` after `submissions` in W-B2b-01's explicit list produced `[18 alcance] — "su lista explícita añade identificadores fuera del conjunto aprobado: profiles"`, suppressed the «alcance del split OK» note, and raised the failure count to 68; the copy was restored (67 again) and then deleted without touching the reviewed worktree. |
| R2-2 | **Check 20 did not cover PROJECT_STATE.** | **Fixed.** D-RLS-01, D-RLS-02 and D-RLS-03 are now each required in the protocol, the normalization report, **and PROJECT_STATE** (whose entry now spells out all three ids — the previous `D-RLS-01/02/03` shorthand did not literally contain the second and third). **Mandatory mutation (temp copy):** removing `D-RLS-03` from PROJECT_STATE produced `[20 diferidos] — "PROJECT_STATE no conserva la unidad diferida D-RLS-03"` with the OK note suppressed; restored to 67, copy deleted. The pre-existing renamed-function mutation stays red — now `[18 alcance] ×2` (missing + extra) plus `[19 funciones] ×1`. |
| R2-3 | **B2a's technical closure was cited as if it were stakeholder acceptance.** | **Fixed, without reopening B2a.** All governing texts (protocol §§0/2/4/9, `W-B2a-01.notes`, PROJECT_STATE, report §12.3) now state: `W-B2a-01` is **technically DONE**, closed in production on its recorded engineering evidence; technical DONE does not itself prove stakeholder acceptance; acceptance is complete only when a governed **mutable** record carries the accepting **person and date**; **no such person-and-date record is currently evidenced for `W-B2a-01`** and it is no longer cited as though one existed. No person, date, or signature was invented; neither migration was touched; DONE status preserved. |
| R2-4 | **`fix/auth-sec2` topology was imprecise** — "sin ref"/"un-reffed" was asserted. | **Fixed against read-only ref checks.** Verified: absent from the canonical repository (`git show-ref` → nothing) and from live origin (`git ls-remote` → nothing); **present in the frozen repository `/Users/brentcurtis/dev/fne-lms` as `refs/heads/fix/auth-sec2`, pointing exactly to `4b87243cfe846b477fbaa2c6146d4d91048e858b`**. Every "sin ref"/"un-reffed" assertion is removed from the active documents (W-B10c-01 notes, protocol §4 + §9, report §12.7 — annotated; F5 below — corrected in place). All texts now state that any future integration into canonical requires an explicit Brent-authorized restoration/copy from that frozen local branch ref; **no restoration was performed**. |
| R2-5 | **"Re-basar" wording in D-RLS-01/D-RLS-03 was ambiguous** (could read as `git rebase`). | **Fixed.** Protocol §9 and report §12.6 now use «relevar de nuevo contra `main` actual» / «rederivar desde `main` actual» / «reconstruir el inventario sobre `main` actual», each unit explicitly adding that this implies **no git operation on `fix/rls-public`** (no rebase, no merge, no cherry-pick, no wholesale reuse). PROJECT_STATE mirrors the unambiguous wording. |

**Validator classification after round 2:** unchanged — exit 1, exactly the same **67 `[16 propiedad]`** failures, zero in any other class; checks 18/19/20 print their OK notes on the real worktree (`alcance … igualdad exacta de conjuntos …`, `funciones B2c OK …`, `unidades diferidas OK — … en protocolo, informe y PROJECT_STATE …`). Counts re-verified independently: 160 · 36 · 106 · 151 · 58 · 27. Frozen artifacts byte-identical (§6). Gate evidence re-run at the round-2 head is in §8.

---

## 0.1 First correction round — findings and dispositions (first re-review; reviewed head `9132ef59`)

**Reviewed head (immutable):** `9132ef59fa35d20239d170930a89297c436b6513`. The two reviewed commits were not amended, rebased, reset, or rewritten; every remediation lands in one additional correction commit on top (the third commit in `550ee347..HEAD` — it contains this file, so its own SHA is reported in the phase report and verified with `git log`).

**Requested scope of that first re-review (historical):** the correction diff `9132ef59..ed80258f` plus verification that each prior finding below is resolved — not a restart of the full review. *(That re-review happened; its findings are the round-2 table in §0.)*

**Correction-diff changed files (exactly these seven):** `PROJECT_STATE.md` · `docs/reviews/santa-marta-work-items.csv` · `docs/reviews/santa-marta-release-protocol-2026-08-25.md` · `docs/reviews/santa-marta-combined-plan-2026-08-25.md` · `docs/reviews/santa-marta-ledger-normalization-report-2026-08-25.md` · `scripts/check-ledger.mjs` · this file. The work-claim map, the frozen claims, the archived ledgers, and the three dated audit reports are untouched in this round; no ledger count moved (still 160 / 36 / 106 / 151 / 58 / 27).

### Findings and dispositions

| # | Finding (first review) | Disposition |
|---|---|---|
| F1 | **B2c RPC inventory named two functions that do not exist** — `start_learning_session` / `end_learning_session`. | **Fixed.** The schema-exact names are `start_learning_path_session` / `end_learning_path_session`, verified against the committed baseline (`CREATE OR REPLACE FUNCTION "public"."…"`, all six `SECURITY DEFINER`; baseline lines 709 / 990 / 2060 / 2377 / 4681 / 5218) and the two API callers (`pages/api/learning-paths/session/start.ts:86`, `end.ts:49`). Corrected in the five files that carried them (work-items CSV, protocol-linked plan row, normalization report, PROJECT_STATE, this file §2). No schema object or application call was renamed. Negative search for the retired names across the corrected governance files: zero hits (now also validator-enforced). |
| F2 | **Validator did not pin the approved scopes.** | **Fixed — checks added, none weakened.** New check `18 alcance` pins W-B2b-01's `gate_salida` to exactly the fourteen approved tables, W-B2c-01 to exactly `learning_paths` + `learning_path_courses` + the six exact functions, W-B10a-01 to exactly the six tables, forbids cross-set leakage, and asserts disjointness with total 14 + 2 + 6 = 22. New check `19 funciones` proves each B2c function exists as `SECURITY DEFINER` in the committed baseline and that the two retired names are absent from the active governance documents (work-items, map, protocol, plan, report, PROJECT_STATE). New check `20 diferidos` keeps the D-RLS deferred units, their five functions, and the `565faa0d` research anchor present. Mutation-tested: renaming one function in the CSV raises `[18]`+`[19]`; deleting `D-RLS-03` from the protocol raises `[20]`; byte-identical restore returns to exactly 67. |
| F3 | **The broader non-learning RLS surface fell out of governance** when the split narrowed B2c to learning paths. | **Fixed without touching frozen claims.** No claim invented, no denominator moved, no forced mapping, orphan-work invariant intact. The protocol (§9), normalization report (§12.6) and PROJECT_STATE now carry the deferred units: **D-RLS-01** (rebaseline the non-learning EXECUTE surface on current `main`: `has_transformation_access`, `get_available_assignment_templates`, `cleanup_propuesta_rate_limits`, `has_global_workspace_access`, `submit_quiz`; `profiles_role_backup` excluded — its table lockdown is B2b's), **D-RLS-02** (separately govern actor/body redesign of `has_global_workspace_access` + `submit_quiz`; depends on D-RLS-01; separate from mechanical GRANT changes), **D-RLS-03** (rebaseline/classify the remaining anon-granted `SECURITY DEFINER` surface; the old plan's "80 signatures" is historical evidence at `fix/rls-public` head `565faa0d`, recount on current `main` required before scheduling; discovery only). All three DEFERRED/BLOCKED, unimplemented, unscheduled, unauthorized; the old branch is research evidence only, read via `git show`, commits never reused wholesale. |
| F4 | **Delivery rule contradicted the frozen register** — "no batch is delivered until its claims have `evidencia_prod`/`firmado_por`/`fecha_firma`", but the claims CSV is byte-frozen and can never be populated. | **Fixed.** The protocol now distinguishes the two registers in all three places that stated the old rule (§0 ownership paragraph, §2 delivery rule, §9 closing line): the frozen claim register is a historical snapshot whose evidence/signature fields stay empty forever; technical closure evidence and acceptance (person + date) are recorded on the mutable register — the work item (`notes`/`gate_salida`) or a governed acceptance record, exactly as W-B2a-01's closure is recorded. No stakeholder signature, person, date, or production evidence was invented; B2a stays DONE and untouched. |
| F5 | **Branch inventory was wrong** — the protocol claimed four batch branches exist including `fix/auth-sec2`. | **Fixed against `git ls-remote` (2026-08-27).** Live canonical/origin batch branches are exactly three: `fix/horas-rep` (`f6d0e908`), `fix/gate-score` (`63616d61`), `fix/red-super` (`63fc8c9c`). `fix/auth-sec2` is **absent** from the canonical repository and the live remote and is preserved in the frozen repository `/Users/brentcurtis/dev/fne-lms` as local branch `refs/heads/fix/auth-sec2` pointing exactly to `4b87243c` *(round 1 wrote "un-reffed frozen safety copy"; the topology was precised in round 2 — see §0 R2-4)*; W-B10c-01's notes now say so (integration starts with an explicitly Brent-authorized restoration/copy from that frozen local branch ref, not a checkout), and the protocol's §4 inventory + §9 drift note are corrected. `fix/rls-public` (`565faa0d`) stays separately identified as the parked remote research branch, not a batch branch. The report's round-2 inventory sentence is annotated as historical with a pointer to the current inventory (§12.7). |
| F6 | **Validation evidence conflated `git diff --check` ranges.** | **Fixed.** Correction-range `git diff --check 9132ef59..HEAD` is clean. The cumulative `base..HEAD` range carries 331 warning lines that live **entirely inside the byte-locked imported artifacts** of commit 1 (the archived legacy CSV — every line, plus one line of the deliverability audit); commit 2's range (`c31e002c..9132ef59`) contributes zero. Those files are hash-frozen and are **not** modified to silence the warnings. §8 below now states the evidence per range. |

**Validator classification after remediation:** unchanged — exit 1 with exactly the same **67 `[16 propiedad]`** failures and **zero** failures in every other class, including the three new classes `18 alcance` / `19 funciones` / `20 diferidos` (all three print their OK notes). Counts unchanged: 160 · 36 · 106 · 151 · 58 · 36 · 27 · modes 89/10/6/1. Frozen artifacts re-verified byte-identical (§6). Full gate evidence re-run at the correction head is in §8.

---

## 1. Branch, worktree, base

| | |
|---|---|
| Branch | `docs/sm-b2b-split` (17 chars, ≤ 20) |
| Worktree | `/Users/brentcurtis/dev/wt/sm-b2b-split` |
| Base SHA (live `origin/main`, verified before branching) | `550ee347f96af53c93c4a5a506fb3190188894a9` |
| Commit count | exactly **4** (two reviewed + two remediation rounds) |

**Commit history:**

1. `c31e002cf410f097c6ca1f6d255baa100d0110f2` — `docs(audit): preserve Santa Marta ledger package` — a clean cherry-pick of `23ede10eb944f4a4372eee6fe031ddf0727af1e8` (tip of local `docs/sm-audit`), the only imported commit. It adds the normalized ledger package (12 new files under `docs/reviews/` + `scripts/check-ledger.mjs`) and the narrowly scoped `.gitignore` rules already contained in that commit. Nothing was cherry-picked from `fix/rls-public`.
2. `9132ef59fa35d20239d170930a89297c436b6513` — `docs(audit): split B2b learning-path governance` — the reviewed governance correction (immutable review history).
3. `ed80258fd02a3a21bc279a54df51458057cf6bf9` — `docs(audit): remediate B2b-split review findings` — the first remediation round (§0.1), itself independently re-reviewed.
4. The round-2 remediation commit answering the second review's findings (§0) — **this commit**; it contains this file, so its own SHA cannot be written here. Verify with `git log 550ee347..HEAD` (exactly these four commits, the first three byte-identical to the reviewed ones).

## 2. Objective and the approved split

Brent approved splitting the former W-B2b-01 scope:

1. **W-B2b-01** becomes an **atomic lockdown of exactly fourteen repository-unused legacy tables**: `answers`, `assignments`, `course_prerequisites`, `deleted_blocks`, `deleted_courses`, `deleted_lessons`, `deleted_modules`, `menu_permissions`, `metadata_sync_log`, `profiles_role_backup`, `questions`, `quizzes`, `student_answers`, `submissions`.
2. The **learning-path security boundary** moves to the new, separately governed unit **W-B2c-01** (lote `B2c`, rama `fix/rls-learn`, `BLOCKED`, `clase_migracion = BLOCKED`, owner Brent + agente BD): `learning_paths`, `learning_path_courses`, their direct table grants and RLS policies, `create_full_learning_path`, `update_full_learning_path`, `batch_assign_learning_path`, `start_learning_path_session`, `end_learning_path_session`, `auth_is_learning_path_member` (function names corrected per finding F1, §0), actor identity derived from the authenticated session, same-school and cross-school authorization, tenant isolation for parent and child records, preservation of legitimate authenticated application reads, cookie- and bearer-authenticated API compatibility, pgTAP + application integration + mandatory synthetic E2E proof, and privacy approval of the role × tenant matrix.
3. **W-PC-06** is created as the **read-only data-classification dependency** for B2c (`PRODUCTION_CHECK`, `BLOCKED`, `UNAUTHORIZED`, authorization_owner Brent, deliberately empty `dueno`/`execution_owner`). It was **not authorized and not run** in this task.
4. **W-B10a-01** is reduced from eight referenced legacy tables to the remaining **six**: `group_assignment_discussions`, `growth_community_transformation_access`, `instructors`, `modules`, `propuesta_rate_limits`, `qa_tester_time_logs`. The original audit claim (`SWEEP-PRIOR-AUDIT-09`, frozen) still correctly describes eight referenced tables; they are now remediated as two (B2c) plus six (B10a). The three table sets are explicit, non-overlapping, and their union still accounts for the original 14 unused + 8 referenced = 22 tables.
5. **W-B2a-01** is updated `SCHEDULED → DONE` with factual closure evidence (PR #56, merge `0a6576c9ef52cc1513162549edc918208ba45bdf` on independently approved head `63fc8c9c91a4b4b28773bd15dc426f5d3a195961`, docs PR #57, live-main closure commit `550ee347f96af53c93c4a5a506fb3190188894a9`, green PR + post-merge CI, automatic Vercel deployment, Brent-only application and read-only verification of migrations `20260827150000` and `20260827160000`). Neither migration was rerun or altered.
6. `fix/rls-public` is **parked as read-only research** (head `565faa0d4604d4e992e2a29f38ac248cac4aef2a`). It was not rebased, merged, cherry-picked, edited, or reused; this branch imports nothing from it.

## 3. Scope in / scope out

**In:** the two ledger CSVs, the release protocol (→ revision 6), the combined plan (banner + row 0.4 split + group-B 8→6), the normalization report (new §12 + reconciled current-tense counts), `scripts/check-ledger.mjs` (narrow expectation updates), one PROJECT_STATE.md entry, and this review-request file.

**Out (explicitly not done):** any B2b/B2c implementation or implementation prompt; any migration; any database or production access (including W-PC-06 itself); any product code, test, package, or CI change; any edit to AGENTS.md or CLAUDE.md; any change to the frozen claim register (claim identities, claim text, the 160-claim and 36-P0 denominators); any touch of `fix/rls-public`; push, PR, merge, deployment.

## 4. Files by governance risk

**Higher risk — the machine-checked governance surface (scrutinize hardest):**

- `docs/reviews/santa-marta-work-items.csv` — W-B2b-01 rescoped to the 14 tables; **new** W-B2c-01; **new** W-PC-06; W-B10a-01 8→6 tables; W-B2a-01 → DONE + closure evidence. 104 → 106 rows.
- `docs/reviews/santa-marta-work-claim-map.csv` — removed `W-B2b-01,SWEEP-MI-APRENDIZAJE-09`; added `W-B2c-01,SWEEP-MI-APRENDIZAJE-09`, `W-B2c-01,SWEEP-PRIOR-AUDIT-09`, `W-PC-06,SWEEP-MI-APRENDIZAJE-09`. 149 → 151 pairs.
- `scripts/check-ledger.mjs` — `PERMITTED_ID_TRANSFORM.expectedWorkItems` 2 → 3 (comment explains the three remediation mappings and why W-PC-06 never counts); `B2c` added to `CANONICAL_BATCHES` after `B2b`; `B2c: 'fix/rls-learn'` added to `CANONICAL_BRANCH`; exact merge-batch expectation 26 → 27 (including the two diagnostic list caps). **No validation weakened, skipped, or deleted; no special-casing of the new rows.** Frozen expectations (160 claims, 36 P0, legacy SHA-256) untouched.

**Medium risk — governing prose that the validator reconciles:**

- `docs/reviews/santa-marta-release-protocol-2026-08-25.md` — revision 6. LEDGER-SUMMARY JSON and all quantitative prose updated (see §5); B2c added after B2b in the summary JSON, batch table (class BLOCKED, 1 work item, 2 P0 links, branch `fix/rls-learn`), §3 class-exception rules (the six B2c protocol dependencies), and activation gates (staff pilot now requires **B2a–c**, with the explicit rationale that the learning tables remain anonymously reachable until B2c closes); production-check section 5 → 6 with W-PC-06 listed as unauthorized; B2a closure recorded.
- `docs/reviews/santa-marta-ledger-normalization-report-2026-08-25.md` — new §12 records the approved post-normalization correction; canonical SWEEP-PRIOR-AUDIT-09 mapping expectation 2 → 3; W-PC-06 documented as a non-remediation evidence dependency; affected counts, batch table, consolidation/split explanations and current-tense B2b/B10a descriptions updated; the round-2 validator output kept as an explicitly labeled historical record; the historical 14 + 8 audit finding preserved.

**Lower risk:**

- `docs/reviews/santa-marta-combined-plan-2026-08-25.md` — governing banner (revision 6 + ledgers govern; dated prose is historical evidence); row 0.4 split into 0.4 (14-table B2b) and 0.4-bis (blocked B2c); §5 group-B 8 → 6 with the two-plus-six explanation. No broad rewrite of unrelated historical analysis.
- `PROJECT_STATE.md` — one new Meta entry (B2a closed/do-not-reopen; split approved; B2b = 14 tables; B2c + W-PC-06 blocked and unauthorized; B10a = 6 tables; `fix/rls-public` parked; no implementation authorized until independent review + merge). Nothing else rewritten.
- `docs/planning/reviews/fase-b2b-governance-review-request.md` — this file (new).
- Via the package-import commit only: the six frozen `docs/reviews/` artifacts (verified byte-identical, §6), `.gitignore` (+9 lines already contained in `23ede10e`; no further `.gitignore` changes made).

## 5. Exact ledger counts, before → after

| Measure | Before (imported package) | After (correction) |
|---|---:|---:|
| Frozen claims | 160 | **160** (unchanged) |
| Unique P0 claims | 36 | **36** (unchanged) |
| Work items | 104 | **106** |
| Claim/work links | 149 | **151** |
| P0 claim/work links | 56 | **58** |
| Unique P0 claims with links | 36 | **36** |
| Merge batches | 26 | **27** |
| MERGE / DATA / PRODUCTION_CHECK / DOCUMENTATION | 88 / 10 / 5 / 1 | **89 / 10 / 6 / 1** |
| SCHEDULED / BACKLOG / BLOCKED / DONE | 31 / 57 / 16 / 0 | **30 / 57 / 18 / 1** |
| Work items inside merge batches / unbatched MERGE | 32 / 56 | **33 / 56** |
| P0 links inside / outside merge batches | 37 / 19 | **38 / 20** (outside = 13 DATA + 7 PRODUCTION_CHECK) |
| Ownership-only blockers (excl. PRODUCTION_CHECK exception) | 67 | **67** (unchanged) |
| Intentionally ownerless PRODUCTION_CHECK items | 5 | **6** |

Batch-table spot checks: B2b = class 2, 1 work item, 1 P0 link · B2c = class BLOCKED, 1 work item, 2 P0 links, branch `fix/rls-learn` (13 chars) · B10a = class 2, 1 work item, 1 P0 link.

## 6. Frozen artifacts — verified byte-identical at HEAD

| File | Git blob (expected = actual) |
|---|---|
| `docs/reviews/santa-marta-claims.csv` | `5c1804979e9f9747f3425a5532ee32bd11d7b655` |
| `docs/reviews/archive/santa-marta-promise-ledger-legacy-161.csv` | `adbd4b9a32fca9dda85ad71529da309489c10c82` |
| `docs/reviews/archive/santa-marta-promise-ledger-legacy-161.md` | `7de90190649297b312f2d2ae6d96eeb25bb7e46f` |
| `docs/reviews/santa-marta-promise-audit-2026-08-24.md` | `5f218e11aed3dc58ae1532e2ea49c6570f58af17` |
| `docs/reviews/santa-marta-audit-comparison-2026-08-25.md` | `22145842d34a1654cdbe993f699ba0a4d094a7fc` |
| `docs/reviews/santa-marta-deliverability-audit-2026-08-24.md` | `90e95a08d6f8516f711f673d6c35a1611d49a9c9` |

Archived legacy CSV SHA-256: `009f14abccec97d7ada4b559c9aaeb24ac5b7aab54563a5c1151e511dc2c7fe9` (exact; also re-verified by the validator on every run). No claim identity, claim text, the 160-claim denominator, or the 36-P0 denominator changed.

## 7. Validator evidence — structural success vs. the known ownership debt

`node scripts/check-ledger.mjs` exits **1** with exactly **67 failures, all in class `[16 propiedad]`** — the same pre-existing ownership debt (57 BACKLOG items without `dueno`/`triage_owner` + 10 P0-linked DATA items without a real `dueno`). The failure ID set was diffed against a run on the pre-correction package: **byte-identical**. This is the documented, expected non-green state; it is ownership debt, not a defect of this correction.

**Zero failures** in every structural class: schema (06), enums/identity (07/08), counts (01/02), duplicates (03), dangling references and duplicate pairs (04), referential integrity (05), provenance (09), batches (10/11), branches/branch-length (12/13), protocol reconciliation JSON + prose (14), P0 conflation/stale counts/DROP scan (15), byte + ID conservation (17), and — since the remediation round — the split-scope pins (18), the baseline-function/retired-name checks (19), and the deferred-unit presence checks (20), each printing its OK note. Both conservation notes print OK. W-B2c-01 creates **no** ownership failure (real owner `Brent + agente BD`); W-PC-06 is recognized as the deliberate ownerless PRODUCTION_CHECK exception (exception counter = 6).

Headline figures from the run: 160 claims · 36 P0 · 106 work items · 151 links · 58 P0 links · 36 P0 claims with links · 27 merge batches · modes 89/10/6/1.

## 8. Gate evidence (local, this worktree, node_modules via `npm ci`)

| Gate | Result |
|---|---|
| `node scripts/check-ledger.mjs` | exit 1 — exactly the 67 known ownership-only failures (§7); zero structural failures, including the new checks 18/19/20 |
| `git diff --check 9132ef59..HEAD` (correction range) | **clean** — zero warnings |
| `git diff --check 550ee347..HEAD` (cumulative) | 331 warning lines, **all inside the byte-locked imported artifacts of commit 1** (every line of `docs/reviews/archive/santa-marta-promise-ledger-legacy-161.csv` plus one line of `santa-marta-deliverability-audit-2026-08-24.md`); the reviewed-correction range `c31e002c..9132ef59` contributes zero. The files are hash-frozen and are not modified to silence the warnings (finding F6) |
| `npm run type-check` (`tsc --noEmit`) | PASS — zero diagnostics |
| `npm run lint` (eslint, `--max-warnings=0`) | PASS — zero errors, zero warnings |
| `npm test` (Vitest, full run) | PASS — 368 test files (368 passed) · 8,406 tests passed · 11 skipped · 0 failed — identical counts to the B2a round-3 baseline on `main`; run at the reviewed head (207.7s), the round-1 remediation head (200.2s) and the round-2 remediation head (190.4s) |
| `npm run build` (`next build`) | PASS — exit 0 (pipefail-verified): compiled successfully, page data collected, full route manifest emitted. The build ran with shape-valid **synthetic** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_BASE_URL` placeholder values passed inline — a Pages Router build only requires these to exist at module load and performs no Supabase connection; no real credential was copied into the worktree |

Database (pgTAP) and Playwright suites were not run: this phase changes no migration, database test, UI, API, or product behavior, per the phase definition. `git log 550ee347..HEAD` contains exactly the four commits of §1; `git diff --name-only 550ee347..HEAD` contains only the files listed in §4 (round 1 touched the seven files of §0.1; round 2 touched the six files of §0). All four repository gates (type-check, lint, unit tests, build) were **re-run at each remediation head** with the results in the table above.

## 9. Confirmation of non-actions

No database read or write (production or otherwise), no Supabase MCP usage, no production check executed (W-PC-06 included), no deployment or Vercel interaction, no migration created/run/altered, no product code or test touched, no package or CI file touched, no push, no PR opened or modified, no merge, no edit to AGENTS.md/CLAUDE.md, no touch of `fix/rls-public`, no 14-table implementation prompt prepared. The build gate ran with locally supplied environment values only and performed no network mutation.

## 10. Areas an independent reviewer should scrutinize hardest

1. **Frozen-claim and archive preservation.** Re-derive the six blob hashes and the archived SHA-256 at the head you review (`git ls-tree`, `shasum -a 256`) rather than trusting §6. The one place drift could hide is a claims-CSV edit smuggled alongside the ledger edits.
2. **B2b/B2c/B10a table-set completeness and non-overlap.** Verify the three explicit sets (14 + 2 + 6) are disjoint, sum to the historical 22, and that no table silently changed groups — the CSV `gate_salida` fields, protocol §4/§8, plan rows 0.4/0.4-bis/§5, and report §12 must all list identical sets.
3. **B2c class/dependency handling and the W-PC-06 boundary.** Check that B2c stays `BLOCKED`/`clase BLOCKED` everywhere, that the six protocol dependencies (classification first; privacy matrix; class-2-only-if-clean; separate class-3 backfill item; no invisible 3-in-2 combination; documentation ≠ production authorization) appear in the work item, the protocol §3, and the report, and that no wording anywhere authorizes running W-PC-06 or invents final policies.
4. **Reconciled counts and validator expectations.** Recompute §5 from the raw CSVs (not from the prose) and confirm the validator's new expectations (3 remediation mappings, 27 batches, `B2c → fix/rls-learn`) encode the approved decision rather than merely echoing the data — and that no existing check was weakened to get there.
5. **B2a closure evidence without reopening B2a.** Confirm the W-B2a-01 row, protocol §0/§4 and PROJECT_STATE entry only *record* the already-performed closure (PR #56 / `0a6576c9` / `63fc8c9c` / #57 / `550ee347` / the two migrations) and instruct no re-execution, no reopening, and no migration change.

## 11. Known limitations and deferred items

- **W-PC-06 has not been authorized or run.** Its evidence definition is future-tense by design.
- **The B2c tenant policy is not designed.** No RLS policy text, function hardening, or authorization matrix exists yet — deliberately.
- **Whether B2c needs a data backfill is unknown** until W-PC-06 runs; if it does, a class-3 work item and batch must be defined and separately authorized before B2c is scheduled.
- **No B2b or B2c implementation prompt exists.** Preparing one is out of scope until this correction is reviewed and merged.
- **Independent review and merge are still required.** This branch is REVIEW READY only; nothing in it is accepted, scheduled, or authorized by its own existence.
- Two enum-shaped imperfections are inherited from the package and recorded there (report §9.2): `delivery_mode` has no operational mode, and `W-B2a-01` retains its planned `clase_migracion = 0` while its closure evidence records that two additive migrations were ultimately applied through the correction rounds — the row's notes carry the factual record.
