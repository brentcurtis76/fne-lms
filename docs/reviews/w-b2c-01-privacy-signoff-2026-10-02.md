# W-B2c-01 — Privacy sign-off: who may see and change learning-path data — 2026-10-02

Status: **SIGNED by Brent Curtis, 2026-10-02.** Brent read this note in a Claude Code session and answered "I sign it as
written" (recorded verbatim). Recorded by Claude on his instruction; Brent is the signer. The sign-off text below is
unchanged from the reviewed draft (Codex W-B2C-01-RELEASE r1).

## What is being signed off

Learning paths ("rutas de aprendizaje") hold, per person: which paths they are assigned to, their progress through the
courses, and how much time they spent studying (timer sessions and daily totals per person, path and day). The people in
this area are platform users (teachers, school staff, consultants); that they are not minors is how the platform is used
today, not something these changes enforce.

Who may do what after PR #89 (merged 2026-09-09) and the W-B2c-01 changes of 2026-10-02:

| Who | See learning-path data about OTHER people | Change paths / assignments | Own data |
|---|---|---|---|
| Head administrator (admin) | Everyone | Yes (only role that can) | Yes |
| Consultant (consultor, active) | Report summaries for everyone, all schools (Reports page, and the learning-path part of the assignment screens) | No | Yes |
| School director (equipo_directivo, active, with a school) | Report summaries only for people with an active role in the director's own school(s) (Reports page; assignment history of one own-school person) | No | Yes |
| Everyone else (teachers, leaders, network supervisors, ...) | No | No | Yes: their own assignments, progress and time |
| Not signed in | Nothing | No | — |

"Report summaries" means assignments, progress, completion, total time and the at-risk flag. Consultants and directors do
not get other people's raw study-timer records.

Also:
- Anyone who still has to change a temporary password sees nothing until they do.
- The server's master key can no longer wipe (TRUNCATE) four tables: learning_paths, learning_path_courses,
  learning_path_assignments and learning_path_progress_sessions. It keeps normal read, write and row-by-row delete.
- Study-timer records: each finished session is added to that day's total (per person, path and day, kept). An hourly
  clean-up makes closed, settled timer records ELIGIBLE for deletion after 7 days. Records still open, unsettled or missing
  evidence are kept; settled records are also kept while another unsettled session could overlap them; and each run
  deletes a limited batch, so a backlog can wait for later runs. 7 days is the usual age at deletion, not a maximum. Brent
  accepted this on Claude's recommendation (data minimisation; easy to lengthen later).
- When someone is removed from a path, courses they only had through it are removed; their history is kept.
- Report figures: completion rate and "at risk" (no activity for 14 days, path not finished) are defined; the engagement
  score is removed.

Enforcement is in the database (row security and scoped report views), not only in the website code, and is tested:
pgTAP 070, 099 (full role × table × operation matrix), 100, 101 (two-school report scope), 102 (two-school assignment
history), plus API and browser tests.

## Sign-off text (approved as written, 2026-10-02)

> I, Brent Curtis, as the person responsible for privacy on GENERA, approve on 2026-10-02 the learning-path access rules
> described above: the head administrator manages all learning paths and sees everyone's learning-path data; active
> consultants see learning-path report summaries for all schools; active school directors see them only for people of
> their own school(s); everyone else sees only their own; nobody but the head administrator can change paths or assignments; and
> closed, settled study-timer records become eligible for deletion after 7 days while daily totals are kept. I accept this as the Privacy
> sign-off for W-B2c-01.

## Not covered by this sign-off

- Whether these database changes are already applied in Production (separate, authorised step).
- Older course enrolments of unknown origin (kept as they are; no clean-up authorised).
