# Z2 Production Start-Race Hotfix — Review Request

## Package identity

- Branch: `fix/zoom-start`
- Base SHA: `a1ef73fa`
- Planned commit count over base: 1 (the implementation and this review package)
- Status: ready for independent review; not merged or deployed

## Objective

Prevent an administrator from transitioning a platform-managed consultant session from `programada` to `en_progreso` before asynchronous Zoom provisioning has committed a usable meeting. The production pilot demonstrated that the previous sequence could make the provisioner re-read an ineligible source row and compensate the meeting it had just created, leaving the source session in progress without a Zoom meeting.

## Scope

### In scope

- Enforce managed-meeting readiness at the session update API boundary.
- Treat only public projection states `scheduled` and `live` as startable.
- Fail closed when the projection is missing or cannot be read.
- Distinguish terminal `ended` and `cancelled` projections from provisioning-in-progress.
- Poll managed-meeting readiness on the admin session detail page while the source remains scheduled.
- Disable the Start action until Zoom is ready and render explicit Spanish pending, unavailable, and join states.
- Add focused API, predicate, and component regression coverage.

### Out of scope

- No schema, migration, RLS, grant, or Supabase production change.
- No change to provisioning eligibility or lifecycle compensation logic.
- No direct Zoom API call and no live Zoom meeting created by this hotfix verification.
- No repair, cancellation, deletion, or other mutation of the already-broken production pilot session.
- No merge to `main` and no deployment; repository policy requires independent review and owner-controlled integration.

## Files changed by risk

### High risk — server transition authority

- `pages/api/sessions/[id]/index.ts`: rejects a managed `en_progreso` transition unless the public meeting projection is `scheduled` or `live`.

### Medium risk — admin workflow and shared readiness contract

- `pages/admin/sessions/[id].tsx`: reads and polls the public projection, delegates the Start affordance, and renders truthful meeting state.
- `components/sessions/SessionStartControl.tsx`: blocks Start during pending, failed-read, or terminal states.
- `lib/utils/managed-meeting-readiness.ts`: shared startable and unavailable status sets plus es-CL API messages.

### Test coverage

- `__tests__/api/sessions/session-managed-link-guard.test.ts`
- `__tests__/components/sessions/SessionStartControl.test.tsx`
- `__tests__/lib/utils/managed-meeting-readiness.test.ts`

### State and review documentation

- `PROJECT_STATE.md`
- `docs/planning/reviews/fase-z2-hotfix-review-request.md`

## Test evidence

All final evidence was collected from an isolated tracked snapshot with exactly the hotfix files overlaid. This avoids unrelated pre-existing untracked files in the shared working tree being discovered by repository-wide inventory tests.

- Focused Vitest: 3 files, 42 tests passed.
- `npm run type-check`: passed.
- `npm run lint`: passed with zero warnings.
- Full Vitest: 364 files; 8,307 passed, 11 skipped, zero failures.
- `npm run build`: passed.
- `node scripts/check-price-leak.mjs`: passed; 258 files scanned.
- `npm run test:db`: 21 pgTAP files; 1,433 tests passed.
- Mandatory Playwright: 121/121 passed; mandatory-manifest guard confirmed 12 specs ran with no skipped mandatory spec.
- Zoom E2E ran in `ZOOM_MODE=mock`; no live Zoom credentials or calls were used.
- The disposable local Supabase stack was stopped without backup after verification.

## Areas for the independent reviewer to scrutinize hardest

1. **Readiness authority:** confirm that `session_meetings_public.meeting_status IN ('scheduled', 'live')` is the correct proof that a managed meeting can support starting the source session, including lifecycle edge cases.
2. **Read-then-update window:** the readiness query and `consultor_sessions` update are separate operations. The patch closes the reproduced provisioning race, but it does not introduce an atomic cross-table database transition; determine whether a concurrent terminal webhook requires a DB-agent follow-up.
3. **Projection RLS and polling:** verify that every admin persona permitted on this page can read the public projection, that read failures remain fail-closed, and that polling stops in ready, terminal, and non-scheduled states.
4. **Disclosure boundary:** verify that the UI reads only the public projection and continues to reveal the actual join target exclusively through the existing platform interstitial/API flow.
5. **Regression shape:** confirm unmanaged sessions retain their prior Start behavior and that the helper's status sets cannot drift from the public projection enum without a type-check or test failure.

## Known limitations and deferred work

- The hotfix prevents the newly reproduced race; it does not retroactively recover the existing synthetic production session already stuck in `en_progreso` without a meeting.
- A fresh controlled production pilot is required after review, merge, and the automatic `main` deployment.
- Local end-to-end evidence verifies the workflow in mock Zoom mode. The next controlled pilot is the live-provider evidence.
- The current server guard is fail-closed but not a single atomic database operation with the source status update. Any decision to make that invariant transactional belongs in an additive migration and DB-agent review, not an unreviewed production hotfix.
