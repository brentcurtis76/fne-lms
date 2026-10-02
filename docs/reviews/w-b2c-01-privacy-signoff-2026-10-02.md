# W-B2c-01 — Privacy sign-off: who may see and change learning-path data — 2026-10-02

Status: **DRAFT — not signed.** Brent chose on 2026-10-02 to sign this himself as a dated note. It becomes signed only
when Brent reads it and answers in a Claude Code session (his answer is then recorded here verbatim, with the date).

## What is being signed off

Learning paths ("rutas de aprendizaje") hold, per person: which paths they are assigned to, their progress through the
courses, and how much time they spent studying (timer sessions and daily totals). No table in this area is about minors
as such; the people are platform users (teachers, school staff, consultants).

Who may do what after PR #89 (merged 2026-09-09) and the W-B2c-01 changes of 2026-10-02:

| Who | See learning-path data about OTHER people | Change paths / assignments | Own data |
|---|---|---|---|
| Head administrator (admin) | Everyone | Yes (only role that can) | Yes |
| Consultant (consultor, active) | Everyone, all schools (reports, and the learning-path part of the assignment screens) | No | Yes |
| School director (equipo_directivo, active, with a school) | Only people with an active role in the director's own school(s), on the Reports page and in the assignment history of a single own-school person | No | Yes |
| Everyone else (teachers, leaders, network supervisors, ...) | No | No | Yes: their own assignments, progress and time |
| Not signed in | Nothing | No | — |

Also:
- Anyone who still has to change a temporary password sees nothing until they do.
- The server's master key can no longer wipe (TRUNCATE) the learning-path tables; it keeps normal read/write.
- Detailed study-timer records are kept 7 days, then folded into one daily total per person (kept). Brent accepted this on
  Claude's recommendation (data minimisation; easy to lengthen later).
- When someone is removed from a path, courses they only had through it are removed; their history is kept.
- Report figures: completion rate and "at risk" (no activity for 14 days, path not finished) are defined; the engagement
  score is removed.

Enforcement is in the database (row security and scoped report views), not only in the website code, and is tested:
pgTAP 070, 099 (full role × table × operation matrix), 100, 101 (two-school report scope), plus API and browser tests.

## Sign-off text (proposed — Brent to approve or change)

> I, Brent Curtis, as the person responsible for privacy on GENERA, approve on 2026-10-02 the learning-path access rules
> described above: the head administrator manages all learning paths and sees everyone's learning-path data; active
> consultants see learning-path data for all schools; active school directors see it only for people of their own
> school(s); everyone else sees only their own; nobody but the head administrator can change paths or assignments; and
> detailed study-timer records are kept for 7 days before being reduced to daily totals. I accept this as the Privacy
> sign-off for W-B2c-01.

## Not covered by this sign-off

- Whether these database changes are already applied in Production (separate, authorised step).
- Older course enrolments of unknown origin (kept as they are; no clean-up authorised).
