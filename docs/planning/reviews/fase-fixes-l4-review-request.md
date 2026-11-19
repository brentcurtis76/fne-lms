# GENERA fixes, release of 19 Nov (second): the cash flow's UF, Soporte's replies and «Mis reportes», Espacio Colaborativo loses nothing typed or uploaded, Licitaciones' documents say what is true

Branch: `fix/l4`. Base: `7ea55c091` (main, 19 Nov 2026 10:50, pull request 204: the fixes' sixth release).
A straight line of commits on main, no merge commits: 80 commits of three phases (F15d, F15f and F15e; F18; F20), and this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026 (three levels: exposed, dead ends in normal use, wrong money or data) and answered the product questions on 17 Nov; each answer is quoted in the phase's brief. F15 is level 2 (dead ends); F18 and F20 are the first two phases of level 3 that need no further decision. Where the code reader had a question the safer choice was taken and is listed for the owner (below, "Decided for the owner, to overrule").

## What changes

**F15d and F15f — «Flujo de caja» computes with the day's real UF**
- Every request for the UF has a five-second limit; the service says where its value comes from (today's, the last one this browser obtained with its date, or the built-in one) and never presents an old value as today's; the screen never computes with 0 and says «No se pudo obtener la UF de hoy. Se usa el valor del …» when that is so.
- The reader of the tax office's page takes the value only from the table that names its month in its first row (no nested table, comments stripped, 500,000 characters at most). Known limit: on a hostile page under that size the read can take four to five seconds.

**F15e — Soporte: replies and «Mis reportes»**
- `supabase/migrations/20261118105000_feedback_replies.sql`, `20261118106000_feedback_reporter_writes.sql`: a comment on a ticket is a reply (the reporter sees it) or an internal note (admins only; everything written before counts as internal); the reporter can no longer change their ticket's state, delete it, or write a line that looks like a system message by a direct request.
- An admin's ticket window chooses «Nota interna» or «Responder al usuario»; the reporter has the page «Mis reportes» (link «Ver mis reportes» in the report window) with each ticket's state and Soporte's replies. Held for the owner: how the reporter is told of a reply (the bell).

**F18 — Espacio Colaborativo: nothing typed or uploaded is lost or doubled**
- `20261118107000_meeting_finalized_stays_final.sql`: a finalised meeting stays final (its text can still be corrected); two people editing one meeting no longer overwrite each other silently; closing the form with unsaved text asks first; the background save stores the last character typed; «Solo los asistentes» is switched off in the finalise dialog with a sentence (nothing in the product marks who attended).
- The feed and the documents: an upload that fails says so, leaves nothing half-saved, and a retry never doubles it; a stored file is never reused for another document; several documents show each file's own result.
- `20261118108000_thread_counters.sql`: conversations show their real counts and move to the top when anyone writes (counters kept by the database, rows locked `FOR NO KEY UPDATE`); a message that could not be sent stays in the box; a failed attachment is named and the message still sent.

**F20 — Licitaciones: the documents say what is true**
- `20261119100000_licitacion_fecha_evaluacion.sql`: the evaluation date the commission types is stored and printed in the Acta.
- The Carta de adjudicación and the Acta write amounts in the tender's currency («$35.000.000», «UF 1.200,50»), dated with the day in Chile; the bases write the duration once and are refused for a programme without evaluation criteria; never two winners after concurrent saves; the award is confirmed for the provider on the screen; a Carta made for an earlier winner or amount stops counting.
- Once the evaluation has begun the providers and their proposals are fixed; an awarded tender's amounts cannot be edited nor the tender deleted; a closed tender's documents cannot be deleted; the screens no longer offer what the server refuses; «Descargar Todo» keeps two files of the same name.
- The contract of a tender no longer asks for notary data, shows the saved contract, and a second save opens the existing one; in the proposal generator an uploaded file never replaces another, a blank «Precio fijo» is refused, each version has «Retirar enlace».

## Database

Five migrations, add-only: `20261118105000`, `20261118106000`, `20261118107000`, `20261118108000`, `20261119100000`. None holds a function that deletes rows (`.pm-publish/solo-preflight.json`: no checks, no declarations). None names a store, a storage rule, a trigger or a function of Supabase's side (the publisher's own reading of the five files gives empty lists). Every rule survives a dump and rebuild (1,078 rules, 0 different).

## Proof

On `57868f47f` (the 80 commits on today's main): database tests 109 files / 10,634; rebuild check 0 different; CI's browser tests 348 of 348, run alone, no second tries; type check; lint; unit suite 757 files, 21,359 tests. Each phase was read by a second model until it had nothing left, tested blind with real requests by a third (F18 30 of 30 scenarios, F20 25 of 25, with races), and used by sight in a browser. The only commit after that tip is this request, the state block and the declaration file.

## What a reviewer should look at first

1. `20261118106000_feedback_reporter_writes.sql`: what a reporter can still write on their own ticket and comments.
2. `20261118107000_meeting_finalized_stays_final.sql`: can a finalised meeting leave that state by any path.
3. `20261118108000_thread_counters.sql`: the lock order and that a refused insert changes no counter.
4. The Carta's pointer on a tender: one guarded update (the data and the emptied pointer together).
5. The award: the winner flags are normalised at confirmation.

## Decided for the owner, to overrule

A finalised meeting stays final; a message whose attachment fails is still sent; replies written before this release stay internal; an admin can no longer delete an awarded or closed tender; «Solo los asistentes» is switched off until the owner says what it means.

## Known and left for later

- Feed images and message attachments sit in stores that are public by address (older; a phase of its own, the owner's word).
- Licitaciones: who signs the Carta; how the platform knows a provider is the foundation; ties; old proposal links; a new tender still requires notary data; the holiday calendar keeps two moved holidays on fixed dates, so deadlines are not corrected from it.
- Same-second generation of two documents can answer 500 and leave a duplicate history line; a group assignment's discussion loses its text on a failed send; the autosave route discloses whether a meeting exists.
- Everything listed under "Known and left for later" in the earlier requests of 17 to 19 Nov.

No credentials, no personal data in tests (invented people only), no Production action by any agent.
