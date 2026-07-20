# Database Migrations

This directory holds ad-hoc SQL files used during early iterations of GENERA. They were
applied manually via the Supabase Management API rather than through a versioned tool.

## Technical Debt

Raw SQL files were written directly in PR 2 for migrations. Going forward, the DB agent
must own all migrations. Do not add new `.sql` files here without coordinating with the
DB agent — migrations belong in a tracked, reversible, reviewable workflow owned by that
agent.

Existing files in this directory are retained for historical reference only.
