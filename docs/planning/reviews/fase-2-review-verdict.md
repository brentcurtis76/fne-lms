# Fase 2 (Z0B) — Independent review verdict (Sol)

Archived by the PM. Round 1 verdict verbatim below; PM triage follows in the §0 ledger row (Z0B-2r1) and the remediation prompt.

## Round 1 (verdict: REQUEST CHANGES, 2026-07-29)

Reviewed: `feat/zoom-spike`, PR #25, target diff `2786fa8...7cb0b4b`; read-only; independent gate rerun passed (type-check, lint, 3112/3112 in 217 files, build, `git diff --check`, PR checks 8/8); independent exact-value credential scan across all 32 phase commits: no committed credential.

**BLOCKER:** none (no committed secret, prod mutation, deployment, destructive migration, or RLS regression).

**MAJOR:**
1. **Uncertain sanitizer detections do not necessarily become `flagged`.** `lib/zoom/sanitizer.ts` derives `flagReasons` only from density; an uncertain detection can be redacted while status stays `sanitized`, contradicting plan §15 Z0B DoD ("uncertain detections must land as `flagged`"). Probe: `{"status":"sanitized","uncertain":1,"actions":["redacted"],"flagReasons":[]}`. Tests encode the gap.
2. **Destructive Zoom calls bypass the documented live-meeting interlock.** `assertSpikeMeeting` exists (`scripts/spikes/zoom/lib.mjs`) but `probe-scopes.mjs` (labeled read-only, issues `recording.stop`), `followup-report.mjs` (can end a meeting), `customer-key-poc.mjs`, `recording-control.mjs` (guards a sequence, not each call), `stop-confirm.mjs` do not enforce it per call — contradicting PROJECT_STATE's claim; real-account risk.
3. **Credential values absent, but live provider identifiers remain in committed artifacts.** Fixture generator replaces only a narrow field set: recording-file ids, `meeting_id`s, numeric Zoom user ids, live tracing/request ids retained; results doc retains the licensed host's Zoom user id; the vector test's "no real identifiers" claim doesn't cover these fields; runtime redactor lacks `ZOOM_LICENSED_HOST_EMAIL`. Violates the synthetic-only invariant; the PM's accepted-redaction ruling was based on incomplete verification.
4. **The blocking must-catch test can pass a partial name leak.** Scoring = exact full-substring disappearance, so "[persona 1] Rojas" would pass while "Rojas" leaks. The 100% gate's semantics are weaker than the invariant it certifies.
5. **The SDK-signature endpoint lacks role and meeting authorization.** Session-only; any authenticated account can mint FNE SDK signatures for arbitrary syntactically-valid meeting numbers; diag page permits passcode-less meetings; no handler tests for 401/403/role/target/config-absent.
6. **The settled real-media measurement DoD was not completed.** Synthetic media, artificial part sizes, loopback storage; representative sizing deferred to Z4/Z5 by a PM-only accepted deviation — insufficient without Brent's approval to amend the settled plan.
7. **PROJECT_STATE.md is materially stale and contains false verification claims** (partial webhook / provisional G2 wording, commit and test counts, the interlock claim, "exclusively synthetic" fixtures).

**MINOR:**
8. Diag UI availability keys on `NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID` while the API requires the server-side pair — divergent env contracts; stale page comment.
9. Stale "no webhook was delivered" sentence in the results doc contradicting the final §6 evidence.

Fix block: as reproduced in the PM's remediation prompt (Z0B-2r1). Re-review may be limited to the fix commits plus verification of these findings unless fixes expand into middleware, database, RLS, or CI changes.

## PM triage (Round 1)

**All nine findings VALID.** Three explicitly correct PM rulings: ③ the PM's synthetic-only acceptance was scoped to credential values and one noted identifier — Sol's identifier-level scan is the correct bar; ⑤ the PM's session-only acceptance of the signature endpoint is overturned — repo pattern (auth → role → validation) applies even to spike surfaces that ship; ⑥ a PM-accepted deviation cannot amend a settled §15 DoD — that authority is Brent's (decision put to Brent: complete a representative measurement now vs. formally amend the DoD to defer to the Z4 soak; PM recommends the deferral amendment). ① concedes the strict reading of "uncertain → flagged": transcript-level status, not just span redaction. ④ is the sharpest catch: the blocking gate certified less than the invariant. ② and ⑦ are execution-discipline failures (false claims in committed state docs). ⑧ ⑨ ruled fix-now (same remediation round).
