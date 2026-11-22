## RD-SX — platform redesign, phase 6, sessions: three approved changes of the form «Programar Sesión», for everyone (2026-11-19, built and proven locally on main after RD-SA; not pushed)

Branch `feat/rd-ses-form` on main (`600d75ae6`). Record and reviewer notes: `docs/planning/reviews/fase-rd-sx-review-request.md`.

- **What changed (behaviour, on purpose, for every administrator, no switch; approved by the owner with the form's mock-up on 13 Nov 2026 and confirmed on 19 Nov):** in the create-session form, choosing a different school empties the community chosen before (`hooks/useSessionCreate.ts`); the earliest date the form's pickers offer is today in Chile, no longer today in UTC, and the service's comparison of a series' custom dates uses the same day (`todayInChile` in `lib/utils/session-timezone.ts`, used in the hook and in `pages/api/sessions/index.ts`). "One lead consultant" needed no code: the form already allowed one lead and refused to save without one; tests now hold it.
- **Rules that hold from now on:** "today" for a session's date is `todayInChile(now)`, never a UTC date cut from `toISOString()`. Digests 14b and 14d of `create.clasico` were re-accepted by name for the `min` of the date fields; the other 219 digests of the three session screens are untouched.
- **Proof:** tests written first and failing before the change; an independent code read; pictures of every screen for every role identical to main's (3,040 of 3,040), the session screens also for tester accounts in both looks (220 of 220 each); an independent tester walking the scenarios on main and on this branch; a look in a real browser; type-check, lint, the whole unit suite and CI's browser list run locally.

## GENERA fixes, release of 20 Nov (Gestión's money screens, first wave) — review ready

- Branch `fix/f21s` (a straight line of commits) on main `00780a641` (pull request 207). In the cash flow and a contract's details the invoice decides what is paid, and dates follow the day in Chile; the contract form reads amounts the Chilean way and refuses ambiguous ones, keeps an existing client's data read-only apart from missing required fields, and checks RUTs; moving hours and saving an expense report are each one database function (F21).
- Validation: database tests 111 files / 10,737; every rule reads the same after a rebuild (0 of 1,078 differ); unit 780 files / 21,820; type check; lint; CI's browser tests 348 of 348. Each build read by a second model, tested blind by a third, used by sight in a browser twice.
- Review request: `docs/planning/reviews/fase-fixes-f21s-review-request.md`. Not merged, not published; release is the owner's.


## GENERA fixes, second release of 20 Nov (change of a course's teacher) — review ready

- Branch `fix/f25d` (a straight line of commits) on main `b89a31696` (pull request 208). «Cambiar docente» works at any point: a sent registro stays as the course's result, a started one is closed and kept as history with a reason and the new teacher starts an empty one, an untouched one moves; every change leaves a line of history; an answer saved during a change cannot land in a closed or handed-over registro. A teacher can be assigned before the grade's instrument is published (F25, GC-20 and GC-3e).
- Validation: database tests 112 files / 10,849; every rule reads the same after a rebuild (0 of 1,080 differ); unit 780 files / 21,849; type check; lint; CI's browser tests 348 of 348. Read by a second model until nothing was left; used by sight in a browser (8 of 8). The blind test by a third model did not happen this time (stopped by its provider's filter); a substitute tester ran its scenarios through the routes (10 of 11; the one failure is listed as known in the request).
- Review request: `docs/planning/reviews/fase-fixes-f25d-review-request.md`. Not merged, not published; release is the owner's.
