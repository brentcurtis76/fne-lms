# Review request — Espacio Colaborativo: community-scoped member pickers in the meeting modal

- **Branch:** `fix/mtg-members` (15 characters; created in the main checkout
  `/Users/brentcurtis/Documents/fne-lms-working` — no worktree was created).
  PR: <https://github.com/brentcurtis76/fne-lms/pull/72>.
- **Current status: READY FOR HUMAN MERGE CONSIDERATION.** Every automated
  gate passed on the integration head and the authorized manual synthetic
  scenarios passed in an isolated local environment (§9). The PR has **not**
  been merged; merging is Brent's decision.
- **Original implementation base:** `8218e597e148d8044fe7d330c118243aa3772485`
  — live `origin/main`, verified by `git ls-remote origin refs/heads/main` at
  task start on 2026-09-02 and re-verified immediately before the branch was
  created. The starting checkout (`fix/proc-contain` @ `d23791b2`) was already
  an ancestor of that commit; the `804794df..8218e597` delta was
  documentation-only.
- **Integrated `main`:** `6de7c929ff6b106b7930f1f9524ec706eed0f399` — the
  live `origin/main` on 2026-09-03 (15 commits, 19 files after `8218e597`,
  none overlapping the PR's 11 files), brought in by the merge commit
  `b667bf41`. The PR's diff against that `main` is byte-identical to the
  original `8218e597..b899c48b` patch.
- **Commits (four):**
  1. `95fb6425` — feature: meeting member pickers scoped to the workspace
     community (only the allowlisted files listed in §4).
  2. `b899c48b` — feature: Stage B remediation (§8), exactly
     `pages/community/workspace.tsx`,
     `__tests__/pages/community/workspace.mention-scope.test.tsx` and this file.
  3. `b667bf41` — integration: `merge: update fix/mtg-members with main`
     (parents `b899c48b` and `6de7c929`; normal non-fast-forward merge, no
     conflicts, no manual edits, pushed without force).
  4. This documentation-only commit — modifies only this file.
  Neither feature commit was amended. The PR changes exactly 11 files against
  `main`.
- **What this branch does not contain:** no database, migration, grant,
  policy or RLS change; no endpoint behavior change
  (`pages/api/community/members.ts` is byte-identical to `main`); no
  deployment, production, provider or Supabase Cloud operation; no protected
  ignored file read (`.env.local`, `.claude/settings.local.json` were never
  opened).
- **Historical note (implementation session, 2026-09-02).** At the end of the
  implementation session nothing had been pushed, no PR had been opened, and
  the stage was recorded as PARTIAL because Playwright and the manual browser
  matrix could not be run safely on this machine (§5.3, now labelled
  historical). Those gaps were closed afterwards by the PR's CI runs and by an
  isolated local QA environment — see §9. §5.3 and §7 keep the original
  wording so the chronology stays auditable.
- **Stage B remediation (2026-09-02, second commit, parent `95fb6425`):**
  the @mention candidate state of the messaging tab is now scoped to the
  workspace community (§8). The commit, authorized by Brent as a single local
  remediation commit, contains a modification of `pages/community/workspace.tsx`,
  one new regression suite, `__tests__/pages/community/workspace.mention-scope.test.tsx`,
  and this file; nothing else. Unit-level gates re-ran after the final Stage B
  source change (§5.2, Stage B table).

## 1. Objective

Every control in `/community/workspace` that picks a person for a meeting —
the Asistentes checkboxes and the "Asignar a…" selectors of Compromisos and
Tareas — must offer only the **active members of the growth community the
current workspace belongs to**, loaded through the access-controlled endpoint
`GET /api/community/members`, and must **fail closed** (empty list + visible
error, never a browser-side `profiles` / `user_roles` / `community_workspaces`
query). The same scope rule is applied to the @mention suggestions of the
messaging tab, whose admin-only "all profiles" fallback is removed. Historical
records that reference someone outside the community keep their identifier
until a user explicitly replaces it.

Authoritative plan: the external Spanish document
`espacio-colaborativo-member-picker-plan-2026-09-02.md` (343 lines, SHA-256
`aefe5f0b81b0e3dc0cbc952092a161842d4a2a52c5fa8409276c1e26b7a2f227`). It is not
copied into the repository.

## 2. Scope

### 2.1 In scope (all implemented)

1. `communityId: string` becomes a required prop of `MeetingDocumentationModal`
   and the workspace passes `workspace.community_id`.
2. The modal's browser-side workspace lookup and every candidate read from
   `community_workspaces`, `user_roles` and `profiles` are removed.
3. Candidates load only through `GET /api/community/members?community_id=<encoded prop>`
   via a small typed fetcher with an optional `AbortSignal`.
4. Fail closed with an explicit `idle | loading | success | error` state, one
   es-CL toast, empty candidates, no alternative query.
5. `AbortController` cleanup on close/unmount; a late settlement neither
   updates state nor toasts.
6. One `availableUsers` list feeds Asistentes, Compromisos and Tareas.
7. `role_type` is the endpoint's first precedence-ordered role; nothing is
   promoted to `docente`.
8. Historical assignees: neutral label while loading or after failure,
   "Usuario fuera de la comunidad" only after success, record-local disabled
   option, id preserved on an unchanged save, explicit reassignment allowed.
9. Historical attendees render as read-only rows after success; never selectable.
10. `loadMentionSuggestions`: admin all-profiles fallback removed; `{ members: [] }`
    yields zero suggestions; non-2xx / malformed / network failure clears them.
11. Dead `getCommunityMembersForAssignment` removed with its three mock entries.
12. Component regression suite + hardened endpoint-scope assertions.

### 2.2 Out of scope (unchanged, recorded as follow-ups in §7)

- Any database, migration, grant, policy or RLS change — **none made**.
- Endpoint behavior of `pages/api/community/members.ts` — **unchanged**
  (inspected, byte-identical to the base).
- Server-side membership validation when attendees / assignees are written.
- Persistence of attendee changes in edit mode (pre-existing defect: the
  update path never diffs `meeting_attendees`; this change does not claim to
  fix it and the historical attendee rows do not depend on it).
- Browser-side `profiles` joins that resolve **names** of attendees and
  co-editors (`loadWorkSessions` in the modal still reads `profiles` for the
  draft-timeline banner; it is name resolution, not candidate loading).
- The feed user search (`/api/community/search-users`).
- `utils/roleUtils.getCommunityMembers` and its unsafe fallback — deliberately
  **not reused and not modified**.
- Cleanup of historical rows created while the defect existed.

## 3. Acceptance criteria → evidence

| # | Criterion | Implementation | Test evidence |
| - | --------- | -------------- | ------------- |
| 1 | Required `communityId` prop, passed from the sole call site | `components/meetings/MeetingDocumentationModal.tsx:109`; `pages/community/workspace.tsx:1237` | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:349` (URL carries the prop) |
| 2 | No browser-side workspace/candidate reads | old `loadCommunityMembers` deleted (109 lines); the modal has no `from('community_workspaces')` / `from('user_roles')` left and its only `from('profiles')` is the out-of-scope work-session name lookup | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:368`, plus `expectNoDirectMemberReads()` in every other test |
| 3 | Single source: `GET /api/community/members?community_id=<encoded>` | `lib/community/fetchCommunityMembers.ts:44` (URL), `lib/community/fetchCommunityMembers.ts:63` (fetcher), `components/meetings/MeetingDocumentationModal.tsx:250` (call) | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:349` asserts `community_id=comunidad%2042%26x` and exactly one request |
| 4 | Typed fetcher with optional `AbortSignal` | `lib/community/fetchCommunityMembers.ts:63` | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:349` asserts an `AbortSignal` was passed |
| 5 | Reject non-2xx, JSON failure, `members` not an array | `lib/community/fetchCommunityMembers.ts:72`, `lib/community/fetchCommunityMembers.ts:81`, `lib/community/fetchCommunityMembers.ts:90` | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:433` — 403, 403-with-members-array, 500, members-not-array, no-members-key, non-JSON body, network failure |
| 6 | Fail closed: empty list, explicit state, one es-CL toast, no alternative query | state `components/meetings/MeetingDocumentationModal.tsx:80`; catch `components/meetings/MeetingDocumentationModal.tsx:257`–`261` | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:433` asserts `toast.error` called exactly once with the message and id, zero candidates, error note, one request, no direct reads |
| 7 | Old candidates cleared when a load begins | `components/meetings/MeetingDocumentationModal.tsx:247` | covered by the loading-state assertions in `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:537` |
| 8 | `AbortController` cleanup; late settlement neither updates state nor toasts | `components/meetings/MeetingDocumentationModal.tsx:242`–`268` (`active` flag + `controller.abort()` at `components/meetings/MeetingDocumentationModal.tsx:266`) | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:468` (signal aborted on unmount, AbortError → no toast), `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:490` (late 500 after unmount → no toast, nothing logged), `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:515` (`isOpen` → false aborts) |
| 9 | No A→B coordination; parent unmount handles community switch | comment at the effect, `components/meetings/MeetingDocumentationModal.tsx:242` | n/a (design) |
| 10 | One `availableUsers` list for Asistentes / Compromisos / Tareas | `components/meetings/MeetingDocumentationModal.tsx:1191`, `components/meetings/MeetingDocumentationModal.tsx:1479`, `components/meetings/MeetingDocumentationModal.tsx:1565` | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:314` — two members and only those in all three controls |
| 11 | Real first precedence-ordered role; never fabricated `docente` | `components/meetings/MeetingDocumentationModal.tsx:93`–`100` | no UI test by design (the modal does not render `role_type`); reviewer inspects the mapper |
| 12 | Historical assignee: neutral while loading / on failure, outsider label only after success, record-local, id preserved, reassignable | `components/meetings/MeetingDocumentationModal.tsx:986`, `components/meetings/MeetingDocumentationModal.tsx:993`, `components/meetings/MeetingDocumentationModal.tsx:1012`, used at `components/meetings/MeetingDocumentationModal.tsx:1483` and `components/meetings/MeetingDocumentationModal.tsx:1569` | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:537`, `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:577`, `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:604` (task selector proves the option is record-local; update payload keeps the id), `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:658` (payload carries the new id) |
| 13 | Historical attendees read-only after success, never selectable | `components/meetings/MeetingDocumentationModal.tsx:1006`, `components/meetings/MeetingDocumentationModal.tsx:1211` | `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:604` (disabled checked row; only two selectable checkboxes) |
| 14 | Mentions: no admin fallback; `{ members: [] }` → zero; failures clear; **Stage B:** both lists scoped to the workspace community, request tied to its community, late/old-scope results ignored | state + captured community id `pages/community/workspace.tsx:1744`–`1754`; clear-on-change/abort-on-leave effect `pages/community/workspace.tsx:1799`–`1811`; tagged request, `signal.aborted` guards, fail-closed via `fetchCommunityMembers` `pages/community/workspace.tsx:1881`–`1925`; `handleMentionRequest` `pages/community/workspace.tsx:1928`–`1950`; mapper `pages/community/workspace.tsx:1700` | `__tests__/pages/community/workspace.mention-scope.test.tsx:425` (A populated → B empty: cleared before B answers, `{ members: [] }` leaves both lists empty, no A request after the switch), `:454` (A settling after B is ignored, A's request aborted, no duplicate while loading), `:486` (workspace=null transition clears and cancels before B loads), `:524` (500 / malformed / network failure → empty; only `/api/community/members`; no profiles / user_roles / community_workspaces read), `:552` (unmount aborts, late settlement silent). Fail-on-old: 4 of 5 fail against the committed page (§5.2). Manual empty-community mentions scenario passed later in the isolated local QA (§9.2, scenario 4) |
| 15 | Dead helper and its mock entries removed | `utils/meetingUtils.ts` (36 lines removed, `AssignmentUser` import dropped); three fixtures | `grep getCommunityMembersForAssignment` → 0 hits outside the untracked external plan copy |
| 16 | Endpoint suite: per-instance `.eq` capture, exact second-query filters | `__tests__/api/community/members.test.ts:58`, `__tests__/api/community/members.test.ts:96` | `__tests__/api/community/members.test.ts:153`, `__tests__/api/community/members.test.ts:173`, `__tests__/api/community/members.test.ts:215` (admin non-member); `__tests__/api/community/members.test.ts:198` also proves the member query is never built on 403 |

## 4. Files by risk

**Higher risk (behavior of a user-facing surface)**

- `components/meetings/MeetingDocumentationModal.tsx` — modified. New required
  prop; candidate loading replaced by the fail-closed effect; old 109-line
  loader with three all-profiles fallbacks deleted; explicit load state;
  historical-assignee / historical-attendee rendering; `data-testid`s on the
  attendee checkboxes and the two assignee selectors (the testid lint is
  advisory and this modal had none before).
- `pages/community/workspace.tsx` — modified. One prop at the modal call site;
  `loadMentionSuggestions` loses the admin all-profiles branch and now clears
  suggestions on non-2xx, malformed body and network failure.
  **Stage B (second commit, +98/−57 on top of `95fb6425`):** the messaging tab's
  mention state is keyed to `workspace?.community_id`; an effect empties
  `communityMembers` and `mentionSuggestions` whenever that id changes or is
  absent and aborts the previous request; `requestMentionMembers` tags each
  request with its community, skips every state write once its signal is
  aborted, deduplicates an in-flight request for the same community and loads
  through `fetchCommunityMembers` (the typed fetcher from the commit); the old
  `loadMentionSuggestions` and its hand-rolled response checks are gone; the
  suggestion mapper is a module-level function; the two lists are typed
  `MentionSuggestion[]` instead of `any[]`. `MeetingDocumentationModal` and its
  call site are untouched by Stage B.

**Medium risk (new module)**

- `lib/community/fetchCommunityMembers.ts` — new. Typed fetcher, URL builder,
  response validation, `CommunityMembersRequestError`. It uses the global
  `fetch` so the component tests exercise the real code path through a
  route-aware stub.

**Low risk (dead code removal)**

- `utils/meetingUtils.ts` — `getCommunityMembersForAssignment` removed (it
  returned placeholder names and was imported but never called); the
  now-unused `AssignmentUser` import removed.

**Tests**

- `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx` — new, 18 tests.
- `__tests__/pages/community/workspace.mention-scope.test.tsx` — **new in
  Stage B (second commit), 5 tests.** Renders the real `/community/workspace`
  page with its data utilities and sibling components mocked, a route-aware
  `fetch` stub keyed by `community_id` (deferred responses, per-community
  workspace gate) and a stub composer that renders the suggestions it receives
  and asks for mentions like a typed `@`.
- `__tests__/api/community/members.test.ts` — hardened (8 tests; all 7
  original tests retained, one added).
- `__tests__/components/meetings/MeetingDocumentationModal.{end-dedup,clear-rich-text,save-draft}.test.tsx`
  — fixtures only: dead mock key dropped, `communityId` prop added, fetch stub
  made route-aware (`/api/community/members` → `{ members: [] }`).

**Documentation**

- `docs/planning/reviews/fase-mtg-members-review-request.md` — this file
  (created in `95fb6425`, updated in `b899c48b`, finalized by the
  documentation-only commit that records §9).

Pre-existing untracked files in the checkout (seven planning/review documents,
`outputs/`, and `docs/planning/cross-school-growth-communities-plan-2026-09-02.md`,
which appeared during this session) were neither touched nor staged.

## 5. Validation

### 5.1 Where the gates ran, and why (deviation, disclosed)

Node cannot load modules from this checkout's iCloud-served `node_modules`
(`node node_modules/vitest/vitest.mjs --version` sat 90 s at 0.05 s CPU;
`sample` showed the main thread blocked with `node_modules/@vitest/runner/dist/utils.js`
as the last open file — the recurring condition already recorded for this
machine). Every gate below was therefore run in a **validation copy** made by
copying **only the 2,462 tracked files** (`git ls-files -z | rsync -0 -a --files-from=- ./ <scratchpad>/repo/`)
into the session scratchpad on local disk, followed by `npm ci --no-audit --no-fund`
(1,375 packages, 11 s, exit 0). The copy has no `.git`, no `.env.local`, no
`.claude/settings.local.json` and no other ignored file; it is not a branch or
a worktree; it was re-synced from the checkout after every edit, and the files
under test were verified byte-identical (`cmp`) to the checkout before the
final runs. The build and the full Vitest run were given a command-scoped
synthetic environment pointing at an unreachable port (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9`,
placeholder anon/service strings, `NEXT_PUBLIC_BASE_URL=http://localhost:3000`)
so that neither could contact the shared local Supabase stack. `git diff --check`
ran in the real checkout. Two dead ends are disclosed rather than hidden: an
attempt to rsync the checkout's `.git` (215 MB) into the copy was killed by a
300 s alarm because its reflogs are iCloud-dataless, leaving an unusable partial
`.git` in the first copy that was never used; and a first attempt to run the
three git-dependent suites with exported `GIT_DIR`/`GIT_WORK_TREE` hijacked the
temporary repositories those suites create for their own fixtures and produced
bogus failures — that run is discarded. The valid re-run used a second copy
(`repo2`, same tracked + new files, `git init` + `git add -f` of exactly those
paths, `.git` discovered from the working directory, no environment overrides). Ignored validator output created by the runs (the
copy's `.next/`, `tsconfig.tsbuildinfo` if any) lives only in the scratchpad.

**Stage B (this session):** the same condition held (`node -e "require('react')"`
hung 25 s under a Perl alarm in the checkout while `node --version` returned
at once). A fresh copy of exactly the 2,467 tracked files was made in this
session's scratchpad (`git ls-files -z | cpio -0 -pdmu`), `npm ci --no-audit --no-fund`
installed 1,375 packages in 9 s, and a throwaway `git init` index holding those
same 2,467 paths was created inside the copy so the three git-dependent suites
run there without environment overrides. The copy has no `.env*` file at all
(verified) and no other ignored file; the two Stage B source files were
re-copied after every edit and `cmp`-verified byte-identical to the checkout
before each run below; the build was given a command-scoped synthetic
environment (unreachable `http://127.0.0.1:9`, placeholder keys,
`NEXT_PUBLIC_BASE_URL=http://localhost:3000`) and the full Vitest runs the same
without the base URL — the first full run had it exported too, which is the
sole cause of its one failure (see the Stage B table). Nothing in Stage B
touched the shared local Supabase stack.

### 5.2 Commands run — all after the final source change

| Command (in the validation copy unless noted) | Exit | Result |
| -------------------------------------------- | ---- | ------ |
| `npm test -- __tests__/components/meetings/MeetingDocumentationModal.members.test.tsx` | 0 | 1 file / **18 passed** |
| `npm test -- __tests__/api/community/members.test.ts` | 0 | 1 file / **8 passed** |
| `npm test -- __tests__/components/meetings/MeetingDocumentationModal.end-dedup.test.tsx __tests__/components/meetings/MeetingDocumentationModal.clear-rich-text.test.tsx __tests__/components/meetings/MeetingDocumentationModal.save-draft.test.tsx` | 0 | 3 files / **4 passed** |
| `npm run type-check` | 0 | no diagnostics |
| `npm run lint` | 0 | zero warnings (`--max-warnings=0`) |
| `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 npm test` (full suite, in the `.git`-less copy) | **1** | 375 files — 372 passed / **3 failed**; 8,596 tests — **8,572 passed / 11 skipped / 13 failed**; 283.5 s. Every one of the 13 failures is a `git ls-files -s -z` or `git grep …` invocation failing with "Command failed" because the copy has no `.git`: `__tests__/security/committed-secrets-guard.test.ts` (4), `__tests__/lib/auth/recovery-crypto-secret.test.ts` (1), `__tests__/security/no-phantom-audit-table.test.ts` (8). No product suite failed. |
| `npx vitest run __tests__/security/committed-secrets-guard.test.ts __tests__/lib/auth/recovery-crypto-secret.test.ts __tests__/security/no-phantom-audit-table.test.ts` — the three suites above, re-run in a second scratch copy holding the same 2,464 tracked files plus the 3 new files with a throwaway `git init` index (see §5.1) | 0 | 3 files / **101 passed** |
| `node scripts/ci/check-committed-secrets.mjs` in that second copy (CI's committed-credential guard, scanning the index that equals the first commit's content) | 0 | OK — 2,467 tracked paths, 0 findings |
| `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=<synthetic> SUPABASE_SERVICE_ROLE_KEY=<synthetic> NEXT_PUBLIC_BASE_URL=http://localhost:3000 npm run build` | 0 | Next.js 14.2.35 — compiled successfully, **149/149** static pages generated, no non-browserslist warnings |
| `git diff --check` (real checkout) | 0 | clean |

Baseline before any change (same copy): the three existing modal suites and
the endpoint suite were 4 files / 11 passed.

**Stage B — commands run after the final Stage B change (validation copy
re-synced and `cmp`-verified; `git diff --check` in the real checkout):**

| Command | Exit | Result |
| ------- | ---- | ------ |
| `npx vitest run __tests__/pages/community/workspace.mention-scope.test.tsx` | 0 | 1 file / **5 passed** |
| `npx vitest run` — the new suite + `MeetingDocumentationModal.{members,end-dedup,clear-rich-text,save-draft}` + `__tests__/api/community/members.test.ts` | 0 | 6 files / **35 passed** (5 + 18 + 1 + 1 + 2 + 8) |
| `npm run type-check` | 0 | no diagnostics |
| `npm run lint` | 0 | zero warnings (`--max-warnings=0`; includes the new suite and the repo's `mock-hygiene/drain-mock-queue` rule) |
| full `npm test` — first run, with `NEXT_PUBLIC_BASE_URL=http://localhost:3000` also exported (copy with the throwaway index) | **1** | 376 files — 375 passed / **1 failed**; 8,601 tests — **8,589 passed / 11 skipped / 1 failed**; 265.8 s. The three git-dependent suites passed in the same copy (76 + 16 + 9). The one failure is `__tests__/api/auth/recovery-request.test.ts` › "normalizes the address and sends IP/origin only to the durable enqueue": expected origin `https://genera.example.cl`, received `http://localhost:3000` — the value of the `NEXT_PUBLIC_BASE_URL` exported for this run, which the earlier recorded `npm test` recipe never set. That suite ran before the new suite in the sequential process and imports nothing Stage B touched. Isolated re-runs in the copy: fails with that variable set (1 failed / 12 passed), passes **13/13** with only `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9`, with the placeholder keys but no base URL, and with no override at all. Disclosed, not counted as a Stage B regression. |
| full `npm test` — re-run with the recorded recipe (unreachable Supabase URL + placeholder keys, no `NEXT_PUBLIC_BASE_URL`) | 0 | **376 files passed (376)**; 8,601 tests — **8,590 passed / 11 skipped / 0 failed**; 216.4 s. The new suite, `recovery-request` (13/13) and the three git-dependent suites (76 + 16 + 9) all pass in this run |
| `npm run build` (synthetic env) | 0 | Next.js 14.2.35 — compiled successfully, **149/149** static pages generated, no warnings beyond browserslist (92 s) |
| `git diff --check` (real checkout) | 0 | clean |

Baseline before Stage B (same copy, pre-change files): modal members suite +
endpoint suite = 2 files / 26 passed.

**Fail-on-old proof (copy only, restored and `cmp`-verified afterwards):** with
the copy's `pages/community/workspace.tsx` swapped back to the committed
(pre-Stage-B) version, the new suite → **4 failed / 1 passed**. The three
community-switch cases fail on the behavioral assertion
`expected [ 'Ana Uno', 'Bruno Dos' ] to deeply equal []` — Community A's people
offered in Community B — and the unmount case fails because the old loader
issued no cancellable request; the fail-closed case passes on both versions,
which is the intended "must remain" property (that behavior was already in
the commit). A first version of the suite identified the loader's requests by
their `AbortSignal` for every wait, which made the old code fail for a harness
reason (no signal at all) rather than on the finding; the helpers were
reworked so the behavioral waits cover every request for the community and only
the cancellation/deduplication assertions depend on the signal. The discarded
first run is disclosed, not counted.

**Fail-on-old proofs (copy only, restored and `cmp`-verified afterwards):**

- Endpoint scope assertions are non-vacuous: with `.eq('is_active', true)`
  removed from the member query, `__tests__/api/community/members.test.ts` →
  **3 failed / 5 passed**; with `.eq('community_id', …)` removed → **3 failed /
  5 passed**; with both present → 8 passed.
- The new component suite detects the old modal: with the base commit's
  `MeetingDocumentationModal.tsx` restored, the 18 new tests → **18 failed**;
  with the new modal → 18 passed.

### 5.3 HISTORICAL — not run during the implementation session (2026-09-02)

**This section is preserved as written at the end of the implementation session. Every gap it records was closed afterwards; the closing evidence is in §9. Do not read the statuses below as current.**

| Item | Status | Reason |
| ---- | ------ | ------ |
| `npm run e2e` (Playwright) | **NOT RUN** | Playwright's local `webServer` is `npm run dev:unsafe`, reuses any server on :3000 and inherits the ambient environment; it starts, resets or seeds no isolated stack. The only Supabase stack configured for this repository (`supabase/config.toml` project `sxlogxqzmarhqsblxmtj`, ports 54321/54322) was already running with five of its containers restarted about a minute before this session inspected it — evidence of concurrent use by another session — and a second, unrelated project's stack was running beside it. Its ownership, disposability and synthetic-only contents could not be proved, and proving the app's effective target would have required reading `.env.local`, which is prohibited. Starting an isolated stack would have required changing provider configuration (project id and ports), which is outside the allowlist. At the time, the e2e evidence gap stayed open and the stage was PARTIAL. **Closed since:** Gate 4 (Playwright on the ephemeral seeded stack) passed on `b899c48b` and again on the integration head `b667bf41` (§9.1). |
| Manual matrix (admin non-member sees only A; member sees co-members; empty community; endpoint failure → one toast / empty / no profile request; historical assignee not prematurely labelled; historical external assignee preserved until replaced; admin mentions in an empty community → zero) | **NOT RUN** (at the time) | Same environment condition. The unit suite covers the modal rows mechanically (§3) but that is not manual evidence and is not presented as such. **Closed since, in part:** four of these rows were executed manually in an isolated local synthetic environment and the endpoint-failure row was observed; the two historical-record rows were not executed manually and rest on the unit tests (§9.2, §9.3). |
| `npm run test:db` (pgTAP) | not required, NOT RUN | No DB/RLS change in scope; would also need the shared stack. |
| `npm run lint:testid` | advisory, NOT RUN | Not a gate. |

## 6. Where the reviewer should look hardest

1. **No global `profiles` fallback anywhere in candidate or mention loading.**
   `components/meetings/MeetingDocumentationModal.tsx` no longer contains `from('community_workspaces')` or
   `from('user_roles')`; its remaining `from('profiles')` is inside
   `loadWorkSessions` (co-editor names for the draft banner — out of scope).
   `pages/community/workspace.tsx:1881`–`1950` contains no `from('profiles')`, no
   `user_metadata` role check and no alternate source; confirm on the diff. The
   error path of the loader clears both `communityMembers` and
   `mentionSuggestions`, and `handleMentionRequest` still re-fetches on the next
   mention keystroke when the list is empty — after Stage B that retry is tied
   to the current community and skipped while a request for it is in flight,
   which is why the suite asserts a single A request across an ask-while-loading.
2. **Exact `community_id` and non-vacuous second-query `.eq` assertions.**
   `__tests__/api/community/members.test.ts:58` records `.eq(column, value)` per chain instance;
   `__tests__/api/community/members.test.ts:96` asserts on `recordedQueries.user_roles[1]` with
   `toHaveLength(2)` plus both filters, so the requester query's own
   `.eq('is_active', true)` (instance `[0]`, asserted separately) cannot satisfy
   it. The admin-non-member test `__tests__/api/community/members.test.ts:215` exercises exactly this;
   `__tests__/api/community/members.test.ts:173` requests a community other than the fixture's first one.
   Mutation runs in §5.2 show 3 failures when either filter is removed.
3. **Abort cleanup and late-toast suppression.** `components/meetings/MeetingDocumentationModal.tsx:242`–`268`:
   `active` flips false and `controller.abort()` runs in the cleanup; the catch
   returns early when `!active || controller.signal.aborted`. Judgment call:
   the effect keys on `[isOpen, communityId]` only; the parent unmounts the
   modal on a community switch so no A→B guard was added. Tests
   `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:468`, `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:490`, `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:515`.
4. **Historical labels only after a successful load; id preservation.**
   `components/meetings/MeetingDocumentationModal.tsx:986` returns the outsider label only when
   `membersLoadState === 'success'`; the option is emitted per record
   (`components/meetings/MeetingDocumentationModal.tsx:1483`, `components/meetings/MeetingDocumentationModal.tsx:1569`) and never added to `availableUsers`.
   The selectors are `disabled` while `idle`/`loading` (`components/meetings/MeetingDocumentationModal.tsx:1012`) and
   enabled after `error` so a user can still clear an unverifiable assignee —
   a judgment call the reviewer may want to confirm. `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:604` asserts
   the update payload keeps the outsider id; `__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx:658` the new id.
5. **No DB/RLS or endpoint behavior change.** `supabase/**` untouched;
   `pages/api/community/members.ts` byte-identical to the base (`git diff --quiet`).
   No server-side file is in the diff; every change is browser code and tests.

6. **Stage B — when the mention lists are cleared, and how the suite tells the
   loader's requests apart.** The clear runs in a passive effect keyed on
   `workspace?.community_id` (`pages/community/workspace.tsx:1799`), not during
   render. React 18 flushes pending passive effects before dispatching a
   discrete event such as a keystroke, so no `@` can be processed against a
   previous community's list, and in the page's real flow the parent passes
   `workspace = null` first, which unmounts the composer; a one-frame paint of
   stale props after a hypothetical direct A→B prop change is the only window
   this design leaves, and it cannot receive input. The reviewer may want to
   confirm that reasoning rather than take it on trust. In the suite, the
   loader's requests are told apart from the page's member panel (same GET, no
   signal) by the presence of an `AbortSignal`
   (`__tests__/pages/community/workspace.mention-scope.test.tsx:334`); only the
   cancellation and deduplication assertions depend on that, the behavioral
   waits cover every request for the community (`:349`). The composer that
   reappears for Community B does so because the tab keeps its selected thread
   across the switch (pre-existing, out of scope); the helper re-selects the
   thread if that ever changes (`:370`).

Additional honest notes: the modal did not need `role_type` for rendering, so
the mapper's "first endpoint role, empty string when none" rule
(`components/meetings/MeetingDocumentationModal.tsx:100`) is reviewed by inspection only; and the three status notes
(`components/meetings/MeetingDocumentationModal.tsx:1014`) share one component-local helper keyed by scope, so the
same copy appears in Asistentes, Compromisos and Tareas.

## 7. Known limitations and deferred follow-ups

1. **UI e2e evidence gap — CLOSED.** Playwright was not run in the
   implementation session (§5.3, historical); Gate 4 has since passed on both
   CI runs, and the authorized manual scenarios passed in an isolated local
   environment (§9). Remaining evidence limits: the two historical-record
   scenarios are covered by unit tests, not manual execution (§9.3), and no
   claim is made about Production or the Vercel Preview (§9.4).
2. **Write-side validation** — the server still accepts `attendee_ids` /
   `assigned_to` outside the workspace's community; this change only scopes
   the picker.
3. **Attendee persistence in edit mode** — `persistMeetingData` never diffs
   `meeting_attendees`; attendee changes made while editing are not saved
   (pre-existing; not claimed fixed).
4. **Feed search** — `/api/community/search-users` still searches the union of
   the requester's communities.
5. **Name resolution** — attendee and co-editor names still come from
   browser-side `profiles` joins (`loadWorkSessions`, details views).
6. **`utils/roleUtils.getCommunityMembers`** still falls back to browser-side
   `user_roles` + `profiles` on any endpoint failure; not reused here, not fixed.
7. **Historical outsider rows show no name** — by design in this scope (no
   profile lookup); a read-only audit of affected rows is a separate ticket.
8. **Retry-on-keystroke for empty mention lists** — still present after a
   settled empty or failed load; Stage B only ties each retry to the current
   community and skips it while a request for that community is in flight.
9. **Duplicate `data-testid="meeting-historical-assignee"`** when several
   records carry outsiders; the parent selectors carry per-index testids, which
   is the intended stable locator.
10. **Member panel late response (Stage B observation, out of scope, unchanged)**
    — the page-level "Miembros de la Comunidad" panel
    (`pages/community/workspace.tsx:162`–`216`) issues the same GET without a
    signal and applies whatever settles, so a Community A response arriving
    after a switch can still populate the panel while Community B is shown.
    It is not part of the mention finding and was deliberately left alone.
11. **Mention list does not refresh on same-community workspace updates** — the
    Stage B effect is keyed on the community id, so saving workspace settings
    (which replaces the workspace object) no longer re-requests the members;
    membership does not change there, but it is a behavior difference.

## 8. Stage B remediation — @mention scope (second commit, parent `95fb6425`)

**Finding.** `MessagingTabContent` retained `communityMembers` and
`mentionSuggestions` across workspace/community changes and the
`workspace = null` transition, and its loader wrote whatever response arrived.
A valid, empty Community B could therefore show Community A's cached
suggestions, and a delayed A response could overwrite B.

**Required behavior → where it is met (all in `pages/community/workspace.tsx`).**

1. Clear both lists immediately whenever the community changes or becomes
   unavailable — effect keyed on `mentionCommunityId` (`:1799`–`:1811`); the
   handler also empties suggestions when no community is available (`:1929`).
2. Tie every request to its captured community id — `requestMentionMembers(communityId)`
   stores `{ communityId, controller }` in `mentionRequestRef` (`:1897`–`:1906`).
3. Abort or ignore results of an old community or unmounted scope — the effect
   cleanup calls `cancelMentionRequest()` (`:1809`), and every `.then` /
   `.catch` write is skipped when `signal.aborted` (`:1910`, `:1915`).
4. A successful `{ members: [] }` leaves both lists empty — the success path
   sets `communityMembers` to the mapped (empty) list and `mentionSuggestions`
   to `[]` (`:1911`–`:1912`).
5. Failures and malformed responses stay fail-closed — `fetchCommunityMembers`
   rejects on non-2xx, non-JSON and missing `members` array; the catch clears
   both lists (`:1914`–`:1919`); nothing else is queried.
6. `/api/community/members` is the only source — no `profiles`, `user_roles`,
   `community_workspaces`, admin or other fallback; the suite records every
   `supabase.from` table and every fetch URL.
7. Typing `@` in B never shows A — covered by the three switch scenarios in the
   suite (populated A → empty B; A resolving after B; the null transition).
8. The meeting modal is untouched — its four suites still pass (22 tests).

**Design notes.** The remediation reuses the commit's typed fetcher instead of
keeping a second hand-rolled validator; the in-flight request is deduplicated
per community so a keystroke during a load neither duplicates nor cancels it;
`setMentionSuggestions([])` on success is deliberate (a fresh list never carries
suggestions computed from a previous one). No endpoint, database, migration,
RLS, environment or provider change; nothing outside the two source files and
this document was modified; every pre-existing untracked path, including
`outputs/`, is untouched.

## 9. Post-implementation evidence (2026-09-02 → 2026-09-03)

Recorded by the final documentation-only commit. Everything below happened
after the implementation session; nothing in §§1–8 was rewritten except the
header, the row-14 note, the §5.3 label and §7 item 1.

### 9.1 Automated evidence — GitHub CI and Vercel

| Run | Head | Result |
| --- | ---- | ------ |
| [33667310330](https://github.com/brentcurtis76/fne-lms/actions/runs/33667310330) (PR #72 opened) | `b899c48b` | all seven required checks passed |
| [33759552167](https://github.com/brentcurtis76/fne-lms/actions/runs/33759552167) (after merging `main` `6de7c929`) | `b667bf41` | all seven required checks passed |

On integration head `b667bf41` each of these passed: Migration safety guard;
Browser/server boundary guard; Gate 1 — Typecheck; Gate 1b — Lint; Gate 2 —
Unit (Vitest, full suite); Gate 3 — RLS pgTAP (`supabase test db`); Gate 4 —
E2E (Playwright on the seeded ephemeral local Supabase). The `Vercel` commit
status reported a successful build. Gate 4 on `b667bf41` closes the Playwright
gap recorded in §5.3.

### 9.2 Manual evidence — isolated local synthetic environment

An isolated local environment (its own Supabase stack, synthetic data only, no
production credentials) ran the exact feature head `b899c48b` in a browser.
The four authorized scenarios **passed**:

1. An admin who is **not** a member of Community A saw only the synthetic
   Community A members in the meeting pickers.
2. A Community A member saw only Community A members.
3. An empty community showed a genuine empty state — no fallback list.
4. `@mentions` in the empty community produced zero suggestions.

No cross-community exposure was observed in any scenario: the Community B
outsider and the unrelated users never appeared.

**Separately observed fail-closed behavior.** Against a real HTTP 500 from
`/api/community/members`, the UI showed the error state with empty
candidates, made no fallback request to `profiles`, `user_roles` or
`community_workspaces`, and exposed no member information. This observation
is recorded on its own; it is not one of the four scenarios above.

### 9.3 Historical-record scenarios — unit tests only, not manually executed

The two historical-record rows of the manual matrix (historical assignee not
prematurely labelled; historical external assignee preserved until replaced)
were **not** executed manually, because opening edit mode creates a
work-session record. They are covered directly by the committed unit tests
(`__tests__/components/meetings/MeetingDocumentationModal.members.test.tsx`,
§3 rows 12–13), which prove: no premature "outside community" label while
membership is loading; a historical external assignee is represented as a
disabled record-local option; an unchanged save preserves the historical
identifier; deliberate replacement with a valid member saves the replacement.
This document does not claim those two scenarios were tested by hand, and it
does not claim all seven matrix rows were manually executed.

### 9.4 Environment observations (separate from this PR)

- **Vercel Preview.** The first manual attempt used the Vercel Preview. It was
  not usable for successful-path QA: the Preview connects to the production
  Supabase project and its server-side members endpoint returned HTTP 500. The
  likely Preview configuration problem was not investigated or changed, and
  no production credential should be added to Preview merely to make QA work.
  Nothing in this document proves Production behavior or that the Preview
  environment is safe.
- **Local materialized view.** While setting up the local QA environment, a
  fresh database required the existing `user_roles_cache` refresh before
  member-role navigation worked. This predates PR #72 and is a separate
  test-environment follow-up, not a regression of this PR.

### 9.5 Acceptance

The combined manual and automated evidence was accepted by the independent PM
reviewer as sufficient for merge consideration. The PR remains open; no
merge, deployment, database or provider operation has been performed by the
executor.
