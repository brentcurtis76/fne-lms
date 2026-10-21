# PASANT-B005 — flight-deck area verification (criterion PASANT-C010)

Unit PASANT-10 r1, executor Claude Code (claude-opus-5-5, high; REPORTED), 2026-10-13. Plan PASANT revision 1,
approved by Brent on 2026-10-08 (source `a95970513043…bc9f`). That approval is not repeated or renewed here.
This file records evidence only. It changes no workflow record, workflow source or application code.

**Verdict: D1–D4 pass under Brent's text-listing acceptance method.** C010 is verified from the supported
managed records plus a saved read-only text listing of them. This is **not a current UI pass**: the native deck
journey stays historically partial. PM acceptance of C010 is still pending.

`PMW` below means `~/Projects/pm-workflow`, and `RUN = PMW/runs/PASANT-10`. The r1 validator is
`RUN/scratch/r1/validate_text.py`, driven by `RUN/scratch/r1/focused-text.sh`. Raw output is in
`RUN/evidence/text-r1/focused-raw.log`. r0's validator, journey verifier and logs are kept unchanged.

## Acceptance method (Brent, decision `334cb536b656ca9a`)

Brent wrote this in the console at 2026-10-13T15:15:10-03:00:

> For PASANT-10's acceptance check: I accept a read-only text listing of the project records instead of clicking through the deck's tab. Use the text listing and continue.

- This replaces only C010's UI-navigation evidence. The outcome, identity, repository boundaries and the other
  gates stay as approved in revision 1.
- Brent's note is its own authority. It is separate from the plan approval.

## Text listing (D3 evidence)

- File: `RUN/evidence/text-r1/listing.txt`, 50 lines, sha256
  `a5ce29a3c29118fa41f5fc90b0bcba1d90ffdf8b081764360b9c72cb31c04c47`. The raw `snapshot.json` and `verify.json`
  are saved beside it.
- Captured at 2026-10-13T15:19:26-03:00 by the executor (herdr agent `pasant-10-r1c0-1297`), with
  `RUN/scratch/r1/capture-listing.py`. The capture ran only read-only commands:
  - `PMW/bin/pm-project snapshot PASANT`, without `--refresh`, exit 0;
  - `PMW/bin/pm-project verify PASANT`, exit 0, chain_ok, manifest seq 52;
  - `git rev-parse --git-common-dir` and `git branch --show-current` for each PASANT root.
- It lists 12 record paths with their sha256, and the observed identity, grant, plan, layout, builds and repository
  mapping.
- It reads only PASANT records. No `.env`, key or credential was read.

The validator re-derives every listed value from the authoritative records on each run:

| Check | What it compares | Result |
|---|---|---|
| `D3.capture_provenance` | time after Brent's note; actor; snapshot (no `--refresh`), verify and git commands; raw outputs present | PASS |
| `D3.method_authority` | decision id, attribution and exact words = `decisions/334cb536b656ca9a.json` | PASS |
| `D3.records_listed` | all 12 records present; immutable scope, layout, approved plan, source copy and approval note unchanged | PASS |
| `D3.identity_values` | id, kind, group, draft name, slug, display names, root count, verify, discrepancies | PASS |
| `D3.plan_values` | grant status, revision 1, approved_at; session; proposal, approval-note and source hashes | PASS |
| `D3.layout_values` | layout revision 1 → scope revision 1 and `7a68ece2…`; six build lines incl. `PASANT-B005 → PASANT-C010` | PASS |
| `D3.repository_values` | 3 roots: role, branch, git common dir and exactly one selected (= unit root) | PASS |
| `D3.pm_listing_agrees` | same group, grant revision, source, build IDs and repositories as the PM's `evidence/pm-text-r1/listing.json` | PASS |

## D1 — one PASANT area under GENERA, identity preserved

| Check | Observed (fresh records) | Result |
|---|---|---|
| Draft identity | prefix `PASANT`, kind `area`, group `GENERA`, name `Pasantías`, slug `pasant-as`, status `ready` | PASS |
| Draft approval | one `approved` event, proposal `f326716d048a…7037` | PASS |
| Registration | 3 workstream roots with prefix PASANT, all `project: GENERA`, one name, one ledger/index | PASS |
| Display name | registered and snapshot name `GENERA · Pasantías` = `<group> · <draft name>`; not a rename | PASS |
| Duplicates | no other prefix uses that name; no other draft is named `Pasantías` or slugged `pasant-as` | PASS |
| Project records | manifest `PASANT`/`GENERA`; `verify` ok and chain_ok; snapshot `PASANT`/`GENERA`, 0 discrepancies | PASS |
| Existing grant | `plans/PASANT.json` approved revision 1; snapshot grant revision 1, snapshot_verified | PASS |

C010 calls `GENERA · Pasantías` an optional, unconfirmed display-name suggestion. The draft name `Pasantías` is
preserved, and the `<group> · <name>` label is the convention every GENERA project uses.

## D2 — accepted proposal, plan source, layout and repository links

| Link | Observed | Result |
|---|---|---|
| Accepted proposal | session, user approval, author and reviewer acceptance, generation, scope source and proposal rev 2 all `f326716d048a…7037` | PASS |
| Approval note | sha256 = session `evidence_sha256` = scope `approval_evidence_sha256` (`e9932faf…783c`) | PASS |
| Plan source | `approved-plan.md` = `plans/PASANT-source-1.md` = grant `source_sha256` = `a95970513043…bc9f` | PASS |
| Layout → scope | layout revision 1 → scope revision 1 (`7a68ece2…b5d5`); manifest scope/layout revision 1 | PASS |
| Builds | layout, generated rows and snapshot all `PASANT-B001…B006`; all 6 in the ledger | PASS |
| C010 coverage | `PASANT-B005` covers exactly `PASANT-C010`; C010 is in scope revision 1; unit item is PASANT-B005 | PASS |

Repository mapping. All three roots share the git common dir `…/fne-lms-working/.git`, which is the GENERA main
in `projects.json`.

| Root | Role | Branch |
|---|---|---|
| `…/worktrees/genera-pasant-as` (migration-staging) | **original retained checkout**: grant, draft setup and snapshot `root` | `ws/pasant-as` |
| `PMW/worktrees/genera-pasant05-rebuild` | earlier continuation alias (PASANT-05 parent) | `fix/pasant05-main` |
| `PMW/worktrees/genera-pasant02-repair` | **selected continuation**: unit root = `stack.root`; `stack.original_root` = the original | `fix/pasant02-ci` |

## Native deck journey — historically partial, unverified

- **r0** (`RUN/ui/20261013-003841-1203837`): UI_NOT_RUN. Desktop control was off, and the executor had no
  desktop tools.
- **PM follow-up** (`RUN/ui/deck-observations/`, `RUN/ui/20261013-122139-1519051`): the journey ran, with
  11 observations passing and 1 unresolved. `journey.json` records `pass:false`; ui-run exit 1.
  - The deck showed one PASANT entry under GENERA, plan revision 1, six build titles and the Herdr space.
  - The accepted-plan, build-layout and repository *targets* could not be opened (finding P10-F2).
- Both receipts are retained unchanged and still fail. This file does not turn them into a UI pass. Whether the
  deck's native links open those targets remains unverified; the text listing replaces that evidence only because
  Brent explicitly allowed it.

## D4 — hygiene and gates

- Only the two allowlisted docs changed (untracked). There is no tracked diff, and HEAD is unchanged.
- `git diff --check` is clean, including both new docs.
- All 60 r0 artifacts are unchanged (`RUN/evidence/text-r1/retained-r0.sha256`).
- Gates: see the review request and `RUN/executor-report-r1.md`.

## Negative controls (scoped scratch copies, no workflow mutation)

Each of these is run on a copy holding only PASANT records, plus the prefix, name and group fields of other rows:

- The control copy reproduces the live verdicts.
- Wrong group → `D1.ws_group`.
- Wrong proposal → `D2.proposal_sha`.
- Wrong source → `D2.source_sha` and `D3.records_listed`.
- Wrong continuation → `D2.continuation_root` and `D3.repository_values`.
- Missing listing → `D3.listing_present`.
- Tampered listing: group → `D3.identity_values`; B005 criterion → `D3.layout_values`; selected repository →
  `D3.repository_values`; Brent's words → `D3.method_authority`; `--refresh` capture → `D3.capture_provenance`.
- Missing record → fails closed with 0 passed.

## Findings

- No registration defect was found, so no corrective command is proposed.
- P10-F2 (the deck exposes no openable plan, layout or repository target) stays a workflow UI observation. It is
  outside this unit's write scope, and Brent's method instruction covers C010's evidence without it.
