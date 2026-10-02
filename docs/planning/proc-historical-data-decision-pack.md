# Historical data — decision pack for Brent (Procesos de Cambio)

**Status (2 Oct 2026): nothing has been run on real data.** This pack explains, in plain language, the decisions the old-data cleanup ("Operation A") needs from you. It decides none of them. The technical procedure it describes is `docs/planning/operation-a-one-active-docente-handoff.md`; you do not need to read it.

## 1. The problem in one paragraph

In Procesos de Cambio every course should have **one** responsible teacher. Before the rule was enforced by the app, some courses in the live system ended up with two or more teachers marked as active for the same course (the 1 Sep 2026 review counted some; the number has to be recounted). Today the app stops new duplicates, but the database itself cannot be given the permanent lock rule ("only one active teacher per course") until the old duplicates are cleaned, because the database refuses to add that rule while duplicates exist.

## 2. What we checked, without real data

On 2 Oct 2026 the whole procedure was re-run on a fresh, private test database filled with made-up schools, courses and teachers. It passed: the discovery queries found exactly the made-up problem cases, the cleanup changed only what it should, refused every unsafe case, and left all history in place. One line had to be fixed: the cleanup asked the database for a setting that the normal login of the live system is not allowed to change, which would have stopped the cleanup before it did anything. It now carries on without that optional setting (it only influences which side gives way in a rare traffic collision; both outcomes are safe).

## 3. What the cleanup does — and what it never does

For each duplicated course, after you approve it:

| What | What happens |
|---|---|
| The teacher assignments of the course | The one you choose stays active. The others are **marked inactive**, not deleted, so the record of who was assigned and when stays. |
| Evaluations of the course | **Kept.** Nothing is deleted. |
| Answers already given | **Kept.** Never moved to another teacher. |
| The removed teacher's access to that course's evaluations | **Removed**, but only on evaluations that have not been started and have no answers. Access is a permission ("this teacher may open and edit this evaluation"), not history, so it is removed rather than archived. Access to archived evaluations stays as it was. |
| Other people with access to the same evaluations (e.g. a co-teacher who was never an assigned teacher) | **Untouched.** |
| The teacher you keep | Keeps every access they had (the cleanup checks this and undoes itself if not). |

It never deletes an assignment, an evaluation or an answer; never picks a teacher by date or by guess; never moves answers from one teacher to another; and never touches a started or answered evaluation without a written decision from you that names it. If anything changed between the count and the cleanup, it stops, changes nothing, and asks for a recount.

## 4. Your decisions, one at a time

Each decision below unlocks only the step that needs it.

### Decision A — May we count the problem cases in the live system?
A read-only look: which courses have more than one active teacher, which evaluations exist in those courses (and whether they are started or answered), and which evaluations are still open under an evaluation template that has since been archived. It changes nothing and shows only ID numbers, course labels (e.g. "1° Básico A") and counts — no names, no emails, no student data. Without it nobody knows how big the job is. See § 5 for exactly what is run and by whom.
- **Changes:** nothing.
- **Gives you:** the list the other decisions are made from.

### Decision B — Who decides which teacher keeps each duplicated course?
For every duplicated course someone must say which of its active assignments stays. Options: you decide; or each school decides (then: who is the contact at each school). The system will not choose by date: the newest assignment is not necessarily the right one (a substitute may have been added later, or an old assignment may simply never have been switched off), and only the school knows who actually teaches the course. The answer is recorded as the exact assignment ID from the count, one per course.
- **Changes:** nothing by itself; it is the input to the cleanup.

### Decision C — Evaluations already started or answered in a duplicated course
When an evaluation in a duplicated course has been started or has answers, nobody can be sure which teacher wrote them, so the cleanup refuses to touch that course until you decide. Options:
1. **Archive it with a written reason.** It stays visible as history with all its answers; nobody can keep editing it. The course can then be cleaned.
2. **Leave it exactly as it is and leave that course out of the cleanup.** Nothing changes for that course; it stays duplicated, so the permanent lock rule (Decision E) cannot be added until it is resolved.
3. **Decide case by case after seeing the list** from Decision A.
- In every option the answers are kept and never moved to another teacher.

### Decision D — Evaluations still open under an archived template
The count also lists evaluations that are still open although their template (the evaluation content) was archived — leftovers from before that was blocked. For each one listed, by its ID: 
1. **Archive it and remove everyone's access to it.** The evaluation and any answers stay as history; nobody can open it for editing any more.
2. **Leave it out for now.** It stays open and usable, exactly as today, until you decide otherwise; it is then recorded as not corrected.

### Decision E — Doing the correction, and then the lock rule
After you approve the list course by course: may the cleanup run on the live system in a quiet time window you choose? It runs one course at a time, takes a few seconds per course, and while it runs saving is paused for everyone (reading keeps working); a save that hits that moment retries. Afterwards: may the permanent lock rule be added to the database (so a second active teacher can never be saved again), together with a small app change so that if two people assign a teacher to the same course at the same moment, the second sees the normal "this course already has a teacher" message instead of a generic error?
- Each of these is a separate approval: the cleanup per course, then the lock rule, then the app change (which goes out as a normal release).

## 5. Read-only discovery run book (for Decision A)

Nobody runs this until you say yes to Decision A in writing.

1. **Who runs it:** you, in the Supabase SQL editor of the live GENERA project (Claude has no access to the live system). Claude gives you one file with the queries, in order, exactly as written in the procedure, plus one extra read-only check (below).
2. **What is run:** six read-only queries, one at a time (the SQL editor shows only the last result of a paste, so each is pasted and exported on its own):
   - **1a** courses with more than one active teacher, with their exact assignment IDs;
   - **1b** every open evaluation in those courses, with its status, number of answers and who has access (as IDs);
   - **1c** open evaluations under archived templates, with their access and answer counts;
   - **1d0** the database version (decides an optional safety setting);
   - **1d** two checks that must come back empty (they confirm two protections added in September can stay).
   - **Extra check:** whether the September database changes the cleanup depends on (`20260908130000`, `20260908140000`) are actually live. If they are not, the cleanup must not run and we come back to you.
3. **What comes back:** IDs, course labels, statuses and counts, saved as files with the date and time. No names, emails or student data.
4. **What it changes:** nothing. All six are read-only queries.
5. **What happens next:** Claude turns the result into a plain list for Decisions B, C and D, course by course and evaluation by evaluation. Counts in this list are never permission to change anything — each correction still needs your separate OK, and the count is refreshed right before it runs.

## 6. Your eight questions from the 29 Sep plan (reproduced, not answered)

Questions 1–4 are Decisions A, B, C and E above. Questions 5–8 are about the pilot, which comes after.

1. **Looking at real data:** may the workflow run a read-only count of the old problem cases in the live system (courses that have more than one active teacher; evaluations already started or answered in those courses)? It changes nothing and shows only ID numbers, no names. Without it nobody knows how big the cleanup is.
2. **Who keeps the course:** when a course has two or more active teachers, who decides which one stays responsible — you, or each school (and who is the contact)? The system will not guess by date.
3. **Evaluations already answered in a duplicated course:** when answers exist and we cannot tell for sure which teacher wrote them, what should happen? Options: (a) archive that evaluation with a written reason (it stays visible as history, no one can keep editing it); (b) leave it exactly as it is and exclude that course from the cleanup; (c) decide case by case after seeing the list.
4. **Doing the correction:** after you approve the list course by course, may the correction run on the live system in a quiet time window you choose (a few seconds per course, nothing deleted, old teacher only loses access to unanswered evaluations)? And afterwards, may the database lock rule be added so duplicates cannot happen again?
5. **Pilot school and people:** which school, which course(s), which responsible teacher and which director take part, and which instruments (evaluation content) are approved for the pilot?
6. **Pilot settings:** which expectation levels, frequency settings and migration plan should the pilot use — the current defaults in the product, or specific values you (or the school) will provide?
7. **Where and when:** should the pilot run on the real production site or on a separate test copy first; when can you supervise the run-through (a date and about how long); and who plays each role (director, teacher)?
8. **Order:** is it right that the pilot waits until (a) the numeric validation work is closed, (b) the local fixes are published to the live site (a separate approval for push/PR/merge/deploy), and (c) the pilot school's old duplicate-teacher cases are cleaned? Or do you want the pilot sooner with known limits?

Since the plan was written, (a) and (b) of question 8 have moved: numeric validation is closed and its fixes are live (PRs #138, #140, #141).
