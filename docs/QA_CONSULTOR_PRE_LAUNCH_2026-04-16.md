# Consultor Pre-Launch — Manual Smoke Test & Close-Out

**Date:** 2026-04-16
**Branch merged:** `claude/pensive-shaw` → `main` (commit `d0ca050`)
**Applied to prod DB:** FK constraint `fk_consultor_sessions_school` (ON DELETE RESTRICT)

---

## What shipped

4 bridge commits merged into `main` + 1 infrastructure commit:

| Commit | Phase | Change |
|---|---|---|
| `5083218` | B1, B3 | Optimistic locking on session PUT (`if_updated_at` → 409 on conflict); session detail page sends and handles the guard with a Recargar banner. `test:roles` npm script restored from the `echo skipped && exit 0` stub. |
| `c04fa0f` | C (H1–H4) | Collapsed auth+fetch effect with token refresh and 401/403/404 routing. Zod `notes.max(500)` on attendees. Admin-override branch in finalize w/ audit log. Null-session guard. |
| `4b19207` | D | Unit + API coverage: multi-role policy, concurrency, notification recipients, optimistic-lock regression. |
| `8ee22f9` | D + E + B2 | RTL tests for consultor detail/list pages. pgtap RLS suite + `test:db:consultor` script. 50-parallel-PUT concurrency harness. ~154-combo RBAC fuzz. B2 FK migration script. |
| `36354e3` | infra | Gitignore `.claude/worktrees/` so bridge `git pull` dirty-guard doesn't trip. |

**Quality gates on merged main:**
- `npx tsc --noEmit` — clean
- `npm test` — **1605/1608 passing** (3 pre-existing `propuestas/validation` failures, out of scope)
- `npm run test:roles` — **50 files / 426 tests passing** (was a trivial `echo skipped` stub)
- `supabase/migrations/20260416_consultor_sessions_school_fk.sql` — applied to prod, 0 orphans pre-migration

---

## Manual Smoke Test Checklist

Mark each item as **PASS / FAIL / N/A** and add notes inline. Flag failures back to me for iteration.

### Tier 1 — Must pass before real consultors start using it next week

#### 1. Optimistic locking / concurrent edit conflict (C1 — new)

- [ ] Open the same session detail page in two browser tabs (either as two different facilitators or the same user twice).
- [ ] In Tab A: edit any non-structural field (description, meeting link, etc.) and save → expect success toast.
- [ ] In Tab B (do NOT refresh): change a different field and save.
- [ ] **Expect:** conflict banner/toast saying the session was modified by another user, with a **"Recargar"** button.
- [ ] Click Recargar. Tab B refreshes with Tab A's changes visible. Re-edit and save → now succeeds.
- **Fail condition:** Tab B silently overwrites Tab A's changes with no warning.

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

#### 2. Admin finalize override (H4 — new)

- [ ] Log in as an admin user who is **NOT** listed as a facilitator on a specific session.
- [ ] Open that session detail page and click "Finalizar sesión".
- [ ] **Expect:** finalize succeeds.
- [ ] Check the session's activity log — should show an entry with `admin_override: true` in the details.
- **Previously:** would block admin with "Solo facilitadores asignados pueden finalizar sesiones".

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

#### 3. FK constraint on schools → sessions (B2 — applied to prod)

- [ ] As admin, pick a school that has `consultor_sessions` rows (via Supabase dashboard or admin UI).
- [ ] Try to delete that school.
- [ ] **Expect:** prod rejects with `ERROR: update or delete on table "schools" violates foreign key constraint "fk_consultor_sessions_school"`.
- [ ] Delete a school with **zero** sessions → should still succeed.

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

#### 4. 401 / 403 / 404 UI states (H1, H3 — new)

- [ ] **404:** visit `/consultor/sessions/<bogus-uuid>` → "Sesión no encontrada" cleanly, no white-screen crash.
- [ ] **403:** log in as a docente (or any role with no access to a specific session) and navigate to that session's URL → "Acceso denegado" (not "Sesión no encontrada").
- [ ] **401:** leave a session detail page idle until session expires (or clear cookies mid-flight), then reload → redirect to `/login`, not stuck on a spinner or showing "Sesión no encontrada".

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

#### 5. Attendee notes length cap (H2 — new)

- [ ] In a session's attendees form, paste a 1000-character string into the `notes` field → try to save → expect clean 400 error (Zod: notes must be ≤500 chars).
- [ ] Paste a 300-character string and save → expect success.

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

### Tier 2 — RBAC correctness (no new code, but we added coverage — worth re-verifying)

#### 6. Global vs school-scoped consultor visibility

- [ ] Log in as a **global consultor** (`user_roles.school_id IS NULL`) → session list shows sessions from **all** schools.
- [ ] Log in as a **school-scoped consultor** → session list shows only that school's sessions.
- [ ] Consultor with multiple active school assignments → sees sessions from all assigned schools.

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

#### 7. Multi-role user precedence

- [ ] If any user has both admin + consultor: admin rights win → can edit any session.
- [ ] Consultor + docente: consultor access applies for consultor paths.
- [ ] Inactive role + active role: only the active role's scope is used.

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

#### 8. Notifications on session lifecycle

- [ ] Create a session → facilitators and admins at that school get notified.
- [ ] Cancel a session → same recipients notified.
- [ ] Complete/finalize a session → same recipients notified.
- [ ] A user with no access to the session → does **NOT** get notified.

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

### Tier 3 — Infrastructure / nice-to-have

#### 9. `test:roles` in CI

- [ ] Check the CI pipeline: `npm run test:roles` now runs **25 files / 213 tests** (or 50/426 when both worktree and main are picked up), not the old `echo skipped && exit 0` stub.

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

#### 10. Browser console during normal usage

- [ ] During a typical 5-minute session of using `/consultor/sessions`, keep devtools console open.
- [ ] **Expect:** zero uncaught errors, no `Cannot read property 'title' of null` warnings (H3 fix), no 409 responses on single-user edits.

**Result:** ☐ PASS  ☐ FAIL  ☐ N/A
**Notes:**

---

## Feedback / follow-up backlog

If anything fails above, or you want additional work, drop notes under the relevant item and I'll iterate. Known deferred items:

- **UX polish on the 409 banner** — currently a standard toast. Richer conflict UI (diff view of what changed, merge-conflict picker, per-field override) is a follow-up.
- **Offline-reconcile on 409** — if a consultor's network drops mid-edit and they retry, they'll hit 409. Could auto-retry once with a refreshed `updated_at` and only show the banner on the second failure.
- **Admin override audit visibility** — the `admin_override: true` flag lands in `session_activity_log.details` but there's no dedicated UI filter. Worth adding if product wants to audit.
- **Global consultor edit path** — right now a global consultor can VIEW all sessions but can only EDIT if assigned as facilitator. If product wants global consultors to edit any session, that's a one-line change in `canEditSession`.
- **N+1 on `session_materials` → `profiles`** (M1, deferred) — harmless at 54 sessions / 2 materials, but will matter at 10× scale. Fix: batch-fetch profiles after deduping `uploaded_by`.
- **3 pre-existing `propuestas/validation` test failures** — unrelated to consultor scope. Want triage? Say the word.

---

## Remaining steps on your side

1. `git push origin main` to publish the merge (I held off per safety protocol — non-destructive but explicit push wasn't requested).
2. Deploy on your normal cadence (no `vercel` from me — RED-tier per CLAUDE.md).
3. Work through this checklist and report results.

## Reference — new files created

```
__tests__/api/sessions/session-concurrency.test.ts
__tests__/api/sessions/session-notification-recipients.test.ts
__tests__/api/sessions/session-optimistic-lock.test.ts
__tests__/helpers/session-policy-factories.ts
__tests__/lib/utils/session-policy-multi-role.test.ts
__tests__/pages/consultor/sessions/detail.test.tsx
__tests__/pages/consultor/sessions/list.test.tsx
__tests__/stress/consultor-rbac-fuzz.test.ts
__tests__/stress/consultor-session-concurrency.test.ts
database/tests/consultor_sessions_rls.test.sql
supabase/migrations/20260416_consultor_sessions_school_fk.sql  (already applied)
```

## Reference — original plan

`/Users/brentcurtis/.claude/plans/unified-weaving-willow.md`
