# Learning-path session maintenance — operating procedure (closure C4, 2026-09-07)

> Route: `pages/api/cron/cleanup-learning-path-sessions.ts` (GET or POST). Schedule: **hourly** (`vercel.json` → `"0 * * * *"`), stale threshold **15 minutes**, retention **7 days**. This document describes the contract the local candidate implements and tests; the schedule takes effect only when the application that carries this `vercel.json` is deployed (a separately authorized release action). Nothing here was executed against Production.

## 1. What one run does

| Stage | RPC (service_role only, SECURITY DEFINER) | Effect | Bound |
|---|---|---|---|
| 1 Settlement | `close_stale_learning_path_sessions(now − 15 min)` | closes open sessions whose last **authorized** heartbeat is older than the threshold (at that heartbeat, server-computed minutes) and settles them plus any closed-but-unsettled session exactly once (union-clipped credit, per-(user, path) advisory lock, SKIP LOCKED); writes the daily activity grain | 500 candidate sessions per run |
| 2 Retention | `archive_settled_learning_path_sessions(now − 7 days − 5 min, 1000)` repeated while `has_more`, at most 5 times (the 5-minute margin, added 2026-09-08, keeps the application-clock boundary strictly older than the database's own `now() − 7 days` check under clock skew — an exact seven days raced it in an E2E run) | deletes closed + settled sessions older than 7 days **only if** (a) no unsettled session of the same (user, path) starts before this session ends (its interval is still settlement evidence) and (b) its day has a grain row (reporting evidence); refuses a boundary younger than 7 days (`22023`) | 1 000 per batch, 5 000 per run |

Both stages run on every run — idle runs, settlement-only runs (`closed = 0`, `settled > 0`, the shape the previous route left behind during a deploy window) and busy runs alike. Both are idempotent: a repeat run closes, settles and deletes nothing new.

## 2. Response contract

```json
{ "ok": true, "message": "Session maintenance completed" | "Idle run: nothing to close, settle or archive" | "Session maintenance failed",
  "staleCutoff": "…", "retentionBoundary": "…",
  "settlement": { "closed": n, "settled": n, "ok": true },
  "retention": { "archived": n, "batches": n, "hasMore": false, "retainedOpenOverlap": n, "retainedMissingEvidence": n, "ok": true },
  "errors": [ { "stage": "settlement" | "retention", "message": "…" } ], "timestamp": "…" }
```

- **200** only when both stages succeeded. **500** (`ok: false`) when either failed — the payload still reports what the earlier stage achieved (retention is skipped when settlement failed, so a broken database is not hammered). The scheduler therefore sees a failed run; the next run continues where this one stopped.
- **503** when `CRON_SECRET` is missing / empty / whitespace; **401** for any other Authorization value; **405** for other methods. No database operation happens before authentication; the secret is never echoed or logged.

## 3. Cadence, latency and backlog

- A session abandoned at time *t* is closed between *t + 15 min* and *t + 75 min* (next hourly run). Credit does not depend on the job: a learner's next `start` settles their own previous session immediately.
- Steady state: sessions close at 500 per run; 500 stale sessions per hour is far above the platform's real load. If more than 500 are stale, the next run continues (`closed` stays 500 until drained — a signal worth noticing in logs).
- Retention drains at up to 5 000 sessions per run. A first run over a large history is expected to report `hasMore: true` for several hours; that is normal drainage, not an error.
- `retainedOpenOverlap > 0` means an OPEN session older than 7 days still exists for a pair with settled history — it is closed by the next settlement stage (its heartbeat is stale by definition) and archived afterwards. `retainedMissingEvidence > 0` should be **0** after the backfill; a persistent nonzero value means a session was settled without its grain row (investigate `learning_path_daily_user_activity` for that pair; never delete by hand).

## 4. Failure detection and operator response (existing mechanisms only)

| Signal | Where | Response |
|---|---|---|
| run status ≠ 200 | Vercel cron run log (Project → Cron Jobs → run history) and the function log line `[SessionCleanup] failed run: {...}` | read `errors[].stage`; settlement errors point at the database (RPC missing → the database is behind the application: apply the migrations; permission → grant regression); retention errors leave settlement intact — safe to wait for the next run |
| 503 | function log `CRON_SECRET is not configured` | set `CRON_SECRET` in the Vercel project (Production) — Vercel then sends `Authorization: Bearer <CRON_SECRET>` on every cron invocation |
| 401 on every run | run log | the header does not match the configured secret (rotated on one side only) |
| `closed` pinned at 500 for many runs | function log summary | a backlog of stale sessions larger than expected; harmless, drains at 500/hour; investigate why sessions are abandoned |
| `hasMore: true` for many hours | function log summary | retention backlog; harmless (5 000/hour) |
| `retainedMissingEvidence > 0` persistently | function log summary | data question for the owner (aggregate-only query on the grain vs. sessions); no manual deletion |

No external messaging service is introduced. Alerting uses the existing Vercel cron failure notifications / log drain the project already relies on for the other four scheduled routes.

## 5. Scheduler contract (verified from the hosting documentation)

- Vercel Cron Jobs invoke the path with an HTTP **GET** and, when the project has a `CRON_SECRET` environment variable, send `Authorization: Bearer <CRON_SECRET>` (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs). The route accepts GET and POST and checks exactly that header.
- Hourly schedules require a plan that allows sub-daily cron cadence (the project already runs minute-level crons `zoom-ticker` / `recovery-outbox`, so the plan already allows it; **verify in the Vercel project settings during release** — a Hobby-plan project would silently run once a day).
- Execution time is bounded by `maxDuration: 60` (already set); a full 5-batch retention run on the disposable stack takes well under a second per batch.

## 6. Release checklist for this job (separately authorized operator actions)

1. Database first: migrations `…120400`, `…120500`, `…120600` applied and postflight checks green (rollout §4, Q8–Q10).
2. `CRON_SECRET` present in Vercel Production (presence only — never print the value): `vercel env ls production | grep CRON_SECRET`.
3. Deploy the application (carries `vercel.json`); confirm in the Vercel dashboard that `/api/cron/cleanup-learning-path-sessions` appears with `0 * * * *`.
4. Wait for the first scheduled run (or invoke once with the secret) and read its JSON: `ok: true`, `settlement.ok`, `retention.ok`; record `settled` (the window's closed-but-unsettled sessions) and `archived`.
5. Observe the next two runs: both should be idle or steadily draining (`hasMore` eventually false).
