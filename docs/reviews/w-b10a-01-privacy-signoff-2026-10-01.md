# W-B10a-01 — Privacy sign-off (B10A-G3) — 2026-10-01

Status: **SIGNED by Brent Curtis, 2026-10-01.** Brent read the summary below in a Claude Code session and answered "I sign it as written" (choice recorded verbatim). Recorded by Claude on his instruction; Brent is the signer.

## What is being signed off

Migration `supabase/migrations/20260908180100_b10a_referenced_tables_rls.sql` (shipped in PR #89, on `origin/main`) turns on row-level security for six older tables that the app still uses:

| Table | What it holds |
|---|---|
| group_assignment_discussions | links a group assignment to its message thread |
| growth_community_transformation_access | which growth communities can open the transformation tools |
| instructors | course-catalog profile of each instructor (name, photo, bio, specialty) |
| modules | course structure |
| propuesta_rate_limits | per-IP counter of failed attempts at the public proposal access code (holds IP addresses) |
| qa_tester_time_logs | time logs of internal QA testers |

Before the migration, anyone with the public (anonymous) key could read and change all six. After it:

- anonymous access is removed completely;
- signed-in users only see or change rows their role and membership allow (admins everything; consultants and members only their own groups, paths and courses);
- the server's service role is unchanged;
- nothing is deleted, no table is dropped, and row security is only ever switched on.

The migration notes that none of the six tables holds data about minors.

## Sign-off text (approved as written)

> I, Brent Curtis, as the person responsible for privacy on GENERA, approve W-B10a-01 from a privacy standpoint on 2026-10-01. The change only narrows who can read or change six tables (no data about minors; the only personal data are instructor profiles, QA tester time logs and IP addresses in the access-code counter), removes anonymous access to them, and deletes no data. I accept it as the Privacy sign-off required by the W-B10a-01 exit gate (B10A-G3). This does not settle the other three open gates (pgTAP coverage G1, compensation G2, Production state G4).

## Not covered by this sign-off

- Whether the migration is already applied in Production (B10A-G4).
- The compensation artifact and its test (B10A-G2, decision 94d02887658014cb).
- The missing pgTAP cells (B10A-G1).
