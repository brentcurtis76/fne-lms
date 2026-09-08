# Assessment draft recovery

Branch: `codex/eval-draft`. Base: `a69d6f10` (the preceding completion-message release).

The form synchronously journals each edit in browser localStorage, scoped to the signed-in user, assessment instance, and tab. It offers explicit recovery after a successful authorized server read, rather than automatically replacing potentially newer server answers. Only edited indicators are sent. Journals survive navigation, failed requests, timeouts, partial saves, and disposal; acknowledgment clears only the sent revisions, never newer edits or another tab's journal. Transient failures retry with bounded backoff; reconnection triggers an immediate retry. The browser warns on unload while changes remain unacknowledged. Storage failures are visible; they do not prevent server saves.

The GET assessment route now fails on a response-query error instead of returning an empty response map. The page offers retry with editing unavailable until a successful load. A completed or archived assessment does not restore local edits.

This is browser-local recovery, not cross-device synchronization or a server backup. Clearing browser data, storage eviction, private-session closure, or local-storage failure can remove/prevent recovery. Multiple people editing the same indicator remain subject to the existing last-write semantics; recovery is explicit and warns about newer server changes. No schema or migrations; no production data operations.

Validation scope: unit tests exercise the actual journal and actual page (including close/reopen, load retry, unload warning, reconnect, timeout/backoff, partial saves, storage failures, account separation, and multiple tabs). The mandatory Playwright spec uses the real authenticated page and browser storage with intercepted assessment API responses; it verifies client behavior and does not claim database persistence. The API regression verifies the fail-closed response-query error.

Review priorities: journal cleanup versus newer edits; request serialization/disposal; user/instance/tab separation; recovery consent and server-load failure; browser-storage availability and status wording. Remaining validation results are recorded in the PR checks; this change is not authorized for production deployment by the preceding request to deploy only the earlier session changes.
