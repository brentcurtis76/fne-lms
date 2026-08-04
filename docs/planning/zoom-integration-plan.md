# This plan has MOVED

**As of 2026-08-04 the Zoom workstream follows the standard plan layout:**

| Was | Now |
|---|---|
| `docs/planning/zoom-integration-plan.md` §0 | `docs/plan/zoom/LEDGER.md` |
| `docs/planning/zoom-integration-plan.md` (the plan) | `docs/plan/zoom/PLAN.md` |
| `docs/planning/reviews/fase-<N>-*.md` (numeric `<N>` only) | `docs/plan/zoom/reviews/` |

INSPIRA's `fase-<letter><digit>-*` review files stayed in `docs/planning/reviews/` —
that directory was always shared, and only Zoom's 13 numeric ones moved.

## Why

One repo holds several workstreams, and `docs/planning/` gave none of them a home of
their own. Zoom is now at `docs/plan/zoom/`, matching the layout every new workstream
gets. Nothing was lost: the split is line-for-line, verified before the old file was
replaced, and the original is in git history.

**If you are a PM or executor session pointed here: run `/pm-boot ZOOM` or
`/exec ZOOM <phase> <round>`, which resolve the real paths for you.**
