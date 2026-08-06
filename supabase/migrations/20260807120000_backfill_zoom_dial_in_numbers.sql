-- =============================================================================
-- Z2-4e: backfill dial_in_numbers for rows provisioned BEFORE Z2-4d
--
-- 20260806120000 added the column and taught the two provisioning RPCs to derive it
-- from `effective_settings -> 'global_dial_in_numbers'` in the same UPDATE that writes
-- `effective_settings`. Rows that were already provisioned when that migration landed
-- were not revisited: they carry the numbers inside `effective_settings` and a NULL
-- `dial_in_numbers`, which makes the column COMMENT's own claim ("DERIVED from
-- effective_settings -> 'global_dial_in_numbers'") false for exactly those rows.
--
-- This migration makes it true. It is DML only — no DDL, no DROP, no grant change, no
-- RLS change, and no new function or signature.
--
-- THE `dial_in_numbers IS NULL` GUARD IS LOAD-BEARING. Without it a replay of this
-- migration over a database where a later writer had corrected a row by hand would
-- overwrite that correction from the stale settings blob. With it, the statement can
-- only ever move a row from "unnamed" to "named" and is idempotent: a second run
-- matches nothing.
--
-- `effective_settings ? 'global_dial_in_numbers'` is the key-presence test, and it is
-- what keeps the no-audio-plan rows NULL rather than writing a JSON null into them.
-- Zoom OMITS the key entirely for a tenant without an audio plan (see the fake at
-- lib/zoom/fake.ts), so "key absent" is the normal state, not a defect to repair.
-- A NULL `effective_settings` yields NULL from `?` and is therefore not matched either.
--
-- On a fresh database this statement matches zero rows — `zoom_meetings` is empty at
-- migration time. That is expected, and is why the three outcomes are asserted against
-- seeded fixtures in supabase/tests/002-zoom-internal-isolation.sql section F rather
-- than against the replay.
-- =============================================================================

UPDATE zoom_internal.zoom_meetings
   SET dial_in_numbers = effective_settings -> 'global_dial_in_numbers'
 WHERE dial_in_numbers IS NULL
   AND effective_settings ? 'global_dial_in_numbers';
