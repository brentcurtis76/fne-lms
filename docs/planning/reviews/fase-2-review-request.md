# Fase 2 (Zoom Z0B) — review request

> Executor self-report for phase **Z0B — Technical spikes** of
> `docs/planning/zoom-integration-plan.md` (§15). Written per CLAUDE.md executor
> rule 6. This is a **claim, not a verdict**: the PM reviews the branch commit by
> commit, then writes the dossier, then Sol reviews independently (§0.2).
>
> **Updated after Brent validated the webhook subscription and granted the remaining
> S2S scopes mid-run.** Both deliverables that this file originally reported as
> partial are now complete: all 7 webhook events are captured with a committed
> fixture library, and the **G2 verdict is definitive**. Two credential leaks were
> found in generated fixtures during that work and fixed — see §5.1, which is now
> the item most worth a reviewer's attention.

## 1. Branch, base, commits

| | |
|---|---|
| Branch | `feat/zoom-spike` |
| PR | [#25](https://github.com/brentcurtis76/fne-lms/pull/25) |
| Base SHA | `2786fa8` (`main`) |
| Chunk Z0B-1 | `2c1f72f`…`0061dbe` — **20 commits**, sealed 2026-07-29 after 6 sanitizer remediation rounds (the §0 ledger's "19 incl. 1 PM docs" counts through `41281b9`; `0061dbe`, the seal commit, is the 20th) |
| Chunk Z0B-2 | **5 work commits** (`ace0898`…`f7166dc`, pinned below) **+ docs-only commits carrying this file and the results doc** |
| Phase total | run `git rev-list --count 2786fa8..HEAD` — deliberately not written as a number here |

A note on that last row, because a stale commit count in a review doc was a Sol
finding in Z1a and I would rather be explicit than quietly wrong. A commit cannot
contain its own SHA, and every revision of this file changes the total it would be
claiming — so this table pins **only** the five work commits, which are stable, and
defers the total to a command the reviewer can run. Z0B-1 contributes **20**
commits: the §0 ledger's "19 incl. 1 PM docs" counts through `41281b9`, and the
seal commit `0061dbe` is the 20th.

Z0B-2's five commits, in order:

| SHA | Commit | Scope |
|---|---|---|
| `ace0898` | `build(gitignore)` | rescue webhook fixtures from `*.json`; ignore raw captures |
| `4f2d9a7` | `feat(spike)` | live-Zoom harness (S2S/SDK/webhook/S3) + local `[storage]` config |
| `06f3af1` | `feat(meet)` | `/meet/diag` test-join section + SDK signature route + 8 tests |
| `8c592eb` | `test(zoom)` | webhook CRC/signature vectors, 14 tests |
| `f7166dc` | `docs(planning)` | results §6/§8/§9, hw-protocol Part B, PROJECT_STATE |

## 2. Objective and scope (from plan §15, row Z0B)

**Objective.** Produce the measured verdicts that gate later Zoom phases:
`/meet/diag` + Permissions-Policy override; hardware/network protocol; customerKey
round-trip PoC; full recording round trip; recording start/stop control
verification; sanitizer NER feasibility; **gate G2** consent-report retrieval;
ffmpeg-on-Vercel spike.

**DoD.** Written go/no-go on embed; customerKey verdict; measured transfer/transcode
numbers; cost table; sanitizer 100% on the blocking must-catch suite; G2 verdict.

**Delivered by Z0B-1** (sealed): Permissions-Policy override, `/meet/diag` probe,
sanitizer Node layer (`node-1.6.0`, must-catch 61/61, precision 0/1886), NER
feasibility, ffmpeg transcode/segmentation. See results §1–§5.

**Delivered by Z0B-2** (this chunk): webhook verification harness; customerKey
verdict; recording round trip; recording start/stop control verdict; G2 verdict;
`/meet/diag` test-join section; hw-protocol Part B unblocked.

**Explicitly out of scope, and untouched:** production DB/storage (absolute), any
deployment, migrations, new feature flags, e2e specs (Z1c), and Z1b's
schema/client library (`lib/zoom/*` — parallel branch `feat/zoom-core`).

## 3. Test evidence

Local, macOS, at the head of this branch:

| Gate | Result |
|---|---|
| `npm run type-check` | ✅ clean |
| `npm run lint` (`--max-warnings=0`) | ✅ clean |
| `npm test` | ✅ **3112 passed / 3112, 217 files** |
| `npm run build` | ✅ Compiled successfully; `ƒ /meet/diag` 7.2 kB (160 kB first load), `ƒ /api/meet/diag-signature` present |
| `npm run test:db` | ⏭️ N/A locally — zero migrations in this phase; CI runs it anyway (green, below) |
| `npm run e2e` | ⏭️ not run locally (no seeded Supabase on this machine); `/meet` specs are `.skip()` stubs until Z1c. CI's Gate 4 is the verdict (green, below) |

**CI on [PR #25](https://github.com/brentcurtis76/fne-lms/pull/25) at `198ddd5`: 8/8
checks pass, zero failures** (`gh pr checks 25`) — Gate 1 Typecheck 1m6s · Gate 1b
Lint 55s · Gate 2 Unit 1m14s · Gate 3 RLS pgTAP 1m31s · Gate 4 E2E smoke 3m39s ·
RLS migration guard 8s · Vercel deployment · Vercel Preview Comments. PR is marked
ready for review and is **not** merged.

**Delta vs the Z0B-1 baseline (3072 / 215 files): +40 tests / +2 files**, and the
arithmetic is exactly the two new suites:

- `__tests__/lib/zoom/webhook-signature-vectors.test.ts` — **32** tests. CRC vector
  + token/secret sensitivity; signature over raw bytes; §17's
  **re-serialized-body-must-fail**; equal-length tamper; timestamp substitution;
  rotated secret; truncated-signature length trap; the timestamp-unit facts
  (seconds header vs millisecond body `event_ts`, and the ~56-year error a
  millisecond reading produces); freshness incl. non-numeric rejection. Plus a
  fixture walker over the **7 committed real-payload fixtures** that verifies each
  signature over the stored raw bytes and asserts no real identifier, credential,
  tunnel header or long opaque token shipped.
- `__tests__/pages/meet-diag-join-section.test.ts` — **8** tests. Placeholder-when-env-absent,
  rest-of-page-survives, controls-when-present, B1 row always in the JSON, no
  `sdkClientId` leak, and three `getServerSideProps` cases including
  "never exposes the SDK client secret to page props".

## 4. Files by risk

### Higher risk — ships in the product bundle

| File | Purpose |
|---|---|
| `pages/api/meet/diag-signature.ts` | **NEW.** Mints the Meeting SDK JWT. `role:0` hardcoded server-side; 404 when the SDK env pair is absent; requires a session; never touches ZAK. The only new runtime endpoint in this phase. |
| `pages/meet/diag.tsx` | Test-join section replaces the Z0B-1 placeholder. Loads the SDK from Zoom's CDN on demand; `sdkClientId` prop drives a hard branch to the placeholder. |

### Medium risk — build/config, affects other branches

| File | Purpose |
|---|---|
| `supabase/config.toml` | `[storage]` + `[storage.s3_protocol]`, local only. **Also touched by `feat/zoom-core` (`[api]`) — sequence the merge.** |
| `.gitignore` | Two fixes: `!__tests__/**/fixtures/**/*.json` (the existing single-level negation does not reach `fixtures/webhooks/*.json`, so fixtures would have been dropped silently — the exact failure mode Z0B-1 hit); and ignore `scripts/spikes/webhook/captures/` + `scripts/spikes/zoom/out/`, which hold real account ids, UUIDs and the host email. |

### Lower risk — spike instrumentation, never imported by the app

`scripts/spikes/zoom/{lib,create-meeting,probe-scopes,customer-key-poc,followup-report,recording-control,record-meeting,stop-confirm,transfer-recording,s3}.mjs`,
`scripts/spikes/zoom/sdk-harness/index.html`, `scripts/spikes/zoom/README.md`,
`scripts/spikes/webhook/{receiver,make-fixtures}.mjs`. Standalone `.mjs`, run by
hand, zero imports from `pages/` or `lib/`.

### Docs

`docs/planning/zoom-spike-results.md` (§6, §8, §9 + index/header/open items),
`docs/planning/zoom-hw-protocol.md` (Part B unblocked), `PROJECT_STATE.md`, this file.

## 5. Where a reviewer should push hardest

Honest list, worst first.

### 5.1 I leaked credentials into generated fixtures — twice — and caught it by scanning, not by design

This is the finding I most want a second pair of eyes on, because the mechanism that
caught it was a grep I ran after the fact rather than anything structural.

`scripts/spikes/webhook/make-fixtures.mjs` redacts real captured payloads into the
committed fixture library. Two credentials survived the first two versions:

1. **The S2S Client ID, in a `clientid` REQUEST HEADER that Zoom sends.** My generator
   denylisted `authorization` and nothing else, so the client id went into a fixture
   that I was about to commit. Fixed by switching headers to an **allowlist**, which
   fails closed.
2. **`recording_play_passcode`, a ~98-char live playback credential** for the real
   recording, nested in `recording.completed`. It did not match my `password` pattern.
   Fixed specifically, plus a catch-all for long high-entropy values under any
   `*token|passcode|secret|key` key.

Both are now asserted in tests, and the final scan over all 13 changed files is clean
for all six credential values. **But the reviewer should assume my redaction is
incomplete rather than complete**, and specifically:

- re-run the leak scan independently instead of trusting mine;
- check the catch-all backstop for over-reach (it could redact a field Z1b needs);
- consider whether committing redacted real payloads is the right call at all versus
  hand-authored synthetic ones. I judged real-shape fixtures materially more valuable
  to Z1b — Zoom's actual key order, the 6-file `recording_files` array, the real
  header set — but that judgment is what put credentials one regex away from the repo.

Related, and the same class: my **first** secret scan used shell variable indirection
that silently matched nothing and printed "CLEAN". I caught that too, re-ran with a
direct file list, and it found the licensed host's email in results §6.2 (now
redacted). Three near-misses in one chunk, all in the same "I verified it" direction.

### 5.2 The stop-and-confirm verdict — now measured, but check the reasoning I built on it

The gap I originally flagged here is **closed**: `recording.stopped` was observed
twice, each within ~1 s of the `recording.stop` call, signature-verified, with
`recording.started` events bracketing them. The recording's own segment boundaries
independently corroborate that the stop took effect.

What still deserves scrutiny is the **architectural conclusion** in results §8.4: that
because 202 is not confirmation and no live-recording read-back exists, §12's
late-decline flow is *necessarily* webhook-dependent, which makes the webhook
subscription a correctness dependency of a privacy control and demands a fail-safe
timeout policy. I believe that follows, but it is the load-bearing inference of the
phase and it changes what §18's runbook is protecting.

### 5.3 §9.4 — the Settings API misreports the disclaimer, and I am asserting a plan defect

`recording_disclaimer` reads `false` at **both** user and account level, while the
disclaimer demonstrably appears and must be clicked (verbatim text in §9.1), and
`ask_host_to_confirm` reads `false` while the host demonstrably gets a confirm dialog.

From that I claim §12's "settings drift (disclaimer found off) always triggers the
ineligible rule" and §18's audit checklist **cannot be implemented against this
field** — and that `auto_recording` (accurate at both levels) should carry the audit
instead. That is me telling the PM the plan has a defect, on two API reads. Challenge
it: I did not establish *why* the API disagrees with observed behaviour, and an
alternative reading is that this account is mid-configuration and the field would be
accurate elsewhere. My claim is deliberately narrow (the field is not a usable
signal), but the consequence I draw from it is not.

### 5.4 `pages/api/meet/diag-signature.ts` — my most debatable judgment call

Unchanged from the original report. I gated it three ways (404 without env, session
required, `role:0` hardcoded and never read from the request) and it cannot mint host
credentials or a ZAK. But it **will sign a JWT for any 9–11 digit meeting number for
any authenticated user**, including meetings unrelated to GENERA. I judged that
acceptable because a signature alone does not grant entry (the passcode is still
required and the meeting must permit the join), and the field instrument is useless
without it. A reviewer may reasonably require a spike flag or an allowlist.

### 5.5 Recording byte sizes are not representative, and the §15 DoD asks for real ones

Synthetic fake-media input compresses roughly 10× smaller than speech, so MP4 2.08 MB
/ M4A 0.41 MB over 12 min must not reach any capacity or cost estimate. Flagged loudly
in §8.1, but §15's DoD says "MP4+M4A real sizes" and **I did not deliver that**. The
transfer pipeline is proven; the sizes are not. Rule on whether the DoD is met.

Related: the 5-part multipart run used a 512 KiB part size via a flag I added, because
both real files are smaller than one legal 5 MiB part. The state machine, completion,
byte-exact verify and crash/resume probe are all real; the part size is not
production's.

## 6. Numbered deviations

1. **`@zoom/meetingsdk` NOT added to `package.json`.** It declares
   `peer react@"18.2.0"` exactly; the repo runs 18.3.1, so npm refuses without
   `--legacy-peer-deps` — which would change install resolution for every CI job to
   serve one spike probe. The SDK loads from Zoom's CDN instead. The plan schedules
   this dependency for Z3; the React pin is handed forward as a finding (results
   open item 22).
2. **`@aws-sdk/client-s3` NOT added.** `scripts/spikes/zoom/s3.mjs` implements SigV4
   multipart by hand (~200 lines, zero deps) rather than adding ~15 MB so a spike
   can measure a transfer. Self-tested byte-exact before use. Z4 remains free to
   choose its own client.
3. **The recording transfer ran against a SEPARATE local Supabase stack, not the
   repo's.** `supabase start` from the repo root was a no-op: the container name
   derives from `project_id`, and the parallel `feat/zoom-core` worktree shares that
   id and already had a stack up with its `zoom_internal` migrations applied.
   Restarting it would have destroyed that session's in-flight work. I used a
   throwaway stack (`project_id = z0b2spike`, ports 55321+) outside the repo. The
   `[storage]` config change in the repo is still the deliverable and is what a
   solo developer would use.
4. **Recording measurements are in results §8, not §7.** My chunk prompt said §7,
   but §7 is the hardware/network field-results section and `zoom-hw-protocol.md`
   references it *by number*; §8 is the section the results index already reserved
   for the recording round trip. I followed the document's own structure and the
   "do not renumber" rule, and said so in the header.
5. **`supabase/config.toml`'s `[storage.s3_protocol] enabled = true` is
   documentation, not a functional change** — it is already the CLI default in
   2.110.0. Kept for explicitness. Note the CLI here is **2.110.0**, not the 2.75.0
   my prompt stated.
6. **Item 7 (real-Whisper sanitizer re-score) SKIPPED.** No `OPENAI_API_KEY` in the
   repo's `.env.local`, and the prompt forbade asking Brent to create one. A real
   recording now exists, so the blocker is purely the key (open item 4).
7. **NER cold-start probe not attempted** — needs a throwaway Vercel project that
   does not exist, and creating/deploying one is out of scope (open item 1).
8. **A `--part-size` flag was added to the transfer script** so the multipart state
   machine could be exercised at all against megabyte-scale synthetic files (see §5.5).
9. **Two test files land in `__tests__/` that a strict reading might call Z1b's or
   Z1c's.** The webhook vectors sit on the spike branch deliberately so Z1b's route
   arrives with executable ground truth; the reference verifier is test-local to
   avoid colliding with `lib/zoom/*`. Open item 23 asks Z1b to re-point them and
   delete the local copy.
10. **The `PRUEBA SPIKE` naming convention became a load-bearing safety control**,
    not just a label: `assertSpikeMeeting()` re-reads the meeting from Zoom and
    throws unless the topic matches, and it runs immediately before **every**
    destructive call rather than once per script.

## 7. Known limitations and what is NOT verified

**Both original blockers are CLOSED.** Brent validated the webhook subscription and
granted the remaining S2S scopes mid-run, so:

- **Webhook capture is complete.** All 7 subscribed events captured and
  signature-verified against live traffic; real header set observed; timestamp unit
  measured (**seconds** — correcting a wrong assumption of mine that was baked into
  the receiver, the vectors and the generator); ≥500 retry schedule measured at
  **304 s** with an identical body, confirming §6's `sha256(raw body)` dedupe key;
  7-fixture redacted library committed.
- **G2 is definitive FAIL.** All 13 endpoints probed with full scopes; 9 answered; 6
  participant rows inspected; zero consent fields; 4 endpoints **entitlement-blocked
  on Pro** (the whole Dashboard family plus Archiving), which is a stronger negative
  than a missing scope.

**Still not verified, and why:**

- **Deploy-dependent:** no Vercel behaviour measured — no cold start, no
  Vercel→Supabase throughput, no `outputFileTracingIncludes` check. Throughput figures
  in §8.1 are loopback-to-localhost.
- **Field-visit-dependent:** the embed go/no-go stays open. Part B is now runnable and
  two ambiguities are removed centrally (SDK Embed capability works; B1 has ~16 s of
  headroom on good hardware), but nothing substitutes for P0 machines on a school
  network.
- **Representative recording sizes** — see §5.5.
- **The webhook payload `download_token` download path** — only the re-fetch path was
  exercised. The token is now visible in a captured fixture, but no download was
  performed with it.
- **HTTP Range on Zoom's download endpoint** — untested; relevant to Z4's resume
  strategy.
- **Signed-in joiner realism** — the signed-in case is the licensed host via ZAK, not a
  second independent Zoom account.
- **The registrant rung** of Z7's hierarchy — untested, and expected to be dead code in
  the planned flow.
- **Item 7 (real-Whisper re-score)** — skipped, no `OPENAI_API_KEY`; a real recording
  now exists so the key is the only blocker.
- **NER cold start** — not attempted; needs a throwaway Vercel project that does not
  exist (deployments are out of scope).
- **Why §9.4's API/behaviour disagreement happens** — established as a fact, not
  explained.

**G1 = FAIL** stands (Pro tier), and §9.1 now backs it with the verbatim rendered
disclaimer: the standard participant dialog evidences consent to *being recorded* and
says nothing about transcription or AI processing.

**Zoom-side residue:** 6 spike meetings created, all named `PRUEBA SPIKE — no unirse`.
The round-trip recording was trashed and permanently deleted (`GET recordings` →
*"no existe"*). Two recordings remain (~0.9 MB total) from the stop-control meetings;
they were retained so G2 could be re-probed against a real disclaimer click, and can
now be deleted since G2 is settled.

## 8. Credential handling

- The seven credentials Brent supplied live in exactly one place on disk:
  **`/Users/brentcurtis/Documents/fne-lms-zoom-spike/.env.spike.local`**.
  `git check-ignore` was run on that exact filename **before** the file was created
  (`.gitignore:136`, `.env*.local`).
- No credential value appears in any committed file. Verified by direct grep for all
  six secret values over the exact 24-file commit list: **zero hits**. Also zero
  JWT-shaped strings, zero live `us0Xweb.zoom.us` URLs, and zero local Supabase S3
  keys. (My first attempt at this scan was broken — see §5 — the re-run is the
  authoritative one, and it is trivially repeatable.)
- Every spike script routes output through `makeRedactor()`, which collapses all
  seven credentials plus any JWT-shaped string. This is why captured `start_url`
  values appear as `«jwt-redacted»`: ZAKs are JWTs and were caught automatically.
- Raw captures and API dumps (`scripts/spikes/webhook/captures/`,
  `scripts/spikes/zoom/out/`) hold real account/user ids, meeting UUIDs and the host
  email. Both directories are gitignored by rules added in this phase, and their
  ignore status was verified **by exit code** — an earlier check that read
  `git check-ignore -v` output was wrong, because that command also prints negation
  lines for files it is *not* ignoring.
- **No credential appears in this report.** The licensed host's email was redacted
  from results §6.2 after the corrected scan found it there.
