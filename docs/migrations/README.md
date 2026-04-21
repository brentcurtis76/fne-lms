# docs/migrations — governance note

`CLAUDE.md` states that the **DB agent owns all migrations**. Raw SQL files
should not normally be authored directly in this folder by Claude Code, and
migrations should not be applied to the database outside the DB agent's
pipeline.

## Known deviation — meeting redesign (PR 1 / PR 2 and corrective follow-ups)

As part of the community-meeting redesign orchestration, several migrations
were authored as raw SQL and applied via the Supabase Management API directly,
rather than through the DB agent. This includes the correction tracked in
this folder:

- `2026-04-21-meeting-version-default-zero.sql` — resets `community_meetings.version`
  default to `0` to match the autosave optimistic-concurrency contract, and
  repairs rows that were inserted under the earlier incorrect default of `1`.

The corresponding column/RLS work from PR 1 and PR 2 (rich-text columns,
draft/editors state, tightened RLS) was applied to the database directly
during those PRs and is not re-captured as files in this branch.

This is a documented one-off deviation. **Going forward (PR 3, PR 4, and
beyond), any new migration must be produced via the DB agent.** No further
raw SQL files should be added to this folder by Claude Code without explicit
approval.
