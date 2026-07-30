# Fase 2 (Z0B) — PM dossier for independent review

**Phase:** Z0B — Technical spikes (Zoom integration plan §15; NOT a GENERA-itinerary phase — scope authority is THIS document + the §15 row, per §0.2).
**Branch:** `feat/zoom-spike` · base `2786fa8` (= `origin/main`) · head `7cb0b4b` · 32 commits · [PR #25](https://github.com/brentcurtis76/fne-lms/pull/25), READY (not draft), never merged.
**Companion:** `fase-2-review-request.md` (executor self-report). Both files are leads, never the boundary — review the diff: `git diff 2786fa8...7cb0b4b`.
**PM sessions:** one (Fable). Executor sessions: Z0B-1 build (1), remediation rounds r1–r6 (6), Z0B-2 (1) — all Opus, all reviewed commit-by-commit by the PM before the next dispatch.

## 1. Authoritative scope

**In (from §15 row Z0B + chunk briefs):**
- `/meet/diag` capability probe + per-route Permissions-Policy override (the global header denies camera/mic everywhere; the embed needs them on `/meet/*`).
- Hardware/network field protocol document (es-CL; executed by consultores — the §17 matrix with pass thresholds). Field VISITS are human work and pending; the phase delivers the instrument + protocol.
- Sanitizer required (Node) layer + fixture suites + measured recall (§12) — the enforcement mechanism of the student-PII rule, built spike-first, wired to nothing until Z5.
- NER recall-layer feasibility (local measurement; deploy-ready artifacts; NO deploys).
- ffmpeg transcode/segmentation measurements + Whisper-cap fit + bundle sizing (no deps added).
- Live-Zoom verification (Z0B-2): webhook CRC/signature/retry semantics + real payload fixtures; customerKey round trip verdict; full recording round trip (record→download→S3 multipart→verify→trash→permanent delete) against LOCAL Supabase; recording enable/stop control semantics; gate G2 verdict; `/meet/diag` test-join.
- Phase docs: `zoom-spike-results.md`, `zoom-hw-protocol.md`, PROJECT_STATE updates, review-request.

**Out (explicitly):** production DB/storage (absolute); deployments (only automatic Git preview builds); migrations (ZERO in this phase); feature flags; e2e specs (Z1c); `lib/zoom/*` production client (Z1b); the Z3 product embed; real-media recording sizes (declared unmet — see §7); Whisper re-score (no key); NER cold start (no throwaway project).

## 2. Chunk → commit map

| Chunk | Commits | What |
|---|---|---|
| Z0B-1 build | `2c1f72f` `033f420` `55ae454` `9f549f9` `e168cef` `1a9155c` `df981fc` `e6a27d1` | Permissions-Policy, diag page, sanitizer+suites, NER spike, ffmpeg spike, docs, prod-curl evidence, gitignore fixture rescue |
| PM ledger | `b23e5c7` (premature approval — superseded), `0061dbe` (seal), + this dossier's commit | PM-authored docs only |
| r1 | `aae48e6` `e198bad` `6340838` | whole-span roster coverage; gitignore comment EN; docs |
| r2 | `b4b08cd` `82afe79` | segment classification (D1 cross-entry leak, D2 connector personas) |
| r3 | `c56b79b` `fce2476` | role-pattern plausibility (D3), punctuation segments (D4) |
| r4 | `a9f6f87` | G1 gap discipline + shared G2 predicate + G3 left-extension (class closure) |
| r5 | `0011f8c` | G4/G4′ lexicon candidacy (trigger tokens were name material; attendees were being destroyed) |
| r6 | `41281b9` | school-register titles, per-ending floors, numeric course codes, `º` tokenizer fix |
| Z0B-2 | `ace0898` `4f2d9a7` `06f3af1` `8c592eb` `f7166dc` `e6505eb` `77f59cb` `74cde59` `198ddd5` `c8f68fd` `b81ba6a` `7cb0b4b` | live-Zoom harness, diag test-join + signature route, webhook vectors, docs/review-request, all-7-events capture + definitive G2 |

The sanitizer remediation trail (r1–r6) is PM-driven review escalation under Brent's standing no-deferral rule; each round's ledger row (§0) records findings, fail-on-old proofs, and rulings. The defect taxonomy: classification (r1/r2) → trigger-adjacent marking (r3/r4) → lexicon candidacy (r5) → recognizer completeness (r6).

## 3. File inventory by risk

**Deployable surface (ships on merge; `main` auto-deploys):**
- `next.config.js` (+25) — second Permissions-Policy entry for `/meet/:path*`; last-wins proven by curl on dev AND prod builds; adjacent `/meetings` unaffected.
- `pages/meet/diag.tsx` (~740 after test-join) — session-presence SSR (mirrors `/meet` pattern), client-side capability probes, SDK test-join via CDN loader; env-absent ⇒ placeholder (asserted).
- `pages/api/meet/diag-signature.ts` (90) — SDK JWT mint; `role: 0` HARDCODED (client role ignored); env-absent ⇒ 404; session required; meeting number 9–11 digits; secret never leaves server. No rate limit — accepted: a signature without the meeting passcode is useless (§20), route is session-gated, Z2 replaces it with `authorizeMeetingJoin()`.
- `lib/zoom/sanitizer.ts` (node-1.6.0) — importers are TESTS ONLY (PM-verified by grep); Z5 wires it.
- `.gitignore` — fixture negations (two rounds: single-level gap, then `fixtures/**/`), raw-capture ignores.
- `supabase/config.toml` — `[storage]` + `[storage.s3_protocol]`, LOCAL only. **Merge-sequencing note: `feat/zoom-core` (Z1b) adds `[api]` to this same 36-byte stub.**

**Tests/fixtures:** 6 sanitizer/webhook suites (`__tests__/lib/zoom/`), 3 sanitizer fixture JSONs + 7 webhook fixtures (`fixtures/webhooks/`) + index; `__tests__/pages/` diag suites. Webhook fixtures are synthetic-and-self-consistent: every value replaced, signatures RECOMPUTED over redacted bodies with a declared placeholder secret ⇒ CI-verifiable with zero real secrets.

**Spike instrumentation (never imported by the app):** `scripts/spikes/ffmpeg/*`, `scripts/spikes/ner/*`, `scripts/spikes/zoom/*.mjs` (+ README + harness), `scripts/spikes/webhook/*.mjs`.

**Docs:** `zoom-spike-results.md` (§1–§9), `zoom-hw-protocol.md` (es-CL; Part B unblocked), `PROJECT_STATE.md` (surgical hunks ×2 rounds), `fase-2-review-request.md`, this dossier, plan §0 ledger rows.

## 4. Invariants with entry points

1. **Student-PII enforcement (§12):** `lib/zoom/sanitizer.ts` — module header carries the MARKING-PATH AUDIT (8 paths × guards) and per-lexicon candidacy table; blocking bars = must-catch 61/61 (100%) + precision 0 redactions/1886 words; adversarial 78.8% is a monitoring metric per plan v2.2.2 #41. Residuals R1/R2/R4/R5/R6 + inverted-unknown overcount argued in the header.
2. **SDK role decided server-side (§5):** `pages/api/meet/diag-signature.ts:74-84` — `role: 0` literal; no request field read.
3. **Secrets never client-side (§5):** same file (secret only in HMAC); spike scripts route output through a redactor (JWT-shaped catch-all); credentials live in gitignored `.env.spike.local` only.
4. **Webhook dedupe = sha256(raw body) (§6):** validated by live retry evidence — 2 retry pairs @304 s with identical request-id + byte-identical body, different timestamp/signature. Vector suite `__tests__/lib/zoom/webhook-signature-vectors.test.ts` locks: signature over RAW body (re-serialized MUST fail — provable only by construction, since all live payloads were canonical), header timestamp = epoch SECONDS vs body `event_ts` ms, `clientid` header must never appear in fixtures.
5. **Permissions-Policy scoping:** `next.config.js` — `/meet/:path*` permissive entry AFTER the global deny; exactly one header emitted (override, not append).
6. **Consent gating consequences (§12):** G1 FAIL (Pro tier) + G2 FAIL definitive ⇒ backstop closed: link-out recording disabled; unidentified participants void transfers. Verbatim rendered disclaimer text (results §9.1) proves consent covers RECORDING only.

## 5. What the PM independently verified

- **Gates re-run by the PM at every round head** (build, r1–r6, Z0B-2 report, Z0B-2 final): `npm run type-check && npm run lint && npm test && npm run build` — final: 3112/3112 in 217 files, build lists `/meet/diag` + `/api/meet/diag-signature`. CI 8/8 at `7cb0b4b` via `gh pr checks 25`.
- **Sanitizer probe battery**, grown per round to 21+ cases, re-run at each head; both r4-era defect classes (honorific, cross-sentence) were PM-discovered via probes before dispatch; final battery clean.
- **Fail-on-old proofs** re-derived: r1's finding reproduced first-hand by the PM pre-dispatch ("Camila Pérez" preserved with roster {Camila Fuentes, Rodrigo Pérez}); each round's stash-and-rerun counts reviewed.
- **Independent secret scan at final head** (executor requested it, assuming their redaction incomplete): pattern scan over the full phase diff (known leaked client-id value, JWT shapes, live passcode values, host email) = zero hits; direct inspection of `recording-completed.json` (the highest-risk fixture) and header allowlist; `git check-ignore` on `.env.spike.local` + zero tracked env files.
- **Primary-capture verification** (`scripts/spikes/webhook/captures/events.jsonl`, gitignored, on-disk): 14 Zoom requests; 2 duplicate request-id pairs, both gaps exactly 304 s; ALL header timestamps 10 digits (seconds). Matches the report's retry/unit claims from raw data, not prose.
- Deployable-surface line-by-line read (`diag-signature.ts` whole; `next.config.js`, `.gitignore`, `config.toml`, PROJECT_STATE diffs whole).

## 6. What the PM did NOT verify

- **No live Zoom call was re-executed by the PM** (credentials are session-scoped to the executor by design). Verified via committed evidence + on-disk raw captures instead. Sol may request Brent re-run any `scripts/spikes/zoom/*.mjs` probe with the env file.
- Event-name distribution inside `events.jsonl` (PM's parser didn't match the body key; triangulated via the 7 per-event fixtures).
- The diag page's probes on real school hardware (field visits pending — Part B of the protocol).
- e2e beyond CI's smoke gate (Z1c owns Zoom e2e).
- The executor's local-only measurements (ffmpeg timings, NER recall/latency, S3 part behavior) — spot-checked for internal consistency, not re-executed.
- `fase-2-review-request.md` figures at every revision (it was corrected 4× for self-referencing counts; final version pins work-commit SHAs + a verifiable command instead of a total — pattern accepted).

## 7. Accepted deviations (challengeable rulings)

Full per-round lists live in the §0 ledger rows; the load-bearing ones:
1. **Z0B-1 ⑧** `.gitignore` global `*.json`/`*.md` silently swallowed 5 spike files ⇒ fixed in-convention; consequence: commit `55ae454` not self-contained (its tests' fixtures land in `e6a27d1`) — accepted over rewriting a pushed branch. Z0B-2 hit the SAME class one level deeper and fixed it pre-stage (`ace0898`).
2. **Token `[persona N]`** per §12 operative text; errata #29's `[estudiante 1]` wording ruled superseded.
3. **Adversarial recall 78.8% ships** — plan v2.2.2 #41 demoted recall to a monitoring metric; the r3 measurement showed +6 pp recall costs false redactions in 10/16 clean paragraphs. Re-measure on real Whisper output when a real recorded session exists (Z4/Z5).
4. **r5 `Nina`/`niña` carve-out** — a blanket ROLE_NOUNS veto would make a real given name undetectable on every path (accent-preserving surface distinguishes).
5. **r6 G4′ asymmetry** — course-pattern candidates veto `NON_PERSON_PROPER` ("Básico") but role/honorific keep it reachable (`julio`/`abril`/`santiago` are real given names whose only path is those layers); priced miss: "de 5°B, Julio" (R4).
6. **Z0B-2 ①** Meeting SDK via CDN, `package.json` untouched — the npm package hard-pins `peer react@18.2.0` vs repo 18.3.1; forcing `--legacy-peer-deps` repo-wide for a spike was rejected. Routed to Z3.
7. **Z0B-2 ②** hand-rolled SigV4 (~200 lines, self-tested byte-exact) over adding `@aws-sdk` (~15 MB) for a spike.
8. **Z0B-2 ③** isolated throwaway Supabase stack — `supabase start` was a no-op because Z1b-1's stack (shared `project_id`) was live with in-flight migrations; restarting would have destroyed a parallel session's state. Commended.
9. **Z0B-2** timestamp-unit defect (header seconds vs body ms) self-caught from the first REAL request and fixed under the no-deferral rule — the committed wrong contract never reached Z1b.
10. **Z0B-2** two fixture credential leaks self-caught by output scanning (S2S client id via `clientid` header ⇒ header ALLOWLIST; `recording_play_passcode` ⇒ pattern + entropy catch-all), each locked by a test. Reviewer instructed to re-scan independently; PM re-scan clean. One inert identifier deliberately retained: the permanently-deleted spike meeting's UUID (`/`+`+` double-encoding exemplar).

## 8. Open items / residual risks

- **Embed go/no-go**: instrument + protocol ready; verdict pending school field visits (gates Z3 only; Z2 link-mode unaffected).
- **G1 FAIL + G2 FAIL (definitive)**: §12 backstop permanently closed on Pro — link-out recording disabled; unidentified participants void transfers; SDK pre-join consent is THE evidence path.
- **§9.4 plan defect**: `recording_disclaimer` settings field reads `false` while the disclaimer demonstrably renders — §12/§18's drift audit must key on `auto_recording` read-back instead. Plan erratum deferred until after this review (contract stability); the reviewer should treat results §9.4 as authoritative over plan §18's wording.
- **Findings routed**: UUID rotates per occurrence → Z1b (capture at `meeting.started`); N recording segment sets per meeting + delete-one-breaks-siblings → Z4 (transfer+verify ALL before deleting ANY); segment gaps = consent refusals → Z5 (never stitch across); React 18.2.0 pin/CDN externals → Z3; Marketplace subscription points at a dead tunnel (Z1b repoints).
- **Declared unmet DoD item**: real-media recording sizes (§15 "measured transfer numbers ... real sizes") — synthetic media compresses ~10×; first real recorded session (Z4 soak) measures it. The pipeline mechanics themselves are fully verified.
- **Unrun measurements**: Whisper re-score (no `OPENAI_API_KEY`), NER cold start (needs a throwaway Vercel project; approved route, pre-Z5 gate on enabling NER).
- Pre-existing repo quirk (NOT this phase): a test file under `pages/api/qa/__tests__/` ships as a production route — ticketed separately.

## 9. Exact local gate commands

```
npm run type-check && npm run lint && npm test && npm run build
```
(pgTAP/`test:db` unaffected — this phase has zero migrations; CI runs all six gates on PR #25 regardless. Sanitizer/webhook subset: `npx vitest run __tests__/lib/zoom/`.)
