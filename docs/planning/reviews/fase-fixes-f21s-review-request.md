# GENERA fixes, release of 20 Nov: Gestión's money screens, first wave — the invoice decides what is paid, amounts are read the Chilean way, expense reports and hour moves are saved in one step

Branch: `fix/f21s`. Base: `00780a641` (main, 19 Nov 2026, pull request 207: the redesign's create-session form; the fixes' seventh release is pull request 205).
A straight line of commits on main, no merge commits: 25 commits of one phase (F21: four builds, one test-only commit and two commits after the browser pass), and this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026 (three levels: exposed, dead ends in normal use, wrong money or data) and answered the product questions on 17 Nov; each answer is quoted in the phase's brief. F21 is the third phase of level 3 (wrong money or data) and holds only what needs no further decision: "the invoice decides" is the owner's answer of 17 Nov. Everything that would change stored money or the text of signed contracts is held for the owner and is NOT in this release (below, "Known and left for later").

## What changes

**The cash flow («Flujo de Caja») and a contract's details window**
- A cuota counts as paid only when it has an invoice and that invoice is marked paid; a cuota marked paid the old way, without an invoice, reads as unpaid. Without an invoice the paid control is off and says «Suba la factura primero».
- «Vencida» and the titles of the months follow the day in Chile (a cuota due today is not overdue at 22:00; a cuota due on the 15th of next month is under next month's name). Drafts and contracts out of the cash flow are not in the overdue list.
- An uploaded invoice or a paid mark shows at once, without a reload, in both screens; a replaced invoice can be marked paid in the same window; a deleted invoice stays hidden until a different one is really stored.
- A signed document uploaded to a draft no longer activates it; the window says «Documento firmado guardado. El contrato sigue en borrador hasta que se active.» and offers «Ver documento firmado».
- The cuotas are listed by number in the details window («Cronograma de Pagos») and in «Editar» step 3 («Plan de Pagos»); they were in the order of their last change.

**The contract form**
- Amounts typed the Chilean way are read by one helper: «100.01» is 100,01 (it became 1), «1.200,50» is 1200,5, «15.990» pesos is 15990. An amount that can be read two ways in UF («1.200», «49.995») is refused with a sentence that says how to write it; pesos take no decimals, UF at most two.
- «Guardar Borrador» is offered only for a new contract or a draft.
- An existing client's data is read-only in the form («Para corregir los datos del cliente, use Clientes»); a required field that the client's record lacks can be filled there, and is stored on the client before the contract is saved, so the contract prints with it.
- A client's RUT is formatted and its check digit verified; a client is found by RUT however the stored value is written (no second client for a bare RUT); the importer invents no escritura date.

**Hours of a contract**
- `supabase/migrations/20261119103000_reallocate_hours_atomic.sql`: moving hours between two categories is one database function — both rows and the history line together, the rows locked. Two moves at the same moment out of the same category: one succeeds, the other is refused; hours never go below zero and none appear from nothing.

**Expense reports («Rendición de Gastos»)**
- `supabase/migrations/20261119107000_expense_report_save.sql`: a saved edit is one database function, `public.save_expense_report(uuid, jsonb, jsonb, uuid[])` — only what the form changed, all or nothing. An expense added meanwhile from elsewhere (Telegram) is no longer deleted; an expense that cannot be stored leaves the report exactly as it was.
- An incomplete row stops the save and is named («El gasto 1 no tiene categoría. El gasto 2 no tiene monto.»); pesos are read the Chilean way; an expense's date is shown as typed (the 1st, not the day before) in the list, the details, the PDF and the Excel.
- A receipt goes to the row it was uploaded for, also when rows are removed or typed in meanwhile; two uploads at once both stay; deleting a receipt keeps what was typed meanwhile.

**One test-only commit**: a meetings unit test waited on a mock call and then read the screen too early; it now waits for the screen.

## Database

Two migrations, add-only: `20261119103000`, `20261119107000`. The second holds one function that deletes rows by design, DECLARED in `.pm-publish/solo-preflight.json`: `public.save_expense_report(uuid, jsonb, jsonb, uuid[])` removes from a report the expenses the person took out of the form, and only those (its own report's items; a foreign item named for removal is ignored). The publisher's own reading of the two files: no other problem, and no store, storage rule, trigger or function of Supabase's side (empty lists). Every rule survives a dump and rebuild (1,078 rules, 0 different).

## Proof

On `773f5adce` (the 23 commits replayed on today's main, every one identical by range-diff, plus the two commits after the browser pass): database tests 111 files / 10,737; rebuild check 0 different; type check; lint; unit suite 780 files, 21,820 tests; CI's browser tests 348 of 348 on the first run, no second tries. Each of the four builds was read by a second model until it had nothing left (`SOL` reports: cash flow 3 reads, contract form 4, hours 1, expense reports 2, the two commits after the browser pass 1). A third model tested blind with real requests: 20 of 20 scenarios, with races (twenty rounds of two simultaneous hour moves: always one success and one refusal). Used by sight in a browser by a fourth tester, twice (below).

## What a reviewer should look at first

1. `20261119107000_expense_report_save.sql`: who may save which report in which state, that an item of another report can be neither changed nor removed, and that the total is the sum of the stored items.
2. `20261119103000_reallocate_hours_atomic.sql`: the lock order of the two rows and the refusals (more than available, same category, zero).
3. The one helper that reads typed amounts (`lib/money/`): what it refuses rather than guesses.
4. The rule "paid" (`lib/contracts/`): one definition used by the cash flow and by the details window.
5. The contract form: fills of a client's missing fields come before the contract's insert (a trigger copies the representative at insertion).

## Decided for the owner, to overrule

A cuota marked paid without an invoice reads as unpaid ("the invoice decides", his answer of 17 Nov; their count in Production is on the count sheet he has not pasted yet, and an admin cures each by uploading its invoice). An amount that can be read two ways is refused, never guessed. An existing client is corrected under «Clientes», not from a contract.

## Known and left for later

- Held for the owner, each with a recommendation in the note he reads: the contract's text is written anew from the template at every print; the database still requires a client's representative RUT, escritura date and notary; quote totals leave out flights and count viáticos for one day; «Anular contrato» instead of deleting; the exchange rate of a foreign expense and the headline of «Exportar todos».
- Two simultaneous saves of the same expense report, each changing a different existing item: the later list wins (the total stays right). Hours typed with a third decimal are rounded to hundredths.
- Signed contracts are stored as public addresses of the public `contracts` store, and «Ver documento firmado» opens the same address as the older «PDF» button (known since 16 Nov; not reachable in Production today, where uploads to that store fail). It is built with the contract half of the private invoices work, not here.
- UF cuotas show their pesos at today's UF projected to their due date, CLP cuotas at today's UF, and the screen does not say which: display only, nothing stored differs.
- A draft whose typed new client has a RUT that exists is attached to that client without a word (the full save asks first); a peso total with decimals lets «Siguiente» through while its error shows (the final save stays disabled).
- A session's reservation of hours can still race with a move (the reservation does not take the allocation's lock).
- Everything listed under "Known and left for later" in the earlier requests of 17 to 19 Nov.

No credentials, no personal data in tests (invented people only), no Production action by any agent.

## Used by sight

Twice, by a tester who had not seen the build, in a real browser on invented local data. First pass: 9 of 13 passed. It found three points: a signed document uploaded to a draft gave no word; cuotas were listed in the order of their last change; and a client's missing billing e-mail could not be typed. The tester was on a programme contract there, where that e-mail is not asked for. The re-look on the final tip passed all three:
- in a manual contract the empty «Email de Facturación» can be typed, and it is stored on the client; in a programme contract it stays read-only and the form goes on;
- on a draft the window says «Documento firmado guardado. El contrato sigue en borrador hasta que se active.»; the contract stays «Borrador» and out of the cash flow;
- the cuotas read 1 to 6 in both screens, and after a date change too.

The signed document itself could not be opened locally: «Ver documento firmado» opens the store's public address, like the older «PDF» button, and the local store is private. In Production that store is public, which is the known item in "Known and left for later".

