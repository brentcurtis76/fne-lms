# Review request — Espacio Colaborativo: community-scoped member pickers in the meeting modal

- **Branch:** `fix/mtg-members` (15 characters; created in the main checkout
  `/Users/brentcurtis/Documents/fne-lms-working` — no worktree was created).
- **Base:** `8218e597e148d8044fe7d330c118243aa3772485` — live `origin/main`,
  verified by `git ls-remote origin refs/heads/main` at task start on
  2026-09-02 and re-verified immediately before the branch was created. The
  starting checkout (`fix/proc-contain` @ `d23791b2`) was already an ancestor of
  that commit; the `804794df..8218e597` delta was documentation-only.
- **Commits:** exactly **one** — this commit, containing only the allowlisted
  files listed in §4. Not amended. Nothing else on the branch.
- **Nothing pushed, no PR opened, no merge, no deployment, no database or
  provider operation, no production or remote access, no protected ignored
  file read** (`.env.local`, `.claude/settings.local.json` were never opened).
- **Status of this stage: PARTIAL.** Every unit-level gate passed (§5.1).
  Playwright and the manual browser matrix were **NOT RUN for safety** (§5.3):
  the only local Supabase stack configured for this project is shared and of
  unproven ownership, and proving an isolated synthetic target without reading
  protected configuration was not possible within the authorized files.

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
| 14 | Mentions: no admin fallback; `{ members: [] }` → zero; failures clear | `pages/community/workspace.tsx:1840`–`1887` (non-ok `pages/community/workspace.tsx:1858`, shape `pages/community/workspace.tsx:1865`) | review check (§6.1); manual matrix row NOT RUN (§5.3) |
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
- `__tests__/api/community/members.test.ts` — hardened (8 tests; all 7
  original tests retained, one added).
- `__tests__/components/meetings/MeetingDocumentationModal.{end-dedup,clear-rich-text,save-draft}.test.tsx`
  — fixtures only: dead mock key dropped, `communityId` prop added, fetch stub
  made route-aware (`/api/community/members` → `{ members: [] }`).

**Documentation**

- `docs/planning/reviews/fase-mtg-members-review-request.md` — this file.

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
| `node scripts/ci/check-committed-secrets.mjs` in that second copy (CI's committed-credential guard, scanning the index that equals this commit's content) | 0 | OK — 2,467 tracked paths, 0 findings |
| `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=<synthetic> SUPABASE_SERVICE_ROLE_KEY=<synthetic> NEXT_PUBLIC_BASE_URL=http://localhost:3000 npm run build` | 0 | Next.js 14.2.35 — compiled successfully, **149/149** static pages generated, no non-browserslist warnings |
| `git diff --check` (real checkout) | 0 | clean |

Baseline before any change (same copy): the three existing modal suites and
the endpoint suite were 4 files / 11 passed.

**Fail-on-old proofs (copy only, restored and `cmp`-verified afterwards):**

- Endpoint scope assertions are non-vacuous: with `.eq('is_active', true)`
  removed from the member query, `__tests__/api/community/members.test.ts` →
  **3 failed / 5 passed**; with `.eq('community_id', …)` removed → **3 failed /
  5 passed**; with both present → 8 passed.
- The new component suite detects the old modal: with the base commit's
  `MeetingDocumentationModal.tsx` restored, the 18 new tests → **18 failed**;
  with the new modal → 18 passed.

### 5.3 NOT RUN — unsafe to run here

| Item | Status | Reason |
| ---- | ------ | ------ |
| `npm run e2e` (Playwright) | **NOT RUN** | Playwright's local `webServer` is `npm run dev:unsafe`, reuses any server on :3000 and inherits the ambient environment; it starts, resets or seeds no isolated stack. The only Supabase stack configured for this repository (`supabase/config.toml` project `sxlogxqzmarhqsblxmtj`, ports 54321/54322) was already running with five of its containers restarted about a minute before this session inspected it — evidence of concurrent use by another session — and a second, unrelated project's stack was running beside it. Its ownership, disposability and synthetic-only contents could not be proved, and proving the app's effective target would have required reading `.env.local`, which is prohibited. Starting an isolated stack would have required changing provider configuration (project id and ports), which is outside the allowlist. Per the stage rules the e2e evidence gap stays open and this stage is **PARTIAL**; only a later, separately authorized PR/CI run (Gate 4 runs on an ephemeral seeded stack) or a separately authorized safe local setup can close it. |
| Manual matrix (admin non-member sees only A; member sees co-members; empty community; endpoint failure → one toast / empty / no profile request; historical assignee not prematurely labelled; historical external assignee preserved until replaced; admin mentions in an empty community → zero) | **NOT RUN** | Same environment condition. The unit suite covers the modal rows mechanically (§3) but that is not manual evidence and is not presented as such. The mentions row has no automated coverage by design (§6.1). |
| `npm run test:db` (pgTAP) | not required, NOT RUN | No DB/RLS change in scope; would also need the shared stack. |
| `npm run lint:testid` | advisory, NOT RUN | Not a gate. |

## 6. Where the reviewer should look hardest

1. **No global `profiles` fallback anywhere in candidate or mention loading.**
   `components/meetings/MeetingDocumentationModal.tsx` no longer contains `from('community_workspaces')` or
   `from('user_roles')`; its remaining `from('profiles')` is inside
   `loadWorkSessions` (co-editor names for the draft banner — out of scope).
   `pages/community/workspace.tsx:1840`–`1887` contains no `from('profiles')`, no
   `user_metadata` role check and no alternate source; confirm on the diff. The
   error path of the loader clears both `communityMembers` and
   `mentionSuggestions`, and `handleMentionRequest` (unchanged) will re-fetch on
   the next mention keystroke when the list is empty — that pre-existing retry
   behavior is the reason the test asserts exactly one request per open, not
   zero retries across the page.
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

Additional honest notes: the modal did not need `role_type` for rendering, so
the mapper's "first endpoint role, empty string when none" rule
(`components/meetings/MeetingDocumentationModal.tsx:100`) is reviewed by inspection only; and the three status notes
(`components/meetings/MeetingDocumentationModal.tsx:1014`) share one component-local helper keyed by scope, so the
same copy appears in Asistentes, Compromisos and Tareas.

## 7. Known limitations and deferred follow-ups

1. **UI e2e evidence gap (this stage):** Playwright and the manual matrix were
   not run (§5.3). Closing it requires a separately authorized PR/CI run or a
   separately authorized isolated local stack.
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
8. **Retry-on-keystroke for empty mention lists** — pre-existing behavior of
   `handleMentionRequest`, unchanged.
9. **Duplicate `data-testid="meeting-historical-assignee"`** when several
   records carry outsiders; the parent selectors carry per-index testids, which
   is the intended stable locator.
