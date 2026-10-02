# NOTIF-08 review request — N2-02 notification producer contract (r1)

- **Branch:** `fix/notif02-redo`. **Base:** `27b4bc269523709a1caa49a5d939efafbc2be680` (NOTIF-07 ledger commit). **Commits:** 0 so far; the PM commits after review.
- **Ledger item:** N2-02, "Payload/template fixes; `notification_type_id`/category; `meeting_finalized` recipients **in-app only** (email suppressed until N5-06, so no double send)".
- **Rounds:** r0 delivered FINDINGS; the PM review (`pm-review-r0.md`) raised N08-R0-F1..F3. Order r1 resolves them without changing the outcome.

## Objective and scope (orders r0 + r1)

**Objective:**
- Make the fallback templates render the persisted messaging payloads.
- Give in-app rows the canonical catalog category, plus an existing `notification_types` id.
- Deliver `meeting_finalized` bells to the meeting's audience, independently of summary-email eligibility, and suppress their notification email until N5-06.
- Make the real finalize POST work on the migrations-built schema.
- Preserve the separate meeting-summary email, route authorization and the N2-01 idempotency.

**In scope (8 paths):** `lib/notificationEvents.ts`, `lib/notificationService.ts`, `lib/notifications/catalog.ts`, `pages/api/meetings/[id]/finalize.ts`, `__tests__/lib/notificationService.producer-contract.test.ts`, `__tests__/api/feedback/notify-admins.test.ts`, `tests/e2e/messaging-notifications.spec.ts`, this file.
The r0 additions to `__tests__/lib/notificationService.email.test.ts` moved into the producer-contract file (that file is back at HEAD). `tests/e2e/meeting-finalized-notification.spec.ts` is deleted; the real-POST block in the messaging spec replaces it.

**Out of scope:** meeting policy/roles, summary email filtering or content, messaging route authorization, outbox/worker/digest, migrations and type seeding, UI redesign, real delivery and release.

## r0 findings and their resolution
| Finding | Resolution |
|---|---|
| F1 notify-admins pinned category `admin` | The test now expects the catalog's `qa_support`; the producer is unchanged. |
| F2 finalize embed `communities` → PGRST200/404 | The route embeds `community:growth_communities!community_workspaces_community_id_fkey(id, name, school_id)`. The e2e POSTs the real route on the migrated stack. |
| F3 email opt-out removed the bell | The route derives `recipient_ids` from the audience before any email filter: `attended` attendees from the meeting's attendee rows, `community` active `user_roles` of the meeting's community. `getCommunityRecipients` and the summary are unchanged. |

## Files, grouped by risk

**Higher risk: live delivery path.**
- `pages/api/meetings/[id]/finalize.ts`: embed fix; bell audience computed inside the existing nonfatal trigger `try`, so a lookup failure or throw notifies nobody and still returns 200. No request-provided ids are read.
- `lib/notificationService.ts`: catalog category; `getNotificationTypeId` (absent/error/throw → `null`, code-only log); the `meeting_finalized` recipient case (string UUIDs only, lowercased, deduplicated); `resolveEmailChannel` returns false for `meeting_finalized` before the kill switch or any preference/provider read; the `Creating notification` log carries only `event_type`.

**Medium risk: text users see.** `lib/notificationEvents.ts`: flat producer shapes first, nested legacy shape second; `bounded()` collapses whitespace and cuts names to 80 and previews/titles to 120 characters.

**Low risk:** `lib/notifications/catalog.ts` (`meeting_finalized` audience `meeting_recipients`; category and `emailDefault` unchanged).

## Test evidence
- **Focused:** `mise exec node@22.16.0 -- npx vitest run __tests__/lib/notificationService.producer-contract.test.ts __tests__/api/feedback/notify-admins.test.ts __tests__/api/meetings/finalize.test.ts`: 3 files, 88 passed.
- The producer-contract file has 31 tests. They include 5 that drive the real finalize handler (real service, real `getCommunityRecipients`; only `getApiUser` and `sendMeetingSummary` are stubbed) with the kill switch on and a capturing transport: attended/community audiences, a failed member lookup, a summary failure, and 403/403-repeat/409-race.
- **Mutations (r1):** bells from the email-filtered list → 4 failures; old `communities` embed → 1 failure. The r0 mutations still apply.
- **UI:** `pm-unit ui-run NOTIF-08 --paths-file commit-paths.txt -- npx playwright test tests/e2e/messaging-notifications.spec.ts` on the disposable `notif08isolated` stack, 8 tests. The real POST returns 403 for an outsider and for a repeat, 409 for the race loser, and 200 twice. It writes 8 bells (attended: email-off, no-email, immediate; community: all 5 members). Desktop and mobile bells were checked.
- **Full gates:** see `RUN/executor-report-r1.md`.

## Scrutinize hardest
1. **The audience lookup in the route.** It duplicates the audience half of `getCommunityRecipients` rather than sharing it, because the route test mocks the whole notificationService module and a new export would break it outside this allowlist. Check that both halves stay the same scope.
2. **A repeat finalize returns 403, not 409.** `canFinalizeMeeting` admits only `borrador` for every role, so the route's `meeting_not_draft` 409 is unreachable. The only reachable 409 is the lost race (`meeting_already_finalized`). Existing behavior is preserved and asserted as-is.
3. **Notification-mail suppression in the browser run.** The app server has no provider key and the kill switch is off, and its stdout is not captured. The browser run therefore proves no mail left, not that the `in_app_only` rule fired. The rule is proven in unit tests through the real route with the kill switch on and `immediate` mode.
4. **The type-id race.** A type row deleted between lookup and insert gives a 23503 error and one lost bell (A1, accepted).
5. **The legacy payload fallback.** The nested shape is still read second for two N2-01 specs outside the allowlist.

## Known limitations / deferred
- `notificationsCreated` counts a retry absorbed by the idempotency key, or a recipient with in-app off, as created. This is carried over from N2-01 (A2).
- The DB-trigger path uses the catalog category even when an admin configured another one for a mapped event, as the order specifies.
- The N0-02 tests leave their posts, mentions and bells behind (by design, NOTIF-02); the disposable stack is dropped with `supabase stop --no-backup`.
