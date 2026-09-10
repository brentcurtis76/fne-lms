# SM-CI-RECOVERY r1 — executor report

**Status: READY_FOR_REVIEW** (test-only repair plus executor validation; not review approval, release or publication).

## Actor and configuration

- Actor: Claude Code, sole product writer for this unit. Model self-identified `claude-opus-5`; effort medium as ordered (runtime effort not independently observable by executor). Fallback NONE.
- Bounded-executor 1.1.0 delivered as an explicit packet; native skill loading not claimed. No subagents, no Bridge/MCP, no hosted or provider calls, no data operations.
- Window 2026-09-10 08:14–08:35 -03. New independent baseline test defect: initial 1, remediation 0 / cap 2. Not a B6b remediation.
- Prior dispatch 69500 (exited `notloggedin` before writes) left no artifacts; this session performed all writes. Context UNKNOWN; no compaction observed.

## State lock

- Root `/Users/brentcurtis/dev/wt/sm-nav-dir`, branch `fix/nav-dir`, HEAD `10983e7fe1a6f579cef6ba9a1407847543fad6ec` (unchanged; uncommitted delivery, no commit/push/merge/deploy).
- B6b writer 26951 confirmed gone. Protected B6b bytes UNCHANGED at freeze:
  - `components/layout/Sidebar.tsx` sha256 `5793e9510cd6da533fe9cabb133b69ad4a5905e4bc4c1ac0f98ccdc8abe6f2e4`
  - `__tests__/components/layout/Sidebar.schoolResults.test.tsx` sha256 `05e7dd31284484ae8c08454b785b80d28cfdf0d3721c1be68288d73c6016c812`
- PM app on 3127 (PID 69369, next-server) left running; preview 3107 untouched; no server started or stopped by executor. Another worktree (`wt/zoom-b4`) was running its own vitest/`npm ci`; not touched.
- Production crypto `lib/auth/recovery-crypto.ts` UNMODIFIED (sha256 `3b4d906f7cf38ac9fd6952d63e7e87fd32b2a18ce47f47b6133a15e99ae4ceef`). No app/security/config/dependency edits.

## Diagnosis — independently confirmed, PM oracle upheld

The failure is a **test defect, not a GCM authentication failure, and not a product or security defect.**

`sealRecoveryEnvelope` emits `v1.<iv>.<ciphertext>.<tag>`; the tag is 16 bytes → 22 base64url characters. The final character carries only 2 significant bits (its low 4 bits are padding a decoder discards); the penultimate carries 6. The old mutation `` `${envelope.slice(0, -2)}aa` `` therefore leaves the decoded 16-byte tag **byte-identical** whenever the canonical suffix is one of `aQ aR aS aT aU aV aW aX aY aZ aa ab ac ad ae af` — exactly 16 of 4096 pairs = **1/256**. In that case nothing was tampered with at all: the envelope decrypts correctly and `openRecoveryEnvelope` legitimately returns the plaintext object, so `expect(...).toBeNull()` fails.

Independent confirmation (executor, not reusing PM's artifact):
- Exhaustive enumeration of all 4096 suffix pairs: 16 unchanged, rate 1/256, `aQ` among them; `A`×20+`aQ` is a canonical encoding (`/tmp/sm-recovery-validation/oracle-independent.log`).
- Empirical over 50 000 real sealed envelopes: the old textual mutation left **189/50 000 (~1 in 265) fully decryptable**, first surviving tag suffix `aQ`; the byte-level mutation left **0/50 000** (`/tmp/sm-recovery-validation/old-mutation-oracle.log`).

This matches the observed run-1 failure in `/tmp/sm-b6b-validation/unit-full.log`. No security or product scope finding arises; GCM authentication itself was never demonstrated to fail, and remains unmodified.

## Change (allowlist only)

`__tests__/lib/auth/recovery-crypto.test.ts` — sha256 `d8f098c24064ef42d5dbb81257aabd44c1b970bca910e05ede20b5771b1b2093`, diff sha256 `0b1e510ab5695d4883aca071f814f07dd594bff11b8454473fb826ef9da60b12` (+137/−6 within the file; `git diff --stat` total for the branch also includes the untouched B6b Sidebar change).

Replaced the probabilistic textual mutation with deterministic mutation of **decoded bytes** of an actual envelope segment, using the real library:

- `mutateSegment` decodes a segment, flips the low bit of byte 0, re-encodes canonically. Guaranteed byte change, with explicit inequality assertions on bytes, segment text and full envelope.
- Encoding and shape preserved: identical decoded length, identical segment character length, 4 segments, `v1` version, and re-decode round-trip — so rejection is produced by GCM authentication, not by the length/parse guards in `openRecoveryEnvelope`.
- Negative controls across **IV, ciphertext and tag**, each over three payloads, each with a positive control (`toEqual(payload)`) first so no assertion is vacuous.
- Substantive wrong-key and wrong-purpose coverage: `message` envelope rejected under `OTHER_SECRET`, and under both other purposes (`request`, `grant`) with both secrets, after a positive control.
- Byte-level mutation of an issued grant → `{ ok: false, reason: 'invalid' }`.
- Explicit control test proving the OLD mutation had an unchanged-binary case: `A`×20+`aQ` vs its `aa` rewrite decode to identical bytes, plus the bounded exhaustive enumeration asserting exactly the 16 survivors and `4096/16 === 256`. Deterministic; no probabilistic stress loop anywhere.
- Opacity assertion retained (`expect(envelope).not.toContain('example.test')`). No weakening, skipping, retrying or deletion of existing coverage; the round-trip, IP fingerprint and grant tests are preserved (the IP test stays in its original describe).

## Validation

All logs in `/tmp/sm-recovery-validation/`. Node runtime is called out per row because it turned out to matter.

| Command | Node | Exit | Result | Log |
|---|---|---|---|---|
| Independent oracle enumeration | 26.5.0 | 0 | 16/4096 = 1/256, `aQ` confirmed | oracle-independent.log |
| 50 000-envelope comparison | 26.5.0 | 0 | old 189/50 000 decrypted; byte-level 0/50 000 | old-mutation-oracle.log |
| `vitest run __tests__/lib/auth/recovery-crypto.test.ts` ×30 | 26.5.0 | 0 ×30 | 12/12 every run | focused-30x.log |
| same ×10 | 22.22.0 | 0 ×10 | 12/12 every run | focused-10x-node22.log |
| `npm run type-check` | 26.5.0 / 22.22.0 | 0 / 0 | clean | type-check.log, type-check-node22.log |
| `npm run lint` (max-warnings 0) | 26.5.0 / 22.22.0 | 0 / 0 | clean | lint.log, lint-node22.log |
| `npm test` (full unit) | 26.5.0 | 1 | 51 failed in 4 jsdom files; recovery-crypto PASSED | unit-full.log |
| the 4 files in isolation | 26.5.0 | 1 | same 51 failures — reproducible, not contention | four-files-isolated.log |
| `npm test` (full unit, final state) | 22.22.0 | 0 | **431 files, 9904 passed, 12 skipped** | unit-full-node22.log |

Test count rises 9898 → 9904 (+6 new cases); 12 skipped unchanged.

No build was run: this is a test-only change and the B6b build (`/tmp/sm-b6b-validation/build.log`, exit 0) remains applicable to unchanged app code, per order.

### Evidence retained, not erased

The original B6b full-unit failure stands as recorded: run 1 (07:54) exit 1 with this exact assertion failing, and the later B6b rerun (08:01) exit 0 with the same bytes. That pair is precisely the 1-in-256 nondeterminism now explained and fixed; `/tmp/sm-b6b-validation/` logs are retained unmodified.

## Blocking finding — Node 26 breaks jsdom `localStorage` (environment, not code)

Under Node **26.5.0** the full suite fails 51 tests across 4 files (`responseDraft`, `workspace.mention-scope`, `docente/assessment-completion`, `docente/assessment-form-autosave`) with `TypeError: Cannot read properties of undefined (reading 'getItem'/'clear')`, alongside `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`. Node ≥25 exposes a native `localStorage` global that is `undefined` without `--localstorage-file`; it shadows the jsdom-provided one, so any jsdom test touching `localStorage` breaks. Files not using `localStorage` (e.g. the B6b Sidebar test) still pass, which is why this surfaced only now.

Attribution: unrelated to this change (my file is `@vitest-environment node` and touches no DOM) and unrelated to product code. It appeared because the corrected OS auth environment reordered `PATH` so `node` resolves to Homebrew v26.5.0; the earlier B6b session used nvm v22.22.0. `.github/workflows/ci.yml` pins **node-version: 22** at all five jobs, so CI is unaffected and Node 22 is the supported runtime. The final-state full run above was executed on Node 22 accordingly.

Routed to PM, not acted on (outside allowlist): consider an `.nvmrc`/`engines` pin, or a jsdom-`localStorage` shim in `tests/setup.ts`, so local runs on Node ≥25 match CI. **Any executor or reviewer running this repo's suite locally should ensure `node -v` is 22.x**, otherwise they will see 51 spurious failures.

## Hygiene and freeze

- Product writes STOPPED at this report. Only `__tests__/lib/auth/recovery-crypto.test.ts` was written; no provisional or debug additions remain in it, so no allowlist cleanup was required.
- Scratch `/tmp/sm-recovery-validation/` (including `old-mutation-oracle.mjs`) and all `/tmp/sm-b6b-validation/` logs RETAINED as evidence. No worktrees, stacks, logs or other retained resources deleted. No git stash used.
- No commit, push, merge, deploy, publication or management/ledger record. No UI_REQUIRED for this test-only repair; B6b UI/E2E remains PM-owned.

Next: PM independent review of the frozen state (hashes above), a decision on the Node-version finding, and any publication under the existing grant.
