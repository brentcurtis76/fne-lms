# GENERA fixes, second release of 24 Nov: a contract keeps the text it was made with and new contracts print the corrected text, and the forms refuse the filler RUT 11.111.111-1

Branch: `fix/f22ae`. Base: `e1d9975cb` (main, 24 Nov 2026, pull request 211: the fixes' release of the Soporte bell and the older proposal links).
A straight line of commits on main, no merge commits: 13 commits of two builds of one phase (F22a, the contract's text: 6 commits; F22e, the filler RUT: 7 commits), and this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026 (three levels: exposed, dead ends in normal use, wrong money or data). F22 is Gestión's contracts phase of level 3; this release holds two of its builds, both with the owner's product answers:

- The contract's text (F22a, GES-3.5 and GES-3.7): "Old keep, new corrected" (20 Nov 2026): every existing contract keeps printing exactly today's text, new contracts print the corrected text, and an admin may move an unsigned contract to the corrected text; the duration rule and the ten wording slips (decisions 31 and 33); the header prints the representative's RUT as before (decision 32).
- The filler RUT (F22e): "Refuse the filler" (decision 35, 24 Nov 2026), with his three answers of the same day: an annex for a client that still holds the filler is refused too; other edits of such a client or contract are allowed while the RUT is left untouched; the tender form is left out of this change (decisions 37 to 39).

The rest of F22 (annulling instead of deleting, annexes in the cash flow, an annex's hours) is not in this release.

## What changes

**The text a contract prints (admins; the print page «PDF» and the form's «Vista previa / PDF»)**
- Every contract records which text it prints. Contracts that exist before this release print exactly what they printed before, word for word (pinned byte for byte by a test).
- New contracts print the corrected text: PRIMERO no longer describes the client's purpose («…, con personalidad jurídica y patrimonio propio, es una institución educacional.»); the escritura date prints as «dd-mm-aaaa»; the duration in DÉCIMO PRIMERO is counted up to the end day («10 meses» for 01-03-2027 to 31-12-2027, «9 meses y 1 día» for 15-03-2027 to 15-12-2027), the same in any time zone; ten wording slips are corrected.
- The print page's top bar (it does not print) says «Texto del contrato: versión actualizada» or «Texto del contrato: versión anterior». An older, unsigned programme contract also offers «Usar el texto actualizado», which asks first: «Este contrato pasará a imprimirse con el texto actualizado. No se puede volver al texto anterior.» A signed contract, an annex and a manual or imported contract are not offered the move, and the database refuses it for them.
- The form's preview prints the text the contract will print: the corrected one for a new contract, the older one while an older contract (or an older draft reused by its number) is edited.

**The filler RUT 11.111.111-1 (admins; the contract form, the annex form, Clientes and the school page's client editor)**
- The representative's RUT 11.111.111-1, in any spelling (11111111-1, 111111111, with spaces), is refused with «Ingresa el RUT real del representante legal; 11.111.111-1 no es válido.»: under the field in the contract form, as a message in Clientes and in the school page's client editor.
- A NEW client in the contract form needs a real, valid representative's RUT before the client step lets go on.
- An EXISTING client that still holds the filler cannot get a new contract or draft: «Este cliente aún no tiene el RUT de su representante legal. Complétalo en Clientes antes de crear el contrato.» The annex form refuses the same way at «Crear Anexo»: «… antes de crear el anexo.» Once the client has a real RUT, both go through. The stored value is read afresh before refusing; a failed read refuses too. An existing client whose stored representative's RUT is empty passes as before.
- Editing a client or a contract without touching a stored filler still saves; changing a real RUT to the filler is refused. Nothing in these forms writes the filler any more: the contract form no longer puts it in as a default, and the PDF import leaves the field empty when the PDF names no representative's RUT.
- One function decides every step and save of the contract form (`lib/contracts/rep-rut-decision.ts`, with a table test).
- The tender form (Licitaciones → nueva) is not changed.

## Database

One migration, add-only: `supabase/migrations/20261124130000_contrato_plantilla_version.sql` — one new column `public.contratos.plantilla_version` (added without a default, so every existing contract stays empty = the older text; the default 2 is set in a separate statement and applies to new rows only), one new function `public.guard_contrato_plantilla_version()` and one new trigger on `contratos` before insert or update. The guard gives every new contract 2; a signed-in person may change the mark only from empty to 2, on a contract that is not signed, not an annex, not manual and has a programme, never back (refused with 42501). No policy and no existing rule is touched. The filler refusal is in the forms only; it has no database part. No function of this release deletes rows, so `.pm-publish/solo-preflight.json` declares none (it is unchanged: no checks, no declarations). The publisher's own reading of the file: no static problem, and no store, storage rule, trigger or function of Supabase's side (empty lists). Every rule survives a dump and rebuild (1,080 rules, 0 different).

Recovery without a destructive statement: the guard can be replaced in place or its trigger disabled; an emptied mark makes a contract print the older text again.

## Proof

On `51ff2bec9`: database tests 113 files / 10,881 (the new file `154-contract-text-version.sql` among them); rebuild check 0 of 1,080 rules different; type check; lint; unit suite 805 files, 22,317 tests passed (1 file and 19 tests skipped); CI's browser tests 353 passed, none unsteady.

Each build was read by a second model until it had nothing left (F22a: two reads, one send-back; F22e: four reads, two send-backs and then one different approach, the single decision function, approved at the fourth read). Each build was tested blind by a third model: F22a through real requests and the print page (scenarios 1 to 5, 2a, 2b), no defect of the build; F22e through the screens (scenarios 40 to 47): 6 passed, 40 failed only in a missing sentence, 46 could not be tested (see "Known and left for later"). F22a's blind test said it read `PROJECT_STATE.md` at the start, so it was not fully blind (that file held no F22 block then).

## What a reviewer should look at first

1. The migration's guard: the insert always gives 2, whatever is sent; the update test for who may move which contract, and that the owner and server jobs (no signed-in user) are not checked on update.
2. `lib/contract-template.ts`: the older text is kept unchanged for contracts without a version (pinned byte for byte by `lib/__tests__/__fixtures__/contract-v1-golden-*.html`), and the corrected one (`plantilla_version` 2) differs only in the decided places; the duration count.
3. `pages/contract-print/[id].tsx` and the preview in `components/contracts/ContractForm.tsx`: each contract prints its own text; the move offer only for an unsigned programme contract.
4. `lib/contracts/rep-rut-decision.ts` and its callers in `ContractForm.tsx`: new client, existing client, edit, and a draft turned into a contract; the fresh read; what is written (never the filler, never an emptier value).
5. `utils/rutValidation.ts` (`isFillerRut`), `components/contracts/AnnexForm.tsx`, `pages/admin/clients.tsx`, `pages/admin/schools.tsx`, `components/contracts/ContractPDFImporter.tsx`.

## Known and left for later

- A draft made BEFORE this release for a client that held the filler keeps 11.111.111-1 in its own copy and prints it once it is turned into a contract, even after the client is given a real RUT (the copy is taken when the draft is made; found by the blind tester). Remedy: make the contract anew.
- A new client whose representative's RUT is left empty is refused («Siguiente» stays off, nothing is saved), but no sentence says why; only the field's star «RUT Representante *». Found by the blind tester and the browser pass; F22e had used its send-backs and its different approach.
- An existing client whose stored representative's RUT is EMPTY can still get a contract, as before; only the stored filler refuses (the decided rule).
- The PDF import could not be tested locally: it needs the Claude API key, which the local copy does not have («API de Claude no configurada»). A unit test covers that the imported representative's RUT arrives empty.
- Seen by the blind testers, not blocking: an admin who first un-marks a signed contract as signed can then move it to the new text in a second request (both in one request is refused); a contract without an end date prints «tendrá duración de duración a determinar» and «hasta el .», as the older text does; a contract that starts on a month's last day counts the short month's end as a whole month (31 Jan to 28 Feb prints «1 mes y 1 día»; decision 31's rule as written); a move sent together with a change to manual or annex is accepted, with no effect on what prints; an open draft saved after someone else changed the client's address writes the old address back (ordinary last-writer-wins, older than this work; the RUT is protected); editing a non-draft contract for a filler client writes the whole client row without a fresh read (the decided edit rule).
- Seen in the browser, not blocking: the annex form refuses a filler client only at «Crear Anexo», after its four steps; Clientes shows the filler refusal as a message, not under the field; just after a contract is saved, the contract form's list of existing clients misses the new client until the page is reloaded.
- Everything listed under "Known and left for later" in the earlier requests of 17 to 24 Nov.

No credentials, no personal data in tests (invented people only; the only RUT 11.111.111-1 is the filler itself), no Production action by any agent.

## Used by sight

By testers who had not seen the builds, in a real browser on invented local data.
- F22a (scenarios 30 to 32, 3 of 3): an older unsigned contract's print page says «Texto del contrato: versión anterior» with «Usar el texto actualizado»; «Cancelar» changes nothing; «Confirmar» turns it to «Texto del contrato: versión actualizada» with the new PRIMERO and the new duration, also after a reload. A signed older contract shows «versión anterior» and no offer; a new contract shows «versión actualizada» and no offer. The preview shows the new text for a new contract and the older text while an older contract is edited. No errors in the browser's console in normal use.
- F22e (scenarios 40 to 47, in two sittings; the first stopped on the client page's own yes/no question, which the tester's tool could not answer): 41 the filler in all its spellings refused under the field, a real RUT saves the contract; 42 the filler client refused with the sentence, and goes through after the client is fixed in Clientes; 43 the annex refused at «Crear Anexo» and created after the fix; 44 Clientes refuses a new client with the filler and a real RUT changed to the filler, saves an address-only edit of the filler client and saves its real RUT; 45 an older filler contract's end date saved; 47 a contract and an annex for a real-RUT client as before. 40: refused without a sentence (above). 46 and the tender part of 47 could not be done in the browser (the blind tester passed the tender part).
