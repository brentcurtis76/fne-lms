# Assessment completion message and final-save protection

Branch: `codex/eval-complete`. Base: `b899c48b`.

The response form now stays on the completed assessment and displays the approved Spanish message explaining that reports follow completion by all responsible participants and advisor feedback. Answers remain visible, read-only. This change does not implement report-release orchestration or restrict direct access to existing results routes.

Response protection:
- Submission waits for the final save and stops on HTTP errors, partial saves, or an unexpected saved count.
- Writes from this form are serialized; an older autosave cannot finish after the final save.
- The debounce collects all edited indicator IDs instead of saving only the last edited indicator.
- Editing is disabled during submission. A failed save retains the in-memory answers and restores editing for retry.
- No API, schema, scoring, response deletion, production database operation, or deployment was changed/performed.

Verification used a detached checkout at `/tmp/fne-eval-completion` with the two changed files copied in, Node 22, and locally available dependencies from `/Users/brentcurtis/dev/fne-lms/node_modules`. The original checkout has dataless dependency files that block reads. No production credentials were copied; the build used synthetic localhost Supabase configuration.

Passed: type-check, repository lint, production build, diff whitespace check, and 7 focused tests across `assessment-completion.test.tsx` (4) and `docente-assessments.test.ts` (3). The new tests exercise the real page with mocked auth/API and verify final-save ordering, latest-answer retention, in-flight autosave ordering, failed/partial save rejection, and retry.

Incomplete: the full Vitest run was interrupted without a final result; it is not a passed gate. The browser gate could not initialize because the isolated checkout has no `.env.local` or configured synthetic database environment. No database-backed persistence or production end-to-end test was performed. This is not a guarantee against browser closure, device failure, simultaneous edits from other clients, or other existing persistence defects.

Review priorities: final-save error handling; ordering of queued saves; retry behavior after partial saves; completion message and retention of the existing answer view. Not deployed; remaining integration gates must pass before release.
