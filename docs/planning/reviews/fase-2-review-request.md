# Fase 2 (Zoom Z0B) — review request

> Executor self-report for phase **Z0B — Technical spikes** of
> `docs/planning/zoom-integration-plan.md` (§15). Written per CLAUDE.md executor
> rule 6. This is a **claim, not a verdict**: the PM reviews the branch commit by
> commit, then writes the dossier, then Sol reviews independently (§0.2).

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
| `npm test` | ✅ **3094 passed / 3094, 217 files** |
| `npm run build` | ✅ Compiled successfully; `ƒ /meet/diag` 7.2 kB (160 kB first load), `ƒ /api/meet/diag-signature` present |
| `npm run test:db` | ⏭️ N/A — zero migrations in this phase |
| `npm run e2e` | ⏭️ not run locally (no seeded Supabase on this machine); `/meet` specs are `.skip()` stubs until Z1c |

**Delta vs the Z0B-1 baseline (3072 / 215 files): +22 tests / +2 files**, and the
arithmetic is exactly the two new suites:

- `__tests__/lib/zoom/webhook-signature-vectors.test.ts` — **14** tests. CRC vector
  + token/secret sensitivity; signature over raw bytes; §17's
  **re-serialized-body-must-fail**; equal-length tamper; timestamp substitution;
  rotated secret; truncated-signature length trap; freshness window incl.
  non-numeric rejection. Plus a fixture walker that verifies each fixture and
  **logs the fixture count** so today's empty library is loud, not silently green.
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

1. **G2 is a provisional FAIL and I am reporting it as one — check I have not
   overclaimed anywhere.** 10 of 13 probes returned `4711 missing scope`; only 3
   actually ran. I believe FAIL is correct (G1 fails on the same KB0068402
   entitlement, and the 3 endpoints that *did* answer are the most likely
   carriers), but the verdict rests on 3 data points plus an inference. Verify that
   §9.3, the PROJECT_STATE entry, and §7 of this file all say "provisional" and that
   nothing downstream treats G2 as settled. **The fix is ~30 seconds of Brent's time
   in Marketplace** (scope list in §9.2) — this is the single weakest claim in the
   phase.

2. **The stop-and-confirm verdict rests partly on an inference, at the centre of a
   privacy control.** I proved the *stop* works (`PATCH /live_meetings/{id}/events`
   → 202) and proved *no read-back exists* (both plausible endpoints 404), and I
   later corroborated that the stop genuinely took effect from the recording's own
   segment boundaries — segment 1 ends within seconds of my stop call, segment 2
   begins within seconds of my restart. What I never observed is the
   `recording.stopped` **event arriving**; that it is emitted comes from §20, not
   from me. Since §8.4 concludes that event is the *sole* confirmation signal and
   therefore that §12's late-decline flow is necessarily webhook-dependent,
   challenge whether that architectural claim is adequately supported. I think it
   is, but it is the load-bearing inference in the phase.

   **Related, and it arrived late enough that I want it read carefully:** stopping
   and restarting produced **two complete recording file sets under one meeting
   UUID** (§8.3). §12's pipeline is written in the singular, and the late-decline
   flow is exactly the thing that creates segments — so this is not an edge case
   but the expected output of the designed flow. I recorded the consequence that
   concatenating segments would fabricate continuity across the period someone
   refused to be recorded. Check that I have not understated how much of Z4/Z5 this
   touches.

3. **`pages/api/meet/diag-signature.ts` is a real signing endpoint that ships.**
   I gated it three ways (404 without env, session required, `role:0` hardcoded and
   never read from the request) and it cannot mint host credentials or issue a ZAK.
   But it *will* sign a JWT for **any 9–11 digit meeting number** for any
   authenticated user — including a meeting that has nothing to do with GENERA. I
   judged that acceptable because a Meeting SDK signature alone does not grant
   entry (the meeting passcode is still required, and the meeting must permit the
   join) and because the field instrument is useless without it. A reviewer may
   reasonably disagree and require a spike flag or an allowlist. This is my most
   debatable judgment call.

4. **The recording byte sizes are not representative and I want that read
   carefully.** Synthetic fake-media input compresses roughly 10× smaller than real
   speech, so the measured MP4 2.08 MB / M4A 0.41 MB over 12 min must not reach any
   capacity or cost estimate. I flagged this loudly in §8.1, but the plan's §15 DoD
   asks for "MP4+M4A real sizes" and **I did not deliver that** — the transfer
   pipeline is proven, the sizes are not. Check that no number from §8 has leaked
   into a sizing claim, and rule on whether the DoD is met.

5. **The multipart evidence comes from a non-production part size.** Both real
   files are smaller than one legal 5 MiB S3 part, so the 5-part run used 512 KiB
   parts via a `--part-size` flag I added for exactly that purpose. The state
   machine, the completion, the byte-exact verify and the crash/resume probe are all
   real; the part *size* is not what production will use. I documented this in §8.1
   and in the flag's own comment. Judge whether that is sufficient or whether the
   multipart claim needs a genuinely large recording behind it.

Also worth a look, lower stakes: my first pass at the secret scan used shell
variable indirection that silently matched nothing and reported "CLEAN". I caught
it, redid the scan with a direct file list, and it found the licensed host's email
in the results doc (now redacted to "the licensed host's real address"). **The
re-run is the one to trust** — zero hits for all six credential values across all
24 committed files, no JWTs, no live `zoom.us` URLs, no local S3 keys. Re-run it
yourself rather than taking my word.

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

**Blocked on out-of-band human steps (both handed to Brent, neither done in the session):**

- **Webhook payload capture.** The subscription URL must be validated in the
  Marketplace before Zoom sends anything. Consequences, spelled out in results §6.1:
  the real header set (`x-zm-request-id`, `traceparent`), the real timestamp skew,
  the **retry schedule on ≥500** (a `FAIL_EVENTS` mode is built and unused), and the
  **redacted real-payload fixture library** (generator written; library empty) are
  all unverified. The CRC algorithm, the signature scheme, and
  re-serialized-body-must-fail *are* verified — the last as a deterministic vector
  that asserts its own premise, which a single canonical captured payload could not
  have done.
- **G2 definitiveness.** 10 scopes listed in results §9.2.

**Deploy-dependent:** no Vercel behaviour was measured — no cold start, no
Vercel→Supabase throughput, no `outputFileTracingIncludes` verification. The
throughput figures in §8.1 are loopback-to-localhost.

**Field-visit-dependent:** the embed go/no-go stays open. Part B of the protocol is
now runnable and two ambiguities are removed centrally (the SDK Embed capability
works; B1 has ~16 s of headroom on good hardware), but nothing here substitutes for
P0 machines on a real school network.

**Other gaps I am aware of:**

- The **payload-token** download path is unverified; only the re-fetch path ran.
- Whether Zoom's download endpoint honours **HTTP Range** is untested — relevant to
  Z4's resume strategy.
- Only the **signed-out** joiner case reflects school users; the signed-in case was
  covered by the licensed host joining with a ZAK, not by a second independent Zoom
  account.
- The **registrant** rung of Z7's hierarchy is untested and expected to be dead code
  in the planned flow.
- `G1 = FAIL` stands (Pro tier). §9.1 now backs it with the **verbatim rendered
  disclaimer text**, which says only that the participant consents to *being
  recorded* — evidence the plan previously had only from the entitlement docs.

**Zoom-side residue:** 5 spike meetings were created (all named
`PRUEBA SPIKE — no unirse`); the recording from the round trip was trashed and then
permanently deleted (`GET recordings` → *"Esta grabación no existe"*). The
stop-control meeting's recording was left in place so the G2 probes can be re-run
against a meeting with a genuine disclaimer click; it should be deleted once G2 is
settled.

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
